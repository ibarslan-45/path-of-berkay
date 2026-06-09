<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import pobeLogo from '../assets/pobe-logo.png'
import PassiveTreeCanvas from './components/PassiveTreeCanvas.vue'
import AtlasTreeCanvas from './components/AtlasTreeCanvas.vue'
import LevelingView from './components/LevelingView.vue'
import BuildView from './components/BuildView.vue'
import DangerView from './components/DangerView.vue'
import CraftSimulator from './components/CraftSimulator.vue'
import ChatView from './components/ChatView.vue'
import WelcomeTour from './components/WelcomeTour.vue'
import UpdateBanner from './components/UpdateBanner.vue'
import HomeView from './components/HomeView.vue'
import WhatsNew from './components/WhatsNew.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import FeedbackModal from './components/FeedbackModal.vue'
import gemsData from '../../data/gems.json'
import currencyData from '../../data/currency.json'
import itemsData from '../../data/items.json'
import uniquesData from '../../data/uniques.json'
import modsData from '../../data/mods.json'
import areasData from '../../data/areas.json'
import ascendanciesData from '../../data/ascendancies.json'
import passivesData from '../../data/passives.json'
import atlasData from '../../data/atlas.json'
import mechanicsData from '../../data/mechanics.json'
import bossesData from '../../data/bosses.json'
import craftingData from '../../data/crafting.json'
import keywordsData from '../../data/keywords.json'

