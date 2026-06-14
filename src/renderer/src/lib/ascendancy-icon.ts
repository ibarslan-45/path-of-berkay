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

// --- #2: ascendancy adını TAHSİS EDİLEN AĞAÇ NODE'LARINDAN türet (Mobalytics reconstruction'da
// ascendClassName boş gelir; ama ascendancy node'ları ağaçta tahsisli → hangi ascendancy olduğu çıkarılır). ---
type CNode = [number, number, number, number, string | null, string | null]
interface AscInfo { id: string; en: string; classEn: string; cx: number; cy: number }
const TREE = treeData as unknown as { nodes: CNode[]; ascInfo: AscInfo[]; ascTip: Record<string, unknown> }
const nodePos = new Map<number, [number, number]>()
for (const n of TREE.nodes) nodePos.set(n[0], [n[1], n[2]])

/**
 * Tahsis edilen node id'lerinden (tüm aşamalar birleşik) ascendancy ADINI çıkar (ör. "Deadeye").
 * Yöntem: ascendancy node'larını (ascTip'te olanlar) sınıfın ascendancy merkezlerine (ascInfo) en yakınlık
 * oyuyla eşle; en çok oyu alan ascendancy. className verilirse o sınıfın ascendancy'leriyle sınırlanır.
 * Eşleşme yoksa null (UI sınıf emblemine düşer / "ikon yok").
 */
export function deriveAscendancyName(allocatedNodeIds: number[], className?: string | null): string | null {
  if (!allocatedNodeIds?.length) return null
  const cls = norm(className || '')
  const cands = TREE.ascInfo.filter((a) => (cls ? norm(a.classEn) === cls : true))
  if (!cands.length) return null
  const votes = new Map<string, number>()
  for (const id of allocatedNodeIds) {
    if (!TREE.ascTip[String(id)]) continue // yalnız ascendancy node'ları
    const pos = nodePos.get(id)
    if (!pos) continue
    let best: AscInfo | null = null
    let bd = Infinity
    for (const a of cands) {
      const d = (a.cx - pos[0]) ** 2 + (a.cy - pos[1]) ** 2
      if (d < bd) { bd = d; best = a }
    }
    if (best) votes.set(best.en, (votes.get(best.en) ?? 0) + 1)
  }
  let top: string | null = null
  let tc = 0
  for (const [en, c] of votes) if (c > tc) { tc = c; top = en }
  return top
}
