/**
 * build-currency.ts
 * ----------------------------------------------------------------------------
 * RePoE poe2 fork'taki base_items.json'dan currency (orb, shard, rune, essence,
 * soul core, omen, catalyst, idol...) kayitlarini cikarir, her kayda iki dilli
 * (en + tr + tr_status) alanlar ekler ve src/data/currency.json olarak yazar.
 *
 * Ayrica her currency'nin ikonunu RePoE'den (PNG) indirip
 * src/renderer/assets/currency/ altina kaydeder.
 *
 * Calistirma:  npm run build:currency
 *
 * CEVIRI MANTIGI (proje talimatları ile tutarli, build-gems.ts deseni):
 *  - Eslestirme anahtari her zaman EN'dir; tr ikinci alan.
 *  - AD cevirisi: once tr-currency-glossary.json -> "names" override (Opus/elle,
 *    dogal ceviri). Yoksa "phrases" (cok kelimeli, uzun once) + "words" (tek
 *    kelime) ile bileske ceviri uygulanir. Bilinmeyen kelime (genelde ozel ad:
 *    Vaal, Kalandra, Hayoxi...) Ingilizce kalir.
 *  - ACIKLAMA cevirisi: "descriptions" override -> yoksa "descPhrases" +
 *    "descWords" bileske. Sayi/yuzde/{..} yer tutucu AYNEN korunur.
 *  - Hicbir kayit "needs-translation" olmaz: bileske fallback daima dolu bir tr
 *    uretir, durum en kotu "proposed" olur.
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
// Rune / Soul Core soket etkileri base_items'ta YOK; augments.json'da (eşya
// türüne göre stat_text). base desc boşsa buradan doldururuz.
const AUGMENTS_URL = SOURCE_BASE + 'augments.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

// Currency sayilan item_class'lar.
const CURRENCY_CLASSES = new Set([
  'StackableCurrency',
  'SoulCore',
  'Omen',
  'DelveStackableSocketableCurrency',
  'DelveSocketableCurrency'
])

const ICON_CONCURRENCY = 16
const ICON_RETRIES = 2
const DROP_WORDS = new Set(['of', 'the', 'a', 'an'])

// --- Tipler --------------------------------------------------------------
type TrStatus = 'exists' | 'proposed' | 'needs-translation'

interface RawBaseItem {
  name: string
  item_class: string
  release_state: string
  tags?: string[] | null
  properties?: {
    description?: string | null
    directions?: string | null
  } | null
  visual_identity?: {
    dds_file?: string | null
    id?: string | null
  } | null
}

interface CurrencyGlossary {
  _comment?: string
  /** Alt tur (subtype) -> Turkce gosterim etiketi. */
  subtypes: Record<string, string>
  /** Opus/elle ad cevirileri: en ad -> { tr, status }. */
  names: Record<string, { tr: string; status?: TrStatus }>
  /** Ad cevirisi: cok kelimeli kaliplar (uzun once). */
  phrases: Record<string, string>
  /** Ad cevirisi: tek kelime sozlugu. */
  words: Record<string, string>
  /** Opus/elle aciklama cevirileri: en ad -> dogal Turkce desc. */
  descriptions: Record<string, string>
  /** Aciklama cevirisi: cok kelimeli kaliplar (uzun once). */
  descPhrases: Record<string, string>
  /** Aciklama cevirisi: tek kelime sozlugu. */
  descWords: Record<string, string>
}

interface CurrencyRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  desc_en: string
  desc_tr: string
  category: 'currency'
  subtype: string
  subtype_tr: string
  icon: string | null
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- Yollar --------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-currency-glossary.json')
// ELLE TAM-CÜMLE override (kompozisyonel motoru bypass eder). Anahtar: kayıt id'si
// VEYA tam İngilizce açıklama (desc_en). Build yalnız OKUR; rebuild'de EZİLMEZ.
const descOverridePath = join(__dirname, 'overrides', 'currency-desc.tr.json')
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'currency')
const ICON_REL_PREFIX = 'assets/currency/'

/** currency-desc.tr.json yükle: { "<id veya desc_en>": "<doğal TR>" }. Yoksa {}. */
function loadDescOverrides(): Record<string, string> {
  if (!existsSync(descOverridePath)) return {}
  try {
    const raw = JSON.parse(readFileSync(descOverridePath, 'utf-8')) as Record<string, string>
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

// --- Yardimcilar ---------------------------------------------------------
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** [A|B] -> B (oyunda gosterilen metin), [A] -> A. */
function cleanLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split('|')
    return parts.length > 1 ? parts[1] : parts[0]
  })
}