interface Gem {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  category: string
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

const gems = gemsData as Gem[]
const { t, locale } = useI18n()

// Ikon dosyalarini derleme aninda topla: basename -> cozulmus URL.
const iconModules = import.meta.glob('../assets/gems/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const iconMap: Record<string, string> = {}
for (const path in iconModules) {
  const base = path.split('/').pop() as string
  iconMap[base] = iconModules[path]
}
function iconUrl(gem: Gem): string | null {
  if (!gem.icon) return null
  const base = gem.icon.split('/').pop() as string
  return iconMap[base] ?? null
}

// --- Currency (para birimi) ---------------------------------------------
interface Currency {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
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
const currencies = currencyData as Currency[]
const currencyIconModules = import.meta.glob('../assets/currency/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const currencyIconMap: Record<string, string> = {}
for (const path in currencyIconModules) {
  const base = path.split('/').pop() as string
  currencyIconMap[base] = currencyIconModules[path]
}
function currencyIconUrl(c: Currency): string | null {
  if (!c.icon) return null
  const base = c.icon.split('/').pop() as string
  return currencyIconMap[base] ?? null
}

// --- Items (ekipman tabanları) ------------------------------------------
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
interface Item {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
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
const items = itemsData as Item[]
const itemIconModules = import.meta.glob('../assets/items/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const itemIconMap: Record<string, string> = {}
for (const path in itemIconModules) {
  const base = path.split('/').pop() as string
  itemIconMap[base] = itemIconModules[path]
}
function itemIconUrl(it: Item): string | null {
  if (!it.icon) return null
  const base = it.icon.split('/').pop() as string
  return itemIconMap[base] ?? null
}

// --- Uniques (eşsiz eşyalar) --------------------------------------------
// 1. parça (RePoE-only): ad + sınıf + ikon. Mod ve flavour SONRAKİ adımda
// (poe2db) eklenecek; şimdilik boş — UI'da küçük gri not gösterilir.
interface Unique {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
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
const uniques = uniquesData as Unique[]
const uniqueIconModules = import.meta.glob('../assets/uniques/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const uniqueIconMap: Record<string, string> = {}
for (const path in uniqueIconModules) {
  const base = path.split('/').pop() as string
  uniqueIconMap[base] = uniqueIconModules[path]
}
function uniqueIconUrl(u: Unique): string | null {
  if (!u.icon) return null
  const base = u.icon.split('/').pop() as string
  return uniqueIconMap[base] ?? null
}

// --- Bölge görselleri (ödül/quest ikon, bölge görseli, boss görseli) ----
// produce-area-assets.cjs üretir; path 'assets/<klasör>/<dosya>.png' biçiminde.
const areaAssetModules = {
  ...(import.meta.glob('../assets/rewards/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../assets/questitems/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../assets/areas/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../assets/bosses/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
}
const areaAssetMap: Record<string, string> = {}
for (const path in areaAssetModules) {
  const base = path.split('/').pop() as string
  areaAssetMap[base] = areaAssetModules[path]
}
/** 'assets/.../x.png' -> gerçek URL (basename ile çözülür). */
function areaAssetUrl(rel: string | null | undefined): string | null {
  if (!rel) return null
  const base = rel.split('/').pop() as string
  return areaAssetMap[base] ?? null
}

// --- Mods (item prefix/suffix stat'ları) --------------------------------
// İkonu yoktur. Çok büyük olabileceği için arama + affix + tag filtresi.
interface ModTier {
  level: number
  values: string
}
interface Mod {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  affix_type: 'prefix' | 'suffix'
  affix_name: string
  tags: string[]
  required_level: number
  level_max: number
  tier_count: number
  tiers: ModTier[]
  applies_to: string[]
  category: 'mod'
  source: string
  game_version: string
  league: string
  last_updated: string
}
const mods = modsData as Mod[]

// --- Areas (bölgeler: kampanya + endgame) -------------------------------
interface Area {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  act: string
  act_order: number
  area_level: number
  type: 'town' | 'zone'
  connected_to: string[]
  connected_to_tr: string[]
  bosses: string[]
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
  area_image: string | null
  boss_images: string[]
  reward_icons: string[]
  category: 'area'
  source: string
  game_version: string
  league: string
  last_updated: string
}
const areas = areasData as Area[]

// --- Ascendancies (sınıf + yükseliş) ------------------------------------
interface AscNode {
  name_en: string
  name_tr: string
  stat_en: string
  stat_tr: string
  notable: boolean
}
interface Ascendancy {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  type: 'class' | 'ascendancy'
  parent_class: string | null
  parent_class_tr: string | null
  attribute: string | null
  desc_en: string
  desc_tr: string
  nodes: AscNode[]
  icon: string | null
  category: 'ascendancy'
  source: string
  game_version: string
  league: string
  last_updated: string
}
const ascendancies = ascendanciesData as Ascendancy[]
const ascIconModules = import.meta.glob('../assets/ascendancies/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const ascIconMap: Record<string, string> = {}
for (const path in ascIconModules) {
  const base = path.split('/').pop() as string
  ascIconMap[base] = ascIconModules[path]
}
function ascIconUrl(a: Ascendancy | null): string | null {
  if (!a || !a.icon) return null
  const base = a.icon.split('/').pop() as string
  return ascIconMap[base] ?? null
}

// Aktif sekme: taşlar / para birimi / eşyalar / eşsizler / modlar / bölgeler / yükselişler.
type Mode = 'home' | 'gems' | 'currency' | 'items' | 'uniques' | 'mods' | 'areas' | 'ascendancies' | 'passives' | 'atlas' | 'mechanics' | 'bosses' | 'crafting' | 'leveling' | 'build' | 'danger' | 'chat'
const mode = ref<Mode>('home') // varsayılan açılış: Ana Sayfa
// İlk açılış tanıtımı (onboarding, Cila ADIM 2)
const showTour = ref(false)
function finishTour(): void {
  showTour.value = false
  window.api?.settings?.set({ firstRunDone: true })
}
function openSettingsFromTour(): void {
  showTour.value = false
  window.api?.settings?.set({ firstRunDone: true })
  showSettings.value = true
}
function replayTour(): void {
  showSettings.value = false
  idxTourReset()
}
function idxTourReset(): void {
  showTour.value = true
}
// --- Arayüz yazı tipi (0.15.1) — Ayarlar'dan değişir, anında + kalıcı uygulanır ---
// Boyut (zoom) main process'te webContents.setZoomFactor ile uygulanır (tüm UI ölçeklenir).
const FONT_STACKS: Record<string, string> = {
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  system: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  serif: "'Fontin', 'EB Garamond', Georgia, serif"
}
function applyUiFont(font: string | undefined): void {
  const stack = FONT_STACKS[font ?? 'helvetica'] ?? FONT_STACKS.helvetica
  document.documentElement.style.setProperty('--font-body', stack)
}
// --- Geri Bildirim / Öneri (0.15.1) ---
const showFeedback = ref(false)
function openFeedback(): void {
  showSettings.value = false
  showFeedback.value = true
}

// --- "Neler değişti" (güncelleme sonrası 1 kez; Yardım/Hakkında'dan tekrar açılır) ---
const showWhatsNew = ref(false)
const appVer = ref('')
let unsubSettingsFont: (() => void) | null = null
onMounted(async () => {
  const s = (await window.api?.settings?.get()) as { firstRunDone?: boolean; lastSeenVersion?: string; ui?: { font?: string } } | undefined
  applyUiFont(s?.ui?.font) // kaydedilen yazı tipini hemen uygula
  // Ayarlar panelinden font değişince App.vue de hemen yeniden uygulasın (panel ayrı bileşen).
  unsubSettingsFont = window.api?.settings?.onChanged((ns) => applyUiFont((ns as { ui?: { font?: string } })?.ui?.font)) ?? null
  if (s && s.firstRunDone === false) showTour.value = true
  appVer.value = (await window.api?.appVersion?.().catch(() => '')) || ''
  const seen = s?.lastSeenVersion ?? ''
  // İLK kurulum (firstRunDone false) → onboarding gösterilir, "neler değişti" GÖSTERME, sürümü sessiz işaretle.
  // Mevcut kullanıcı güncelledi (firstRunDone true ve sürüm farklı) → "neler değişti" göster.
  if (s && s.firstRunDone === true && appVer.value && seen !== appVer.value) {
    showWhatsNew.value = true
  } else if (appVer.value && seen !== appVer.value) {
    window.api?.settings?.set({ lastSeenVersion: appVer.value }) // sessiz işaretle (ilk kurulum)
  }
})
function closeWhatsNew(): void {
  showWhatsNew.value = false
  if (appVer.value) window.api?.settings?.set({ lastSeenVersion: appVer.value })
}
function openWhatsNew(): void {
  showSettings.value = false
  showWhatsNew.value = true
}
function setMode(m: Mode): void {
  mode.value = m
}
// HomeView 'navigate' string yayar; Mode'a daralt (kategori anahtarları Mode değerleridir).
function onNavigate(m: string): void {
  setMode(m as Mode)
}
// Part 5: BuildView "Craft'la" → Craft Simülatörü'ne geç (tohum build-target store'da; CraftSimulator okur)
function goCraftSim(): void {
  craftView.value = 'sim'
  mode.value = 'crafting'
}
// Ayar paneli görünürlüğü
const showSettings = ref(false)

// Gem oznitelik (color) -> placeholder ton sinifi.
function attrClass(color: string | null): string {
  switch (color) {
    case 'r':
      return 'attr--str'
    case 'g':
      return 'attr--dex'
    case 'b':
      return 'attr--int'
    default:
      return 'attr--none'
  }
}

const isTr = computed(() => locale.value === 'tr')
const query = ref('')

// Filtreleme. Birincil eslestirme anahtari her zaman EN orijinal addir.
const filtered = computed<Gem[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  if (!q) return gems
  return gems.filter(
    (g) =>
      g.en.toLocaleLowerCase('en').includes(q) ||
      g.tr.toLocaleLowerCase('tr').includes(q)
  )
})

// Baslangicta ilk gem secili olsun (tooltip paneli dolu gorunur).
const selectedId = ref<string | null>(gems.length > 0 ? gems[0].id : null)
const selected = computed<Gem | null>(
  () => gems.find((g) => g.id === selectedId.value) ?? null
)
function select(gem: Gem): void {
  selectedId.value = gem.id
}

function displayName(g: Gem): string {
  return g.en // özel ad HER ZAMAN EN (TR yerelleştirme kuralı)
}
// TR yerelleştirme işareti: TR modunda, çevirisi yoksa/öneriyse uyar (uydurma yok, statik).
function trMark(rec: { tr_status?: string } | null | undefined): string {
  if (!isTr.value || !rec?.tr_status) return ''
  if (rec.tr_status === 'needs-translation') return 'çeviri yok'
  if (rec.tr_status === 'proposed') return 'doğrulanmalı'
  return ''
}
// Gem adinin hemen altindaki kisa kategori (oyundaki "Attack"/"Support").
// Saldiri/Buyu, gercek tag verisinden cikarilir; uydurma yok.
function catLabel(g: Gem): string {
  const tr = isTr.value
  if (g.gem_type === 'support') return tr ? 'Destek' : 'Support'
  if (g.tags.includes('attack')) return tr ? 'Saldırı' : 'Attack'
  if (g.tags.includes('spell')) return tr ? 'Büyü' : 'Spell'
  if (g.gem_type === 'spirit') return tr ? 'Kalıcı' : 'Persistent'
  return tr ? 'Yetenek' : 'Skill'
}
// Sol listedeki tur etiketi (dile gore: Aktif/Destek/Kalici).
function listType(g: Gem): string {
  const tr = isTr.value
  switch (g.gem_type) {
    case 'support':
      return tr ? 'Destek' : 'Support'
    case 'spirit':
      return tr ? 'Kalıcı' : 'Persistent'
    default:
      return tr ? 'Aktif' : 'Active'
  }
}

// Tooltip stat satiri: tam gem kategorisi (Aktif Yetenek Taşı / Active Skill Gem).
function categoryLabel(g: Gem): string {
  if (isTr.value) return g.gem_type_tr ?? ''
  switch (g.gem_type) {
    case 'support':
      return 'Support Gem'
    case 'spirit':
      return 'Persistent Skill Gem'
    default:
      return 'Active Skill Gem'
  }
}
// Oznitelik (color alanindan; gercek veri). 'w'/yoksa null.
function attrLabel(g: Gem): string | null {
  const tr = isTr.value
  switch (g.color) {
    case 'r':
      return tr ? 'Güç' : 'Strength'
    case 'g':
      return tr ? 'Çeviklik' : 'Dexterity'
    case 'b':
      return tr ? 'Zekâ' : 'Intelligence'
    default:
      return null
  }
}

// Etiketleri temizle: oznitelik / ic id'ler ve kategori (attack/spell) gizlenir;
// 'area' -> 'AoE'. Cirkin ham id (grants_active_skill) ASLA gosterilmez.
const HIDE_TAGS = new Set([
  'strength',
  'dexterity',
  'intelligence',
  'grants_active_skill',
  'attack',
  'spell'
])
const TAG_EN_OVERRIDE: Record<string, string> = { area: 'AoE' }
function cleanTags(g: Gem): string[] {
  const out: string[] = []
  g.tags.forEach((raw, i) => {
    if (HIDE_TAGS.has(raw)) return
    if (isTr.value) {
      out.push(g.tags_tr[i] ?? raw)
    } else {
      out.push(TAG_EN_OVERRIDE[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1))
    }
  })
  return out
}

// --- Anahtar kelime alti-cizimi (refs gibi) + sayi vurgusu -------------------
// keywords.json (EN+TR, uzun-once sirali) -> tek alternasyon regex. Sayi VEYA
// oyun-terimi eslesir; terim kelime-siniri kontrolunden gecerse 'kw' isaretlenir.
type MarkPart = { t: 'text' | 'num' | 'aug' | 'kw'; s: string }
const KW_TERMS = (keywordsData as Array<{ en: string; tr: string }>)
  .flatMap((o) => [o.en, o.tr])
  .filter((s, i, a) => s && a.indexOf(s) === i)
  .sort((a, b) => b.length - a.length)
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
// Sayi token'i: opsiyonel '+' onek (augmented isareti) + sayi (% on/son ek)
const NUM_RE = '\\+?%?\\d[\\d.,]*%?'
const KW_RE = new RegExp(`(${NUM_RE})|(${KW_TERMS.map(escRe).join('|')})`, 'gi')
const LETTER = /[A-Za-zÀ-ÿçğışöüÇĞİŞÖÜ]/
// Satir augmented mi? "+X" / "from Gem|Quality|Modifiers" / "Levels from" gibi
// disardan-gelen-bonus satirlari refs'te mavi (Snipe "3 Levels from Gem").
const AUG_LINE = /from Gem|from Quality|Levels? from|Global Modifier|Kaliteden|Taştan|Küresel Değiştirici/i
function markupLine(line: string): MarkPart[] {
  if (!line) return []
  const lineAug = AUG_LINE.test(line)
  const parts: MarkPart[] = []
  let last = 0
  let m: RegExpExecArray | null
  KW_RE.lastIndex = 0
  while ((m = KW_RE.exec(line)) !== null) {
    const s = m[0]
    const idx = m.index
    if (m[2]) {
      // kelime-siniri: oncesi/sonrasi harf ise tam kelime degil -> atla (metne dahil olur)
      const prev = idx > 0 ? line[idx - 1] : ''
      const next = idx + s.length < line.length ? line[idx + s.length] : ''
      if (LETTER.test(prev) || LETTER.test(next)) continue
    }
    if (idx > last) parts.push({ t: 'text', s: line.slice(last, idx) })
    // augmented: '+' onekli VEYA augmented-kaynak satirindaki sayilar -> mavi
    const t: MarkPart['t'] = m[1]
      ? (s[0] === '+' || lineAug ? 'aug' : 'num')
      : 'kw'
    parts.push({ t, s })
    last = idx + s.length
  }
  if (last < line.length) parts.push({ t: 'text', s: line.slice(last) })
  return parts
}

// Aciklamayi flavor (ilk satir, italik) + mod satirlari (kalanlar) olarak ayir.
// Oyundaki gibi: ust kisim italik anlati, alti dik stat/mod satirlari.
interface DescParts {
  flavor: string
  mods: string[]
}
function descParts(text: string): DescParts {
  const lines = text ? text.split('\n') : []
  return { flavor: lines[0] ?? '', mods: lines.slice(1) }
}
const primaryParts = computed<DescParts>(() => {
  const g = selected.value
  if (!g) return { flavor: '', mods: [] }
  return descParts(isTr.value ? g.desc_tr : g.desc_en)
})
const secondaryParts = computed<DescParts>(() => {
  const g = selected.value
  if (!g) return { flavor: '', mods: [] }
  return descParts(isTr.value ? g.desc_en : g.desc_tr)
})
const hasAnyDesc = computed(
  () =>
    primaryParts.value.flavor.length > 0 ||
    primaryParts.value.mods.length > 0 ||
    secondaryParts.value.flavor.length > 0 ||
    secondaryParts.value.mods.length > 0
)

// Currency filtreleme (anahtar EN). Gem'lerle aynı arama kutusu kullanılır.
const filteredCurrency = computed<Currency[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  if (!q) return currencies
  return currencies.filter(
    (c) =>
      c.en.toLocaleLowerCase('en').includes(q) ||
      c.tr.toLocaleLowerCase('tr').includes(q)
  )
})
// Varsayilan: taninir bir currency (Chaos Orb) secili gelsin; yoksa ilk kayit.
const selectedCurrencyId = ref<string | null>(
  currencies.find((c) => c.en === 'Chaos Orb')?.id ??
    (currencies.length > 0 ? currencies[0].id : null)
)
const selectedCurrency = computed<Currency | null>(
  () => currencies.find((c) => c.id === selectedCurrencyId.value) ?? null
)
function selectCurrency(c: Currency): void {
  selectedCurrencyId.value = c.id
}
function curName(c: Currency): string {
  return c.en // özel ad EN
}
function curSubtype(c: Currency): string {
  return c.subtype_tr || c.subtype
}
const curPrimaryParts = computed<DescParts>(() => {
  const c = selectedCurrency.value
  if (!c) return { flavor: '', mods: [] }
  return descParts(isTr.value ? c.desc_tr : c.desc_en)
})
const curSecondaryParts = computed<DescParts>(() => {
  const c = selectedCurrency.value
  if (!c) return { flavor: '', mods: [] }
  return descParts(isTr.value ? c.desc_en : c.desc_tr)
})
const curHasAnyDesc = computed(
  () =>
    curPrimaryParts.value.flavor.length > 0 ||
    curPrimaryParts.value.mods.length > 0 ||
    curSecondaryParts.value.flavor.length > 0 ||
    curSecondaryParts.value.mods.length > 0
)

// --- Item filtreleme + seçim --------------------------------------------
// Sınıf filtresi için benzersiz item_class listesi (slot sırasını korur).
interface ClassOpt {
  key: string
  en: string
  tr: string
}
const itemClassOptions = computed<ClassOpt[]>(() => {
  const seen = new Map<string, ClassOpt>()
  for (const it of items) {
    if (!seen.has(it.item_class))
      seen.set(it.item_class, {
        key: it.item_class,
        en: it.item_class,
        tr: it.item_class_tr
      })
  }
  return [...seen.values()]
})
const selectedItemClass = ref<string>('') // '' = tüm sınıflar
function classLabel(o: ClassOpt): string {
  return isTr.value ? o.tr : o.en
}

// Filtreleme (anahtar EN) + sınıf filtresi.
const filteredItems = computed<Item[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  return items.filter((it) => {
    if (selectedItemClass.value && it.item_class !== selectedItemClass.value)
      return false
    if (!q) return true
    return (
      it.en.toLocaleLowerCase('en').includes(q) ||
      it.tr.toLocaleLowerCase('tr').includes(q)
    )
  })
})
const selectedItemId = ref<string | null>(items.length > 0 ? items[0].id : null)
const selectedItem = computed<Item | null>(
  () => items.find((it) => it.id === selectedItemId.value) ?? null
)
function selectItem(it: Item): void {
  selectedItemId.value = it.id
}
function itemName(it: Item): string {
  return it.en // özel ad EN
}
function itemClassName(it: Item): string {
  return isTr.value ? it.item_class_tr : it.item_class
}

// Tooltip taban stat satırları (sadece dolu olanlar). Etiket dile göre.
interface StatRow {
  k: string
  v: string
}
function statRows(it: Item): StatRow[] {
  const s = it.base_stats
  const rows: StatRow[] = []
  if (it.attribute_tr) rows.push({ k: t('statAttribute'), v: it.attribute_tr })
  if (s.phys_min !== undefined && s.phys_max !== undefined)
    rows.push({ k: t('statDamage'), v: `${s.phys_min}–${s.phys_max}` })
  if (s.aps !== undefined) rows.push({ k: t('statAps'), v: s.aps.toFixed(2) })
  if (s.crit !== undefined)
    rows.push({ k: t('statCrit'), v: `${s.crit.toFixed(2)}%` })
  if (s.armour !== undefined) rows.push({ k: t('statArmour'), v: String(s.armour) })
  if (s.evasion !== undefined)
    rows.push({ k: t('statEvasion'), v: String(s.evasion) })
  if (s.energy_shield !== undefined)
    rows.push({ k: t('statEnergyShield'), v: String(s.energy_shield) })
  if (s.ward !== undefined) rows.push({ k: t('statWard'), v: String(s.ward) })
  if (s.block !== undefined) rows.push({ k: t('statBlock'), v: `${s.block}%` })
  // Gereksinimler tek satırda.
  const req: string[] = []
  if (s.req_level !== undefined) req.push(`${t('statLevel')} ${s.req_level}`)
  if (s.req_str !== undefined)
    req.push(`${isTr.value ? 'Güç' : 'Str'} ${s.req_str}`)
  if (s.req_dex !== undefined)
    req.push(`${isTr.value ? 'Çeviklik' : 'Dex'} ${s.req_dex}`)
  if (s.req_int !== undefined)
    req.push(`${isTr.value ? 'Zekâ' : 'Int'} ${s.req_int}`)
  if (req.length) rows.push({ k: t('statRequires'), v: req.join(', ') })
  if (s.drop_level !== undefined)
    rows.push({ k: t('statDropLevel'), v: String(s.drop_level) })
  return rows
}
// Implicit satırları (mod gibi): birincil dil + ikincil dil.
function itemImplicitLines(it: Item, primary: boolean): string[] {
  const txt = primary
    ? isTr.value
      ? it.implicit_tr
      : it.implicit_en
    : isTr.value
      ? it.implicit_en
      : it.implicit_tr
  return txt ? txt.split('\n').filter((l) => l.trim()) : []
}

// --- Unique filtreleme + seçim ------------------------------------------
// Filtreleme (anahtar EN). Gem/currency ile aynı arama kutusu.
const filteredUniques = computed<Unique[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  if (!q) return uniques
  return uniques.filter(
    (u) =>
      u.en.toLocaleLowerCase('en').includes(q) ||
      u.tr.toLocaleLowerCase('tr').includes(q)
  )
})
const selectedUniqueId = ref<string | null>(
  uniques.length > 0 ? uniques[0].id : null
)
const selectedUnique = computed<Unique | null>(
  () => uniques.find((u) => u.id === selectedUniqueId.value) ?? null
)
function selectUnique(u: Unique): void {
  selectedUniqueId.value = u.id
}
function uniqueName(u: Unique): string {
  return u.en // özel ad EN
}
function uniqueClassName(u: Unique): string {
  return isTr.value ? u.item_class_tr : u.item_class
}
// Mod/flavour 1. parçada boş; doluysa (sonraki adım) birincil/ikincil dil.
function uniqueMods(u: Unique, primary: boolean): string[] {
  return primary
    ? isTr.value
      ? u.mods_tr
      : u.mods_en
    : isTr.value
      ? u.mods_en
      : u.mods_tr
}
const uniqueHasContent = computed(() => {
  const u = selectedUnique.value
  if (!u) return false
  return u.mods_en.length > 0 || u.flavour_en.trim().length > 0
})
// Tooltip: birincil dil belirgin, ikincil dil soluk (gem/currency deseni).
const uModsPrimary = computed<string[]>(() =>
  selectedUnique.value ? uniqueMods(selectedUnique.value, true) : []
)
const uModsSecondary = computed<string[]>(() =>
  selectedUnique.value ? uniqueMods(selectedUnique.value, false) : []
)
function flavourLines(text: string): string[] {
  return text ? text.split('\n').filter((l) => l.trim()) : []
}
const uFlavourPrimary = computed<string[]>(() => {
  const u = selectedUnique.value
  if (!u) return []
  return flavourLines(isTr.value ? u.flavour_tr : u.flavour_en)
})
const uFlavourSecondary = computed<string[]>(() => {
  const u = selectedUnique.value
  if (!u) return []
  return flavourLines(isTr.value ? u.flavour_en : u.flavour_tr)
})

// --- Mod filtreleme + seçim ---------------------------------------------
// Tag görünen etiketleri (en/tr). Veri yalnızca tag anahtarı taşır.
const MOD_TAG_LABELS: Record<string, [string, string]> = {
  life: ['Life', 'Can'],
  mana: ['Mana', 'Mana'],
  fire: ['Fire', 'Ateş'],
  cold: ['Cold', 'Soğuk'],
  lightning: ['Lightning', 'Yıldırım'],
  chaos: ['Chaos', 'Kaos'],
  physical: ['Physical', 'Fiziksel'],
  elemental: ['Elemental', 'Elemental'],
  attack: ['Attack', 'Saldırı'],
  caster: ['Spell', 'Büyü'],
  defences: ['Defences', 'Savunma'],
  armour: ['Armour', 'Zırh'],
  evasion: ['Evasion', 'Kaçınma'],
  energy_shield: ['Energy Shield', 'Enerji Kalkanı'],
  resistance: ['Resistance', 'Direnç'],
  critical: ['Critical', 'Kritik'],
  attribute: ['Attribute', 'Öznitelik'],
  speed: ['Speed', 'Hız'],
  minion: ['Minion', 'Uşak'],
  flask: ['Flask', 'Şişe'],
  ailment: ['Ailment', 'Rahatsızlık'],
  block: ['Block', 'Blok'],
  poison: ['Poison', 'Zehir'],
  bleed: ['Bleed', 'Kanama'],
  curse: ['Curse', 'Lanet'],
  charm: ['Charm', 'Tılsım']
}
function modTagLabel(tag: string): string {
  const l = MOD_TAG_LABELS[tag]
  if (!l) return tag
  return isTr.value ? l[1] : l[0]
}
// Veride bulunan tag'ler (filtre menüsü için), MOD_TAG_LABELS sırasıyla.
const modTagOptions = computed<string[]>(() => {
  const present = new Set<string>()
  for (const m of mods) for (const t of m.tags) present.add(t)
  return Object.keys(MOD_TAG_LABELS).filter((t) => present.has(t))
})
// Item türü (applies_to grup anahtarı) -> görünen etiket (en/tr).
const MOD_APPLIES_LABELS: Record<string, [string, string]> = {
  weapon: ['Weapon', 'Silah'],
  body_armour: ['Body Armour', 'Vücut Zırhı'],
  helmet: ['Helmet', 'Başlık'],
  gloves: ['Gloves', 'Eldiven'],
  boots: ['Boots', 'Bot'],
  shield: ['Shield', 'Kalkan'],
  focus: ['Focus', 'Odak'],
  quiver: ['Quiver', 'Sadak'],
  amulet: ['Amulet', 'Kolye'],
  ring: ['Ring', 'Yüzük'],
  belt: ['Belt', 'Kemer'],
  jewel: ['Jewel', 'Mücevher'],
  charm: ['Charm', 'Tılsım'],
  talisman: ['Talisman', 'Uğurluk'],
  flask: ['Flask', 'Şişe']
}
function modAppliesLabel(key: string): string {
  const l = MOD_APPLIES_LABELS[key]
  if (!l) return key
  return isTr.value ? l[1] : l[0]
}
// Veride bulunan item türleri (filtre menüsü için), sabit sırayla.
const modItemTypeOptions = computed<string[]>(() => {
  const present = new Set<string>()
  for (const m of mods) for (const a of m.applies_to) present.add(a)
  return Object.keys(MOD_APPLIES_LABELS).filter((k) => present.has(k))
})

const selectedAffix = ref<'' | 'prefix' | 'suffix'>('')
const selectedModTag = ref<string>('')
const selectedItemType = ref<string>('')
const filteredMods = computed<Mod[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  return mods.filter((m) => {
    if (selectedAffix.value && m.affix_type !== selectedAffix.value) return false
    if (selectedModTag.value && !m.tags.includes(selectedModTag.value)) return false
    if (selectedItemType.value && !m.applies_to.includes(selectedItemType.value))
      return false
    if (!q) return true
    return (
      m.en.toLocaleLowerCase('en').includes(q) ||
      m.tr.toLocaleLowerCase('tr').includes(q)
    )
  })
})
const selectedModId = ref<string | null>(mods.length > 0 ? mods[0].id : null)
const selectedMod = computed<Mod | null>(
  () => mods.find((m) => m.id === selectedModId.value) ?? null
)
function selectMod(m: Mod): void {
  selectedModId.value = m.id
}
function modName(m: Mod): string {
  return (isTr.value ? m.tr : m.en).replace(/\n/g, ' / ')
}
function affixLabel(m: Mod): string {
  const tr = isTr.value
  return m.affix_type === 'prefix' ? (tr ? 'Önek' : 'Prefix') : tr ? 'Sonek' : 'Suffix'
}
function modLines(m: Mod, primary: boolean): string[] {
  const txt = primary ? (isTr.value ? m.tr : m.en) : isTr.value ? m.en : m.tr
  return txt ? txt.split('\n').filter((l) => l.trim()) : []
}
function modApplies(m: Mod): string[] {
  return m.applies_to.map((k) => modAppliesLabel(k))
}

// --- Area filtreleme + act gruplaması + seçim ---------------------------
function actGroupLabel(act: string): string {
  const tr = isTr.value
  if (act === 'interlude') return tr ? 'Ara Bölüm 1: Holten\'in Laneti' : 'Interlude 1: The Curse of Holten'
  if (act === 'interlude2') return tr ? 'Ara Bölüm 2: Çalınan Barya' : 'Interlude 2: The Stolen Barya'
  if (act === 'interlude3') return tr ? 'Ara Bölüm 3: Doryani\'nin Tedbiri' : 'Interlude 3: Doryani\'s Contingency'
  if (act === 'endgame') return tr ? 'Son Oyun' : 'Endgame'
  return tr ? `${act}. Bölüm` : `Act ${act}`
}
const filteredAreas = computed<Area[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  if (!q) return areas
  return areas.filter(
    (a) =>
      a.en.toLocaleLowerCase('en').includes(q) ||
      a.tr.toLocaleLowerCase('tr').includes(q)
  )
})
// Act'a göre gruplu liste (sıralı): [{label, order, items}]
interface AreaGroup {
  label: string
  order: number
  items: Area[]
}
const groupedAreas = computed<AreaGroup[]>(() => {
  const map = new Map<number, AreaGroup>()
  for (const a of filteredAreas.value) {
    let g = map.get(a.act_order)
    if (!g) {
      g = { label: actGroupLabel(a.act), order: a.act_order, items: [] }
      map.set(a.act_order, g)
    }
    g.items.push(a)
  }
  return [...map.values()].sort((x, y) => x.order - y.order)
})
const selectedAreaId = ref<string | null>(areas.length > 0 ? areas[0].id : null)
const selectedArea = computed<Area | null>(
  () => areas.find((a) => a.id === selectedAreaId.value) ?? null
)
function selectArea(a: Area): void {
  selectedAreaId.value = a.id
}

// --- Ascendancy filtreleme + sınıf gruplaması + seçim -------------------
const filteredAscendancies = computed<Ascendancy[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  if (!q) return ascendancies
  return ascendancies.filter(
    (a) =>
      a.en.toLocaleLowerCase('en').includes(q) ||
      a.tr.toLocaleLowerCase('tr').includes(q) ||
      (a.parent_class ?? '').toLocaleLowerCase('en').includes(q)
  )
})
// Sınıfa göre gruplu: her sınıf başlık, altında yükselişleri.
interface AscGroup {
  cls: Ascendancy
  items: Ascendancy[]
}
const groupedAscendancies = computed<AscGroup[]>(() => {
  const classes = ascendancies.filter((a) => a.type === 'class')
  const filtered = new Set(filteredAscendancies.value.map((a) => a.id))
  const groups: AscGroup[] = []
  for (const c of classes) {
    const items = ascendancies.filter((a) => a.type === 'ascendancy' && a.parent_class === c.en && filtered.has(a.id))
    // sınıf adı veya en az bir yükselişi filtreye uyuyorsa göster
    if (filtered.has(c.id) || items.length) groups.push({ cls: c, items })
  }
  return groups
})
const selectedAscId = ref<string | null>(
  ascendancies.find((a) => a.type === 'ascendancy')?.id ?? ascendancies[0]?.id ?? null
)
const selectedAsc = computed<Ascendancy | null>(
  () => ascendancies.find((a) => a.id === selectedAscId.value) ?? null
)
function selectAsc(a: Ascendancy): void {
  selectedAscId.value = a.id
}
function ascName(a: Ascendancy): string {
  return a.en // özel ad EN
}
function ascParentName(a: Ascendancy): string {
  return (isTr.value ? a.parent_class_tr : a.parent_class) ?? ''
}
function ascDesc(a: Ascendancy): string {
  return isTr.value ? a.desc_tr || a.desc_en : a.desc_en || a.desc_tr
}
function ascNodeName(n: AscNode): string {
  return isTr.value ? n.name_tr || n.name_en : n.name_en || n.name_tr
}
function ascNodeStat(n: AscNode): string {
  return isTr.value ? n.stat_tr || n.stat_en : n.stat_en || n.stat_tr
}
function ascAttribute(a: Ascendancy): string {
  const en = a.attribute ?? ''
  if (!isTr.value || !en) return en
  const map: Record<string, string> = {
    Strength: 'Güç', Dexterity: 'Çeviklik', Intelligence: 'Zekâ',
    'Strength/Dexterity': 'Güç/Çeviklik', 'Dexterity/Intelligence': 'Çeviklik/Zekâ',
    'Strength/Intelligence': 'Güç/Zekâ'
  }
  return map[en] ?? en
}

// --- Passives (pasif ağaç node listesi) --------------------------------
interface Passive {
  id: string
  en: string
  tr: string
  tr_status: string
  node_type: 'keystone' | 'notable' | 'small' | 'jewel_socket'
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
const passives = passivesData as Passive[]
const passiveIconModules = import.meta.glob('../assets/passives/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const passiveIconMap: Record<string, string> = {}
for (const path in passiveIconModules) {
  const base = path.split('/').pop() as string
  passiveIconMap[base] = passiveIconModules[path]
}
function passiveIconUrl(p: Passive | null): string | null {
  if (!p || !p.icon) return null
  const base = p.icon.split('/').pop() as string
  return passiveIconMap[base] ?? null
}
function passiveTypeLabel(t: Passive['node_type']): string {
  const tr = isTr.value
  switch (t) {
    case 'keystone': return tr ? 'Kilittaşı' : 'Keystone'
    case 'notable': return tr ? 'Önemli' : 'Notable'
    case 'jewel_socket': return tr ? 'Mücevher Yuvası' : 'Jewel Socket'
    default: return tr ? 'Küçük' : 'Small'
  }
}
function passiveName(p: Passive): string {
  return p.en || p.tr // özel ad EN
}
function passiveStats(p: Passive): string[] {
  const s = isTr.value ? p.stats_tr : p.stats_en
  return s.length ? s : p.stats_en
}
const passiveTypeFilter = ref<'' | Passive['node_type']>('')
const filteredPassives = computed<Passive[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  const tf = passiveTypeFilter.value
  return passives.filter((p) => {
    if (tf && p.node_type !== tf) return false
    if (!q) return true
    return (
      p.en.toLocaleLowerCase('en').includes(q) ||
      p.tr.toLocaleLowerCase('tr').includes(q) ||
      p.stats_en.join(' ').toLocaleLowerCase('en').includes(q) ||
      p.stats_tr.join(' ').toLocaleLowerCase('tr').includes(q)
    )
  })
})
// Passives alt-görünüm: liste / görsel ağaç
const passiveView = ref<'list' | 'tree'>('list')
// id -> passive kaydı (ağaç tooltip'i için)
const passivesById = computed<Record<string, Passive>>(() => {
  const m: Record<string, Passive> = {}
  for (const p of passives) m[p.id] = p
  return m
})
const selectedPassiveId = ref<string | null>(passives[0]?.id ?? null)
const selectedPassive = computed<Passive | null>(
  () => passives.find((p) => p.id === selectedPassiveId.value) ?? null
)
function selectPassive(p: Passive): void {
  selectedPassiveId.value = p.id
}
// --- basit virtual scroll (büyük liste için) ---
const PASSIVE_ROW_H = 48
const passiveScrollTop = ref(0)
const passiveViewH = ref(640)
const passiveScrollEl = ref<HTMLElement | null>(null)
function onPassiveScroll(e: Event): void {
  passiveScrollTop.value = (e.target as HTMLElement).scrollTop
}
onMounted(async () => {
  if (passiveScrollEl.value) passiveViewH.value = passiveScrollEl.value.clientHeight || 640
  // kayıtlı dili geri yükle (overlay ile senkron)
  const s = (await window.api?.settings.get()) as { lang?: 'tr' | 'en' } | undefined
  if (s?.lang === 'en' || s?.lang === 'tr') locale.value = s.lang
})
const passiveWindow = computed(() => {
  const total = filteredPassives.value.length
  const start = Math.max(0, Math.floor(passiveScrollTop.value / PASSIVE_ROW_H) - 6)
  const count = Math.ceil(passiveViewH.value / PASSIVE_ROW_H) + 12
  const end = Math.min(total, start + count)
  return {
    start,
    end,
    topPad: start * PASSIVE_ROW_H,
    bottomPad: Math.max(0, (total - end) * PASSIVE_ROW_H),
    items: filteredPassives.value.slice(start, end)
  }
})

function areaName(a: Area): string {
  return a.en // özel ad EN
}
function areaTypeLabel(a: Area): string {
  const tr = isTr.value
  return a.type === 'town' ? (tr ? 'Şehir' : 'Town') : tr ? 'Bölge' : 'Zone'
}
function areaConnected(a: Area): string[] {
  return isTr.value ? a.connected_to_tr : a.connected_to
}
// --- docx (Maxroll) olgu alanları: dile göre seç, boşsa diğerine düş ---
function areaBossList(a: Area): string[] {
  const list = isTr.value ? a.boss_tr : a.boss_en
  return list.length ? list : isTr.value ? a.boss_en : a.boss_tr
}
function areaQuest(a: Area): string {
  return isTr.value ? a.quest_tr || a.quest_en : a.quest_en || a.quest_tr
}
function areaReward(a: Area): string {
  return isTr.value ? a.reward_tr || a.reward_en : a.reward_en || a.reward_tr
}
function areaSteps(a: Area): string[] {
  const s = isTr.value ? a.steps_tr : a.steps_en
  return s.length ? s : isTr.value ? a.steps_en : a.steps_tr
}

// --- Atlas / Endgame (4 alt-tip tek sekmede: waystone / node / tablet / pinnacle) ---
interface AtlasRec {
  id: string
  en: string
  tr: string
  tr_status: string
  subtype: 'waystone' | 'atlas_node' | 'tablet' | 'pinnacle_key'
  group_en: string
  group_tr: string
  tier: number | null
  node_type: 'keystone' | 'notable' | 'small' | null
  stats_en: string[]
  stats_tr: string[]
  implicit_en: string
  implicit_tr: string
  desc_en: string
  desc_tr: string
  drop_level: number | null
  icon: string | null
  category: 'atlas'
  source: string
  game_version: string
  league: string
  last_updated: string
}
const atlasRecs = atlasData as AtlasRec[]
const atlasIconModules = import.meta.glob('../assets/atlas/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const atlasIconMap: Record<string, string> = {}
for (const path in atlasIconModules) {
  const base = path.split('/').pop() as string
  atlasIconMap[base] = atlasIconModules[path]
}
function atlasIconUrl(r: AtlasRec | null): string | null {
  if (!r || !r.icon) return null
  const base = r.icon.split('/').pop() as string
  return atlasIconMap[base] ?? null
}
function atlasSubtypeLabel(s: AtlasRec['subtype']): string {
  const tr = isTr.value
  switch (s) {
    case 'waystone': return tr ? 'Yol Taşı' : 'Waystone'
    case 'atlas_node': return tr ? 'Pasif Node' : 'Passive Node'
    case 'tablet': return tr ? 'Tablet' : 'Tablet'
    default: return tr ? 'Pinnacle Anahtarı' : 'Pinnacle Key'
  }
}
function atlasNodeTypeLabel(t: AtlasRec['node_type']): string {
  const tr = isTr.value
  switch (t) {
    case 'keystone': return tr ? 'Kilittaşı' : 'Keystone'
    case 'notable': return tr ? 'Önemli' : 'Notable'
    default: return tr ? 'Küçük' : 'Small'
  }
}
const atlasSubFilter = ref<'' | AtlasRec['subtype']>('')
// Atlas > Pasif Node alt-görünüm: liste / görsel ağaç
const atlasView = ref<'list' | 'tree'>('list')
const atlasTreeActive = computed(
  () => mode.value === 'atlas' && atlasSubFilter.value === 'atlas_node' && atlasView.value === 'tree'
)
// id ('atlasnode_<hash>') -> atlas node kaydı (ağaç tooltip'i için)
const atlasNodeById = computed<Record<string, AtlasRec>>(() => {
  const m: Record<string, AtlasRec> = {}
  for (const r of atlasRecs) if (r.subtype === 'atlas_node') m[r.id] = r
  return m
})
const filteredAtlas = computed<AtlasRec[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  const sf = atlasSubFilter.value
  return atlasRecs.filter((r) => {
    if (sf && r.subtype !== sf) return false
    if (!q) return true
    return (
      r.en.toLocaleLowerCase('en').includes(q) ||
      r.tr.toLocaleLowerCase('tr').includes(q) ||
      r.stats_en.join(' ').toLocaleLowerCase('en').includes(q) ||
      r.stats_tr.join(' ').toLocaleLowerCase('tr').includes(q)
    )
  })
})
// alt-tip gruplu liste (waystone -> node -> tablet -> pinnacle)
interface AtlasGroup {
  sub: AtlasRec['subtype']
  label: string
  items: AtlasRec[]
}
const groupedAtlas = computed<AtlasGroup[]>(() => {
  const order: AtlasRec['subtype'][] = ['waystone', 'atlas_node', 'tablet', 'pinnacle_key']
  const groups: AtlasGroup[] = []
  for (const s of order) {
    const items = filteredAtlas.value.filter((r) => r.subtype === s)
    if (items.length) groups.push({ sub: s, label: atlasSubtypeLabel(s), items })
  }
  return groups
})
const selectedAtlasId = ref<string | null>(atlasRecs[0]?.id ?? null)
const selectedAtlas = computed<AtlasRec | null>(
  () => atlasRecs.find((r) => r.id === selectedAtlasId.value) ?? null
)
function selectAtlas(r: AtlasRec): void {
  selectedAtlasId.value = r.id
}
function atlasName(r: AtlasRec): string {
  return r.en || r.tr // özel ad EN
}
// Sol liste alt-satırı + sağ panel alt-başlığı.
function atlasSubLine(r: AtlasRec): string {
  const tr = isTr.value
  if (r.subtype === 'waystone') return (tr ? 'Yol Taşı · Kademe ' : 'Waystone · Tier ') + (r.tier ?? '')
  if (r.subtype === 'atlas_node') return atlasNodeTypeLabel(r.node_type)
  if (r.subtype === 'tablet') return 'Precursor Tablet'
  return (tr ? 'Pinnacle Anahtarı · ' : 'Pinnacle Key · ') + r.group_en
}
// Sol liste rozeti (ikonsuz alt-tipler için kısa harf).
function atlasBadge(r: AtlasRec): string {
  if (r.subtype === 'waystone') return 'W' + (r.tier ?? '')
  if (r.subtype === 'tablet') return 'T'
  if (r.subtype === 'pinnacle_key') return 'P'
  return r.node_type === 'keystone' ? 'K' : r.node_type === 'notable' ? 'N' : '•'
}
function atlasStats(r: AtlasRec): string[] {
  const s = isTr.value ? r.stats_tr : r.stats_en
  return s.length ? s : r.stats_en
}
function atlasImplicit(r: AtlasRec, primary: boolean): string[] {
  const txt = primary
    ? isTr.value ? r.implicit_tr : r.implicit_en
    : isTr.value ? r.implicit_en : r.implicit_tr
  return txt ? txt.split('\n').filter((l) => l.trim()) : []
}
function atlasDesc(r: AtlasRec, primary: boolean): string {
  return primary
    ? isTr.value ? r.desc_tr || r.desc_en : r.desc_en || r.desc_tr
    : isTr.value ? r.desc_en : r.desc_tr
}

// --- Mechanics (league/harita mekanikleri) ------------------------------
interface MechPart {
  en: string
  tr: string
  desc_en: string
  desc_tr: string
}
interface Mechanic {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  category: 'mechanic'
  subtype: 'map' | 'trial' | 'event'
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
const mechanics = mechanicsData as Mechanic[]
const mechIconModules = import.meta.glob('../assets/mechanics/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const mechIconMap: Record<string, string> = {}
for (const path in mechIconModules) {
  const base = path.split('/').pop() as string
  mechIconMap[base] = mechIconModules[path]
}
function mechAssetUrl(rel: string | null | undefined): string | null {
  if (!rel) return null
  const base = rel.split('/').pop() as string
  return mechIconMap[base] ?? null
}
function mechSubtypeLabel(s: Mechanic['subtype']): string {
  switch (s) {
    case 'map': return t('mechSubtypeMap')
    case 'trial': return t('mechSubtypeTrial')
    default: return t('mechSubtypeEvent')
  }
}
function mechName(m: Mechanic): string {
  return m.en || m.tr // özel ad EN
}
function mechOverview(m: Mechanic): string {
  return isTr.value ? m.overview_tr || m.overview_en : m.overview_en
}
function mechTip(m: Mechanic): string {
  return isTr.value ? m.tip_tr || m.tip_en : m.tip_en
}
function mechPartName(p: MechPart): string {
  return isTr.value ? p.tr || p.en : p.en
}
function mechPartDesc(p: MechPart): string {
  return isTr.value ? p.desc_tr || p.desc_en : p.desc_en
}
// Sol liste rozeti (ikon yoksa): alt-tip baş harfi.
function mechBadge(m: Mechanic): string {
  return m.subtype === 'trial' ? 'T' : m.subtype === 'event' ? 'E' : 'M'
}
const mechSubFilter = ref<'' | Mechanic['subtype']>('')
const filteredMechanics = computed<Mechanic[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  const sf = mechSubFilter.value
  return mechanics.filter((m) => {
    if (sf && m.subtype !== sf) return false
    if (!q) return true
    return (
      m.en.toLocaleLowerCase('en').includes(q) ||
      m.tr.toLocaleLowerCase('tr').includes(q) ||
      m.overview_en.toLocaleLowerCase('en').includes(q) ||
      m.overview_tr.toLocaleLowerCase('tr').includes(q)
    )
  })
})
// alt-tip gruplu liste (map -> trial -> event)
interface MechGroup {
  sub: Mechanic['subtype']
  label: string
  items: Mechanic[]
}
const groupedMechanics = computed<MechGroup[]>(() => {
  const order: Mechanic['subtype'][] = ['map', 'trial', 'event']
  const groups: MechGroup[] = []
  for (const s of order) {
    const items = filteredMechanics.value.filter((m) => m.subtype === s)
    if (items.length) groups.push({ sub: s, label: mechSubtypeLabel(s), items })
  }
  return groups
})
const selectedMechId = ref<string | null>(mechanics[0]?.id ?? null)
const selectedMech = computed<Mechanic | null>(
  () => mechanics.find((m) => m.id === selectedMechId.value) ?? null
)
function selectMech(m: Mechanic): void {
  selectedMechId.value = m.id
}

// --- Bosses (endgame / pinnacle boss'lar) -------------------------------
interface Boss {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  boss_type: 'pinnacle' | 'endgame' | 'gate'
  related: string[]
  access_en: string
  access_tr: string
  mechanics_en: string
  mechanics_tr: string
  icon: string | null
  banner: string | null
  category: 'boss'
  source: string
  game_version: string
  league: string
  last_updated: string
}
const bosses = bossesData as Boss[]
const bossIconModules = import.meta.glob('../assets/bosses/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const bossIconMap: Record<string, string> = {}
for (const path in bossIconModules) {
  const base = path.split('/').pop() as string
  bossIconMap[base] = bossIconModules[path]
}
function bossAssetUrl(rel: string | null | undefined): string | null {
  if (!rel) return null
  const base = rel.split('/').pop() as string
  return bossIconMap[base] ?? null
}
function bossName(b: Boss): string {
  return b.en || b.tr // özel ad EN
}
function bossAccess(b: Boss): string {
  return isTr.value ? b.access_tr || b.access_en : b.access_en
}
function bossMechanics(b: Boss): string {
  return isTr.value ? b.mechanics_tr || b.mechanics_en : b.mechanics_en
}
function bossTypeLabel(b: Boss): string {
  if (b.boss_type === 'endgame') return t('bossTypeEndgame')
  if (b.boss_type === 'gate') return t('bossTypeGate')
  return t('bossTypePinnacle')
}
// Boss'u bağlı mekaniğe göre "aile"ye ayır (alt-filtre + grup başlığı).
// related boşsa (Arbiter) -> 'fortress'.
function bossFamily(b: Boss): string {
  return b.related[0] ?? 'fortress'
}
function bossFamilyLabel(key: string): string {
  if (key === 'fortress') return t('bossFamilyFortress')
  if (key === 'vaal') return t('bossFamilyVaal')
  const m = mechanics.find((x) => x.id === key)
  return m ? mechName(m) : key
}
// Bağlı mekaniklerin adları (tooltip'te "Bağlı mekanik" satırı).
// mechanics.json'da olmayan aileler (fortress, vaal) bossFamilyLabel'e düşer.
function bossRelatedNames(b: Boss): string {
  return b.related.map((id) => bossFamilyLabel(id)).join(', ')
}
const bossFamilyFilter = ref<string>('')
const bossFamilyOrder = ['breach', 'expedition', 'ritual', 'delirium', 'abyss', 'vaal', 'sanctum', 'ultimatum', 'fortress']
const filteredBosses = computed<Boss[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  const ff = bossFamilyFilter.value
  return bosses.filter((b) => {
    if (ff && bossFamily(b) !== ff) return false
    if (!q) return true
    return (
      b.en.toLocaleLowerCase('en').includes(q) ||
      b.tr.toLocaleLowerCase('tr').includes(q) ||
      b.access_en.toLocaleLowerCase('en').includes(q) ||
      b.access_tr.toLocaleLowerCase('tr').includes(q)
    )
  })
})
interface BossGroup {
  key: string
  label: string
  items: Boss[]
}
const groupedBosses = computed<BossGroup[]>(() => {
  const groups: BossGroup[] = []
  for (const key of bossFamilyOrder) {
    const items = filteredBosses.value.filter((b) => bossFamily(b) === key)
    if (items.length) groups.push({ key, label: bossFamilyLabel(key), items })
  }
  return groups
})
// Soldaki liste rozeti (boss'a özel ikon yoksa): aile baş harfi.
function bossBadge(b: Boss): string {
  return bossFamilyLabel(bossFamily(b)).slice(0, 1).toLocaleUpperCase('en')
}
const selectedBossId = ref<string | null>(bosses[0]?.id ?? null)
const selectedBoss = computed<Boss | null>(
  () => bosses.find((b) => b.id === selectedBossId.value) ?? null
)
function selectBoss(b: Boss): void {
  selectedBossId.value = b.id
}

// --- Crafting (üretim akışları / bench / recipe) ------------------------
interface Craft {
  id: string
  en: string
  tr: string
  tr_status: 'exists' | 'proposed' | 'needs-translation'
  subtype: 'flow' | 'bench' | 'recipe' | 'reference'
  status: 'ok' | 'needs-verification'
  desc_en: string
  desc_tr: string
  steps_en: string[]
  steps_tr: string[]
  related: string[]
  icon: string | null
  category: 'crafting'
  source: string
  game_version: string
  league: string
  last_updated: string
}
const crafts = craftingData as Craft[]
// Crafting kayıt ikonu currency asset'lerini yeniden kullanır -> currencyIconMap.
function craftAssetUrl(rel: string | null | undefined): string | null {
  if (!rel) return null
  const base = rel.split('/').pop() as string
  return currencyIconMap[base] ?? null
}
// related currency id'leri -> Currency kaydı (ad+ikon oradan; TEKRAR YOK).
const currencyById: Record<string, Currency> = {}
for (const c of currencies) currencyById[c.id] = c
function craftRelated(c: Craft): Currency[] {
  return c.related.map((id) => currencyById[id]).filter((x): x is Currency => !!x)
}
function craftName(c: Craft): string {
  return c.en || c.tr // özel ad EN
}
function craftDesc(c: Craft): string {
  return isTr.value ? c.desc_tr || c.desc_en : c.desc_en
}
function craftSteps(c: Craft): string[] {
  const s = isTr.value ? c.steps_tr : c.steps_en
  return s && s.length ? s : c.steps_en
}
function craftSubtypeLabel(s: Craft['subtype']): string {
  switch (s) {
    case 'flow': return t('craftSubtypeFlow')
    case 'bench': return t('craftSubtypeBench')
    case 'reference': return t('craftSubtypeReference')
    default: return t('craftSubtypeRecipe')
  }
}
function craftBadge(c: Craft): string {
  return c.subtype === 'flow' ? 'F' : c.subtype === 'bench' ? 'B' : c.subtype === 'reference' ? 'i' : 'R'
}
function craftPending(c: Craft): boolean {
  return c.status === 'needs-verification'
}
// reference: ilgili materyalin etki metni (currency desc, ilk satır) — TEKRAR YOK.
function craftMatDesc(m: Currency): string {
  const d = isTr.value ? m.desc_tr || m.desc_en : m.desc_en
  return (d || '').split('\n')[0]
}
const craftSubFilter = ref<'' | Craft['subtype']>('')
// Crafting alt-görünüm: Liste (referans) / Simülatör
const craftView = ref<'list' | 'sim'>('list')
const craftSimActive = computed(() => mode.value === 'crafting' && craftView.value === 'sim')
const filteredCrafts = computed<Craft[]>(() => {
  const q = query.value.trim().toLocaleLowerCase('en')
  const sf = craftSubFilter.value
  return crafts.filter((c) => {
    if (sf && c.subtype !== sf) return false
    if (!q) return true
    return (
      c.en.toLocaleLowerCase('en').includes(q) ||
      c.tr.toLocaleLowerCase('tr').includes(q) ||
      c.desc_en.toLocaleLowerCase('en').includes(q) ||
      c.desc_tr.toLocaleLowerCase('tr').includes(q)
    )
  })
})
interface CraftGroup {
  sub: Craft['subtype']
  label: string
  items: Craft[]
}
const groupedCrafts = computed<CraftGroup[]>(() => {
  const order: Craft['subtype'][] = ['flow', 'bench', 'recipe', 'reference']
  const groups: CraftGroup[] = []
  for (const s of order) {
    const items = filteredCrafts.value.filter((c) => c.subtype === s)
    if (items.length) groups.push({ sub: s, label: craftSubtypeLabel(s), items })
  }
  return groups
})
const selectedCraftId = ref<string | null>(crafts[0]?.id ?? null)
const selectedCraft = computed<Craft | null>(
  () => crafts.find((c) => c.id === selectedCraftId.value) ?? null
)
function selectCraft(c: Craft): void {
  selectedCraftId.value = c.id
}

function toggleLang(): void {
  locale.value = locale.value === 'tr' ? 'en' : 'tr'
  // overlay + kalıcılık için dili ayara yaz (overlay penceresi de güncellenir)
  window.api?.settings.set({ lang: locale.value as 'tr' | 'en' })
}

// Frameless pencere kontrolleri (preload api uzerinden).
const winMaximized = ref(false)
function winMinimize(): void {
  window.api?.minimize()
}
function winToggleMaximize(): void {
  window.api?.toggleMaximize()
}
function winClose(): void {
  window.api?.close()
}
let unsubMax: (() => void) | null = null
onMounted(async () => {
  winMaximized.value = (await window.api?.isMaximized()) ?? false
  unsubMax = window.api?.onMaximizeChange((m) => (winMaximized.value = m)) ?? null
})
onUnmounted(() => {
  unsubMax?.()
  unsubSettingsFont?.()
})
</script>

<template>
  <div class="app">
    <!-- Ozel koyu baslik bari (frameless): solda marka, sagda EN/TR + pencere dugmeleri.
         Sürükleme bölgesine çift tıklayınca büyüt/geri al (Windows standardı). -->
    <header class="titlebar" @dblclick="winToggleMaximize">
      <span class="tb-brand"><img :src="pobeLogo" class="tb-logo" alt="PoBe" />{{ t('appTitle') }}</span>
      <span class="tb-winbtns">
        <button class="win-btn" @click="winMinimize" aria-label="Küçült" title="Küçült">
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1" y="5" width="9" height="1.4" fill="currentColor"/></svg>
        </button>
        <button
          class="win-btn"
          @click="winToggleMaximize"
          :aria-label="winMaximized ? 'Geri al' : 'Büyüt'"
          :title="winMaximized ? 'Geri al' : 'Büyüt'"
        >
          <svg v-if="!winMaximized" width="11" height="11" viewBox="0 0 11 11">
            <rect x="1" y="1" width="9" height="9" stroke="currentColor" stroke-width="1.3" fill="none" />
          </svg>
          <svg v-else width="11" height="11" viewBox="0 0 11 11">
            <rect x="1" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.2" fill="none" />
            <path d="M3 3 V1 H10 V8 H8" stroke="currentColor" stroke-width="1.2" fill="none" />
          </svg>
        </button>
        <button class="win-btn win-btn--close" @click="winClose" aria-label="Kapat" title="Kapat">
          <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>
        </button>
      </span>
    </header>

    <!-- Güncelleme bildirimi (ADIM C): yeni sürüm varsa titlebar altında banner -->
    <UpdateBanner :is-tr="isTr" />

    <!-- Ikinci sıra: sekmeler + ⚙/EN-TR (tıklanabilir, no-drag) -->
    <nav class="tabbar">
      <span class="tb-tabs">
          <button
            class="tb-tab tb-tab--home"
            :class="{ 'tb-tab--active': mode === 'home' }"
            @click="setMode('home')"
          >
            ⌂ {{ t('tabHome') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'gems' }"
            @click="setMode('gems')"
          >
            {{ t('tabGems') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'currency' }"
            @click="setMode('currency')"
          >
            {{ t('tabCurrency') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'items' }"
            @click="setMode('items')"
          >
            {{ t('tabItems') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'uniques' }"
            @click="setMode('uniques')"
          >
            {{ t('tabUniques') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'mods' }"
            @click="setMode('mods')"
          >
            {{ t('tabMods') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'areas' }"
            @click="setMode('areas')"
          >
            {{ t('tabAreas') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'ascendancies' }"
            @click="setMode('ascendancies')"
          >
            {{ t('tabAscendancies') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'passives' }"
            @click="setMode('passives')"
          >
            {{ t('tabPassives') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'atlas' }"
            @click="setMode('atlas')"
          >
            {{ t('tabAtlas') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'mechanics' }"
            @click="setMode('mechanics')"
          >
            {{ t('tabMechanics') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'bosses' }"
            @click="setMode('bosses')"
          >
            {{ t('tabBosses') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'crafting' }"
            @click="setMode('crafting')"
          >
            {{ t('tabCrafting') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'leveling' }"
            @click="setMode('leveling')"
          >
            {{ t('tabLeveling') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'build' }"
            @click="setMode('build')"
          >
            {{ t('tabBuild') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'danger' }"
            @click="setMode('danger')"
          >
            {{ t('tabDanger') }}
          </button>
          <button
            class="tb-tab"
            :class="{ 'tb-tab--active': mode === 'chat' }"
            @click="setMode('chat')"
          >
            {{ t('tabChat') }}
          </button>
        </span>
        <span class="tabbar-actions">
          <button
            class="settings-btn"
            @click="showSettings = true"
            :aria-label="t('tabSettings')"
            :title="t('tabSettings')"
          >
            <!-- klasik dişli (cog) ayarlar ikonu -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.83a.48.48 0 0 0 .12.61l2.03 1.58c-.05.31-.07.63-.07.94s.02.63.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.31.59.22l2.39-.96c.49.37 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58Z"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linejoin="round"
              />
              <circle cx="12" cy="12" r="3.05" stroke="currentColor" stroke-width="1.55" />
            </svg>
            <span class="settings-btn-label">{{ t('tabSettings') }}</span>
          </button>
          <button class="lang-btn" @click="toggleLang">{{ t('switchTo') }}</button>
        </span>
      </nav>

    <main class="content">
    <!-- ANA SAYFA (varsayılan açılış): görsel kategori kartları -->
    <HomeView v-if="mode === 'home'" :is-tr="isTr" @navigate="onNavigate" @feedback="openFeedback" />

    <!-- Passives: Liste / Ağaç alt-geçişi -->
    <div v-if="mode === 'passives'" class="pv-subtabs">
      <button
        class="pv-subtab"
        :class="{ 'pv-subtab--active': passiveView === 'list' }"
        @click="passiveView = 'list'"
      >{{ t('passiveViewList') }}</button>
      <button
        class="pv-subtab"
        :class="{ 'pv-subtab--active': passiveView === 'tree' }"
        @click="passiveView = 'tree'"
      >{{ t('passiveViewTree') }}</button>
    </div>
    <!-- Atlas > Pasif Node: Liste / Ağaç alt-geçişi (yalnız atlas_node alt-filtresinde) -->
    <div v-if="mode === 'atlas' && atlasSubFilter === 'atlas_node'" class="pv-subtabs">
      <button
        class="pv-subtab"
        :class="{ 'pv-subtab--active': atlasView === 'list' }"
        @click="atlasView = 'list'"
      >{{ t('passiveViewList') }}</button>
      <button
        class="pv-subtab"
        :class="{ 'pv-subtab--active': atlasView === 'tree' }"
        @click="atlasView = 'tree'"
      >{{ t('passiveViewTree') }}</button>
    </div>
    <!-- Crafting: Referans / Simülatör alt-geçişi -->
    <div v-if="mode === 'crafting'" class="pv-subtabs">
      <button
        class="pv-subtab"
        :class="{ 'pv-subtab--active': craftView === 'list' }"
        @click="craftView = 'list'"
      >{{ t('craftViewList') }}</button>
      <button
        class="pv-subtab"
        :class="{ 'pv-subtab--active': craftView === 'sim' }"
        @click="craftView = 'sim'"
      >{{ t('craftViewSim') }}</button>
    </div>
    <CraftSimulator v-if="craftSimActive" class="pv-tree-host" :is-tr="isTr" />
    <!-- Görsel ağaç (Canvas) — liste yerine tam alanı kaplar -->
    <PassiveTreeCanvas
      v-if="mode === 'passives' && passiveView === 'tree'"
      class="pv-tree-host"
      :passives-by-id="passivesById"
      :is-tr="isTr"
    />
    <AtlasTreeCanvas
      v-if="atlasTreeActive"
      class="pv-tree-host"
      :atlas-by-id="atlasNodeById"
      :is-tr="isTr"
    />
    <!-- Leveling Tracker (Faz1: uygulama-içi sekme) -->
    <LevelingView v-if="mode === 'leveling'" :is-tr="isTr" />
    <!-- Build: PoB import + parse -->
    <BuildView v-if="mode === 'build'" :is-tr="isTr" @craft="goCraftSim" />
    <!-- Tehlike: waystone/map tehlike kontrolü (Faz 8) -->
    <DangerView v-if="mode === 'danger'" :is-tr="isTr" />
    <!-- Yardım / Sohbet botu (Cila ADIM 2) -->
    <ChatView v-if="mode === 'chat'" :is-tr="isTr" />
    <div
      v-show="mode !== 'home' && mode !== 'leveling' && mode !== 'build' && mode !== 'danger' && mode !== 'chat' && !(mode === 'passives' && passiveView === 'tree') && !atlasTreeActive && !craftSimActive"
      class="layout"
    >
      <!-- SOL: arama + gem listesi (oyun envanteri hissi) -->
      <section class="list-pane">
        <div class="search-row">
          <input
            v-model="query"
            class="search"
            type="text"
            :placeholder="
              mode === 'gems'
                ? t('searchPlaceholder')
                : mode === 'currency'
                  ? t('searchPlaceholderCurrency')
                  : mode === 'items'
                    ? t('searchPlaceholderItems')
                    : mode === 'uniques'
                      ? t('searchPlaceholderUniques')
                      : mode === 'mods'
                        ? t('searchPlaceholderMods')
                        : mode === 'areas'
                          ? t('searchPlaceholderAreas')
                          : mode === 'ascendancies'
                            ? t('searchPlaceholderAscendancies')
                            : mode === 'passives'
                              ? t('searchPlaceholderPassives')
                              : mode === 'atlas'
                                ? t('searchPlaceholderAtlas')
                                : mode === 'mechanics'
                                  ? t('searchPlaceholderMechanics')
                                  : mode === 'bosses'
                                    ? t('searchPlaceholderBosses')
                                    : t('searchPlaceholderCrafting')
            "
          />
          <span class="count">{{
            mode === 'gems'
              ? t('resultCount', { count: filtered.length })
              : mode === 'currency'
                ? t('resultCountCurrency', { count: filteredCurrency.length })
                : mode === 'items'
                  ? t('resultCountItems', { count: filteredItems.length })
                  : mode === 'uniques'
                    ? t('resultCountUniques', { count: filteredUniques.length })
                    : mode === 'mods'
                      ? t('resultCountMods', { count: filteredMods.length })
                      : mode === 'areas'
                        ? t('resultCountAreas', { count: filteredAreas.length })
                        : mode === 'ascendancies'
                          ? t('resultCountAscendancies', { count: filteredAscendancies.length })
                          : mode === 'passives'
                            ? t('resultCountPassives', { count: filteredPassives.length })
                            : mode === 'atlas'
                              ? t('resultCountAtlas', { count: filteredAtlas.length })
                              : mode === 'mechanics'
                                ? t('resultCountMechanics', { count: filteredMechanics.length })
                                : mode === 'bosses'
                                  ? t('resultCountBosses', { count: filteredBosses.length })
                                  : t('resultCountCrafting', { count: filteredCrafts.length })
          }}</span>
        </div>

        <!-- Items: item_class'a göre grup/filtre çubuğu -->
        <div v-if="mode === 'items'" class="filter-row">
          <select v-model="selectedItemClass" class="class-filter">
            <option value="">{{ t('itemAllClasses') }}</option>
            <option v-for="o in itemClassOptions" :key="o.key" :value="o.key">
              {{ classLabel(o) }}
            </option>
          </select>
        </div>

        <!-- Mods: affix (önek/sonek) + tag filtre çubuğu -->
        <div v-if="mode === 'mods'" class="filter-row">
          <select v-model="selectedAffix" class="class-filter">
            <option value="">{{ t('modAllAffixes') }}</option>
            <option value="prefix">{{ t('modAffixPrefix') }}</option>
            <option value="suffix">{{ t('modAffixSuffix') }}</option>
          </select>
          <select v-model="selectedModTag" class="class-filter">
            <option value="">{{ t('modAllTags') }}</option>
            <option v-for="tag in modTagOptions" :key="tag" :value="tag">
              {{ modTagLabel(tag) }}
            </option>
          </select>
          <select v-model="selectedItemType" class="class-filter">
            <option value="">{{ t('modAllItemTypes') }}</option>
            <option v-for="it in modItemTypeOptions" :key="it" :value="it">
              {{ modAppliesLabel(it) }}
            </option>
          </select>
        </div>

        <!-- Passives: node_type filtresi -->
        <div v-if="mode === 'passives'" class="filter-row">
          <select v-model="passiveTypeFilter" class="class-filter">
            <option value="">{{ t('passiveAllTypes') }}</option>
            <option value="keystone">{{ passiveTypeLabel('keystone') }}</option>
            <option value="notable">{{ passiveTypeLabel('notable') }}</option>
            <option value="small">{{ passiveTypeLabel('small') }}</option>
            <option value="jewel_socket">{{ passiveTypeLabel('jewel_socket') }}</option>
          </select>
        </div>

        <!-- Atlas: alt-tip filtresi (Waystone / Pasif Node / Tablet / Pinnacle) -->
        <div v-if="mode === 'atlas'" class="filter-row">
          <select v-model="atlasSubFilter" class="class-filter">
            <option value="">{{ t('atlasAllSubtypes') }}</option>
            <option value="waystone">{{ atlasSubtypeLabel('waystone') }}</option>
            <option value="atlas_node">{{ atlasSubtypeLabel('atlas_node') }}</option>
            <option value="tablet">{{ atlasSubtypeLabel('tablet') }}</option>
            <option value="pinnacle_key">{{ atlasSubtypeLabel('pinnacle_key') }}</option>
          </select>
        </div>

        <!-- Mechanics: alt-tip filtresi (Harita / Deneme / Olay) -->
        <div v-if="mode === 'mechanics'" class="filter-row">
          <select v-model="mechSubFilter" class="class-filter">
            <option value="">{{ t('mechAllSubtypes') }}</option>
            <option value="map">{{ mechSubtypeLabel('map') }}</option>
            <option value="trial">{{ mechSubtypeLabel('trial') }}</option>
            <option value="event">{{ mechSubtypeLabel('event') }}</option>
          </select>
        </div>

        <!-- Bosses: bağlı mekaniğe göre alt-filtre -->
        <div v-if="mode === 'bosses'" class="filter-row">
          <select v-model="bossFamilyFilter" class="class-filter">
            <option value="">{{ t('bossAllFamilies') }}</option>
            <option v-for="key in bossFamilyOrder" :key="key" :value="key">
              {{ bossFamilyLabel(key) }}
            </option>
          </select>
        </div>

        <!-- Crafting: alt-tip filtresi (Akış / Bench / Recipe) -->
        <div v-if="mode === 'crafting'" class="filter-row">
          <select v-model="craftSubFilter" class="class-filter">
            <option value="">{{ t('craftAllSubtypes') }}</option>
            <option value="flow">{{ craftSubtypeLabel('flow') }}</option>
            <option value="bench">{{ craftSubtypeLabel('bench') }}</option>
            <option value="recipe">{{ craftSubtypeLabel('recipe') }}</option>
            <option value="reference">{{ craftSubtypeLabel('reference') }}</option>
          </select>
        </div>

        <!-- GEM listesi -->
        <ul v-if="mode === 'gems'" class="gem-list">
          <li v-for="gem in filtered" :key="gem.id">
            <button
              class="gem-row"
              :class="{ 'gem-row--active': gem.id === selectedId }"
              @click="select(gem)"
            >
              <span class="gem-icon">
                <img v-if="iconUrl(gem)" :src="iconUrl(gem)!" :alt="gem.en" />
                <span v-else class="gem-icon-ph" :class="attrClass(gem.color)">
                  <span class="facet"></span>
                </span>
              </span>
              <span class="gem-row-text">
                <span class="gem-name">{{ displayName(gem) }}</span>
                <span class="gem-sub">{{ listType(gem) }}</span>
              </span>
            </button>
          </li>
          <li v-if="filtered.length === 0" class="empty">{{ t('noResults') }}</li>
        </ul>

        <!-- ITEM listesi (aynı satır/çerçeve görünümü) -->
        <ul v-else-if="mode === 'items'" class="gem-list">
          <li v-for="it in filteredItems" :key="it.id">
            <button
              class="gem-row"
              :class="{ 'gem-row--active': it.id === selectedItemId }"
              @click="selectItem(it)"
            >
              <span class="gem-icon">
                <img v-if="itemIconUrl(it)" :src="itemIconUrl(it)!" :alt="it.en" />
                <span v-else class="gem-icon-ph attr--none">
                  <span class="facet"></span>
                </span>
              </span>
              <span class="gem-row-text">
                <span class="gem-name">{{ itemName(it) }}</span>
                <span class="gem-sub">{{ itemClassName(it) }}</span>
              </span>
            </button>
          </li>
          <li v-if="filteredItems.length === 0" class="empty">
            {{ t('noResultsItems') }}
          </li>
        </ul>

        <!-- UNIQUE listesi (aynı satır/çerçeve; ad turuncu-kahve #AF6025) -->
        <ul v-else-if="mode === 'uniques'" class="gem-list">
          <li v-for="u in filteredUniques" :key="u.id">
            <button
              class="gem-row"
              :class="{ 'gem-row--active': u.id === selectedUniqueId }"
              @click="selectUnique(u)"
            >
              <span class="gem-icon">
                <img v-if="uniqueIconUrl(u)" :src="uniqueIconUrl(u)!" :alt="u.en" />
                <span v-else class="gem-icon-ph attr--none">
                  <span class="facet"></span>
                </span>
              </span>
              <span class="gem-row-text">
                <span class="gem-name gem-name--unique">{{ uniqueName(u) }}</span>
                <span class="gem-sub">{{ uniqueClassName(u) }}</span>
              </span>
            </button>
          </li>
          <li v-if="filteredUniques.length === 0" class="empty">
            {{ t('noResultsUniques') }}
          </li>
        </ul>

        <!-- MOD listesi (ikonsuz: affix rozeti + stat metni) -->
        <ul v-else-if="mode === 'mods'" class="gem-list">
          <li v-for="mod in filteredMods" :key="mod.id">
            <button
              class="gem-row"
              :class="{ 'gem-row--active': mod.id === selectedModId }"
              @click="selectMod(mod)"
            >
              <span
                class="mod-badge"
                :class="mod.affix_type === 'prefix' ? 'mod-badge--prefix' : 'mod-badge--suffix'"
              >{{ mod.affix_type === 'prefix' ? 'P' : 'S' }}</span>
              <span class="gem-row-text">
                <span class="gem-name mod-name">{{ modName(mod) }}</span>
                <span class="gem-sub">{{ affixLabel(mod) }} · {{ t('statLevel') }} {{ mod.required_level }}</span>
              </span>
            </button>
          </li>
          <li v-if="filteredMods.length === 0" class="empty">
            {{ t('noResultsMods') }}
          </li>
        </ul>

        <!-- AREA listesi: ACT'a göre gruplu (Act 1.. Interlude, Endgame) -->
        <ul v-else-if="mode === 'areas'" class="gem-list">
          <template v-for="grp in groupedAreas" :key="grp.order">
            <li class="area-group-head">{{ grp.label }}</li>
            <li v-for="ar in grp.items" :key="ar.id">
              <button
                class="gem-row"
                :class="{ 'gem-row--active': ar.id === selectedAreaId }"
                @click="selectArea(ar)"
              >
                <span
                  class="mod-badge"
                  :class="ar.type === 'town' ? 'mod-badge--suffix' : 'mod-badge--prefix'"
                  >{{ ar.area_level }}</span
                >
                <span class="gem-row-text">
                  <span class="gem-name mod-name">{{ areaName(ar) }}</span>
                  <span class="gem-sub">{{ areaTypeLabel(ar) }}</span>
                </span>
              </button>
            </li>
          </template>
          <li v-if="filteredAreas.length === 0" class="empty">
            {{ t('noResultsAreas') }}
          </li>
        </ul>

        <!-- ASCENDANCY listesi: SINIF'a göre gruplu, altında yükselişler -->
        <ul v-else-if="mode === 'ascendancies'" class="gem-list">
          <template v-for="grp in groupedAscendancies" :key="grp.cls.id">
            <li class="area-group-head asc-group-head">
              <img v-if="ascIconUrl(grp.cls)" class="asc-group-icon" :src="ascIconUrl(grp.cls)!" :alt="grp.cls.en" />
              <span>{{ ascName(grp.cls) }}</span>
              <span class="asc-group-attr">{{ ascAttribute(grp.cls) }}</span>
            </li>
            <li v-for="a in grp.items" :key="a.id">
              <button
                class="gem-row"
                :class="{ 'gem-row--active': a.id === selectedAscId }"
                @click="selectAsc(a)"
              >
                <span class="gem-icon">
                  <img v-if="ascIconUrl(a)" :src="ascIconUrl(a)!" :alt="a.en" />
                  <span v-else class="gem-icon-ph attr--none"><span class="facet"></span></span>
                </span>
                <span class="gem-row-text">
                  <span class="gem-name">{{ ascName(a) }}</span>
                  <span class="gem-sub">{{ a.nodes.length }} {{ t('ascNodeWord') }}</span>
                </span>
              </button>
            </li>
          </template>
          <li v-if="filteredAscendancies.length === 0" class="empty">
            {{ t('noResultsAscendancies') }}
          </li>
        </ul>

        <!-- PASSIVE listesi: virtual scroll (büyük liste) -->
        <div
          v-else-if="mode === 'passives'"
          ref="passiveScrollEl"
          class="gem-list passive-scroll"
          @scroll="onPassiveScroll"
        >
          <div :style="{ height: passiveWindow.topPad + 'px' }"></div>
          <button
            v-for="p in passiveWindow.items"
            :key="p.id"
            class="gem-row passive-row"
            :class="{ 'gem-row--active': p.id === selectedPassiveId, 'passive-row--keystone': p.node_type === 'keystone' }"
            @click="selectPassive(p)"
          >
            <span class="gem-icon">
              <img v-if="passiveIconUrl(p)" :src="passiveIconUrl(p)!" :alt="p.en" />
              <span v-else class="gem-icon-ph" :class="'pn--' + p.node_type"><span class="facet"></span></span>
            </span>
            <span class="gem-row-text">
              <span class="gem-name" :class="{ 'pn-keystone': p.node_type === 'keystone' }">{{ passiveName(p) }}</span>
              <span class="gem-sub">{{ passiveTypeLabel(p.node_type) }}<template v-if="p.count > 1"> · ×{{ p.count }}</template></span>
            </span>
          </button>
          <div :style="{ height: passiveWindow.bottomPad + 'px' }"></div>
          <div v-if="filteredPassives.length === 0" class="empty">{{ t('noResultsPassives') }}</div>
        </div>

        <!-- CURRENCY listesi (aynı satır/çerçeve görünümü) -->
        <ul v-else-if="mode === 'currency'" class="gem-list">
          <li v-for="cur in filteredCurrency" :key="cur.id">
            <button
              class="gem-row"
              :class="{ 'gem-row--active': cur.id === selectedCurrencyId }"
              @click="selectCurrency(cur)"
            >
              <span class="gem-icon">
                <img v-if="currencyIconUrl(cur)" :src="currencyIconUrl(cur)!" :alt="cur.en" />
                <span v-else class="gem-icon-ph attr--none">
                  <span class="facet"></span>
                </span>
              </span>
              <span class="gem-row-text">
                <span class="gem-name">{{ curName(cur) }}</span>
                <span class="gem-sub">{{ curSubtype(cur) }}</span>
              </span>
            </button>
          </li>
          <li v-if="filteredCurrency.length === 0" class="empty">
            {{ t('noResultsCurrency') }}
          </li>
        </ul>

        <!-- ATLAS listesi: ALT-TİP'e göre gruplu (Waystone / Node / Tablet / Pinnacle) -->
        <ul v-else-if="mode === 'atlas'" class="gem-list">
          <template v-for="grp in groupedAtlas" :key="grp.sub">
            <li class="area-group-head">{{ grp.label }}</li>
            <li v-for="r in grp.items" :key="r.id">
              <button
                class="gem-row"
                :class="{ 'gem-row--active': r.id === selectedAtlasId }"
                @click="selectAtlas(r)"
              >
                <span v-if="atlasIconUrl(r)" class="gem-icon">
                  <img :src="atlasIconUrl(r)!" :alt="r.en" />
                </span>
                <span
                  v-else
                  class="mod-badge"
                  :class="r.node_type === 'keystone' ? 'mod-badge--prefix' : 'mod-badge--suffix'"
                  >{{ atlasBadge(r) }}</span
                >
                <span class="gem-row-text">
                  <span class="gem-name">{{ atlasName(r) }}</span>
                  <span class="gem-sub">{{ atlasSubLine(r) }}</span>
                </span>
              </button>
            </li>
          </template>
          <li v-if="filteredAtlas.length === 0" class="empty">
            {{ t('noResultsAtlas') }}
          </li>
        </ul>

        <!-- MECHANICS listesi (alt-tip gruplu) -->
        <ul v-else-if="mode === 'mechanics'" class="gem-list">
          <template v-for="grp in groupedMechanics" :key="grp.sub">
            <li class="area-group-head">{{ grp.label }}</li>
            <li v-for="m in grp.items" :key="m.id">
              <button
                class="gem-row"
                :class="{ 'gem-row--active': m.id === selectedMechId }"
                @click="selectMech(m)"
              >
                <span v-if="mechAssetUrl(m.icon)" class="gem-icon">
                  <img :src="mechAssetUrl(m.icon)!" :alt="m.en" />
                </span>
                <span v-else class="mod-badge mod-badge--prefix">{{ mechBadge(m) }}</span>
                <span class="gem-row-text">
                  <span class="gem-name">{{ mechName(m) }}</span>
                  <span class="gem-sub">{{ mechSubtypeLabel(m.subtype) }}</span>
                </span>
              </button>
            </li>
          </template>
          <li v-if="filteredMechanics.length === 0" class="empty">
            {{ t('noResultsMechanics') }}
          </li>
        </ul>

        <!-- BOSS listesi (bağlı mekaniğe göre gruplu) -->
        <ul v-else-if="mode === 'bosses'" class="gem-list">
          <template v-for="grp in groupedBosses" :key="grp.key">
            <li class="area-group-head">{{ grp.label }}</li>
            <li v-for="b in grp.items" :key="b.id">
              <button
                class="gem-row"
                :class="{ 'gem-row--active': b.id === selectedBossId }"
                @click="selectBoss(b)"
              >
                <span v-if="bossAssetUrl(b.icon)" class="gem-icon">
                  <img :src="bossAssetUrl(b.icon)!" :alt="b.en" />
                </span>
                <span v-else class="mod-badge mod-badge--prefix">{{ bossBadge(b) }}</span>
                <span class="gem-row-text">
                  <span class="gem-name">{{ bossName(b) }}</span>
                  <span class="gem-sub">{{ bossTypeLabel(b) }}</span>
                </span>
              </button>
            </li>
          </template>
          <li v-if="filteredBosses.length === 0" class="empty">
            {{ t('noResultsBosses') }}
          </li>
        </ul>

        <!-- CRAFTING listesi (alt-tip gruplu: Akış / Bench / Recipe) -->
        <ul v-else-if="mode === 'crafting'" class="gem-list">
          <template v-for="grp in groupedCrafts" :key="grp.sub">
            <li class="area-group-head">{{ grp.label }}</li>
            <li v-for="c in grp.items" :key="c.id">
              <button
                class="gem-row"
                :class="{ 'gem-row--active': c.id === selectedCraftId }"
                @click="selectCraft(c)"
              >
                <span v-if="craftAssetUrl(c.icon)" class="gem-icon">
                  <img :src="craftAssetUrl(c.icon)!" :alt="c.en" />
                </span>
                <span v-else class="mod-badge mod-badge--prefix">{{ craftBadge(c) }}</span>
                <span class="gem-row-text">
                  <span class="gem-name">{{ craftName(c) }}</span>
                  <span class="gem-sub">{{ craftSubtypeLabel(c.subtype) }}</span>
                </span>
              </button>
            </li>
          </template>
          <li v-if="filteredCrafts.length === 0" class="empty">
            {{ t('noResultsCrafting') }}
          </li>
        </ul>
      </section>

      <!-- SAG: detay / oyun-ici tooltip -->
      <section class="detail-pane">
        <article v-if="mode === 'gems' && selected" class="tooltip">
          <!-- Dis koyu-metal kenar + ic ince altin hat (cift cerceve) -->
          <div class="tt-inner">
            <!-- Arka planda buyutulmus, soluk gem sanati (saga dogru solar) -->
            <img
              v-if="iconUrl(selected)"
              class="tt-art"
              :src="iconUrl(selected)!"
              alt=""
              aria-hidden="true"
            />
            <!-- Kose susleri -->
            <span class="tt-corner tt-corner--tl"></span>
            <span class="tt-corner tt-corner--tr"></span>
            <span class="tt-corner tt-corner--bl"></span>
            <span class="tt-corner tt-corner--br"></span>

            <div class="tt-body">
              <!-- 1) UST BLOK: sola yasli ikon + ad/tur, sagda soket halkalari -->
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="iconUrl(selected)"
                    :src="iconUrl(selected)!"
                    :alt="selected.en"
                  />
                  <span
                    v-else
                    class="gem-icon-ph"
                    :class="attrClass(selected.color)"
                  >
                    <span class="facet"></span>
                  </span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name">{{ displayName(selected) }}</span><span v-if="trMark(selected)" class="tt-trmark" :title="trMark(selected) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selected) }}</span>
                  <span class="tt-subtype">{{ catLabel(selected) }}</span>
                </span>
                <span class="tt-sockets" aria-hidden="true">
                  <i></i><i></i>
                </span>
              </header>

              <!-- 3) ETIKETLER: sola yasli, temiz -->
              <div v-if="cleanTags(selected).length" class="tt-tags">
                <span
                  v-for="(tag, i) in cleanTags(selected)"
                  :key="i"
                  class="tt-tag"
                  >{{ tag }}</span
                >
              </div>

              <hr class="tt-rule" />

              <!-- 4) STAT SATIRLARI: sola yasli, teal etiket : beyaz deger -->
              <div class="tt-stats">
                <div v-if="attrLabel(selected)" class="tt-stat">
                  <span class="tt-k">{{ isTr ? 'Öznitelik' : 'Attribute' }}</span>
                  <span class="tt-v">{{ attrLabel(selected) }}</span>
                </div>
                <div class="tt-stat">
                  <span class="tt-k">{{ isTr ? 'Kategori' : 'Category' }}</span>
                  <span class="tt-v">{{ categoryLabel(selected) }}</span>
                </div>
              </div>

              <div class="tt-sep"><i class="tt-diamond"></i></div>

              <!-- 5+6) ACIKLAMA (ortali italik) + MOD satirlari (dik small-caps) -->
              <div v-if="hasAnyDesc" class="tt-desc">
                <p v-if="primaryParts.flavor" class="tt-flavor">
                  <span
                    v-for="(part, j) in markupLine(primaryParts.flavor)"
                    :key="j"
                    :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                    >{{ part.s }}</span
                  >
                </p>
                <div v-if="primaryParts.mods.length" class="tt-mods">
                  <p
                    v-for="(mod, i) in primaryParts.mods"
                    :key="'pm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>

                <div
                  v-if="secondaryParts.flavor || secondaryParts.mods.length"
                  class="tt-sep tt-sep--thin"
                >
                  <i class="tt-diamond"></i>
                </div>

                <p
                  v-if="secondaryParts.flavor"
                  class="tt-flavor tt-flavor--dim"
                >
                  <span
                    v-for="(part, j) in markupLine(secondaryParts.flavor)"
                    :key="j"
                    :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                    >{{ part.s }}</span
                  >
                </p>
                <div
                  v-if="secondaryParts.mods.length"
                  class="tt-mods tt-mods--dim"
                >
                  <p
                    v-for="(mod, i) in secondaryParts.mods"
                    :key="'sm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
              </div>
              <p v-else class="tt-nodesc">{{ t('noDescription') }}</p>
            </div>
          </div>
        </article>

        <!-- CURRENCY detayı: gem ile birebir aynı çerçeve/başlık bandı/ayraç -->
        <article
          v-else-if="mode === 'currency' && selectedCurrency"
          class="tooltip"
        >
          <div class="tt-inner">
            <img
              v-if="currencyIconUrl(selectedCurrency)"
              class="tt-art"
              :src="currencyIconUrl(selectedCurrency)!"
              alt=""
              aria-hidden="true"
            />
            <div class="tt-body">
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="currencyIconUrl(selectedCurrency)"
                    :src="currencyIconUrl(selectedCurrency)!"
                    :alt="selectedCurrency.en"
                  />
                  <span v-else class="gem-icon-ph attr--none">
                    <span class="facet"></span>
                  </span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name">{{ curName(selectedCurrency) }}</span><span v-if="trMark(selectedCurrency)" class="tt-trmark" :title="trMark(selectedCurrency) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedCurrency) }}</span>
                  <span class="tt-subtype">{{ curSubtype(selectedCurrency) }}</span>
                </span>
              </header>

              <div class="tt-sep"><i class="tt-diamond"></i></div>

              <div v-if="curHasAnyDesc" class="tt-desc">
                <p v-if="curPrimaryParts.flavor" class="tt-flavor">
                  <span
                    v-for="(part, j) in markupLine(curPrimaryParts.flavor)"
                    :key="j"
                    :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                    >{{ part.s }}</span
                  >
                </p>
                <div v-if="curPrimaryParts.mods.length" class="tt-mods">
                  <p
                    v-for="(mod, i) in curPrimaryParts.mods"
                    :key="'cpm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>

                <div
                  v-if="curSecondaryParts.flavor || curSecondaryParts.mods.length"
                  class="tt-sep tt-sep--thin"
                >
                  <i class="tt-diamond"></i>
                </div>

                <p
                  v-if="curSecondaryParts.flavor"
                  class="tt-flavor tt-flavor--dim"
                >
                  <span
                    v-for="(part, j) in markupLine(curSecondaryParts.flavor)"
                    :key="j"
                    :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                    >{{ part.s }}</span
                  >
                </p>
                <div
                  v-if="curSecondaryParts.mods.length"
                  class="tt-mods tt-mods--dim"
                >
                  <p
                    v-for="(mod, i) in curSecondaryParts.mods"
                    :key="'csm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
              </div>
              <p v-else class="tt-nodesc">{{ t('noDescription') }}</p>
            </div>
          </div>
        </article>

        <!-- ITEM detayı: gem/currency ile aynı çerçeve/başlık bandı/ayraç -->
        <article
          v-else-if="mode === 'items' && selectedItem"
          class="tooltip tooltip--item"
        >
          <div class="tt-inner">
            <img
              v-if="itemIconUrl(selectedItem)"
              class="tt-art"
              :src="itemIconUrl(selectedItem)!"
              alt=""
              aria-hidden="true"
            />
            <div class="tt-body">
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="itemIconUrl(selectedItem)"
                    :src="itemIconUrl(selectedItem)!"
                    :alt="selectedItem.en"
                  />
                  <span v-else class="gem-icon-ph attr--none">
                    <span class="facet"></span>
                  </span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--item">{{ itemName(selectedItem) }}</span><span v-if="trMark(selectedItem)" class="tt-trmark" :title="trMark(selectedItem) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedItem) }}</span>
                  <span class="tt-subtype tt-subtype--item">{{ itemClassName(selectedItem) }}</span>
                </span>
              </header>

              <hr class="tt-rule" />

              <!-- Taban statlar: teal etiket : beyaz değer -->
              <div v-if="statRows(selectedItem).length" class="tt-stats">
                <div
                  v-for="(row, i) in statRows(selectedItem)"
                  :key="'st' + i"
                  class="tt-stat"
                >
                  <span class="tt-k">{{ row.k }}</span>
                  <span class="tt-v"
                    ><span
                      v-for="(part, j) in markupLine(row.v)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    ></span
                  >
                </div>
              </div>

              <div class="tt-sep"><i class="tt-diamond"></i></div>

              <!-- Implicit mod(lar): birincil dil + ikincil dil (soluk) -->
              <div
                v-if="selectedItem.implicit_en"
                class="tt-desc"
              >
                <div class="tt-mods">
                  <p
                    v-for="(mod, i) in itemImplicitLines(selectedItem, true)"
                    :key="'ipm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>

                <div class="tt-sep tt-sep--thin"><i class="tt-diamond"></i></div>

                <div class="tt-mods tt-mods--dim">
                  <p
                    v-for="(mod, i) in itemImplicitLines(selectedItem, false)"
                    :key="'ism' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- UNIQUE detayı: gem/currency ile aynı çerçeve; ad #AF6025 (unique rengi) -->
        <article
          v-else-if="mode === 'uniques' && selectedUnique"
          class="tooltip"
        >
          <div class="tt-inner">
            <img
              v-if="uniqueIconUrl(selectedUnique)"
              class="tt-art"
              :src="uniqueIconUrl(selectedUnique)!"
              alt=""
              aria-hidden="true"
            />
            <div class="tt-body">
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="uniqueIconUrl(selectedUnique)"
                    :src="uniqueIconUrl(selectedUnique)!"
                    :alt="selectedUnique.en"
                  />
                  <span v-else class="gem-icon-ph attr--none">
                    <span class="facet"></span>
                  </span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--unique">{{ uniqueName(selectedUnique) }}</span><span v-if="trMark(selectedUnique)" class="tt-trmark" :title="trMark(selectedUnique) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedUnique) }}</span>
                  <span class="tt-subtype tt-subtype--unique">{{ uniqueClassName(selectedUnique) }}</span>
                </span>
              </header>

              <div class="tt-sep"><i class="tt-diamond"></i></div>

              <!-- Sabit mod listesi (birincil dil) + flavour (italik, ayrı);
                   altında ikincil dil soluk. -->
              <div v-if="uniqueHasContent" class="tt-desc">
                <div v-if="uModsPrimary.length" class="tt-mods">
                  <p
                    v-for="(mod, i) in uModsPrimary"
                    :key="'upm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>

                <p
                  v-for="(line, i) in uFlavourPrimary"
                  :key="'ufp' + i"
                  class="tt-flavor"
                >
                  {{ line }}
                </p>

                <div
                  v-if="uModsSecondary.length || uFlavourSecondary.length"
                  class="tt-sep tt-sep--thin"
                >
                  <i class="tt-diamond"></i>
                </div>

                <div v-if="uModsSecondary.length" class="tt-mods tt-mods--dim">
                  <p
                    v-for="(mod, i) in uModsSecondary"
                    :key="'usm' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(mod)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
                <p
                  v-for="(line, i) in uFlavourSecondary"
                  :key="'ufs' + i"
                  class="tt-flavor tt-flavor--dim"
                >
                  {{ line }}
                </p>
              </div>
              <p v-else class="tt-soon">{{ t('noDescription') }}</p>
            </div>
          </div>
        </article>

        <!-- MOD detayı: stat metni (EN/TR) + affix + level + uygulandığı türler -->
        <article v-else-if="mode === 'mods' && selectedMod" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <header class="tt-head">
                <span
                  class="tt-icon mod-badge mod-badge--lg"
                  :class="selectedMod.affix_type === 'prefix' ? 'mod-badge--prefix' : 'mod-badge--suffix'"
                  >{{ selectedMod.affix_type === 'prefix' ? 'P' : 'S' }}</span
                >
                <span class="tt-headtext">
                  <span class="tt-name tt-name--mod">{{ affixLabel(selectedMod) }}</span><span v-if="trMark(selectedMod)" class="tt-trmark" :title="trMark(selectedMod) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedMod) }}</span>
                  <span class="tt-subtype">{{
                    selectedMod.tags.map((tg) => modTagLabel(tg)).join(', ')
                  }}</span>
                </span>
              </header>

              <div class="tt-sep"><i class="tt-diamond"></i></div>

              <!-- Stat satırları: birincil dil + ikincil dil (soluk) -->
              <div class="tt-desc">
                <div class="tt-mods">
                  <p
                    v-for="(line, i) in modLines(selectedMod, true)"
                    :key="'mpl' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(line)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
                <div class="tt-sep tt-sep--thin"><i class="tt-diamond"></i></div>
                <div class="tt-mods tt-mods--dim">
                  <p
                    v-for="(line, i) in modLines(selectedMod, false)"
                    :key="'msl' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(line)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
              </div>

              <hr class="tt-rule" />

              <!-- TIER tablosu: T1 (en güçlü) en üstte; değer aralığı + seviye -->
              <div class="tt-tierhead">{{ t('modTierList') }}</div>
              <div class="mod-tiers">
                <div
                  v-for="(tier, i) in selectedMod.tiers"
                  :key="'tier' + i"
                  class="mod-tier"
                >
                  <span class="mod-tier-n">T{{ i + 1 }}</span>
                  <span class="mod-tier-val">
                    <span
                      v-for="(part, j) in markupLine(tier.values)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </span>
                  <span class="mod-tier-lvl">{{ t('statLevel') }} {{ tier.level }}</span>
                </div>
              </div>

              <hr class="tt-rule" />

              <!-- Bilgi satırları -->
              <div class="tt-stats">
                <div class="tt-stat">
                  <span class="tt-k">{{ isTr ? 'Ek' : 'Affix' }}</span>
                  <span class="tt-v">{{ affixLabel(selectedMod) }}</span>
                </div>
                <div v-if="modApplies(selectedMod).length" class="tt-stat">
                  <span class="tt-k">{{ t('modAppliesTo') }}</span>
                  <span class="tt-v">{{ modApplies(selectedMod).join(', ') }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- AREA detayı: ad + act + level + tür + boss + bağlı bölgeler -->
        <article v-else-if="mode === 'areas' && selectedArea" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <!-- Bölge görseli (loading screen) - üst banner -->
              <div v-if="areaAssetUrl(selectedArea.area_image)" class="area-banner">
                <img :src="areaAssetUrl(selectedArea.area_image)!" :alt="areaName(selectedArea)" />
              </div>
              <header class="tt-head">
                <span class="tt-icon mod-badge mod-badge--lg"
                  :class="selectedArea.type === 'town' ? 'mod-badge--suffix' : 'mod-badge--prefix'"
                  >{{ selectedArea.area_level }}</span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--area">{{ areaName(selectedArea) }}</span><span v-if="trMark(selectedArea)" class="tt-trmark" :title="trMark(selectedArea) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedArea) }}</span>
                  <span class="tt-subtype">{{ actGroupLabel(selectedArea.act) }} · {{ areaTypeLabel(selectedArea) }}</span>
                </span>
              </header>

              <hr class="tt-rule" />

              <div class="tt-stats">
                <div class="tt-stat">
                  <span class="tt-k">{{ t('areaAct') }}</span>
                  <span class="tt-v">{{ actGroupLabel(selectedArea.act) }}</span>
                </div>
                <div class="tt-stat">
                  <span class="tt-k">{{ t('statLevel') }}</span>
                  <span class="tt-v">{{ selectedArea.area_level }}</span>
                </div>
                <div class="tt-stat">
                  <span class="tt-k">{{ t('areaType') }}</span>
                  <span class="tt-v">{{ areaTypeLabel(selectedArea) }}</span>
                </div>
                <div v-if="selectedArea.has_waypoint !== null" class="tt-stat">
                  <span class="tt-k">{{ t('areaWaypoint') }}</span>
                  <span class="tt-v" :class="selectedArea.has_waypoint ? 'tt-yes' : 'tt-no'">{{
                    selectedArea.has_waypoint ? t('areaWaypointYes') : t('areaWaypointNo')
                  }}</span>
                </div>
                <div v-if="areaBossList(selectedArea).length || selectedArea.bosses.length" class="tt-stat tt-bossrow">
                  <span class="tt-k">{{ t('areaBosses') }}</span>
                  <span class="tt-bossval">
                    <span v-if="selectedArea.boss_images.length" class="tt-bossimgs">
                      <img
                        v-for="(bi, i) in selectedArea.boss_images"
                        :key="i"
                        class="tt-bossimg"
                        :src="areaAssetUrl(bi)!"
                        alt=""
                      />
                    </span>
                    <span class="tt-v">{{
                      (areaBossList(selectedArea).length ? areaBossList(selectedArea) : selectedArea.bosses).join(', ')
                    }}</span>
                  </span>
                </div>
              </div>

              <!-- Görev + Ödül (docx) -->
              <template v-if="areaQuest(selectedArea) || areaReward(selectedArea)">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div v-if="areaQuest(selectedArea)" class="tt-stat tt-questrow">
                  <span class="tt-k">{{ t('areaQuest') }}</span>
                  <span class="tt-v tt-quest">{{ areaQuest(selectedArea) }}</span>
                </div>
                <div v-if="areaReward(selectedArea)" class="tt-stat tt-questrow">
                  <span class="tt-k">{{ t('areaReward') }}</span>
                  <span class="tt-rewardval">
                    <span v-if="selectedArea.reward_icons.length" class="tt-rewardimgs">
                      <img
                        v-for="(ri, i) in selectedArea.reward_icons"
                        :key="i"
                        class="tt-rewardimg"
                        :src="areaAssetUrl(ri)!"
                        alt=""
                      />
                    </span>
                    <span class="tt-v tt-reward">{{ areaReward(selectedArea) }}</span>
                  </span>
                </div>
              </template>

              <!-- Adımlar (docx; Opus özgün özet) -->
              <template v-if="areaSteps(selectedArea).length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('areaSteps') }}</div>
                <ol class="tt-steps">
                  <li v-for="(s, i) in areaSteps(selectedArea)" :key="i">{{ s }}</li>
                </ol>
              </template>

              <!-- NPC / POI (docx) -->
              <template v-if="selectedArea.npcs.length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('areaNpcs') }}</div>
                <div class="tt-tags">
                  <span v-for="(n, i) in selectedArea.npcs" :key="i" class="tt-tag tt-tag--npc">{{ n }}</span>
                </div>
              </template>
              <template v-if="selectedArea.poi.length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('areaPoi') }}</div>
                <div class="tt-tags">
                  <span v-for="(p, i) in selectedArea.poi" :key="i" class="tt-tag">{{ p }}</span>
                </div>
              </template>

              <template v-if="areaConnected(selectedArea).length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('areaConnected') }}</div>
                <div class="tt-tags">
                  <span
                    v-for="(c, i) in areaConnected(selectedArea)"
                    :key="i"
                    class="tt-tag"
                    >{{ c }}</span
                  >
                </div>
              </template>

              <!-- Görünür kaynak/atıf: walkthrough içeriği Maxroll rehberinden derlenmiştir -->
              <p
                v-if="selectedArea.source_facts === 'maxroll-campaign-guide'"
                class="tt-source"
              >
                {{ isTr ? 'Kaynak' : 'Source' }}:
                <a
                  href="https://maxroll.gg/poe2/getting-started/path-of-exile-2-campaign-guide"
                  target="_blank"
                  rel="noopener"
                  >Maxroll — PoE 2 Campaign Guide</a
                >
              </p>
            </div>
          </div>
        </article>

        <!-- ASCENDANCY detayı: ikon + ad + sınıf/attribute + açıklama + node listesi -->
        <article v-else-if="mode === 'ascendancies' && selectedAsc" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <header class="tt-head">
                <span v-if="ascIconUrl(selectedAsc)" class="tt-icon tt-icon--asc">
                  <img :src="ascIconUrl(selectedAsc)!" :alt="selectedAsc.en" />
                </span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--area">{{ ascName(selectedAsc) }}</span><span v-if="trMark(selectedAsc)" class="tt-trmark" :title="trMark(selectedAsc) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedAsc) }}</span>
                  <span class="tt-subtype">{{
                    selectedAsc.type === 'class'
                      ? t('ascClassLabel') + ' · ' + ascAttribute(selectedAsc)
                      : t('ascAscendancyLabel') + ' · ' + ascParentName(selectedAsc)
                  }}</span>
                </span>
              </header>

