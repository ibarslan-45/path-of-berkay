// build-progress.ts — "elde ettim" işaretleme modeli (Part 2).
//
// İçe aktarılmış build'de kullanıcının NEYİ elde ettiğini işaretleyebilmesi için KARARLI id'ler üretir:
//   - her gear slotu (slot)
//   - o slottaki her stat/mod (mod)
//   - her aktif gem ve her support gem (gem)
//   - her pasif node (node) — kayda değer (named) node'lar öne çıkar
//
// İlerleme `id -> true` haritası olarak userData'da saklanır (build:progress-get/set). id'ler
// build-imzası (buildSig) ile öneklenir → FARKLI build'lerin işaretleri çakışmaz; AYNI build tekrar
// içe aktarılınca id'ler aynı kalır (ilerleme geri gelir). Bu modül saf + test edilebilir (ağsız).
import type { PobBuild, PobItem } from './pob'

// kararlı kısa hash (djb2) — id'ler restart sonrası aynı kalsın
export function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Build'i (içerik kabaca) özetleyen kararlı imza — id öneki + ilerleme dosyası anahtarı. */
export function buildSig(b: PobBuild | null): string {
  if (!b) return ''
  const itemSig = b.items.map((i) => i.id).join(',')
  const specSig = b.specs.map((s) => s.nodes.length).join('.')
  return hashStr(`${b.className}|${b.ascendClassName}|${itemSig}|${specSig}`)
}

// --- tek tek eleman id'leri (GameBuildView inline kullanır) ---
export function slotProgressId(sig: string, slot: string): string {
  return `sl_${sig}_${hashStr(slot)}`
}
export function modProgressId(sig: string, slot: string, index: number, text: string): string {
  return `md_${sig}_${hashStr(slot + '#' + index + '#' + text)}`
}
export function gemProgressId(sig: string, name: string, support: boolean): string {
  return `gm_${sig}_${support ? 's' : 'a'}_${hashStr(name)}`
}
export function nodeProgressId(sig: string, nodeId: number): string {
  return `nd_${sig}_${nodeId}`
}

export interface ProgressCheck {
  id: string
  label: string
}
export interface ProgressSection {
  key: 'slots' | 'mods' | 'gems' | 'nodes'
  labelEn: string
  labelTr: string
  checks: ProgressCheck[]
}
export interface ProgressModel {
  sig: string
  sections: ProgressSection[]
  total: number
}

const NON_GEAR = /flask|jewel|socket|swap/i

/**
 * Seçili aşamanın (stageIdx) tüm işaretlenebilir elemanlarını sayım/özet için topla.
 * GameBuildView inline id helper'larını kullanır; bu fonksiyon ROLLUP/özet (kaç tamamlandı) içindir.
 */
export function enumerateProgress(build: PobBuild | null, stageIdx = 0): ProgressModel {
  const sig = buildSig(build)
  const sections: ProgressSection[] = [
    { key: 'slots', labelEn: 'Gear', labelTr: 'Ekipman', checks: [] },
    { key: 'mods', labelEn: 'Mods', labelTr: 'Modlar', checks: [] },
    { key: 'gems', labelEn: 'Gems', labelTr: 'Gemler', checks: [] },
    { key: 'nodes', labelEn: 'Passive nodes', labelTr: 'Pasif node’lar', checks: [] }
  ]
  if (!build) return { sig, sections, total: 0 }

  // seçili aşamanın slot/gem'leri (Mobalytics: variant-başına; aksi tek set)
  const slots = build.stageSlots?.[stageIdx] ?? build.slots ?? {}
  const itemById = new Map(build.items.map((it) => [it.id, it]))

  // GEAR slotları + her mod
  for (const [slot, id] of Object.entries(slots)) {
    if (NON_GEAR.test(slot)) continue
    const item = itemById.get(id)
    if (!item) continue
    sections[0].checks.push({ id: slotProgressId(sig, slot), label: `${slot}: ${item.name || item.base}` })
    item.mods.forEach((m, i) => {
      sections[1].checks.push({ id: modProgressId(sig, slot, i, m), label: m })
    })
  }

  // GEM + support (seçili aşama)
  const ss = build.skillSets[Math.min(stageIdx, Math.max(0, build.skillSets.length - 1))]
  const seenGem = new Set<string>()
  for (const grp of ss?.groups ?? []) {
    for (const g of grp.gems) {
      if (!g.nameSpec) continue
      const key = (g.support ? 's:' : 'a:') + g.nameSpec
      if (seenGem.has(key)) continue
      seenGem.add(key)
      sections[2].checks.push({ id: gemProgressId(sig, g.nameSpec, g.support), label: g.nameSpec })
    }
  }

  // PASİF node'lar (seçili aşamanın spec'i; başlık eşleşmesi → index → en çok node'lu)
  const nodes = specNodesForStage(build, stageIdx)
  for (const n of nodes) sections[3].checks.push({ id: nodeProgressId(sig, n), label: '#' + n })

  const total = sections.reduce((a, s) => a + s.checks.length, 0)
  return { sig, sections, total }
}

/** Aşama → spec node listesi (BuildView/GameBuildView ile aynı eşleme mantığı). */
export function specNodesForStage(build: PobBuild, stageIdx: number): number[] {
  const specs = build.specs ?? []
  if (!specs.length) return []
  const title = build.skillSets[stageIdx]?.title
  const spec =
    (title ? specs.find((s) => s.title === title) : undefined) ??
    specs[Math.min(stageIdx, specs.length - 1)] ??
    specs.reduce((a, b) => (b.nodes.length > a.nodes.length ? b : a))
  return spec?.nodes ?? []
}

/** Tamamlanma özeti: verilen ilerleme haritasına göre kaç / toplam. */
export function progressStats(
  model: ProgressModel,
  progress: Record<string, boolean>
): { done: number; total: number; perSection: Record<string, { done: number; total: number }> } {
  let done = 0
  const perSection: Record<string, { done: number; total: number }> = {}
  for (const s of model.sections) {
    let sd = 0
    for (const c of s.checks) if (progress[c.id]) sd++
    perSection[s.key] = { done: sd, total: s.checks.length }
    done += sd
  }
  return { done, total: model.total, perSection }
}

/** Bir slotun tüm mod id'leri (slot başlığı işaretlenince hepsini birlikte işaretlemek için). */
export function slotModIds(sig: string, slot: string, item: PobItem | null): string[] {
  if (!item) return []
  return item.mods.map((m, i) => modProgressId(sig, slot, i, m))
}