// --- Augments (rune / soul core soket etkileri) --------------------------
interface AugmentCategory {
  stat_text?: string[]
}
interface AugmentEntry {
  categories?: Record<string, AugmentCategory>
}
type Augments = Record<string, AugmentEntry>

/** Augment kategori adı (eşya türü) -> TR. */
const AUG_CAT_TR: Record<string, string> = {
  All: 'Tümü',
  Armour: 'Zırh',
  'Body Armour': 'Gövde Zırhı',
  Boots: 'Bot',
  Bow: 'Yay',
  Buckler: 'Küçük Kalkan',
  'Caster Weapon': 'Büyücü Silahı',
  Gloves: 'Eldiven',
  Helmet: 'Başlık',
  'Martial Weapon': 'Savaş Silahı',
  'One Hand Mace': 'Tek El Topuz',
  Quarterstaff: 'Asa Sopası',
  Sceptre: 'Asa',
  Shield: 'Kalkan',
  'Shield or Buckler': 'Kalkan veya Küçük Kalkan',
  Spear: 'Mızrak',
  Talisman: 'Tılsım',
  'Two Hand Mace': 'Çift El Topuz',
  Wand: 'Değnek',
  'Wand or Staff': 'Değnek veya Asa'
}

/** augments.json girdisinden EN açıklama kur (her satır: "Tür: etki"). */
function buildAugmentDescEn(entry: AugmentEntry | undefined): string {
  if (!entry?.categories) return ''
  const lines: string[] = []
  for (const [cat, v] of Object.entries(entry.categories)) {
    const text = (v.stat_text ?? [])
      .map((s) => cleanLinks(s).replace(/\s*\n\s*/g, ' ').trim())
      .filter((s) => s.length > 0)
      .join(' / ')
    if (text) lines.push(`${cat}: ${text}`)
  }
  return lines.join('\n')
}

/** Alt turu (subtype) tag/ad uzerinden belirler. */
function subtypeOf(it: RawBaseItem): string {
  const t = new Set(it.tags ?? [])
  if (it.item_class === 'Omen') return 'omen'
  if (t.has('rune') || t.has('mushrune') || /\bRune$/.test(it.name)) return 'rune'
  if (t.has('essence')) return 'essence'
  if (t.has('soul_core') || /Soul Core/i.test(it.name)) return 'soul_core'
  if (t.has('catalyst') || t.has('jewel_catalyst') || /Catalyst$/.test(it.name))
    return 'catalyst'
  if (
    t.has('idol') ||
    t.has('primal_idol') ||
    t.has('vivid_idol') ||
    t.has('wild_idol')
  )
    return 'idol'
  if (/Splinter$/.test(it.name) || [...t].some((x) => /splinter/.test(x)))
    return 'splinter'
  if (t.has('currency_shard') || /Shard$/.test(it.name)) return 'shard'
  if (/Fragment$/.test(it.name)) return 'fragment'
  if (/\bOrb\b/.test(it.name)) return 'orb'
  return 'currency'
}

/**
 * Bir metni (ad veya aciklama satiri) bileske olarak cevirir:
 *  1. Sayi/yuzde ve {..} yer tutucularini korur.
 *  2. phrases kaliplarini (uzun once) uygular ve korur.
 *  3. Kalan kelimeleri words sozlugu ile cevirir.
 *  4. Korunan parcalari geri koyar.
 * Sozlukte olmayan kelime Ingilizce kalir.
 */
