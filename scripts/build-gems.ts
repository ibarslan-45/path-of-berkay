/**
 * build-gems.ts
 * ----------------------------------------------------------------------------
 * RePoE poe2 fork'tan skill gem verisini indirir, her kayda iki dilli
 * (en + tr + tr_status) alanlar ekler ve src/data/gems.json olarak yazar.
 *
 * Bu surum ayrica:
 *  - Her gem icin oyunun Ingilizce aciklamasini + etki (stat) metinlerini
 *    "desc_en" alanina, Turkce cevirisini "desc_tr" alanina yazar.
 *  - Her gem icin ikon yolunu bulur, ikonu RePoE'den (PNG) indirir ve
 *    src/renderer/assets/gems/ altina kaydeder; yerel yolu "icon" alanina yazar.
 *
 * Calistirma:  npm run build:gems
 *
 * CEVIRI MANTIGI (proje talimatları):
 *  - Eslestirme anahtari her zaman EN'dir; tr ikinci alan.
 *  - Gem ADI: scripts/tr-glossary.json -> "gems" altinda varsa o ceviri
 *    kullanilir; yoksa "components" sozlugu ile kelime kelime cevrilir.
 *  - Gem ACIKLAMASI (desc_tr): once "descPhrases" (cok kelimeli kaliplar,
 *    uzun olan once), sonra "descWords" + "components" (tek kelime) sozlugu
 *    uygulanir. Sayilar, yuzdeler ve {0}/{1} gibi yer tutucular AYNEN korunur.
 *    Sozlukte olmayan kelime (genelde ozel ad) Ingilizce birakilir.
 *  - desc_en bossa desc_tr de bos birakilir (uydurma aciklama YAZILMAZ).
 *  - Otomatik uretilen ceviriler "proposed"; asla "needs-translation" olmaz.
 *  - Script, descPhrases/descWords varsayilanlarini glossary'ye yazar; boylece
 *    tum terimler tek dosyada toplanir ve elle duzeltilebilir.
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

// --- Sabitler (degisebilir bilgi; veri damgasi icin) ---------------------
const SOURCE_BASE = 'https://repoe-fork.github.io/poe2/'
const GEMS_URL = SOURCE_BASE + 'skill_gems.json'
const SKILLS_URL = SOURCE_BASE + 'skills.json'
// base_items.json: bazi gem'lerin skill_gems.json icindeki icon_dds_file alani
// BOZUK ("4k/") veya null. base_items.json'da visual_identity.dds_file zinciri
// (ItemVisualIdentity -> gercek DDS yolu) cozulmus halde bulunur; ikon icin
// fallback olarak base_item.id ile eslenip kullanilir.
const BASE_ITEMS_URL = SOURCE_BASE + 'base_items.json'
const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'
const SOURCE_NAME = 'repoe-fork'

// Ad bolunurken atilacak kucuk kelimeler (anlami bozmadan).
const DROP_WORDS = new Set(['of', 'the', 'a', 'an'])

// Ikon indirme: ayni anda kac istek + kac deneme.
const ICON_CONCURRENCY = 16
const ICON_RETRIES = 2

// --- Tipler --------------------------------------------------------------
type TrStatus = 'exists' | 'proposed' | 'needs-translation'

interface RawGem {
  base_item: {
    display_name: string
    id: string
    release_state: string
  } | null
  color?: string | null
  gem_type?: string | null
  tags?: string[] | null
  grants_skills?: string[] | null
  support_text?: string | null
  icon_dds_file?: string | null
}

/** base_items.json kaydinin sadece ihtiyacimiz olan kismi (ikon fallback). */
interface RawBaseItem {
  visual_identity?: {
    dds_file?: string | null
  } | null
}

/** skills.json kaydinin sadece ihtiyacimiz olan kismi. */
interface RawSkill {
  active_skill?: {
    description?: string | null
  } | null
  stat_sets?: Array<{
    per_level?: Record<
      string,
      { stat_text?: Record<string, string> | null } | null
    > | null
  }> | null
}

