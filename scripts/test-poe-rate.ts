/**
 * test-poe-rate.ts — rate-limit header okuma + realm yolu adayları birim testi (saf).
 * Çalıştırma: npx tsx scripts/test-poe-rate.ts
 */
import { nextAllowedFromHeaders, searchPathCandidates } from '../src/main/poe-rate'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}
// header map → get fonksiyonu (case-insensitive)
const G = (h: Record<string, string>) => (k: string): string | null => {
  const lk = k.toLowerCase()
  for (const key of Object.keys(h)) if (key.toLowerCase() === lk) return h[key]
  return null
}
const NOW = 1_000_000

console.log('Retry-After (429):')
check('30sn → now+30000', nextAllowedFromHeaders(G({ 'retry-after': '30' }), NOW) === NOW + 30000)
check('header yoksa 0', nextAllowedFromHeaders(G({}), NOW) === 0)

console.log('\nX-Rate-Limit State (active ceza):')
// Account kuralı: max 8 / 10sn; state current=8 active=12sn ceza
const h1 = {
  'X-Rate-Limit-Rules': 'Account,Ip',
  'X-Rate-Limit-Account': '8:10:60',
  'X-Rate-Limit-Account-State': '8:10:12',
  'X-Rate-Limit-Ip': '15:60:300',
  'X-Rate-Limit-Ip-State': '2:60:0'
}
check('active=12 → now+12000', nextAllowedFromHeaders(G(h1), NOW) === NOW + 12000, nextAllowedFromHeaders(G(h1), NOW) - NOW)

console.log('\nLimite yaklaşma (active=0 ama cur=max-1):')
// max 8 / 10sn, current=7 (=max-1) → pencereyi yay: 10000/8 = 1250ms
const h2 = {
  'X-Rate-Limit-Rules': 'Account',
  'X-Rate-Limit-Account': '8:10:60',
  'X-Rate-Limit-Account-State': '7:10:0'
}
check('cur=7,max=8 → now+1250', nextAllowedFromHeaders(G(h2), NOW) === NOW + 1250, nextAllowedFromHeaders(G(h2), NOW) - NOW)

console.log('\nBol alan (cur düşük) → bekleme yok:')
const h3 = {
  'X-Rate-Limit-Rules': 'Account',
  'X-Rate-Limit-Account': '8:10:60',
  'X-Rate-Limit-Account-State': '1:10:0'
}
check('cur=1 → 0 (bekleme yok)', nextAllowedFromHeaders(G(h3), NOW) === 0, nextAllowedFromHeaders(G(h3), NOW))

console.log('\nÇoklu pencere (en kısıtlayıcı kazanır):')
// iki pencere: 8:10 ve 200:600; state 8:10:5 (ilk pencere ceza 5sn) ve 50:600:0
const h4 = {
  'X-Rate-Limit-Rules': 'Account',
  'X-Rate-Limit-Account': '8:10:60,200:600:60',
  'X-Rate-Limit-Account-State': '8:10:5,50:600:0'
}
check('ilk pencere active=5 → now+5000', nextAllowedFromHeaders(G(h4), NOW) === NOW + 5000, nextAllowedFromHeaders(G(h4), NOW) - NOW)

console.log('\nRealm yol adayları:')
const c = searchPathCandidates('https://www.pathofexile.com', 'Rise of the Abyssal')
check('1. aday /poe2/{lg}', c[0] === 'https://www.pathofexile.com/api/trade2/search/poe2/Rise%20of%20the%20Abyssal', c[0])
check('2. aday /{lg} (fallback)', c[1] === 'https://www.pathofexile.com/api/trade2/search/Rise%20of%20the%20Abyssal', c[1])

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
