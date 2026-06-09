/**
 * test-trade-query.ts — trade-query.ts birim testi (saf, ağsız).
 * trade_stats.json BOŞ iskeletken zarif-düşüş + sorgu yapısını doğrular.
 * Çalıştırma: npx tsx scripts/test-trade-query.ts
 */
import {
  parsedToQueryItem,
  buildTradeQuery,
  valueFromLine,
  tradeSearchUrl,
  matchStat,
  setRuntimeStats,
  rematchQueryItem,
  describeMatch,
  statsAvailable,
  STATS_AVAILABLE
} from '../src/renderer/src/lib/trade-query'
import { parseClipboard } from '../src/renderer/src/lib/clipboard-parse'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

console.log('valueFromLine:')
check('+88 → 88', valueFromLine('+88 to maximum Life') === 88)
check('9% → 9', valueFromLine('9% increased Evasion Rating') === 9)
check('metin → null', valueFromLine('Cannot be Frozen') === null)

console.log('\ntradeSearchUrl:')
const url = tradeSearchUrl('Rise of the Abyssal', 'abc123')
check('poe2 yolu', url.includes('/trade2/search/poe2/'), url)
check('lig encode', url.includes('Rise%20of%20the%20Abyssal'), url)

console.log('\nparsedToQueryItem + buildTradeQuery (stat tablosu boş → zarif düşüş):')
const RARE = `Item Class: Body Armours
Rarity: Rare
Gloom Sanctuary
Cutthroat's Garb
--------
Item Level: 70
--------
+88 to maximum Life
+24% to Cold Resistance`
const qi = parsedToQueryItem(parseClipboard(RARE)!)
check('baseType taşındı', qi.baseType === "Cutthroat's Garb", qi.baseType)
check('2 mod', qi.mods.length === 2, qi.mods.length)
check('value çıkarıldı (88)', qi.mods[0].value === 88, qi.mods[0].value)

const q = buildTradeQuery(qi)
const body = q.body as { query: { type?: string; stats?: unknown[]; filters?: unknown } }
check('STATS_AVAILABLE = false (boş iskelet)', STATS_AVAILABLE === false, STATS_AVAILABLE)
check('query.type = taban', body.query.type === "Cutthroat's Garb", body.query.type)
check('stat tablosu boşken usedStats = 0', q.usedStats === 0, q.usedStats)
check('eşleşmeyen mod listelendi (2)', q.unmatched.length === 2, q.unmatched.length)
check('ilvl alt sınır eklendi', !!body.query.filters)
check('sort price asc', (q.body as { sort: { price: string } }).sort.price === 'asc')

console.log('\nmod aç/kapat (değersiz mod çıkar):')
qi.mods[1].enabled = false
const q2 = buildTradeQuery(qi)
check('kapatınca eşleşmeyen 1', q2.unmatched.length === 1, q2.unmatched.length)

// --- Çalışma-anı stat tablosu enjekte → gerçek stat-id eşleşmesi (kind-duyarlı) ---
console.log('\nsetRuntimeStats + stat-id eşleşmesi (kind-duyarlı):')
setRuntimeStats([
  { id: 'explicit.stat_life', text: '+# to maximum Life', tr: '', type: 'explicit' },
  { id: 'explicit.stat_cold_res', text: '+#% to Cold Resistance', tr: '', type: 'explicit' },
  { id: 'implicit.stat_cold_res', text: '+#% to Cold Resistance', tr: '', type: 'implicit' },
  { id: 'explicit.stat_add_fire', text: 'Adds # to # Fire Damage', tr: '', type: 'explicit' },
  { id: 'rune.stat_armour', text: '#% increased Armour', tr: '', type: 'rune' }
])
check('statsAvailable şimdi true', statsAvailable() === true, statsAvailable())
check('Life eşleşti', matchStat('+# to maximum Life')?.id === 'explicit.stat_life', matchStat('+# to maximum Life')?.id)
check('explicit Cold Res', matchStat('+#% to Cold Resistance', 'explicit')?.id === 'explicit.stat_cold_res')
check('implicit Cold Res (kind-duyarlı)', matchStat('+#% to Cold Resistance', 'implicit')?.id === 'implicit.stat_cold_res', matchStat('+#% to Cold Resistance', 'implicit')?.id)
check('rune Armour', matchStat('#% increased Armour', 'rune')?.id === 'rune.stat_armour')
check('Adds aralık eşleşti', matchStat('Adds # to # Fire Damage')?.id === 'explicit.stat_add_fire')
check('eşleşmeyen → null', matchStat('Cannot be Frozen') === null)