interface TrEntry {
  tr: string
  status: TrStatus
  /** true = bu ceviri components ile otomatik uretildi; her build'de yenilenir.
   *  Yok/false = elle duzenlenmis; korunur (yeniden hesaplanmaz). */
  auto?: boolean
}

interface Glossary {
  _comment?: string
  gemTypes: Record<string, TrEntry>
  tags: Record<string, TrEntry>
  components: Record<string, string>
  /** Aciklama cevirisi: cok kelimeli kaliplar (uzun olan once uygulanir). */
  descPhrases: Record<string, string>
  /** Aciklama cevirisi: tek kelime sozlugu (components'i tamamlar). */
  descWords: Record<string, string>
  /**
   * ELLE/OPUS cevrilmis aciklamalar: base gem adi (en) -> dogal Turkce desc.
   * Burada bir kayit varsa desc_tr olarak AYNEN kullanilir (sozluk fallback'i
   * devre disi). Cok satirli metin '\n' ile saklanir. Korunur, ezilmez.
   */
  descriptions: Record<string, string>
  gems: Record<string, TrEntry>
}

interface GemRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  category: 'gem'
  color: string | null
  gem_type: string | null
  gem_type_tr: string | null
  tags: string[]
  tags_tr: string[]
  desc_en: string
  desc_tr: string
  icon: string | null
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- Yardimcilar ---------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-glossary.json')
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'gems')
/** gems.json icindeki "icon" alaninin tasiyacagi yol on eki (renderer'a gore). */
const ICON_REL_PREFIX = 'assets/gems/'

/**
 * Aciklama cevirisi icin tek kelime varsayilan sozlugu. Bilincli olarak kucuk
 * harf anahtarlar; eslesme buyuk/kucuk harf duyarsizdir. Burasi bir BASLANGIC
 * katmanidir: ilk build'de glossary'ye yazilir, sonra elle iyilestirebilirsin.
 * Ceviriler kaba olabilir (durum "proposed").
 */
const DEFAULT_DESC_WORDS: Record<string, string> = {
  // baglac / edat / zamir
  while: 'iken',
  active: 'aktif',
  and: 've',
  or: 'veya',
  with: 'ile',
  without: 'olmadan',
  from: 'kaynaklı',
  to: '-e',
  in: 'içinde',
  into: 'içine',
  on: 'üzerine',
  of: '-in',
  for: 'için',
  per: 'başına',
  by: 'ile',
  at: '-de',
  each: 'her',
  every: 'her',
  all: 'tüm',
  any: 'herhangi',
  both: 'her ikisi',
  that: 'ki',
  this: 'bu',
  these: 'bu',
  those: 'şu',
  they: 'onlar',
  them: 'onları',
  their: 'onların',
  you: 'sen',
  your: 'senin',
  yourself: 'kendin',
  it: 'o',
  its: 'onun',
  if: 'eğer',
  when: 'olduğunda',
  while_: 'iken',
  then: 'sonra',
  than: '-den',
  also: 'ayrıca',
  only: 'sadece',
  instead: 'yerine',
  otherwise: 'aksi halde',
  not: 'değil',
  no: 'yok',
  based: 'bağlı',
  additional: 'ek',
  additionally: 'ek olarak',
  significant: 'önemli',
  significantly: 'önemli ölçüde',
  passively: 'pasif olarak',
  // fiil (basit form)
  is: '',
  are: '',
  be: 'olmak',
  has: 'sahip',
  have: 'sahip',
  do: 'yapar',
  does: 'yapar',
  cause: 'neden olur',
  causes: 'neden olur',
  causing: 'neden olarak',
  grant: 'verir',
  grants: 'verir',
  granted: 'verilir',
  granting: 'vererek',
  gain: 'kazan',
  gains: 'kazanır',
  gaining: 'kazanarak',
  gained: 'kazanılan',
  deal: 'hasar verir',
  deals: 'hasar verir',
  dealing: 'hasar vererek',
  apply: 'uygulanır',
  applies: 'uygulanır',
  applied: 'uygulanan',
  consume: 'tüketir',
  consumes: 'tüketir',
  cast: 'yaparsın',
  casts: 'yapar',
  perform: 'gerçekleştir',
  fire: 'fırlat', // not: "fire damage" descPhrases'te ayri ele alinir
  turn: 'dönüştür',
  become: 'olur',
  becomes: 'olur',
  // sik gecen isim / stat kelimeleri
  skill: 'beceri',
  skills: 'beceriler',
  spell: 'büyü',
  spells: 'büyüler',
  attack: 'saldırı',
  attacks: 'saldırılar',
  damage: 'hasar',
  enemy: 'düşman',
  enemies: 'düşmanlar',
  ally: 'müttefik',
  allies: 'müttefikler',
  minion: 'yaratık',
  minions: 'yaratıklar',
  target: 'hedef',
  targets: 'hedefler',
  life: 'can',
  mana: 'mana',
  energy: 'enerji',
  shield: 'kalkan',
  recovery: 'yenilenme',
  cost: 'maliyet',
  costs: 'maliyeti',
  chance: 'şans',
  level: 'seviye',
  duration: 'süre',
  area: 'alan',
  radius: 'yarıçap',
  range: 'menzil',
  second: 'saniye',
  seconds: 'saniye',
  nearby: 'yakındaki',
  maximum: 'maksimum',
  minimum: 'minimum',
  extra: 'ekstra',
  charges: 'şarj',
  charge: 'şarj',
  ground: 'yer',
  use: 'kullanım',
  support: 'destek',
  supports: 'destekler',
  supported: 'desteklenen',
  // sik gecen sifatlar (glossary components ile de ortusur)
  increased: 'artırılmış',
  reduced: 'azaltılmış',
  more: 'daha fazla',
  less: 'daha az'
}

