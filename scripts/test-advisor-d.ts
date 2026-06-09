// Faz D doğrulama: alternatifler + risk notları + çıkmaz/reset (gerçek değerler).
// Çalıştır: npx tsx scripts/test-advisor-d.ts
import {
  makeItem, findBase, SIM_MODS, rollMod, targetableGroups, tierOf, weightForBase,
  type ItemState, type SimBase, type SimMod, type TargetEntry
} from '../src/renderer/src/lib/craft-sim'
import { planCraft } from '../src/renderer/src/lib/craft-advisor'

function elig(base: SimBase, ilvl: number, affix: 'prefix' | 'suffix'): SimMod[] {
  return SIM_MODS.filter((m) => m.affix === affix && m.domain === base.domain && weightForBase(m, base) > 0 && m.ilvl <= ilvl)
}
function bestPerGroup(mods: SimMod[]): SimMod[] {
  const map = new Map<string, SimMod>()
  for (const m of mods) {
    const cur = map.get(m.group)
    if (!cur || tierOf(m) < tierOf(cur)) map.set(m.group, m)
  }
  return [...map.values()]
}
function push(it: ItemState, m: SimMod): void {
  ;(m.affix === 'prefix' ? it.prefixes : it.suffixes).push({ mod: m, ...rollMod(m) })
}
const COST = (n: number): string => '£'.repeat(n)
const RISKTXT: Record<string, string> = {
  annul_danger: 'Annul rastgele kaldırır — istenen modu kaybetme',
  chaos_remove: 'Chaos rastgele 1 mod siler — keeper riski',
  vaal_irreversible: 'Vaal GERİ ALINAMAZ — item kilitlenir',
  corruption_locked: 'Item corrupted — artık değiştirilemez',
  fracture_random: 'Fracture rastgele kilitler'
}
const CMP: Record<string, string> = {
  guaranteed_pricier: 'garantili ama daha pahalı',
  guaranteed_same: 'garantili',
  omen_higher: 'omen ile daha yüksek şans (biraz pahalı)',
  cheaper_lower: 'daha ucuz ama düşük şans',
  risky_faster: 'daha hızlı ama riskli',
  alternative: 'alternatif'
}

function printPlan(label: string, item: ItemState, targets: TargetEntry[]): void {
  console.log('\n' + '═'.repeat(84))
  console.log(label + '  —  ' + item.base.en + ' (ilvl ' + item.ilvl + '), ' + item.rarity)
  console.log('─'.repeat(84))
  console.log('MEVCUT: ' + ([...item.prefixes, ...item.suffixes].map((m) => '[' + (m.mod.affix === 'prefix' ? 'P' : 'S') + ' T' + tierOf(m.mod) + '] ' + m.en.replace(/\n/g, ' ')).join('  ·  ') || '(yok)'))
  console.log('HEDEF : ' + targets.map((t) => { const a = SIM_MODS.find((m) => m.group === t.group); return (a?.text_en ?? t.group).replace(/\n/g, ' ') + ' T' + t.minTier + '+' }).join('  ·  '))
  const plan = planCraft(item, targets)
  console.log('─'.repeat(84))
  console.log('▶ STRATEJİ: ' + plan.strategy.toUpperCase() + '  [' + plan.kind + ']')
  if (plan.kind === 'plan') {
    console.log('  BİRİNCİL YOL (' + plan.steps.length + ' adım):')
    plan.steps.forEach((s, i) => {
      const sc = s.deterministic ? 'kesin' : (s.chance * 100).toFixed(1) + '%'
      console.log('   ' + (i + 1) + '. ' + s.action.labelEn + '  şans=' + sc + (s.targetEn ? '  → ' + s.targetEn.replace(/\n/g, ' ') : ''))
    })
    console.log('   ≈ TOPLAM: ' + (plan.cumulative * 100).toFixed(1) + '%' + (plan.cumulativeApprox ? ' (yaklaşık)' : ''))
    const p0 = plan.steps[0]
    console.log('  ALTERNATİFLER (' + plan.alternatives.length + '):')
    if (!plan.alternatives.length) console.log('   (yok)')
    for (const a of plan.alternatives) {
      const sc = a.guaranteed ? '%100 garanti' : (a.chance * 100).toFixed(1) + '%'
      const dc = a.costDelta > 0 ? '+' + a.costDelta : String(a.costDelta)
      console.log('   • ' + a.action.labelEn + '  şans=' + sc + '  maliyet=' + COST(a.action.costRank) + ' (Δ' + dc + ')  risk=' + (a.action.risk.level === 'none' ? '—' : a.action.risk.level) + '  → ' + (CMP[a.rationaleCode] ?? a.rationaleCode))
    }
    console.log('   ("' + p0.action.labelEn + '" öneriyorum çünkü en dengeli; yukarıdakiler alternatif.)')
  } else {
    console.log('  ⚠ ÇIKMAZ: kod=' + (plan.deadend?.code ?? plan.deadendCode) + '  →  ' +
      (plan.deadend?.scope === 'new-base' ? 'YENİ TABAN/İLVL DENE (bu tabanda imkânsız)' : 'AYNI TABANI SIFIRLA & yeniden dene'))
  }
  if (plan.risks.length) {
    console.log('  RİSK NOTLARI:')
    for (const r of plan.risks) console.log('   ⚠ ' + (RISKTXT[r.code] ?? r.code) + (r.lossChance > 0 ? ' (kayıp ~%' + (r.lossChance * 100).toFixed(0) + ')' : ''))
  }
}

