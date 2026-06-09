/**
 * build-ascendancies.ts
 * ----------------------------------------------------------------------------
 * 8 PoE2 sınıfı (characters.json) + yükselişleri/node'ları (GGG poe2-skilltree
 * data.json) -> src/data/ascendancies.json (iki dilli).
 *
 * Çalıştırma:  npm run build:ascendancies
 *
 * ÇEVİRİ: node stat metni mods glossary (patterns/phrases/words) + ascendancy
 *  glossary (mekanik terim ek katmanı) ile compositional çevrilir (mods tab ile
 *  aynı translateLine motoru). Ad/flavour: ascendancy glossary override; yoksa
 *  en korunur (proposed). needs-translation 0.
 * İKON: extracted emblem dds adı metadata + ascendancyId'den türetilir; PNG'yi
 *  produce-ascendancy-icons.cjs üretir. icon = 'assets/ascendancies/<base>.png'.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const REPOE = 'https://repoe-fork.github.io/poe2/'
const CHARS_URL = REPOE + 'characters.json'
const TREE_URL = 'https://raw.githubusercontent.com/grindinggear/poe2-skilltree-export/master/data.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork + grindinggear/poe2-skilltree-export'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'
const POE2_CLASSES = ['Warrior', 'Ranger', 'Witch', 'Sorceress', 'Huntress', 'Mercenary', 'Monk', 'Druid']

interface RawChar { name: string; metadata_id: string; description?: string; base_stats?: Record<string, number> }
interface AscEntry { id: string; name: string | null; image?: string; flavourText?: string }
interface TreeClass { name: string; ascendancies?: AscEntry[] }
interface TreeNode { name?: string; stats?: string[]; isNotable?: boolean; ascendancyId?: string; icon?: string }

interface AscGlossary {
  names?: Record<string, string>
  classDesc?: Record<string, string>
  ascDesc?: Record<string, string>
  phrases?: Record<string, string>
  words?: Record<string, string>
}
interface ModsGlossary {
  patterns?: Record<string, string>
  phrases?: Record<string, string>
  words?: Record<string, string>
}

interface NodeRec { name_en: string; name_tr: string; stat_en: string; stat_tr: string; notable: boolean }
interface AscRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  type: 'class' | 'ascendancy'
  parent_class: string | null
  parent_class_tr: string | null
  attribute: string | null
  desc_en: string
  desc_tr: string
  nodes: NodeRec[]
  icon: string | null
  category: 'ascendancy'
  source: string
  game_version: string
  league: string
  last_updated: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const ascGlossaryPath = join(__dirname, 'tr-ascendancy-glossary.json')
const modsGlossaryPath = join(__dirname, 'tr-mods-glossary.json')
// ELLE tam-cümle override (kompozisyonel motoru bypass). Anahtar = tam İngilizce satır VEYA node adı.
// Build yalnız OKUR; rebuild'de EZİLMEZ; elle düzenlenebilir.
const ascOverridePath = join(__dirname, 'overrides', 'ascendancies.tr.json')
function loadAscOverrides(): Record<string, string> {
  if (!existsSync(ascOverridePath)) return {}
  try {
    const raw = JSON.parse(readFileSync(ascOverridePath, 'utf-8')) as Record<string, string>
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

// ---- mods çeviri motoru (build-mods.ts ile aynı) ----
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

  work = work.replace(/([-])/g, (_m, ch: string) => parts[ch.charCodeAt(0) - 0xe000])
  return (work + suffix).replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim()
}

// metadata son segment: "Metadata/Characters/Int/IntFour" -> "intfour"
function metaSeg(metadata: string): string {
  return (metadata.split('/').pop() || '').toLowerCase()
}
function attributeOf(metadata: string): string {
  const seg = metadata.split('/')[2] || '' // Str / Dex / Int / StrDex ...
  const map: Record<string, string> = {
    Str: 'Strength', Dex: 'Dexterity', Int: 'Intelligence',
    StrDex: 'Strength/Dexterity', DexInt: 'Dexterity/Intelligence', StrInt: 'Strength/Intelligence'
  }
  return map[seg] || seg
}
async function main(): Promise<void> {
  const ascG = JSON.parse(readFileSync(ascGlossaryPath, 'utf-8')) as AscGlossary
  const modsG = JSON.parse(readFileSync(modsGlossaryPath, 'utf-8')) as ModsGlossary

  // çeviri tabloları: mods taban + ascendancy üst katman (ascendancy önce)
  const patterns = new Map<string, string>()
  for (const [k, v] of Object.entries(modsG.patterns ?? {})) patterns.set(k, v)
  // phrases: uzun -> kısa sırala (uzun eşleşme önce)
  const phraseObj: Record<string, string> = { ...(modsG.phrases ?? {}), ...(ascG.phrases ?? {}) }
  const phrases: Array<[string, string]> = Object.entries(phraseObj).sort((a, b) => b[0].length - a[0].length)
  const wordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(modsG.words ?? {})) wordMap.set(k.toLowerCase(), v)
  for (const [k, v] of Object.entries(ascG.words ?? {})) wordMap.set(k.toLowerCase(), v)

  const names = ascG.names ?? {}
  const ascFileOv = loadAscOverrides()
  console.log(`  ELLE override (ascendancies.tr.json): ${Object.keys(ascFileOv).length}`)
  function trName(en: string): { tr: string; status: TrStatus } {
    const fov = ascFileOv[en]
    if (fov !== undefined) return { tr: fov, status: 'exists' }
    const ov = names[en]
    if (ov) return { tr: ov, status: ov === en ? 'proposed' : 'proposed' }
    return { tr: en, status: 'proposed' }
  }
  function trStat(rawStats: string[]): { en: string; tr: string } {
    // markup temizle, satırlara böl
    const lines = rawStats
      .flatMap((s) => cleanLinks(s).split('\n'))
      .map((s) => s.replace(/<underline>\{([^}]*)\}/g, '$1').replace(/[{}]/g, '').trim())
      .filter(Boolean)
    const en = lines.join('\n')
    // önce ELLE override (satır bazlı); yoksa kompozisyonel motora düş
    const tr = lines.map((l) => ascFileOv[l] ?? translateLine(l, patterns, phrases, wordMap)).join('\n')
    return { en, tr }
  }

  console.log('İndiriliyor: characters.json + GGG data.json')
  const chars = (await (await fetch(CHARS_URL)).json()) as RawChar[]
  const tree = (await (await fetch(TREE_URL)).json()) as { classes: TreeClass[]; nodes: Record<string, TreeNode> }
  const today = new Date().toISOString().slice(0, 10)

  // ascendancyId -> node listesi
  const nodesByAsc = new Map<string, NodeRec[]>()
  for (const n of Object.values(tree.nodes)) {
    if (!n || !n.ascendancyId || !n.name || !n.stats || !n.stats.length) continue
    const { en, tr } = trStat(n.stats)
    if (!en) continue
    const nm = trName(n.name)
    const rec: NodeRec = { name_en: n.name, name_tr: nm.tr, stat_en: en, stat_tr: tr, notable: !!n.isNotable }
    const arr = nodesByAsc.get(n.ascendancyId) ?? []
    arr.push(rec)
    nodesByAsc.set(n.ascendancyId, arr)
  }

  const records: AscRecord[] = []
  const charByName = new Map(chars.map((c) => [c.name, c]))

  for (const className of POE2_CLASSES) {
    const ch = charByName.get(className)
    const treeCls = tree.classes.find((c) => c.name === className)
    if (!ch || !treeCls) { console.warn('  ! sınıf bulunamadı:', className); continue }

    const attr = attributeOf(ch.metadata_id)
    const seg = metaSeg(ch.metadata_id)
    const clsName = trName(className)
    const classDescTr = ascG.classDesc?.[className] ?? ch.description ?? ''
    records.push({
      id: 'class_' + className.toLowerCase(),
      en: className,
      tr: clsName.tr,
      tr_status: 'proposed',
      type: 'class',
      parent_class: null,
      parent_class_tr: null,
      attribute: attr,
      desc_en: ch.description ?? '',
      desc_tr: classDescTr,
      nodes: [],
      icon: 'assets/ascendancies/icon' + seg + '.png',
      category: 'ascendancy',
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })

    // bu sınıfın ascendancy'leri (yayınlanmış: name!=null && node>0)
    for (const a of treeCls.ascendancies ?? []) {
      if (!a.name) continue
      const nodes = nodesByAsc.get(a.id) ?? []
      if (!nodes.length) continue
      const an = trName(a.name)
      const descEn = a.flavourText ?? ''
      const descTr = ascG.ascDesc?.[a.name] ?? descEn
      records.push({
        id: 'asc_' + a.id.toLowerCase(),
        en: a.name,
        tr: an.tr,
        tr_status: 'proposed',
        type: 'ascendancy',
        parent_class: className,
        parent_class_tr: clsName.tr,
        attribute: null,
        desc_en: descEn,
        desc_tr: descTr,
        nodes,
        icon: 'assets/ascendancies/icon' + seg + '_' + a.id.toLowerCase() + '.png',
        category: 'ascendancy',
        source: SOURCE_NAME,
        game_version: GAME_VERSION,
        league: LEAGUE,
        last_updated: today
      })
    }
  }

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'ascendancies.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- özet ---
  const classes = records.filter((r) => r.type === 'class')
  const ascs = records.filter((r) => r.type === 'ascendancy')
  const totalNodes = ascs.reduce((s, r) => s + r.nodes.length, 0)
  const nodesWithTr = ascs.reduce((s, r) => s + r.nodes.filter((n) => n.stat_tr.trim()).length, 0)
  const emptyTr = records.filter((r) => !r.tr.trim()).length +
    ascs.reduce((s, r) => s + r.nodes.filter((n) => !n.stat_tr.trim() || !n.name_tr.trim()).length, 0)
  // stat_tr içinde hâlâ İngilizce ağırlıklı (en==tr) node sayısı
  const untranslated = ascs.reduce((s, r) => s + r.nodes.filter((n) => n.stat_tr === n.stat_en && /[A-Za-z]{4,}/.test(n.stat_en)).length, 0)

  console.log('')
  console.log(`Yazıldı: ${records.length} kayıt -> ${outPath}`)
  console.log(`  sınıf: ${classes.length}, ascendancy: ${ascs.length}, node: ${totalNodes}`)
  console.log(`  node stat_tr dolu: ${nodesWithTr}/${totalNodes}`)
  console.log(`  tr boş (kayıt+node): ${emptyTr}  (needs-translation 0 hedef)`)
  console.log(`  stat_tr == stat_en (çevrilmemiş kalan): ${untranslated}`)
  console.log('  ascendancy/sınıf dağılımı:')
  for (const c of classes) {
    const myAsc = ascs.filter((a) => a.parent_class === c.en)
    console.log(`   ${c.en} (${c.attribute}): ${myAsc.map((a) => a.en + '[' + a.nodes.length + ']').join(', ')}`)
  }
}

main().catch((err) => { console.error('Hata:', err); process.exit(1) })
