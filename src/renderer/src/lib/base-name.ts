// base-name.ts — TEK MERKEZİ eşya base ADI çözümleyici (saf, ağsız, glob YOK → test edilebilir).
//
// item-icon.ts (ikon) ve build-craft-seed.ts (craft) AYNI kaynağı + AYNI sırayı kullansın diye ayrıldı.
// KAYNAK: base_items (items.json, kanonik base DB) + craft base'leri (mods_sim.json — flask/charm dahil).
// KURAL: TAM (exact) eşleme — substring YOK → "Bow" SINIF adı bir crossbow base'ine ("...Crossbow" içinde
// "bow" geçer) YANLIŞLIKLA çözülmez. Mobalytics reconstruction'da gerçek base eşyanın `name` alanındadır
// (base = yalnız SINIF: "Bow"/"Ring"); bu yüzden ÖNCE name, sonra önek-soyulmuş name, sonra base denenir.
import itemsData from '../../../data/items.json'
import modsSimData from '../../../data/mods_sim.json'

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// normalize edilmiş base adı → KANONİK (orijinal yazımlı) base adı.
const canonByName = new Map<string, string>()
function add(en: string | undefined | null): void {
  if (!en) return
  const k = norm(en)
  if (k && !canonByName.has(k)) canonByName.set(k, en)
}
for (const r of itemsData as Array<{ en?: string }>) add(r.en)
for (const b of ((modsSimData as { bases?: Array<{ en?: string }> }).bases ?? [])) add(b.en)

// sihirli/kalite önek gürültüsü (base adında değil ama Mobalytics/clipboard name'inde olabilir)
const MAGIC_PREFIX = /^(greater|lesser|grand|giant|colossal|sacred|medium|large|small|flaring|perpetual)\s+/i

/** base adından KANONİK (DB yazımlı) base adı (TAM eşleme, substring YOK). Yoksa null. */
export function canonicalBaseName(en: string | undefined | null): string | null {
  if (!en) return null
  return canonByName.get(norm(en)) ?? null
}

/**
 * Eşyanın GERÇEK base adı (kanonik). Sıra: name → önek-soyulmuş name → base. Eşleşme TAM.
 * Hiçbiri base DB'de yoksa null (çağıran fallback uygular veya "ikon/eşleşme yok" gösterir).
 */
export function resolveBaseName(item: { name?: string | null; base?: string | null }): string | null {
  const name = item.name || ''
  const base = item.base || ''
  return canonicalBaseName(name) ?? canonicalBaseName(name.replace(MAGIC_PREFIX, '')) ?? canonicalBaseName(base)
}
