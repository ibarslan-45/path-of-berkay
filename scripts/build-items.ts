/**
 * build-items.ts
 * ----------------------------------------------------------------------------
 * RePoE poe2 fork'taki base_items.json'dan GERCEK EKIPMAN TABANLARINI (silah,
 * zirh, taki, off-hand) cikarir; her kayda iki dilli (en + tr + tr_status)
 * alanlar, taban statlar ve implicit mod ekler; src/data/items.json yazar.
 *
 * Ayrica her tabanin ikonunu RePoE'den (PNG) indirip
 * src/renderer/assets/items/ altina kaydeder.
 *
 * Calistirma:  npm run build:items
 *
 * CEVIRI MANTIGI (proje talimatları + build-currency.ts deseni ile bire bir):
 *  - Eslestirme anahtari her zaman EN'dir; tr ikinci alan.
 *  - AD cevirisi: once names override -> yoksa phrases + words bileske ceviri.
 *    Bilinmeyen kelime (ozel ad: Vaal, Maraketh, Sekhema...) Ingilizce kalir.
 *  - IMPLICIT cevirisi: implicits override -> yoksa implPhrases + implWords
 *    bileske. Sayi/yuzde/(min-max) yer tutucu AYNEN korunur.
 *  - item_class ve slot sabit sozlukten cevrilir.
 *  - Hicbir kayit "needs-translation" olmaz: bileske fallback daima dolu tr
 *    uretir, durum en kotu "proposed".
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
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

const ICON_CONCURRENCY = 16
const ICON_RETRIES = 2
const DROP_WORDS = new Set(['of', 'the', 'a', 'an'])

// Hedef item_class'lar -> kaba grup (slot). item_class_tr glossary'den gelir.
const CLASS_SLOT: Record<string, string> = {
  'One Hand Mace': 'weapon',
  'Two Hand Mace': 'weapon',
  'One Hand Sword': 'weapon',
  'Two Hand Sword': 'weapon',
  'One Hand Axe': 'weapon',
  'Two Hand Axe': 'weapon',
  Spear: 'weapon',
  Dagger: 'weapon',
  Claw: 'weapon',
  Bow: 'weapon',
  Crossbow: 'weapon',
  Wand: 'weapon',
  Staff: 'weapon',
  Warstaff: 'weapon',
  Sceptre: 'weapon',
  Flail: 'weapon',
  Helmet: 'armour',
  'Body Armour': 'armour',
  Gloves: 'armour',
  Boots: 'armour',
  Ring: 'jewellery',
  Amulet: 'jewellery',
  Belt: 'jewellery',
  Shield: 'offhand',
  Buckler: 'offhand',
  Focus: 'offhand',
  Quiver: 'offhand'
}

// Zirh attribute tag'i -> attribute kodu.
const ARMOUR_ATTR: Record<string, string> = {
  str_armour: 'str',
  dex_armour: 'dex',
  int_armour: 'int',
  str_dex_armour: 'str_dex',
  str_int_armour: 'str_int',
  dex_int_armour: 'dex_int',
  str_dex_int_armour: 'str_dex_int'
}

// --- Tipler --------------------------------------------------------------
type TrStatus = 'exists' | 'proposed' | 'needs-translation'

interface MinMax {
  min: number
  max: number
}
interface RawProps {
  armour?: MinMax | null
  evasion?: MinMax | null
  energy_shield?: MinMax | null
  ward?: MinMax | null
  block?: number | null
  movement_speed?: number | null
  attack_time?: number | null
  critical_strike_chance?: number | null
  physical_damage_min?: number | null
  physical_damage_max?: number | null
}
interface RawReq {
  strength?: number
  dexterity?: number
  intelligence?: number
  level?: number
}
interface RawBaseItem {
  name: string
  item_class: string
  release_state: string
  drop_level?: number | null
  tags?: string[] | null
  implicits?: string[] | null
  properties?: RawProps | null
  requirements?: RawReq | null
  visual_identity?: {
    dds_file?: string | null
    id?: string | null
  } | null
}
interface RawMod {
  text?: string | null
}

interface ItemsGlossary {
  _comment?: string
  /** item_class -> Turkce gosterim. */
  classes: Record<string, string>
  /** slot (weapon/armour/jewellery/offhand) -> Turkce gosterim. */
  slots: Record<string, string>
  /** attribute kodu -> Turkce gosterim. */
  attributes: Record<string, string>
  /** Opus/elle ad cevirileri: en ad -> { tr, status }. */
  names: Record<string, { tr: string; status?: TrStatus }>
  /** Ad cevirisi: cok kelimeli kaliplar (uzun once). */
  phrases: Record<string, string>
  /** Ad cevirisi: tek kelime sozlugu. */
  words: Record<string, string>
  /** Opus/elle implicit cevirileri: en metin -> dogal Turkce. */
  implicits: Record<string, string>
  /** Implicit cevirisi: cok kelimeli kaliplar (uzun once). */
  implPhrases: Record<string, string>
  /** Implicit cevirisi: tek kelime sozlugu. */
  implWords: Record<string, string>
}

