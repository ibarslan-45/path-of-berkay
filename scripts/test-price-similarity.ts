/**
 * test-price-similarity.ts — "en yakın eşya" değerleme birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-price-similarity.ts
 */
import {
  modKey,
  avgValue,
  modsToComp,
  scoreListing,
  rankListings,
  type SimListing
} from '../src/renderer/src/lib/price-similarity'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

console.log('modKey normalize:')
check('+45 to maximum Life → kalıp', modKey('+45 to maximum Life') === '# to maximum life', modKey('+45 to maximum Life'))
check('aynı kalıp farklı değer', modKey('+45 to maximum Life') === modKey('+88 to maximum Life'))
check('Adds 5 to 12 Fire → hibrit tek #', modKey('Adds 5 to 12 Fire Damage') === modKey('Adds 6 to 14 Fire Damage'), modKey('Adds 5 to 12 Fire Damage'))
check('% atılır', modKey('+30% to Cold Resistance') === modKey('+45% to Cold Resistance'))
check('[Display|alt] sadeleşir', modKey('+10 to [Evasion|Evasion Rating]') === modKey('+10 to Evasion Rating'), modKey('+10 to [Evasion|Evasion Rating]'))
check('farklı stat → farklı kalıp', modKey('+45 to maximum Life') !== modKey('+45 to maximum Mana'))

console.log('\navgValue:')
check('tek sayı', avgValue('+45 to maximum Life') === 45)
check('hibrit ortalama (5,12)→8.5', avgValue('Adds 5 to 12 Fire Damage') === 8.5)
check('sayısız → null', avgValue('Cannot be Frozen') === null)

console.log('\nscoreListing:')
const user = modsToComp(['+45 to maximum Life', '+30% to Cold Resistance', '+25 to Intelligence'])
// neredeyse aynı eşya (değerler yakın)
const s1 = scoreListing(user, ['+47 to maximum Life', '+32% to Cold Resistance', '+24 to Intelligence'])
check('3 eşleşti', s1.matched === 3, s1.matched)
check('yakınlık ~3 (değerler çok yakın)', s1.closeness > 2.8, s1.closeness)
// 2 eşleşen, biri eksik
const s2 = scoreListing(user, ['+45 to maximum Life', '+30% to Cold Resistance'])
check('2 eşleşti', s2.matched === 2, s2.matched)
check('daha yüksek eşleşme daha yüksek skor', s1.score > s2.score, { s1: s1.score, s2: s2.score })
// fazla mod cezası
const s3 = scoreListing(user, ['+45 to maximum Life', '+30% to Cold Resistance', '+25 to Intelligence', '+10 to Strength', '+5% to Fire Resistance'])
check('3 eşleşti + 2 fazla', s3.matched === 3 && s3.extra === 2, { m: s3.matched, e: s3.extra })
check('fazla mod skoru biraz düşürür', s3.score < s1.score, { s3: s3.score, s1: s1.score })

console.log('\nrankListings (en yakın eşya):')
const listings: SimListing[] = [
  { amount: 5, currency: 'divine', mods: ['+20 to maximum Life'] }, // ucuz ama az benzer (1 eşleşme)
  { amount: 30, currency: 'divine', mods: ['+46 to maximum Life', '+31% to Cold Resistance', '+24 to Intelligence'] }, // EN BENZER
  { amount: 50, currency: 'divine', mods: ['+80 to maximum Life', '+40% to Cold Resistance', '+40 to Intelligence', '+30 to Strength'] } // daha iyi+pahalı
]
const rank = rankListings(user, listings)
check('hasModData', rank.hasModData)
check('nearest = en benzer (30 divine, 3 eşleşme)', rank.nearest?.listing.amount === 30, rank.nearest?.listing.amount)
check('nearest 3 eşleşme', rank.nearest?.matched === 3, rank.nearest?.matched)
check('userModCount = 3', rank.userModCount === 3)
check('band aynı para birimi', rank.band?.currency === 'divine')

console.log('\nen ucuz benzer-veya-daha-iyi (eşit benzerlikte ucuz önce):')
const eq: SimListing[] = [
  { amount: 40, currency: 'divine', mods: ['+45 to maximum Life', '+30% to Cold Resistance', '+25 to Intelligence'] },
  { amount: 20, currency: 'divine', mods: ['+45 to maximum Life', '+30% to Cold Resistance', '+25 to Intelligence'] }
]
const rankEq = rankListings(user, eq)
check('eşit benzerlik → ucuz nearest (20)', rankEq.nearest?.listing.amount === 20, rankEq.nearest?.listing.amount)

console.log('\nmod verisi yoksa → en ucuz (cheapest fallback):')
const noMods: SimListing[] = [
  { amount: 12, currency: 'divine', mods: [] },
  { amount: 8, currency: 'divine', mods: [] }
]
const rankNo = rankListings(user, noMods)
check('hasModData false', rankNo.hasModData === false)
check('nearest = en ucuz (8)', rankNo.nearest?.listing.amount === 8, rankNo.nearest?.listing.amount)

console.log('\nfarklı para birimleri → nearest kendi biriminde band:')
const mixed: SimListing[] = [
  { amount: 100, currency: 'exalted', mods: ['+45 to maximum Life'] },
  { amount: 25, currency: 'divine', mods: ['+46 to maximum Life', '+30% to Cold Resistance', '+25 to Intelligence'] },
  { amount: 30, currency: 'divine', mods: ['+44 to maximum Life', '+29% to Cold Resistance', '+25 to Intelligence'] }
]
const rankMix = rankListings(user, mixed)
check('nearest divine', rankMix.nearest?.listing.currency === 'divine', rankMix.nearest?.listing.currency)
check('band yalnız divine (exalted hariç)', rankMix.band?.currency === 'divine' && rankMix.band?.count === 2, rankMix.band)

console.log('\nboş ilan listesi:')
const rankEmpty = rankListings(user, [])
check('nearest null', rankEmpty.nearest === null)
check('band null', rankEmpty.band === null)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
