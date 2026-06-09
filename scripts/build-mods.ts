/**
 * build-mods.ts
 * ----------------------------------------------------------------------------
 * RePoE poe2 fork mods.json'dan ITEM MOD'larını (prefix/suffix stat'lar) çıkarır;
 * okunur metni (`text`) `#` placeholder'lı kalıba normalize eder; aynı kalıbı
 * paylaşan tüm TIER'ları TEK kayıtta gruplar (tiers: seviye+değer aralığı, güçlü
 * en üstte). mods_by_base.json'dan + spawn_weights'ten applies_to (item türü)
 * doldurur. İki dilli (en+tr) src/data/mods.json yazar. Mod'ların ikonu yoktur.
 *
 * Çalıştırma:  npm run build:mods
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SOURCE_BASE = 'https://repoe-fork.github.io/poe2/'
const MODS_URL = SOURCE_BASE + 'mods.json'
const MODS_BY_BASE_URL = SOURCE_BASE + 'mods_by_base.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'

interface RawMod {
  domain: string
  generation_type: string
  name?: string
  required_level?: number
  implicit_tags?: string[]
  adds_tags?: string[]
  spawn_weights?: Array<{ tag: string; weight: number }>
  groups?: string[] // mod ailesi (RePoE); grup anahtarı için groups[0]
  text?: string | null
}
interface ModsGlossary {
  tags: Record<string, { en: string; tr: string }>
  patterns: Record<string, string>
  phrases: Record<string, string>
  words: Record<string, string>
}
interface Tier {
  level: number
  values: string
}
interface ModRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  affix_type: 'prefix' | 'suffix'
  affix_name: string
  tags: string[]
  required_level: number
  level_max: number
  tier_count: number
  tiers: Tier[]
  applies_to: string[]
  category: 'mod'
  source: string
  game_version: string
  league: string
  last_updated: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-mods-glossary.json')
// ELLE tam-cümle override (kompozisyonel motoru bypass). Anahtar = tam mod_en (# placeholder'lı).
// Build yalnız OKUR; rebuild'de EZİLMEZ; elle düzenlenebilir.
const modOverridePath = join(__dirname, 'overrides', 'mods.tr.json')
function loadModOverrides(): Record<string, string> {
  if (!existsSync(modOverridePath)) return {}
  try {
    const raw = JSON.parse(readFileSync(modOverridePath, 'utf-8')) as Record<string, string>
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

// mods_by_base.json üst-düzey item_class -> filtre grubu anahtarı.
const CLASS_GROUP: Record<string, string> = {
  Amulets: 'amulet',
  Rings: 'ring',
  Belts: 'belt',
  Helmets: 'helmet',
  'Body Armours': 'body_armour',
  Gloves: 'gloves',
  Boots: 'boots',
  Shields: 'shield',
  Bucklers: 'shield',
  Foci: 'focus',
  Quivers: 'quiver',
  Jewels: 'jewel',
  Charms: 'charm',
  Talismans: 'talisman',
  'Life Flasks': 'flask',
  'Mana Flasks': 'flask',
  'One Hand Swords': 'weapon',
  'Two Hand Swords': 'weapon',
  'One Hand Axes': 'weapon',
  'Two Hand Axes': 'weapon',
  'One Hand Maces': 'weapon',
  'Two Hand Maces': 'weapon',
  Daggers: 'weapon',
  Claws: 'weapon',
  Spears: 'weapon',
  Quarterstaves: 'weapon',
  Flails: 'weapon',
  Wands: 'weapon',
  Staves: 'weapon',
  Bows: 'weapon',
  Crossbows: 'weapon',
  Sceptres: 'weapon'
}

const ARMOUR_SLOTS = ['helmet', 'body_armour', 'gloves', 'boots']
// spawn_weights tag -> filtre grubu anahtar(lar)ı (fallback). Genel zırh tag'leri
// tüm zırh yuvalarına; silah alt-türleri "weapon"a genişler.
function swTagGroups(tag: string): string[] {
  if (
    /^(armour|str_armour|dex_armour|int_armour|str_dex_armour|str_int_armour|dex_int_armour|str_dex_int_armour)$/.test(
      tag
    )
  )
    return ARMOUR_SLOTS
  const direct: Record<string, string[]> = {
    ring: ['ring'],
    amulet: ['amulet'],
    belt: ['belt'],
    quiver: ['quiver'],
    shield: ['shield'],
    buckler: ['shield'],
    focus: ['focus'],
    talisman: ['talisman'],
    charm: ['charm'],
    jewel: ['jewel'],
    flask: ['flask'],
    life_flask: ['flask'],
    mana_flask: ['flask'],
    helmet: ['helmet'],
    gloves: ['gloves'],
    boots: ['boots'],
    body_armour: ['body_armour']
  }
  if (direct[tag]) return direct[tag]
  if (
    /^(mace|axe|sword|bow|crossbow|spear|flail|sceptre|wand|staff|warstaff|dagger|claw|quarterstaff|weapon|onehand|twohand|one_hand_weapon|two_hand_weapon|ranged)$/.test(
      tag
    )
  )
    return ['weapon']
  // Etkilenmiş/varyant tag'ler (ör. str_shield, gloves_elder, amulet_shaper).
  const out: string[] = []
  if (/(^|_)shield$|buckler/.test(tag)) out.push('shield')
  if (/(^|_)gloves(_|$)/.test(tag)) out.push('gloves')
  if (/(^|_)boots(_|$)/.test(tag)) out.push('boots')
  if (/(^|_)helmet(_|$)/.test(tag)) out.push('helmet')
  if (/body_armour/.test(tag)) out.push('body_armour')
  if (/(^|_)amulet(_|$)/.test(tag)) out.push('amulet')
  if (/(^|_)ring(_|$)/.test(tag)) out.push('ring')
  if (/(^|_)belt(_|$)/.test(tag)) out.push('belt')
  if (/(^|_)quiver(_|$)/.test(tag)) out.push('quiver')
  if (/(^|_)focus(_|$)/.test(tag)) out.push('focus')
  return out
}

// --- Metin yardımcıları --------------------------------------------------
function cleanLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split('|')
    return parts.length > 1 ? parts[1] : parts[0]
  })
}
function normLine(line: string): string {
  return line
    .replace(/\([-\d.]+\s*-\s*[-\d.]+\)/g, '#')
    .replace(/[+-]?\d[\d.]*/g, '#')
    .replace(/#(?:\s*-\s*#|–#)/g, '#')
    .replace(/##+/g, '#')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
/** Tier değer aralıklarını çıkarır: "+(5-8) to Strength" -> "+(5-8)". */
function extractValues(cleanedText: string): string {
  const flat = cleanedText.replace(/\n/g, ' ')
  const toks = flat.match(/[+-]?\([^)]*\)%?|[+-]?\d[\d.]*%?/g) || []
  return toks.join(' / ')
}

// --- Compositional çevirici (satır) -------------------------------------
const SENT_OPEN = ''
const SENT_CLOSE = ''
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
      verb[1] === 'Adds'
        ? ' ekler'
        : verb[1] === 'Gains'
          ? ' kazanır'
          : verb[1] === 'Gain'
            ? ' kazan'
            : verb[1] === 'Leeches' || verb[1] === 'Leech'
              ? ' emer'
              : ' yeniler'
  }

  const parts: string[] = []
  const enc = (i: number): string => String.fromCharCode(0xe000 + i)
  const protect = (s: string): string => {
    const tok = SENT_OPEN + enc(parts.length) + SENT_CLOSE
    parts.push(s)
    return tok
  }
  let work = line.replace(/#%?/g, (m) => protect(m))
  const sentTok = SENT_OPEN + '[\\ue000-\\uf8ff]' + SENT_CLOSE
  work = work.replace(new RegExp('(' + sentTok + ') to (' + sentTok + ')', 'g'), '$1 ila $2')

  for (const [en, tr] of phrases) {
    const re = new RegExp(escapeRegExp(en), 'gi')
    work = work.replace(re, () => protect(tr))
  }

  const tokens = work.split(/(\s+)/)
  work = tokens
    .map((tok) => {
      if (/^\s+$/.test(tok) || tok.length === 0) return tok
      if (tok.includes(SENT_OPEN)) return tok
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

  work = work.replace(
    new RegExp(SENT_OPEN + '([\\ue000-\\uf8ff])' + SENT_CLOSE, 'g'),
    (_m, ch: string) => parts[ch.charCodeAt(0) - 0xe000]
  )
  return (work + suffix).replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim()
}

function slugify(s: string): string {
  return s
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

async function main(): Promise<void> {
  const g = JSON.parse(readFileSync(glossaryPath, 'utf-8')) as ModsGlossary
  g.tags ??= {}
  g.patterns ??= {}
  g.phrases ??= {}
  g.words ??= {}

  const patternMap = new Map<string, string>()
  for (const [k, v] of Object.entries(g.patterns)) patternMap.set(k, v)
  const phrases: Array<[string, string]> = Object.entries(g.phrases).sort(
    (a, b) => b[0].length - a[0].length
  )
  const wordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(g.words)) wordMap.set(k.toLocaleLowerCase('en'), v)
  const filterTags = new Set(Object.keys(g.tags))

  console.log(`İndiriliyor: ${MODS_URL}`)
  const res = await fetch(MODS_URL)
  if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, RawMod>

  console.log(`İndiriliyor: ${MODS_BY_BASE_URL}`)
  const mbbRes = await fetch(MODS_BY_BASE_URL)
  if (!mbbRes.ok) throw new Error(`İndirme başarısız: HTTP ${mbbRes.status}`)
  const mbb = (await mbbRes.json()) as Record<
    string,
    Record<string, { mods?: Record<string, Record<string, Record<string, number>>> }>
  >

  // mods_by_base: modId -> filtre grubu seti (hassas item-class eşlemesi).
  const modIdGroups = new Map<string, Set<string>>()
  for (const [cls, combos] of Object.entries(mbb)) {
    const grp = CLASS_GROUP[cls]
    if (!grp) continue
    for (const combo of Object.values(combos)) {
      const mm = combo.mods
      if (!mm) continue
      for (const aff of ['prefix', 'suffix'] as const) {
        const fams = mm[aff]
        if (!fams) continue
        for (const fam of Object.values(fams))
          for (const id of Object.keys(fam)) {
            let s = modIdGroups.get(id)
            if (!s) {
              s = new Set()
              modIdGroups.set(id, s)
            }
            s.add(grp)
          }
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  interface Group {
    en: string
    affix: 'prefix' | 'suffix'
    family: string
    stdTiers: Map<string, Tier> // gerçek item-kategorili (standart) tier'lar
    allTiers: Map<string, Tier> // tümü (özel kaynaklar dahil) — fallback
    tags: Set<string>
    applies: Set<string>
    fromMbb: boolean
    names: Set<string>
  }
  const groups = new Map<string, Group>()
  const patternLineCount = new Set<string>()

  for (const [id, m] of Object.entries(raw)) {
    if (m.domain !== 'item') continue
    if (m.generation_type !== 'prefix' && m.generation_type !== 'suffix') continue
    if (!m.text || !m.text.trim()) continue

    const cleaned = cleanLinks(m.text)
    const lines = cleaned
      .split(/\n/)
      .map((l) => normLine(l))
      .filter((l) => l.length > 0)
    if (!lines.length) continue
    lines.forEach((l) => patternLineCount.add(l))
    const en = lines.join('\n')
    const affix = m.generation_type as 'prefix' | 'suffix'
    // Grup anahtarı: affix + metin + mod ailesi (groups[0]). Aynı metni paylaşan
    // farklı aileler (ör. yerel silah vs küresel Ateş Hasarı) ayrı satır/ladder olur.
    const family = (m.groups ?? [])[0] ?? ''
    const key = affix + '|' + en + '|' + family

    let grp = groups.get(key)
    if (!grp) {
      grp = {
        en,
        affix,
        family,
        stdTiers: new Map(),
        allTiers: new Map(),
        tags: new Set(),
        applies: new Set(),
        fromMbb: false,
        names: new Set()
      }
      groups.set(key, grp)
    }
    for (const t of (m.implicit_tags ?? []).concat(m.adds_tags ?? []))
      if (filterTags.has(t)) grp.tags.add(t)
    // Bu üyenin item-kategori eşlemesi (mbb hassas, yoksa spawn_weights geniş).
    const memberApplies = new Set<string>()
    const mbbG = modIdGroups.get(id)
    if (mbbG) {
      grp.fromMbb = true
      for (const x of mbbG) memberApplies.add(x)
    }
    for (const w of m.spawn_weights ?? [])
      if (w.weight > 0) for (const x of swTagGroups(w.tag)) memberApplies.add(x)
    for (const x of memberApplies) grp.applies.add(x)
    if (m.name) grp.names.add(m.name)

    // Tier: standart kaynaklar (gerçek item tag'i olanlar) ladder'ı oluşturur;
    // essence/soul/corrupted gibi özel kaynaklar yalnızca fallback'te kalır.
    const lvl = m.required_level ?? 0
    const values = extractValues(cleaned)
    const tier: Tier = { level: lvl, values }
    grp.allTiers.set(lvl + '|' + values, tier)
    if (memberApplies.size > 0) grp.stdTiers.set(lvl + '|' + values, tier)
  }

  const modOverrides = loadModOverrides()
  let modOverrideHits = 0
  const records: ModRecord[] = []
  for (const grp of groups.values()) {
    const fileOv = modOverrides[grp.en]
    if (fileOv) modOverrideHits++
    const tr =
      fileOv ??
      grp.en
        .split('\n')
        .map((l) => translateLine(l, patternMap, phrases, wordMap))
        .join('\n')
    // Standart tier'lar varsa onları, yoksa tümünü (özel mod) kullan.
    // Sıralama: değer büyüklüğüne göre azalan (T1 = en güçlü), eşitlikte seviye.
    const tierSrc = grp.stdTiers.size > 0 ? grp.stdTiers : grp.allTiers
    const maxVal = (v: string): number => {
      const nums = (v.match(/\d[\d.]*/g) || []).map(Number)
      return nums.length ? Math.max(...nums) : 0
    }
    const tiers = [...tierSrc.values()].sort(
      (a, b) => maxVal(b.values) - maxVal(a.values) || b.level - a.level
    )
    const levels = tiers.map((t) => t.level)
    records.push({
      id: grp.affix + '_' + slugify(grp.en) + (grp.family ? '_' + slugify(grp.family) : ''),
      en: grp.en,
      tr,
      tr_status: modOverrides[grp.en] ? 'exists' : 'proposed',
      affix_type: grp.affix,
      affix_name: [...grp.names][0] ?? '',
      tags: [...grp.tags],
      required_level: levels.length ? Math.min(...levels) : 0,
      level_max: levels.length ? Math.max(...levels) : 0,
      tier_count: tiers.length,
      tiers,
      applies_to: [...grp.applies],
      category: 'mod',
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  records.sort((a, b) => {
    if (a.affix_type !== b.affix_type) return a.affix_type < b.affix_type ? -1 : 1
    return a.en.localeCompare(b.en, 'en')
  })

  // id benzersizleştir (aynı metin+aile slug'ı çakışırsa sayaç ekle).
  const idSeen = new Map<string, number>()
  for (const r of records) {
    const n = idSeen.get(r.id) ?? 0
    idSeen.set(r.id, n + 1)
    if (n > 0) r.id = `${r.id}_${n + 1}`
  }

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'mods.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')
  console.log(`  ELLE mod override (mods.tr.json): ${Object.keys(modOverrides).length} kayıt, kullanılan ${modOverrideHits}`)

  // --- Özet ---
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const emptyTr = records.filter((r) => !r.tr || !r.tr.trim()).length
  const prefix = records.filter((r) => r.affix_type === 'prefix').length
  const suffix = records.filter((r) => r.affix_type === 'suffix').length
  const withApplies = records.filter((r) => r.applies_to.length > 0).length
  const emptyApplies = records.length - withApplies
  let exactLines = 0
  let totalLines = 0
  for (const r of records)
    for (const l of r.en.split('\n')) {
      totalLines++
      if (patternMap.has(l)) exactLines++
    }
  const appliesCount: Record<string, number> = {}
  for (const r of records) for (const a of r.applies_to) appliesCount[a] = (appliesCount[a] ?? 0) + 1

  console.log('')
  console.log(`Yazıldı: ${records.length} mod kaydı (grup) -> ${outPath}`)
  console.log(`  affix -> prefix: ${prefix}, suffix: ${suffix}`)
  console.log(`  benzersiz tek-satır kalıp: ${patternLineCount.size}`)
  console.log(`  needs-translation: ${needs}; tr boş: ${emptyTr}`)
  console.log(`  satır çevirisi: exact ${exactLines}/${totalLines}, compositional ${totalLines - exactLines}`)
  console.log(`  applies_to dolu: ${withApplies}, boş (özel/mekanik mod): ${emptyApplies}`)
  console.log('  item türü başına grup: ' + Object.entries(appliesCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(', '))
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