/**
 * Aciklama cevirisi icin cok kelimeli kaliplar. Uzun kalip once uygulanir,
 * boylece "fire damage" -> "ateş hasarı" gibi dogru karsiliklar yakalanir.
 */
const DEFAULT_DESC_PHRASES: Record<string, string> = {
  'while active': 'aktifken',
  'on use': 'kullanımda',
  'per second': 'saniyede',
  'for each': 'her biri için',
  'based on': '-e bağlı olarak',
  'nearby enemies': 'yakındaki düşmanlar',
  'deals damage': 'hasar verir',
  'deal damage': 'hasar verir',
  'dealing damage': 'hasar vererek',
  'fire damage': 'ateş hasarı',
  'cold damage': 'soğuk hasarı',
  'lightning damage': 'şimşek hasarı',
  'physical damage': 'fiziksel hasar',
  'chaos damage': 'kaos hasarı',
  'elemental damage': 'elemental hasar',
  'spell damage': 'büyü hasarı',
  'attack damage': 'saldırı hasarı',
  'maximum life': 'maksimum can',
  'maximum mana': 'maksimum mana',
  'energy shield': 'enerji kalkanı',
  'power charges': 'güç şarjları',
  'frenzy charges': 'çılgınlık şarjları',
  'endurance charges': 'dayanıklılık şarjları',
  'as well as': 'ile birlikte',
  'as well': 'ayrıca'
}

function loadGlossary(): Glossary {
  const g = JSON.parse(readFileSync(glossaryPath, 'utf-8')) as Glossary
  g.gemTypes ??= {}
  g.tags ??= {}
  g.components ??= {}
  g.descPhrases ??= {}
  g.descWords ??= {}
  g.descriptions ??= {}
  g.gems ??= {}
  // Varsayilan sozlukleri ekle (mevcut elle duzenlemeleri EZME).
  for (const [k, v] of Object.entries(DEFAULT_DESC_WORDS)) {
    g.descWords[k] ??= v
  }
  for (const [k, v] of Object.entries(DEFAULT_DESC_PHRASES)) {
    g.descPhrases[k] ??= v
  }
  return g
}

/** Roma rakami mi? (sadece I V X L C D M harflerinden olusur) */
function isRoman(token: string): boolean {
  return /^[IVXLCDM]+$/.test(token)
}

