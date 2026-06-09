// trade-query.ts — ParsedItem / craft ItemState'ten resmî trade2 arama sorgusu kurar.
// SAF (ağ yok). Stat-id eşleşmesi src/data/trade_stats.json'dan; tablo boşsa sorgu
// zarifçe taban+ilvl'e düşer (DÜRÜST: stat filtresi yoksa "kaba aralık" uyarısı UI'da).
//
// Eşleştirme anahtarı EN metin kalıbı (mod satırı → '#'). Eşleşmeyen mod'lar
// "eşleşmedi" olarak işaretlenir (uydurma yok). Sorgu yalnız ARAMA içindir;
// otomatik alım YOK — fiyat tahmini benzer ilanlardan, link tarayıcıda açılır.

import tradeStatsData from '../../../data/trade_stats.json'

export interface TradeStat {
  id: string
  text: string
  tr?: string // bizim TR katmanımız (resmî API stat'larında yok → opsiyonel)
  type: string
}
let STATS: TradeStat[] = (tradeStatsData as unknown as { stats: TradeStat[] }).stats || []
// İlk durum (statik iskelet). Çalışma anında main net.fetch ile dolabilir (setRuntimeStats).
export const STATS_AVAILABLE = STATS.length > 0
export function statsAvailable(): boolean {
  return STATS.length > 0
}