interface BaseStats {
  armour?: number
  evasion?: number
  energy_shield?: number
  ward?: number
  block?: number
  phys_min?: number
  phys_max?: number
  aps?: number
  crit?: number
  req_level?: number
  req_str?: number
  req_dex?: number
  req_int?: number
  drop_level?: number
}

interface ItemRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  item_class: string
  item_class_tr: string
  slot: string
  slot_tr: string
  attribute: string
  attribute_tr: string
  base_stats: BaseStats
  implicit_en: string
  implicit_tr: string
  icon: string | null
  category: 'item'
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- Yollar --------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-items-glossary.json')
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'items')
const ICON_REL_PREFIX = 'assets/items/'

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

/** properties'teki {min,max} -> tek deger (taban: min===max). */
function flat(v: MinMax | null | undefined): number | undefined {
  if (!v || typeof v.min !== 'number') return undefined
  return v.min
}

/** Tabanin attribute kodunu tag/req'den belirler. */
function attrOf(it: RawBaseItem): string {
  const tags = it.tags ?? []
  for (const t of tags) {
    if (ARMOUR_ATTR[t]) return ARMOUR_ATTR[t]
  }
  const r = it.requirements
  if (r) {
    const parts: string[] = []
    if ((r.strength ?? 0) > 0) parts.push('str')
    if ((r.dexterity ?? 0) > 0) parts.push('dex')
    if ((r.intelligence ?? 0) > 0) parts.push('int')
    if (parts.length) return parts.join('_')
  }
  return ''
}

