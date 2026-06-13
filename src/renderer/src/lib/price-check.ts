// price-check.ts — Faz 1 fiyat motoru (paylaşılan): hem Craft Simülatörü hem oyun-içi
// fiyat overlay'i (Faz 2) bunu kullanır. AĞ İSTİSNASI: yalnız eşya/sorgu gönderilir.
// Otomatik alım YOK. Değer her zaman "≈ tahmini" (benzer ilan dağılımı).
//
// Lig + stat tablosu module-level CACHE'lenir (bir kez yüklenir, tüm panellerde paylaşılır).

import {
  buildTradeQuery,
  tradeSearchUrl,
  tradeQueryUrl,
  statsAvailable,
  setRuntimeStats,
  rematchQueryItem,
  describeMatch,
  type QueryItem
} from './trade-query'
import { rankListings, modsToComp, type SimListing } from './price-similarity'

export interface PriceEstimate {
  ok: boolean
  error: string // '' | no_league | no_results | rate_limited | forbidden | timeout | network | ...
  count: number // trade total (eşleşen toplam ilan)
  sampled: number // fiyatı okunan ilan sayısı
  // --- en yakın eşya değerleme (ORTALAMA DEĞİL) ---
  nearest: number // en benzer ilanın fiyatı (headline değer)
  nearestCurrency: string
  nearMatched: number // o ilanda eşleşen stat sayısı
  nearTotal: number // kullanıcının (aktif) stat sayısı
  bandLow: number // en benzer N ilanın fiyat aralığı (aynı para birimi)
  bandHigh: number
  bandCount: number
  method: 'nearest' | 'cheapest' // nearest = mod verisiyle; cheapest = mod verisi yok → en ucuz benzer
  // bağlam (aynı para biriminde dağılım)
  min: number
  median: number
  max: number
  currency: string
  usedStats: number // sorguda kullanılan stat filtresi
  unmatched: number // stat-id'ye eşlenemeyen mod sayısı
  queryId: string
  league: string
}

let cachedLeague = ''
let statsTried = false

/** Mevcut PoE2 ligini bir kez çek (gömme yok). '' dönerse ağ/hata. */
export async function ensureLeague(): Promise<string> {
  if (cachedLeague) return cachedLeague
  const r = await window.api?.price?.leagues()
  if (!r?.ok || !r.leagues?.length) return ''
  const temp = r.leagues.find((l) => !/standard|hardcore|ssf/i.test(l.id))
  cachedLeague = (temp ?? r.leagues[0]).id
  return cachedLeague
}
export function getLeagues(): Promise<{ ok: boolean; leagues?: Array<{ id: string; text: string; realm: string }>; error?: string }> {
  return window.api?.price?.leagues() ?? Promise.resolve({ ok: false })
}
export function setLeague(id: string): void {
  if (id) cachedLeague = id
}
export function currentLeague(): string {
  return cachedLeague
}

/** Resmî stat-id tablosunu garanti et (statik iskelet boşsa main net.fetch ile doldur). */
export async function ensureStats(): Promise<boolean> {
  if (statsAvailable()) return true
  if (statsTried) return statsAvailable()
  statsTried = true
  const r = await window.api?.price?.tradeStats()
  if (r?.ok && r.stats?.length) {
    setRuntimeStats(r.stats)
    return true
  }
  return false
}

/**
 * QueryItem → "EN YAKIN EŞYA" fiyat tahmini. Dönen ilanlar arasından kullanıcının eşyasına EN BENZER
 * olan(lar) bulunur (benzerlik = eşleşen stat sayısı + değer yakınlığı); değer ona göre biçilir.
 * Ortalama/medyan headline DEĞİLDİR (yalnız bağlam). Mod verisi yoksa en ucuz benzer-veya-daha-iyi'ye düşer.
 */
