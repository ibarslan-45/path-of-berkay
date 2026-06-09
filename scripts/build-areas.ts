/**
 * build-areas.ts
 * ----------------------------------------------------------------------------
 * RePoE poe2 fork world_areas.json'dan KAMPANYA (Act 1-4 + Interlude) ve
 * ENDGAME (atlas map) bölgelerini çıkarır; teknik/hideout/WorldMap zonlarını
 * eler; iki dilli (en+tr) src/data/areas.json yazar. (İkon yok.)
 *
 * Çalıştırma:  npm run build:areas
 *
 * ÇEVİRİ: bölge adı tr-areas-glossary.json names[ad] (tam) -> yoksa compositional
 *  (words; "the"/"of" düşer) -> yoksa en. needs-translation 0.
 * boss: iç metadata yolundan okunur ad türetilir ("…/SwollenMillerBoss" ->
 *  "Swollen Miller Boss"). connections: zone id -> ad'a çözülür (en+tr).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SOURCE_BASE = 'https://repoe-fork.github.io/poe2/'
const WORLD_AREAS_URL = SOURCE_BASE + 'world_areas.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'

interface RawArea {
  act: number
  area_level: number
  is_town: boolean
  bosses?: string[]
  connections?: string[]
  name: string
  id: string
  has_waypoint?: boolean
  loading_screens?: string[]
}
/** produce-area-assets.cjs çıktısı (görsel haritası; opsiyonel). */
interface AssetMap {
  rewardIcons?: Record<string, string>
  rewardIconsByArea?: Record<string, string[]>
  areaImages?: Record<string, string>
  bossIcons?: Record<string, string>
}
interface AreasGlossary {
  names: Record<string, { tr: string; status?: TrStatus }>
  words: Record<string, string>
}
/** Maxroll kampanya rehberinden (PoE205CW.docx) çıkarılan OLGULAR. */
interface AreaFacts {
  has_waypoint?: boolean
  boss_en?: string[]
  boss_tr?: string[]
  quest_en?: string
  quest_tr?: string
  reward_en?: string
  reward_tr?: string
  npcs?: string[]
  poi?: string[]
  steps_en?: string[]
  steps_tr?: string[]
}
interface AreaRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  act: string
  act_order: number
  area_level: number
  type: 'town' | 'zone'
  connected_to: string[]
  connected_to_tr: string[]
  bosses: string[]
  // --- Maxroll rehberi olguları (docx; eşleşmeyen bölgelerde boş) ---
  has_waypoint: boolean | null
  boss_en: string[]
  boss_tr: string[]
  quest_en: string
  quest_tr: string
  reward_en: string
  reward_tr: string
  npcs: string[]
  poi: string[]
  steps_en: string[]
  steps_tr: string[]
  source_facts: string | null
  // --- Görseller (produce-area-assets.cjs; yoksa boş/null) ---
  area_image: string | null
  boss_images: string[]
  reward_icons: string[]
  category: 'area'
  source: string
  game_version: string
  league: string
  last_updated: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-areas-glossary.json')
const factsPath = join(__dirname, 'maxroll-area-facts.json')
const FACTS_SOURCE = 'maxroll-campaign-guide' // PoE205CW.docx'ten çıkarılan olgular
const assetMapPath = join(__dirname, 'area-asset-map.json')

// id -> act etiketi + sıralama. G1-4 kampanya, P1 interlude, Map* endgame.
function actInfo(id: string): { label: string; order: number } | null {
  if (/^G1_/.test(id)) return { label: '1', order: 1 }
  if (/^G2_/.test(id)) return { label: '2', order: 2 }
  if (/^G3_/.test(id)) return { label: '3', order: 3 }
  if (/^G4_/.test(id)) return { label: '4', order: 4 }
  if (/^P1_/.test(id)) return { label: 'interlude', order: 5 }
  // 0.5'te eklenen geçici ara bölümler (P2: Çalınan Barya, P3: Doryani'nin
  // Tedbiri). P1 gibi "interlude" türü; Act 5 çıkana dek geçici içerik.
  if (/^P2_/.test(id)) return { label: 'interlude2', order: 6 }
  if (/^P3_/.test(id)) return { label: 'interlude3', order: 7 }
  return null
}

