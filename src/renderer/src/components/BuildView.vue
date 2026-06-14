<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { importPob } from '../lib/pob'
import { matchBuild, niceNodeName, type MatchedBuild, type MatchedItem } from '../lib/pob-match'
import { maxrollToPob } from '../lib/pob-maxroll'
import { mobalyticsToPob } from '../lib/pob-mobalytics'
import { buildItemRegex } from '../lib/pob-regex'
import { buildQuestSuggestion, stageIndexForLevel, type UncutReward } from '../lib/pob-quest'
import {
  selectedSlot,
  currentBuild,
  trackedBuild,
  trackedStage,
  trackedMeta,
  commitBuild,
  setStage,
  pinStage,
  stagePinned,
  ensureBuild,
  requestCraft,
  clearBuild as clearBuildStore,
  type BuildMeta,
  type ImportedFrom
} from '../lib/build-target'
import { exportBuild, buildFileName, type ExportReport } from '../lib/build-export'
import { importDotBuild, type ImportReport } from '../lib/build-import'
import { generateFilter, THEMES, DEFAULT_THEME, validateFilter, type Strictness, type FilterAnalysis } from '../lib/filter-gen'
import GameBuildView from './GameBuildView.vue'
import { pobItemToQueryItem, buildItemTradeQuery } from '../lib/build-compare'
import { buildEmblemUrl, deriveAscendancyName } from '../lib/ascendancy-icon'
import { openItemInTrade, ensureStats } from '../lib/price-check'
import PassiveTreeCanvas from './PassiveTreeCanvas.vue'
import passivesData from '../../../data/passives.json'

// passives.json -> id eşlemesi (ağaç tooltip'i için)
interface PassiveLite {
  id: string
  en: string
  tr: string
  node_type: string
  stats_en: string[]
  stats_tr: string[]
  count: number
}
const passivesRaw = ((passivesData as { records?: PassiveLite[] }).records ?? (passivesData as PassiveLite[]))
const passivesById: Record<string, PassiveLite> = {}
for (const p of passivesRaw) passivesById[p.id] = p

const props = defineProps<{ isTr: boolean }>()
const emit = defineEmits<{ (e: 'craft'): void }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

const code = ref('')
const error = ref('')
const build = ref<MatchedBuild | null>(null)
const buildInfo = ref<{ className: string; ascendClassName: string; level: number } | null>(null)
// #2: ascendancy/sınıf adından DOĞRU emblem (veri-tabanlı eşleme; yoksa null → gösterilmez).
// ascendClassName boşsa (Mobalytics) tahsis edilen ağaç node'larından ascendancy'yi türet.
const buildEmblem = computed(() => {
  if (!buildInfo.value) return null
  let asc = buildInfo.value.ascendClassName
  if (!asc) {
    const raw = trackedBuild.value
    if (raw) {
      const all = new Set<number>()
      for (const s of raw.specs ?? []) for (const n of s.nodes ?? []) all.add(n)
      asc = deriveAscendancyName([...all], buildInfo.value.className) || ''
    }
  }
  return buildEmblemUrl(buildInfo.value.className, asc)
})
// Bug #1: aşama (variant) PAYLAŞILAN + KALICI store'dan — sekme/oturum/restart korunur.
const stageIdx = trackedStage
const viewMode = ref<'list' | 'game'>('game') // Faz 3: oyun-içi tarzı görünüm varsayılan
const selectedItemId = ref<string | null>(null)
// Sorun #3: ikincil bölümleri (içe aktarma kutusu + Yazar Notları) küçültülebilir yap; build yüklenince
// VARSAYILAN KAPALI → 3 ana bölüm (Ekipman/Gem/Ağaç) öne çıksın. Durum kalıcı (localStorage).
const LS_BLD_SEC = 'bld-secopen-v1'
function loadBldSec(): { import: boolean; notes: boolean } {
  try {
    const r = JSON.parse(localStorage.getItem(LS_BLD_SEC) || 'null')
    if (r && typeof r === 'object') return { import: !!r.import, notes: !!r.notes }
  } catch {
    /* yok say */
  }
  return { import: false, notes: false }
}
const secOpen = ref(loadBldSec())
function toggleBldSec(k: 'import' | 'notes'): void {
  secOpen.value = { ...secOpen.value, [k]: !secOpen.value[k] }
  try {
    localStorage.setItem(LS_BLD_SEC, JSON.stringify(secOpen.value))
  } catch {
    /* yok say */
  }
}
// Leveling tracker'dan gelen karakter seviyesi → aşamayı otomatik seçer
const curLevel = ref<number | null>(null)
let unsub: (() => void) | null = null
let unsubLv: (() => void) | null = null

