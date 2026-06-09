/**
 * build-atlas-tree.ts
 * ----------------------------------------------------------------------------
 * İnteraktif görsel ATLAS pasif ağacı için KOMPAKT yerleşim -> atlas-tree.json.
 * Kaynak: passive_skill_trees/Atlas.json (RePoE). Kampanya passive-tree.json ile
 * AYNI kompakt format: nodes [skill,x,y,typeCode,iconBase,pid], edges, bounds.
 *
 * KONUM: kampanyadaki gibi hazır x/y YOK; orbital sistemden hesaplanır:
 *   node = group(x,y) + orbit_radii[radius] yarıçapında, açı = 2π·pos_cw/skills_per_orbit[radius]
 *   (saat yönünde, tepeden). groups[].passives[] hash + radius + position_clockwise + connections.
 *
 * pid: atlas.json atlas_node kaydı (id 'atlasnode_<hash>') -> tooltip EN/TR (çeviri
 *  TEKRAR ÜRETİLMEZ). Kaydı olmayan node (root/jewel/icon-only) -> labels[skill].
 *
 * typeCode: 0 small,1 notable,2 keystone,3 jewel,5 root
 *
 * Çalıştırma:  npm run build:atlas-tree
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ATLAS_TREE_URL = 'https://repoe-fork.github.io/poe2/passive_skill_trees/Atlas.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

interface AtlasPassive {
  hash: number
  id: string
  name?: string
  icon?: string
  is_atlas_root?: boolean
  is_keystone?: boolean
  is_notable?: boolean
  is_jewel_socket?: boolean
}
interface GroupPassive {
  hash: number
  radius: number
  position_clockwise: number
  connections?: number[]
}
interface AtlasGroup {
  x: number
  y: number
  passives: GroupPassive[]
}
interface RawAtlas {
  groups: Record<string, AtlasGroup>
  passives: Record<string, AtlasPassive>
  orbit_radii: number[]
  skills_per_orbit: number[]
  roots: number[]
}

function iconBase(p: AtlasPassive): string | null {
  if (!p.icon) return null
  return p.icon.split('/').pop()!.replace(/\.dds$/i, '')
}
function typeCode(p: AtlasPassive): number {
  if (p.is_atlas_root) return 5
  if (p.is_keystone) return 2
  if (p.is_jewel_socket) return 3
  if (p.is_notable) return 1
  return 0
}

async function main(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const projectRoot = join(__dirname, '..')

  // atlas.json: hangi hash'ler için tooltip kaydı (atlasnode_<hash>) var?
  const atlasRecs = JSON.parse(
    readFileSync(join(projectRoot, 'src', 'data', 'atlas.json'), 'utf-8')
  ) as Array<{ id: string; subtype: string }>
  const recIds = new Set(atlasRecs.filter((r) => r.subtype === 'atlas_node').map((r) => r.id))

  console.log('İndiriliyor: Atlas.json')
  const A = (await (await fetch(ATLAS_TREE_URL)).json()) as RawAtlas

  // hash -> hesaplanan konum (groups orbital sistemden)
  const posByHash = new Map<number, { x: number; y: number }>()
  const connByHash = new Map<number, number[]>()
  for (const gid of Object.keys(A.groups)) {
    const g = A.groups[gid]
    for (const gp of g.passives ?? []) {
      const r = A.orbit_radii[gp.radius] ?? 0
      const n = A.skills_per_orbit[gp.radius] ?? 1
      const ang = n > 0 ? (2 * Math.PI * gp.position_clockwise) / n : 0
      const x = g.x + r * Math.sin(ang)
      const y = g.y - r * Math.cos(ang)
      posByHash.set(gp.hash, { x: Math.round(x), y: Math.round(y) })
      if (gp.connections && gp.connections.length) connByHash.set(gp.hash, gp.connections)
    }
  }

  // node listesi: konumu olan tüm passive'ler
  const outNodes: Array<[number, number, number, number, string | null, string | null]> = []
  const labels: Record<string, { en: string; tr: string }> = {}
  const rendered = new Set<number>()
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
  let missingPos = 0

  for (const key of Object.keys(A.passives)) {
    const p = A.passives[key]
    const pos = posByHash.get(p.hash)
    if (!pos) { missingPos++; continue }
    rendered.add(p.hash)
    const recId = 'atlasnode_' + p.hash
    const pid = recIds.has(recId) ? recId : null
    outNodes.push([p.hash, pos.x, pos.y, typeCode(p), iconBase(p), pid])
    if (!pid) {
      const en = (p.name ?? '').trim()
      labels[String(p.hash)] = { en: en || '(Atlas)', tr: en || '(Atlas)' }
    }
    minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x)
    minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y)
  }

  // edges: connections (iki ucu da render edilen)
  const outEdges: Array<[number, number]> = []
  const seenE = new Set<string>()
  for (const [h, conns] of connByHash) {
    if (!rendered.has(h)) continue
    for (const c of conns) {
      if (!rendered.has(c)) continue
      const ek = h < c ? h + '-' + c : c + '-' + h
      if (seenE.has(ek)) continue
      seenE.add(ek)
      outEdges.push([h, c])
    }
  }

  const out = {
    tree: 'poe2-atlas-tree',
    game_version: GAME_VERSION,
    league: LEAGUE,
    source: SOURCE_NAME,
    bounds: [minX, minY, maxX, maxY].map(Math.round),
    roots: A.roots ?? [],
    nodes: outNodes,
    edges: outEdges,
    labels
  }

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'atlas-tree.json')
  writeFileSync(outPath, JSON.stringify(out), 'utf-8')

  const byType: Record<number, number> = {}
  for (const r of outNodes) byType[r[3]] = (byType[r[3]] ?? 0) + 1
  const tn: Record<number, string> = { 0: 'small', 1: 'notable', 2: 'keystone', 3: 'jewel', 5: 'root' }
  const withPid = outNodes.filter((r) => r[5]).length
  console.log('')
  console.log(`Yazıldı: ${outNodes.length} node, ${outEdges.length} edge -> ${outPath}`)
  console.log('  tip: ' + Object.entries(byType).map(([k, v]) => `${tn[Number(k)]}:${v}`).join(', '))
  console.log(`  tooltip kaydı (pid) olan: ${withPid}, label fallback: ${outNodes.length - withPid}`)
  console.log(`  konumu bulunamayan passive: ${missingPos}`)
  console.log('  bounds: ' + JSON.stringify(out.bounds) + ' | roots: ' + (A.roots ?? []).length)
}

main().catch((err) => { console.error('Hata:', err); process.exit(1) })