              <hr class="tt-rule" />

              <p v-if="ascDesc(selectedAsc)" class="tt-flavor asc-flavor">{{ ascDesc(selectedAsc) }}</p>

              <!-- Yükseliş node listesi (notable'lar vurgulu) -->
              <template v-if="selectedAsc.nodes.length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('ascNodes') }}</div>
                <ul class="asc-nodes">
                  <li
                    v-for="(n, i) in selectedAsc.nodes"
                    :key="i"
                    class="asc-node"
                    :class="{ 'asc-node--notable': n.notable }"
                  >
                    <span class="asc-node-name">{{ ascNodeName(n) }}</span>
                    <span class="asc-node-stat">{{ ascNodeStat(n) }}</span>
                  </li>
                </ul>
              </template>
            </div>
          </div>
        </article>

        <!-- PASSIVE detayı: ikon + ad + tip + stat listesi -->
        <article v-else-if="mode === 'passives' && selectedPassive" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <header class="tt-head">
                <span class="tt-icon tt-icon--passive" :class="'pn--' + selectedPassive.node_type">
                  <img v-if="passiveIconUrl(selectedPassive)" :src="passiveIconUrl(selectedPassive)!" :alt="selectedPassive.en" />
                  <span v-else class="facet"></span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name" :class="selectedPassive.node_type === 'keystone' ? 'tt-name--keystone' : 'tt-name--area'">{{ passiveName(selectedPassive) }}</span><span v-if="trMark(selectedPassive)" class="tt-trmark" :title="trMark(selectedPassive) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedPassive) }}</span>
                  <span class="tt-subtype">{{ passiveTypeLabel(selectedPassive.node_type) }}<template v-if="selectedPassive.count > 1"> · {{ t('passiveCopies', { count: selectedPassive.count }) }}</template></span>
                </span>
              </header>

              <hr class="tt-rule" />

              <ul v-if="passiveStats(selectedPassive).length" class="asc-nodes passive-stats">
                <li v-for="(s, i) in passiveStats(selectedPassive)" :key="i" class="passive-stat-line">{{ s }}</li>
              </ul>
              <p v-else class="tt-flavor">{{ isTr ? 'Stat metni yok (yuvа/özel node).' : 'No stat text (socket/special node).' }}</p>
            </div>
          </div>
        </article>

        <!-- ATLAS detayı: 4 alt-tip tek tooltip (waystone/node/tablet/pinnacle) -->
        <article v-else-if="mode === 'atlas' && selectedAtlas" class="tooltip">
          <div class="tt-inner">
            <img
              v-if="atlasIconUrl(selectedAtlas)"
              class="tt-art"
              :src="atlasIconUrl(selectedAtlas)!"
              alt=""
              aria-hidden="true"
            />
            <div class="tt-body">
              <header class="tt-head">
                <span v-if="atlasIconUrl(selectedAtlas)" class="tt-icon">
                  <img :src="atlasIconUrl(selectedAtlas)!" :alt="selectedAtlas.en" />
                </span>
                <span
                  v-else
                  class="tt-icon mod-badge mod-badge--lg"
                  :class="selectedAtlas.node_type === 'keystone' ? 'mod-badge--prefix' : 'mod-badge--suffix'"
                  >{{ atlasBadge(selectedAtlas) }}</span
                >
                <span class="tt-headtext">
                  <span class="tt-name tt-name--area">{{ atlasName(selectedAtlas) }}</span><span v-if="trMark(selectedAtlas)" class="tt-trmark" :title="trMark(selectedAtlas) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedAtlas) }}</span>
                  <span class="tt-subtype">{{ atlasSubLine(selectedAtlas) }}</span>
                </span>
              </header>

              <hr class="tt-rule" />

              <!-- Waystone: tier + drop seviyesi -->
              <div v-if="selectedAtlas.subtype === 'waystone'" class="tt-stats">
                <div v-if="selectedAtlas.tier !== null" class="tt-stat">
                  <span class="tt-k">{{ isTr ? 'Kademe' : 'Tier' }}</span>
                  <span class="tt-v">{{ selectedAtlas.tier }}</span>
                </div>
                <div v-if="selectedAtlas.drop_level !== null" class="tt-stat">
                  <span class="tt-k">{{ t('statDropLevel') }}</span>
                  <span class="tt-v">{{ selectedAtlas.drop_level }}</span>
                </div>
              </div>

              <!-- Atlas node: stat satırları (birincil dil) -->
              <ul
                v-else-if="selectedAtlas.subtype === 'atlas_node' && atlasStats(selectedAtlas).length"
                class="asc-nodes passive-stats"
              >
                <li
                  v-for="(s, i) in atlasStats(selectedAtlas)"
                  :key="'as' + i"
                  class="passive-stat-line"
                >
                  <span
                    v-for="(part, j) in markupLine(s)"
                    :key="j"
                    :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                    >{{ part.s }}</span
                  >
                </li>
              </ul>

              <!-- Tablet: implicit (birincil + ikincil dil soluk) -->
              <div v-else-if="selectedAtlas.subtype === 'tablet'" class="tt-desc">
                <div class="tt-mods">
                  <p
                    v-for="(line, i) in atlasImplicit(selectedAtlas, true)"
                    :key="'ai' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(line)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
                <div class="tt-sep tt-sep--thin"><i class="tt-diamond"></i></div>
                <div class="tt-mods tt-mods--dim">
                  <p
                    v-for="(line, i) in atlasImplicit(selectedAtlas, false)"
                    :key="'aisd' + i"
                    class="tt-mod"
                  >
                    <span
                      v-for="(part, j) in markupLine(line)"
                      :key="j"
                      :class="{ 'stat-num': part.t === 'num', 'tt-aug': part.t === 'aug', 'tt-kw': part.t === 'kw' }"
                      >{{ part.s }}</span
                    >
                  </p>
                </div>
              </div>

              <!-- Pinnacle key: açıklama (birincil + ikincil dil soluk) -->
              <div v-else-if="selectedAtlas.subtype === 'pinnacle_key'" class="tt-desc">
                <p v-if="atlasDesc(selectedAtlas, true)" class="tt-flavor">
                  {{ atlasDesc(selectedAtlas, true) }}
                </p>
                <template v-if="atlasDesc(selectedAtlas, false)">
                  <div class="tt-sep tt-sep--thin"><i class="tt-diamond"></i></div>
                  <p class="tt-flavor tt-flavor--dim">{{ atlasDesc(selectedAtlas, false) }}</p>
                </template>
              </div>
            </div>
          </div>
        </article>

        <!-- MECHANIC detayı: banner + ikon + ad + overview + parçalar + ipucu -->
        <article v-else-if="mode === 'mechanics' && selectedMech" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <!-- Hero banner (loading screen) — varsa -->
              <div v-if="mechAssetUrl(selectedMech.banner)" class="area-banner">
                <img :src="mechAssetUrl(selectedMech.banner)!" :alt="mechName(selectedMech)" />
              </div>
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="mechAssetUrl(selectedMech.icon)"
                    :src="mechAssetUrl(selectedMech.icon)!"
                    :alt="selectedMech.en"
                  />
                  <span v-else class="mod-badge mod-badge--lg mod-badge--prefix">{{
                    mechBadge(selectedMech)
                  }}</span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--area">{{ mechName(selectedMech) }}</span><span v-if="trMark(selectedMech)" class="tt-trmark" :title="trMark(selectedMech) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedMech) }}</span>
                  <span class="tt-subtype">{{ mechSubtypeLabel(selectedMech.subtype) }}</span>
                </span>
              </header>

              <!-- İkincil dildeki ad -->
              <div class="tt-tags">
                <span v-if="!isTr" class="tt-tag">{{ selectedMech.tr }}</span>
              </div>

              <hr class="tt-rule" />

              <!-- Nasıl çalışır (overview) -->
              <div class="tt-tierhead">{{ t('mechOverview') }}</div>
              <p
                v-for="(para, i) in mechOverview(selectedMech).split('\n').filter((p) => p.trim())"
                :key="i"
                class="tt-flavor tt-mech-para"
              >{{ para }}</p>

              <!-- İlgili parçalar -->
              <template v-if="selectedMech.parts.length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('mechParts') }}</div>
                <div class="tt-mech-parts">
                  <div v-for="(p, i) in selectedMech.parts" :key="i" class="tt-mech-part">
                    <span class="tt-mech-part-name">{{ mechPartName(p) }}</span>
                    <span class="tt-mech-part-desc">{{ mechPartDesc(p) }}</span>
                  </div>
                </div>
              </template>

              <!-- İpucu -->
              <template v-if="mechTip(selectedMech)">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-stat tt-questrow">
                  <span class="tt-k">{{ t('mechTip') }}</span>
                  <span class="tt-v tt-quest">{{ mechTip(selectedMech) }}</span>
                </div>
              </template>

              <!-- Kaynak damgası -->
              <div class="tt-mech-source">
                {{ t('mechSourceNote') }}: {{ selectedMech.overview_source }} ·
                {{ selectedMech.game_version }}
              </div>
            </div>
          </div>
        </article>

        <!-- BOSS tooltip (oyun temalı; mekanik kartıyla aynı stil) -->
        <article v-else-if="mode === 'bosses' && selectedBoss" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <!-- Hero banner (loading screen) — varsa -->
              <div v-if="bossAssetUrl(selectedBoss.banner)" class="area-banner">
                <img :src="bossAssetUrl(selectedBoss.banner)!" :alt="bossName(selectedBoss)" />
              </div>
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="bossAssetUrl(selectedBoss.icon)"
                    :src="bossAssetUrl(selectedBoss.icon)!"
                    :alt="selectedBoss.en"
                  />
                  <span v-else class="mod-badge mod-badge--lg mod-badge--prefix">{{
                    bossBadge(selectedBoss)
                  }}</span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--area">{{ bossName(selectedBoss) }}</span><span v-if="trMark(selectedBoss)" class="tt-trmark" :title="trMark(selectedBoss) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedBoss) }}</span>
                  <span class="tt-subtype">{{ bossTypeLabel(selectedBoss) }}</span>
                </span>
              </header>

              <!-- İkincil dildeki ad -->
              <div class="tt-tags">
                <span v-if="!isTr" class="tt-tag">{{ selectedBoss.tr }}</span>
              </div>

              <hr class="tt-rule" />

              <!-- Nasıl erişilir -->
              <div class="tt-tierhead">{{ t('bossAccess') }}</div>
              <p class="tt-flavor tt-mech-para">{{ bossAccess(selectedBoss) }}</p>

              <!-- Ana mekanikler / dikkat (yalnızca dolu ise) -->
              <template v-if="bossMechanics(selectedBoss)">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('bossMechanics') }}</div>
                <p class="tt-flavor tt-mech-para">{{ bossMechanics(selectedBoss) }}</p>
              </template>

              <!-- Bağlı mekanik -->
              <template v-if="bossRelatedNames(selectedBoss)">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-stat tt-questrow">
                  <span class="tt-k">{{ t('bossRelated') }}</span>
                  <span class="tt-v">{{ bossRelatedNames(selectedBoss) }}</span>
                </div>
              </template>

              <!-- Kaynak damgası -->
              <div class="tt-mech-source">
                {{ t('mechSourceNote') }}: {{ selectedBoss.source }} ·
                {{ selectedBoss.game_version }}
              </div>
            </div>
          </div>
        </article>

        <!-- CRAFTING tooltip (oyun temalı; mekanik/boss kartıyla aynı stil) -->
        <article v-else-if="mode === 'crafting' && selectedCraft" class="tooltip">
          <div class="tt-inner">
            <div class="tt-body">
              <header class="tt-head">
                <span class="tt-icon">
                  <img
                    v-if="craftAssetUrl(selectedCraft.icon)"
                    :src="craftAssetUrl(selectedCraft.icon)!"
                    :alt="selectedCraft.en"
                  />
                  <span v-else class="mod-badge mod-badge--lg mod-badge--prefix">{{
                    craftBadge(selectedCraft)
                  }}</span>
                </span>
                <span class="tt-headtext">
                  <span class="tt-name tt-name--area">{{ craftName(selectedCraft) }}</span><span v-if="trMark(selectedCraft)" class="tt-trmark" :title="trMark(selectedCraft) === 'çeviri yok' ? 'TR çevirisi yok — EN gösteriliyor' : 'TR çevirisi öneri — doğrulanmalı'">⚠ {{ trMark(selectedCraft) }}</span>
                  <span class="tt-subtype">{{ craftSubtypeLabel(selectedCraft.subtype) }}</span>
                </span>
              </header>

              <!-- İkincil dildeki ad -->
              <div class="tt-tags">
                <span v-if="!isTr" class="tt-tag">{{ selectedCraft.tr }}</span>
              </div>

              <!-- İSKELET: doğrulama bekliyor notu -->
              <div v-if="craftPending(selectedCraft)" class="tt-pending">
                {{ t('craftPending') }}
              </div>

              <hr class="tt-rule" />

              <!-- Açıklama (iskelette boş olabilir) -->
              <p v-if="craftDesc(selectedCraft)" class="tt-flavor tt-mech-para">
                {{ craftDesc(selectedCraft) }}
              </p>

              <!-- Adımlar (varsa) -->
              <template v-if="craftSteps(selectedCraft).length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('craftSteps') }}</div>
                <ol class="tt-steps">
                  <li v-for="(s, i) in craftSteps(selectedCraft)" :key="i">{{ s }}</li>
                </ol>
              </template>

              <!-- reference: ilgili materyaller etki metniyle (ad + currency desc) -->
              <template v-if="selectedCraft.subtype === 'reference' && craftRelated(selectedCraft).length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-mech-parts">
                  <div v-for="m in craftRelated(selectedCraft)" :key="m.id" class="tt-mech-part">
                    <span class="tt-mech-part-name">
                      <img
                        v-if="currencyIconUrl(m)"
                        :src="currencyIconUrl(m)!"
                        :alt="m.en"
                        class="tt-mat-inline"
                      />{{ isTr ? m.tr || m.en : m.en }}
                    </span>
                    <span class="tt-mech-part-desc">{{ craftMatDesc(m) }}</span>
                  </div>
                </div>
              </template>

              <!-- diğer alt-tipler: ilgili materyaller (ikon+ad çipleri) -->
              <template v-else-if="craftRelated(selectedCraft).length">
                <div class="tt-sep"><i class="tt-diamond"></i></div>
                <div class="tt-tierhead">{{ t('craftMaterials') }}</div>
                <div class="tt-mats">
                  <span v-for="m in craftRelated(selectedCraft)" :key="m.id" class="tt-mat">
                    <span class="tt-mat-icon">
                      <img v-if="currencyIconUrl(m)" :src="currencyIconUrl(m)!" :alt="m.en" />
                    </span>
                    <span class="tt-mat-name">{{ isTr ? m.tr || m.en : m.en }}</span>
                  </span>
                </div>
              </template>

              <!-- Kaynak damgası -->
              <div class="tt-mech-source">
                {{ t('mechSourceNote') }}: {{ selectedCraft.source }} ·
                {{ selectedCraft.game_version }}
              </div>
            </div>
          </div>
        </article>

        <div v-else class="detail-hint">
          <p class="hint-title">{{ t('detailHintTitle') }}</p>
          <p class="hint-text">
            {{
              mode === 'currency'
                ? t('detailHintCurrency')
                : mode === 'items'
                  ? t('detailHintItems')
                  : mode === 'uniques'
                    ? t('detailHintUniques')
                    : mode === 'mods'
                      ? t('detailHintMods')
                      : mode === 'areas'
                        ? t('detailHintAreas')
                        : mode === 'ascendancies'
                          ? t('detailHintAscendancies')
                          : mode === 'passives'
                            ? t('detailHintPassives')
                            : mode === 'atlas'
                              ? t('detailHintAtlas')
                              : mode === 'mechanics'
                                ? t('detailHintMechanics')
                                : mode === 'bosses'
                                  ? t('detailHintBosses')
                                  : mode === 'crafting'
                                    ? t('detailHintCrafting')
                                    : t('detailHint')
            }}
          </p>
        </div>
      </section>
    </div>
    </main>

    <!-- Ayar paneli (modal) -->
    <SettingsPanel
      v-if="showSettings"
      :is-tr="isTr"
      @close="showSettings = false"
      @toggle-lang="toggleLang"
      @show-tour="replayTour"
      @show-whats-new="openWhatsNew"
      @show-feedback="openFeedback"
    />

    <!-- Geri Bildirim / Öneri (0.15.1) -->
    <FeedbackModal v-if="showFeedback" :is-tr="isTr" @close="showFeedback = false" />

    <!-- "Neler değişti" (güncelleme sonrası 1 kez + Ayarlar'dan tekrar) -->
    <WhatsNew v-if="showWhatsNew" :is-tr="isTr" :version="appVer" @close="closeWhatsNew" />

    <!-- İlk açılış tanıtımı (onboarding) -->
    <WelcomeTour
      v-if="showTour"
      :is-tr="isTr"
      @done="finishTour"
      @open-settings="openSettingsFromTour"
    />
  </div>
</template>

<style>
body {
  margin: 0;
  background: var(--bg-app);
  color: var(--text-default);
  font-family: var(--font-body);
}
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  /* Gercek tas dokusu (common/background1.dds) doseli + sicak ic isik + vinyet */
  background:
    radial-gradient(
      ellipse at 50% 28%,
      rgba(120, 92, 44, 0.1) 0%,
      rgba(0, 0, 0, 0) 55%
    ),
    radial-gradient(
      ellipse at 50% 46%,
      rgba(0, 0, 0, 0) 34%,
      var(--bg-app-edge) 100%
    ),
    linear-gradient(rgba(13, 12, 10, 0.72), rgba(7, 7, 6, 0.82)),
    url(../assets/ui/bg-tile.png);
  background-size: cover, cover, auto, 348px 348px;
  background-repeat: no-repeat, no-repeat, no-repeat, repeat;
  background-attachment: fixed;
}

