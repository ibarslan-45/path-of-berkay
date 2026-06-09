// poe-rate.ts — PoE trade API rate-limit header'larını okuyan SAF mantık (test edilebilir).
// net.fetch Headers yerine bir `get(name)=>string|null` alır (mock'la test edilebilir).
//
// Resmî header'lar (developer docs):
//   Retry-After: <saniye>                          (429'da kesin bekleme)
//   X-Rate-Limit-Rules: "Account,Ip"               (uygulanan kurallar)
//   X-Rate-Limit-<rule>: "max:period:restrict[,…]" (pencere tanımı)
//   X-Rate-Limit-<rule>-State: "current:period:active[,…]"  (anlık durum)
// active>0 → ceza süresi (sn) kadar bekle. Limite yaklaşınca pencereyi yay (period/max).

export type HeaderGet = (name: string) => string | null | undefined

/** Header'lardan ima edilen "bir sonraki izinli zaman" (epoch ms). Hiçbiri yoksa 0. */
export function nextAllowedFromHeaders(get: HeaderGet, now: number): number {
  let next = 0

  // Retry-After (429)
  const ra = get('retry-after')
  if (ra) {
    const sec = parseInt(ra, 10)
    if (Number.isFinite(sec) && sec > 0) next = Math.max(next, now + sec * 1000)
  }

  // X-Rate-Limit-Rules → her kural için State + Limit
  const rules = (get('x-rate-limit-rules') || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
  for (const rule of rules) {
    const lc = rule.toLowerCase()
    const state = get(`x-rate-limit-${lc}-state`)
    const limit = get(`x-rate-limit-${lc}`)
    if (!state || !limit) continue
    const limWindows = limit.split(',')
    state.split(',').forEach((st, i) => {
      const [cur, , active] = st.split(':').map((x) => parseInt(x, 10))
      const lw = (limWindows[i] || limWindows[0] || '').split(':').map((x) => parseInt(x, 10))
      const max = lw[0]
      const period = lw[1]
      if (Number.isFinite(active) && active > 0) {
        next = Math.max(next, now + active * 1000)
      } else if (Number.isFinite(cur) && Number.isFinite(max) && Number.isFinite(period) && max > 0) {
        // limite 1 kala: pencereyi maks isteğe böl → boşluğu genişlet
        if (cur >= max - 1) next = Math.max(next, now + (period * 1000) / max)
      }
    })
  }
  return next
}

// --- trade2 realm yolu adayları (ilk gerçek çağrıda hangisi 200/4xx≠404 ise o kullanılır) ---
export function searchPathCandidates(base: string, league: string): string[] {
  const lg = encodeURIComponent(league)
  return [`${base}/api/trade2/search/poe2/${lg}`, `${base}/api/trade2/search/${lg}`]
}
