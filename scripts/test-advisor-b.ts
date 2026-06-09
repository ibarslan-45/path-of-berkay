// Faz B doğrulama: strateji tanıma — 4 senaryo, gerçek değerler.
// Çalıştır: npx tsx scripts/test-advisor-b.ts
import {
  makeItem, findBase, SIM_MODS, SIM_BASES, rollMod,
  targetableGroups, tierOf, tierCount, weightForBase,
  type ItemState, type SimMod, type SimBase, type TargetEntry
} from '../src/renderer/src/lib/craft-sim'
import { recommendPrimary } from '../src/renderer/src/lib/craft-advisor'

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
function worstPerGroup(mods: SimMod[]): SimMod[] {
  const map = new Map<string, SimMod>()
  for (const m of mods) {
    const cur = map.get(m.group)
    if (!cur || tierOf(m) > tierOf(cur)) map.set(m.group, m)
  }
  return [...map.values()]
}
function push(it: ItemState, m: SimMod): void {
  ;(m.affix === 'prefix' ? it.prefixes : it.suffixes).push({ mod: m, ...rollMod(m) })
}
const COST = (n: number): string => '£'.repeat(n).padEnd(5)
const RISK = (r: { level: string; lossChance: number }): string =>
  r.level === 'none' ? '—' : r.level + ' ' + (r.lossChance * 100).toFixed(0) + '%'

function printReco(label: string, item: ItemState, targets: TargetEntry[]): void {
  console.log('\n' + '═'.repeat(80))
  console.log(label + '  —  ' + item.base.en + ' (ilvl ' + item.ilvl + '), ' + item.rarity)
  console.log('─'.repeat(80))
  console.log('MEVCUT MODLAR:')
  for (const m of [...item.prefixes, ...item.suffixes])
    console.log('  [' + (m.mod.affix === 'prefix' ? 'Önek' : 'Sonek') + '] T' + tierOf(m.mod) + '/' + tierCount(m.mod) + '  ' + m.en.replace(/\n/g, ' '))
  if (!item.prefixes.length && !item.suffixes.length) console.log('  (yok)')
  console.log('HEDEFLER:')
  for (const t of targets) {
    const any = SIM_MODS.find((m) => m.group === t.group)
    console.log('  ' + (any?.affix === 'prefix' ? '[Önek]' : '[Sonek]') + ' ' + (any?.text_en ?? t.group).replace(/\n/g, ' ') + '  T' + t.minTier + '+')
  }
  const rec = recommendPrimary(item, targets)
  console.log('─'.repeat(80))
  console.log('▶ TANINAN STRATEJİ : ' + rec.strategy.toUpperCase())
  console.log('  gerekçe kodu     : ' + (rec.rationaleCode || rec.deadendCode || '—'))
  if (rec.targetEn) console.log('  odak hedef       : ' + rec.targetEn.replace(/\n/g, ' '))
  if (rec.primary) {
    const p = rec.primary
    const extra = p.guaranteedTier != null ? '  (garanti T' + p.guaranteedTier + ')' : ''
    console.log('  BİRİNCİL ADIM    : ' + p.labelEn + extra)
    console.log('    ilerleme=' + (p.progressChance * 100).toFixed(1) + '%   maliyet=' + COST(p.costRank).trim() + '   risk=' + RISK(p.risk) + '   teknik=' + p.technique)
  } else {
    console.log('  BİRİNCİL ADIM    : (yok — ' + rec.kind + ')')
  }
}

// ───────────────────────────────────────────────────────────────────────────
// SENARYO 1: garantili mod gereken hedef → ESSENCE-SLAM seçilmeli
// (NORMAL havuzun ulaşamadığı bir tier'ı, essence force-add ile karşılayan hedef ara)
// ───────────────────────────────────────────────────────────────────────────
function scenario1(): void {
  const candidateBases = SIM_BASES.filter((b) => b.domain === 'item' && ['Ring', 'Amulet', 'Belt', 'Gloves', 'Boots', 'Helmet'].includes(b.item_class))
  for (const base of candidateBases) {
    const ilvl = 80
    for (const g of targetableGroups(base, ilvl)) {
      if (g.bestTier < 2 || g.bestTier > g.tierMax) continue
      const minTier = g.bestTier - 1 // NORMAL havuz bu tier'a ulaşamaz
      const item = makeItem(base, ilvl)
      item.rarity = 'magic' // essence (magic→rare) uygulanabilsin
      const targets: TargetEntry[] = [{ group: g.group, minTier }]
      const rec = recommendPrimary(item, targets)
      if (rec.strategy === 'essence-slam' && rec.primary?.kind === 'essence') {
        printReco('SENARYO 1: Garantili mod gerekli', item, targets)
        return
      }
    }
  }
  console.log('\nSENARYO 1: uygun essReq hedef bulunamadı (veri).')
}