/** Sayi (ya da sayi + ufak ek) mi? */
function isNumberLike(token: string): boolean {
  return /^[0-9]+$/.test(token)
}

// --- Tekillestirme (dedup) yardimcilari ----------------------------------
// Kaynak veride ayni BASE skill birden cok kez gecer: tier ekleri (" I"/" II"/
// " III"), silah varyantlari (ayni ad, farkli id) ve placeholder'lar. Her
// benzersiz base adi icin TEK kayit uretmek istiyoruz.

/** Oyunda gercek olmayan yer tutucu/placeholder gem adlari. */
const PLACEHOLDER_NAMES = new Set(['Coming Soon', 'Removed Skill'])

/** Bu gem bir placeholder mi? (atlanmali) */
function isPlaceholder(gem: RawGem): boolean {
  if (!gem.base_item) return true
  if (PLACEHOLDER_NAMES.has(gem.base_item.display_name)) return true
  // "...Unknown1", "...Unknown2" gibi rezervasyon placeholder id'leri.
  if (/Unknown\d*$/.test(gem.base_item.id)) return true
  return false
}

/** Roma rakamini sayiya cevirir (tier sirasi icin). */
function romanToInt(s: string): number {
  const m: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
  let total = 0
  let prev = 0
  for (let i = s.length - 1; i >= 0; i--) {
    const v = m[s[i]] ?? 0
    if (v < prev) total -= v
    else {
      total += v
      prev = v
    }
  }
  return total
}

/** Addaki sondaki tier roma rakamini atip base adi dondurur ("Aftershock II" -> "Aftershock"). */
function baseName(name: string): string {
  return name.replace(/\s+[IVXLCDM]+$/, '').trim()
}

/** Tier sirasi: ekli roma rakami varsa degeri, yoksa 1 (en dusuk = base). */
function tierOf(name: string): number {
  const match = name.match(/\s+([IVXLCDM]+)$/)
  return match ? romanToInt(match[1]) : 1
}

/**
 * Bir gem adini kelime kelime cevirir. components sozlugu buyuk/kucuk harf
 * duyarsiz eslesir. Bilinmeyen kelime oldugu gibi (Ingilizce) kalir.
 */
function translateByComponents(
  en: string,
  wordMap: Map<string, string>
): string {
  const tokens = en.split(/\s+/).filter((tok) => tok.length > 0)
  const out: string[] = []
  for (const tok of tokens) {
    const lead = (tok.match(/^[^0-9A-Za-zÀ-ÿ]+/) || [''])[0]
    const trail = (tok.match(/[^0-9A-Za-zÀ-ÿ]+$/) || [''])[0]
    const core = tok.slice(lead.length, tok.length - trail.length)
    if (core.length === 0) {
      out.push(tok)
      continue
    }
    if (isRoman(core) || isNumberLike(core)) {
      out.push(tok)
      continue
    }
    const lower = core.toLocaleLowerCase('en')
    if (DROP_WORDS.has(lower)) continue
    const hit = wordMap.get(lower)
    out.push(lead + (hit ?? core) + trail)
  }
  const result = out.join(' ').trim()
  return result.length > 0 ? result : en
}

/**
 * RePoE baglanti soz dizimini insana okunur Ingilizceye cevirir:
 *   [A|B] -> B   (B = oyunda gosterilen metin)
 *   [A]   -> A
 * Boylece desc_en oyuncunun gordugu metne yaklasir.
 */
function cleanLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split('|')
    return parts.length > 1 ? parts[1] : parts[0]
  })
}

/**
 * Bir gem'in Ingilizce aciklamasini olusturur:
 *  - support_text (varsa) + grants_skills uzerinden active_skill.description
 *  - ayrica 1. seviye stat_text etki metinleri
 * Satirlar tekillestirilir; her biri ayri satira yazilir.
 */