const ring = findBase('Gold Ring')!
const IL = 80

// ───── SENARYO 1: alternatif karşılaştırması (rare, 1 mod, Life hedefi) ─────
;(() => {
  const it = makeItem(ring, IL)
  it.rarity = 'rare'
  const sufFiller = bestPerGroup(elig(ring, IL, 'suffix'))[0]
  push(it, sufFiller)
  const lifeMod = SIM_MODS.find((m) => m.affix === 'prefix' && m.domain === ring.domain && weightForBase(m, ring) > 0 && m.ilvl <= IL && m.text_en.includes('maximum Life'))!
  const tg = targetableGroups(ring, IL).find((g) => g.group === lifeMod.group)!
  printPlan('SENARYO 1: Birincil + ALTERNATİF karşılaştırması', it, [{ group: lifeMod.group, minTier: tg.bestTier }])
})()

// ───── SENARYO 2: çıkmaz — hedef bu tabanda yok (silah-yerel phys, yüzüğe) → YENİ TABAN ─────
;(() => {
  const it = makeItem(ring, IL)
  it.rarity = 'rare'
  // silaha-özel yerel "#% increased Physical Damage" (LocalPhysicalDamagePercent) — yüzükte yok, essence map'lemez
  printPlan('SENARYO 2: ÇIKMAZ (hedef bu tabanda yok)', it, [{ group: 'LocalPhysicalDamagePercent', minTier: 1 }])
})()

// ───── SENARYO 3: çıkmaz — slotlar dolu, hedef gelmedi, keeper'lar korunuyor → RESET ─────
;(() => {
  const it = makeItem(ring, IL)
  it.rarity = 'rare'
  const preB = bestPerGroup(elig(ring, IL, 'prefix'))
  const sufB = bestPerGroup(elig(ring, IL, 'suffix'))
  const P = preB.slice(0, 3) // 3 önek keeper
  const S1 = sufB[0], S2 = sufB[1], SJ = sufB[2] // 2 sonek keeper + 1 sonek "junk"
  const S3 = sufB[3] // hedef sonek (eksik) — sonek tarafı dolu
  for (const m of P) push(it, m)
  push(it, S1); push(it, S2); push(it, SJ)
  const tgt = (m: SimMod): TargetEntry => ({ group: m.group, minTier: tierOf(m) })
  const targets: TargetEntry[] = [tgt(P[0]), tgt(P[1]), tgt(P[2]), tgt(S1), tgt(S2), { group: S3.group, minTier: targetableGroups(ring, IL).find((g) => g.group === S3.group)!.bestTier }]
  printPlan('SENARYO 3: ÇIKMAZ (slot dolu + keeper korunuyor)', it, targets)
})()
