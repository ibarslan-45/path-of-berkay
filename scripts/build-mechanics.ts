/**
 * build-mechanics.ts
 * ----------------------------------------------------------------------------
 * LEAGUE / HARİTA MEKANİKLERİ kategorisi -> src/data/mechanics.json.
 * Faz 1: 10 mekanik (Boss'lar ayrı Faz 2). Üç alt-tip:
 *   1) map   : Atlas tablet/harita ile gelen mekanikler (Breach, Delirium,
 *              Ritual, Expedition, Abyss).
 *   2) trial : Ascendancy denemeleri (Sanctum = Trial of the Sekhemas,
 *              Ultimatum = Trial of Chaos).
 *   3) event : Harita içi olaylar (Strongbox, Shrine, Essence).
 *
 * Çalıştırma:  npm run build:mechanics
 *
 * VERİ KAYNAĞI:
 *  - 8 mekaniğin overview metni + bağlı parça/öğe açıklamaları: RePoE fork
 *    keywords.json (yetkili PoE2 verisi; [link] sözdizimi temizlenir).
 *  - Sanctum + Ultimatum overview'ı keywords.json'da YOK -> aşağıdaki FACTS
 *    içinde elle (Maxroll PoE2 0.5.0 doğrulandı, overview_source=maxroll).
 *  - Strateji notu (tip): hepsinde elle (Maxroll PoE2 0.5.0 doğrulandı).
 *
 * ÇEVİRİ (proje talimatları): eşleşme anahtarı EN. Tüm Türkçe metin
 *  tr-mechanics-glossary.json'da (ad/overview/tip/parça) -> id veya part-en ile
 *  eşlenir. Eksikse tr_status=needs-translation. Hedef: needs-translation 0.
 * İKON: produce-mechanic-icons.cjs ayrı üretir (assets/mechanics/). Yoksa null.
 * ÇAKIŞMAZ: areas.json kampanya/normal-harita zonları; burada mekanik tanımları.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SOURCE_BASE = 'https://repoe-fork.github.io/poe2/'
const KEYWORDS_URL = SOURCE_BASE + 'keywords.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const REPOE = 'repoe-fork'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'
type Subtype = 'map' | 'trial' | 'event'

interface RawKeyword {
  term?: string
  definition?: string
}
type Keywords = Record<string, RawKeyword>

/** Elle girilen olgu tanımı (RePoE'de olmayan kısımlar). */
interface MechFact {
  id: string
  /** keywords.json'daki term'i ezmek için (örn. Trial adları). */
  display_en?: string
  subtype: Subtype
  /** 8 mekanik için overview keywords[bu].definition'dan gelir. */
  overview_keyword?: string
  /** Trial'lar için (keywords'te yok) elle overview. */
  overview_en?: string
  overview_source: string
  /** Bağlı parça/öğe açıklamaları için keyword anahtarları. */
  part_keywords?: string[]
  /** Trial'lar için elle parçalar. */
  parts_inline?: { en: string; desc_en: string }[]
  tip_en: string
  tip_source: string
}

/** TR glossary biçimi (tr-mechanics-glossary.json). */
interface TrGlossary {
  names: Record<string, { tr: string; status?: TrStatus }>
  overviews: Record<string, string>
  tips: Record<string, string>
  parts: Record<string, { name: string; desc: string }>
}