/* --- Ozel frameless koyu baslik bari --- */
/* 1. SIRA: ince tam-genişlik SÜRÜKLEME şeridi (marka solda, pencere düğmeleri sağda) */
.titlebar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding-left: 12px;
  /* Gercek oyun ust-bar dokusu (windowtitlebar L/M/R) 3-slice, orta tile */
  border-style: solid;
  border-width: 0 36px;
  border-image: url(../assets/ui/bar-titlebar.png) 0 172 fill repeat;
  background: #0b0b0c;
  -webkit-app-region: drag;
  user-select: none;
}
.tb-brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-variant: small-caps;
  letter-spacing: 0.07em;
  color: var(--gold-title);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95);
  white-space: nowrap;
  flex: none;
}
.tb-logo {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(180, 140, 60, 0.45), 0 1px 3px rgba(0, 0, 0, 0.7);
  flex: none;
}
/* Pencere düğmeleri (min/büyüt/kapat) — şeritte, tıklanabilir (no-drag) */
.tb-winbtns {
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;
}

/* 2. SIRA: sekme çubuğu (sekmeler + ⚙/EN-TR) — koyu zemin, tıklanabilir */
.tabbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 6px 0 10px;
  background:
    linear-gradient(rgba(20, 18, 14, 0.92), rgba(12, 11, 9, 0.94)),
    url(../assets/ui/panel-filler.png);
  background-size: auto, 100% auto;
  background-repeat: no-repeat, repeat;
  border-bottom: 1px solid rgba(0, 0, 0, 0.7);
  box-shadow: inset 0 1px 0 rgba(200, 170, 110, 0.08);
}
.tabbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.tabbar-actions .lang-btn {
  margin-left: 4px;
}
/* Gems / Currency sekmeleri (oyun temasi: teal vurgulu, keskin) */
.tb-tabs {
  display: flex;
  align-items: stretch;
  height: 100%;
  min-width: 0;
}
.tb-tab {
  font-family: var(--font-serif);
  font-variant: small-caps;
  /* refs Options: pasif sekme KOYU tas + ACIK ALTIN/KREM yazi (her zaman okunur) */
  color: #f0d6a0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.85);
  /* Koyulastirilmis sekme dokusu (tablabel L/M/R) 3-slice, orta tile + koyu zemin */
  border-style: solid;
  border-width: 0 7px;
  border-image: url(../assets/ui/tab-normal.png) 0 44 fill repeat;
  background: linear-gradient(rgba(28, 23, 14, 0.55), rgba(14, 11, 7, 0.65));
  align-self: center;
  height: 34px;
  line-height: 34px;
  padding: 0 3px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.tb-tab:hover {
  color: #fff1cf;
}
.tb-tab--active {
  /* refs: aktif sekme ACIK/vurgulu zemin + KOYU yazi (yuksek kontrast, hep okunur) */
  color: #241702;
  font-weight: 700;
  border-image: url(../assets/ui/tab-active.png) 0 44 fill repeat;
  background: none;
  text-shadow: 0 1px 0 rgba(255, 240, 210, 0.45);
}
.tb-actions {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
}
.tb-actions .lang-btn {
  margin-right: 8px;
}
.win-btn {
  width: 44px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}
.win-btn:hover {
  background: rgba(200, 170, 110, 0.12);
  color: var(--gold-title);
}
.win-btn--close:hover {
  background: #7a1f1f;
  color: #fff;
}
/* Belirgin Ayarlar (dişli) düğmesi: net ikon + etiket + kontrast (0.15.1) */
.settings-btn {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  margin-right: 4px;
  font-family: var(--font-serif);
  font-size: 12.5px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #f0d6a0;
  background: linear-gradient(rgba(48, 40, 23, 0.95), rgba(28, 22, 13, 0.95));
  border: 1px solid var(--gold-line, #b89a66);
  border-radius: 4px;
  cursor: pointer;
}
.settings-btn:hover {
  color: #fff;
  border-color: #ecc24a;
  background: linear-gradient(rgba(60, 50, 28, 0.98), rgba(36, 28, 16, 0.98));
}
.settings-btn-label {
  line-height: 1;
}

/* Icerik bolgesi (baslik barinin altinda, kenar bosluklu) */
.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 16px;
  box-sizing: border-box;
}

/* Eskitilmis altin kenarli, beveled metal EN/TR dugmesi (baslik barinda) */
.lang-btn {
  font-family: var(--font-serif);
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: var(--tracking-title);
  color: var(--gold-title);
  /* Gercek oyun butonu (buttongeneric normal/hover/pressed) 3-slice */
  border-style: solid;
  border-width: 0 20px;
  border-image: url(../assets/ui/btn-normal.png) 0 44 fill repeat;
  height: 30px;
  line-height: 30px;
  padding: 0 4px;
  cursor: pointer;
}
.lang-btn:hover {
  color: #fff;
  border-image: url(../assets/ui/btn-hover.png) 0 44 fill repeat;
}
.lang-btn:active {
  border-image: url(../assets/ui/btn-pressed.png) 0 44 fill repeat;
}

/* --- Iki sutunlu asimetrik yerlesim --- */
.layout {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  min-height: 0;
}

/* --- Passives: Liste / Agac alt-gecisi --- */
.pv-subtabs {
  flex: none;
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}
.pv-subtab {
  font-family: var(--font-serif);
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  background: var(--bg-panel);
  border: 1px solid var(--frame-brown);
  padding: 4px 16px;
  cursor: pointer;
}
.pv-subtab:hover {
  color: var(--gold-title);
  border-color: var(--gold-line);
}
.pv-subtab--active {
  color: var(--gold-title);
  background: var(--bg-panel-hi);
  border-color: var(--metal-edge);
  box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.22);
}
/* Gorsel agac paneli: tas cerceve + listeyle ayni dis hat */
.pv-tree-host {
  flex: 1;
  min-height: 0;
  border: 13px solid transparent;
  border-image: url(../assets/ui/frame-border3.png) 16 repeat;
  background:
    linear-gradient(rgba(13, 16, 17, 0.82), rgba(8, 11, 12, 0.88)),
    url(../assets/ui/panel-filler.png);
  background-size: auto, 100% auto;
  background-repeat: no-repeat, repeat-y;
}

