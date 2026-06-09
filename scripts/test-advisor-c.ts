// Faz C doğrulama: çok-adımlı plan — tam yol + adım şansları + kümülatif (gerçek).
// Çalıştır: npx tsx scripts/test-advisor-c.ts
import {
  makeItem, findBase, SIM_MODS, rollMod, targetableGroups, tierOf, tierCount, weightForBase,
  type ItemState, type SimBase, type TargetEntry
} from '../src/renderer/src/lib/craft-sim'
import { planCraft } from '../src/renderer/src/lib/craft-advisor'

function grp(base: SimBase, ilvl: number, affix: 'prefix' | 'suffix', needle: string): { group: string; minTier: number } {
  const m = SIM_MODS.find(
    (x) => x.affix === affix && x.domain === base.domain && weightForBase(x, base) > 0 && x.ilvl <= ilvl && x.text_en.toLowerCase().includes(needle.toLowerCase())
  )
  if (!m) throw new Error('grup yok: ' + needle)
  const tg = targetableGroups(base, ilvl).find((g) => g.group === m.group)!
  return { group: m.group, minTier: tg.bestTier }
}
function pushBest(it: ItemState, group: string): void {
  const ms = SIM_MODS.filter((m) => m.group === group && m.domain === it.base.domain && weightForBase(m, it.base) > 0 && m.ilvl <= it.ilvl)
  const m = ms.reduce((a, b) => (tierOf(b) < tierOf(a) ? b : a))
  ;(m.affix === 'prefix' ? it.prefixes : it.suffixes).push({ mod: m, ...rollMod(m) })
}

function printPlan(label: string, item: ItemState, targets: TargetEntry[]): void {
  console.log('\n' + '═'.repeat(82))
  console.log(label + '  —  ' + item.base.en + ' (ilvl ' + item.ilvl + '), ' + item.rarity)
  console.log('─'.repeat(82))
  console.log('MEVCUT MODLAR:')
  for (const m of [...item.prefixes, ...item.suffixes])
    console.log('  [' + (m.mod.affix === 'prefix' ? 'Önek' : 'Sonek') + '] T' + tierOf(m.mod) + '/' + tierCount(m.mod) + '  ' + m.en.replace(/\n/g, ' '))
  if (!item.prefixes.length && !item.suffixes.length) console.log('  (yok)')
  console.log('HEDEFLER:')
  for (const t of targets) {
    const any = SIM_MODS.find((m) => m.group === t.group)
    console.log('  ' + (any?.affix === 'prefix' ? '[Önek]' : '[Sonek]') + ' ' + (any?.text_en ?? t.group).replace(/\n/g, ' ') + '  T' + t.minTier + '+')
  }
  const plan = planCraft(item, targets)
  console.log('─'.repeat(82))
  console.log('▶ STRATEJİ: ' + plan.strategy.toUpperCase() + (plan.kind !== 'plan' ? '  (' + plan.kind + ')' : ''))
  console.log('  YOL (' + plan.steps.length + ' adım):')
  plan.steps.forEach((s, i) => {
    const sc = s.deterministic ? 'kesin (setup)' : (s.chance * 100).toFixed(1) + '%'
    const tg = s.targetEn ? '  → ' + s.targetEn.replace(/\n/g, ' ') : ''
    const gt = s.action.guaranteedTier != null ? ' (garanti T' + s.action.guaranteedTier + ')' : ''
    console.log('   ' + (i + 1) + '. ' + s.action.labelEn + gt + '  [' + s.rationaleCode + ']  şans=' + sc + tg)
  })
  const cum = (plan.cumulative * 100).toFixed(1)
  console.log('  ≈ TOPLAM BAŞARI: ' + cum + '%' + (plan.cumulativeApprox ? '  (yaklaşık, bağımsız adım varsayımı)' : '  (kesin)'))
}

const ring = findBase('Gold Ring')!
const IL = 80
const life = grp(ring, IL, 'prefix', 'maximum Life')
const cold = grp(ring, IL, 'suffix', 'Cold Resistance')
const light = grp(ring, IL, 'suffix', 'Lightning Resistance')
const phys = grp(ring, IL, 'prefix', 'Physical Damage')

// SENARYO 1a: boş Normal ring, hedef Life + ColdRes (1 önek + 1 sonek → Magic yeter)
printPlan('SENARYO 1a: Boş Normal, Life + ColdRes (2 mod)', (() => {
  return makeItem(ring, IL)
})(), [life, cold])

// SENARYO 1b: boş Normal ring, Life + ColdRes + LightRes (3 mod → Rare gerekir: transmute→regal→exalt)
printPlan('SENARYO 1b: Boş Normal, Life + ColdRes + LightRes (3 mod)', makeItem(ring, IL), [life, cold, light])

// SENARYO 2: Magic, doğru mod (Life öneki) mevcut → alt→regal→exalt
//   hedef: Life(met) + Phys(önek, eksik) + ColdRes(sonek, eksik) → ikinci önek Magic'e sığmaz → Regal
printPlan('SENARYO 2: Magic doğru mod (Life) + Phys + ColdRes', (() => {
  const it = makeItem(ring, IL)
  it.rarity = 'magic'
  pushBest(it, life.group)
  return it
})(), [life, phys, cold])