interface MechPart {
  en: string
  tr: string
  desc_en: string
  desc_tr: string
}
interface MechRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  category: 'mechanic'
  subtype: Subtype
  overview_en: string
  overview_tr: string
  overview_source: string
  tip_en: string
  tip_tr: string
  tip_source: string
  parts: MechPart[]
  icon: string | null
  banner: string | null
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- FACTS: 10 mekanik. EN olgular burada; TR glossary'de ----------------
const FACTS: MechFact[] = [
  // --- map mekanikleri ---
  {
    id: 'breach',
    subtype: 'map',
    overview_keyword: 'ContainsBreach',
    overview_source: REPOE,
    part_keywords: ['BreachWombgift'],
    tip_en:
      'Prioritise extending the timer early by killing Breach monsters, so you reach the stronger elite waves at the centre for catalysts and Breach rings.',
    tip_source: 'maxroll'
  },
  {
    id: 'delirium',
    subtype: 'map',
    overview_keyword: 'ContainsDelirium',
    overview_source: REPOE,
    part_keywords: ['DeliriumGigaMirror', 'EssenceDelirium'],
    tip_en:
      'Stay inside the expanding fog and clear quickly; the deeper you push before the timer ends, the more Distilled Emotions you collect.',
    tip_source: 'maxroll'
  },
  {
    id: 'ritual',
    subtype: 'map',
    overview_keyword: 'ContainsRitual',
    overview_source: REPOE,
    part_keywords: ['RitualFreeReroll', 'RitualRiteOfTheNameless', 'RitualPinnacleEffigyPiece'],
    tip_en:
      'Plan a route that chains several altars in one map to bank more Tribute, then spend it on the most valuable Favours (unique items and Omens).',
    tip_source: 'maxroll'
  },
  {
    id: 'expedition',
    subtype: 'map',
    overview_keyword: 'ContainsExpedition',
    overview_source: REPOE,
    part_keywords: ['ContainsExpedition2', 'GrandExpeditionRemnant'],
    tip_en:
      'Detonate Remnants that amplify rewards before you reach the big chests, and chain explosives carefully to avoid waking dangerous packs you cannot handle.',
    tip_source: 'maxroll'
  },
  {
    id: 'abyss',
    subtype: 'map',
    overview_keyword: 'ContainsAbyss',
    overview_source: REPOE,
    part_keywords: [
      'AbyssalDepths',
      'AbyssalEye',
      'AbyssalModifiers',
      'AbyssalWasting',
      'MarkofAbyssalLord'
    ],
    tip_en:
      'Follow the fissures and close them all to open the pit; killing higher-rarity weakened monsters along the way means stronger Abyssal monsters and better Abyssal Trove loot.',
    tip_source: 'maxroll'
  },
  // --- trial mekanikleri (overview keywords'te YOK -> elle, Maxroll) ---
  {
    id: 'sanctum',
    display_en: 'Trial of the Sekhemas',
    subtype: 'trial',
    overview_en:
      'The Trial of the Sekhemas is one of the two Ascendancy trials in Path of Exile 2. Instead of life, your run is governed by Honour: every hit you take drains Honour, and if it reaches zero your run ends. You descend through four floors of rooms, choosing rewards and Boons along the way, until you defeat the floor guardian. Relics placed on your Relic Altar before the run grant lasting bonuses, the most important being Honour Resistance, which reduces the Honour you lose per hit.',
    overview_source: 'maxroll',
    parts_inline: [
      {
        en: 'Honour',
        desc_en:
          'A resource unique to the Trial of the Sekhemas. You lose Honour whenever you are hit, and the run is over if it reaches zero. Some Shrines restore Honour.'
      },
      {
        en: 'Relics',
        desc_en:
          'The meta-progression for the Trial. Placed on the Relic Altar before a run to grant lasting bonuses; the key stat is Honour Resistance, which reduces Honour damage taken.'
      },
      {
        en: 'Boons & Afflictions',
        desc_en:
          'Boons are helpful blessings picked up inside the Trial; Afflictions are lingering curses that make the rest of the run harder.'
      }
    ],
    tip_en:
      'Stack Honour Resistance on your Relics (aim for around 75%) so each hit drains far less Honour; this matters far more than raw maximum Honour for surviving deep runs.',
    tip_source: 'maxroll'
  },
  {
    id: 'ultimatum',
    display_en: 'Trial of Chaos',
    subtype: 'trial',
    overview_en:
      'The Trial of Chaos is the other Ascendancy trial in Path of Exile 2, run inside the Temple of Chaos. You clear a series of consecutive rooms, each with its own challenge — defeat all monsters, survive a timer, escort a statue, collect Soul Cores, or sacrifice monsters at an altar — and finish with a randomised boss. Before every room you must choose one of three Afflictions (negative modifiers) that stay for the whole run, so difficulty climbs with each room cleared.',
    overview_source: 'maxroll',
    parts_inline: [
      {
        en: 'Afflictions',
        desc_en:
          'Before each room you pick one of three negative modifiers that last until the end of the run. They stack, so the trial gets exponentially harder; avoid combining ones that restrict your movement or arena space.'
      },
      {
        en: 'Trial Rooms',
        desc_en:
          'A sequence of challenge rooms: kill all monsters, survive a timer, escort a statue, collect Soul Cores, or sacrifice monsters in Blood Circles, ending with a boss room.'
      },
      {
        en: 'The Trialmaster',
        desc_en:
          'The randomised boss encountered at the end of the higher Trials of Chaos; defeating it for the first time unlocks your 4th Ascendancy points.'
      }
    ],
    tip_en:
      'Read the three Afflictions each room and pick the least dangerous for your build; stacking monster-buff or movement-restricting modifiers can spawn an unkillable rare that ends the run early.',
    tip_source: 'maxroll'
  },
  // --- harita içi olaylar ---
  {
    id: 'strongbox',
    subtype: 'event',
    overview_keyword: 'Strongbox',
    overview_source: REPOE,
    part_keywords: [
      'BasicStrongbox',
      'CartographersStrongbox',
      'OrnateStrongbox',
      'ResearchersStrongbox',
      'SecuredStrongbox'
    ],
    tip_en:
      'Clear the surrounding area first, then open the Strongbox and be ready for the pack it releases; modifying a box raises both its danger and its rewards.',
    tip_source: 'maxroll'
  },
  {
    id: 'shrine',
    subtype: 'event',
    overview_keyword: 'Shrine',
    overview_source: REPOE,
    part_keywords: ['GreedShrine', 'GloomShrine', 'EnlighteningShrine', 'CovetousShrine'],
    tip_en:
      'Defeat the monsters worshipping the Shrine before grabbing the buff, then use the temporary power to blast through a tough pack or rare nearby.',
    tip_source: 'maxroll'
  },
  {
    id: 'essence',
    subtype: 'event',
    overview_keyword: 'Essence',
    overview_source: REPOE,
    part_keywords: ['EssenceDelirium'],
    tip_en:
      'Use the dropped Essence as targeted crafting currency to force a specific affix onto an item; monsters carrying Essence modifiers drop an extra Essence of that type.',
    tip_source: 'maxroll'
  }
]