/* Ortak: beveled koyu-metal + ic altin hat panel cercevesi */
.panel-frame {
  border: var(--border-width) solid var(--metal-edge);
  box-shadow:
    0 0 0 1px #000,
    inset 0 0 0 1px rgba(200, 170, 110, 0.2),
    inset 0 2px 5px rgba(0, 0, 0, 0.55),
    inset 0 -22px 46px rgba(0, 0, 0, 0.35),
    0 5px 16px rgba(0, 0, 0, 0.75);
}

/* --- Sol: liste (envanter paneli) --- */
.list-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* Gercek oyun border3 cercevesi (border3* 8 parca 9-slice) liste paneli etrafinda */
  border: 13px solid transparent;
  border-image: url(../assets/ui/frame-border3.png) 16 repeat;
  /* Gercek panel dolgu dokusu (panelfiller.dds) + koyu overlay (okunurluk) */
  background:
    linear-gradient(rgba(13, 16, 17, 0.82), rgba(8, 11, 12, 0.88)),
    url(../assets/ui/panel-filler.png);
  background-size: auto, 100% auto;
  background-repeat: no-repeat, repeat-y;
  filter: drop-shadow(0 5px 16px rgba(0, 0, 0, 0.7));
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 11px 10px;
  background:
    linear-gradient(rgba(42, 36, 23, 0.7), rgba(28, 23, 16, 0.72)),
    var(--tex-grain);
  background-size: auto, 160px 160px;
  border-bottom: var(--border-width) solid var(--gold-line);
  box-shadow: inset 0 1px 0 rgba(200, 170, 110, 0.08);
}
.search {
  flex: 1;
  font-family: var(--font-serif);
  font-size: var(--fs-body);
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.55);
  border: var(--border-width) solid var(--frame-brown);
  border-radius: 0;
  padding: 7px 9px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7);
}
.search:focus {
  outline: none;
  border-color: var(--gold-line);
}
.search::placeholder {
  color: var(--text-muted);
}
.count {
  font-size: var(--fs-small);
  color: var(--gold-ornament);
  white-space: nowrap;
  font-variant: small-caps;
}
/* Items sınıf filtresi çubuğu (envanter paneli üst kısmında) */
.filter-row {
  display: flex;
  padding: 8px 11px;
  background: rgba(0, 0, 0, 0.28);
  border-bottom: var(--border-width) solid var(--frame-brown);
}
.class-filter {
  flex: 1;
  font-family: var(--font-serif);
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: var(--gold-title);
  background: rgba(0, 0, 0, 0.55);
  border: var(--border-width) solid var(--metal-edge);
  border-radius: 0;
  padding: 5px 8px;
  cursor: pointer;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7);
}
.class-filter:focus {
  outline: none;
  border-color: var(--gold-line);
}
.class-filter option {
  background: #14110b;
  color: var(--text-default);
}
.gem-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
/* Gercek satir ayraci dokusu (skillpanel separatingline.dds) */
.gem-list li {
  background: url(../assets/ui/row-separator.png) bottom center / 100% 2px no-repeat;
}
.gem-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  border-bottom: none;
  padding: 7px 10px;
  cursor: pointer;
  font-family: var(--font-serif);
}
.gem-row:hover {
  background: rgba(200, 170, 110, 0.06);
}
.gem-row--active {
  background:
    linear-gradient(
      90deg,
      rgba(27, 162, 155, 0.22),
      rgba(27, 162, 155, 0.06) 70%,
      transparent
    );
  border-left: 3px solid var(--rarity-gem);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 14px rgba(27, 162, 155, 0.12);
}
.gem-icon {
  flex: none;
  display: block;
}
/* Ikon: beveled metal kare yuva icinde */
.gem-icon img,
.gem-icon-ph {
  width: 38px;
  height: 38px;
  display: block;
  border: var(--border-width) solid var(--metal-edge);
  background: #000;
  box-shadow:
    inset 0 0 0 1px rgba(200, 170, 110, 0.22),
    inset 0 0 6px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.6);
}
.gem-icon-ph {
  display: flex;
  align-items: center;
  justify-content: center;
}
.gem-icon-ph .facet {
  width: 14px;
  height: 14px;
  transform: rotate(45deg);
}
.attr--str .facet {
  background: var(--attr-str);
}
.attr--dex .facet {
  background: var(--attr-dex);
}
.attr--int .facet {
  background: var(--attr-int);
}
.attr--none .facet {
  background: var(--attr-none);
}
.gem-row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.gem-name {
  font-size: var(--fs-body);
  font-variant: small-caps;
  letter-spacing: 0.02em;
  color: var(--rarity-gem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.7);
}
/* Unique (eşsiz) ad rengi: turuncu-kahve #AF6025 (rarity-unique) */
.gem-name--unique {
  color: var(--rarity-unique);
}
/* Mod stat metni (magic mavisi tonu) + tek satır */
.mod-name {
  color: var(--rarity-magic);
}
/* Affix rozeti (ikon yerine): önek/sonek kare nişanı */
.mod-badge {
  flex: none;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--rarity-magic);
  background: #000;
  border: var(--border-width) solid var(--metal-edge);
  box-shadow:
    inset 0 0 0 1px rgba(200, 170, 110, 0.22),
    inset 0 0 6px rgba(0, 0, 0, 0.8);
}
.mod-badge--suffix {
  color: var(--gold-ornament);
}
.mod-badge--lg {
  width: 40px;
  height: 40px;
  font-size: 18px;
}
.tt-name--mod {
  color: var(--rarity-magic);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 9px rgba(136, 136, 255, 0.22);
}
/* Area: ad altın, level rozeti küçük sayı sığsın */
.tt-name--area {
  color: var(--gold-title);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 9px rgba(200, 170, 110, 0.22);
}
.area-group-head {
  padding: 9px 12px 5px;
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.08em;
  color: var(--gold-ornament);
  background: linear-gradient(rgba(42, 36, 23, 0.5), rgba(28, 23, 16, 0.4));
  border-bottom: var(--border-width) solid var(--gold-line);
  position: sticky;
  top: 0;
  z-index: 1;
}
/* Area level rozeti: 2-3 haneli sayı için font biraz küçük */
.area-group-head + li .mod-badge,
.gem-row .mod-badge {
  font-size: 14px;
}
/* Tier tablosu */
.tt-tierhead {
  padding: 2px 16px 6px;
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: var(--gold-ornament);
}
.mod-tiers {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mod-tier {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.28);
  border-left: 2px solid rgba(136, 136, 255, 0.35);
}
.mod-tier:nth-child(odd) {
  background: rgba(0, 0, 0, 0.42);
}
.mod-tier-n {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--rarity-magic);
  font-weight: 600;
}
.mod-tier-val {
  color: var(--text-default);
  font-size: var(--fs-body);
}
.mod-tier-lvl {
  font-size: var(--fs-small);
  color: var(--text-muted);
  font-variant: small-caps;
  white-space: nowrap;
}
.gem-sub {
  font-size: var(--fs-small);
  color: var(--text-muted);
}
.empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
}