function buildDescEn(gem: RawGem, skills: Record<string, RawSkill>): string {
  const lines: string[] = []
  if (gem.support_text) lines.push(gem.support_text)
  for (const skillId of gem.grants_skills ?? []) {
    const s = skills[skillId]
    if (!s) continue
    if (s.active_skill?.description) lines.push(s.active_skill.description)
    for (const ss of s.stat_sets ?? []) {
      const lvl1 = ss.per_level?.['1']
      const st = lvl1?.stat_text
      if (!st) continue
      for (const txt of Object.values(st)) if (txt) lines.push(txt)
    }
  }
  // Baglanti soz dizimini temizle, ic satir sonlarini bosluga cevir, tekille.
  const cleaned = lines
    .map((l) => cleanLinks(l).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
  return [...new Set(cleaned)].join('\n')
}

// Koruma isaretcileri: metinde gecmeyen kontrol karakterleri. Boylece korunan
// parca ne bosluga gore bolunur ne de kelime cevirisine girer; cikti oncesi geri konur.
const SENT_OPEN = ''
const SENT_CLOSE = ''

/**
 * Bir aciklama satirini Turkceye cevirir:
 *  1. Sayilari/yuzdeleri ve {..} yer tutucularini korumaya alir.
 *  2. descPhrases kaliplarini (uzun olan once) uygular ve korumaya alir.
 *  3. Kalan kelimeleri descWords + components ile cevirir (tek kelime).
 *  4. Korunan parcalari geri koyar.
 * Sozlukte olmayan kelime Ingilizce kalir (genelde ozel ad).
 */
function translateDescLine(
  line: string,
  phrases: Array<[string, string]>,
  wordMap: Map<string, string>
): string {
  const protectedParts: string[] = []
  const protect = (s: string): string => {
    const token = SENT_OPEN + protectedParts.length + SENT_CLOSE
    protectedParts.push(s)
    return token
  }

  // 1) Sayi/yuzde ve {..} yer tutucularini koru.
  let work = line.replace(/\{[^}]*\}/g, (m) => protect(m))
  work = work.replace(/\d[\d.,]*%?/g, (m) => protect(m))

  // 2) Cok kelimeli kaliplari (uzun once) koru.
  for (const [en, tr] of phrases) {
    const re = new RegExp(escapeRegExp(en), 'gi')
    work = work.replace(re, () => protect(tr))
  }

  // 3) Tek kelime cevirisi.
  const tokens = work.split(/(\s+)/) // bosluklari da koru
  const out = tokens.map((tok) => {
    if (/^\s+$/.test(tok) || tok.length === 0) return tok
    if (tok.includes(SENT_OPEN)) return tok // korunan parca
    const lead = (tok.match(/^[^0-9A-Za-zÀ-ÿ]+/) || [''])[0]
    const trail = (tok.match(/[^0-9A-Za-zÀ-ÿ]+$/) || [''])[0]
    const core = tok.slice(lead.length, tok.length - trail.length)
    if (core.length === 0) return tok
    const lower = core.toLocaleLowerCase('en')
    if (wordMap.has(lower)) {
      const hit = wordMap.get(lower) as string
      if (hit === '') return lead + trail // sozlukte bos -> kelimeyi at
      return lead + hit + trail
    }
    return tok // sozlukte yok -> Ingilizce birak
  })
  work = out.join('')

  // 4) Korunan parcalari geri koy.
  work = work.replace(
    new RegExp(SENT_OPEN + '(\\d+)' + SENT_CLOSE, 'g'),
    (_m, i: string) => protectedParts[Number(i)]
  )
  return work.replace(/[ 	]+/g, ' ').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Cok satirli desc_en'i satir satir cevirir. */
function translateDesc(
  descEn: string,
  phrases: Array<[string, string]>,
  wordMap: Map<string, string>
): string {
  if (!descEn) return ''
  return descEn
    .split('\n')
    .map((l) => translateDescLine(l, phrases, wordMap))
    .join('\n')
}

/** Ikon kaynagini bir DDS yolundan PNG indirme URL'sine cevirir. */
function iconUrl(ddsPath: string): string {
  return SOURCE_BASE + ddsPath.replace(/\.dds$/i, '.png')
}

/** DDS yolundan yerel dosya adini uretir (basename, .png). */
function iconBasename(ddsPath: string): string {
  return ddsPath.split('/').pop()!.replace(/\.dds$/i, '.png')
}

/** Tek bir ikonu indirir (deneme tekrarli). Basari/durum dondurur. */
async function downloadIcon(url: string, dest: string): Promise<boolean> {
  for (let attempt = 0; attempt <= ICON_RETRIES; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 404) return false // kalici hata, tekrar deneme
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

/**
 * Verilen (basename -> url) haritasindaki ikonlari, var olanlari atlayarak,
 * sinirli es zamanlilikla indirir. Sonuc: indirilen, atlanan(zaten var),
 * basarisiz basename kumeleri.
 */
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

async function main(): Promise<void> {
  const glossary = loadGlossary()

  // components + descWords -> kucuk harfli arama haritasi (descWords oncelikli).
  const wordMap = new Map<string, string>()
  for (const [k, v] of Object.entries(glossary.components)) {
    wordMap.set(k.toLocaleLowerCase('en'), v)
  }
  for (const [k, v] of Object.entries(glossary.descWords)) {
    wordMap.set(k.toLocaleLowerCase('en'), v)
  }
  // Kaliplar: uzun olan once uygulanmali.
  const phrases: Array<[string, string]> = Object.entries(glossary.descPhrases)
    .map(([k, v]) => [k.toLocaleLowerCase('en'), v] as [string, string])
    .sort((a, b) => b[0].length - a[0].length)

  console.log(`İndiriliyor: ${GEMS_URL}`)
  console.log(`İndiriliyor: ${SKILLS_URL}`)
  console.log(`İndiriliyor: ${BASE_ITEMS_URL}`)
  const [gemsRes, skillsRes, baseItemsRes] = await Promise.all([
    fetch(GEMS_URL),
    fetch(SKILLS_URL),
    fetch(BASE_ITEMS_URL)
  ])
  if (!gemsRes.ok) throw new Error(`İndirme başarısız (gems): HTTP ${gemsRes.status}`)
  if (!skillsRes.ok) throw new Error(`İndirme başarısız (skills): HTTP ${skillsRes.status}`)
  if (!baseItemsRes.ok) throw new Error(`İndirme başarısız (base_items): HTTP ${baseItemsRes.status}`)
  const raw = (await gemsRes.json()) as Record<string, RawGem>
  const skills = (await skillsRes.json()) as Record<string, RawSkill>
  const baseItems = (await baseItemsRes.json()) as Record<string, RawBaseItem>
  const today = new Date().toISOString().slice(0, 10)

  const records: GemRecord[] = []
  // Cevirisi otomatik uretilen yeni adlari glossary'ye geri yazmak icin.
  const newGems: Record<string, TrEntry> = {}
  // Indirilecek ikonlar: basename -> url (tekillestirilmis).
  const iconByBasename = new Map<string, string>()

  // --- 1) Filtrele + base adina gore grupla (tekillestirme) ---
  let rawReleased = 0
  let placeholderSkipped = 0
  const groups = new Map<string, Array<{ id: string; gem: RawGem }>>()
  for (const [id, gem] of Object.entries(raw)) {
    if (!gem.base_item) continue
    if (gem.base_item.release_state !== 'released') continue
    if (gem.base_item.display_name.startsWith('[')) continue
    rawReleased++
    if (isPlaceholder(gem)) {
      placeholderSkipped++
      continue
    }
    // Tier eki (" I"/" II"...) atilarak base ada gore grupla; ayni base
    // adin tum tier/varyantlari tek gruba dusup TEK kayit uretir.
    const key = baseName(gem.base_item.display_name).toLocaleLowerCase('en')
    let bucket = groups.get(key)
    if (!bucket) {
      bucket = []
      groups.set(key, bucket)
    }
    bucket.push({ id, gem })
  }

  // --- 2) Her grup icin TEK temsilci kayit uret ---
  let handNameCount = 0
  let handDescCount = 0
  for (const members of groups.values()) {
    // En dusuk tier (base) temsilci secilir; esitlikte id'ye gore deterministik.
    members.sort((a, b) => {
      const dt = tierOf(a.gem.base_item!.display_name) - tierOf(b.gem.base_item!.display_name)
      return dt !== 0 ? dt : a.gem.base_item!.id.localeCompare(b.gem.base_item!.id)
    })
    const { id, gem } = members[0]
    const en = baseName(gem.base_item!.display_name)

    // --- Ad cevirisi: once Opus/elle (auto:false), yoksa sozluk fallback ---
    let tr: string
    let status: TrStatus
    const override = glossary.gems[en]
    if (override && override.tr && !override.auto) {
      tr = override.tr
      status = override.status ?? 'proposed'
      handNameCount++
    } else {
      tr = translateByComponents(en, wordMap)
      status = 'proposed'
      newGems[en] = { tr, status, auto: true }
    }

    // --- gem_type cevirisi ---
    const typeKey = gem.gem_type ?? ''
    const typeEntry = glossary.gemTypes[typeKey]
    const gemTypeTr = typeEntry ? typeEntry.tr : (gem.gem_type ?? null)

    // --- tag cevirileri ---
    const tags = gem.tags ?? []
    const tagsTr = tags.map((tag) => {
      const te = glossary.tags[tag]
      if (te && te.tr) return te.tr
      const fallback = tag.charAt(0).toUpperCase() + tag.slice(1)
      glossary.tags[tag] = { tr: fallback, status: 'proposed' }
      return fallback
    })

    // --- aciklama: desc_en temsilciden; desc_tr once Opus/elle, yoksa sozluk ---
    const descEn = buildDescEn(gem, skills)
    let descTr = ''
    if (descEn) {
      const hand = glossary.descriptions[en]
      if (hand && hand.trim()) {
        descTr = hand
        handDescCount++
      } else {
        descTr = translateDesc(descEn, phrases, wordMap)
      }
    }

    // --- ikon yolu ---
    // Oncelik: skill_gems.json icon_dds_file (gercek .dds dosya adi tasiyorsa).
    // Bazi gem'lerde (0.5 Lineage support) bu alan BOZUK ("4k/") veya null;
    // o durumda base_items.json visual_identity.dds_file fallback'ine duseriz
    // (base_item.id ile eslenir). Ikisi de yoksa icon bos kalir (UYDURMA YOK).
    const validDds = (p: string | null | undefined): p is string =>
      !!p && /[^/]+\.dds$/i.test(p)
    let ddsFile: string | null = null
    if (validDds(gem.icon_dds_file)) {
      ddsFile = gem.icon_dds_file
    } else {
      const vi = baseItems[gem.base_item!.id]?.visual_identity?.dds_file
      if (validDds(vi)) ddsFile = vi
    }
    let icon: string | null = null
    if (ddsFile) {
      const base = iconBasename(ddsFile)
      iconByBasename.set(base, iconUrl(ddsFile))
      icon = ICON_REL_PREFIX + base
    }

    records.push({
      id,
      en,
      tr,
      tr_status: status,
      category: 'gem',
      color: gem.color ?? null,
      gem_type: gem.gem_type ?? null,
      gem_type_tr: gemTypeTr,
      tags,
      tags_tr: tagsTr,
      desc_en: descEn,
      desc_tr: descTr,
      icon,
      source: SOURCE_NAME,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: today
    })
  }

  records.sort((a, b) => a.en.localeCompare(b.en, 'en'))

  // --- Ikonlari indir ---
  console.log(`İkonlar indiriliyor (${iconByBasename.size} benzersiz dosya)...`)
  const iconResult = await downloadIcons(iconByBasename)

  // Indirilemeyen ikonlari olan kayitlarin icon alanini bosalt.
  let iconCleared = 0
  if (iconResult.failed.size > 0) {
    for (const r of records) {
      if (r.icon && iconResult.failed.has(r.icon.slice(ICON_REL_PREFIX.length))) {
        r.icon = null
        iconCleared++
      }
    }
  }

  // --- Glossary'yi geri yaz (elle duzenlenenleri koru, otomatikleri tazele) ---
  const manualGems: Record<string, TrEntry> = {}
  for (const [k, v] of Object.entries(glossary.gems)) {
    if (!v.auto) manualGems[k] = v
  }
  const mergedGems = { ...newGems, ...manualGems }
  const sortedGems: Record<string, TrEntry> = {}
  for (const key of Object.keys(mergedGems).sort((a, b) => a.localeCompare(b, 'en'))) {
    sortedGems[key] = mergedGems[key]
  }
  const sortedTags: Record<string, TrEntry> = {}
  for (const key of Object.keys(glossary.tags).sort()) {
    sortedTags[key] = glossary.tags[key]
  }
  const sortObj = (o: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const key of Object.keys(o).sort()) out[key] = o[key]
    return out
  }
  const sortedDescriptions: Record<string, string> = {}
  for (const key of Object.keys(glossary.descriptions).sort((a, b) => a.localeCompare(b, 'en'))) {
    sortedDescriptions[key] = glossary.descriptions[key]
  }
  const glossaryOut: Glossary = {
    _comment: glossary._comment,
    gemTypes: glossary.gemTypes,
    tags: sortedTags,
    components: glossary.components,
    descPhrases: sortObj(glossary.descPhrases),
    descWords: sortObj(glossary.descWords),
    descriptions: sortedDescriptions,
    gems: sortedGems
  }
  writeFileSync(glossaryPath, JSON.stringify(glossaryOut, null, 2) + '\n', 'utf-8')

  // --- gems.json yaz ---
  const outDir = join(projectRoot, 'src', 'data')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'gems.json')
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8')

  // --- Ozet ---
  const needs = records.filter((r) => r.tr_status === 'needs-translation').length
  const empty = records.filter((r) => !r.tr || r.tr.trim().length === 0).length
  const proposed = records.filter((r) => r.tr_status === 'proposed').length
  const exists = records.filter((r) => r.tr_status === 'exists').length
  const withDescEn = records.filter((r) => r.desc_en.trim().length > 0).length
  const withDescTr = records.filter((r) => r.desc_tr.trim().length > 0).length
  const emptyDesc = records.length - withDescEn
  const withIcon = records.filter((r) => r.icon).length
  const noIcon = records.length - withIcon

  console.log('')
  console.log('  --- Tekillestirme (dedup) ---')
  console.log(`  released ham gem: ${rawReleased}, placeholder elendi: ${placeholderSkipped}`)
  console.log(`  benzersiz base kayit (yazılan): ${records.length}`)
  console.log('')
  console.log(`Yazıldı: ${records.length} gem -> ${outPath}`)
  console.log(`  tr_status -> exists: ${exists}, proposed: ${proposed}, needs-translation: ${needs}`)
  console.log(`  tr (ad) alanı boş olan: ${empty}`)
  console.log('  --- Çeviri kaynağı ---')
  console.log(`  ad (tr): Opus/elle ${handNameCount}, sözlük fallback ${records.length - handNameCount}`)
  console.log(`  açıklama (desc_tr): Opus/elle ${handDescCount}, sözlük fallback ${withDescTr - handDescCount}`)
  console.log('  --- Açıklamalar ---')
  console.log(`  desc_en dolu: ${withDescEn}, desc_tr dolu: ${withDescTr}`)
  console.log(`  desc_en boş (açıklama yok, desc_tr de boş): ${emptyDesc}`)
  console.log('  --- İkonlar ---')
  console.log(`  icon alanı dolu (gem): ${withIcon}, icon boş: ${noIcon}`)
  console.log(`  indirilen: ${iconResult.downloaded}, zaten vardı: ${iconResult.existed}, indirilemeyen dosya: ${iconResult.failed.size}`)
  if (iconCleared > 0) {
    console.log(`  indirilemediği için icon alanı boşaltılan kayıt: ${iconCleared}`)
  }
  console.log(`  Glossary: ${Object.keys(sortedGems).length} gem adı, ${Object.keys(sortedDescriptions).length} elle açıklama`)
}

main().catch((err) => {
  console.error('Hata:', err)
  process.exit(1)
})