const SENT_OPEN = ''
const SENT_CLOSE = ''
function translateCompositional(
  text: string,
  phrases: Array<[string, string]>,
  wordMap: Map<string, string>,
  dropSmallWords: boolean
): string {
  if (!text) return ''
  const protectedParts: string[] = []
  const protect = (s: string): string => {
    const token = SENT_OPEN + protectedParts.length + SENT_CLOSE
    protectedParts.push(s)
    return token
  }

  let work = text.replace(/\{[^}]*\}/g, (m) => protect(m))
  work = work.replace(/\d[\d.,]*%?/g, (m) => protect(m))

  for (const [en, tr] of phrases) {
    const re = new RegExp(escapeRegExp(en), 'gi')
    work = work.replace(re, () => protect(tr))
  }

  const tokens = work.split(/(\s+)/)
  const out = tokens.map((tok) => {
    if (/^\s+$/.test(tok) || tok.length === 0) return tok
    if (tok.includes(SENT_OPEN)) return tok
    const lead = (tok.match(/^[^0-9A-Za-zÀ-ÿ]+/) || [''])[0]
    const trail = (tok.match(/[^0-9A-Za-zÀ-ÿ]+$/) || [''])[0]
    const core = tok.slice(lead.length, tok.length - trail.length)
    if (core.length === 0) return tok
    const lower = core.toLocaleLowerCase('en')
    if (dropSmallWords && DROP_WORDS.has(lower)) return lead + trail
    if (wordMap.has(lower)) {
      const hit = wordMap.get(lower) as string
      if (hit === '') return lead + trail
      return lead + hit + trail
    }
    return tok
  })
  work = out.join('')

  work = work.replace(
    new RegExp(SENT_OPEN + '(\\d+)' + SENT_CLOSE, 'g'),
    (_m, i: string) => protectedParts[Number(i)]
  )
  // Cift bosluklari sadelestir.
  return work.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim()
}

/** Ikon kaynagini DDS yolundan PNG indirme URL'sine cevirir. */
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
      const buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(dest, buf)
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
    if (existing.has(base)) {
      existed++
      continue
    }
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
  const workers = Array.from(
    { length: Math.min(ICON_CONCURRENCY, todo.length) },
    () => worker()
  )
  await Promise.all(workers)
  return { downloaded, existed, failed }
}

function loadGlossary(): CurrencyGlossary {
  const g = JSON.parse(readFileSync(glossaryPath, 'utf-8')) as CurrencyGlossary
  g.subtypes ??= {}
  g.names ??= {}
  g.phrases ??= {}
  g.words ??= {}
  g.descriptions ??= {}
  g.descPhrases ??= {}
  g.descWords ??= {}
  return g
}

