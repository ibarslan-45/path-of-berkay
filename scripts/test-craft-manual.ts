/**
 * test-craft-manual.ts — ELLE gerçek sonuç girişi + koç devamı (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-craft-manual.ts
 */
import {
  SIM_BASES,
  CraftSession,
  manualModForValue,
  adviseStep,
  evaluateTarget,
  type SimBase,
  type TargetEntry
} from '../src/renderer/src/lib/craft-sim'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

const ring = SIM_BASES.find((b) => b.en === 'Sapphire Ring') as SimBase
check('Sapphire Ring tabanı var', !!ring)

console.log('\nmanualModForValue (gruptan + girilen değer):')
const life = manualModForValue(ring, 'IncreasedLife', 'prefix', '120')
check('Life mod üretildi', !!life, life?.en)
check('mod EN değer içerir (120)', !!life && /120/.test(life.en), life?.en)
check('grup IncreasedLife', life?.mod.group === 'IncreasedLife', life?.mod.group)
const lowLife = manualModForValue(ring, 'IncreasedLife', 'prefix', '20')
check('düşük değer → daha düşük tier (T sayısı büyür)', !!lowLife && !!life && (lowLife.mod.ilvl <= life.mod.ilvl), { lo: lowLife?.mod.ilvl, hi: life?.mod.ilvl })
check('uygun olmayan grup → null', manualModForValue(ring, 'NoSuchGroup', 'prefix', '1') === null)

console.log('\nCraftSession.addManualMod — yer yoksa rarity yükselir:')
const s = new CraftSession(ring, 82)
check('başta Normal', s.item.rarity === 'normal')
const r1 = s.addManualMod('IncreasedLife', 'prefix', '120')
check('1. mod eklendi (ok)', r1.ok, r1)
check('rarity → magic (yer açıldı)', s.item.rarity === 'magic', s.item.rarity)
check('1 prefix', s.item.prefixes.length === 1)
const r2 = s.addManualMod('ColdResistance', 'suffix', '40')
check('2. mod eklendi (ok)', r2.ok, r2)
check('rarity hâlâ magic (1P/1S sığar)', s.item.rarity === 'magic', s.item.rarity)
const r3 = s.addManualMod('Intelligence', 'suffix', '25')
check('3. mod (2. suffix) → rare’e yükseldi', r3.ok && s.item.rarity === 'rare', { ok: r3.ok, rar: s.item.rarity })
check('aynı grup tekrar reddedilir', s.addManualMod('IncreasedLife', 'prefix', '90').ok === false)

console.log('\nundo + kaldır:')
const before = s.item.suffixes.length
s.removeManualMod('suffix', 0)
check('bir suffix kaldırıldı', s.item.suffixes.length === before - 1, s.item.suffixes.length)
check('undo çalışır (manual da yığında)', s.canUndo)
s.undo()
check('undo geri getirdi', s.item.suffixes.length === before, s.item.suffixes.length)

console.log('\nkoç (adviseStep) elle güncellenen gerçek duruma göre öneri verir:')
const targets: TargetEntry[] = [
  { group: 'IncreasedLife', minTier: 5 },
  { group: 'ColdResistance', minTier: 5 },
  { group: 'Intelligence', minTier: 5 }
]
const st = evaluateTarget(s.item, targets)
check('hedef değerlendirmesi gerçek modları görür', st.rows.length === 3, st.rows.length)
const adv = adviseStep(s.item, targets)
check('koç bir sonraki adım/durum döndürür', !!adv.kind, adv.kind)

console.log(`\n${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
