// price-similarity.ts — "en yakın eşya" değerleme (ortalama/medyan DEĞİL).
//
// Trade2 sorgusundan dönen ilanların HER BİRİNİN modları kullanıcının eşyasıyla karşılaştırılır;
// benzerlik skoru = EŞLEŞEN stat sayısı + stat DEĞERLERİNİN yakınlığı. En benzer ilan(lar) seçilir
// ve değer onlara göre biçilir ("en benzer N ilana göre ~X"). Ortalama KULLANILMAZ.
//
// SAF + test edilebilir (ağ yok). Dürüst: mod verisi yoksa en ucuz benzer-veya-daha-iyi ilana düşer.

export interface CompMod {
  pattern: string // normalize edilmiş eşleştirme anahtarı
  value: number | null // satırdaki sayıların ORTALAMASI (hibrit "Adds 5 to 12" → 8.5)
}
export interface SimListing {
  amount: number
  currency: string
  mods: string[]
  name?: string
  typeLine?: string
  ilvl?: number | null
}
export interface ScoredListing {
  listing: SimListing
  matched: number
  closeness: number // 0..matched (değer yakınlığı toplamı)
  extra: number // ilanın fazladan mod sayısı
  score: number
}
export interface NearestResult {
  nearest: ScoredListing | null
  band: { low: number; high: number; count: number; currency: string } | null
  ranked: ScoredListing[]
  hasModData: boolean
  userModCount: number
}

/** Bir mod satırını normalize anahtara indir (kullanıcı + ilan AYNI fonksiyondan geçer → eşleşir). */
export function modKey(line: string): string {
  return (line || '')
    // trade2 "[Display|alt]" / "[Display]" süslemelerini sadeleştir
    .replace(/\[([^\]]*)\]/g, (_m, g: string) => (g.includes('|') ? g.split('|').pop() || '' : g))
    .toLowerCase()
    .replace(/\+/g, '')
    .replace(/\d+(?:\.\d+)?/g, '#')
    .replace(/#\s*(?:to|–|-)\s*#/g, '#') // "# to #" / "# - #" → tek #
    .replace(/[^a-z# ]/g, ' ') // %, noktalama at
    .replace(/\s+/g, ' ')
    .trim()
}

/** Satırdaki sayıların ortalaması (yakınlık karşılaştırması için; hibrit aralıkları da kapsar). */
export function avgValue(line: string): number | null {
  const nums = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Mod satırı → CompMod. */
export function lineToComp(line: string): CompMod {
  return { pattern: modKey(line), value: avgValue(line) }
}
/** Mod satırları → CompMod[] (boş/anahtarsız atılır). */
export function modsToComp(lines: string[]): CompMod[] {
  const out: CompMod[] = []
  for (const l of lines) {
    const k = modKey(l)
    if (k) out.push({ pattern: k, value: avgValue(l) })
  }
  return out
}

/** Bir ilanın kullanıcı eşyasına benzerlik skoru. */
export function scoreListing(userMods: CompMod[], listingLines: string[]): Omit<ScoredListing, 'listing'> {
  const listingMods = modsToComp(listingLines)
  // pattern → ilk değer (aynı mod birden çok kez nadir)
  const lmap = new Map<string, number | null>()
  for (const lm of listingMods) if (!lmap.has(lm.pattern)) lmap.set(lm.pattern, lm.value)

  let matched = 0
  let closeness = 0
  for (const um of userMods) {
    if (!lmap.has(um.pattern)) continue
    matched++
    const lv = lmap.get(um.pattern) ?? null
    if (um.value != null && lv != null) {
      const denom = Math.max(Math.abs(um.value), Math.abs(lv), 1)
      closeness += 1 - Math.min(1, Math.abs(um.value - lv) / denom)
    } else {
      closeness += 1 // sayısız mod (ör. "Cannot be Frozen") varsa tam yakınlık
    }
  }
  const extra = Math.max(0, listingMods.length - matched)
  // skor: eşleşen sayı baskın (×10), değer yakınlığı ince ayar, fazla mod hafif ceza
  const score = matched * 10 + closeness - 0.15 * extra
  return { matched, closeness, extra, score }
}

/**
 * İlanları kullanıcı eşyasına göre sırala → en benzer(ler). nearest = en yüksek skor (eşitlikte ucuz).
 * band = nearest ile aynı para biriminde en benzer topN ilanın fiyat aralığı.
 */
export function rankListings(
  userMods: CompMod[],
  listings: SimListing[],
  topN = 3
): NearestResult {
  const hasModData = listings.some((l) => l.mods && l.mods.length > 0)
  const ranked: ScoredListing[] = listings.map((l) => ({ listing: l, ...scoreListing(userMods, l.mods || []) }))
  // skor desc; eşitlikte fiyat asc (en ucuz benzer-veya-daha-iyi)
  ranked.sort((a, b) => b.score - a.score || a.listing.amount - b.listing.amount)
  const nearest = ranked[0] ?? null
  let band: NearestResult['band'] = null
  if (nearest) {
    const cur = nearest.listing.currency
    const same = ranked.filter((r) => r.listing.currency === cur).slice(0, Math.max(1, topN))
    const amounts = same.map((r) => r.listing.amount)
    band = {
      low: Math.min(...amounts),
      high: Math.max(...amounts),
      count: same.length,
      currency: cur
    }
  }
  return { nearest, band, ranked, hasModData, userModCount: userMods.length }
}