/* --- Sag: oyun-ici tooltip --- */
.detail-pane {
  min-height: 0;
  overflow-y: auto;
  padding: 4px 4px 6px 0;
}
/* Cift cerceve: dis koyu metal kenar + ic ince eskitilmis altin hat + bevel */
.tooltip {
  position: relative;
  /* Gercek oyun ornate cercevesi (ornate* 8 parca 9-slice); koseler net, kenarlar tile */
  border: 26px solid transparent;
  border-image: url(../assets/ui/frame-ornate.png) 68 repeat;
  background-color: #0a0e10;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.85));
}
.tt-inner {
  position: relative;
  overflow: hidden;
  /* Gercek panel dolgu dokusu (panelfiller.dds) tile + okunurluk overlay'i */
  background:
    linear-gradient(rgba(10, 16, 18, 0.55), rgba(6, 9, 10, 0.62)),
    url(../assets/ui/panel-filler.png) top center / 100% auto repeat-y;
}

/* Arka plan gem sanati: sagda, buyutulmus, soluk; sola dogru solar (metni acmaz) */
/* refs: art SAG UST kosede belirgin, sola/asagi fade — panele yayilmaz */
.tt-art {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 150px;
  height: 150px;
  object-fit: contain;
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: radial-gradient(
    circle at 72% 30%,
    #000 48%,
    rgba(0, 0, 0, 0.4) 70%,
    transparent 86%
  );
  mask-image: radial-gradient(
    circle at 72% 30%,
    #000 48%,
    rgba(0, 0, 0, 0.4) 70%,
    transparent 86%
  );
}

