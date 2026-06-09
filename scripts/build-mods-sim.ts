/**
 * build-mods-sim.ts
 * ----------------------------------------------------------------------------
 * Craft SİMÜLATÖRÜ için veri seti üretir -> src/data/mods_sim.json.
 * Mevcut mods.json'a (Özellikler sekmesi) DOKUNMAZ — ayrı dosya.
 *
 * mods.json (display) tier'ları metne göre BİRLEŞTİRİR ve spawn_weight/group atar.
 * Burada ise RePoE poe2 mods.json'ı BİRLEŞTİRMEDEN işleriz: her item-affix (her tier)
 * = ayrı rollable kayıt; spawn_weights (tag+weight, SIRALI — ilk eşleşen kazanır, 0 hariç tutar),
 * group (çakışma ailesi = groups[0]), generation_type, required_level (ilvl), name korunur.
 * Taban item TAG'leri RePoE base_items.json'dan (weight eşlemesi için şart) eklenir.
 * TR: stat satırının çevirisi mevcut mods.json pattern->tr eşlemesinden alınır (motor tekrar çalışmaz).
 *
 * Çalıştırma:  npm run build:mods-sim
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SOURCE_BASE = 'https://repoe-fork.github.io/poe2/'
const MODS_URL = SOURCE_BASE + 'mods.json'
const BASE_ITEMS_URL = SOURCE_BASE + 'base_items.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const dataDir = join(projectRoot, 'src', 'data')

// --- RePoE ham tipleri ---
interface RawMod {
  domain: string
  generation_type: string
  name?: string
  required_level?: number
  implicit_tags?: string[]
  adds_tags?: string[]
  groups?: string[]
  spawn_weights?: Array<{ tag: string; weight: number }>
  text?: string | null
}
interface RawBase {
  domain: string
  item_class: string
  name: string
  drop_level?: number
  tags?: string[]
  release_state?: string
  visual_identity?: { dds?: string; dds_file?: string } | null
}

// --- Metin normalizasyonu (build-mods.ts ile birebir aynı) ---
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
function extractValues(cleanedText: string): string {
  const flat = cleanedText.replace(/\n/g, ' ')
  const toks = flat.match(/[+-]?\([^)]*\)%?|[+-]?\d[\d.]*%?/g) || []
  return toks.join(' / ')
}
function pattern(text: string): string {
  const cleaned = cleanLinks(text)
  return cleaned
    .split(/\n/)
    .map((l) => normLine(l))
    .filter((l) => l.length > 0)
    .join('\n')
}

// --- Çıktı tipleri ---
interface SimBase {
  id: string
  en: string
  tr: string
  item_class: string
  slot: string
  domain: 'item' | 'flask'
  tags: string[]
  drop_level: number
  implicit_en: string
  implicit_tr: string
  icon: string
  base_stats: Record<string, number>
}
interface SimMod {
  id: string
  affix: 'prefix' | 'suffix'
  group: string // çakışma ailesi (aynı gruptan iki mod gelemez)
  domain: 'item' | 'flask' // havuz ayrımı (flask mod'ları yalnız flask base'lerine)
  name_en: string
  text_en: string
  text_tr: string
  ilvl: number
  values: string
  tags: string[]
  weights: Array<{ tag: string; weight: number }> // SIRALI; ilk eşleşen kazanır, 0 hariç tutar
}

// flask base adları için kısa TR sözlüğü (items.json'da yoklar)
const FLASK_TR: Record<string, string> = {
  'Life Flask': 'Yaşam İksiri',
  'Mana Flask': 'Mana İksiri',
  Charm: 'Tılsım',
  Flask: 'İksir'
}
// charm tür sıfatları (Thawing Charm -> Çözen Tılsım vb.)
const CHARM_TYPE_TR: Record<string, string> = {
  Thawing: 'Çözen',
  Staunching: 'Durduran',
  Antidote: 'Panzehir',
  Dousing: 'Söndüren',
  Grounding: 'Topraklayan',
  Stone: 'Taş',
  Reflexes: 'Refleks',
  Sapphire: 'Safir',
  Ruby: 'Yakut',
  Topaz: 'Topaz',
  Amethyst: 'Ametist',
  Silver: 'Gümüş',
  Golden: 'Altın'
}
function flaskTr(en: string): string {
  // "Greater Life Flask" -> tier sıfatı + "Yaşam İksiri"; "Thawing Charm" -> tür + "Tılsım"
  for (const [k, v] of Object.entries(FLASK_TR)) {
    if (en.endsWith(k)) {
      const prefix = en.slice(0, en.length - k.length).trim()
      const tierTr: Record<string, string> = { Lesser: 'Küçük', Medium: 'Orta', Greater: 'Büyük', Grand: 'Ulu', Giant: 'Dev', Colossal: 'Devasa', Sacred: 'Kutsal' }
      const pt = tierTr[prefix] ?? CHARM_TYPE_TR[prefix] ?? prefix
      return (pt ? pt + ' ' : '') + v
    }
  }
  return en
}
// flask mod kalıpları TR (display mods.json'da olmayan domain 'flask' mod'ları için)
const FLASK_MOD_TR: Record<string, string> = {
  '#% increased Charges gained': '#% artan Şarj kazanımı',
  '#% increased Charges': '#% artan Şarj',
  '#% increased Amount Recovered': '#% artan İyileşme Miktarı',
  '#% increased Recovery rate': '#% artan İyileşme hızı',
  '#% increased Duration': '#% artan Süre',
  'Gains # Charges per Second': 'Saniyede # Şarj kazanır',
  '#% Chance to gain a Charge when you kill an enemy': 'Bir düşman öldürünce #% Şarj kazanma şansı',
  '#% reduced Charges per use': 'Kullanım başına #% azalan Şarj',
  '#% of Recovery applied Instantly': 'İyileşmenin #%’i Anında uygulanır',
  '#% more Recovery if used while on Low Life': 'Düşük Can’dayken kullanılırsa #% daha fazla İyileşme',
  '#% more Recovery if used while on Low Mana': 'Düşük Mana’dayken kullanılırsa #% daha fazla İyileşme',
  'Recover # Life when Used': 'Kullanınca # Can iyileştir',
  'Recover # Mana when Used': 'Kullanınca # Mana iyileştir',
  'Instant Recovery\n#% reduced Amount Recovered': 'Anında İyileşme\n#% azalan İyileşme Miktarı',
  'Also grants # Guard': 'Ayrıca # Koruma (Guard) verir',
  'Grants #% of Life Recovery to Minions': 'Uşaklara Can İyileşmesinin #%’ini verir',
  'Removes Curses on use': 'Kullanınca Lanetleri kaldırır',
  '#% increased Life Recovered\nRemoves #% of Life Recovered from Mana when used': '#% artan iyileşen Can\nKullanınca iyileşen Can’ın #%’ini Mana’dan alır',
  '#% increased Mana Recovered\nRemoves #% of Mana Recovered from Life when used': '#% artan iyileşen Mana\nKullanınca iyileşen Mana’nın #%’ini Can’dan alır',
  'Immunity to Bleeding and Corrupted Blood during Effect\n#% less Duration': 'Etki süresince Kanamaya ve Bozulmuş Kana Bağışıklık\n#% daha az Süre',
  'Immunity to Freeze and Chill during Effect\n#% less Duration': 'Etki süresince Donma ve Üşümeye Bağışıklık\n#% daha az Süre',
  'Immunity to Poison during Effect\n#% less Duration': 'Etki süresince Zehre Bağışıklık\n#% daha az Süre',
  'Immunity to Shock during Effect\n#% less Duration': 'Etki süresince Şoka Bağışıklık\n#% daha az Süre',
  'Immunity to Ignite during Effect\nRemoves Burning on use\n#% less Duration': 'Etki süresince Tutuşmaya Bağışıklık\nkullanınca Yanmayı kaldırır\n#% daha az Süre',
  'Grants Immunity to Poison for # seconds if used while Poisoned': 'Zehirliyken kullanılırsa # saniye Zehre Bağışıklık verir',
  'Grants Immunity to Shock for # seconds if used while Shocked': 'Şoklanmışken kullanılırsa # saniye Şoka Bağışıklık verir',
  'Grants Immunity to Bleeding for # seconds if used while Bleeding\nGrants Immunity to Corrupted Blood for # seconds if used while affected by Corrupted Blood':
    'Kanarken kullanılırsa # saniye Kanamaya Bağışıklık verir\nBozulmuş Kandan etkilenirken kullanılırsa # saniye Bozulmuş Kana Bağışıklık verir',
  'Grants Immunity to Chill for # seconds if used while Chilled\nGrants Immunity to Freeze for # seconds if used while Frozen':
    'Üşümüşken kullanılırsa # saniye Üşümeye Bağışıklık verir\nDonmuşken kullanılırsa # saniye Donmaya Bağışıklık verir',
  'Grants Immunity to Ignite for # seconds if used while Ignited\nRemoves all Burning when used':
    'Tutuşmuşken kullanılırsa # saniye Tutuşmaya Bağışıklık verir\nkullanınca tüm Yanmayı kaldırır'
}

async function main(): Promise<void> {
  console.log('RePoE indiriliyor…')
  const [modsRes, baseRes] = await Promise.all([fetch(MODS_URL), fetch(BASE_ITEMS_URL)])
  if (!modsRes.ok) throw new Error(`mods.json indirme: HTTP ${modsRes.status}`)
  if (!baseRes.ok) throw new Error(`base_items.json indirme: HTTP ${baseRes.status}`)
  const raw = (await modsRes.json()) as Record<string, RawMod>
  const rawBases = (await baseRes.json()) as Record<string, RawBase>

  // Mevcut mods.json -> pattern(en) -> tr eşlemesi (TR'yi yeniden üretmeden al)
  const displayMods = JSON.parse(readFileSync(join(dataDir, 'mods.json'), 'utf-8')) as Array<{
    en: string
    tr: string
  }>
  const trByPattern = new Map<string, string>()
  for (const m of displayMods) if (m.en && m.tr) trByPattern.set(m.en, m.tr)

  // Mevcut items.json (kürasyonlu 1668 ekipman tabanı) + base_items tag'leri ile join
  const itemRecs = JSON.parse(readFileSync(join(dataDir, 'items.json'), 'utf-8')) as Array<{
    id: string
    en: string
    tr: string
    item_class: string
    slot: string
    implicit_en?: string
    implicit_tr?: string
    icon?: string
    base_stats?: Record<string, number>
  }>
  const bases: SimBase[] = []
  let basesWithTags = 0
  let basesWithImplicit = 0
  for (const it of itemRecs) {
    const rb = rawBases[it.id]
    const tags = rb?.tags ?? []
    if (tags.length) basesWithTags++
    const impEn = (it.implicit_en ?? '').trim()
    if (impEn) basesWithImplicit++
    bases.push({
      id: it.id,
      en: it.en,
      tr: it.tr,
      item_class: it.item_class,
      slot: it.slot,
      domain: 'item',
      tags,
      drop_level: rb?.drop_level ?? 1,
      implicit_en: impEn,
      implicit_tr: (it.implicit_tr ?? '').trim(),
      icon: it.icon ?? '',
      base_stats: it.base_stats ?? {}
    })
  }

  // --- FLASK domain'i (LifeFlask/ManaFlask/UtilityFlask; charm'lar = UtilityFlask) ---
  // base_items'tan doğrudan; ikonları indir. items.json'a (display) DOKUNMAZ.
  const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'items')
  const FLASK_CLASSES = new Set(['LifeFlask', 'ManaFlask', 'UtilityFlask'])
  let flaskBaseCount = 0
  let flaskIconDl = 0
  const iconJobs: Array<{ url: string; dest: string }> = []
  for (const [id, b] of Object.entries(rawBases)) {
    if (b.domain !== 'flask') continue
    if (!FLASK_CLASSES.has(b.item_class)) continue
    if ((b.tags ?? []).includes('not_for_sale')) continue
    const dds = b.visual_identity?.dds_file ?? b.visual_identity?.dds ?? ''
    const iconBase = dds ? dds.split('/').pop()!.replace(/\.dds$/i, '.png') : ''
    if (dds) iconJobs.push({ url: SOURCE_BASE + dds.replace(/\.dds$/i, '.png'), dest: join(iconDir, iconBase) })
    const p = (b as { properties?: Record<string, number | null> }).properties ?? {}
    const fstats: Record<string, number> = {}
    for (const k of ['life_per_use', 'mana_per_use', 'charges_max', 'charges_per_use', 'duration']) {
      const v = p[k]
      if (typeof v === 'number') fstats[k] = v
    }
    bases.push({
      id,
      en: b.name,
      tr: flaskTr(b.name),
      item_class: b.item_class,
      slot: 'flask',
      domain: 'flask',
      tags: b.tags ?? [],
      drop_level: b.drop_level ?? 1,
      implicit_en: '',
      implicit_tr: '',
      icon: iconBase ? 'assets/items/' + iconBase : '',
      base_stats: fstats
    })
    flaskBaseCount++
  }
  // ikonları indir (yoksa)
  for (const job of iconJobs) {
    if (existsSync(job.dest)) continue
    try {
      const r = await fetch(job.url)
      if (r.ok) {
        writeFileSync(job.dest, Buffer.from(await r.arrayBuffer()))
        flaskIconDl++
      }
    } catch {
      /* ikon indirilemezse placeholder gösterilir */
    }
  }

  // RePoE mod'ları: domain=item, prefix/suffix; her kayıt = bir rollable tier
  const mods: SimMod[] = []
  let trHits = 0
  let emptyWeights = 0
  const groupSet = new Set<string>()
  let flaskModCount = 0
  for (const [id, m] of Object.entries(raw)) {
    if (m.domain !== 'item' && m.domain !== 'flask') continue
    if (m.generation_type !== 'prefix' && m.generation_type !== 'suffix') continue
    if (!m.text || !m.text.trim()) continue
    const text_en = pattern(m.text)
    if (!text_en) continue
    const weights = (m.spawn_weights ?? []).map((w) => ({ tag: w.tag, weight: w.weight }))
    if (m.domain === 'item' && !weights.some((w) => w.weight > 0)) emptyWeights++
    const group = (m.groups ?? [])[0] ?? ''
    groupSet.add(group)
    const tr = (m.domain === 'flask' ? FLASK_MOD_TR[text_en] : undefined) ?? trByPattern.get(text_en)
    if (tr) trHits++
    if (m.domain === 'flask') flaskModCount++
    mods.push({
      id,
      affix: m.generation_type as 'prefix' | 'suffix',
      group,
      domain: m.domain === 'flask' ? 'flask' : 'item',
      name_en: m.name ?? '',
      text_en,
      text_tr: tr ?? '',
      ilvl: m.required_level ?? 0,
      values: extractValues(cleanLinks(m.text)),
      tags: [...(m.implicit_tags ?? []), ...(m.adds_tags ?? [])],
      weights
    })
  }

  const out = {
    meta: {
      game_version: GAME_VERSION,
      league: LEAGUE,
      source: 'repoe-fork',
      generated: new Date().toISOString().slice(0, 10),
      note: 'Craft simülatörü veri seti. weights SIRALI (ilk eşleşen tag kazanır, 0 hariç tutar).'
    },
    bases,
    mods
  }
  mkdirSync(dataDir, { recursive: true })
  const outPath = join(dataDir, 'mods_sim.json')
  writeFileSync(outPath, JSON.stringify(out) + '\n', 'utf-8')

  // --- Rapor (gerçek sayılar) ---
  const prefix = mods.filter((m) => m.affix === 'prefix').length
  const suffix = mods.filter((m) => m.affix === 'suffix').length
  const sizeMB = (Buffer.byteLength(JSON.stringify(out)) / 1048576).toFixed(2)
  console.log('')
  console.log(`Yazıldı -> ${outPath}  (${sizeMB} MB)`)
  console.log(`  mod (rollable tier): ${mods.length}  (prefix ${prefix} / suffix ${suffix})`)
  console.log(`  benzersiz group (çakışma ailesi): ${groupSet.size}`)
  console.log(`  weights boş (rollable tag yok) olan mod: ${emptyWeights}`)
  console.log(`  iki dilli eşleşen (text_tr dolu): ${trHits}/${mods.length}  (boş: ${mods.length - trHits})`)
  console.log(`  taban (base): ${bases.length}  — tag DOLU: ${basesWithTags}, tag BOŞ: ${bases.length - basesWithTags}`)
  console.log(`  FLASK base: ${flaskBaseCount} (ikon indirilen: ${flaskIconDl}), FLASK mod: ${flaskModCount}`)
  console.log(`  implicit DOLU taban: ${basesWithImplicit} / ${bases.length}`)
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
