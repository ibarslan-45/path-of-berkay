/**
 * build-passive-tree.ts
 * ----------------------------------------------------------------------------
 * İnteraktif görsel pasif ağaç için KOMPAKT yerleşim verisi -> passive-tree.json.
 * Kaynak: GGG poe2-skilltree-export data.json (her node'da hazır x/y + out/in,
 *  edges[], groups[], classes[]).
 *
 * İÇERİK:
 *  - Ana sınıf ağacı node'ları (4434) + edges (5340).
 *  - PoE 2 ASCENDANCY küme node'ları (kendi uzak konumlarında) + ascendancy edges.
 *    Tooltip metni ascendancies.json'dan (çeviri TEKRAR ÜRETİLMEZ) -> ascTip.
 *  - classStarts: 8 PoE 2 sınıfı + start koordinatı + sınıf portre base'i (img).
 *  - ascInfo: PoE 2 ascendancy navigasyonu (id, ad EN/TR, sınıf, merkez x/y).
 *
 * typeCode: 0 small,1 notable,2 keystone,3 jewel,4 mastery,5 classStart,6 ascStart
 *
 * pid: ana ağaç node'u için passives.json kaydı (tooltip EN/TR). Ascendancy node'u
 *  için pid yok -> ascTip[skill] kullanılır. Mastery/start -> labels[skill].
 *
 * PoE 2 SINIF KURALI: PoE 1 başlangıç/ascendancy adları (Marauder/Duelist/Shadow/
 *  Templar) KULLANICIYA GÖSTERİLMEZ; yalnız 8 PoE 2 sınıfı + onların yükselişleri.
 *
 * Çalıştırma:  npm run build:passive-tree
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const TREE_URL = 'https://raw.githubusercontent.com/grindinggear/poe2-skilltree-export/master/data.json'

interface TreeNode {
  id?: string
  skill?: number
  name?: string
  icon?: string
  stats?: string[]
  isKeystone?: boolean
  isNotable?: boolean
  isJewelSocket?: boolean
  isMastery?: boolean
  isAscendancyStart?: boolean
  ascendancyId?: string
  classStartIndex?: number[] | null
  x?: number
  y?: number
}
interface AscClass { id: string; name: string }
interface RawTree {
  nodes: Record<string, TreeNode>
  edges: Array<{ from: string | number; to: string | number }>
  classes: Array<{ name: string; image?: string; ascendancies?: AscClass[] }>
  min_x: number
  min_y: number
  max_x: number
  max_y: number
}

// 8 PoE 2 oynanabilir sınıf. tr Ascendancy katmanıyla uyumlu (Druid karşılık yok).
const POE2_CLASSES: Array<{ idx: number; en: string; tr: string; img: string }> = [
  { idx: 6, en: 'Warrior', tr: 'Savaşçı', img: 'warrior' },
  { idx: 2, en: 'Ranger', tr: 'Okçu', img: 'ranger' },
  { idx: 8, en: 'Huntress', tr: 'Avcı Kadın', img: 'huntress' },
  { idx: 1, en: 'Witch', tr: 'Cadı', img: 'witch' },
  { idx: 7, en: 'Sorceress', tr: 'Büyücü', img: 'sorceress' },
  { idx: 9, en: 'Mercenary', tr: 'Paralı Asker', img: 'mercenary' },
  { idx: 10, en: 'Monk', tr: 'Keşiş', img: 'monk' },
  { idx: 11, en: 'Druid', tr: 'Druid', img: 'druid' }
]
const POE2_SET = new Set(POE2_CLASSES.map((c) => c.en))
const CLASS_TR = new Map(POE2_CLASSES.map((c) => [c.en, c.tr]))
// ascendancyId -> taban sınıf adı: 'Witch3b' -> 'Witch'
function ascParent(ascId: string): string {
  return ascId.replace(/[0-9].*$/, '')
}

function cleanLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split('|')
    return parts.length > 1 ? parts[1] : parts[0]
  })
}
function splitStats(stats: string[] | undefined): string[] {
  return (stats ?? []).flatMap((s) => cleanLinks(s).split('\n')).map((s) => s.trim()).filter(Boolean)
}
function typeCode(n: TreeNode): number {
  if (n.isAscendancyStart) return 6
  if (n.isMastery) return 4
  if (n.isKeystone) return 2
  if (n.isJewelSocket) return 3
  if (n.isNotable) return 1
  return 0
}
function iconBase(n: TreeNode): string | null {
  if (!n.icon) return null
  return n.icon.split('/').pop()!.replace(/\.png$/i, '')
}

async function main(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const projectRoot = join(__dirname, '..')

  // ascendancies.json: çeviri kaynağı (node name_en/name_tr/stat_en/stat_tr)
  const ascData = JSON.parse(
    readFileSync(join(projectRoot, 'src', 'data', 'ascendancies.json'), 'utf-8')
  ) as Array<{
    id: string
    en: string
    tr: string
    type: string
    parent_class: string | null
    nodes?: Array<{ name_en: string; name_tr: string; stat_en: string; stat_tr: string; notable?: boolean }>
  }>
  // asc kayıt id (asc_warrior1) -> { en, tr, byName: Map name_en -> {tr,statEn,statTr} }
  const ascRecords = new Map<string, { en: string; tr: string; byName: Map<string, { tr: string; se: string; st: string }> }>()
  for (const r of ascData) {
    if (r.type === 'class') continue
    const byName = new Map<string, { tr: string; se: string; st: string }>()
    for (const nd of r.nodes ?? []) byName.set(nd.name_en, { tr: nd.name_tr, se: nd.stat_en, st: nd.stat_tr })
    ascRecords.set(r.id, { en: r.en, tr: r.tr, byName })
  }

  console.log('İndiriliyor: GGG data.json')
  const tree = (await (await fetch(TREE_URL)).json()) as RawTree
  const nodes = tree.nodes

  // export ascendancyId -> görünen ad (classes[].ascendancies)
  const ascName = new Map<string, string>()
  for (const c of tree.classes) for (const a of c.ascendancies ?? []) if (a.name) ascName.set(a.id, a.name)

  // --- build-passives ile AYNI dedup: key -> rep.id (ilk gelen kazanır) ---
  const dedupRep = new Map<string, string>()
  function dedupKey(n: TreeNode): string | null {
    if (!n || n.ascendancyId || n.isAscendancyStart) return null
    if (n.classStartIndex != null) return null
    const hasStats = n.stats && n.stats.length
    if (!hasStats && !n.isJewelSocket) return null
    return (n.name ?? '') + '||' + splitStats(n.stats).join('\n')
  }
  for (const n of Object.values(nodes)) {
    const k = dedupKey(n)
    if (k == null) continue
    if (!dedupRep.has(k)) dedupRep.set(k, n.id ?? '')
  }

  // --- başlangıç node'larını classStartIndex'e göre bul ---
  const startByClassIdx = new Map<number, { skill: number; x: number; y: number }>()
  for (const [key, n] of Object.entries(nodes)) {
    if (n.classStartIndex == null) continue
    const skill = Number(key)
    for (const ci of n.classStartIndex) startByClassIdx.set(ci, { skill, x: n.x ?? 0, y: n.y ?? 0 })
  }
  const classStarts = POE2_CLASSES.map((c) => {
    const s = startByClassIdx.get(c.idx)
    return {
      en: c.en, tr: c.tr, img: c.img,
      skill: s ? s.skill : -1, x: s ? Math.round(s.x) : 0, y: s ? Math.round(s.y) : 0
    }
  })
  // start node etiketi (PoE 2 sınıf adlarıyla; PoE 1 node adı GİZLİ)
  const startLabels = new Map<number, { en: string[]; tr: string[] }>()
  for (const c of POE2_CLASSES) {
    const s = startByClassIdx.get(c.idx)
    if (!s) continue
    const e = startLabels.get(s.skill) ?? { en: [], tr: [] }
    e.en.push(c.en); e.tr.push(c.tr)
    startLabels.set(s.skill, e)
  }

  // --- node kümesi: ana ağaç + start + PoE 2 ascendancy ---
  const rendered = new Set<number>()
  // node = [skill, x, y, typeCode, iconBase, pid(tooltip dedup), gggId(node.id — .build/eksiksiz id)]
  const outNodes: Array<[number, number, number, number, string | null, string | null, string | null]> = []
  const labels: Record<string, { en: string; tr: string }> = {}
  const ascTip: Record<string, { en: string; tr: string; se: string[]; st: string[] }> = {}
  // ascendancy küme merkezleri (navigasyon)
  const ascAgg = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>()

  for (const [key, n] of Object.entries(nodes)) {
    if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') continue
    const skill = Number(key)

    // --- ASCENDANCY node'ları (yalnız PoE 2 sınıfları) ---
    if (n.ascendancyId) {
      if (!POE2_SET.has(ascParent(n.ascendancyId))) continue
      rendered.add(skill)
      outNodes.push([skill, Math.round(n.x), Math.round(n.y), typeCode(n), iconBase(n), null, n.id ?? null])
      // tooltip metni
      const recId = 'asc_' + n.ascendancyId.toLowerCase()
      const rec = ascRecords.get(recId)
      const dispName = n.isAscendancyStart
        ? (rec ? rec.en : ascName.get(n.ascendancyId) ?? n.name ?? '')
        : (n.name ?? '')
      const dispTr = n.isAscendancyStart
        ? (rec ? rec.tr : dispName)
        : (rec?.byName.get(n.name ?? '')?.tr || dispName)
      const se = splitStats(n.stats)
      let st = se
      if (!n.isAscendancyStart && rec) {
        const hit = rec.byName.get(n.name ?? '')
        if (hit && hit.st) st = [hit.st]
      }
      ascTip[String(skill)] = { en: dispName, tr: dispTr, se, st }
      // küme merkezi
      const ag = ascAgg.get(n.ascendancyId) ?? { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 }
      ag.minX = Math.min(ag.minX, n.x); ag.maxX = Math.max(ag.maxX, n.x)
      ag.minY = Math.min(ag.minY, n.y); ag.maxY = Math.max(ag.maxY, n.y)
      ascAgg.set(n.ascendancyId, ag)
      continue
    }

    // --- sınıf başlangıcı ---
    if (n.classStartIndex != null) {
      const lbl = startLabels.get(skill)
      if (!lbl) continue
      rendered.add(skill)
      outNodes.push([skill, Math.round(n.x), Math.round(n.y), 5, iconBase(n), null, n.id ?? null])
      labels[String(skill)] = { en: lbl.en.join(' / '), tr: lbl.tr.join(' / ') }
      continue
    }

    // --- ana ağaç node'u ---
    rendered.add(skill)
    const k = dedupKey(n)
    const pid = k != null ? dedupRep.get(k) ?? null : null
    outNodes.push([skill, Math.round(n.x), Math.round(n.y), typeCode(n), iconBase(n), pid, n.id ?? null])
    if (!pid) {
      const en = (n.name ?? '').trim()
      if (en) labels[String(skill)] = { en, tr: en }
    }
  }

  // ascInfo (PoE 2 ascendancy navigasyonu)
  const ascInfo = [...ascAgg.entries()].map(([id, ag]) => {
    const recId = 'asc_' + id.toLowerCase()
    const rec = ascRecords.get(recId)
    const cls = ascParent(id)
    return {
      id,
      en: rec ? rec.en : ascName.get(id) ?? id,
      tr: rec ? rec.tr : ascName.get(id) ?? id,
      classEn: cls,
      classTr: CLASS_TR.get(cls) ?? cls,
      cx: Math.round((ag.minX + ag.maxX) / 2),
      cy: Math.round((ag.minY + ag.maxY) / 2)
    }
  }).sort((a, b) => a.classEn.localeCompare(b.classEn) || a.en.localeCompare(b.en))

  // --- edges: iki ucu da render edilen node olanlar ---
  const outEdges: Array<[number, number]> = []
  const seenE = new Set<string>()
  for (const e of tree.edges) {
    if (e.from === 'root' || e.to === 'root') continue
    const f = Number(e.from), t = Number(e.to)
    if (!rendered.has(f) || !rendered.has(t)) continue
    const ek = f < t ? f + '-' + t : t + '-' + f
    if (seenE.has(ek)) continue
    seenE.add(ek)
    outEdges.push([f, t])
  }

  const out = {
    tree: 'poe2-passive-tree',
    game_version: '0.5.0',
    league: 'The Runes of Aldur',
    source: 'grindinggear/poe2-skilltree-export',
    bounds: [tree.min_x, tree.min_y, tree.max_x, tree.max_y].map(Math.round),
    classStarts,
    ascInfo,
    nodes: outNodes,
    edges: outEdges,
    labels,
    ascTip
  }

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'passive-tree.json')
  writeFileSync(outPath, JSON.stringify(out), 'utf-8')

  // --- özet ---
  const byType: Record<number, number> = {}
  for (const r of outNodes) byType[r[3]] = (byType[r[3]] ?? 0) + 1
  const tn = ['small', 'notable', 'keystone', 'jewel', 'mastery', 'classStart', 'ascStart']
  console.log('')
  console.log(`Yazıldı: ${outNodes.length} node, ${outEdges.length} edge -> ${outPath}`)
  console.log('  tip: ' + Object.entries(byType).map(([k, v]) => `${tn[Number(k)]}:${v}`).join(', '))
  console.log('  ascendancy node (PoE 2): ' + Object.keys(ascTip).length + ' | ascInfo: ' + ascInfo.length)
  const withGggId = outNodes.filter((r) => r[6]).length
  console.log(`  gggId (node.id) DOLU: ${withGggId}/${outNodes.length}  (.build + ağaç kapsaması)`)
  console.log('  classStarts: ' + classStarts.map((c) => c.en).join(', '))
  console.log('  bounds: ' + JSON.stringify(out.bounds))
}

main().catch((err) => { console.error('Hata:', err); process.exit(1) })
