/**
 * test-build-compare.ts — build-compare.ts birim testi (saf, ağsız).
 * trade_stats BOŞ iken kalıp-eşleşmesiyle çalışır. Çalıştırma: npx tsx scripts/test-build-compare.ts
 */
import { compareMods, buildItemTradeQuery } from '../src/renderer/src/lib/build-compare'
import { buildTradeQuery, setRuntimeStats } from '../src/renderer/src/lib/trade-query'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

const target = ['+120 to maximum Life', '+40% to Fire Resistance', '+30% to Cold Resistance']
const cand = ['+95 to maximum Life', '+40% to Fire Resistance', '+12 to Strength']
const r = compareMods(target, cand)

console.log('Karşılaştırma (hedef 3 mod, aday 3 mod):')
check('targetCount = 3', r.targetCount === 3, r.targetCount)
check('matchedCount = 2', r.matchedCount === 2, r.matchedCount)
check('missingCount = 1', r.missingCount === 1, r.missingCount)
check('extraCount = 1', r.extraCount === 1, r.extraCount)

const life = r.rows.find((x) => /maximum Life/.test(x.en))!
check('Life eşleşti', life.kind === 'match')
check('Life yaklaşma %79', life.approachPct === 79, life.approachPct)
check('Life status close', life.status === 'close', life.status)

const fire = r.rows.find((x) => /Fire Resistance/.test(x.en))!
check('Fire %100 ok', fire.approachPct === 100 && fire.status === 'ok', fire)

const cold = r.rows.find((x) => /Cold Resistance/.test(x.en))!
check('Cold EKSİK', cold.kind === 'missing' && cold.status === 'low', cold.kind)

const str = r.rows.find((x) => /Strength/.test(x.en))!
check('Strength FAZLA', str.kind === 'extra', str.kind)

// skor = (0.79 + 1.0 + 0) / 3 = %60
check('skor = 60', r.score === 60, r.score)

console.log('\nİkili (sayısal olmayan) stat:')
const r2 = compareMods(['Cannot be Frozen'], ['Cannot be Frozen'])
check('ikili eşleşme %100/na', r2.rows[0].kind === 'match' && r2.rows[0].approachPct === 100, r2.rows[0])
check('ikili skor 100', r2.score === 100, r2.score)

console.log('\nBoş aday (hepsi eksik):')
const r3 = compareMods(['+100 to maximum Life'], [])
check('1 eksik, skor 0', r3.missingCount === 1 && r3.score === 0, r3)

console.log('\nDeğer hedefi aşan (over):')
const r4 = compareMods(['+100 to maximum Life'], ['+130 to maximum Life'])
check('approach 130, status ok, skor 100 (clamp)', r4.rows[0].approachPct === 130 && r4.score === 100, r4.rows[0].approachPct + '/' + r4.score)

// 0.18.2: buildItemTradeQuery — KATEGORİ/TYPE (KÖK NEDEN: Mobalytics base'i "Bow"=kategori → 400).
console.log('\n0.18.2 — build eşyası trade sorgusu (geçersiz base → kategori):')
setRuntimeStats([
  { id: 'explicit.stat_phys', text: '#% increased Physical Damage', tr: '', type: 'explicit' },
  { id: 'explicit.stat_life', text: '+# to maximum Life', tr: '', type: 'explicit' }
])
function bodyOf(qi: ReturnType<typeof buildItemTradeQuery>): { type?: unknown; filters?: { type_filters?: { filters: { category?: { option: string } } } } } {
  return (buildTradeQuery(qi, { valueBand: 1 }).body as { query: { type?: unknown; filters?: { type_filters?: { filters: { category?: { option: string } } } } } }).query
}
// (a) Mobalytics bow: base "Bow" (kategori, items.json'da tam base değil) → type DÜŞER, category weapon.bow
const bowQi = buildItemTradeQuery({ id: 'b', rarity: 'RARE', name: 'Warden Bow', base: 'Bow', itemLevel: 45, levelReq: 0, mods: ['49% increased Physical Damage'] } as never)
const bowBody = bodyOf(bowQi)
check('bow: type DÜŞTÜ (geçersiz base)', bowBody.type === undefined, bowBody.type)
check('bow: kategori weapon.bow', bowBody.filters?.type_filters?.filters?.category?.option === 'weapon.bow', bowBody.filters)
// (b) geçerli tam base "Recurve Bow" → type KORUNUR, kategori YOK
const recQi = buildItemTradeQuery({ id: 'r', rarity: 'RARE', name: 'X', base: 'Recurve Bow', itemLevel: 45, levelReq: 0, mods: ['49% increased Physical Damage'] } as never)
const recBody = bodyOf(recQi)
check('Recurve Bow: type KORUNDU', recBody.type === 'Recurve Bow', recBody.type)
check('Recurve Bow: kategori YOK', !recBody.filters?.type_filters, recBody.filters)
// (c) bilinmeyen sınıf → type düşer, kategori de yok (yalnız stat — yine geçerli)
const unkQi = buildItemTradeQuery({ id: 'u', rarity: 'RARE', name: 'X', base: 'Mystery Thing', itemLevel: 1, levelReq: 0, mods: ['+50 to maximum Life'] } as never)
const unkBody = bodyOf(unkQi)
check('bilinmeyen: type yok + kategori yok (stat-only geçerli)', unkBody.type === undefined && !unkBody.filters?.type_filters, unkBody)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
