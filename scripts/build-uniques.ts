/**
 * build-uniques.ts
 * ----------------------------------------------------------------------------
 * RePoE poe2 fork uniques.json'dan EŞSİZ (unique) eşyaları çıkarır; poe2db'den
 * scrape edilmiş SABİT MOD + FLAVOUR önbelleğini (scripts/uniques-scrape-cache.json)
 * birleştirir; her kayda iki dilli alanlar ekleyip src/data/uniques.json yazar.
 * İkonları RePoE'den indirip src/renderer/assets/uniques/ altına kaydeder.
 *
 * Çalıştırma:  npm run build:uniques   (önce: node scripts/scrape-uniques.cjs)
 *
 * ÇEVİRİ:
 *  - Ad: glossary.names override -> yoksa İngilizce korunur (özel isim).
 *  - Mod: çöp/iç modlar filtrelenir; modOverrides (tam satır) -> yoksa
 *    compositional (uniques.modPhrases + items.implPhrases, uniques.modWords +
 *    items.implWords). Sayı/yüzde/(min-max) korunur; '(a-b) to (c-d)' -> 'ila'.
 *  - Flavour: tr-uniques-flavour.json'dan (edebi, elle). Yoksa flavour_tr boş.
 *  - needs-translation 0; mod çevirisi en kötü 'proposed'. Uydurma YOK: poe2db'de
 *    olmayan mod/flavour boş kalır.
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
const UNIQUES_URL = SOURCE_BASE + 'uniques.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe+poe2db'

const ICON_CONCURRENCY = 16
const ICON_RETRIES = 2

// --- Tipler --------------------------------------------------------------
type TrStatus = 'exists' | 'proposed' | 'needs-translation'

interface RawUnique {
  id: string
  name: string
  item_class: string
  visual_identity?: { dds_file?: string | null; id?: string | null } | null
}

interface UniquesGlossary {
  classes: Record<string, string>
  names: Record<string, { tr: string; status?: TrStatus }>
  modOverrides: Record<string, string>
  modPhrases: Record<string, string>
  modWords: Record<string, string>
}
interface ItemsGlossary {
  implicits: Record<string, string>
  implPhrases: Record<string, string>
  implWords: Record<string, string>
}
interface ScrapeEntry {
  en: string
  slug: string
  status: string
  mods: string[]
  flavour: string
}

interface UniqueRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  item_class: string
  item_class_tr: string
  icon: string | null
  mods_en: string[]
  mods_tr: string[]
  flavour_en: string
  flavour_tr: string
  category: 'unique'
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- Yollar --------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-uniques-glossary.json')
const itemsGlossaryPath = join(__dirname, 'tr-items-glossary.json')
const flavourPath = join(__dirname, 'tr-uniques-flavour.json')
const cachePath = join(__dirname, 'uniques-scrape-cache.json')
// ELLE TAM-CÜMLE mod override (kompozisyonel motoru bypass). Anahtar: tam mod_en.
// Build yalnız OKUR; rebuild'de EZİLMEZ. translateMod overrides Map'ine eklenir.
const modOverridePath = join(__dirname, 'overrides', 'uniques-mods.tr.json')

function loadFileOverrides(p: string): Record<string, string> {
  if (!existsSync(p)) return {}
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>
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
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'uniques')
const ICON_REL_PREFIX = 'assets/uniques/'

// --- Çöp/iç mod filtresi -------------------------------------------------
// poe2db gizli/iç modları ([1] ile biten id'ler, küçük harf başlayan teknik
// satırlar, [Custom/Lich's/Random ...] placeholder'ları) oyuncuya gösterilmez.
function isJunkMod(m: string): boolean {
  const t = (m || '').trim()
  if (!t) return true
  if (/\[\d/.test(t)) return true // [1], [1,33], [110] ...
  if (/^\[.*\]$/.test(t)) return true // tamamen köşeli placeholder
  if (/\[(Custom|Lich's|Random|Can gain|random stat)/i.test(t)) return true
  if (/^[a-z]/.test(t)) return true // küçük harfle başlayan iç id
  return false
}

// --- Compositional çevirici ---------------------------------------------
const SENT_OPEN = ''
const SENT_CLOSE = ''
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function translateMod(
  text: string,
  overrides: Map<string, string>,
  phrases: Array<[string, string]>,
  wordMap: Map<string, string>
): string {
  if (!text) return ''
  const ov = overrides.get(text)
  if (ov) return ov

  // Fiil-sonu yeniden sıralama: Türkçede fiil sona gelir. "Adds X" -> "X ekler".
  let suffix = ''
  const verb = text.match(/^(Adds|Gains|Gain|Leeches|Leech) (.+)$/)
  if (verb) {
    text = verb[2]
    suffix =
      verb[1] === 'Adds'
        ? ' ekler'
        : verb[1] === 'Gains'
          ? ' kazanır'
          : verb[1] === 'Gain'
            ? ' kazan'
            : ' emer'
  }

  const parts: string[] = []
  // İndeks PUA karakteriyle kodlanır (RAKAM DEĞİL) ki sayı koruma regex'i
  // sentinel'in kendi indeks rakamını tekrar yakalayıp bozmasın.
  const enc = (i: number): string => String.fromCharCode(0xe000 + i)
  const protect = (s: string): string => {
    const tok = SENT_OPEN + enc(parts.length) + SENT_CLOSE
    parts.push(s)
    return tok
  }
  let work = text.replace(/\([^)]*\)/g, (m) => protect(m))
  work = work.replace(/\{[^}]*\}/g, (m) => protect(m))
  work = work.replace(/[+-]?\d[\d.,]*%?/g, (m) => protect(m))
  // "(a-b) to (c-d)" aralıkları arasındaki 'to' -> 'ila'
  const sentTok = SENT_OPEN + '[\\ue000-\\uf8ff]' + SENT_CLOSE
  const rangeRe = new RegExp('(' + sentTok + ') to (' + sentTok + ')', 'g')
  work = work.replace(rangeRe, '$1 ila $2')

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

// --- İkon yardımcıları ---------------------------------------------------
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
    if (existing.has(base)) existed++
    else todo.push([base, url])
  }
  let downloaded = 0
  const failed = new Set<string>()
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < todo.length) {
      const [base, url] = todo[idx++]
      if (await downloadIcon(url, join(iconDir, base))) downloaded++
      else failed.add(base)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(ICON_CONCURRENCY, todo.length) }, () => worker())
  )
  return { downloaded, existed, failed }
}

function readJson<T>(p: string, fallback: T): T {
  if (!existsSync(p)) return fallback
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as T
  } catch {
    return fallback
  }
}

async function main(): Promise<void> {
  const glossary = readJson<UniquesGlossary>(glossaryPath, {
    classes: {},
    names: {},
    modOverrides: {},
    modPhrases: {},
    modWords: {}
  })
  const items = readJson<ItemsGlossary>(itemsGlossaryPath, {
    implicits: {},
    implPhrases: {},
    implWords: {}
  })
  const flavourMap = readJson<Record<string, string>>(flavourPath, {})
  const cache = readJson<Record<string, ScrapeEntry>>(cachePath, {})
  const cacheReady = Object.keys(cache).length > 0

  // Birleşik çeviri katmanları (uniques öncelikli).
  const overrides = new Map<string, string>()
  for (const [k, v] of Object.entries(items.implicits)) overrides.set(k, v)
  for (const [k, v] of Object.entries(glossary.modOverrides)) overrides.set(k, v)
  // ELLE dosya override (en yüksek öncelik, rebuild'de ezilmez).
  const fileOverrides = loadFileOverrides(modOverridePath)
  for (const [k, v] of Object.entries(fileOverrides)) overrides.set(k, v)
  console.log(`  ELLE mod override (uniques-mods.tr.json): ${Object.keys(fileOverrides).length}`)

  const phraseMap = new Map<string, string>()
  for (const [k, v] of Object.entries(items.implPhrases)) phraseMap.set(k, v)
  for (const [k, v] of Object.entries(glossary.modPhrases)) phraseMap.set(k, v)
  const phrases: Array<[string, string]> = [...phraseMap.entries()].sort(
    (a, b) => b[0].length - a[0].length
  )

  const wordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(items.implWords))
    wordMap.set(k.toLocaleLowerCase('en'), v)
  for (const [k, v] of Object.entries(glossary.modWords))
    wordMap.set(k.toLocaleLowerCase('en'), v)

  console.log(`İndiriliyor: ${UNIQUES_URL}`)
  const res = await fetch(UNIQUES_URL)
  if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, RawUnique>
  const today = new Date().toISOString().slice(0, 10)

  const records: UniqueRecord[] = []
  const iconByBasename = new Map<string, string>()
  const seenNames = new Set<string>()
  let handName = 0
  const missingClass = new Set<string>()
  let withMods = 0
  let withFlavEn = 0
  let withFlavTr = 0
  let noCacheData = 0

  for (const u of Object.values(raw)) {
    if (!u.name || u.name.startsWith('[')) continue
    if (seenNames.has(u.name)) continue
    seenNames.add(u.name)

    const en = u.name
    const classTr = glossary.classes[u.item_class]
    if (!classTr) missingClass.add(u.item_class)

    // Ad çevirisi
    let tr: string
    let status: TrStatus
    const override = glossary.names[en]
    if (override && override.tr) {
      tr = override.tr
      status = override.status ?? 'proposed'
      handName++
    } else {
      tr = en
      status = 'proposed'
    }

    // Mod + flavour (önbellekten)
    const entry = cache[u.id]
    if (!entry) noCacheData++
    const modsRaw = (entry?.mods ?? []).filter((m) => !isJunkMod(m))
    const modsEn: string[] = []
    const seenMod = new Set<string>()
    for (const m of modsRaw) {
      if (seenMod.has(m)) continue // aynı satır iki kez (poe2db varyant) -> tek
      seenMod.add(m)
      modsEn.push(m)
    }
    const modsTr = modsEn.map((m) => translateMod(m, overrides, phrases, wordMap))
    const flavourEn = entry?.flavour ?? ''
    // anahtar: unique adı (newline-güvenli). " / " satır ayracı -> gerçek \n
    // (EN flavour da \n kullanır; UI ikisini de satır satır gösterir).
    const flavourTr = (flavourMap[en] ?? '').replace(/ \/ /g, '\n')
    if (modsEn.length) withMods++
    if (flavourEn) withFlavEn++
    if (flavourTr) withFlavTr++

    // İkon
    let icon: string | null = null
    const dds = u.visual_identity?.dds_file
    if (dds && /[^/]+\.dds$/i.test(dds)) {
      const base = iconBasename(dds)
      iconByBasename.set(base, iconUrl(dds))
      icon = ICON_REL_PREFIX + base
    }

    records.push({
      id: u.id,
      en,
      tr,
      tr_status: status,
      item_class: u.item_class,
      item_class_tr: classTr ?? u.item_class,
      icon,
      mods_en: modsEn,
      mods_tr: modsTr,
      flavour_en: flavourEn,
      flavour_tr: flavourTr,
      category: 'unique',
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  records.sort((a, b) => {
    const c = a.item_class.localeCompare(b.item_class, 'en')
    if (c !== 0) return c
    return a.en.localeCompare(b.en, 'en')
  })

  console.log(`İkonlar indiriliyor (${iconByBasename.size} benzersiz dosya)...`)
  const iconResult = await downloadIcons(iconByBasename)
  let iconCleared = 0
  if (iconResult.failed.size > 0) {
    for (const r of records) {
      if (r.icon && iconResult.failed.has(r.icon.slice(ICON_REL_PREFIX.length))) {
        r.icon = null
        iconCleared++
      }
    }
  }

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'uniques.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- Özet ---
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const proposed = records.filter((r) => r.tr_status === 'proposed').length
  const emptyTr = records.filter((r) => !r.tr || !r.tr.trim()).length
  const withIcon = records.filter((r) => r.icon).length
  const modLinesTotal = records.reduce((s, r) => s + r.mods_en.length, 0)

  console.log('')
  if (!cacheReady)
    console.log('UYARI: scrape önbelleği yok/boş — önce: node scripts/scrape-uniques.cjs')
  console.log(`Yazıldı: ${records.length} unique -> ${outPath}`)
  console.log(`  tr_status -> proposed: ${proposed}, needs-translation: ${needs}; tr(ad) boş: ${emptyTr}`)
  console.log(`  ad: override ${handName}, İngilizce korunan ${records.length - handName}`)
  console.log(`  mod dolu: ${withMods}/${records.length} unique (toplam ${modLinesTotal} mod satırı, çöp filtrelendi)`)
  console.log(`  flavour: en dolu ${withFlavEn}, tr dolu ${withFlavTr} (tr boşsa 2b adımında doldurulacak)`)
  console.log(`  önbellek verisi olmayan unique: ${noCacheData}`)
  console.log(`  ikon dolu: ${withIcon}/${records.length} (indirilen ${iconResult.downloaded}, vardı ${iconResult.existed}, başarısız ${iconResult.failed.size}, temizlenen ${iconCleared})`)
  if (missingClass.size > 0)
    console.log('  UYARI: glossary.classes eksik: ' + [...missingClass].join(', '))
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