// --- yardımcılar ---------------------------------------------------------
function cleanLinks(text: string): string {
  // [Key|Display] -> Display ; [Key] -> Key
  let s = text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2')
  s = s.replace(/\[([^\]]+)\]/g, '$1')
  return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return (await res.json()) as T
}

// --- ana ------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-mechanics-glossary.json')
const outDir = join(projectRoot, 'src', 'data')
const outPath = join(outDir, 'mechanics.json')
const iconRelPrefix = 'assets/mechanics/'
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'mechanics')

async function main(): Promise<void> {
  console.log('keywords.json indiriliyor...')
  const kw = await fetchJson<Keywords>(KEYWORDS_URL)

  const glossary: TrGlossary = existsSync(glossaryPath)
    ? (JSON.parse(readFileSync(glossaryPath, 'utf-8')) as TrGlossary)
    : { names: {}, overviews: {}, tips: {}, parts: {} }

  let missing = 0
  const records: MechRecord[] = FACTS.map((f) => {
    // ad
    const en = f.display_en ?? kw[f.overview_keyword ?? '']?.term ?? f.id
    const nameTr = glossary.names[en]
    const tr = nameTr?.tr ?? en
    const trStatus: TrStatus = nameTr ? nameTr.status ?? 'proposed' : 'needs-translation'
    if (!nameTr) missing++

    // overview
    const overview_en =
      f.overview_en ?? cleanLinks(kw[f.overview_keyword ?? '']?.definition ?? '')
    const overview_tr = glossary.overviews[f.id] ?? ''
    if (!overview_tr) missing++

    // tip
    const tip_tr = glossary.tips[f.id] ?? ''
    if (!tip_tr) missing++

    // parçalar
    const parts: MechPart[] = []
    for (const pk of f.part_keywords ?? []) {
      const e = kw[pk]
      if (!e?.term) continue
      const pen = e.term
      const g = glossary.parts[pen]
      if (!g) missing++
      parts.push({
        en: pen,
        tr: g?.name ?? pen,
        desc_en: cleanLinks(e.definition ?? ''),
        desc_tr: g?.desc ?? ''
      })
    }
    for (const p of f.parts_inline ?? []) {
      const g = glossary.parts[p.en]
      if (!g) missing++
      parts.push({
        en: p.en,
        tr: g?.name ?? p.en,
        desc_en: p.desc_en,
        desc_tr: g?.desc ?? ''
      })
    }

    // ikon + banner (produce-mechanic-icons.cjs üretir; yoksa null)
    const iconFile = `${f.id}.png`
    const bannerFile = `${f.id}-banner.png`
    const hasIcon = existsSync(join(iconDir, iconFile))
    const hasBanner = existsSync(join(iconDir, bannerFile))

    return {
      id: f.id,
      en,
      tr,
      tr_status: trStatus,
      category: 'mechanic',
      subtype: f.subtype,
      overview_en,
      overview_tr,
      overview_source: f.overview_source,
      tip_en: f.tip_en,
      tip_tr,
      tip_source: f.tip_source,
      parts,
      icon: hasIcon ? iconRelPrefix + iconFile : null,
      banner: hasBanner ? iconRelPrefix + bannerFile : null,
      source: REPOE,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: new Date().toISOString().slice(0, 10)
    }
  })

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8')

  const byType = records.reduce<Record<string, number>>((a, r) => {
    a[r.subtype] = (a[r.subtype] ?? 0) + 1
    return a
  }, {})
  console.log(`yazıldı: ${outPath}`)
  console.log(`  ${records.length} mekanik`, byType)
  console.log(`  eksik TR alanı: ${missing}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