// normKey: build-trade-stats.ts ile AYNI (küçük harf, '+' at, boşluk sadeleştir, son '.' at)
function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*$/, '')
    .trim()
}
// '#'li kalıbı normalize et: build-mods # kalıbıyla trade '#' kalıbını hizala
function patternKey(pattern: string): string {
  return normKey(pattern.replace(/#/g, '#'))
}

// İki indeks: (1) yalnız-metin (explicit tercihli) ve (2) tip+metin (kind-duyarlı eşleşme).
// Bir implicit "+#% to Fire Resistance" ile explicit aynı metni paylaşır ama AYRI stat-id'leri
// vardır → kind-duyarlı eşleşme yanlış filtreyi önler.
let statByKey = new Map<string, TradeStat>()
let statByKindKey = new Map<string, TradeStat>()
function rebuildIndex(): void {
  const map = new Map<string, TradeStat>()
  const kindMap = new Map<string, TradeStat>()
  for (const st of STATS) {
    const k = normKey(st.text)
    const cur = map.get(k)
    if (!cur || (cur.type !== 'explicit' && st.type === 'explicit')) map.set(k, st)
    // tip+metin: aynı tipte ilk gelen kalır
    const kk = (st.type || 'explicit') + '|' + k
    if (!kindMap.has(kk)) kindMap.set(kk, st)
  }
  statByKey = map
  statByKindKey = kindMap
}
rebuildIndex()

// QueryMod kind → trade stat type adayları (sırayla denenir; bulunamazsa metin-only'ye düşer).
function statTypesForKind(kind?: string): string[] {
  switch (kind) {
    case 'implicit':
      return ['implicit']
    case 'enchant':
      return ['enchant', 'explicit']
    case 'rune':
      return ['rune', 'explicit']
    case 'fractured':
      return ['fractured', 'explicit']
    case 'crafted':
      return ['crafted', 'explicit']
    default:
      return ['explicit']
  }
}

/** Çalışma anında main net.fetch ile çekilen resmî stat'ları enjekte et (Cloudflare-güvenli yol).
 *  Statik iskelet boşsa bu, stat-id eşleşmesini aktive eder. */
export function setRuntimeStats(stats: TradeStat[]): void {
  if (Array.isArray(stats) && stats.length) {
    STATS = stats
    rebuildIndex()
  }
}

export type QueryModKind = 'explicit' | 'implicit' | 'crafted' | 'fractured' | 'rune' | 'enchant'
export interface QueryMod {
  pattern: string // EN '#' kalıbı
  text: string // okunabilir ham satır (UI toggle listesinde gösterilir)
  value: number | null // filtre için min değer (ilk sayı)
  kind: QueryModKind
  enabled: boolean // kullanıcı aç/kapat (değersiz mod'u çıkar + yeniden ara)
  // eşleşme sonucu (UI için):
  statId?: string
  matched: boolean
}

export interface QueryItem {
  baseType: string
  name: string
  rarity: string
  itemLevel: number | null
  category?: string // opsiyonel trade type_filter kategorisi
  mods: QueryMod[]
}

/** Bir mod satırından filtre için ilk sayısal değeri çıkar ("+88 to ..." → 88). */
export function valueFromLine(line: string): number | null {
  const m = line.match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

/** Bir kalıbı trade stat-id'ye eşle (yoksa null). kind verilirse tip-duyarlı eşleşir
 *  (implicit/explicit ayrımı), bulunamazsa yalnız-metin indeksine düşer. */
export function matchStat(pattern: string, kind?: string): TradeStat | null {
  const k = patternKey(pattern)
  if (kind) {
    for (const ty of statTypesForKind(kind)) {
      const hit = statByKindKey.get(ty + '|' + k)
      if (hit) return hit
    }
  }
  return statByKey.get(k) ?? null
}

/** ParsedItem (clipboard) → QueryItem. Her mod (implicit/explicit/crafted/fractured/rune/enchant)
 *  stat-id'ye eşlenmeye çalışılır. 0.15.1 geliştirilmiş clipboard-parse'ın TÜM mod havuzları okunur. */
export function parsedToQueryItem(p: {
  baseType: string
  name: string
  rarity: string
  itemLevel: number | null
  implicits: { text: string; kind: string }[]
  explicits: { text: string; kind: string }[]
  enchants?: { text: string; kind: string }[]
}): QueryItem {
  const toMod = (text: string, kind: string): QueryMod => {
    const pattern = text.replace(/\d+(?:\.\d+)?/g, '#').replace(/#\s*[-–]\s*#/g, '#').trim()
    const st = matchStat(pattern, kind)
    return {
      pattern,
      text: text.trim(),
      value: valueFromLine(text),
      kind: (kind || 'explicit') as QueryModKind,
      enabled: true,
      statId: st?.id,
      matched: !!st
    }
  }
  // implicit + explicit(+crafted/fractured/rune kind ile) + enchant — TÜM statlar
  const mods = [
    ...p.implicits.map((m) => toMod(m.text, 'implicit')),
    ...p.explicits.map((m) => toMod(m.text, m.kind)),
    ...(p.enchants ?? []).map((m) => toMod(m.text, m.kind || 'enchant'))
  ]
  return {
    baseType: p.baseType,
    name: p.name,
    rarity: p.rarity,
    itemLevel: p.itemLevel,
    mods
  }
}

/** Eşleşme raporu (loglama + "doğrulanmalı" işaretleme): hangi mod hangi stat-id'ye eşleşti / eşleşmedi. */
export interface MatchReport {
  matched: Array<{ text: string; kind: string; statId: string }>
  unmatched: Array<{ text: string; kind: string }>
}
export function describeMatch(qi: QueryItem): MatchReport {
  const matched: MatchReport['matched'] = []
  const unmatched: MatchReport['unmatched'] = []
  for (const m of qi.mods) {
    if (m.matched && m.statId) matched.push({ text: m.text, kind: m.kind, statId: m.statId })
    else unmatched.push({ text: m.text, kind: m.kind })
  }
  return { matched, unmatched }
}

/** Bir QueryItem'ın mod'larını GÜNCEL stat tablosuna göre yeniden eşle (yerinde günceller).
 *  ÖNEMLİ: QueryItem stat tablosu yüklenmeden kurulmuş olabilir (ayrı renderer / ilk sorgu);
 *  ensureStats() sonrası bunu çağırmak eşleşmeleri tazeler (aksi halde 0 stat filtresi olur). */
export function rematchQueryItem(qi: QueryItem): QueryItem {
  for (const m of qi.mods) {
    const st = matchStat(m.pattern, m.kind)
    m.statId = st?.id
    m.matched = !!st
  }
  return qi
}

/** Craft ItemState benzeri yapı → QueryItem (yapısal tip; craft-sim'e bağımlılık yok). */
export function itemStateToQueryItem(it: {
  base: { en: string }
  ilvl: number
  rarity: string
  prefixes: { en: string }[]
  suffixes: { en: string }[]
  implicits?: { en: string }[]
}): QueryItem {
  const toMod = (en: string, kind: QueryModKind): QueryMod => {
    const clean = en.replace(/\n/g, ' ').trim()
    const pattern = clean.replace(/\d+(?:\.\d+)?/g, '#').replace(/#\s*[-–]\s*#/g, '#').trim()
    const st = matchStat(pattern, kind)
    return { pattern, text: clean, value: valueFromLine(en), kind, enabled: true, statId: st?.id, matched: !!st }
  }
  const mods = [
    ...(it.implicits ?? []).map((m) => toMod(m.en, 'implicit')),
    ...it.prefixes.map((m) => toMod(m.en, 'explicit')),
    ...it.suffixes.map((m) => toMod(m.en, 'explicit'))
  ]
  return { baseType: it.base.en, name: '', rarity: it.rarity, itemLevel: it.ilvl, mods }
}

export interface BuildQueryOpts {
  onlineOnly?: boolean // varsayılan true
  ilvlMin?: boolean // ilvl'i alt sınır olarak ekle (varsayılan true)
  valueBand?: number // min = value * band (0..1; varsayılan 0.9 — benzer-veya-daha-iyi)
}

/** QueryItem → resmî trade2 POST gövdesi. Yalnız enabled + matched mod'lar stat filtresi olur. */
export function buildTradeQuery(qi: QueryItem, opts: BuildQueryOpts = {}): {
  body: Record<string, unknown>
  usedStats: number
  unmatched: QueryMod[]
} {
  const onlineOnly = opts.onlineOnly !== false
  const band = typeof opts.valueBand === 'number' ? opts.valueBand : 0.9

  const filters: Array<{ id: string; value?: { min?: number } }> = []
  const unmatched: QueryMod[] = []
  for (const m of qi.mods) {
    if (!m.enabled) continue
    if (!m.matched || !m.statId) {
      if (m.enabled) unmatched.push(m)
      continue
    }
    const f: { id: string; value?: { min?: number } } = { id: m.statId }
    if (typeof m.value === 'number') f.value = { min: Math.max(0, Math.floor(m.value * band)) }
    filters.push(f)
  }

  const query: Record<string, unknown> = {
    status: { option: onlineOnly ? 'online' : 'any' }
  }
  // Rare/Magic'te isim aranmaz (rastgele). Unique'te isim, aksi halde taban "type".
  if (qi.rarity === 'Unique' && qi.name) query.name = qi.name
  else if (qi.baseType) query.type = qi.baseType

  if (filters.length) query.stats = [{ type: 'and', filters }]
  else query.stats = [{ type: 'and', filters: [] }]

  if (opts.ilvlMin !== false && typeof qi.itemLevel === 'number') {
    query.filters = {
      misc_filters: { filters: { ilvl: { min: Math.max(1, qi.itemLevel - 2) } } }
    }
  }

  return {
    body: { query, sort: { price: 'asc' } },
    usedStats: filters.length,
    unmatched
  }
}

/** POST /search dönüşündeki query-id ile tarayıcıda açılacak trade2 URL'si. */
export function tradeSearchUrl(league: string, queryId: string): string {
  const lg = encodeURIComponent(league)
  return `https://www.pathofexile.com/trade2/search/poe2/${lg}/${queryId}`
}