// gem ikon çözümleme
const gemIcons = import.meta.glob('../../assets/gems/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const gemMap: Record<string, string> = {}
for (const p in gemIcons) gemMap[(p.split('/').pop() as string)] = gemIcons[p]
// item ikon çözümleme
const itemIcons = import.meta.glob('../../assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const itemMap: Record<string, string> = {}
for (const p in itemIcons) itemMap[(p.split('/').pop() as string)] = itemIcons[p]
function iconUrl(map: Record<string, string>, rel: string | null): string | null {
  if (!rel) return null
  return map[(rel.split('/').pop() as string)] ?? null
}

// --- Maxroll / Mobalytics build linki algılama (Faz 1: rehberli fallback) ---
// Bu siteler hazır PoB kodu vermez; kullanıcı "Export to PoB" ile kodu kopyalayıp yapıştırır.
interface DetectedSite {
  site: 'maxroll' | 'mobalytics'
  url: string
}
function detectSite(text: string): DetectedSite | null {
  const m = text.match(/https?:\/\/[^\s'"]+/i)
  if (!m) return null
  const url = m[0]
  if (/(\/\/|\.)maxroll\.gg\b/i.test(url) && /\/poe-?2(\/|$|\?)/i.test(url)) return { site: 'maxroll', url }
  if (/(\/\/|\.)mobalytics\.gg\b/i.test(url) && /poe-?2/i.test(url)) return { site: 'mobalytics', url }
  return null
}
const detected = computed<DetectedSite | null>(() => detectSite(code.value))
function siteLabel(s: DetectedSite['site']): string {
  return s === 'maxroll' ? 'Maxroll' : 'Mobalytics'
}
// sitenin PoB-export butonunun adı (rehber metni için)
function exportBtnName(s: DetectedSite['site']): string {
  return s === 'maxroll'
    ? tr('“Export to Path of Building” / “PoB2 Export”', '“Export to Path of Building” / “PoB2 Export”')
    : tr('kenar çubuğunda “Build Planner Export” / PoB export', 'sidebar “Build Planner Export” / PoB export')
}
function openLink(url: string): void {
  window.open(url, '_blank') // main: setWindowOpenHandler → harici tarayıcı
}

// --- Faz 2: Mobalytics oto-çekim (main-process; CORS/bot için) ---
// Mobalytics sayfası HAZIR PoB kodunu gömer → çek + mevcut importPob hattına ver.
// HER hatada Faz 1 rehberine düşülür (çökme yok). Ağ istisnası: yalnız build URL'si gider.
const fetchState = ref<'idle' | 'loading' | 'error'>('idle')
const fetchErrorCode = ref('')
const importedFrom = ref<'maxroll' | 'mobalytics' | 'dotbuild' | null>(null) // reconstruction başarısı (URL kutuda kalır)
let lastFetchedUrl = ''
// --- Faz 4: yazar notları + LLM TR çeviri ---
const notes = ref('') // yazarın orijinal yazısı (genelde EN)
const notesTr = ref('') // LLM çevirisi (TR)
const showTr = ref(false) // EN/TR geçişi
const authorName = ref('')
const authorUrl = ref('')
const sourceUrl = ref('')
const sourceSite = ref('')
const transState = ref<'idle' | 'loading' | 'error'>('idle')
const transError = ref('')
const llmOn = ref(false)
const hasKey = ref(false)
const displayNotes = computed(() => (showTr.value && notesTr.value ? notesTr.value : notes.value))
function captureMeta(res: { notes?: string; author?: { name?: string; url?: string }; sourceUrl?: string; site?: string }): void {
  notes.value = res.notes || ''
  notesTr.value = ''
  showTr.value = false
  transCached.value = false
  transState.value = 'idle'
  transError.value = ''
  authorName.value = res.author?.name || ''
  authorUrl.value = res.author?.url || ''
  sourceUrl.value = res.sourceUrl || ''
  sourceSite.value = res.site || ''
}
const transCached = ref(false) // çeviri cache'ten mi geldi (Faz 5 gösterimi)
async function translateNotes(auto = false): Promise<void> {
  if (!notes.value || !window.api?.build?.translateNotes) return
  if (notesTr.value) {
    showTr.value = true
    return
  }
  transState.value = 'loading'
  transError.value = ''
  const res = await window.api.build.translateNotes(notes.value).catch(() => null)
  if (res && res.ok && res.text) {
    notesTr.value = res.text
    transCached.value = !!res.cached
    showTr.value = true // çeviri hazır → TR göster ("her zaman" isteği)
    transState.value = 'idle'
  } else {
    // otomatik denemede anahtar yok → sessiz fallback (orijinal EN + ipucu); manuelde hata kartı
    transState.value = auto && res?.error === 'no_key' ? 'idle' : 'error'
    transError.value = (res && res.error) || 'network'
  }
}
// build açılınca + TR modunda + LLM anahtarı varsa OTOMATİK çevir (cache varsa LLM çağrısı YOK)
async function maybeAutoTranslate(): Promise<void> {
  if (props.isTr && llmOn.value && hasKey.value && notes.value && !notesTr.value) await translateNotes(true)
}
// build/dil/anahtar değişince otomatik çeviriyi tetikle
watch([() => props.isTr, llmOn, hasKey, notes], () => void maybeAutoTranslate())
const transErrorMsg = computed<string>(() => {
  if (transError.value === 'no_key') return tr('anahtar yok — Ayarlar’dan ekle', 'no key — add one in Settings')
  if ((transError.value || '').startsWith('http_')) return tr('LLM hatası', 'LLM error')
  return tr('çeviri başarısız (ağ)', 'translation failed (network)')
})
async function autoFetch(url: string): Promise<void> {
  if (!window.api?.build?.fetchUrl) {
    fetchState.value = 'error'
    fetchErrorCode.value = 'no_api'
    return
  }
  fetchState.value = 'loading'
  fetchErrorCode.value = ''
  captureMeta({}) // eski yazar notları/atıf kalmasın (başarıda yeniden dolar)
  const res = (await window.api.build.fetchUrl(url).catch(() => ({ ok: false, error: 'network' }))) as {
    ok: boolean
    kind?: string
    code?: string
    data?: unknown
    meta?: unknown
    notes?: string
    author?: { name?: string; url?: string }
    sourceUrl?: string
    site?: string
    error?: string
  }
  // URL bu sırada değiştiyse (kullanıcı yeni şey yapıştırdı) yanıtı yok say
  if (detected.value?.url !== url) return
  if (res && res.ok) captureMeta(res)
  if (res && res.ok && res.kind === 'pobcode' && res.code) {
    // Mobalytics: hazır PoB kodu → mevcut importPob hattı
    fetchState.value = 'idle'
    code.value = res.code // artık PoB kodu → detected null olur, doImport parse eder
    doImport()
  } else if (res && res.ok && (res.kind === 'maxroll' || res.kind === 'mobalytics') && res.data) {
    // Maxroll / Mobalytics (yapısal): reconstruction → matchBuild.
    // (session; kalıcılık/overlay gerçek-kod yolu içindir — Mobalytics editorial build'ler pobCode verir.)
    try {
      const pob =
        res.kind === 'maxroll'
          ? maxrollToPob(res.data as Parameters<typeof maxrollToPob>[0], (res.meta ?? {}) as Parameters<typeof maxrollToPob>[1])
          : mobalyticsToPob(res.data as Parameters<typeof mobalyticsToPob>[0], (res.meta ?? {}) as Parameters<typeof mobalyticsToPob>[1])
      build.value = matchBuild(pob)
      buildInfo.value = { className: pob.className, ascendClassName: pob.ascendClassName, level: pob.level }
      stageIdx.value = 0
      selectedItemId.value = build.value.items[0]?.id ?? null
      syncStageToLevel()
      fetchState.value = 'idle'
      importedFrom.value = res.kind // başarı → rehber kartını gizle
      // Bug #1: reconstruction'ın PoB KODU yok → snapshot olarak kalıcı kaydet (restart sonrası da kalır)
      commitBuild(pob, metaFromRefs(res.kind as ImportedFrom, ''), stageIdx.value)
    } catch {
      fetchState.value = 'error'
      fetchErrorCode.value = 'reconstruct'
    }
  } else {
    fetchState.value = 'error'
    fetchErrorCode.value = (res && res.error) || 'network'
  }
}
function retryFetch(): void {
  if (detected.value) {
    lastFetchedUrl = detected.value.url
    autoFetch(detected.value.url)
  }
}
const fetchErrorMsg = computed<string>(() => {
  switch (fetchErrorCode.value) {
    case 'http_403':
    case 'http_429':
      return tr('site otomatik erişimi engelledi', 'site blocked automated access')
    case 'no_pobcode':
      return tr('sayfada PoB kodu bulunamadı (site yapısı değişmiş olabilir)', 'no PoB code found on the page (site structure may have changed)')
    case 'no_data':
      return tr('bu build’de PoB kodu veya yapısal veri yok', 'this build has no PoB code or structural data')
    case 'no_planner_link':
      return tr('guide içinde planner linki bulunamadı', 'no planner link found in the guide')
    case 'no_remix':
    case 'no_profile':
    case 'parse':
    case 'reconstruct':
      return tr('build verisi okunamadı (site yapısı değişmiş olabilir)', 'could not read build data (site structure may have changed)')
    case 'timeout':
      return tr('zaman aşımı', 'timed out')
    case 'unsupported':
      return tr('bu site için oto-çekim henüz yok', 'auto-fetch not available for this site yet')
    case 'no_api':
      return tr('ağ erişimi yok', 'no network access')
    default:
      return tr('ağ hatası', 'network error')
  }
})
// LLM ayarını yükle (TR çeviri butonu görünürlüğü) + değişimi izle
onMounted(async () => {
  const s = (await window.api?.settings?.get()) as { advisor?: { mode: 'offline' | 'llm'; hasKey: boolean } } | undefined
  if (s?.advisor) {
    llmOn.value = s.advisor.mode === 'llm'
    hasKey.value = s.advisor.hasKey
  }
  window.api?.settings?.onChanged((st) => {
    const a = (st as { advisor?: { mode: 'offline' | 'llm'; hasKey: boolean } }).advisor
    if (a) {
      llmOn.value = a.mode === 'llm'
      hasKey.value = a.hasKey
    }
  })
})
// Mobalytics/Maxroll URL algılanınca bir kez otomatik çek (Faz 2-3)
watch(detected, (d) => {
  fetchState.value = 'idle'
  fetchErrorCode.value = ''
  importedFrom.value = null
  if (d && d.url !== lastFetchedUrl) {
    lastFetchedUrl = d.url
    autoFetch(d.url)
  }
})

// Mevcut yerel ref'lerden kalıcı BuildMeta üret (commitBuild için).
function metaFromRefs(from: ImportedFrom, codeStr: string): BuildMeta {
  return {
    importedFrom: from,
    code: codeStr,
    info: buildInfo.value,
    notes: notes.value,
    authorName: authorName.value,
    authorUrl: authorUrl.value,
    sourceUrl: sourceUrl.value,
    sourceSite: sourceSite.value
  }
}
// Kalıcı/paylaşılan store'daki build'i yerel görünüme geri yükle (mount'ta — AĞ/parse YOK).
function restoreFromStore(): void {
  const raw = trackedBuild.value
  if (!raw) return
  build.value = matchBuild(raw)
  const m = trackedMeta.value
  buildInfo.value = m.info ?? { className: raw.className, ascendClassName: raw.ascendClassName, level: raw.level }
  importedFrom.value = m.importedFrom === 'pob' ? null : m.importedFrom
  code.value = m.code || ''
  lastFetchedUrl = '' // restore edilen kod/URL için yeniden oto-çekim tetiklenmesin
  notes.value = m.notes || ''
  notesTr.value = ''
  showTr.value = false
  authorName.value = m.authorName || ''
  authorUrl.value = m.authorUrl || ''
  sourceUrl.value = m.sourceUrl || ''
  sourceSite.value = m.sourceSite || ''
  selectedItemId.value = build.value.items.find((i) => i.id === selectedItemId.value)
    ? selectedItemId.value
    : build.value.items[0]?.id ?? null
}

function doImport(): void {
  error.value = ''
  const c = code.value.trim()
  if (!c) {
    error.value = tr('Önce bir PoB2 kodu, Mobalytics/Maxroll linki yapıştır ya da .build dosyası seç.', 'Paste a PoB2 code, a Mobalytics/Maxroll link, or pick a .build file first.')
    return
  }
  // Build linki yapıştırıldıysa parse etme — rehber kartı zaten gösteriliyor
  if (detected.value) {
    error.value = tr(
      'Bu bir build linki — sitede PoB kodunu kopyalayıp buraya yapıştır (aşağıdaki rehber).',
      'This is a build link — copy the PoB code on the site and paste it here (guide below).'
    )
    return
  }
  try {
    const parsed = importPob(c)
    build.value = matchBuild(parsed)
    importedFrom.value = null
    captureMeta({ notes: parsed.notes }) // PoB Notes bölümü (varsa) → otomatik TR çeviri (Faz 5)
    buildInfo.value = {
      className: parsed.className,
      ascendClassName: parsed.ascendClassName,
      level: parsed.level
    }
    stageIdx.value = 0
    selectedItemId.value = build.value.items[0]?.id ?? null
    syncStageToLevel() // mevcut seviyeye uygun aşamayı seç
    commitBuild(parsed, metaFromRefs('pob', c), stageIdx.value) // Bug #1: kalıcı + paylaşılan
  } catch (e) {
    build.value = null
    buildInfo.value = null
    error.value = tr('Kod okunamadı: ', 'Could not read code: ') + (e as Error).message
  }
}
function clearBuild(): void {
  code.value = ''
  build.value = null
  buildInfo.value = null
  error.value = ''
  importedFrom.value = null
  fetchState.value = 'idle'
  lastFetchedUrl = ''
  notes.value = ''
  notesTr.value = ''
  showTr.value = false
  dotBuildReport.value = null
  clearBuildStore() // Bug #1: bellek + kalıcı snapshot temizle
}

// --- .build dosyası içe aktarma (dosya seç / sürükle-bırak) ---
// PoB kodu / Mobalytics / Maxroll ile AYNI build görünümüne yükler. Yalnız yerel dosya okuma (ToS uyumlu).
const dragOver = ref(false)
const dotBuildReport = ref<ImportReport | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
function loadDotBuild(text: string): void {
  error.value = ''
  try {
    const { build: pob, report } = importDotBuild(text)
    build.value = matchBuild(pob)
    captureMeta({ notes: pob.notes }) // .build description → not (varsa)
    buildInfo.value = { className: pob.className, ascendClassName: pob.ascendClassName, level: pob.level }
    stageIdx.value = 0
    selectedItemId.value = build.value.items[0]?.id ?? null
    syncStageToLevel()
    dotBuildReport.value = report
    importedFrom.value = 'dotbuild'
    code.value = '' // .build kutuya yapıştırılmaz; rehber/oto-çekim tetiklenmesin
    commitBuild(pob, metaFromRefs('dotbuild', ''), stageIdx.value) // Bug #1: kalıcı snapshot
  } catch (e) {
    build.value = null
    buildInfo.value = null
    dotBuildReport.value = null
    error.value = tr('.build okunamadı: ', 'Could not read .build: ') + (e as Error).message
  }
}
async function onFilePicked(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  loadDotBuild(await f.text())
  ;(e.target as HTMLInputElement).value = '' // aynı dosya tekrar seçilebilsin
}
async function onDropBuild(e: DragEvent): Promise<void> {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  if (!/\.build$/i.test(f.name)) {
    error.value = tr('Lütfen bir .build dosyası bırak.', 'Please drop a .build file.')
    return
  }
  loadDotBuild(await f.text())
}
function pickFile(): void {
  fileInput.value?.click()
}

// Seçili aşamayı mevcut karakter seviyesine göre ayarla (otomatik takip)
function syncStageToLevel(): void {
  if (!build.value || curLevel.value == null) return
  // #6: kullanıcı bir variant'ı ELLE seçtiyse otomatik seviye takibi seçimi EZMEZ
  // (sekme değişimi / bölge-seviye değişimi sonrası seçili variant korunur).
  if (stagePinned.value) return
  const titles = build.value.skillSets.map((s) => s.title)
  stageIdx.value = stageIndexForLevel(titles, curLevel.value)
}

onMounted(async () => {
  // Bug #1: kalıcı/paylaşılan store'dan geri yükle (sekme değişimi / oturum / restart).
  // Bellekte build varsa AĞ/parse yapmadan görünüme bas; yoksa userData snapshot'ından yükle.
  await ensureBuild()
  if (trackedBuild.value) restoreFromStore()
  // Başka pencerede (oyun-içi) kod değişince yansıt (reconstruction'da '' → atlanır, ensureBuild yönetir)
  unsub = window.api?.build.onChanged((c) => {
    if (c && c !== code.value) {
      code.value = c
      doImport()
    }
  }) ?? null
  // Leveling state: karakter seviyesini izle, aşamayı otomatik takip et
  const lv = window.api?.leveling
  if (lv) {
    const st = await lv.get()
    curLevel.value = st?.level ?? null
    // restore sonrası seçili variant'ı EZME; yalnız build varsa ve store boşsa senkronla
    if (curLevel.value != null && !trackedBuild.value) syncStageToLevel()
    unsubLv = lv.onState((s) => {
      curLevel.value = s?.level ?? null
    })
  }
})
// Kullanıcı aşamayı (variant) değiştirince kalıcı yaz (restart sonrası da korunur).
watch(stageIdx, () => {
  if (build.value) setStage(stageIdx.value)
})
// seviye değişince (bölge değişimi) aşamayı yeniden senkronla
watch(curLevel, () => syncStageToLevel())
onBeforeUnmount(() => {
  unsub?.()
  unsubLv?.()
  if (copyTimer) clearTimeout(copyTimer)
})

const stages = computed(() => build.value?.skillSets ?? [])
const stage = computed(() => stages.value[stageIdx.value] ?? null)
// aşamanın gem'leri (aktif/support ayrı)
const activeGems = computed(() => stage.value?.gems.filter((g) => !g.support && g.nameSpec) ?? [])
const supportGems = computed(() => stage.value?.gems.filter((g) => g.support && g.nameSpec) ?? [])
// aynı başlıklı spec'in node özeti
const stageSpec = computed(() => {
  if (!build.value || !stage.value) return null
  return build.value.specs.find((s) => s.title === stage.value!.title) ?? build.value.specs[stageIdx.value] ?? null
})
const notableNodes = computed<string[]>(() => {
  const out: string[] = []
  for (const n of stageSpec.value?.nodes ?? []) {
    if (!n.notable || !n.matched) continue
    const nm = niceNodeName(n.name)
    if (nm && !out.includes(nm)) out.push(nm)
  }
  return out
})
// seçili aşamanın ağaçta vurgulanacak GGG node id'leri (eşleşenler)
const stageNodeIds = computed<number[]>(
  () => stageSpec.value?.nodes.filter((n) => n.matched).map((n) => n.id) ?? []
)
const showTree = ref(false)

// --- Quest uncut-gem önerisi (seçili aşamaya göre) ---
const quest = computed(() => (stage.value ? buildQuestSuggestion(stage.value) : null))
// uncut ödül bölge adlarını derle (en fazla 2 + kalanı say)
function areaNames(areas: UncutReward[]): string {
  const names = areas.map((a) => (props.isTr && a.tr ? a.tr : a.en))
  if (names.length <= 2) return names.join(' / ')
  return names.slice(0, 2).join(' / ') + ' +' + (names.length - 2)
}
function skillLabel(s: { en: string; tr: string | null }): string {
  return props.isTr && s.tr ? s.tr : s.en
}

const items = computed(() => build.value?.items ?? [])
// #7: Liste görünümü — eşyaları kanonik slot sırasına diz (okunur "slot → eşya" listesi).
const SLOT_ORDER = [
  'Weapon 1', 'Weapon 2', 'Weapon 1 Swap', 'Weapon 2 Swap', 'Helmet', 'Body Armour',
  'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Ring 3', 'Belt'
]
function slotRank(slot: string | null | undefined): number {
  if (!slot) return 999
  const i = SLOT_ORDER.indexOf(slot)
  if (i >= 0) return i
  if (/flask/i.test(slot)) return 100
  if (/charm/i.test(slot)) return 110
  if (/jewel/i.test(slot)) return 120
  return 200
}
// slot için okunur kısa etiket (TR), özel ad değil
function slotLabel(slot: string | null | undefined): string {
  if (!slot) return props.isTr ? 'Diğer' : 'Other'
  if (/weapon 1 swap/i.test(slot)) return props.isTr ? 'Silah (Set 2)' : 'Weapon (Set 2)'
  if (/weapon 2 swap/i.test(slot)) return props.isTr ? 'Yan El (Set 2)' : 'Offhand (Set 2)'
  if (/weapon 1/i.test(slot)) return props.isTr ? 'Silah' : 'Weapon'
  if (/weapon 2/i.test(slot)) return props.isTr ? 'Yan El' : 'Offhand'
  return slot
}
// Aktif aşamanın gear'ı (stageSlots[stageIdx] ya da tek `slots`) → slot ANAHTARINDAN doğru etiket;
// variant'lar karışmaz (oyun görünümüyle aynı kaynak). Slota oturmayan eşyalar sonda "Diğer".
const listItems = computed<Array<{ slot: string | null; item: MatchedItem }>>(() => {
  const b = build.value
  if (!b) return []
  const raw = trackedBuild.value
  const slots = (raw?.stageSlots?.[stageIdx.value] ?? raw?.slots ?? {}) as Record<string, string>
  const byId = new Map(b.items.map((i) => [i.id, i]))
  const out: Array<{ slot: string | null; item: MatchedItem }> = []
  const seen = new Set<string>()
  for (const [slotKey, id] of Object.entries(slots).sort((a, c) => slotRank(a[0]) - slotRank(c[0]))) {
    const it = byId.get(id)
    if (!it || seen.has(id)) continue
    seen.add(id)
    out.push({ slot: slotKey, item: it })
  }
  // Tek-set build'de (stageSlots yok) slota oturmayan kalan eşyaları ekle. Çok-variant'ta (stageSlots
  // var) EKLEME — aksi halde diğer variant'ların eşyaları listeyi kirletir.
  if (!raw?.stageSlots) for (const it of b.items) if (!seen.has(it.id)) out.push({ slot: it.slot, item: it })
  return out
})
const selItem = computed<MatchedItem | null>(
  () => items.value.find((i) => i.id === selectedItemId.value) ?? null
)
// Eşyaya tıklayınca seç + (slot varsa) Craft/Overlay karşılaştırması için hedef slotu işaretle.
function pickItem(i: MatchedItem, slot?: string | null): void {
  selectedItemId.value = i.id
  const s = slot ?? i.slot
  if (s) selectedSlot.value = s
}

// --- Faz 2 (export epic): .build dosyası oluştur (BuildPlanner) ---
const exportState = ref<'idle' | 'saving' | 'done' | 'error'>('idle')
const exportResult = ref<{ path?: string; dir?: string; report?: ExportReport } | null>(null)
const exportErr = ref('')
async function createBuildFile(custom: boolean): Promise<void> {
  const raw = currentBuild()
  if (!raw) return
  exportState.value = 'saving'
  exportErr.value = ''
  try {
    const { build: pb, report } = exportBuild(raw)
    const json = JSON.stringify(pb, null, 2)
    const r = await window.api?.build?.exportFile(json, buildFileName(pb.name), custom)
    if (r?.ok) {
      exportState.value = 'done'
      exportResult.value = { path: r.path, dir: r.dir, report }
    } else if (r?.error === 'canceled') {
      exportState.value = 'idle'
    } else {
      exportState.value = 'error'
      exportErr.value = r?.error || 'write_failed'
    }
  } catch (e) {
    exportState.value = 'error'
    exportErr.value = (e as Error).message
  }
}
function openBuildFolder(): void {
  window.api?.build?.openFolder()
}
// build değişince export durumunu sıfırla
watch(buildInfo, () => {
  exportState.value = 'idle'
  exportResult.value = null
  filterState.value = 'idle'
  filterResult.value = null
})

// --- Faz 6-7: build'e özel loot filter üret + kaydet ---
const filterOpen = ref(false) // seçenek paneli açık mı
const filterStrictness = ref<Strictness>('regular')
const filterTheme = ref<string>(DEFAULT_THEME)
const filterSound = ref(true)
const filterIcon = ref(true)
const filterBeam = ref(true)
const filterState = ref<'idle' | 'saving' | 'done' | 'error'>('idle')
const filterErr = ref('')
const filterResult = ref<{ path?: string; dir?: string; blocks: number; analysis: FilterAnalysis; valid: boolean } | null>(null)
const themeList = Object.values(THEMES)
const strictnessList: Array<{ key: Strictness; tr: string; en: string }> = [
  { key: 'soft', tr: 'Yumuşak', en: 'Soft' },
  { key: 'regular', tr: 'Normal', en: 'Regular' },
  { key: 'strict', tr: 'Sıkı', en: 'Strict' },
  { key: 'very-strict', tr: 'Çok Sıkı', en: 'Very Strict' }
]
async function createFilter(custom: boolean): Promise<void> {
  const raw = currentBuild()
  filterState.value = 'saving'
  filterErr.value = ''
  try {
    const gen = generateFilter(raw, {
      strictness: filterStrictness.value,
      themeKey: filterTheme.value,
      sound: filterSound.value,
      minimapIcon: filterIcon.value,
      beam: filterBeam.value,
      name: raw ? [raw.ascendClassName, raw.className].filter(Boolean).join(' ') : 'PoBe'
    })
    const valid = validateFilter(gen.text).ok
    const r = await window.api?.filter?.exportFile(gen.text, gen.filename, custom)
    if (r?.ok) {
      filterState.value = 'done'
      filterResult.value = { path: r.path, dir: r.dir, blocks: gen.blockCount, analysis: gen.analysis, valid }
    } else if (r?.error === 'canceled') {
      filterState.value = 'idle'
    } else {
      filterState.value = 'error'
      filterErr.value = r?.error || 'write_failed'
    }
  } catch (e) {
    filterState.value = 'error'
    filterErr.value = (e as Error).message
  }
}
function openFilterFolder(): void {
  window.api?.filter?.openFolder()
}

// --- Faz 5: build eşyasından trade2 aramasını tarayıcıda aç ---
// Eşyanın text-stat mod'larından sorgu kurar; mod yoksa taban/isimle arar (uydurma yok).
const tradeBusy = ref(false)
const statsReady = ref(false)
// stat tablosunu bu pencerede de garanti et (aranabilir mod sayısı doğru görünsün)
onMounted(async () => {
  await ensureStats()
  statsReady.value = true
})
// Seçili eşyanın aranabilir (stat-id'ye eşlenen) mod sayısı — 0 ise taban/isimle aranır
const selSearchable = computed<number>(() => {
  void statsReady.value // stat tablosu yüklenince yeniden hesapla
  if (!selItem.value) return 0
  const it = { ...selItem.value, base: selItem.value.pureBase || selItem.value.base }
  return pobItemToQueryItem(it).searchableMods
})
// Part 5: bu eşyayı Craft Simülatörü'ne hedef olarak gönder (App mode'u Craft'a geçirir)
function craftFromItem(it: MatchedItem): void {
  requestCraft({
    base: it.base,
    pureBase: it.pureBase,
    name: it.name,
    itemClass: it.itemClass,
    rarity: it.rarity,
    mods: it.mods,
    itemLevel: it.itemLevel
  })
  emit('craft')
}
async function openItemTrade(it: MatchedItem): Promise<void> {
  if (tradeBusy.value) return
  tradeBusy.value = true
  try {
    // 0.17.9: GEVŞEK ara (taban + ilk birkaç mod) — ideal çok-modlu build eşyası 0 sonuç vermesin.
    await openItemInTrade(buildItemTradeQuery(it))
  } finally {
    tradeBusy.value = false
  }
}
function gemName(g: { nameSpec: string; tr: string | null }): string {
  // #4: gem adı HER ZAMAN İngilizce (özel adlar çevrilmez; oyun İngilizce).
  return g.nameSpec
}
function itemName(i: MatchedItem): string {
  return i.name || i.pureBase
}

// --- Vendor/Stash regex (DOĞRULANDI: PoE2 arama regex destekler, ~50 ch) ---
const itemRegex = computed(() => (selItem.value ? buildItemRegex(selItem.value) : null))
const copied = ref<'' | 'regex' | 'base'>('')
let copyTimer: ReturnType<typeof setTimeout> | null = null
async function copy(text: string, which: 'regex' | 'base'): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = which
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = ''), 1400)
  } catch {
    /* clipboard erişimi yoksa sessiz geç */
  }
}
</script>