/**
 * Bir metni (ad veya implicit satiri) bileske olarak cevirir.
 * (build-currency.ts translateCompositional ile ayni.)
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

  // (min-max) ve {..} ve sayi/yuzde yer tutucularini koru.
  let work = text.replace(/\([^)]*\)/g, (m) => protect(m))
  work = work.replace(/\{[^}]*\}/g, (m) => protect(m))
  work = work.replace(/[+-]?\d[\d.,]*%?/g, (m) => protect(m))

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

function loadGlossary(): ItemsGlossary {
  const g = JSON.parse(readFileSync(glossaryPath, 'utf-8')) as ItemsGlossary
  g.classes ??= {}
  g.slots ??= {}
  g.attributes ??= {}
  g.names ??= {}
  g.phrases ??= {}
  g.words ??= {}
  g.implicits ??= {}
  g.implPhrases ??= {}
  g.implWords ??= {}
  return g
}

async function main(): Promise<void> {
  const glossary = loadGlossary()

  const nameWordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(glossary.words))
    nameWordMap.set(k.toLocaleLowerCase('en'), v)
  const namePhrases: Array<[string, string]> = Object.entries(glossary.phrases)
    .map(([k, v]) => [k.toLocaleLowerCase('en'), v] as [string, string])
    .sort((a, b) => b[0].length - a[0].length)

  const implWordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(glossary.implWords))
    implWordMap.set(k.toLocaleLowerCase('en'), v)
  const implPhrases: Array<[string, string]> = Object.entries(glossary.implPhrases)
    .map(([k, v]) => [k.toLocaleLowerCase('en'), v] as [string, string])
    .sort((a, b) => b[0].length - a[0].length)

  console.log(`İndiriliyor: ${BASE_ITEMS_URL}`)
  const res = await fetch(BASE_ITEMS_URL)
  if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, RawBaseItem>

  console.log(`İndiriliyor: ${MODS_URL}`)
  const modsRes = await fetch(MODS_URL)
  if (!modsRes.ok) throw new Error(`İndirme başarısız: HTTP ${modsRes.status}`)
  const mods = (await modsRes.json()) as Record<string, RawMod>

  const today = new Date().toISOString().slice(0, 10)

  const records: ItemRecord[] = []
  const iconByBasename = new Map<string, string>()
  const seenNames = new Set<string>()
  let handName = 0
  let handImpl = 0

  for (const [metaId, it] of Object.entries(raw)) {
    if (!CLASS_SLOT[it.item_class]) continue
    if (it.release_state !== 'released') continue
    if (!it.name || it.name.startsWith('[')) continue
    if ((it.tags ?? []).includes('not_for_sale')) continue
    if (seenNames.has(it.name)) continue // ayni ad tekrar etmesin
    seenNames.add(it.name)

    const en = it.name
    const slot = CLASS_SLOT[it.item_class]
    const slotTr = glossary.slots[slot] ?? slot
    const classTr = glossary.classes[it.item_class] ?? it.item_class
    const attribute = attrOf(it)
    const attributeTr = glossary.attributes[attribute] ?? ''

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

    // --- Taban statlar ---
    const p = it.properties ?? {}
    const r = it.requirements ?? {}
    const bs: BaseStats = {}
    const armour = flat(p.armour)
    const evasion = flat(p.evasion)
    const es = flat(p.energy_shield)
    const ward = flat(p.ward)
    if (armour !== undefined) bs.armour = armour
    if (evasion !== undefined) bs.evasion = evasion
    if (es !== undefined) bs.energy_shield = es
    if (ward !== undefined) bs.ward = ward
    if (typeof p.block === 'number' && p.block > 0) bs.block = p.block
    if (typeof p.physical_damage_min === 'number') bs.phys_min = p.physical_damage_min
    if (typeof p.physical_damage_max === 'number') bs.phys_max = p.physical_damage_max
    if (typeof p.attack_time === 'number' && p.attack_time > 0)
      bs.aps = Math.round((1000 / p.attack_time) * 100) / 100
    if (typeof p.critical_strike_chance === 'number')
      bs.crit = Math.round((p.critical_strike_chance / 100) * 100) / 100
    if (typeof it.drop_level === 'number') bs.drop_level = it.drop_level
    if (typeof r.level === 'number' && r.level > 1) bs.req_level = r.level
    if ((r.strength ?? 0) > 0) bs.req_str = r.strength
    if ((r.dexterity ?? 0) > 0) bs.req_dex = r.dexterity
    if ((r.intelligence ?? 0) > 0) bs.req_int = r.intelligence

    // --- Implicit mod(lar) ---
    const implLines: string[] = []
    for (const id of it.implicits ?? []) {
      const m = mods[id]
      if (m && m.text) implLines.push(cleanLinks(m.text).replace(/\s*\n\s*/g, ' ').trim())
    }
    const implicitEn = implLines.filter((x) => x.length > 0).join('\n')
    let implicitTr = ''
    if (implicitEn) {
      implicitTr = implicitEn
        .split('\n')
        .map((line) => {
          const handOver = glossary.implicits[line]
          if (handOver && handOver.trim()) {
            handImpl++
            return handOver
          }
          return translateCompositional(line, implPhrases, implWordMap, false)
        })
        .join('\n')
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
      item_class: it.item_class,
      item_class_tr: classTr,
      slot,
      slot_tr: slotTr,
      attribute,
      attribute_tr: attributeTr,
      base_stats: bs,
      implicit_en: implicitEn,
      implicit_tr: implicitTr,
      icon,
      category: 'item',
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  // Slot grubu sonra ad: UI'da grup/filtre dostu.
  const slotOrder: Record<string, number> = {
    weapon: 0,
    armour: 1,
    jewellery: 2,
    offhand: 3
  }
  records.sort((a, b) => {
    const s = (slotOrder[a.slot] ?? 9) - (slotOrder[b.slot] ?? 9)
    if (s !== 0) return s
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
  const outPath = join(outDir, 'items.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- Ozet ---
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const proposed = records.filter((r) => r.tr_status === 'proposed').length
  const exists = records.filter((r) => r.tr_status === 'exists').length
  const emptyTr = records.filter((r) => !r.tr || !r.tr.trim()).length
  const withImpl = records.filter((r) => r.implicit_en.trim()).length
  const withImplTr = records.filter((r) => r.implicit_tr.trim()).length
  const withIcon = records.filter((r) => r.icon).length
  const byClass: Record<string, number> = {}
  for (const r of records) byClass[r.item_class] = (byClass[r.item_class] ?? 0) + 1
  const bySlot: Record<string, number> = {}
  for (const r of records) bySlot[r.slot] = (bySlot[r.slot] ?? 0) + 1

  console.log('')
  console.log(`Yazıldı: ${records.length} item -> ${outPath}`)
  console.log(`  tr_status -> exists: ${exists}, proposed: ${proposed}, needs-translation: ${needs}`)
  console.log(`  tr (ad) boş: ${emptyTr}`)
  console.log(`  ad: override ${handName}, bileşke ${records.length - handName}`)
  console.log(`  implicit: dolu(en) ${withImpl}, dolu(tr) ${withImplTr}, override satır ${handImpl}`)
  console.log(`  ikon dolu: ${withIcon}/${records.length} (indirilen ${iconResult.downloaded}, vardı ${iconResult.existed}, başarısız ${iconResult.failed.size}, temizlenen ${iconCleared})`)
  console.log('  slot: ' + Object.entries(bySlot).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(', '))
  console.log('  sınıf: ' + Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(', '))
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