export async function estimateValue(qi: QueryItem): Promise<PriceEstimate> {
  const base: PriceEstimate = {
    ok: false, error: '', count: 0, sampled: 0,
    nearest: 0, nearestCurrency: '', nearMatched: 0, nearTotal: 0, bandLow: 0, bandHigh: 0, bandCount: 0, method: 'nearest',
    min: 0, median: 0, max: 0, currency: '', usedStats: 0, unmatched: 0, queryId: '', league: ''
  }
  const league = await ensureLeague()
  if (!league) return { ...base, error: 'no_league' }
  base.league = league
  await ensureStats()
  rematchQueryItem(qi) // stat tablosu yeni yüklendiyse eşleşmeleri tazele (0-filtre hatasını önler)

  // Loglama (Part 1): neyin neden eşleşmediğini gör — unmatched mod'lar "doğrulanmalı" işaretlenir.
  const report = describeMatch(qi)
  if (report.unmatched.length) {
    console.log('[price] stat eşleşmedi (doğrulanmalı):', report.unmatched.map((u) => `${u.text} [${u.kind}]`))
  }

  const q = buildTradeQuery(qi)
  base.usedStats = q.usedStats
  base.unmatched = q.unmatched.length

  const search = await window.api?.price?.tradeSearch(league, q.body)
  if (!search?.ok) return { ...base, error: search?.error || 'network' }
  base.queryId = search.queryId || ''
  base.count = search.total || 0
  if (!search.ids?.length) return { ...base, error: 'no_results' }

  const fetchR = await window.api?.price?.tradeFetch(search.ids, search.queryId || '')
  if (!fetchR?.ok || !fetchR.listings?.length) return { ...base, error: fetchR?.error || 'no_results' }

  // EN YAKIN EŞYA: aktif (enabled) kullanıcı mod'larını ilan mod'larıyla karşılaştır
  const userComp = modsToComp(qi.mods.filter((m) => m.enabled).map((m) => m.text))
  const rank = rankListings(userComp, fetchR.listings as SimListing[])
  if (!rank.nearest) return { ...base, error: 'no_results' }

  // bağlam: nearest para biriminde min/median/max
  const cur = rank.nearest.listing.currency
  const sameArr = fetchR.listings.filter((l) => l.currency === cur).map((l) => l.amount).sort((a, b) => a - b)

  return {
    ...base,
    ok: true,
    sampled: fetchR.listings.length,
    nearest: rank.nearest.listing.amount,
    nearestCurrency: cur,
    nearMatched: rank.nearest.matched,
    nearTotal: userComp.length,
    bandLow: rank.band?.low ?? rank.nearest.listing.amount,
    bandHigh: rank.band?.high ?? rank.nearest.listing.amount,
    bandCount: rank.band?.count ?? 1,
    method: rank.hasModData ? 'nearest' : 'cheapest',
    currency: cur,
    min: sameArr[0] ?? rank.nearest.listing.amount,
    median: sameArr[Math.floor(sameArr.length / 2)] ?? rank.nearest.listing.amount,
    max: sameArr[sameArr.length - 1] ?? rank.nearest.listing.amount
  }
}

/**
 * QueryItem için trade2 aramasını aç (otomatik alım değil; trade penceresi/tarayıcı). TEK paylaşılan yol —
 * hem fiyat-overlay'i hem build "Trade'de Ara" bunu kullanır. Kullanıcı seçimleri birebir (enabled stat,
 * min TAM = valueBand:1). 0.18.1: lig DİNAMİK (ensureLeague — fiyatın kullandığı kaynak); hardcoded
 * 'Standard' KALDIRILDI ("no longer valid" sebebiydi). POST başarısızsa DOĞRU ligli `?q=` URL'sine düşer.
 */
export async function openItemInTrade(qi: QueryItem): Promise<boolean> {
  const league = await ensureLeague()
  await ensureStats()
  rematchQueryItem(qi)
  if (!league) {
    console.log('[trade] lig alınamadı → açılamıyor (ağ?)')
    return false // yanlış ligle "no longer valid" üretmektense açma
  }
  // 1) POST → kısa/temiz queryId URL'si (çalışırsa en iyisi; lig DOĞRU)
  try {
    const q = buildTradeQuery(qi, { valueBand: 1 })
    const search = await window.api?.price?.tradeSearch(league, q.body)
    if (search?.ok && search.queryId) {
      window.api?.price?.openTradeUrl(tradeSearchUrl(league, search.queryId))
      return true
    }
  } catch {
    /* POST hatası → ?q= URL'sine düş */
  }
  // 2) FALLBACK: AYNI dinamik ligle ?q= URL (POST gerekmez; CF'i pencere kendi geçer). Yanlış lig YOK.
  window.api?.price?.openTradeUrl(tradeQueryUrl(league, qi, { valueBand: 1 }))
  return true
}

/** Hata kodu → iki dilli kullanıcı mesajı. */
export function priceErrMsg(code: string, isTr: boolean): string {
  const m: Record<string, [string, string]> = {
    no_league: ['Lig alınamadı (ağ?)', 'Could not load league (network?)'],
    no_results: ['Benzer ilan bulunamadı — eşya nadir/uç olabilir', 'No similar listings — item may be rare/extreme'],
    rate_limited: ['Çok hızlı sorgu — biraz bekle', 'Rate-limited — wait a moment'],
    forbidden: ['Site engelledi (Cloudflare/oturum)', 'Blocked (Cloudflare/session)'],
    timeout: ['Zaman aşımı', 'Timed out'],
    network: ['Ağ yok / bağlanılamadı', 'No network / cannot connect']
  }
  const e = m[code] ?? ['Bilinmeyen hata', 'Unknown error']
  return isTr ? e[0] : e[1]
}
