// rune-info.ts — rune slug / ham id / "(Rune) X" adını OYUNDAKİ gerçek rune'a çözer.
// Kaynak: currency.json (subtype === 'rune') → gerçek ad (en), ikon (assets/currency/...png) ve
// etki metni (desc_en/desc_tr; item sınıfına göre satırlar: Armour / Martial Weapon / Wand…).
// Mobalytics build verisi rune'u ham slug olarak taşır ("runelightninglesser" / "(Rune) Runelightninglesser");
// normalize (küçük harf + alnum) ile currency id-suffix'ine ("RuneLightningLesser") ya da en adına eşlenir.
// Eşleşme yoksa null → çağıran "ham" adı + "ikon yok" gösterir (UYDURMA YOK).
import currencyData from '../../../data/currency.json'

interface CurrencyRec {
  id: string
  en: string
  tr: string
  subtype?: string
  desc_en?: string
  desc_tr?: string
  icon: string | null
}
function records<T>(d: unknown): T[] {
  const o = d as { records?: T[] }
  return o.records ?? (d as T[])
}
const norm = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export interface RuneInfo {
  en: string // oyundaki gerçek ad (özel ad → her zaman EN)
  tr: string
  icon: string | null // items/currency ikon yolu (assets/currency/...png)
  descEn: string // etki metni (çok satırlı; item sınıfına göre)
  descTr: string
}

const runeByKey = new Map<string, RuneInfo>()
for (const r of records<CurrencyRec>(currencyData)) {
  if ((r.subtype || '').toLowerCase() !== 'rune') continue
  const info: RuneInfo = {
    en: r.en,
    tr: r.tr || r.en,
    icon: r.icon ?? null,
    descEn: r.desc_en || '',
    descTr: r.desc_tr || ''
  }
  const idSuffix = (r.id || '').replace(/.*\//, '')
  for (const k of [norm(idSuffix), norm(r.en)]) if (k && !runeByKey.has(k)) runeByKey.set(k, info)
}

/** Bir rune anahtarını ("(Rune) X" / ham slug / id) çöz. Bulunamazsa null. */
export function resolveRune(raw: string): RuneInfo | null {
  if (!raw) return null
  const s = raw
    .replace(/^\(\s*rune\s*\)\s*/i, '')
    .replace(/^soulcore-/i, '')
    .trim()
  return runeByKey.get(norm(s)) ?? null
}