const RARE2 = `Item Class: Rings
Rarity: Rare
Gloom Coil
Sapphire Ring
--------
Item Level: 82
--------
+25% to Cold Resistance (implicit)
--------
+45 to maximum Life
Adds 5 to 12 Fire Damage`
const qi2 = rematchQueryItem(parsedToQueryItem(parseClipboard(RARE2)!))
check('3 mod eşleşti', qi2.mods.filter((m) => m.matched).length === 3, qi2.mods.map((m) => m.matched))
const implicitMod = qi2.mods.find((m) => m.kind === 'implicit')
check('implicit mod doğru id', implicitMod?.statId === 'implicit.stat_cold_res', implicitMod?.statId)
const q3 = buildTradeQuery(qi2)
check('usedStats = 3 (dolu tablo)', q3.usedStats === 3, q3.usedStats)
check('Life filtresi min ekledi', JSON.stringify(q3.body).includes('"min"'), JSON.stringify(q3.body))

// --- Part 1: TÜM stat havuzları yakalanır (implicit + explicit + crafted + fractured + rune + enchant) ---
console.log('\nstat yakalama — tüm havuzlar (Part 1):')
setRuntimeStats([
  { id: 'explicit.stat_life', text: '+# to maximum Life', tr: '', type: 'explicit' },
  { id: 'explicit.stat_cold_res', text: '+#% to Cold Resistance', tr: '', type: 'explicit' },
  { id: 'implicit.stat_cold_res', text: '+#% to Cold Resistance', tr: '', type: 'implicit' },
  { id: 'fractured.stat_life', text: '+# to maximum Life', tr: '', type: 'fractured' },
  { id: 'rune.stat_fire_res', text: '+#% to Fire Resistance', tr: '', type: 'rune' },
  { id: 'enchant.stat_skill_lvl', text: '+# to Level of all Spell Skills', tr: '', type: 'enchant' },
  { id: 'explicit.stat_spell_dmg', text: '#% increased Spell Damage', tr: '', type: 'explicit' }
])
const FULL = `Item Class: Body Armours
Rarity: Rare
Doom Veil
Sage Robe
--------
Energy Shield: 120
--------
Requirements:
Level: 65
Int: 100
--------
Item Level: 82
--------
+15% to Cold Resistance (implicit)
--------
+12 to Level of all Spell Skills (enchant)
--------
+95 to maximum Life
18% increased Spell Damage
+30% to Cold Resistance
+40 to maximum Life (fractured)
+25% to Fire Resistance (rune)
--------
Corrupted`
const pFull = parseClipboard(FULL)!
check('fractured işaretlendi', pFull.fractured === true)
check('enchant ayrı havuzda', pFull.enchants.length === 1, pFull.enchants.length)
check('corrupted', pFull.corrupted === true)
const qiFull = rematchQueryItem(parsedToQueryItem(pFull))
// implicit(1) + explicit/fractured/rune(4) + enchant(1) = 6 mod
check('7 mod toplandı (enchant+fractured+rune dahil)', qiFull.mods.length === 7, qiFull.mods.length)
check('enchant mod var', qiFull.mods.some((m) => m.kind === 'enchant'), qiFull.mods.map((m) => m.kind))
check('fractured mod var', qiFull.mods.some((m) => m.kind === 'fractured'))
check('implicit Cold Res kind-duyarlı', qiFull.mods.find((m) => m.kind === 'implicit')?.statId === 'implicit.stat_cold_res')
const rep = describeMatch(qiFull)
check('7 mod eşleşti (hepsi)', rep.matched.length === 7, { matched: rep.matched.length, unmatched: rep.unmatched.map((u) => u.text) })
check('eşleşmeyen yok', rep.unmatched.length === 0, rep.unmatched)
const qFull = buildTradeQuery(qiFull)
check('usedStats = 7', qFull.usedStats === 7, qFull.usedStats)

console.log('\ndescribeMatch — eşleşmeyen "doğrulanmalı":')
setRuntimeStats([{ id: 'explicit.stat_life', text: '+# to maximum Life', tr: '', type: 'explicit' }])
const qiPartial = rematchQueryItem(parsedToQueryItem(parseClipboard(`Item Class: Rings
Rarity: Rare
X
Sapphire Ring
--------
Item Level: 80
--------
+50 to maximum Life
+30% to Cold Resistance
Cannot be Frozen`)!))
const rep2 = describeMatch(qiPartial)
check('1 eşleşti (Life)', rep2.matched.length === 1, rep2.matched.length)
check('2 eşleşmedi (ColdRes+CannotFreeze)', rep2.unmatched.length === 2, rep2.unmatched.map((u) => u.text))
check('eşleşmeyen metni taşır', rep2.unmatched.some((u) => /Cannot be Frozen/.test(u.text)))

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
console.log(
  STATS_AVAILABLE
    ? '(stat tablosu DOLU — stat filtreleri aktif)'
    : '(stat tablosu BOŞ — gerçek ağda "npm run build:trade-stats" veya uygulama-içi cache ile dolacak)'
)
process.exit(fail ? 1 : 0)
