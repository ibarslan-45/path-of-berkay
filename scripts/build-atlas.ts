/**
 * build-atlas.ts
 * ----------------------------------------------------------------------------
 * ENDGAME / ATLAS kategorisi -> src/data/atlas.json. Dört alt-tip, tek sekme:
 *   1) waystone   : base_items.json item_class "Map" (16 tier, T1-T16).
 *   2) atlas_node : passive_skill_trees/Atlas.json (523 node — LİSTE; görsel ağaç
 *                   sonraki adım). Tip (keystone/notable/small) + stat metni.
 *   3) tablet     : base_items.json item_class "TowerAugmentation" (8 Precursor
 *                   Tablet). Implicit metni mods.json'dan.
 *   4) pinnacle_key: SADECE 11 temiz PoE2 boss anahtarı (legacy PoE1 MapFragment
 *                    parçaları DIŞLANIR).
 *
 * Çalıştırma:  npm run build:atlas
 *
 * ÇEVİRİ (proje talimatları + mevcut desen): eşleşme anahtarı EN. Küçük setler (waystone
 *  kodda; tablet/pinnacle ad+desc tr-atlas-glossary elle). Atlas node statları
 *  mods+passives+ascendancy+atlas glossary ile compositional (build-passives
 *  translateLine motoru), benzersiz satır cache'lenir. needs-translation 0.
 * İKON: waystone/tablet/pinnacle RePoE PNG -> assets/atlas/. Atlas node ikonları
 *  extracted'tan ayrı script üretir (produce-atlas-icons.cjs).
 * areas.json ile ÇAKIŞMAZ: burada item/mekanik/pasif-node var; zonlar areas'ta.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// --- Sabitler ------------------------------------------------------------
const SOURCE_BASE = 'https://repoe-fork.github.io/poe2/'
const BASE_ITEMS_URL = SOURCE_BASE + 'base_items.json'
const MODS_URL = SOURCE_BASE + 'mods.json'
const ATLAS_TREE_URL = SOURCE_BASE + 'passive_skill_trees/Atlas.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

const ICON_CONCURRENCY = 16
const ICON_RETRIES = 2

// SADECE bu 11 pinnacle anahtarı (metadata id -> mekanik). Legacy PoE1 DIŞARIDA.
const PINNACLE_KEYS: Record<string, string> = {
  'Metadata/Items/Currency/Ritual/RitualPinnacleKey': 'Ritual',
  'Metadata/Items/Currency/Breach/BreachPinnacleKey': 'Breach',
  'Metadata/Items/Currency/Abyss/AbyssPinnacleKey': 'Abyss',
  'Metadata/Items/Currency/Delirium/DeliriumPinnacleKey': 'Delirium',
  'Metadata/Items/Currency/Expedition/ExpeditionPinnacleKey': 'Expedition',
  'Metadata/Items/Currency/Atlas/VaalAtlasKey': 'Vaal',
  'Metadata/Items/MapFragments/CurrencyMavenKey': 'Maven',
  'Metadata/Items/MapFragments/CurrencyHarvestBossKey': 'Harvest',
  'Metadata/Items/Ultimatum/TrialmasterKey1': 'Ultimatum',
  'Metadata/Items/Ultimatum/TrialmasterKey2': 'Ultimatum',
  'Metadata/Items/Ultimatum/TrialmasterKey3': 'Ultimatum'
}

// --- Tipler --------------------------------------------------------------
type TrStatus = 'exists' | 'proposed' | 'needs-translation'
type Subtype = 'waystone' | 'atlas_node' | 'tablet' | 'pinnacle_key'
type NodeType = 'keystone' | 'notable' | 'small'

interface RawBaseItem {
  name: string
  item_class: string
  release_state: string
  drop_level?: number | null
  tags?: string[] | null
  implicits?: string[] | null
  visual_identity?: { dds_file?: string | null; id?: string | null } | null
}
interface RawMod {
  text?: string | null
}
interface AtlasPassive {
  name?: string
  icon?: string
  stat_text?: string[]
  is_keystone?: boolean
  is_notable?: boolean
  is_atlas_root?: boolean
  is_jewel_socket?: boolean
  is_icon_only?: boolean
}
interface GlossaryLite {
  names?: Record<string, string>
  patterns?: Record<string, string>
  phrases?: Record<string, string>
  words?: Record<string, string>
}
interface AtlasGlossary {
  names: Record<string, string>
  implicits: Record<string, string>
  descs: Record<string, { en: string; tr: string }>
  phrases: Record<string, string>
  words: Record<string, string>
}

interface AtlasRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  subtype: Subtype
  group_en: string
  group_tr: string
  tier: number | null
  node_type: NodeType | null
  stats_en: string[]
  stats_tr: string[]
  implicit_en: string
  implicit_tr: string
  desc_en: string
  desc_tr: string
  drop_level: number | null
  icon: string | null
  category: 'atlas'
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- Yollar --------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const modsGlossaryPath = join(__dirname, 'tr-mods-glossary.json')
const passGlossaryPath = join(__dirname, 'tr-passives-glossary.json')
const ascGlossaryPath = join(__dirname, 'tr-ascendancy-glossary.json')
const atlasGlossaryPath = join(__dirname, 'tr-atlas-glossary.json')
// ELLE tam-cümle override (kompozisyonel motoru bypass). Anahtar = tam İngilizce satır/ad.
// Build yalnız OKUR; rebuild'de EZİLMEZ; elle düzenlenebilir.
const atlasOverridePath = join(__dirname, 'overrides', 'atlas.tr.json')
function loadAtlasOverrides(): Record<string, string> {
  if (!existsSync(atlasOverridePath)) return {}
  try {
    const raw = JSON.parse(readFileSync(atlasOverridePath, 'utf-8')) as Record<string, string>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('_')) continue
      if (typeof v === 'string' && v.trim()) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'atlas')
const ICON_REL_PREFIX = 'assets/atlas/'

// --- çeviri motoru (build-passives.ts translateLine ile aynı) ------------
function cleanLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split('|')
    return parts.length > 1 ? parts[1] : parts[0]
  })
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function translateLine(
  line: string,
  patterns: Map<string, string>,
  phrases: Array<[string, string]>,
  wordMap: Map<string, string>
): string {
  if (!line) return ''
  const exact = patterns.get(line)
  if (exact) return exact

  let suffix = ''
  const verb = line.match(/^(Adds|Gains|Gain|Leeches|Leech|Recover|Regenerate) (.+)$/)
  if (verb) {
    line = verb[2]
    suffix =
      verb[1] === 'Adds' ? ' ekler'
        : verb[1] === 'Gains' ? ' kazanır'
          : verb[1] === 'Gain' ? ' kazan'
            : verb[1] === 'Leeches' || verb[1] === 'Leech' ? ' emer'
              : ' yeniler'
  }

  const parts: string[] = []
  const enc = (i: number): string => String.fromCharCode(0xe000 + i)
  const protect = (s: string): string => {
    const tok = enc(parts.length)
    parts.push(s)
    return tok
  }
  let work = line.replace(/#%?/g, (m) => protect(m))
  work = work.replace(/[+-]?\d[\d.,]*%?/g, (m) => protect(m))
  const sentTok = '[\\ue000-\\uf8ff]'
  work = work.replace(new RegExp('(' + sentTok + ') to (' + sentTok + ')', 'g'), '$1 ila $2')

  for (const [en, tr] of phrases) {
    const re = new RegExp(escapeRegExp(en), 'gi')
    work = work.replace(re, () => protect(tr))
  }

  const tokens = work.split(/(\s+)/)
  work = tokens
    .map((tok) => {
      if (/^\s+$/.test(tok) || tok.length === 0) return tok
      if (/[-]/.test(tok)) return tok
      const lead = (tok.match(/^[^0-9A-Za-zÀ-ÿ]+/) || [''])[0]
      const trail = (tok.match(/[^0-9A-Za-zÀ-ÿ]+$/) || [''])[0]
      const core = tok.slice(lead.length, tok.length - trail.length)
      if (core.length === 0) return tok
      const lower = core.toLocaleLowerCase('en')
      if (wordMap.has(lower)) {
        const hit = wordMap.get(lower) as string
        return hit === '' ? lead + trail : lead + hit + trail
      }
      return tok
    })
    .join('')

  work = work.replace(/[-]/g, (ch) => parts[ch.charCodeAt(0) - 0xe000])
  return (work + suffix).replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim()
}

// --- ikon indirme (build-items.ts ile aynı) ------------------------------
function iconUrl(ddsPath: string): string {
  return SOURCE_BASE + ddsPath.replace(/\.dds$/i, '.png')
}
function iconBasename(ddsPath: string): string {
  return ddsPath.split('/').pop()!.replace(/\.dds$/i, '.png')
}
async function downloadIcon(url: string, dest: string): Promise<boolean> {
  for (let attempt = 0; attempt <= ICON_RETRIES; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 404) return false
        throw new Error(`HTTP ${res.status}`)
      }
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
      return true
    } catch {
      if (attempt === ICON_RETRIES) return false
    }
  }
  return false
}
async function downloadIcons(
  byBasename: Map<string, string>
): Promise<{ downloaded: number; existed: number; failed: Set<string> }> {
  mkdirSync(iconDir, { recursive: true })
  const existing = new Set(existsSync(iconDir) ? readdirSync(iconDir) : [])
  const todo: Array<[string, string]> = []
  let existed = 0
  for (const [base, url] of byBasename) {
    if (existing.has(base)) { existed++; continue }
    todo.push([base, url])
  }
  let downloaded = 0
  const failed = new Set<string>()
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < todo.length) {
      const [base, url] = todo[idx++]
      const ok = await downloadIcon(url, join(iconDir, base))
      if (ok) downloaded++
      else failed.add(base)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(ICON_CONCURRENCY, todo.length) }, () => worker())
  )
  return { downloaded, existed, failed }
}

function nodeType(n: AtlasPassive): NodeType {
  if (n.is_keystone) return 'keystone'
  if (n.is_notable) return 'notable'
  return 'small'
}

async function main(): Promise<void> {
  // glossary'ler: node stat çevirisi mods+passives+ascendancy+atlas
  const modsG = JSON.parse(readFileSync(modsGlossaryPath, 'utf-8')) as GlossaryLite
  const passG = existsSync(passGlossaryPath)
    ? (JSON.parse(readFileSync(passGlossaryPath, 'utf-8')) as GlossaryLite) : {}
  const ascG = existsSync(ascGlossaryPath)
    ? (JSON.parse(readFileSync(ascGlossaryPath, 'utf-8')) as GlossaryLite) : {}
  const atlasG = JSON.parse(readFileSync(atlasGlossaryPath, 'utf-8')) as AtlasGlossary

  const patterns = new Map<string, string>()
  for (const [k, v] of Object.entries(modsG.patterns ?? {})) patterns.set(k, v)
  const phraseObj: Record<string, string> = {
    ...(modsG.phrases ?? {}), ...(ascG.phrases ?? {}), ...(passG.phrases ?? {}),
    ...(atlasG.phrases ?? {})
  }
  const phrases: Array<[string, string]> = Object.entries(phraseObj)
    .sort((a, b) => b[0].length - a[0].length)
  const wordMap = new Map<string, string>()
  for (const src of [modsG.words, ascG.words, passG.words, atlasG.words]) {
    for (const [k, v] of Object.entries(src ?? {})) wordMap.set(k.toLowerCase(), v)
  }

  const atlasFileOv = loadAtlasOverrides()
  console.log(`  ELLE override (atlas.tr.json): ${Object.keys(atlasFileOv).length}`)
  const lineCache = new Map<string, string>()
  function trLine(line: string): string {
    const ov = atlasFileOv[line]
    if (ov !== undefined) return ov
    const c = lineCache.get(line)
    if (c !== undefined) return c
    const t = translateLine(line, patterns, phrases, wordMap)
    lineCache.set(line, t)
    return t
  }

  console.log(`İndiriliyor: ${BASE_ITEMS_URL}`)
  const raw = (await (await fetch(BASE_ITEMS_URL)).json()) as Record<string, RawBaseItem>
  console.log(`İndiriliyor: ${MODS_URL}`)
  const mods = (await (await fetch(MODS_URL)).json()) as Record<string, RawMod>
  console.log(`İndiriliyor: ${ATLAS_TREE_URL}`)
  const atlasTree = (await (await fetch(ATLAS_TREE_URL)).json()) as { passives: Record<string, AtlasPassive> }

  const today = new Date().toISOString().slice(0, 10)
  const records: AtlasRecord[] = []
  const iconByBasename = new Map<string, string>()

  function pushIcon(dds: string | null | undefined): string | null {
    if (!dds || !/[^/]+\.dds$/i.test(dds)) return null
    const base = iconBasename(dds)
    iconByBasename.set(base, iconUrl(dds))
    return ICON_REL_PREFIX + base
  }

  // --- 1) WAYSTONE'lar (item_class Map) ---
  for (const [metaId, it] of Object.entries(raw)) {
    if (it.item_class !== 'Map') continue
    if (it.release_state !== 'released') continue
    const m = /Tier\s+(\d+)/i.exec(it.name)
    const tier = m ? Number(m[1]) : null
    const tr = tier != null ? `Yol Taşı (Kademe ${tier})` : it.name
    records.push({
      id: metaId, en: it.name, tr, tr_status: 'proposed', subtype: 'waystone',
      group_en: 'Waystone', group_tr: 'Yol Taşı', tier, node_type: null,
      stats_en: [], stats_tr: [], implicit_en: '', implicit_tr: '',
      desc_en: '', desc_tr: '', drop_level: it.drop_level ?? null,
      icon: pushIcon(it.visual_identity?.dds_file),
      category: 'atlas', source: SOURCE_NAME, game_version: GAME_VERSION,
      league: LEAGUE, last_updated: today
    })
  }

  // --- 3) TOWER / PRECURSOR TABLET (item_class TowerAugmentation) ---
  for (const [metaId, it] of Object.entries(raw)) {
    if (it.item_class !== 'TowerAugmentation') continue
    if (it.release_state !== 'released') continue
    const implLines: string[] = []
    for (const id of it.implicits ?? []) {
      const md = mods[id]
      if (md && md.text) implLines.push(cleanLinks(md.text).replace(/\s*\n\s*/g, '\n').trim())
    }
    const implicitEn = implLines.join('\n')
    const implicitTr = implicitEn
      .split('\n')
      .map((l) => atlasG.implicits[l] ?? trLine(l))
      .join('\n')
    records.push({
      id: metaId, en: it.name, tr: atlasFileOv[it.name] ?? atlasG.names[it.name] ?? it.name,
      tr_status: (atlasFileOv[it.name] || atlasG.names[it.name]) ? 'proposed' : 'needs-translation',
      subtype: 'tablet', group_en: 'Precursor Tablet', group_tr: 'Precursor Tablet',
      tier: null, node_type: null, stats_en: [], stats_tr: [],
      implicit_en: implicitEn, implicit_tr: implicitTr, desc_en: '', desc_tr: '',
      drop_level: it.drop_level ?? null,
      icon: pushIcon(it.visual_identity?.dds_file),
      category: 'atlas', source: SOURCE_NAME, game_version: GAME_VERSION,
      league: LEAGUE, last_updated: today
    })
  }

  // --- 4) PINNACLE ANAHTARLARI (sadece 11 temiz set) ---
  for (const [metaId, mech] of Object.entries(PINNACLE_KEYS)) {
    const it = raw[metaId]
    if (!it) { console.warn('  ! pinnacle key bulunamadı:', metaId); continue }
    const d = atlasG.descs[it.name]
    records.push({
      id: metaId, en: it.name, tr: atlasFileOv[it.name] ?? atlasG.names[it.name] ?? it.name,
      tr_status: (atlasFileOv[it.name] || atlasG.names[it.name]) ? 'proposed' : 'needs-translation',
      subtype: 'pinnacle_key', group_en: mech, group_tr: mech,
      tier: null, node_type: null, stats_en: [], stats_tr: [],
      implicit_en: '', implicit_tr: '',
      desc_en: d?.en ?? '', desc_tr: d?.tr ?? '',
      drop_level: it.drop_level ?? null,
      icon: pushIcon(it.visual_identity?.dds_file),
      category: 'atlas', source: SOURCE_NAME, game_version: GAME_VERSION,
      league: LEAGUE, last_updated: today
    })
  }

  // --- 2) ATLAS PASİF NODE LİSTESİ (Atlas.json passives) ---
  for (const [pid, n] of Object.entries(atlasTree.passives)) {
    if (n.is_atlas_root || n.is_jewel_socket) continue
    const statsEn = (n.stat_text ?? [])
      .flatMap((s) => cleanLinks(s).split('\n'))
      .map((s) => s.trim())
      .filter(Boolean)
    if (!n.name && statsEn.length === 0) continue // boş/ikon-only atla
    const enName = n.name && n.name.trim() ? n.name.trim() : (statsEn[0] ?? '(Atlas Node)')
    const type = nodeType(n)
    records.push({
      id: 'atlasnode_' + pid, en: enName, tr: atlasFileOv[enName] ?? atlasG.names[enName] ?? trLine(enName),
      tr_status: 'proposed', subtype: 'atlas_node',
      group_en: 'Atlas Passive', group_tr: 'Atlas Pasifi',
      tier: null, node_type: type, stats_en: statsEn, stats_tr: statsEn.map(trLine),
      implicit_en: '', implicit_tr: '', desc_en: '', desc_tr: '', drop_level: null,
      icon: n.icon ? ICON_REL_PREFIX + n.icon.split('/').pop()!.replace(/\.dds$/i, '.png') : null,
      category: 'atlas', source: SOURCE_NAME, game_version: GAME_VERSION,
      league: LEAGUE, last_updated: today
    })
  }

  // sıralama: alt-tip grubu (waystone -> atlas_node -> tablet -> pinnacle), sonra tier/ad
  const subOrder: Record<Subtype, number> = { waystone: 0, atlas_node: 1, tablet: 2, pinnacle_key: 3 }
  const ntOrder: Record<NodeType, number> = { keystone: 0, notable: 1, small: 2 }
  records.sort((a, b) => {
    const s = subOrder[a.subtype] - subOrder[b.subtype]
    if (s !== 0) return s
    if (a.subtype === 'waystone') return (a.tier ?? 0) - (b.tier ?? 0)
    if (a.subtype === 'atlas_node') {
      const t = ntOrder[a.node_type ?? 'small'] - ntOrder[b.node_type ?? 'small']
      if (t !== 0) return t
    }
    return a.en.localeCompare(b.en, 'en')
  })

  // ikon indir (waystone/tablet/pinnacle — atlas node ikonları produce-atlas-icons.cjs)
  console.log(`İkonlar indiriliyor (${iconByBasename.size} benzersiz dosya, waystone/tablet/pinnacle)...`)
  const iconResult = await downloadIcons(iconByBasename)
  let iconCleared = 0
  if (iconResult.failed.size > 0) {
    for (const r of records) {
      if (r.subtype === 'atlas_node') continue // ayrı script üretir
      if (r.icon && iconResult.failed.has(r.icon.slice(ICON_REL_PREFIX.length))) {
        r.icon = null; iconCleared++
      }
    }
  }

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'atlas.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- özet ---
  const bySub: Record<string, number> = {}
  for (const r of records) bySub[r.subtype] = (bySub[r.subtype] ?? 0) + 1
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const emptyTr = records.filter((r) => !r.tr.trim() || r.stats_tr.some((s) => !s.trim())).length
  const byNodeType: Record<string, number> = {}
  for (const r of records) if (r.subtype === 'atlas_node') byNodeType[r.node_type!] = (byNodeType[r.node_type!] ?? 0) + 1
  const untrans = [...lineCache.entries()].filter(([en, tr]) => en === tr && /[A-Za-z]{4,}/.test(en)).length

  console.log('')
  console.log(`Yazıldı: ${records.length} kayıt -> ${outPath}`)
  console.log('  alt-tip: ' + Object.entries(bySub).map(([k, n]) => `${k}:${n}`).join(', '))
  console.log('  atlas node tipi: ' + Object.entries(byNodeType).map(([k, n]) => `${k}:${n}`).join(', '))
  console.log(`  tr_status needs-translation: ${needs} (hedef 0)`)
  console.log(`  tr/stat boş kayıt: ${emptyTr}`)
  console.log(`  benzersiz çeviri satırı: ${lineCache.size}, çevrilmeyen kalan (en==tr): ${untrans}`)
  console.log(`  ikon (waystone/tablet/pinnacle): indirilen ${iconResult.downloaded}, vardı ${iconResult.existed}, başarısız ${iconResult.failed.size}, temizlenen ${iconCleared}`)
  console.log('  NOT: atlas node ikonları için -> node scripts/produce-atlas-icons.cjs')
}

main().catch((err) => { console.error('Hata:', err); process.exit(1) })