function isCampaign(a: RawArea): boolean {
  if (!/^(G[1-4]|P[1-3])_/.test(a.id)) return false
  if (/_WorldMap$/.test(a.id)) return false
  if (/Hideout/i.test(a.id)) return false
  if (!a.name || a.name === 'NULL' || /^\[DNT/.test(a.name)) return false
  return true
}
function isEndgame(a: RawArea): boolean {
  if (a.act !== 10) return false
  if (!/^Map/.test(a.id)) return false
  if (/Hideout/i.test(a.id)) return false
  if (/^(Map_|MapUberBoss)/.test(a.id)) return false
  if (!a.name || a.name === 'NULL' || /^\[DNT/.test(a.name)) return false
  return true
}

/** Boss metadata yolundan okunur ad: ".../SwollenMillerBoss" -> "Swollen Miller Boss". */
function bossName(path: string): string {
  const tail = path.split('/').pop() || ''
  return tail
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function loadGlossary(): AreasGlossary {
  const g = JSON.parse(readFileSync(glossaryPath, 'utf-8')) as AreasGlossary
  g.names ??= {}
  g.words ??= {}
  return g
}

/** maxroll-area-facts.json: en ad -> olgular. _comment yok sayılır. */
function loadFacts(): Map<string, AreaFacts> {
  const raw = JSON.parse(readFileSync(factsPath, 'utf-8')) as Record<string, AreaFacts>
  const m = new Map<string, AreaFacts>()
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue
    m.set(k, v)
  }
  return m
}

/** area-asset-map.json (görsel haritası). Yoksa boş harita. */
function loadAssetMap(): AssetMap {
  if (!existsSync(assetMapPath)) return {}
  return JSON.parse(readFileSync(assetMapPath, 'utf-8')) as AssetMap
}

async function main(): Promise<void> {
  const glossary = loadGlossary()
  const facts = loadFacts()
  const assetMap = loadAssetMap()
  const matchedFactKeys = new Set<string>()
  const wordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(glossary.words)) wordMap.set(k.toLocaleLowerCase('en'), v)

  // Ad çevirisi: names[ad] tam -> yoksa compositional (words) -> yoksa en.
  function translateName(en: string): { tr: string; status: TrStatus } {
    const ov = glossary.names[en]
    if (ov && ov.tr) return { tr: ov.tr, status: ov.status ?? 'proposed' }
    const tokens = en.split(/(\s+)/)
    let any = false
    const out = tokens.map((tok) => {
      if (/^\s+$/.test(tok) || !tok) return tok
      const lower = tok.toLocaleLowerCase('en')
      if (wordMap.has(lower)) {
        any = true
        const hit = wordMap.get(lower) as string
        return hit
      }
      return tok
    })
    if (any) {
      const tr = out.join('').replace(/\s{2,}/g, ' ').trim()
      if (tr) return { tr, status: 'proposed' }
    }
    return { tr: en, status: 'proposed' } // fallback: en (needs-translation 0)
  }

  console.log(`İndiriliyor: ${WORLD_AREAS_URL}`)
  const res = await fetch(WORLD_AREAS_URL)
  if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`)
  const raw = (await res.json()) as Record<string, RawArea>
  const today = new Date().toISOString().slice(0, 10)

  // id -> ad (tüm adlı zonlar; connection çözümü için).
  const idToName = new Map<string, string>()
  for (const a of Object.values(raw))
    if (a.name && a.name !== 'NULL') idToName.set(a.id, a.name)

  const records: AreaRecord[] = []
  const seen = new Set<string>() // act|ad veya endgame|ad

  for (const a of Object.values(raw)) {
    const campaign = isCampaign(a)
    const endgame = !campaign && isEndgame(a)
    if (!campaign && !endgame) continue

    let label: string
    let order: number
    if (campaign) {
      const ai = actInfo(a.id)!
      label = ai.label
      order = ai.order
    } else {
      label = 'endgame'
      order = 8
    }

    const dedupKey = label + '|' + a.name
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    const { tr, status } = translateName(a.name)

    // Bağlantılar: id -> ad; WorldMap/hideout hedeflerini at; ada göre tekille.
    const connEn: string[] = []
    const connTr: string[] = []
    const connSeen = new Set<string>()
    for (const cid of a.connections ?? []) {
      if (/_WorldMap$/.test(cid) || /Hideout/i.test(cid)) continue
      const cname = idToName.get(cid)
      if (!cname || cname === 'NULL' || cname === a.name) continue
      if (connSeen.has(cname)) continue
      connSeen.add(cname)
      connEn.push(cname)
      connTr.push(translateName(cname).tr)
    }

    const bosses = [...new Set((a.bosses ?? []).map(bossName).filter(Boolean))]

    // docx olguları: en ada göre eşleştir. Eşleşme yoksa alanlar boş kalır (uydurma yok).
    const f = facts.get(a.name)
    if (f) matchedFactKeys.add(a.name)

    // --- Görseller (asset map) ---
    // Bölge görseli: world_areas loading_screens[0] basename -> areaImages
    let areaImage: string | null = null
    const ls0 = (a.loading_screens ?? [])[0]
    if (ls0) {
      const bn = ls0.split('/').pop()!.replace(/\.dds$/i, '').toLowerCase()
      areaImage = assetMap.areaImages?.[bn] ?? null
    }
    // Boss görselleri: boss_en sırasına göre eşleşenler
    const bossImages = (f?.boss_en ?? [])
      .map((b) => assetMap.bossIcons?.[b])
      .filter((x): x is string => Boolean(x))
    // Ödül ikonları: bölge-bazlı harita
    const rewardIcons = assetMap.rewardIconsByArea?.[a.name] ?? []

    // Waypoint: docx önce, yoksa world_areas native, yoksa null
    const hasWaypoint = f?.has_waypoint ?? (typeof a.has_waypoint === 'boolean' ? a.has_waypoint : null)

    records.push({
      id: a.id,
      en: a.name,
      tr,
      tr_status: status,
      act: label,
      act_order: order,
      area_level: a.area_level,
      type: a.is_town ? 'town' : 'zone',
      connected_to: connEn,
      connected_to_tr: connTr,
      bosses,
      has_waypoint: hasWaypoint,
      boss_en: f?.boss_en ?? [],
      boss_tr: f?.boss_tr ?? [],
      quest_en: f?.quest_en ?? '',
      quest_tr: f?.quest_tr ?? '',
      reward_en: f?.reward_en ?? '',
      reward_tr: f?.reward_tr ?? '',
      npcs: f?.npcs ?? [],
      poi: f?.poi ?? [],
      steps_en: f?.steps_en ?? [],
      steps_tr: f?.steps_tr ?? [],
      source_facts: f ? FACTS_SOURCE : null,
      area_image: areaImage,
      boss_images: bossImages,
      reward_icons: rewardIcons,
      category: 'area',
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  // act sırası, sonra şehir önce, sonra seviye, sonra ad.
  records.sort((a, b) => {
    if (a.act_order !== b.act_order) return a.act_order - b.act_order
    if (a.type !== b.type) return a.type === 'town' ? -1 : 1
    if (a.area_level !== b.area_level) return a.area_level - b.area_level
    return a.en.localeCompare(b.en, 'en')
  })

  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'areas.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- Özet ---
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const emptyTr = records.filter((r) => !r.tr || !r.tr.trim()).length
  const byAct: Record<string, number> = {}
  for (const r of records) byAct[r.act] = (byAct[r.act] ?? 0) + 1
  const exact = records.filter((r) => glossary.names[r.en]).length
  const withBoss = records.filter((r) => r.bosses.length).length
  const withConn = records.filter((r) => r.connected_to.length).length
  const towns = records.filter((r) => r.type === 'town').length

  // --- docx (Maxroll) olgu eşleşme istatistikleri ---
  const factMatched = records.filter((r) => r.source_facts).length
  const withQuestTr = records.filter((r) => r.quest_tr.trim()).length
  const withStepsTr = records.filter((r) => r.steps_tr.length).length
  const withDocxBoss = records.filter((r) => r.boss_tr.length).length
  const unmatchedFacts = [...facts.keys()].filter((k) => !matchedFactKeys.has(k))

  console.log('')
  console.log(`Yazıldı: ${records.length} bölge -> ${outPath}`)
  console.log('  act dağılımı: ' + Object.entries(byAct).map(([k, n]) => `${k}:${n}`).join(', '))
  console.log(`  needs-translation: ${needs}; tr boş: ${emptyTr}`)
  console.log(`  ad çevirisi: exact ${exact}/${records.length}, fallback ${records.length - exact}`)
  console.log(`  şehir: ${towns}, boss dolu: ${withBoss}, bağlantı dolu: ${withConn}`)
  console.log('')
  console.log('  --- Maxroll docx olguları ---')
  console.log(`  docx ile eşleşen bölge: ${factMatched}/${records.length}`)
  console.log(`  quest_tr dolu: ${withQuestTr}; steps_tr dolu: ${withStepsTr}; docx boss_tr dolu: ${withDocxBoss}`)
  console.log(`  docx'te olup areas.json'da eşleşmeyen olgu anahtarı: ${unmatchedFacts.length}` +
    (unmatchedFacts.length ? ` (${unmatchedFacts.join(', ')})` : ''))

  // --- Görsel + waypoint istatistikleri ---
  const wpFilled = records.filter((r) => r.has_waypoint !== null).length
  const wpYes = records.filter((r) => r.has_waypoint === true).length
  const withAreaImg = records.filter((r) => r.area_image).length
  const distinctAreaImg = new Set(records.map((r) => r.area_image).filter(Boolean)).size
  const withBossImg = records.filter((r) => r.boss_images.length).length
  const bossImgTotal = records.reduce((s, r) => s + r.boss_images.length, 0)
  const withRewardImg = records.filter((r) => r.reward_icons.length).length
  console.log('')
  console.log('  --- Görseller + waypoint ---')
  console.log(`  waypoint dolu: ${wpFilled}/${records.length} (Var: ${wpYes})`)
  console.log(`  bölge görseli olan: ${withAreaImg}/${records.length} (ayrı görsel: ${distinctAreaImg})`)
  console.log(`  boss görseli olan bölge: ${withBossImg}; toplam boss görseli: ${bossImgTotal}`)
  console.log(`  ödül ikonu olan bölge: ${withRewardImg}`)
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
