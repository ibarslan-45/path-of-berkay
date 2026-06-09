// PoB parse sonucunu bizim veriyle eşler: gem->gems.json, node->passive-tree.json,
// item taban->items.json. Eşleşmeyenler işaretlenir (uydurma yok).
import gemsData from '../../../data/gems.json'
import treeData from '../../../data/passive-tree.json'
import itemsData from '../../../data/items.json'
import type { PobBuild, PobGem, PobItem } from './pob'

function records<T>(d: unknown): T[] {
  const o = d as { records?: T[] }
  return o.records ?? (d as T[])
}

// ---------------- GEM eşleme ----------------
interface GemRec {
  id: string
  en: string
  tr: string
  color: string | null
  icon: string | null
}
const gems = records<GemRec>(gemsData)
const gemByEn = new Map<string, GemRec>()
const gemBySuffix = new Map<string, GemRec>()
function gemSuffix(id: string): string {
  return (id || '').replace(/^Metadata\/Items\/Gems?\//i, '')
}
for (const g of gems) {
  if (g.en && !gemByEn.has(g.en)) gemByEn.set(g.en, g)
  const s = gemSuffix(g.id)
  if (s && !gemBySuffix.has(s)) gemBySuffix.set(s, g)
}
const ROMAN = /\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/
function stripRoman(s: string): string {
  return s.replace(ROMAN, '').trim()
}

export interface MatchedGem extends PobGem {
  matched: boolean
  via: 'en' | 'en-roman' | 'gemId' | null
  tr: string | null
  icon: string | null
  color: string | null
}
export function matchGem(g: PobGem): MatchedGem {
  let rec = gemByEn.get(g.nameSpec)
  let via: MatchedGem['via'] = rec ? 'en' : null
  if (!rec) {
    const base = stripRoman(g.nameSpec)
    if (base !== g.nameSpec) {
      rec = gemByEn.get(base)
      if (rec) via = 'en-roman'
    }
  }
  if (!rec) {
    rec = gemBySuffix.get(gemSuffix(g.gemId))
    if (rec) via = 'gemId'
  }
  return {
    ...g,
    matched: !!rec,
    via: rec ? via : null,
    tr: rec?.tr ?? null,
    icon: rec?.icon ?? null,
    color: rec?.color ?? null
  }
}

// ---------------- PASİF eşleme (köprü: array[0] = GGG node id) ----------------
type TreeNode = [number, number, number, number, string, string | null]
// nodes JSON'da dizi; Object.entries ile "0","1"… anahtarlarıyla gezilir (labels de bu indeksle eşli).
const treeNodes = (treeData as unknown as { nodes: Record<string, TreeNode> }).nodes
const treeLabels = (treeData as { labels: Record<string, { en: string; tr: string }> }).labels
const byGGG = new Map<number, { key: string; arr: TreeNode }>()
for (const [key, arr] of Object.entries(treeNodes)) byGGG.set(arr[0], { key, arr })

export interface MatchedNode {
  id: number
  matched: boolean
  name: string | null
  internal: string | null
  statRef: string | null
  x: number | null
  y: number | null
  notable: boolean
}
export function matchNode(nodeId: number): MatchedNode {
  const e = byGGG.get(nodeId)
  if (!e) return { id: nodeId, matched: false, name: null, internal: null, statRef: null, x: null, y: null, notable: false }
  const label = treeLabels[e.key]
  const internal = e.arr[4] || null
  return {
    id: nodeId,
    matched: true,
    name: (label?.tr && label.tr !== label.en ? label.tr : label?.en) || internal,
    internal,
    statRef: e.arr[5] ?? null,
    x: e.arr[1],
    y: e.arr[2],
    notable: e.arr[3] >= 1
  }
}

// Node adı temizleyici: passive-tree.json bazı node'larda düzgün etiket yerine iç placeholder
// taşır ("tempint","damage","MasteryBlank"). CamelCase keystone'ları aç ("HollowPalmTechniqueKeystone"
// -> "Hollow Palm Technique"); anlamsız placeholder'ları ele (null döndür).
const NODE_JUNK = /^(tempint|damage|life|mana|small|dummy|blank|node|attribute|masteryblank|str|dex|int)$/i
export function niceNodeName(name: string | null): string | null {
  if (!name) return null
  if (NODE_JUNK.test(name)) return null
  if (!/[A-Z]/.test(name)) return null // tümü küçük-harf tek token -> placeholder say
  const s = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b(Keystone|Notable)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s || null
}

// ---------------- EŞYA eşleme (saf taban) ----------------
interface ItemRec {
  en: string
  tr: string
  item_class: string
  item_class_tr: string
  slot: string
  slot_tr: string
  icon: string | null
}
const items = records<ItemRec>(itemsData)
const itemByEn = new Map<string, ItemRec>()
for (const it of items) if (it.en && !itemByEn.has(it.en)) itemByEn.set(it.en, it)
// magic/normal adından saf tabanı çıkarmak için: uzun-önce taban adları
const baseNames = items.map((i) => i.en).filter(Boolean).sort((a, b) => b.length - a.length)

/** Magic/normal eşya adından saf taban türünü bul (items.json içinde geçen en uzun). */
function pureBase(it: PobItem): string {
  const r = (it.rarity || '').toUpperCase()
  if (r === 'RARE' || r === 'UNIQUE') return it.base
  // MAGIC/NORMAL: ad = "önek Taban sonek" -> içinde geçen en uzun taban adı
  for (const b of baseNames) {
    const re = new RegExp('(^|\\s)' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)')
    if (re.test(it.name)) return b
  }
  return it.base
}

export interface MatchedItem extends PobItem {
  pureBase: string
  matched: boolean
  itemTr: string | null
  itemClass: string | null
  slot: string | null
  icon: string | null
}
// explicitSlot: build.slots'tan gelen slot adı (Maxroll gibi base'i eşleşmeyenler için fallback).
export function matchItem(it: PobItem, explicitSlot?: string): MatchedItem {
  const base = pureBase(it)
  const rec = itemByEn.get(base)
  return {
    ...it,
    pureBase: base,
    matched: !!rec,
    itemTr: rec?.tr ?? null,
    itemClass: rec?.item_class ?? null,
    // taban items.json'da eşleştiyse onun slot'u; değilse build.slots'tan gelen (Maxroll)
    slot: rec?.slot ?? explicitSlot ?? null,
    icon: rec?.icon ?? null
  }
}

// ---------------- Toplu eşleme + rapor ----------------
export interface MatchReport {
  gems: { total: number; matched: number; unmatched: string[] }
  nodes: { total: number; matched: number; unmatched: number[] }
  items: { total: number; matched: number; unmatched: string[] }
}
export interface MatchedBuild {
  skillSets: { id: string; title: string; gems: MatchedGem[] }[]
  specs: { title: string; nodes: MatchedNode[] }[]
  items: MatchedItem[]
  report: MatchReport
}

export function matchBuild(b: PobBuild): MatchedBuild {
  const skillSets = b.skillSets.map((s) => ({
    id: s.id,
    title: s.title,
    gems: s.groups.flatMap((g) => g.gems).map(matchGem)
  }))
  const specs = b.specs.map((sp) => ({ title: sp.title, nodes: sp.nodes.map(matchNode) }))
  // itemId → slot adı (build.slots ters çevrilir; Maxroll'da base eşleşmese de slot bilinir)
  const slotByItemId = new Map<string, string>()
  for (const [slotName, itemId] of Object.entries(b.slots || {})) slotByItemId.set(itemId, slotName)
  const items = b.items.map((it) => matchItem(it, slotByItemId.get(it.id)))

  // Rapor: benzersiz gem/node/taban üzerinden
  const allGems = skillSets.flatMap((s) => s.gems)
  const uniqGem = new Map<string, MatchedGem>()
  for (const g of allGems) if (!uniqGem.has(g.nameSpec)) uniqGem.set(g.nameSpec, g)
  const gemVals = [...uniqGem.values()]

  const allNodes = specs.flatMap((s) => s.nodes)
  const uniqNode = new Map<number, MatchedNode>()
  for (const n of allNodes) if (!uniqNode.has(n.id)) uniqNode.set(n.id, n)
  const nodeVals = [...uniqNode.values()]

  return {
    skillSets,
    specs,
    items,
    report: {
      gems: {
        total: gemVals.length,
        matched: gemVals.filter((g) => g.matched).length,
        unmatched: gemVals.filter((g) => !g.matched).map((g) => g.nameSpec)
      },
      nodes: {
        total: nodeVals.length,
        matched: nodeVals.filter((n) => n.matched).length,
        unmatched: nodeVals.filter((n) => !n.matched).map((n) => n.id)
      },
      items: {
        total: items.length,
        matched: items.filter((i) => i.matched).length,
        unmatched: items.filter((i) => !i.matched).map((i) => i.pureBase || i.name)
      }
    }
  }
}