<template>
  <div class="bld">
    <!-- Sorun #3: build yüklüyken İKİNCİL kısımlar (içe aktarma + notlar) küçük toolbar'a iner,
         VARSAYILAN KAPALI → Ekipman/Gem/Ağaç öne çıkar. -->
    <div v-if="build" class="bld-toolbar">
      <button class="bld-btn bld-btn--sm" @click="toggleBldSec('import')">
        📥 {{ tr('İçe Aktar / Değiştir', 'Import / Change') }} {{ secOpen.import ? '▾' : '▸' }}
      </button>
      <button v-if="notes" class="bld-btn bld-btn--sm" @click="toggleBldSec('notes')">
        📝 {{ tr('Yazar Notları', 'Author Notes') }} {{ secOpen.notes ? '▾' : '▸' }}
      </button>
      <span v-if="buildInfo" class="bld-summary">
        <img v-if="buildEmblem" :src="buildEmblem" class="bld-emblem" :alt="buildInfo.ascendClassName || buildInfo.className" />
        {{ buildInfo.className }}<span v-if="buildInfo.ascendClassName"> · {{ buildInfo.ascendClassName }}</span> · Lv {{ buildInfo.level }}
      </span>
      <button class="bld-btn bld-btn--sm" @click="clearBuild">{{ tr('Temizle', 'Clear') }}</button>
    </div>

    <!-- ÜST: kod kutusu + içe aktar (build yoksa her zaman açık; varsa küçültülebilir) -->
    <div v-show="!build || secOpen.import" class="bld-import">
      <textarea
        v-model="code"
        class="bld-code"
        :placeholder="tr('PoB2 export kodu · Mobalytics linki · Maxroll linki yapıştır (ya da aşağıdan .build dosyası seç)…', 'Paste a PoB2 export code · Mobalytics link · Maxroll link (or pick a .build file below)…')"
        spellcheck="false"
      ></textarea>
      <div class="bld-importbtns">
        <button class="bld-btn bld-btn--primary" @click="doImport">{{ tr('İçe Aktar', 'Import') }}</button>
        <button class="bld-btn" @click="clearBuild">{{ tr('Temizle', 'Clear') }}</button>
        <button v-if="buildInfo" class="bld-btn bld-btn--export" :disabled="exportState === 'saving'" @click="createBuildFile(false)">
          {{ exportState === 'saving' ? tr('Oluşturuluyor…', 'Creating…') : tr('.build oluştur', 'Create .build') }}
        </button>
        <button v-if="buildInfo" class="bld-btn bld-btn--filter" @click="filterOpen = !filterOpen">
          {{ tr('Bu build için filter oluştur', 'Create filter for this build') }} {{ filterOpen ? '▾' : '▸' }}
        </button>
        <span v-if="buildInfo" class="bld-summary">
          <img v-if="buildEmblem" :src="buildEmblem" class="bld-emblem" :alt="buildInfo.ascendClassName || buildInfo.className" />
          {{ buildInfo.className }}<span v-if="buildInfo.ascendClassName"> · {{ buildInfo.ascendClassName }}</span> · Lv {{ buildInfo.level }}
        </span>
        <span v-if="error" class="bld-error">{{ error }}</span>
      </div>

      <!-- .build dosyası içe aktarma: dosya seç / sürükle-bırak -->
      <div
        class="bld-drop"
        :class="{ 'bld-drop--over': dragOver }"
        @click="pickFile"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDropBuild"
      >
        <span class="bld-drop-ic">📁</span>
        <span class="bld-drop-txt">
          {{ tr('Bir .build dosyası seç ya da buraya sürükle-bırak', 'Pick a .build file or drag & drop it here') }}
        </span>
        <span class="bld-drop-sub">{{ tr('(oyunun BuildPlanner klasöründen)', '(from the game’s BuildPlanner folder)') }}</span>
        <input ref="fileInput" type="file" accept=".build" class="bld-drop-input" @change="onFilePicked" />
      </div>
      <div v-if="dotBuildReport" class="bld-dbreport">
        ✓ {{ tr('.build yüklendi', '.build loaded') }} ·
        {{ dotBuildReport.passives.resolved }}/{{ dotBuildReport.passives.total }} {{ tr('pasif', 'passives') }} ·
        {{ dotBuildReport.skills.total }} {{ tr('skill', 'skills') }} ·
        {{ dotBuildReport.items.withSlot }}/{{ dotBuildReport.items.total }} {{ tr('eşya', 'items') }}
        <span v-if="dotBuildReport.ascendancy.value"> · {{ dotBuildReport.ascendancy.value }}</span>
        <ul v-if="dotBuildReport.notes.length" class="bld-dbreport-notes">
          <li v-for="(n, i) in dotBuildReport.notes" :key="i">⚠ {{ n }}</li>
        </ul>
      </div>
    </div>

    <!-- .build oluşturma sonucu (Faz 2 export) -->
    <div v-if="exportState === 'done' && exportResult" class="bld-export bld-export--ok">
      <div class="bld-export-head">✓ {{ tr('.build dosyası kaydedildi', '.build file saved') }}</div>
      <div class="bld-export-note">
        {{ tr('BuildPlanner klasörüne yazıldı; oyun-içi Build Planner’da görünecek.', 'Saved to the BuildPlanner folder; it will appear in the in-game Build Planner.') }}
      </div>
      <code class="bld-export-path">{{ exportResult.path }}</code>
      <div class="bld-export-stats" v-if="exportResult.report">
        {{ exportResult.report.passives.resolved }}/{{ exportResult.report.passives.total }} {{ tr('pasif', 'passives') }} ·
        {{ exportResult.report.skills.withGemId }} {{ tr('skill', 'skills') }} ·
        {{ exportResult.report.items.total }} {{ tr('eşya', 'items') }} ·
        {{ tr('yükseliş', 'ascendancy') }}: {{ exportResult.report.ascendancy.value || '—' }}<span v-if="!exportResult.report.ascendancy.mappedToInternalKey"> ({{ tr('doğrulanmalı', 'verify') }})</span>
      </div>
      <ul v-if="exportResult.report && exportResult.report.notes.length" class="bld-export-warn">
        <li v-for="(n, i) in exportResult.report.notes" :key="i">⚠ {{ n }}</li>
      </ul>
      <div class="bld-export-actions">
        <button class="bld-btn" @click="openBuildFolder">{{ tr('Klasörü Aç', 'Open Folder') }}</button>
        <button class="bld-btn" @click="createBuildFile(true)">{{ tr('Farklı kaydet…', 'Save as…') }}</button>
      </div>
    </div>
    <div v-else-if="exportState === 'error'" class="bld-export bld-export--err">
      ⚠ {{ tr('Dosya yazılamadı', 'Could not write file') }}<span v-if="exportErr"> ({{ exportErr }})</span>
    </div>

    <!-- LOOT FILTER üretici (Faz 6-7): strictness + tema + efekt seçimi -->
    <div v-if="buildInfo && filterOpen" class="bld-filter panel-frame">
      <div class="bld-filter-head">{{ tr('Build’e özel loot filter', 'Build-specific loot filter') }}</div>
      <div class="bld-filter-note">
        {{ tr('Build’in silah sınıfı, takılı tabanları ve eşsizleri vurgulanır; gerisi sıkılığa göre gizlenir. Yalnız yerel .filter yazılır (oyunla/ağla etkileşim yok).', 'Highlights your build’s weapon class, equipped bases and uniques; the rest is hidden by strictness. Only a local .filter is written (no game/network interaction).') }}
      </div>

      <div class="bld-filter-row">
        <label class="bld-filter-lbl">{{ tr('Sıkılık', 'Strictness') }}</label>
        <div class="bld-chips">
          <button
            v-for="s in strictnessList"
            :key="s.key"
            class="bld-chip"
            :class="{ 'bld-chip--on': filterStrictness === s.key }"
            @click="filterStrictness = s.key"
          >{{ tr(s.tr, s.en) }}</button>
        </div>
      </div>

      <div class="bld-filter-row">
        <label class="bld-filter-lbl">{{ tr('Tema', 'Theme') }}</label>
        <div class="bld-chips">
          <button
            v-for="t in themeList"
            :key="t.key"
            class="bld-chip"
            :class="{ 'bld-chip--on': filterTheme === t.key }"
            @click="filterTheme = t.key"
          >{{ tr(t.nameTr, t.nameEn) }}</button>
        </div>
      </div>

      <div class="bld-filter-row">
        <label class="bld-filter-lbl">{{ tr('Efektler', 'Effects') }}</label>
        <div class="bld-chips">
          <button class="bld-chip" :class="{ 'bld-chip--on': filterSound }" @click="filterSound = !filterSound">🔊 {{ tr('Ses', 'Sound') }}</button>
          <button class="bld-chip" :class="{ 'bld-chip--on': filterIcon }" @click="filterIcon = !filterIcon">◈ {{ tr('Harita ikonu', 'Map icon') }}</button>
          <button class="bld-chip" :class="{ 'bld-chip--on': filterBeam }" @click="filterBeam = !filterBeam">☄ {{ tr('Işık huzmesi', 'Light beam') }}</button>
        </div>
      </div>

      <div class="bld-filter-actions">
        <button class="bld-btn bld-btn--primary" :disabled="filterState === 'saving'" @click="createFilter(false)">
          {{ filterState === 'saving' ? tr('Oluşturuluyor…', 'Creating…') : tr('Oluştur ve kaydet', 'Create & save') }}
        </button>
        <button class="bld-btn" :disabled="filterState === 'saving'" @click="createFilter(true)">{{ tr('Farklı kaydet…', 'Save as…') }}</button>
      </div>

      <!-- sonuç kartı -->
      <div v-if="filterState === 'done' && filterResult" class="bld-export bld-export--ok bld-filter-result">
        <div class="bld-export-head">✓ {{ tr('Filter kaydedildi', 'Filter saved') }} <span v-if="filterResult.valid" class="bld-filter-ok">· {{ tr('geçerli sözdizimi', 'valid syntax') }}</span></div>
        <div class="bld-export-note">
          {{ tr('PoE2 filter klasörüne yazıldı; oyun-içi “Item Filter” listesinde görünecek (Borderless modu önerilir).', 'Saved to the PoE2 filter folder; it will appear in the in-game “Item Filter” list.') }}
        </div>
        <code class="bld-export-path">{{ filterResult.path }}</code>
        <div class="bld-export-stats">
          {{ filterResult.blocks }} {{ tr('blok', 'blocks') }} ·
          {{ tr('silah', 'weapon') }}: {{ filterResult.analysis.weaponClasses.join(', ') || '—' }} ·
          {{ tr('eşsiz', 'uniques') }}: {{ filterResult.analysis.uniqueNames.length }} ·
          {{ tr('taban', 'bases') }}: {{ filterResult.analysis.equippedBases.length }}
        </div>
        <ul v-if="filterResult.analysis.notes.length" class="bld-export-warn">
          <li v-for="(n, i) in filterResult.analysis.notes" :key="i">⚠ {{ n }}</li>
        </ul>
        <div class="bld-export-actions">
          <button class="bld-btn" @click="openFilterFolder">{{ tr('Filter klasörünü aç', 'Open filter folder') }}</button>
        </div>
      </div>
      <div v-else-if="filterState === 'error'" class="bld-export bld-export--err bld-filter-result">
        ⚠ {{ tr('Filter yazılamadı', 'Could not write filter') }}<span v-if="filterErr"> ({{ filterErr }})</span>
      </div>
    </div>

    <!-- Maxroll / Mobalytics reconstruction başarı notu (URL kutuda kalır; kart gizlenir) -->
    <div v-if="importedFrom === 'maxroll' || importedFrom === 'mobalytics'" class="bld-imported">
      ✓ {{ importedFrom === 'maxroll'
        ? tr('Maxroll’dan içe aktarıldı (deneysel, reconstruction) — eşleşmeyenler “eşleşmedi” işaretli.', 'Imported from Maxroll (experimental, reconstruction) — unmatched marked as “unmatched”.')
        : tr('Mobalytics’ten içe aktarıldı (yapısal reconstruction) — eşleşmeyenler “eşleşmedi” işaretli.', 'Imported from Mobalytics (structural reconstruction) — unmatched marked as “unmatched”.') }}
    </div>

    <!-- MAXROLL / MOBALYTICS build linki: oto-çekim (Faz 2-3) + güvenilir rehber (Faz 1) -->
    <div v-if="detected && !importedFrom" class="bld-urlcard panel-frame">
      <div class="bld-urlcard-head">
        <span class="bld-urlcard-badge">{{ siteLabel(detected.site) }}</span>
        <template v-if="fetchState === 'loading'">{{ tr('build çekiliyor…', 'fetching build…') }}</template>
        <template v-else>{{ tr('build linki algılandı', 'build link detected') }}</template>
      </div>

      <!-- ÇEKİLİYOR -->
      <div v-if="fetchState === 'loading'" class="bld-urlcard-loading">
        ⋯ {{ tr('Otomatik çekiliyor (deneysel)…', 'Auto-fetching (experimental)…') }}
      </div>

      <!-- REHBER (+ hata olduysa uyarı) -->
      <template v-else>
        <div v-if="fetchState === 'error'" class="bld-urlcard-warn">
          ⚠ {{ tr('Otomatik çekilemedi', 'Auto-fetch failed') }} ({{ fetchErrorMsg }}) — {{ tr('elle kopyala:', 'copy it manually:') }}
        </div>
        <div class="bld-urlcard-body">
          {{ tr('Sitede ', 'On the site, use ') }}<b>{{ exportBtnName(detected.site) }}</b>
          {{ tr(' ile PoB kodunu kopyala, yukarıdaki kutuya yapıştırıp İçe Aktar’a bas.', ' to copy the PoB code, paste it into the box above and click Import.') }}
        </div>
        <ol class="bld-urlcard-steps">
          <li>{{ tr('“Linki Aç” ile build sayfasını tarayıcıda aç.', 'Open the build page in your browser with “Open link”.') }}</li>
          <li>{{ tr('Sitedeki PoB / “Export to Path of Building” butonuna bas, kodu kopyala.', 'Click the site’s PoB / “Export to Path of Building” button, copy the code.') }}</li>
          <li>{{ tr('Kodu yukarıdaki kutuya yapıştır → İçe Aktar.', 'Paste the code into the box above → Import.') }}</li>
        </ol>
        <div class="bld-urlcard-btns">
          <button class="bld-btn" @click="retryFetch">
            ↻ {{ tr('Otomatik dene (deneysel)', 'Try auto (experimental)') }}
          </button>
          <a class="bld-btn bld-btn--primary" :href="detected.url" target="_blank" rel="noopener" @click.prevent="openLink(detected.url)">
            ↗ {{ tr('Linki Aç', 'Open link') }}
          </a>
        </div>
      </template>

      <div class="bld-urlcard-note">
        ⓘ {{ tr('Bu özellik internet kullanır; yalnız build URL’si gönderilir, kişisel veri gitmez.', 'This feature uses the internet; only the build URL is sent, no personal data.') }}
      </div>
    </div>

    <!-- YAZAR NOTLARI (Faz 4): orijinal metin + opsiyonel LLM TR çeviri. Sorun #3: build varken
         VARSAYILAN KAPALI (toolbar'dan açılır); build yokken her zaman görünür. -->
    <div v-if="notes && build && secOpen.notes" class="bld-notes panel-frame">
      <div class="bld-notes-head">
        <span class="bld-notes-title">{{ tr('Yazar Notları', 'Author Notes') }}</span>
        <!-- çeviri hazır: TR / Orijinal(EN) geçişi + otomatik/cache rozeti (Faz 5) -->
        <template v-if="notesTr">
          <button class="bld-minibtn" :class="{ 'bld-minibtn--on': showTr }" @click="showTr = true">{{ tr('TR çeviri', 'TR translation') }}</button>
          <button class="bld-minibtn" :class="{ 'bld-minibtn--on': !showTr }" @click="showTr = false">{{ tr('Orijinali göster (EN)', 'Show original (EN)') }}</button>
          <span class="bld-notes-badge" :title="transCached ? tr('cache’ten geldi — LLM çağrısı YAPILMADI', 'from cache — no LLM call') : tr('LLM ile çevrildi', 'translated via LLM')">
            {{ transCached ? tr('✓ cache', '✓ cached') : tr('✓ LLM çeviri', '✓ LLM') }}
          </span>
        </template>
        <!-- çeviriliyor -->
        <span v-else-if="transState === 'loading'" class="bld-notes-hint">⋯ {{ tr('TR’ye çevriliyor…', 'Translating to TR…') }}</span>
        <!-- anahtar var, henüz çevrilmemiş (ör. EN modda) → manuel buton -->
        <button v-else-if="llmOn && hasKey" class="bld-minibtn bld-minibtn--accent" @click="translateNotes(false)">{{ tr('TR’ye çevir (LLM)', 'Translate to TR (LLM)') }}</button>
        <!-- anahtar yok → kibar fallback -->
        <span v-else class="bld-notes-hint">{{ tr('TR çeviri için Ayarlar’dan LLM sağlayıcı + anahtar gir', 'Add an LLM provider + key in Settings for TR translation') }}</span>
      </div>
      <div v-if="transState === 'error'" class="bld-notes-warn">⚠ {{ transErrorMsg }}</div>
      <div class="bld-notes-body">{{ displayNotes }}</div>
      <!-- web kaynağı (Maxroll/Mobalytics) yalnız varsa; PoB kodu / .build için gizli -->
      <div v-if="sourceSite" class="bld-notes-src">
        {{ tr('Kaynak', 'Source') }}: <b>{{ sourceSite === 'maxroll' ? 'Maxroll' : 'Mobalytics' }}</b>
        <template v-if="authorName"> · {{ authorName }}</template>
        <template v-if="sourceUrl">
          · <a class="bld-notes-link" :href="sourceUrl" target="_blank" rel="noopener" @click.prevent="openLink(sourceUrl)">{{ tr('linke git', 'open link') }}</a>
        </template>
        <template v-if="authorUrl">
          · <a class="bld-notes-link" :href="authorUrl" target="_blank" rel="noopener" @click.prevent="openLink(authorUrl)">{{ tr('yazar', 'author') }}</a>
        </template>
      </div>
    </div>

    <!-- AĞAÇ GÖRÜNÜMÜ: seçili aşamanın node'ları vurgulu -->
    <div v-if="build && showTree" class="bld-treeview panel-frame">
      <div class="bld-treebar">
        <button class="bld-btn" @click="showTree = false">← {{ tr('Geri', 'Back') }}</button>
        <div class="bld-stages bld-stages--tree">
          <button
            v-for="(s, i) in stages"
            :key="s.id"
            class="bld-stage"
            :class="{ 'bld-stage--on': i === stageIdx }"
            @click="pinStage(i)"
          >
            {{ s.title || ('Set ' + (i + 1)) }}
          </button>
        </div>
        <span class="bld-treecount">
          <b>{{ stageNodeIds.length }}</b> {{ tr('node vurgulandı', 'nodes highlighted') }}
        </span>
      </div>
      <PassiveTreeCanvas
        class="bld-treehost"
        :passives-by-id="passivesById"
        :is-tr="isTr"
        :allocated="stageNodeIds"
      />
    </div>

    <!-- GÖRÜNÜM GEÇİŞİ (Liste / Oyun Görünümü) — Faz 3 -->
    <div v-if="build && !showTree" class="bld-viewtoggle">
      <button class="bld-vtab" :class="{ 'bld-vtab--on': viewMode === 'game' }" @click="viewMode = 'game'">{{ tr('Oyun Görünümü', 'Game View') }}</button>
      <button class="bld-vtab" :class="{ 'bld-vtab--on': viewMode === 'list' }" @click="viewMode = 'list'">{{ tr('Liste', 'List') }}</button>
    </div>

    <!-- OYUN-İÇİ TARZI GÖRÜNÜM: gear paper-doll + gem socket grupları + pasif ağaç -->
    <GameBuildView
      v-if="build && !showTree && viewMode === 'game' && trackedBuild"
      :raw="trackedBuild"
      :items="build.items"
      :passives-by-id="passivesById"
      :is-tr="isTr"
      @craft="emit('craft')"
    />

    <div v-else-if="build && !showTree && viewMode === 'list'" class="bld-body">
      <!-- SOL: aşama seçici + gem'ler + pasif özet -->
      <section class="bld-left panel-frame">
        <div class="bld-stages">
          <button
            v-for="(s, i) in stages"
            :key="s.id"
            class="bld-stage"
            :class="{ 'bld-stage--on': i === stageIdx }"
            @click="pinStage(i)"
          >
            {{ s.title || ('Set ' + (i + 1)) }}
          </button>
          <span
            v-if="curLevel"
            class="bld-lvbadge"
            :title="tr('Leveling tracker seviyesi — aşama otomatik seçilir', 'Leveling tracker level — stage auto-selected')"
          >Lv {{ curLevel }} ⟳</span>
        </div>

        <div class="bld-scroll">
          <div class="bld-sechead">{{ tr('Aktif Beceriler', 'Active Skills') }}</div>
          <ul class="bld-gems">
            <li v-for="(g, i) in activeGems" :key="'a' + i" class="bld-gem" :class="{ 'bld-gem--miss': !g.matched }">
              <img v-if="iconUrl(gemMap, g.icon)" :src="iconUrl(gemMap, g.icon)!" class="bld-gemic" alt="" />
              <span v-else class="bld-gemph">◆</span>
              <span class="bld-gemname">{{ gemName(g) }}</span>
              <span class="bld-gemmeta">Lv {{ g.level }}<span v-if="g.quality"> · Q{{ g.quality }}</span></span>
              <span v-if="!g.matched" class="bld-miss">{{ tr('eşleşmedi', 'no match') }}</span>
            </li>
          </ul>

          <div v-if="supportGems.length" class="bld-sechead">{{ tr('Support Taşları', 'Support Gems') }}</div>
          <ul class="bld-gems">
            <li v-for="(g, i) in supportGems" :key="'s' + i" class="bld-gem bld-gem--sup" :class="{ 'bld-gem--miss': !g.matched }">
              <img v-if="iconUrl(gemMap, g.icon)" :src="iconUrl(gemMap, g.icon)!" class="bld-gemic" alt="" />
              <span v-else class="bld-gemph">◆</span>
              <span class="bld-gemname">{{ gemName(g) }}</span>
              <span class="bld-gemmeta">Lv {{ g.level }}<span v-if="g.quality"> · Q{{ g.quality }}</span></span>
              <span v-if="!g.matched" class="bld-miss">{{ tr('eşleşmedi', 'no match') }}</span>
            </li>
          </ul>

          <div class="bld-sechead">{{ tr('Pasif Ağaç', 'Passive Tree') }}</div>
          <div v-if="stageSpec" class="bld-passives">
            <div class="bld-passline">
              <b>{{ stageSpec.nodes.length }}</b> {{ tr('node ayrıldı', 'nodes allocated') }}
              <span class="bld-passdim">· {{ notableNodes.length }} {{ tr('kayda değer', 'notable') }}</span>
            </div>
            <div class="bld-notables">
              <span v-for="(n, i) in notableNodes" :key="i" class="bld-notable">{{ n }}</span>
            </div>
            <button v-if="stageNodeIds.length" class="bld-btn bld-treebtn" @click="showTree = true">
              {{ tr('Ağaçta göster', 'Show on tree') }} →
            </button>
          </div>
        </div>
      </section>

      <!-- SAĞ: eşya listesi + seçili eşya detayı + regex/quest yer tutucu -->
      <section class="bld-right panel-frame">
        <!-- #7: okunur slot → eşya listesi (slot etiketi + ikon + ad), kanonik sıralı -->
        <div class="bld-itemlist">
          <button
            v-for="e in listItems"
            :key="e.item.id + (e.slot || '')"
            class="bld-itemli"
            :class="{ 'bld-itemli--on': e.item.id === selectedItemId, 'bld-itemli--miss': !e.item.matched, 'bld-itemli--cmp': e.slot && e.slot === selectedSlot }"
            :title="itemName(e.item) + (e.slot ? ' — ' + e.slot : '')"
            @click="pickItem(e.item, e.slot)"
          >
            <span class="bld-itemli-slot">{{ slotLabel(e.slot) }}</span>
            <img v-if="iconUrl(itemMap, e.item.icon)" :src="iconUrl(itemMap, e.item.icon)!" class="bld-itemli-ic" alt="" />
            <span v-else class="bld-itemli-ic bld-itemph">◆</span>
            <span class="bld-itemli-name" :class="'rar-' + e.item.rarity.toLowerCase()">{{ itemName(e.item) }}</span>
            <span v-if="e.slot && e.slot === selectedSlot" class="bld-itemli-cmp">✓</span>
          </button>
        </div>

        <div v-if="selItem" class="bld-itemdetail">
          <div class="bld-itemname" :class="'rar-' + selItem.rarity.toLowerCase()">{{ itemName(selItem) }}</div>
          <div class="bld-itemmeta">
            <span v-if="selItem.slot">{{ tr('Slot', 'Slot') }}: {{ selItem.slot }}</span>
            <span v-if="selItem.slot && selItem.slot === selectedSlot" class="bld-cmptarget">✓ {{ tr('karşılaştırma hedefi', 'compare target') }}</span>
            <span>{{ tr('Taban', 'Base') }}: {{ selItem.pureBase }}</span>
            <span v-if="selItem.itemLevel">ilvl {{ selItem.itemLevel }}</span>
            <span v-if="!selItem.matched" class="bld-miss">{{ tr('taban eşleşmedi', 'base no match') }}</span>
          </div>
          <ul class="bld-mods">
            <li v-for="(m, i) in selItem.mods" :key="i">{{ m }}</li>
          </ul>
          <!-- Faz 5: bu eşyayı trade2'de ara -->
          <div class="bld-trade">
            <button class="bld-craftbtn" @click="craftFromItem(selItem)" :title="tr('Bu eşyayı Craft Simülatörü’ne hedef olarak gönder', 'Send this item to the Craft Simulator as target')">
              ⚒ {{ tr('Craft’la', 'Craft this') }}
            </button>
            <button class="bld-tradebtn" :disabled="tradeBusy" @click="openItemTrade(selItem)">
              {{ tradeBusy ? tr('Açılıyor…', 'Opening…') : tr('Trade’de Aç ↗', 'Open in Trade ↗') }}
            </button>
            <span v-if="selSearchable === 0" class="bld-tradenote">
              {{ tr('Bu eşyanın mod verisi yok — taban/isimle aranıyor', 'No mod data for this item — searching by base/name') }}
            </span>
            <span v-else class="bld-tradenote">{{ selSearchable }} {{ tr('mod ile aranıyor', 'mods used') }}</span>
          </div>
          <div class="bld-tradefoot">{{ tr('yalnız eşya/sorgu gönderilir · kişisel veri yok · otomatik alım yok', 'only item/query sent · no personal data · no auto-buy') }}</div>
          <!-- Vendor/Stash regex üreteci -->
          <div v-if="itemRegex" class="bld-regex">
            <div class="bld-phhead">{{ tr('Stash / Envanter Arama', 'Stash / Inventory Search') }}</div>

            <div v-if="itemRegex.regex" class="bld-rxrow">
              <code class="bld-rxcode">{{ itemRegex.regex }}</code>
              <button class="bld-cpbtn" @click="copy(itemRegex.regex, 'regex')">
                {{ copied === 'regex' ? tr('Kopyalandı ✓', 'Copied ✓') : tr('Kopyala', 'Copy') }}
              </button>
            </div>
            <div v-else class="bld-rxnone">
              {{ tr('Bu eşyada aranacak mod yok — tabanla ara.', 'No searchable mods — search by base.') }}
            </div>
            <div v-if="itemRegex.regex" class="bld-rxmeta">
              {{ itemRegex.regex.length }}/50 {{ tr('karakter', 'chars') }}
              <span v-if="itemRegex.truncated" class="bld-rxtrunc">· {{ tr('sınıra göre kısaltıldı', 'trimmed to fit') }}</span>
            </div>

            <!-- taban türüne göre basit arama -->
            <div class="bld-rxrow bld-rxrow--base">
              <code class="bld-rxcode">{{ itemRegex.base }}</code>
              <button class="bld-cpbtn" @click="copy(itemRegex.base, 'base')">
                {{ copied === 'base' ? tr('Kopyalandı ✓', 'Copied ✓') : tr('Taban', 'Base') }}
              </button>
            </div>

            <div class="bld-rxnote">
              {{ tr('Oyun içi arama kutusuna yapıştır (Ctrl-F: stash/envanter/ağaç). PoE2 vendor (Finn/kumar) rastgele item satar; mod’a göre ARAMAZ — bu, stash/envanter metin araması içindir.', 'Paste into the in-game search box (Ctrl-F: stash/inventory/tree). PoE2 vendors (Finn/gamble) sell random items and do NOT search by mod — this is for stash/inventory text search.') }}
            </div>
          </div>
        </div>
        <div v-else class="bld-empty">{{ tr('Eşya seçili değil', 'No item selected') }}</div>

        <!-- Quest uncut-gem önerisi (seçili aşamaya göre) -->
        <div v-if="quest" class="bld-quest">
          <div class="bld-phhead">
            {{ tr('Quest Uncut Gem Önerisi', 'Quest Uncut Gem Suggestion') }}
            <span class="bld-qstage">
              · {{ quest.stageTitle }}<template v-if="quest.level"> · Lv {{ quest.level.lo }}–{{ quest.level.hi }} · act {{ quest.act }}</template><template v-else> · {{ tr('endgame', 'endgame') }}</template>
            </span>
          </div>

          <div class="bld-qskills">
            {{ tr('Bu aşamada', 'This stage') }}: <b>{{ quest.activeSkills.length }}</b> {{ tr('aktif beceri', 'active skills') }}<template v-if="quest.activeSkills.length">
              — {{ quest.activeSkills.map(skillLabel).join(', ') }}</template>
            <template v-if="quest.supportCount">, <b>{{ quest.supportCount }}</b> support</template>
          </div>

          <ul class="bld-qrewards">
            <li v-if="quest.skill" class="bld-qrow">
              <span class="bld-qkind bld-qkind--skill">{{ tr('Aktif beceriler için', 'For active skills') }}</span>
              <span class="bld-qlvl">Lv {{ quest.skill.gemLevel }} Uncut Skill Gem</span>
              <span class="bld-qarea">{{ areaNames(quest.skill.areas) }}</span>
            </li>
            <li v-if="quest.support && quest.supportCount" class="bld-qrow">
              <span class="bld-qkind bld-qkind--sup">{{ tr('Support için', 'For supports') }}</span>
              <span class="bld-qlvl">Lv {{ quest.support.gemLevel }} Uncut Support Gem</span>
              <span class="bld-qarea">{{ areaNames(quest.support.areas) }}</span>
              <span v-if="quest.supportDataLimited" class="bld-qflag">{{ tr('veri act 2’ye kadar — doğrulanmalı', 'data up to act 2 — to verify') }}</span>
            </li>
            <li v-if="quest.spirit && quest.usesSpirit" class="bld-qrow">
              <span class="bld-qkind bld-qkind--spirit">{{ tr('Spirit becerileri için', 'For spirit skills') }}</span>
              <span class="bld-qlvl">Lv {{ quest.spirit.gemLevel }} Uncut Spirit Gem</span>
              <span class="bld-qarea">{{ areaNames(quest.spirit.areas) }}</span>
            </li>
          </ul>

          <div class="bld-qnote">
            {{ tr('ⓘ Doğrulanmalı: PoE2’de quest sabit beceri vermez — uncut gem’i istediğin beceriye oyarsın. Aşama ↔ act/seviye eşlemesi yaklaşıktır. Kaynak: areas.json quest ödülleri.', 'ⓘ To verify: in PoE2 quests give no fixed skill — you cut the uncut gem into the skill you want. Stage ↔ act/level mapping is approximate. Source: areas.json quest rewards.') }}
          </div>
        </div>
      </section>
    </div>

    <div v-else class="bld-help">
      {{ tr('PoB kodunu yapıştırıp İçe Aktar’a bas. Build’in gem aşamaları, pasif ağacı ve eşyaları burada görünecek.', 'Paste a PoB code and click Import. The build’s gem stages, passive tree and items will appear here.') }}
    </div>
  </div>
</template>

<style scoped>
.bld {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bld-import {
  flex: none;
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.bld-code {
  flex: 1;
  height: 56px;
  resize: none;
  font-family: monospace;
  font-size: 11px;
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--frame-brown, #4a3d28);
  padding: 6px 8px;
}
.bld-code:focus {
  outline: none;
  border-color: var(--gold-line, #b89a66);
}
.bld-importbtns {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  justify-content: center;
  min-width: 150px;
}
.bld-btn {
  font-family: var(--font-serif);
  font-size: 12px;
  font-variant: small-caps;
  color: var(--gold-title);
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 5px 12px;
  cursor: pointer;
}
.bld-btn:hover {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
/* Sorun #3: küçültülmüş ikincil bölüm toolbar'ı */
.bld-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bld-btn--sm {
  font-size: 11px;
  padding: 3px 9px;
}
.bld-btn--primary {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.bld-summary {
  font-size: 11px;
  font-variant: small-caps;
  color: var(--gem-teal);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bld-emblem {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(201, 161, 74, 0.5);
  flex: none;
}
.bld-error {
  font-size: 11px;
  color: #e0664f;
}
/* Maxroll/Mobalytics build linki rehber kartı */
.bld-urlcard {
  flex: none;
  padding: 10px 12px;
  gap: 5px;
}
.bld-urlcard-head {
  font-variant: small-caps;
  letter-spacing: 0.03em;
  font-size: 13px;
  color: var(--gem-teal);
}
.bld-urlcard-badge {
  font-size: 10px;
  font-weight: 700;
  color: #0a1614;
  background: var(--gold-ornament);
  padding: 1px 7px;
  border-radius: 2px;
  margin-right: 5px;
}
.bld-urlcard-body {
  font-size: 12px;
  color: var(--text-default);
  line-height: 1.45;
  margin-top: 3px;
}
.bld-urlcard-body b {
  color: var(--gold-title);
}
.bld-urlcard-steps {
  margin: 6px 0 4px;
  padding-left: 20px;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.5;
}
.bld-urlcard-btns {
  margin-top: 4px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.bld-urlcard-btns .bld-btn {
  display: inline-block;
  text-decoration: none;
}
.bld-urlcard-loading {
  font-size: 12.5px;
  color: var(--gem-teal);
  font-style: normal;
  padding: 4px 0;
}
.bld-urlcard-warn {
  font-size: 11.5px;
  color: #e0a44f;
  margin: 3px 0;
  line-height: 1.4;
}
.bld-urlcard-note {
  margin-top: 7px;
  font-size: 10px;
  color: var(--text-muted);
  font-style: normal;
  border-top: 1px solid rgba(184, 154, 102, 0.18);
  padding-top: 5px;
}
.bld-imported {
  flex: none;
  font-size: 11.5px;
  color: var(--gem-teal);
  background: rgba(122, 211, 197, 0.08);
  border: 1px solid rgba(122, 211, 197, 0.3);
  padding: 5px 9px;
}
/* .build dosyası sürükle-bırak bölgesi */
.bld-drop {
  flex: none;
  margin-top: 7px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  border: 1px dashed rgba(207, 168, 95, 0.45);
  border-radius: 5px;
  background: rgba(207, 168, 95, 0.05);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.bld-drop:hover,
.bld-drop--over {
  background: rgba(207, 168, 95, 0.12);
  border-color: rgba(207, 168, 95, 0.85);
}
.bld-drop-ic {
  font-size: 15px;
}
.bld-drop-txt {
  font-size: 12px;
  color: #e6d2a8;
}
.bld-drop-sub {
  font-size: 11px;
  color: #9b8a6a;
}
.bld-drop-input {
  display: none;
}
.bld-dbreport {
  flex: none;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--gem-teal);
  background: rgba(122, 211, 197, 0.08);
  border: 1px solid rgba(122, 211, 197, 0.3);
  border-radius: 4px;
  padding: 5px 9px;
}
.bld-dbreport-notes {
  margin: 4px 0 0;
  padding-left: 16px;
  color: #d0a86a;
  font-size: 11px;
}
/* Görünüm geçişi (Liste / Oyun Görünümü) — Faz 3 */
.bld-viewtoggle {
  display: flex;
  gap: 4px;
  flex: none;
}
.bld-vtab {
  font: inherit;
  font-size: 11.5px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #b8a982;
  background: #16130e;
  border: 1px solid rgba(184, 154, 102, 0.3);
  padding: 3px 14px;
  cursor: pointer;
}
.bld-vtab--on {
  color: var(--gem-teal, #7ad3c5);
  background: rgba(122, 211, 197, 0.1);
  border-color: var(--gem-teal, #7ad3c5);
}
/* .build export (Faz 2) */
.bld-btn--export {
  color: #1a2410;
  background: linear-gradient(#8fd07a, #6fb058);
  border-color: #4f8a3e;
}
.bld-btn--filter {
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border-color: #9a7330;
}
/* --- loot filter üretici (Faz 6-7) --- */
.bld-filter {
  flex: none;
  padding: 10px 12px;
  margin-top: 2px;
  font-size: 11.5px;
}
.bld-filter-head {
  font-size: 13px;
  color: var(--accent, #d8a857);
  font-variant: small-caps;
  letter-spacing: 0.03em;
}
.bld-filter-note {
  color: var(--text-muted);
  margin: 3px 0 8px;
  line-height: 1.4;
}
.bld-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.bld-filter-lbl {
  flex: 0 0 78px;
  color: #b8a878;
  font-variant: small-caps;
}
.bld-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.bld-chip {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 3px;
  cursor: pointer;
  color: #c8bca0;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(160, 130, 70, 0.35);
}
.bld-chip:hover {
  border-color: rgba(216, 168, 87, 0.7);
}
.bld-chip--on {
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border-color: #9a7330;
  font-weight: 600;
}
.bld-filter-actions {
  display: flex;
  gap: 8px;
  margin-top: 9px;
}
.bld-filter-result {
  margin-top: 10px;
}
.bld-filter-ok {
  color: #8fd07a;
  font-size: 11px;
}
.bld-export {
  flex: none;
  font-size: 11.5px;
  padding: 8px 11px;
  margin-top: 2px;
}
.bld-export--ok {
  color: #cfe8c4;
  background: rgba(127, 207, 106, 0.08);
  border: 1px solid rgba(127, 207, 106, 0.4);
}
.bld-export--err {
  color: #e08a5a;
  background: rgba(224, 138, 90, 0.08);
  border: 1px solid rgba(224, 138, 90, 0.4);
}
.bld-export-head {
  font-size: 12.5px;
  color: #8fd07a;
  font-variant: small-caps;
  letter-spacing: 0.03em;
}
.bld-export-note {
  color: var(--text-muted);
  margin: 3px 0;
}
.bld-export-path {
  display: block;
  font-family: 'Consolas', monospace;
  font-size: 10.5px;
  color: #b8c9a8;
  background: rgba(0, 0, 0, 0.3);
  padding: 3px 6px;
  margin: 4px 0;
  word-break: break-all;
}
.bld-export-stats {
  font-size: 10.5px;
  color: var(--text-muted);
}
.bld-export-warn {
  list-style: none;
  margin: 5px 0 0;
  padding: 0;
  font-size: 10px;
  color: #e0a44f;
}
.bld-export-actions {
  display: flex;
  gap: 8px;
  margin-top: 7px;
}
/* Yazar Notları */
.bld-notes {
  flex: none;
  max-height: 230px;
  padding: 8px 12px;
  gap: 5px;
}
.bld-notes-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bld-notes-title {
  font-variant: small-caps;
  letter-spacing: 0.03em;
  font-size: 13px;
  color: var(--gold-title);
  margin-right: 6px;
}
.bld-notes-lang {
  display: flex;
  gap: 3px;
}
.bld-minibtn {
  font-family: var(--font-serif);
  font-size: 10.5px;
  font-variant: small-caps;
  color: var(--gold-ornament);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--frame-brown, #4a3d28);
  padding: 2px 8px;
  cursor: pointer;
}
.bld-minibtn:hover {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
.bld-minibtn--on {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.bld-minibtn--accent {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.bld-minibtn:disabled {
  opacity: 0.55;
  cursor: default;
}
.bld-notes-badge {
  font-size: 9.5px;
  color: #7fcf6a;
  border: 1px solid rgba(127, 207, 106, 0.4);
  border-radius: 2px;
  padding: 0 5px;
  margin-left: 6px;
  cursor: help;
}
.bld-notes-hint {
  font-size: 10.5px;
  font-style: normal;
  color: var(--gold-ornament);
  border: 1px solid rgba(184, 154, 102, 0.3);
  padding: 2px 7px;
  border-radius: 2px;
}
.bld-notes-warn {
  font-size: 11px;
  color: #e0a44f;
}
.bld-notes-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-default);
  padding-right: 6px;
}
.bld-notes-src {
  flex: none;
  font-size: 10px;
  color: var(--text-muted);
  border-top: 1px solid rgba(184, 154, 102, 0.18);
  padding-top: 5px;
}
.bld-notes-src b {
  color: var(--gold-ornament);
}
.bld-notes-link {
  color: var(--gem-teal);
  text-decoration: none;
}
.bld-notes-link:hover {
  text-decoration: underline;
}
.bld-help,
.bld-empty {
  color: var(--text-muted);
  font-style: normal;
  padding: 14px;
}
.bld-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
}
.bld-treebtn {
  margin-top: 8px;
}
.bld-lvbadge {
  align-self: center;
  font-size: 11px;
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gem-teal);
  border-radius: 2px;
  padding: 1px 7px;
  font-weight: 600;
  margin-left: auto;
}
.bld-treeview {
  flex: 1;
  min-height: 0;
}
.bld-treebar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.2);
}
.bld-stages--tree {
  flex: 1;
  padding-bottom: 0;
  border-bottom: none;
}
.bld-treecount {
  flex: none;
  font-size: 12px;
  font-variant: small-caps;
  color: var(--text-muted);
}
.bld-treecount b {
  color: var(--gem-teal);
  font-size: 15px;
}
.bld-treehost {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
}
.panel-frame {
  border: 13px solid transparent;
  border-image: url(../../assets/ui/frame-border3.png) 16 repeat;
  background:
    linear-gradient(rgba(13, 16, 17, 0.82), rgba(8, 11, 12, 0.88)),
    url(../../assets/ui/panel-filler.png);
  background-size: auto, 100% auto;
  background-repeat: no-repeat, repeat-y;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bld-stages {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.2);
}
.bld-stage {
  font-family: var(--font-serif);
  font-size: 11px;
  font-variant: small-caps;
  color: var(--gold-ornament);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--frame-brown, #4a3d28);
  padding: 3px 9px;
  cursor: pointer;
}
.bld-stage:hover {
  color: #fff;
}
.bld-stage--on {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.bld-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 8px;
}
.bld-sechead {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: var(--gem-teal);
  margin: 8px 0 4px;
}
.bld-gems {
  list-style: none;
  margin: 0;
  padding: 0;
}
.bld-gem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  font-size: 12.5px;
}
.bld-gem--sup {
  padding-left: 14px;
}
.bld-gem--miss {
  opacity: 0.5;
}
.bld-gemic {
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex: none;
}
.bld-gemph {
  width: 22px;
  text-align: center;
  color: var(--gold-ornament);
  flex: none;
}
.bld-gemname {
  flex: 1;
  color: var(--text-default);
}
.bld-gem--sup .bld-gemname {
  color: var(--text-muted);
}
.bld-gemmeta {
  font-size: 11px;
  color: var(--gold-ornament);
  flex: none;
}
.bld-miss {
  font-size: 10px;
  font-variant: small-caps;
  color: #e0664f;
  border: 1px solid rgba(224, 102, 79, 0.4);
  padding: 0 4px;
  border-radius: 2px;
}
.bld-passives {
  font-size: 12.5px;
}
.bld-passline b {
  color: var(--gem-teal);
  font-size: 15px;
}
.bld-passdim {
  color: var(--text-muted);
}
.bld-notables {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 5px;
  margin: 6px 0;
}
.bld-notable {
  font-size: 11px;
  color: var(--gold-title);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(184, 154, 102, 0.3);
  padding: 1px 6px;
  border-radius: 2px;
}
/* #7: okunur slot → eşya listesi */
.bld-itemlist {
  flex: none;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.2);
}
.bld-itemli {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid transparent;
  border-left: 2px solid rgba(184, 154, 102, 0.35);
  cursor: pointer;
  padding: 3px 6px;
  font: inherit;
}
.bld-itemli:hover {
  background: rgba(184, 154, 102, 0.1);
}
.bld-itemli-slot {
  flex: none;
  width: 92px;
  font-size: 11px;
  font-variant: small-caps;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bld-itemli-ic {
  flex: none;
  width: 26px;
  height: 26px;
  object-fit: contain;
}
.bld-itemli-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bld-itemli-cmp {
  flex: none;
  color: #9fb4d8;
  font-size: 12px;
}
.bld-itemli--on {
  border-color: var(--gem-teal);
  border-left-color: var(--gem-teal);
  background: rgba(74, 160, 140, 0.12);
}
.bld-itemli--miss {
  opacity: 0.55;
}
.bld-itemli--cmp {
  border-left-color: #7890b8;
}
.bld-cmptarget {
  color: #9fb4d8;
  font-size: 10px;
}
.bld-trade {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.bld-craftbtn {
  font: inherit;
  font-size: 11.5px;
  font-variant: small-caps;
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border: 1px solid #9a7330;
  padding: 3px 11px;
  border-radius: 2px;
  cursor: pointer;
  margin-right: 6px;
}
.bld-craftbtn:hover {
  background: linear-gradient(#ecc279, #d6a052);
}
.bld-tradebtn {
  font: inherit;
  font-size: 11.5px;
  color: #e3c172;
  background: transparent;
  border: 1px solid rgba(201, 161, 74, 0.55);
  padding: 3px 11px;
  border-radius: 2px;
  cursor: pointer;
}
.bld-tradebtn:hover {
  background: rgba(201, 161, 74, 0.12);
}
.bld-tradebtn:disabled {
  opacity: 0.5;
  cursor: default;
}
.bld-tradenote {
  font-size: 10px;
  color: var(--text-muted);
}
.bld-tradefoot {
  margin-top: 4px;
  font-size: 9px;
  color: var(--text-muted);
  opacity: 0.75;
}
.bld-itemph {
  color: var(--gold-ornament);
}
.bld-itemdetail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 8px;
}
.bld-itemname {
  font-variant: small-caps;
  font-size: 17px;
  margin-bottom: 4px;
}
.rar-rare {
  color: var(--rarity-rare, #ffff77);
}
.rar-magic {
  color: var(--rarity-magic, #8888ff);
}
.rar-normal {
  color: var(--rarity-normal, #c8c8c8);
}
.rar-unique {
  color: var(--rarity-unique, #af6025);
}
.bld-itemmeta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12px;
  color: var(--gold-ornament);
  margin-bottom: 6px;
}
.bld-mods {
  list-style: none;
  margin: 0 0 10px;
  padding: 6px 0;
  border-top: 1px solid rgba(184, 154, 102, 0.18);
}
.bld-mods li {
  font-size: 12.5px;
  color: #8aa0d8;
  text-align: center;
  line-height: 1.5;
}
.bld-phhead {
  font-variant: small-caps;
  letter-spacing: 0.03em;
  font-size: 12px;
  color: var(--gem-teal);
}
.bld-regex {
  margin-top: 8px;
  border: 1px solid rgba(184, 154, 102, 0.3);
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 10px;
}
.bld-rxrow {
  display: flex;
  align-items: stretch;
  gap: 6px;
  margin-top: 6px;
}
.bld-rxrow--base {
  margin-top: 8px;
}
.bld-rxcode {
  flex: 1;
  min-width: 0;
  font-family: monospace;
  font-size: 12px;
  color: var(--gem-teal);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--frame-brown, #4a3d28);
  padding: 5px 7px;
  word-break: break-all;
  line-height: 1.35;
}
.bld-rxrow--base .bld-rxcode {
  color: var(--gold-title);
}
.bld-cpbtn {
  flex: none;
  font-family: var(--font-serif);
  font-size: 11px;
  font-variant: small-caps;
  color: var(--gold-title);
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 0 10px;
  cursor: pointer;
  white-space: nowrap;
}
.bld-cpbtn:hover {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
.bld-rxmeta {
  font-size: 10.5px;
  color: var(--text-muted);
  margin-top: 4px;
}
.bld-rxtrunc {
  color: #d39a4f;
}
.bld-rxnone {
  font-size: 11.5px;
  color: var(--text-muted);
  font-style: normal;
  margin-top: 6px;
}
.bld-rxnote {
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-top: 8px;
  border-top: 1px solid rgba(184, 154, 102, 0.15);
  padding-top: 6px;
}
.bld-quest {
  flex: none;
  margin-top: 12px;
  border: 1px solid rgba(184, 154, 102, 0.3);
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 10px;
}
.bld-qstage {
  font-variant: normal;
  font-size: 11px;
  color: var(--gem-teal);
}
.bld-qskills {
  font-size: 12px;
  color: var(--text-default);
  margin: 6px 0 8px;
  line-height: 1.45;
}
.bld-qskills b {
  color: var(--gem-teal);
}
.bld-qrewards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bld-qrow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  font-size: 12px;
}
.bld-qkind {
  font-variant: small-caps;
  font-size: 11px;
  min-width: 130px;
  color: var(--text-muted);
}
.bld-qkind--skill {
  color: #e0b066;
}
.bld-qkind--sup {
  color: #8aa0d8;
}
.bld-qkind--spirit {
  color: #b98ad8;
}
.bld-qlvl {
  color: var(--gold-title);
  font-weight: 600;
}
.bld-qarea {
  color: var(--text-default);
}
.bld-qflag {
  font-size: 10px;
  font-variant: small-caps;
  color: #d39a4f;
  border: 1px solid rgba(211, 154, 79, 0.4);
  padding: 0 4px;
  border-radius: 2px;
}
.bld-qnote {
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-top: 8px;
  border-top: 1px solid rgba(184, 154, 102, 0.15);
  padding-top: 6px;
}
</style>
