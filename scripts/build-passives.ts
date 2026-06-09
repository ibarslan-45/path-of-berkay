/**
 * build-passives.ts
 * ----------------------------------------------------------------------------
 * Pasif beceri ağacı (class tree) node'ları -> src/data/passives.json.
 * Kaynak: GGG poe2-skilltree-export data.json. Ascendancy node'ları HARİÇ
 * (onlar Yükselişler sekmesinde). Aynı (ad+stat) node'lar TEKİLLEŞTİRİLİR;
 * count = ağaçtaki kopya sayısı.
 *
 * Çalıştırma:  npm run build:passives
 *
 * ÇEVİRİ: stat metni mods glossary + ascendancy glossary + passive glossary ile
 *  compositional (build-mods translateLine motoru). Benzersiz stat SATIRI bir
 *  kez çevrilir, cache'lenir, tekrar kullanılır. needs-translation 0.
 * İKON: GGG icon yolu basename -> 'assets/passives/<base>.png' (produce-passive-
 *  icons.cjs üretir; oyun dosyasından SkillIcons/passives çıkarımı gerekir).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const TREE_URL = 'https://raw.githubusercontent.com/grindinggear/poe2-skilltree-export/master/data.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'grindinggear/poe2-skilltree-export'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'
type NodeType = 'keystone' | 'notable' | 'small' | 'jewel_socket'

interface TreeNode {
  id?: string
  name?: string
  icon?: string
  stats?: string[]
  isKeystone?: boolean
  isNotable?: boolean
  isJewelSocket?: boolean
  isMastery?: boolean
  isAscendancyStart?: boolean
  ascendancyId?: string
  classStartIndex?: number | null
}
interface GlossaryLite {
  names?: Record<string, string>
  patterns?: Record<string, string>
  phrases?: Record<string, string>
  words?: Record<string, string>
}
interface PassiveRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  node_type: NodeType
  stats_en: string[]
  stats_tr: string[]
  count: number
  icon: string | null
  category: 'passive'
  source: string
  game_version: string
  league: string
  last_updated: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const modsGlossaryPath = join(__dirname, 'tr-mods-glossary.json')
const ascGlossaryPath = join(__dirname, 'tr-ascendancy-glossary.json')
const passGlossaryPath = join(__dirname, 'tr-passives-glossary.json')
// ELLE TAM-CÜMLE override (stat SATIRI bazlı, kompozisyonel motoru bypass eder).
// Anahtar: tam İngilizce stat satırı. Build yalnız OKUR; rebuild'de EZİLMEZ.
const statOverridePath = join(__dirname, 'overrides', 'passives-stats.tr.json')

/** passives-stats.tr.json yükle: { "<stat_en>": "<doğal TR>" }. Yoksa {}. */
function loadStatOverrides(): Record<string, string> {
  if (!existsSync(statOverridePath)) return {}
  try {
    const raw = JSON.parse(readFileSync(statOverridePath, 'utf-8')) as Record<string, string>
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

// ---- çeviri motoru (build-mods.ts ile aynı) ----
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
      if (/[-]/.test(tok)) return tok
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

function nodeType(n: TreeNode): NodeType {
  if (n.isKeystone) return 'keystone'
  if (n.isJewelSocket) return 'jewel_socket'
  if (n.isNotable) return 'notable'
  return 'small'
}

async function main(): Promise<void> {
  const modsG = JSON.parse(readFileSync(modsGlossaryPath, 'utf-8')) as GlossaryLite
  const ascG = JSON.parse(readFileSync(ascGlossaryPath, 'utf-8')) as GlossaryLite
  const passG = existsSync(passGlossaryPath)
    ? (JSON.parse(readFileSync(passGlossaryPath, 'utf-8')) as GlossaryLite)
    : {}

  // çeviri tabloları: mods taban + ascendancy + passive (sonraki önce gelir)
  const patterns = new Map<string, string>()
  for (const [k, v] of Object.entries(modsG.patterns ?? {})) patterns.set(k, v)
  const phraseObj: Record<string, string> = {
    ...(modsG.phrases ?? {}), ...(ascG.phrases ?? {}), ...(passG.phrases ?? {})
  }
  const phrases: Array<[string, string]> = Object.entries(phraseObj).sort((a, b) => b[0].length - a[0].length)
  const wordMap = new Map<string, string>()
  for (const src of [modsG.words, ascG.words, passG.words]) {
    for (const [k, v] of Object.entries(src ?? {})) wordMap.set(k.toLowerCase(), v)
  }
  const names = { ...(ascG.names ?? {}), ...(passG.names ?? {}) }

  // ELLE override (stat satırı bazlı) — kompozisyonel motordan ÖNCE.
  const statOverrides = loadStatOverrides()
  let statOverrideHits = 0
  // stat SATIRI çeviri cache (benzersiz satır bir kez)
  const lineCache = new Map<string, string>()
  function trLine(line: string): string {
    const c = lineCache.get(line)
    if (c !== undefined) return c
    const ov = statOverrides[line]
    const t = ov !== undefined ? ov : translateLine(line, patterns, phrases, wordMap)
    lineCache.set(line, t)
    return t
  }
  /** Bir satır override'lı mı (kayıt 'exists' işaretlemek için). */
  function lineHasOverride(line: string): boolean {
    return statOverrides[line] !== undefined
  }
  function trName(en: string): string {
    if (!en) return en
    if (statOverrides[en] !== undefined) return statOverrides[en]
    if (names[en]) return names[en]
    // küçük/stat-türevi adlar için compositional dene; değişmezse en (proposed)
    const t = translateLine(en, patterns, phrases, wordMap)
    return t || en
  }

  console.log('İndiriliyor: GGG data.json')
  const tree = (await (await fetch(TREE_URL)).json()) as { nodes: Record<string, TreeNode> }
  const today = new Date().toISOString().slice(0, 10)

  // class-tree node'ları (ascendancy hariç), dedup (ad + temiz stat)
  const dedup = new Map<string, { rep: TreeNode; type: NodeType; statsEn: string[]; count: number }>()
  for (const n of Object.values(tree.nodes)) {
    if (!n || n.ascendancyId || n.isAscendancyStart) continue
    if (n.classStartIndex != null) continue
    const hasStats = n.stats && n.stats.length
    if (!hasStats && !n.isJewelSocket) continue
    const statsEn = (n.stats ?? []).flatMap((s) => cleanLinks(s).split('\n')).map((s) => s.trim()).filter(Boolean)
    const key = (n.name ?? '') + '||' + statsEn.join('\n')
    const ex = dedup.get(key)
    if (ex) { ex.count++; continue }
    dedup.set(key, { rep: n, type: nodeType(n), statsEn, count: 1 })
  }

  const records: PassiveRecord[] = []
  for (const { rep, type, statsEn, count } of dedup.values()) {
    // ad: notable/keystone -> name; adsız küçük -> ilk stat'tan türet
    const enName = rep.name && rep.name.trim() ? rep.name.trim() : (statsEn[0] ?? '(Pasif)')
    const statsTr = statsEn.map(trLine)
    const usedOverride = statsEn.some(lineHasOverride)
    if (usedOverride) statOverrideHits++
    const trNm = trName(enName)
    const iconBase = rep.icon ? rep.icon.split('/').pop()!.replace(/\.png$/i, '') : null
    records.push({
      id: rep.id ?? 'passive_' + records.length,
      en: enName,
      tr: trNm,
      tr_status: usedOverride ? 'exists' : 'proposed',
      node_type: type,
      stats_en: statsEn,
      stats_tr: statsTr,
      count,
      icon: iconBase ? 'assets/passives/' + iconBase + '.png' : null,
      category: 'passive',
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  // sırala: tip (keystone>notable>small>jewel), sonra ad
  const order: Record<NodeType, number> = { keystone: 0, notable: 1, small: 2, jewel_socket: 3 }
  records.sort((a, b) => (order[a.node_type] - order[b.node_type]) || a.en.localeCompare(b.en, 'en'))

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'passives.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- özet ---
  const byType: Record<string, number> = {}
  for (const r of records) byType[r.node_type] = (byType[r.node_type] ?? 0) + 1
  const emptyTr = records.filter((r) => !r.tr.trim() || r.stats_tr.some((s) => !s.trim())).length
  const untransLines = [...lineCache.entries()].filter(([en, tr]) => en === tr && /[A-Za-z]{4,}/.test(en)).length

  console.log('')
  console.log(`Yazıldı: ${records.length} benzersiz node -> ${outPath}`)
  console.log('  tip dağılımı: ' + Object.entries(byType).map(([k, n]) => `${k}:${n}`).join(', '))
  console.log(`  benzersiz stat satırı (çeviri kalıbı): ${lineCache.size}`)
  console.log(`  ELLE stat override kullanan kayıt: ${statOverrideHits} (override satırı: ${Object.keys(statOverrides).length})`)
  console.log(`  çevrilmeyen kalan satır (en==tr): ${untransLines}`)
  console.log(`  tr boş kayıt: ${emptyTr} (needs-translation 0 hedef)`)
}

main().catch((err) => { console.error('Hata:', err); process.exit(1) })