/* Ince altin kose susleri (oyun hissi) */
.tt-corner {
  position: absolute;
  width: 11px;
  height: 11px;
  z-index: 2;
  pointer-events: none;
  border: 0 solid var(--gold-line);
  opacity: 0.65;
  /* Gercek cerceve dokusu koseleri saglıyor; sahte CSS koseleri kapat */
  display: none;
}
.tt-corner--tl {
  top: 2px;
  left: 2px;
  border-top-width: 1px;
  border-left-width: 1px;
}
.tt-corner--tr {
  top: 2px;
  right: 2px;
  border-top-width: 1px;
  border-right-width: 1px;
}
.tt-corner--bl {
  bottom: 2px;
  left: 2px;
  border-bottom-width: 1px;
  border-left-width: 1px;
}
.tt-corner--br {
  bottom: 2px;
  right: 2px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

.tt-body {
  position: relative;
  z-index: 1;
  padding: 0 0 10px;
}

/* 1) Ust blok: SOLA yasli ikon + ad/tur, sagda soket halkalari */
.tt-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 6px;
  /* Gercek gem tooltip: agir band YOK; cok ince soluk alt cizgi */
  background: linear-gradient(rgba(18, 24, 26, 0.45), rgba(9, 13, 14, 0.4));
  border-bottom: 1px solid rgba(180, 150, 100, 0.16);
}
.tt-icon {
  display: block;
  flex: none;
}
.tt-icon img,
.tt-icon .gem-icon-ph {
  width: 40px;
  height: 40px;
}
.tt-headtext {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}
.tt-name {
  font-size: 20px;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--gem-teal);
  line-height: 1.05;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 10px rgba(122, 211, 197, 0.28);
}
.tt-subtype {
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: var(--gem-teal-dim);
}
/* Unique tooltip: ad + alt-tür turuncu-kahve (#AF6025) */
.tt-name--unique {
  color: var(--rarity-unique);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 9px rgba(175, 96, 37, 0.28);
}
.tt-subtype--unique {
  color: var(--rarity-unique);
}
/* Item (taban eşya) tooltip: normal nadirlik = beyaz/krem ad; metin ORTALI (refs) */
.tt-name--item {
  color: var(--rarity-normal);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}
