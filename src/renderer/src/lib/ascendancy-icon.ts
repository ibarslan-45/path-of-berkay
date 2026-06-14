// ascendancy-icon.ts — ascendancy/sınıf ADINDAN doğru emblem görselini çözer (build görünümü).
// Eşleştirme veri-tabanlı: ascendancies.json `en` adı → `icon` dosyası → bundled glob URL.
// Eşleşme yoksa null döner (UI "ikon yok" gösterir; YANLIŞ görsel KOYMAZ — #1/#2).
import ascData from '../../../data/ascendancies.json'
import treeData from '../../../data/passive-tree.json'

interface AscRec {
  en: string
  type: 'class' | 'ascendancy'
  parent_class: string | null
  icon: string | null
  nodes?: Array<{ name_en?: string }>
}
const recs = ascData as AscRec[]

// assets/ascendancies/*.png → dosya adı → URL
const mods = import.meta.glob('../../assets/ascendancies/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const urlByFile: Record<string, string> = {}
for (const p in mods) urlByFile[(p.split('/').pop() as string).toLowerCase()] = mods[p]

function iconUrlFor(rec: AscRec | undefined): string | null {
  if (!rec || !rec.icon) return null
  return urlByFile[(rec.icon.split('/').pop() as string).toLowerCase()] ?? null
}

function norm(s: string): string {
  return (s || '').trim().toLowerCase()
}

/** Ascendancy ADI (ör. "Deadeye") → emblem URL. Eşleşme yoksa null. */
export function ascendancyIconUrl(ascName: string | null | undefined): string | null {
  if (!ascName) return null
  const n = norm(ascName)
  const rec = recs.find((r) => r.type === 'ascendancy' && norm(r.en) === n)
  return iconUrlFor(rec)
}

/** Sınıf ADI (ör. "Ranger") → sınıf emblemi URL. Eşleşme yoksa null. */
export function classIconUrl(className: string | null | undefined): string | null {
  if (!className) return null
  const n = norm(className)
  const rec = recs.find((r) => r.type === 'class' && norm(r.en) === n)
  return iconUrlFor(rec)
}

/** En iyi emblem: ascendancy seçilmişse onun emblemi, yoksa sınıf emblemi (yoksa null). */
export function buildEmblemUrl(className: string | null | undefined, ascName: string | null | undefined): string | null {
  return ascendancyIconUrl(ascName) ?? classIconUrl(className)
}

// --- #2: ascendancy adını TAHSİS EDİLEN AĞAÇ NODE'LARININ ADLARINDAN türet (Mobalytics reconstruction'da
// ascendClassName boş gelir). AÇIK eşleme: (1) ascendancy BAŞLANGIÇ node'unun adı = ascendancy adıdır
// (ör. "Deadeye") → doğrudan; (2) yoksa her ascendancy node ADINI ait olduğu ascendancy'ye eşleyen tablo +
// çoğunluk oyu. className'e BAĞIMSIZ (centroid/merkez yöntemi yanlış seçiyordu → kaldırıldı). ---
const TREE = treeData as unknown as { ascTip: Record<string, { en?: string } | undefined> }

// ascendancy adı (lowercased) → kanonik en  (AÇIK tablo: Deadeye, Pathfinder, …)
const ASC_NAMES = new Map<string, string>()
// ascendancy NODE adı (lowercased) → ascendancy en  (her ascendancy'nin kendi node adları)
const NODE_NAME_TO_ASC = new Map<string, string>()
// aynı node adı birden çok ascendancy'de varsa (ör. "Skill Speed") AMBİGÜ işaretle → oydan çıkar
const AMBIGUOUS = new Set<string>()
for (const r of recs) {
  if (r.type !== 'ascendancy') continue
  ASC_NAMES.set(norm(r.en), r.en)
  for (const nd of r.nodes ?? []) {
    const nn = norm(nd.name_en || '')
    if (!nn) continue
    const cur = NODE_NAME_TO_ASC.get(nn)
    if (cur && cur !== r.en) AMBIGUOUS.add(nn)
    else NODE_NAME_TO_ASC.set(nn, r.en)
  }
}

/**
 * Tahsis edilen node id'lerinden (tüm aşamalar birleşik) ascendancy ADINI çıkar (ör. "Deadeye").
 * className parametresi GERİ UYUM için tutulur ama KULLANILMAZ (eşleme yalnız node adlarına dayanır).
 * Eşleşme yoksa null (UI sınıf emblemine düşer / "ikon yok").
 */
export function deriveAscendancyName(allocatedNodeIds: number[], _className?: string | null): string | null {
  if (!allocatedNodeIds?.length) return null
  const votes = new Map<string, number>()
  for (const id of allocatedNodeIds) {
    const tip = TREE.ascTip[String(id)]
    if (!tip || !tip.en) continue
    const nm = norm(tip.en)
    // (1) başlangıç node'u: adı doğrudan bir ascendancy adı → kesin sonuç
    const direct = ASC_NAMES.get(nm)
    if (direct) return direct
    // (2) ascendancy node adı → ait olduğu ascendancy (ambigü adlar oya girmez)
    if (AMBIGUOUS.has(nm)) continue
    const asc = NODE_NAME_TO_ASC.get(nm)
    if (asc) votes.set(asc, (votes.get(asc) ?? 0) + 1)
  }
  let top: string | null = null
  let tc = 0
  for (const [en, c] of votes) if (c > tc) { tc = c; top = en }
  return top
}