// ───────────────────────────────────────────────────────────────────────────
// SENARYO 2: dolu Rare'de istenmeyen mod → ANNUL-ROOM (hazırlık) sonra exalt
// (önek tarafı 3 istenmeyen modla dolu; hedef = açık olmayan önek grubu)
// ───────────────────────────────────────────────────────────────────────────
function scenario2(): void {
  const base = findBase('Gold Ring')!
  const ilvl = 80
  const preGroups = bestPerGroup(elig(base, ilvl, 'prefix'))
  const fill = preGroups.slice(0, 3) // 3 istenmeyen önek
  const targetMod = preGroups[3] // 4. önek grubu = hedef (önek tarafı dolu olduğu için eklenemez)
  const item = makeItem(base, ilvl)
  item.rarity = 'rare'
  for (const m of fill) push(item, m)
  const g = targetableGroups(base, ilvl).find((x) => x.group === targetMod.group)!
  const targets: TargetEntry[] = [{ group: targetMod.group, minTier: g.bestTier }]
  printReco('SENARYO 2: Dolu Rare, istenmeyen mod', item, targets)
}

// ───────────────────────────────────────────────────────────────────────────
// SENARYO 3: Magic doğru mod → ALT→REGAL (boş slota augment, sonra Regal)
// ───────────────────────────────────────────────────────────────────────────
function scenario3(): void {
  const base = findBase('Gold Ring')!
  const ilvl = 80
  const sufFiller = bestPerGroup(elig(base, ilvl, 'suffix'))[0]
  const preTarget = bestPerGroup(elig(base, ilvl, 'prefix'))[0]
  const item = makeItem(base, ilvl)
  item.rarity = 'magic'
  push(item, sufFiller) // 1 sonek mevcut
  const g = targetableGroups(base, ilvl).find((x) => x.group === preTarget.group)!
  const targets: TargetEntry[] = [{ group: preTarget.group, minTier: g.bestTier }]
  printReco('SENARYO 3: Magic, doğru mod kurulumu', item, targets)
}

// ───────────────────────────────────────────────────────────────────────────
// SENARYO 4: yüksek-tier keeper + zayıf mod → FRACTURE→CHAOS
// (4 mod: 3 yüksek-tier keeper hedefi MET + 1 düşük-tier zayıf hedef)
// ───────────────────────────────────────────────────────────────────────────
function scenario4(): void {
  const base = findBase('Gold Ring')!
  const ilvl = 80
  const preBest = bestPerGroup(elig(base, ilvl, 'prefix'))
  const sufBest = bestPerGroup(elig(base, ilvl, 'suffix'))
  const sufWorst = worstPerGroup(elig(base, ilvl, 'suffix'))
  const item = makeItem(base, ilvl)
  item.rarity = 'rare'
  // 2 keeper önek (en iyi tier) + 1 keeper sonek (en iyi tier)
  const keepP = preBest.slice(0, 2)
  const keepS = sufBest.find((m) => !keepP.some((k) => k.group === m.group))!
  for (const m of keepP) push(item, m)
  push(item, keepS)
  // 1 zayıf sonek: farklı grup, EN DÜŞÜK tier (yüksek tierOf), ama daha iyi tier normalde erişilebilir
  const weakMod = sufWorst.find((m) => m.group !== keepS.group && tierCount(m) >= 3 && tierOf(m) >= 3)!
  push(item, weakMod)
  const targets: TargetEntry[] = [
    { group: keepP[0].group, minTier: tierOf(keepP[0]) }, // met
    { group: keepP[1].group, minTier: tierOf(keepP[1]) },
    { group: keepS.group, minTier: tierOf(keepS) },
    { group: weakMod.group, minTier: 2 } // zayıf: şu an T≥3, hedef T2+ → düzeltme gerek
  ]
  printReco('SENARYO 4: Yüksek-tier keeper + zayıf mod', item, targets)
}

scenario1()
scenario2()
scenario3()
scenario4()