.tt-subtype--item {
  color: var(--rarity-normal);
}
.tooltip--item .tt-head {
  justify-content: center;
  text-align: center;
}
.tooltip--item .tt-icon {
  display: none;
}
.tooltip--item .tt-headtext {
  flex: none;
  align-items: center;
}
.tooltip--item .tt-stats {
  align-items: center;
}
.tooltip--item .tt-stat {
  justify-content: center;
}
/* Item stat etiketi gem-teal degil, soluk tan (refs: gri/krem etiket : beyaz deger) */
.tooltip--item .tt-k {
  color: var(--rarity-currency);
}
/* Item implicit/explicit mod satirlari MAVI (refs: eklenmis/yukseltilmis = mavi) */
.tooltip--item .tt-mod,
.tooltip--item .tt-mod .stat-num {
  color: var(--tt-augmented);
}
.tooltip--item .tt-mods--dim .tt-mod,
.tooltip--item .tt-mods--dim .tt-mod .stat-num {
  color: #6a6ab0;
}
/* Mod/flavour henüz yokken küçük gri "yakında" notu */
.tt-soon {
  color: var(--text-muted);
  font-style: normal;
  font-size: var(--fs-body);
  text-align: center;
  padding: 8px 18px 0;
}
/* Sag ust bos halkalar KALDIRILDI — gercek gem tooltip'inde orada gem sanati var
   (tt-art arka planda gosteriyor). */
.tt-sockets {
  display: none;
}

/* Dekoratif ayrac: ince cizgi + ortada elmas */
/* Gercek ayrac dokusu (gemhoverdividergreenbig.dds) */
.tt-sep {
  display: block;
  height: 7px;
  margin: 6px 16px;
  /* Gercek PoE2 ayrac: INCE SOLUK altin cizgi (kenarlarda solar) + kucuk merkez elmasi */
  background:
    url(../assets/ui/divider-diamond.png) center / auto 7px no-repeat,
    linear-gradient(
        90deg,
        transparent,
        rgba(184, 154, 102, 0.22) 22%,
        rgba(184, 154, 102, 0.28) 50%,
        rgba(184, 154, 102, 0.22) 78%,
        transparent
      )
      center / 100% 1px no-repeat;
}
.tt-sep::before,
.tt-sep::after {
  content: none;
}
.tt-diamond {
  display: none;
}
.tt-sep--thin {
  margin: 6px 40px;
  opacity: 0.7;
}

/* 3) Etiketler: SOLA yasli, temiz, teal small-caps, noktali alt cizgi */
.tt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 1px 4px;
  padding: 5px 16px 1px;
}
.tt-trmark {
  font-size: 9.5px;
  color: #e0a44f;
  border: 1px solid rgba(224, 164, 79, 0.5);
  border-radius: 2px;
  padding: 0 4px;
  margin-left: 7px;
  vertical-align: middle;
  cursor: help;
  white-space: nowrap;
}
.tt-tag {
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.02em;
  /* refs (Snipe/Concentrated): tag'ler BEYAZ + ince alti cizili */
  color: #e6e2d6;
  border-bottom: 1px solid rgba(220, 214, 196, 0.4);
  line-height: 1.4;
}
.tt-tag:not(:last-child)::after {
  content: ',';
  margin-right: 3px;
  border: none;
  color: var(--text-muted);
}

/* Ince ayrac cizgisi (etiket ile statlar arasinda) — soluk, 1px, kenarlarda solar */
.tt-rule {
  border: none;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(184, 154, 102, 0.2) 18%,
    rgba(184, 154, 102, 0.26) 50%,
    rgba(184, 154, 102, 0.2) 82%,
    transparent
  );
  margin: 6px 16px;
}

/* 4) Stat satirlari: SOLA yasli — teal etiket : beyaz deger */
.tt-stats {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tt-stat {
  font-size: var(--fs-body);
  display: flex;
  gap: 7px;
}
.tt-k {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--gem-teal);
}
.tt-k::after {
  content: ':';
}
.tt-v {
  color: var(--stat-value);
}
/* Waypoint Var/Yok */
.tt-yes {
  color: var(--attr-dex);
}
.tt-no {
  color: var(--text-muted);
}
/* Görev (sarı, quest-item tonu) + Ödül (altın) */
.tt-questrow {
  padding: 0 16px;
}
.tt-quest {
  color: var(--rarity-rare);
}
.tt-reward {
  color: var(--gold-title);
}
/* Adımlar: numaralı, oyun-içi krem metin, kısa satır aralığı */
.tt-steps {
  margin: 2px 0 2px;
  padding: 0 16px 2px 30px;
  list-style: decimal;
  color: var(--text-default);
}
.tt-steps li {
  font-size: var(--fs-body);
  line-height: 1.42;
  margin-bottom: 3px;
}
.tt-steps li::marker {
  color: var(--gold-ornament);
}
/* NPC etiketi: altın ton (satıcı/karakter) */
.tt-tag--npc {
  color: var(--gold-title);
  border-bottom-color: rgba(231, 180, 120, 0.4);
}
/* Bölge görseli banner (loading screen) - üstte, altın çerçeveli */
.area-banner {
  margin: 2px 10px 0;
  border: var(--border-width) solid var(--gold-line);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  background: var(--bg-black);
}
.area-banner img {
  display: block;
  width: 100%;
  height: 116px;
  object-fit: cover;
  object-position: center 38%;
}
/* --- Mekanikler kartı --- */
.tt-mech-para {
  margin: 4px 10px;
  line-height: 1.5;
}
.tt-mech-parts {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 4px 10px 2px;
}
.tt-mech-part {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 9px;
  border-left: 2px solid var(--gold-line);
}
.tt-mech-part-name {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  color: var(--gold-title);
  font-size: var(--fs-small);
}
.tt-mech-part-desc {
  color: var(--text-muted);
  line-height: 1.45;
  font-size: var(--fs-small);
}
.tt-mech-source {
  margin: 10px 10px 2px;
  font-size: 10px;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: var(--text-faint, var(--text-muted));
  opacity: 0.7;
  text-align: right;
}
/* Crafting: ilgili materyaller (Currency'ye bağlı ikon+ad çipleri) */
.tt-mats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin: 4px 10px 2px;
}
.tt-mat {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-left: 8px;
  border-left: 2px solid var(--gold-line);
}
.tt-mat-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tt-mat-icon img {
  max-width: 100%;
  max-height: 100%;
}
.tt-mat-name {
  color: var(--text-muted);
  font-size: var(--fs-small);
}
.tt-mat-inline {
  width: 16px;
  height: 16px;
  vertical-align: -3px;
  margin-right: 5px;
}
/* İSKELET (doğrulama bekliyor) uyarı şeridi */
.tt-pending {
  margin: 6px 10px 2px;
  padding: 5px 9px;
  border-left: 2px solid var(--gold-title, #c8a24a);
  background: rgba(200, 162, 74, 0.08);
  color: var(--gold-title, #c8a24a);
  font-size: var(--fs-small);
  font-variant: small-caps;
  letter-spacing: 0.04em;
}
/* Boss satırı: küçük dairesel madalyon + ad */
.tt-bossrow,
.tt-questrow {
  align-items: flex-start;
}
.tt-bossval,
.tt-rewardval {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tt-bossimgs,
.tt-rewardimgs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.tt-bossimg {
  width: 34px;
  height: 34px;
  object-fit: contain;
  border: var(--border-width) solid var(--gold-line);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 35%, #2a2417, #0d0d0d);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
/* Ödül/quest ikonu: kare, hafif çerçeveli */
.tt-rewardimg {
  width: 26px;
  height: 26px;
  object-fit: contain;
  border: var(--border-width) solid var(--frame-brown);
  background: rgba(0, 0, 0, 0.35);
}
/* --- Ascendancy --- */
.asc-group-head {
  display: flex;
  align-items: center;
  gap: 7px;
}
.asc-group-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border: var(--border-width) solid var(--gold-line);
  border-radius: 50%;
  background: var(--bg-black);
}
.asc-group-attr {
  margin-left: auto;
  font-size: var(--fs-small);
  color: var(--text-muted);
  font-variant: small-caps;
}
/* Tooltip başlık ikonu (yükseliş emblemi): dairesel altın çerçeve */
.tt-icon--asc {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: var(--border-width) solid var(--gold-line);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 35%, #2a2417, #0d0d0d);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}
.tt-icon--asc img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.asc-flavor {
  white-space: pre-line;
}
/* Yükseliş pasif (node) listesi */
.asc-nodes {
  list-style: none;
  margin: 2px 0 2px;
  padding: 0 16px 2px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.asc-node {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-left: 2px solid var(--frame-brown);
  padding-left: 8px;
}
.asc-node--notable {
  border-left-color: var(--gold-line);
}
.asc-node-name {
  font-size: var(--fs-body);
  color: var(--rarity-gem);
  font-variant: small-caps;
  letter-spacing: 0.02em;
}
.asc-node--notable .asc-node-name {
  color: var(--gold-title);
}
.asc-node-stat {
  font-size: var(--fs-small);
  line-height: 1.4;
  color: var(--text-default);
  white-space: pre-line;
}

/* --- Passives --- */
/* Virtual scroll satırı: SABİT yükseklik (48px) sanal pencere hesabı için */
.passive-row {
  height: 48px;
  box-sizing: border-box;
  background: url(../assets/ui/row-separator.png) bottom center / 100% 2px no-repeat;
}
.passive-row--keystone {
  border-left-color: var(--gold-line);
  background:
    linear-gradient(90deg, rgba(231, 180, 120, 0.08), transparent 60%),
    url(../assets/ui/row-separator.png) bottom center / 100% 2px no-repeat;
}
.pn-keystone {
  color: var(--gold-title) !important;
}
/* node_type placeholder/ikon tonları */
.gem-icon-ph.pn--keystone .facet { background: var(--gold-title); }
.gem-icon-ph.pn--notable .facet { background: var(--rarity-gem); }
.gem-icon-ph.pn--small .facet { background: var(--text-muted); }
.gem-icon-ph.pn--jewel_socket .facet { background: var(--rarity-magic); }
/* Tooltip ikon kutusu (node) */
.tt-icon--passive {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: var(--border-width) solid var(--frame-brown);
  background: radial-gradient(circle at 50% 35%, #22201a, #0d0d0d);
}
.tt-icon--passive.pn--keystone { border-color: var(--gold-line); }
.tt-icon--passive img { width: 100%; height: 100%; object-fit: contain; }
.tt-icon--passive .facet {
  width: 18px; height: 18px; transform: rotate(45deg);
  background: var(--text-muted); opacity: 0.5;
}
.tt-name--keystone {
  color: var(--gold-title);
  text-shadow: 0 0 8px rgba(231, 180, 120, 0.35);
}
/* Stat satırları */
.passive-stats { gap: 5px; }
.passive-stat-line {
  font-size: var(--fs-body);
  line-height: 1.4;
  color: var(--text-default);
  border-left: 2px solid var(--frame-brown);
  padding-left: 8px;
  white-space: pre-line;
}

/* 5) Aciklama: tam genislik, ORTALI italik serif */
.tt-desc {
  padding: 0 18px;
}
.tt-flavor {
  margin: 0 0 2px;
  font-size: var(--fs-body);
  font-style: normal;
  line-height: 1.5;
  text-align: center;
  color: var(--tt-flavor);
}
.tt-flavor--dim {
  color: var(--text-muted);
}

/* 6) Mod/stat satirlari: ORTALI dik small-caps, hafif koyu bantlar, beyaz sayilar */
.tt-mods {
  margin-top: 7px;
}
.tt-mod {
  margin: 0;
  padding: 2px 10px;
  font-size: var(--fs-body);
  font-variant: small-caps;
  letter-spacing: 0.02em;
  line-height: 1.4;
  text-align: center;
  color: var(--text-default);
  /* Gercek PoE2: mod satirlarinda agir band YOK — sade ortali metin */
  background: none;
}
.tt-mods--dim .tt-mod {
  color: var(--text-muted);
}

/* Görünür kaynak/atıf satırı (Maxroll campaign guide) — küçük, okunur, gold link */
.tt-source {
  margin: 10px 16px 2px;
  padding-top: 7px;
  border-top: 1px solid rgba(184, 154, 102, 0.18);
  font-size: 11px;
  font-style: normal;
  color: var(--text-muted);
  text-align: center;
}
.tt-source a {
  color: var(--gold-ornament);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.tt-source a:hover {
  color: var(--gold-title);
}

/* Anahtar kelime alti-cizimi (refs: Freeze/Mark/Cold/Dex/Skills... alti cizili,
   metin rengini korur) — glossary terimleri markupLine ile otomatik isaretlenir */
.tt-kw {
  text-decoration: underline;
  text-decoration-color: rgba(220, 214, 196, 0.45);
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
/* Stat degerleri PoE'deki gibi parlak beyaz */
.stat-num {
  color: var(--stat-value);
  font-style: normal;
  font-weight: 500;
}
/* Augmented (yukseltilmis/eklenmis: '+X' veya disardan-gelen) degerler MAVI (refs) */
.tt-aug {
  color: var(--tt-augmented);
  font-style: normal;
  font-weight: 500;
}
.tt-flavor--dim .stat-num,
.tt-mods--dim .stat-num {
  color: #b8b2a2;
}
.tt-flavor--dim .tt-aug,
.tt-mods--dim .tt-aug {
  color: #6a6ab0;
}
.tt-nodesc {
  color: var(--text-muted);
  font-style: normal;
  font-size: var(--fs-body);
  text-align: center;
  padding: 8px 18px 0;
}

/* --- Bos durum --- */
.detail-hint {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.hint-title {
  font-size: var(--fs-subtitle);
  font-variant: small-caps;
  letter-spacing: var(--tracking-title);
  color: var(--gold-ornament);
  margin: 0 0 8px;
}
.hint-text {
  color: var(--text-muted);
  margin: 0;
  max-width: 320px;
}

/* --- Gercek oyun scrollbar dokulari (scrollbartrack + thumb 3-slice + oklar) --- */
::-webkit-scrollbar {
  width: 17px;
  height: 17px;
}
::-webkit-scrollbar-track {
  background: url(../assets/ui/sb-track.png) center top / 100% auto repeat-y;
}
::-webkit-scrollbar-thumb {
  border-style: solid;
  border-width: 18px 0;
  border-image: url(../assets/ui/sb-thumb.png) 36 0 fill repeat;
  min-height: 40px;
}
::-webkit-scrollbar-button:vertical:decrement {
  height: 17px;
  background: url(../assets/ui/sb-up.png) center / 100% 100% no-repeat;
}
::-webkit-scrollbar-button:vertical:increment {
  height: 17px;
  background: url(../assets/ui/sb-down.png) center / 100% 100% no-repeat;
}
::-webkit-scrollbar-button:horizontal {
  width: 0;
}
::-webkit-scrollbar-corner {
  background: #0a0c0d;
}
</style>