async function main(): Promise<void> {
  const glossary = loadGlossary()
  const descOverrides = loadDescOverrides()
  let descOverrideHits = 0

  const nameWordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(glossary.words))
    nameWordMap.set(k.toLocaleLowerCase('en'), v)
  const namePhrases: Array<[string, string]> = Object.entries(glossary.phrases)
    .map(([k, v]) => [k.toLocaleLowerCase('en'), v] as [string, string])
    .sort((a, b) => b[0].length - a[0].length)

  const descWordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(glossary.descWords))
    descWordMap.set(k.toLocaleLowerCase('en'), v)
  const descPhrases: Array<[string, string]> = Object.entries(glossary.descPhrases)
    .map(([k, v]) => [k.toLocaleLowerCase('en'), v] as [string, string])
    .sort((a, b) => b[0].length - a[0].length)

  console.log(`İndiriliyor: ${BASE_ITEMS_URL}`)
  const res = await fetch(BASE_ITEMS_URL)
  if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, RawBaseItem>
  const today = new Date().toISOString().slice(0, 10)

  console.log(`İndiriliyor: ${AUGMENTS_URL}`)
  const augRes = await fetch(AUGMENTS_URL)
  if (!augRes.ok) throw new Error(`İndirme başarısız: HTTP ${augRes.status}`)
  const augments = (await augRes.json()) as Augments

  const records: CurrencyRecord[] = []
  const iconByBasename = new Map<string, string>()
  const seenNames = new Set<string>()
  let handName = 0
  let handDesc = 0
  let augDesc = 0

  for (const [metaId, it] of Object.entries(raw)) {
    if (!CURRENCY_CLASSES.has(it.item_class)) continue
    if (it.release_state !== 'released') continue
    if (!it.name || it.name.startsWith('[')) continue
    if (seenNames.has(it.name)) continue // ayni ad tekrar etmesin
    seenNames.add(it.name)

    const en = it.name
    const subtype = subtypeOf(it)
    const subtypeTr = glossary.subtypes[subtype] ?? subtype

    // --- Ad cevirisi ---
    let tr: string
    let status: TrStatus
    const override = glossary.names[en]
    if (override && override.tr) {
      tr = override.tr
      status = override.status ?? 'proposed'
      handName++
    } else {
      tr = translateCompositional(en, namePhrases, nameWordMap, true)
      status = 'proposed'
    }

    // --- Aciklama: description (+ directions) ---
    const descParts: string[] = []
    const d = it.properties?.description
    const dir = it.properties?.directions
    if (d) descParts.push(cleanLinks(d).replace(/\s*\n\s*/g, ' ').trim())
    if (dir) descParts.push(cleanLinks(dir).replace(/\s*\n\s*/g, ' ').trim())
    let descEn = descParts.filter((x) => x.length > 0).join('\n')

    // Rune / Soul Core: base desc boşsa augments.json'dan eşya-türü etkilerini
    // doldur ("Tür: etki" satırları). Aksi halde bu kayıtlar boş desc kalırdı.
    let fromAugment = false
    if (!descEn) {
      const augEn = buildAugmentDescEn(augments[metaId])
      if (augEn) {
        descEn = augEn
        fromAugment = true
        augDesc++
      }
    }

    let descTr = ''
    if (descEn) {
      // ÖNCE elle tam-cümle override: id ile, yoksa tam desc_en ile eşle.
      // Override varsa kompozisyonel motoru BYPASS et ve kaydı 'exists' yap.
      const fullOver = descOverrides[metaId] ?? descOverrides[descEn]
      const handOver = glossary.descriptions[en]
      if (fullOver) {
        descTr = fullOver
        status = 'exists'
        descOverrideHits++
      } else if (handOver && handOver.trim()) {
        descTr = handOver
        handDesc++
      } else if (fromAugment) {
        // "Tür: etki" -> "TürTR: etkiTR" (tür map'ten, etki bileşke çeviriden).
        descTr = descEn
          .split('\n')
          .map((l) => {
            const ix = l.indexOf(': ')
            if (ix < 0) return translateCompositional(l, descPhrases, descWordMap, false)
            const cat = l.slice(0, ix)
            const rest = l.slice(ix + 2)
            const catTr = AUG_CAT_TR[cat] ?? cat
            const restTr = rest
              .split(' / ')
              .map((seg) => translateCompositional(seg, descPhrases, descWordMap, false))
              .join(' / ')
            return `${catTr}: ${restTr}`
          })
          .join('\n')
      } else {
        descTr = descEn
          .split('\n')
          .map((l) => translateCompositional(l, descPhrases, descWordMap, false))
          .join('\n')
      }
    }

    // --- Ikon ---
    let icon: string | null = null
    const dds = it.visual_identity?.dds_file
    if (dds && /[^/]+\.dds$/i.test(dds)) {
      const base = iconBasename(dds)
      iconByBasename.set(base, iconUrl(dds))
      icon = ICON_REL_PREFIX + base
    }

    records.push({
      id: metaId,
      en,
      tr,
      tr_status: status,
      desc_en: descEn,
      desc_tr: descTr,
      category: 'currency',
      subtype,
      subtype_tr: subtypeTr,
      icon,
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  records.sort((a, b) => a.en.localeCompare(b.en, 'en'))

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
  const outPath = join(outDir, 'currency.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- Ozet ---
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const proposed = records.filter((r) => r.tr_status === 'proposed').length
  const exists = records.filter((r) => r.tr_status === 'exists').length
  const emptyTr = records.filter((r) => !r.tr || !r.tr.trim()).length
  const withDescEn = records.filter((r) => r.desc_en.trim()).length
  const withDescTr = records.filter((r) => r.desc_tr.trim()).length
  const withIcon = records.filter((r) => r.icon).length
  const bySub: Record<string, number> = {}
  for (const r of records) bySub[r.subtype] = (bySub[r.subtype] ?? 0) + 1

  console.log('')
  console.log(`Yazıldı: ${records.length} currency -> ${outPath}`)
  console.log(`  tr_status -> exists: ${exists}, proposed: ${proposed}, needs-translation: ${needs}`)
  console.log(`  desc elle-override (tam cümle) kullanıldı: ${descOverrideHits}`)
  console.log(`  tr (ad) boş: ${emptyTr}`)
  console.log(`  ad: Opus/elle override ${handName}, bileşke ${records.length - handName}`)
  console.log(`  açıklama: dolu(en) ${withDescEn}, dolu(tr) ${withDescTr}, Opus/elle override ${handDesc}, augments'ten ${augDesc}`)
  const emptyRuneCore = records.filter(
    (r) => (r.subtype === 'rune' || r.subtype === 'soul_core') && !r.desc_en.trim()
  ).length
  console.log(`  rune+soul_core boş açıklama: ${emptyRuneCore}`)
  console.log(`  ikon dolu: ${withIcon}/${records.length} (indirilen ${iconResult.downloaded}, vardı ${iconResult.existed}, başarısız ${iconResult.failed.size}, temizlenen ${iconCleared})`)
  console.log('  alt türler: ' + Object.entries(bySub).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(', '))
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
