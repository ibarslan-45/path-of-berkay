// item-icon.ts — TEK MERKEZİ eşya base → ikon çözümleyici (build / craft / trade / fiyat aynı kullanır).
//
// KURAL: TAM (exact) eşleme — base_items (items.json) + craft base'leri (mods_sim.json) içinde eşyanın
// gerçek base ADIYLA BİREBİR eşleşen kaydın ikonu. SUBSTRING/fuzzy YOK → "Iron Ring", "Gold Ring",
// "Sapphire Ring", "Sapphire Charm" birbirine KARIŞMAZ. Eşleşme yoksa null → çağıran "ikon yok" gösterir
// (yanlış ikon ASLA). Mobalytics reconstruction'da gerçek base eşyanın `name` alanındadır (base alanı yalnız
// SINIF adıdır: "Ring"/"Bow"); bu yüzden ÖNCE `name`, sonra önek-soyulmuş name, sonra `base` denenir.
import itemsData from '../../../data/items.json'
import modsSimData from '../../../data/mods_sim.json'
export { canonicalBaseName, resolveBaseName } from './base-name'

const assets = import.meta.glob('../../assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const urlByFile: Record<string, string> = {}
for (const p in assets) urlByFile[p.split('/').pop() as string] = assets[p]

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// base adı (normalize, BİREBİR) → ikon dosyası. items.json önce (kanonik base DB), sonra mods_sim (flask/charm).
const fileByName = new Map<string, string>()
function add(en: string | undefined, icon: string | null | undefined): void {
  if (!en || !icon) return
  const k = norm(en)
  if (k && !fileByName.has(k)) fileByName.set(k, icon.split('/').pop() as string)
}
for (const r of itemsData as Array<{ en?: string; icon?: string | null }>) add(r.en, r.icon)
for (const b of ((modsSimData as { bases?: Array<{ en?: string; icon?: string | null }> }).bases ?? [])) add(b.en, b.icon)

/** Base ADIYLA BİREBİR eşleşen bundled ikon URL'si (yoksa null). Substring YOK. */
export function baseIconUrl(en: string | undefined | null): string | null {
  if (!en) return null
  const f = fileByName.get(norm(en))
  return f ? urlByFile[f] ?? null : null
}

const MAGIC_PREFIX = /^(greater|lesser|grand|giant|colossal|sacred|medium|large|small|flaring|perpetual)\s+/i

/**
 * Bir eşyanın bundled base ikonu (TAM eşleme). Sıra: name → önek-soyulmuş name → base.
 * Hiçbiri base DB'de BİREBİR yoksa null (çağıran CDN'e düşebilir veya "ikon yok" gösterir).
 */
export function resolveItemBaseIcon(item: { name?: string | null; base?: string | null }): string | null {
  const name = item.name || ''
  const base = item.base || ''
  return baseIconUrl(name) ?? baseIconUrl(name.replace(MAGIC_PREFIX, '')) ?? baseIconUrl(base)
}
