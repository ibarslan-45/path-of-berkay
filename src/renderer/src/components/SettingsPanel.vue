<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { CONTACT } from '../../../config/contact'

const props = defineProps<{ isTr: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'toggle-lang'): void; (e: 'show-tour'): void; (e: 'show-whats-new'): void; (e: 'show-feedback'): void }>()

type TrackerMode = 'inapp' | 'overlay' | 'both' | 'off'
type OverlayCorner = 'tl' | 'tr' | 'bl' | 'br'
interface LogStatus {
  path: string
  exists: boolean
  watching: boolean
}
type LlmProvider = 'claude' | 'openai' | 'gemini'
interface AppSettings {
  mode: TrackerMode
  overlay: { opacity: number; corner: OverlayCorner; scale: number; fontScale: number }
  advisor: {
    mode: 'offline' | 'llm'
    provider: LlmProvider
    hasKey: boolean
    model: string
    keysPresent: Record<LlmProvider, boolean>
    models: Record<LlmProvider, string>
  }
  priceCheck: { enabled: boolean; shortcut: string; shortcutOk: boolean }
  dangerCheck: { enabled: boolean; shortcut: string; shortcutOk: boolean }
  autoCopy: boolean
  tradeOpen: 'app' | 'browser'
  closeToTray: boolean
  poe2AutoShow: boolean
  launchOnStartup: boolean
  ui: { font: string; zoom: number }
  log: LogStatus
}

const tr = (a: string, b: string): string => (props.isTr ? a : b)

const mode = ref<TrackerMode>('inapp')
const opacity = ref(0.85)
const corner = ref<OverlayCorner>('tr')
const scale = ref(1)
const fontScale = ref(1)
const log = ref<LogStatus>({ path: '', exists: false, watching: false })
const confirmReset = ref(false)
const advisorMode = ref<'offline' | 'llm'>('offline')
const advisorProvider = ref<LlmProvider>('claude')
const advisorHasKey = ref(false) // seçili sağlayıcı
const keysPresent = ref<Record<LlmProvider, boolean>>({ claude: false, openai: false, gemini: false })
const models = ref<Record<LlmProvider, string>>({ claude: '', openai: '', gemini: '' })
const apiKeyInput = ref('')
const modelInput = ref('')
const keySaved = ref(false)
const priceEnabled = ref(true)
const priceShortcut = ref('CommandOrControl+D')
const priceShortcutOk = ref(true)
const capturingShortcut = ref(false)
const dangerEnabled = ref(true)
const dangerShortcut = ref('CommandOrControl+E')
const dangerShortcutOk = ref(true)
const capturingDanger = ref(false)
const autoCopy = ref(false) // 0.17.0: varsayılan KAPALI
const tradeOpen = ref<'app' | 'browser'>('app') // 0.17.8: Trade nerede açılsın
const closeToTray = ref(true) // 0.18.0
const poe2AutoShow = ref(false)
const launchOnStartup = ref(false)
const uiFont = ref('helvetica')
const uiZoom = ref(1)
let unsub: (() => void) | null = null

const UI_FONTS: { key: string; tr: string; en: string }[] = [
  { key: 'helvetica', tr: 'Helvetica', en: 'Helvetica' },
  { key: 'system', tr: 'Sistem', en: 'System' },
  { key: 'serif', tr: 'Serif (Fontin)', en: 'Serif (Fontin)' }
]
function setUiFont(f: string): void {
  uiFont.value = f
  window.api?.settings.set({ ui: { font: f } })
}
function setUiZoom(): void {
  window.api?.settings.set({ ui: { zoom: uiZoom.value } })
}
function toggleAutoCopy(): void {
  autoCopy.value = !autoCopy.value
  window.api?.settings.set({ autoCopy: autoCopy.value })
}
function setTradeOpen(v: 'app' | 'browser'): void {
  tradeOpen.value = v
  window.api?.settings.set({ tradeOpen: v })
}
function toggleCloseToTray(): void {
  closeToTray.value = !closeToTray.value
  window.api?.settings.set({ closeToTray: closeToTray.value })
}
function togglePoe2AutoShow(): void {
  poe2AutoShow.value = !poe2AutoShow.value
  window.api?.settings.set({ poe2AutoShow: poe2AutoShow.value })
}
function toggleLaunchOnStartup(): void {
  launchOnStartup.value = !launchOnStartup.value
  window.api?.settings.set({ launchOnStartup: launchOnStartup.value })
}

// --- İletişim / Hakkında (ADIM D) ---
const contact = CONTACT
const appVersion = ref('')
const discordCopied = ref(false)
async function copyDiscord(): Promise<void> {
  try {
    await navigator.clipboard.writeText(contact.discord)
    discordCopied.value = true
    setTimeout(() => (discordCopied.value = false), 1500)
  } catch {
    /* sessiz */
  }
}
function openEmail(): void {
  window.api?.openExternal?.('mailto:' + contact.email)
}
function openSite(): void {
  if (contact.site) window.api?.openExternal?.(contact.site)
}

// --- Güncelleme (ADIM C) ---
interface UpdateState {
  status: string
  currentVersion: string
  newVersion: string | null
  notes: string[]
  progress: number
  lastCheck: number | null
  error: string
  portable: boolean
}
const upd = ref<UpdateState | null>(null)
let updUnsub: (() => void) | null = null
async function checkUpdates(): Promise<void> {
  upd.value = (await window.api?.update?.check().catch(() => null)) as UpdateState | null
}
function installUpdate(): void {
  window.api?.update?.install()
}
function downloadUpdate(): void {
  window.api?.update?.download()
}
const updStatusText = computed<string>(() => {
  const s = upd.value?.status
  switch (s) {
    case 'checking':
      return tr('kontrol ediliyor…', 'checking…')
    case 'available':
      return tr('yeni sürüm var: v', 'new version: v') + (upd.value?.newVersion ?? '')
    case 'not-available':
      return tr('güncel (en son sürümdesin)', 'up to date')
    case 'downloading':
      return tr('indiriliyor… %', 'downloading… ') + (upd.value?.progress ?? 0) + '%'
    case 'downloaded':
      return tr('indirildi — yeniden başlat & kur', 'downloaded — restart & install')
    case 'disabled-portable':
      return tr('portable sürüm — siteden güncelle', 'portable build — update from the site')
    case 'disabled-dev':
      return tr('geliştirme modu (güncelleme kapalı)', 'dev mode (updates off)')
    case 'error':
      return tr('kontrol edilemedi (ağ/feed)', 'check failed (network/feed)')
    default:
      return tr('—', '—')
  }
})
function fmtTime(ts: number | null): string {
  if (!ts) return tr('hiç', 'never')
  return new Date(ts).toLocaleString()
}

function apply(s: AppSettings): void {
  mode.value = s.mode
  opacity.value = s.overlay.opacity
  corner.value = s.overlay.corner
  scale.value = s.overlay.scale ?? 1
  fontScale.value = s.overlay.fontScale ?? 1
  if (s.advisor) {
    advisorMode.value = s.advisor.mode
    advisorProvider.value = s.advisor.provider
    advisorHasKey.value = s.advisor.hasKey
    if (s.advisor.keysPresent) keysPresent.value = s.advisor.keysPresent
    if (s.advisor.models) {
      models.value = s.advisor.models
      modelInput.value = s.advisor.models[s.advisor.provider] ?? ''
    }
  }
  if (s.priceCheck) {
    priceEnabled.value = s.priceCheck.enabled
    priceShortcut.value = s.priceCheck.shortcut
    priceShortcutOk.value = s.priceCheck.shortcutOk
  }
  if (s.dangerCheck) {
    dangerEnabled.value = s.dangerCheck.enabled
    dangerShortcut.value = s.dangerCheck.shortcut
    dangerShortcutOk.value = s.dangerCheck.shortcutOk
  }
  if (typeof s.autoCopy === 'boolean') autoCopy.value = s.autoCopy
  if (s.tradeOpen === 'app' || s.tradeOpen === 'browser') tradeOpen.value = s.tradeOpen
  if (typeof s.closeToTray === 'boolean') closeToTray.value = s.closeToTray
  if (typeof s.poe2AutoShow === 'boolean') poe2AutoShow.value = s.poe2AutoShow
  if (typeof s.launchOnStartup === 'boolean') launchOnStartup.value = s.launchOnStartup
  if (s.ui) {
    uiFont.value = s.ui.font || 'helvetica'
    uiZoom.value = s.ui.zoom ?? 1
  }
  log.value = s.log
}
onMounted(async () => {
  const api = window.api?.settings
  if (api) {
    apply((await api.get()) as AppSettings)
    unsub = api.onChanged((s) => apply(s as AppSettings))
  }
  window.addEventListener('keydown', onCaptureKey, true)
  window.addEventListener('keydown', onCaptureDangerKey, true)
  appVersion.value = (await window.api?.appVersion?.().catch(() => '')) || ''
  upd.value = (await window.api?.update?.getState().catch(() => null)) as UpdateState | null
  updUnsub = window.api?.update?.onStatus((s) => (upd.value = s as UpdateState)) ?? null
})
onBeforeUnmount(() => {
  unsub?.()
  updUnsub?.()
  window.removeEventListener('keydown', onCaptureKey, true)
  window.removeEventListener('keydown', onCaptureDangerKey, true)
})

const MODES: { key: TrackerMode; tr: string; en: string }[] = [
  { key: 'inapp', tr: 'Uygulama içi', en: 'In-app' },
  { key: 'overlay', tr: 'Overlay', en: 'Overlay' },
  { key: 'both', tr: 'İkisi', en: 'Both' },
  { key: 'off', tr: 'Kapalı', en: 'Off' }
]
const CORNERS: { key: OverlayCorner; tr: string; en: string }[] = [
  { key: 'tl', tr: 'Sol üst', en: 'Top-left' },
  { key: 'tr', tr: 'Sağ üst', en: 'Top-right' },
  { key: 'bl', tr: 'Sol alt', en: 'Bottom-left' },
  { key: 'br', tr: 'Sağ alt', en: 'Bottom-right' }
]

function setMode(m: TrackerMode): void {
  mode.value = m
  window.api?.settings.set({ mode: m })
}
function setOpacity(): void {
  window.api?.settings.set({ overlay: { opacity: opacity.value } })
}
function setCorner(c: OverlayCorner): void {
  corner.value = c
  window.api?.settings.set({ overlay: { corner: c } })
}
function setScale(): void {
  window.api?.settings.set({ overlay: { scale: scale.value } })
}
function setFontScale(): void {
  window.api?.settings.set({ overlay: { fontScale: fontScale.value } })
}
async function browse(): Promise<void> {
  const st = (await window.api?.leveling.pickLog()) as LogStatus | undefined
  if (st) log.value = st
}
async function autoDetect(): Promise<void> {
  const st = (await window.api?.leveling.autoDetectLog()) as LogStatus | undefined
  if (st) log.value = st
}
function doReset(): void {
  if (!confirmReset.value) {
    confirmReset.value = true
    return
  }
  window.api?.leveling.reset()
  confirmReset.value = false
}
function setAdvisorMode(m: 'offline' | 'llm'): void {
  advisorMode.value = m
  window.api?.settings.set({ advisor: { mode: m } })
}
// Sağlayıcı listesi (UI + anahtar-alma linkleri)
const PROVIDERS: { key: LlmProvider; label: string; keyUrl: string }[] = [
  { key: 'claude', label: 'Claude', keyUrl: 'console.anthropic.com' },
  { key: 'openai', label: 'ChatGPT', keyUrl: 'platform.openai.com/api-keys' },
  { key: 'gemini', label: 'Gemini', keyUrl: 'aistudio.google.com/apikey' }
]
function setProvider(p: LlmProvider): void {
  if (p === advisorProvider.value) return
  advisorProvider.value = p
  advisorHasKey.value = keysPresent.value[p]
  modelInput.value = models.value[p] ?? ''
  apiKeyInput.value = '' // farklı sağlayıcıya geçince giriş kutusunu temizle
  window.api?.settings.set({ advisor: { provider: p } })
}
function saveApiKey(): void {
  const k = apiKeyInput.value.trim()
  // apiKey aktif sağlayıcıya yazılır (main provider'a göre yönlendirir)
  window.api?.settings.set({ advisor: { apiKey: k } })
  advisorHasKey.value = !!k
  keysPresent.value = { ...keysPresent.value, [advisorProvider.value]: !!k }
  apiKeyInput.value = '' // ekranda tutma
  keySaved.value = true
  setTimeout(() => (keySaved.value = false), 1500)
}
function clearApiKey(): void {
  window.api?.settings.set({ advisor: { apiKey: '' } })
  advisorHasKey.value = false
  keysPresent.value = { ...keysPresent.value, [advisorProvider.value]: false }
  apiKeyInput.value = ''
}
function saveModel(): void {
  const m = modelInput.value.trim()
  models.value = { ...models.value, [advisorProvider.value]: m }
  window.api?.settings.set({ advisor: { model: m } })
}
const providerLabel = (p: LlmProvider): string => PROVIDERS.find((x) => x.key === p)?.label ?? p
const providerKeyUrl = (p: LlmProvider): string => PROVIDERS.find((x) => x.key === p)?.keyUrl ?? ''

// Anahtar nasıl alınır — sağlayıcı başına tam URL + adımlar (uydurma sayı yok; limit/fiyat için sağlayıcıya yönlendir)
const KEY_GUIDE: Record<LlmProvider, { url: string; tr: string[]; en: string[]; note?: { tr: string; en: string } }> = {
  claude: {
    url: 'https://console.anthropic.com/settings/keys',
    tr: ['console.anthropic.com → giriş yap / kaydol', 'Settings → API Keys', '“Create Key” → adı yaz → anahtarı kopyala', 'Aşağıdaki kutuya yapıştır → Kaydet'],
    en: ['console.anthropic.com → sign in / sign up', 'Settings → API Keys', '“Create Key” → name it → copy the key', 'Paste into the box below → Save']
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    tr: ['platform.openai.com/api-keys → giriş yap', '“Create new secret key” → kopyala', 'Aşağıdaki kutuya yapıştır → Kaydet'],
    en: ['platform.openai.com/api-keys → sign in', '“Create new secret key” → copy', 'Paste into the box below → Save'],
    note: { tr: 'Kullanım için faturalandırma/bakiye gerekebilir — ayrıntı için sağlayıcının sayfasına bak.', en: 'Usage may require billing/credit — check the provider’s page for details.' }
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    tr: ['aistudio.google.com/apikey → Google ile giriş', '“Create API key” → kopyala', 'Aşağıdaki kutuya yapıştır → Kaydet'],
    en: ['aistudio.google.com/apikey → sign in with Google', '“Create API key” → copy', 'Paste into the box below → Save']
  }
}
const showKeyGuide = ref(false)
function openKeyPage(): void {
  window.api?.openExternal?.(KEY_GUIDE[advisorProvider.value].url)
}

// --- Oyun-içi fiyat kontrolü (Faz 2) ---
function togglePriceEnabled(): void {
  priceEnabled.value = !priceEnabled.value
  window.api?.settings.set({ priceCheck: { enabled: priceEnabled.value } })
}
// Kısayolu yakala: bir sonraki tuş kombinasyonunu Electron accelerator metnine çevir.
function startCapture(): void {
  capturingShortcut.value = true
}
function onCaptureKey(e: KeyboardEvent): void {
  if (!capturingShortcut.value) return
  e.preventDefault()
  const k = e.key
  // yalnız modifier basıldıysa bekle
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return
  if (k === 'Escape') {
    capturingShortcut.value = false
    return
  }
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let key = k
  if (/^[a-z]$/i.test(k)) key = k.toUpperCase()
  else if (/^F\d{1,2}$/.test(k)) key = k
  else if (k === ' ') key = 'Space'
  else if (/^[0-9]$/.test(k)) key = k
  else key = k.length === 1 ? k.toUpperCase() : k
  parts.push(key)
  if (parts.length < 2) return // en az bir modifier iste (yanlış-tetik önler)
  priceShortcut.value = parts.join('+')
  capturingShortcut.value = false
  window.api?.settings.set({ priceCheck: { shortcut: priceShortcut.value } })
}

// --- Oyun-içi tehlike kontrolü (Faz 8) — aynı yakalama deseni ---
function toggleDangerEnabled(): void {
  dangerEnabled.value = !dangerEnabled.value
  window.api?.settings.set({ dangerCheck: { enabled: dangerEnabled.value } })
}
function startCaptureDanger(): void {
  capturingDanger.value = true
}
function onCaptureDangerKey(e: KeyboardEvent): void {
  if (!capturingDanger.value) return
  e.preventDefault()
  const k = e.key
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return
  if (k === 'Escape') {
    capturingDanger.value = false
    return
  }
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let key = k
  if (/^[a-z]$/i.test(k)) key = k.toUpperCase()
  else if (/^F\d{1,2}$/.test(k)) key = k
  else if (k === ' ') key = 'Space'
  else if (/^[0-9]$/.test(k)) key = k
  else key = k.length === 1 ? k.toUpperCase() : k
  parts.push(key)
  if (parts.length < 2) return
  dangerShortcut.value = parts.join('+')
  capturingDanger.value = false
  window.api?.settings.set({ dangerCheck: { shortcut: dangerShortcut.value } })
}
</script>

<template>
  <div class="set-backdrop" @click.self="emit('close')">
    <div class="set-panel">
      <header class="set-head">
        <span class="set-title">{{ tr('Ayarlar', 'Settings') }}</span>
        <button class="set-x" :aria-label="tr('Kapat', 'Close')" @click="emit('close')">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" stroke-width="1.6" fill="none" />
          </svg>
        </button>
      </header>

      <div class="set-body">
        <!-- 1) MOD -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Tracker modu', 'Tracker mode') }}</div>
          <div class="set-seg">
            <button
              v-for="m in MODES"
              :key="m.key"
              class="set-segbtn"
              :class="{ 'set-segbtn--on': mode === m.key }"
              @click="setMode(m.key)"
            >
              {{ isTr ? m.tr : m.en }}
            </button>
          </div>
          <div class="set-hint">
            {{ tr('Overlay için PoE 2 Windowed Fullscreen / Borderless olmalı.', 'For overlay, run PoE 2 in Windowed Fullscreen / Borderless.') }}
          </div>
        </div>

        <!-- 1b) ARAYÜZ — YAZI TİPİ + BOYUT (0.15.1) -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Arayüz — Yazı tipi & boyut', 'Interface — Font & size') }}</div>
          <div class="set-cornerrow">
            <span class="set-sub">{{ tr('Yazı tipi', 'Font') }}</span>
            <button
              v-for="f in UI_FONTS"
              :key="f.key"
              class="set-cbtn"
              :class="{ 'set-cbtn--on': uiFont === f.key }"
              @click="setUiFont(f.key)"
            >
              {{ isTr ? f.tr : f.en }}
            </button>
          </div>
          <div class="set-opacrow">
            <span class="set-sub">{{ tr('Boyut', 'Size') }}</span>
            <input type="range" min="0.8" max="1.4" step="0.05" v-model.number="uiZoom" class="set-range" @input="setUiZoom" @change="setUiZoom" />
            <span class="set-opacval">{{ Math.round(uiZoom * 100) }}%</span>
          </div>
          <div class="set-hint">
            {{ tr('Tüm arayüzün yazı tipini ve boyutunu değiştirir; anında uygulanır ve kapanınca da korunur. Helvetica varsayılandır (ornate başlıklar serif kalır).', 'Changes the whole interface font and size; applied instantly and kept after restart. Helvetica is the default (ornate titles stay serif).') }}
          </div>
        </div>

        <!-- 2) CLIENT.TXT -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Client.txt log dosyası', 'Client.txt log file') }}</div>
          <div class="set-pathrow">
            <input class="set-path" :value="log.path || tr('(bulunamadı)', '(not found)')" readonly :title="log.path" />
            <span class="set-status" :class="log.exists ? 'set-status--ok' : 'set-status--bad'">
              {{ log.exists ? tr('Bulundu', 'Found') : tr('Yok', 'Missing') }}
            </span>
          </div>
          <div class="set-btnrow">
            <button class="set-btn" @click="browse">{{ tr('Gözat…', 'Browse…') }}</button>
            <button class="set-btn" @click="autoDetect">{{ tr('Otomatik bul', 'Auto-detect') }}</button>
            <span class="set-watch" :class="{ 'set-watch--on': log.watching }">
              {{ log.watching ? tr('● izleniyor', '● watching') : tr('○ kapalı', '○ idle') }}
            </span>
          </div>
          <div class="set-hint">
            {{ tr('Yalnızca log okunur (GGG ToS uyumlu). Hafıza okuma / otomasyon YOK.', 'Only the log is read (GGG ToS-safe). No memory reading / automation.') }}
          </div>
        </div>

        <!-- 3) OVERLAY -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Overlay görünümü', 'Overlay appearance') }}</div>
          <div class="set-opacrow">
            <span class="set-sub">{{ tr('Opaklık', 'Opacity') }}</span>
            <input type="range" min="0.3" max="1" step="0.05" v-model.number="opacity" class="set-range" @change="setOpacity" />
            <span class="set-opacval">{{ Math.round(opacity * 100) }}%</span>
          </div>
          <div class="set-opacrow">
            <span class="set-sub">{{ tr('Boyut', 'Size') }}</span>
            <input type="range" min="0.7" max="1.8" step="0.05" v-model.number="scale" class="set-range" @change="setScale" />
            <span class="set-opacval">{{ Math.round(scale * 100) }}%</span>
          </div>
          <div class="set-opacrow">
            <span class="set-sub">{{ tr('Yazı', 'Font') }}</span>
            <input type="range" min="0.8" max="1.8" step="0.05" v-model.number="fontScale" class="set-range" @change="setFontScale" />
            <span class="set-opacval">{{ Math.round(fontScale * 100) }}%</span>
          </div>
          <div class="set-cornerrow">
            <span class="set-sub">{{ tr('Köşe', 'Corner') }}</span>
            <button
              v-for="c in CORNERS"
              :key="c.key"
              class="set-cbtn"
              :class="{ 'set-cbtn--on': corner === c.key }"
              @click="setCorner(c.key)"
            >
              {{ isTr ? c.tr : c.en }}
            </button>
          </div>
          <div class="set-hint">
            {{ tr('Overlay’i pin’leyip fareyle sürükleyebilirsin; bırakılan konum kaydedilir.', 'Pin the overlay and drag it with the mouse; the dropped position is saved.') }}
          </div>
        </div>

        <!-- 4) CRAFT DANIŞMANI -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Craft Danışmanı', 'Craft Advisor') }}</div>
          <div class="set-seg">
            <button
              class="set-segbtn"
              :class="{ 'set-segbtn--on': advisorMode === 'offline' }"
              @click="setAdvisorMode('offline')"
            >
              {{ tr('Offline (ücretsiz)', 'Offline (free)') }}
            </button>
            <button
              class="set-segbtn"
              :class="{ 'set-segbtn--on': advisorMode === 'llm' }"
              @click="setAdvisorMode('llm')"
            >
              {{ tr('LLM (kendi anahtarın)', 'LLM (your key)') }}
            </button>
          </div>
          <template v-if="advisorMode === 'llm'">
            <!-- Sağlayıcı seçimi (Claude / ChatGPT / Gemini) — ● = anahtar kayıtlı -->
            <div class="set-sub" style="margin-top: 8px">{{ tr('LLM Sağlayıcı', 'LLM Provider') }}</div>
            <div class="set-seg" style="margin-top: 5px">
              <button
                v-for="p in PROVIDERS"
                :key="p.key"
                class="set-segbtn"
                :class="{ 'set-segbtn--on': advisorProvider === p.key }"
                @click="setProvider(p.key)"
              >
                {{ p.label }}<span v-if="keysPresent[p.key]" class="set-provkey" :title="tr('anahtar var', 'key set')"> ●</span>
              </button>
            </div>
            <!-- Anahtar nasıl alınır rehberi (seçili sağlayıcı) -->
            <div class="set-keyguide">
              <button class="set-guidetoggle" @click="showKeyGuide = !showKeyGuide">
                {{ showKeyGuide ? '▾' : '▸' }} {{ tr('Anahtar nasıl alınır?', 'How to get a key?') }} ({{ providerLabel(advisorProvider) }})
              </button>
              <button class="set-btn set-btn--open" @click="openKeyPage">↗ {{ tr('Sayfayı aç', 'Open page') }}</button>
            </div>
            <div v-if="showKeyGuide" class="set-guidebox">
              <ol class="set-guidesteps">
                <li v-for="(s, i) in (isTr ? KEY_GUIDE[advisorProvider].tr : KEY_GUIDE[advisorProvider].en)" :key="i">{{ s }}</li>
              </ol>
              <div v-if="KEY_GUIDE[advisorProvider].note" class="set-hint" style="color: #e0a44f; margin-top: 3px">
                ⚠ {{ isTr ? KEY_GUIDE[advisorProvider].note!.tr : KEY_GUIDE[advisorProvider].note!.en }}
              </div>
              <div class="set-hint" style="margin-top: 3px">
                {{ tr('Anahtar bu cihazda kalır; yalnız görev metni gönderilir, kişisel veri gitmez. Sayılar/limitler için sağlayıcının sayfasına bak.', 'The key stays on this device; only the task text is sent, no personal data. For numbers/limits, check the provider’s page.') }}
              </div>
            </div>
            <!-- API anahtarı (seçili sağlayıcı) -->
            <div class="set-pathrow" style="margin-top: 8px">
              <input
                v-model="apiKeyInput"
                class="set-path"
                type="password"
                :placeholder="advisorHasKey ? tr('Anahtar kayıtlı ✓ (değiştirmek için yapıştır)', 'Key saved ✓ (paste to change)') : tr('API anahtarını yapıştır', 'Paste API key')"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <div class="set-btnrow">
              <button class="set-btn" :disabled="!apiKeyInput.trim()" @click="saveApiKey">
                {{ keySaved ? tr('Kaydedildi ✓', 'Saved ✓') : tr('Anahtarı kaydet', 'Save key') }}
              </button>
              <button v-if="advisorHasKey" class="set-btn" @click="clearApiKey">{{ tr('Anahtarı sil', 'Remove key') }}</button>
              <span class="set-watch" :class="{ 'set-watch--on': advisorHasKey }">
                {{ advisorHasKey ? tr('● anahtar var', '● key set') : tr('○ anahtar yok', '○ no key') }}
              </span>
            </div>
            <!-- Model (varsayılan dolu, düzenlenebilir) -->
            <div class="set-row" style="display: flex; align-items: center; gap: 8px; margin-top: 6px">
              <span class="set-sub" style="min-width: 46px">{{ tr('Model', 'Model') }}</span>
              <input v-model="modelInput" class="set-path" style="flex: 1" spellcheck="false" @blur="saveModel" @keyup.enter="saveModel" />
              <button class="set-btn" @click="saveModel">{{ tr('Kaydet', 'Save') }}</button>
            </div>
            <div class="set-hint">
              {{ tr('Seçili sağlayıcı: ', 'Selected: ') }}<b>{{ providerLabel(advisorProvider) }}</b> — {{ tr('anahtarı buradan al: ', 'get a key at: ') }}{{ providerKeyUrl(advisorProvider) }}
            </div>
            <div class="set-hint">
              {{ tr('Her sağlayıcının anahtarı AYRI saklanır (istediğin zaman geçiş yap). Anahtar yalnız bu cihazda kalır, uygulama dışına ÇIKMAZ — yalnız main process’ten çağrı yapılır, sadece çeviri/öneri metni gönderilir, kişisel/oyun verisi YOK. Anahtarını sen girersin; biz asla anahtar girmeyiz. Anahtar yok/hata → otomatik Offline’a düşer (çökme yok).', 'Each provider’s key is stored SEPARATELY (switch anytime). The key stays on this device and NEVER leaves the app — calls are made from the main process, only the translation/advice text is sent, no personal/game data. You enter your own key; we never enter one. No key/error → falls back to Offline automatically (no crash).') }}
            </div>
          </template>
          <div v-else class="set-hint">
            {{ tr('Offline Akıllı Çözücü: ücretsiz, anahtar gerekmez, oyun kurallarında hata yapmaz.', 'Offline Smart Solver: free, no key needed, never breaks game rules.') }}
          </div>
        </div>

        <!-- 4a-bis) TEK-TUŞ KOPYALAMA (0.15.1) — fiyat (Ctrl+D) + tehlike (Ctrl+E) için ortak -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Tek tuş (otomatik kopyala)', 'One key (auto-copy)') }}</div>
          <div class="set-seg" style="margin-bottom: 7px">
            <button class="set-segbtn" :class="{ 'set-segbtn--on': autoCopy }" @click="!autoCopy && toggleAutoCopy()">{{ tr('Açık', 'On') }}</button>
            <button class="set-segbtn" :class="{ 'set-segbtn--on': !autoCopy }" @click="autoCopy && toggleAutoCopy()">{{ tr('Kapalı', 'Off') }}</button>
          </div>
          <div class="set-hint">
            {{ tr('VARSAYILAN KAPALI. Açıkken kısayola (fiyat Ctrl+D / tehlike Ctrl+E) basınca program oyuna Ctrl+C gönderir, kısa bekler, panoyu okur ve paneli gösterir — tek tuş yeter (Awakened PoE / Exiled Exchange ile aynı yöntem). ÖNEMLİ: tuş YALNIZCA ön plandaki pencere “Path of Exile 2” iken gönderilir; başka pencere odaktaysa hiçbir şey gönderilmez (yalnız mevcut pano okunur). Kapalıyken kendin Ctrl+C yaparsın. Dürüst not: açıkken oyuna tuş gönderdiği için klasik “sadece pano okuma”dan bir adım ileridir (girdi simülasyonu); kendi sorumluluğunda kullan.', 'OFF BY DEFAULT. When on, pressing the shortcut (price Ctrl+D / danger Ctrl+E) makes the app send Ctrl+C to the game, wait briefly, read the clipboard and show the panel — one key is enough (same method as Awakened PoE / Exiled Exchange). IMPORTANT: the key is sent ONLY when the foreground window is “Path of Exile 2”; if any other window is focused nothing is sent (only the existing clipboard is read). When off, you press Ctrl+C yourself. Honest note: when on it sends a key to the game, going one step beyond pure clipboard reading (input simulation); use at your own discretion.') }}
          </div>
        </div>

        <!-- 4a-ter) TRADE'DE AÇ NEREDE (0.17.8) — program-içi pencere | varsayılan tarayıcı -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Trade’de Aç — nerede açılsın', 'Open in Trade — where') }}</div>
          <div class="set-seg" style="margin-bottom: 7px">
            <button class="set-segbtn" :class="{ 'set-segbtn--on': tradeOpen === 'app' }" @click="tradeOpen !== 'app' && setTradeOpen('app')">{{ tr('Programda', 'In app') }}</button>
            <button class="set-segbtn" :class="{ 'set-segbtn--on': tradeOpen === 'browser' }" @click="tradeOpen !== 'browser' && setTradeOpen('browser')">{{ tr('Tarayıcıda', 'Browser') }}</button>
          </div>
          <div class="set-hint">
            {{ tr('Varsayılan “Programda”: trade sayfası program-içi pencerede açılır (kapatılabilir + geri butonu). Cloudflare “doğrulama” ekranını kendin tıklayıp geçersin; takılırsa pencerede “Tarayıcıda Aç” butonu çıkar. “Tarayıcıda”yı seçersen trade her zaman varsayılan tarayıcında açılır. (Doğrulama otomatik geçilmez — yalnız gerçek tarayıcı gibi davranılır.)', 'Default “In app”: the trade page opens inside the app window (closable + back button). You pass the Cloudflare “verify you are human” check yourself; if it gets stuck a “Open in Browser” button appears. Choose “Browser” to always open trade in your default browser. (The check is never auto-solved — the window just behaves like a real browser.)') }}
          </div>
        </div>

        <!-- 4b) SİSTEM TEPSİSİ (0.18.0) -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Sistem tepsisi', 'System tray') }}</div>
          <div class="set-toggle-row">
            <span>{{ tr('Kapatınca (X) tepsiye küçült', 'Minimize to tray on close (X)') }}</span>
            <div class="set-seg">
              <button class="set-segbtn" :class="{ 'set-segbtn--on': closeToTray }" @click="!closeToTray && toggleCloseToTray()">{{ tr('Açık', 'On') }}</button>
              <button class="set-segbtn" :class="{ 'set-segbtn--on': !closeToTray }" @click="closeToTray && toggleCloseToTray()">{{ tr('Kapalı', 'Off') }}</button>
            </div>
          </div>
          <div class="set-toggle-row">
            <span>{{ tr('PoE 2 açılınca PoBe’yi göster', 'Show PoBe when PoE 2 launches') }}</span>
            <div class="set-seg">
              <button class="set-segbtn" :class="{ 'set-segbtn--on': poe2AutoShow }" @click="!poe2AutoShow && togglePoe2AutoShow()">{{ tr('Açık', 'On') }}</button>
              <button class="set-segbtn" :class="{ 'set-segbtn--on': !poe2AutoShow }" @click="poe2AutoShow && togglePoe2AutoShow()">{{ tr('Kapalı', 'Off') }}</button>
            </div>
          </div>
          <div class="set-toggle-row">
            <span>{{ tr('Windows ile başlat (tepside bekler)', 'Launch with Windows (waits in tray)') }}</span>
            <div class="set-seg">
              <button class="set-segbtn" :class="{ 'set-segbtn--on': launchOnStartup }" @click="!launchOnStartup && toggleLaunchOnStartup()">{{ tr('Açık', 'On') }}</button>
              <button class="set-segbtn" :class="{ 'set-segbtn--on': !launchOnStartup }" @click="launchOnStartup && toggleLaunchOnStartup()">{{ tr('Kapalı', 'Off') }}</button>
            </div>
          </div>
          <div class="set-hint">
            {{ tr('PoBe sağ-alt sistem tepsisinde simge gösterir (sağ tık: Göster/Gizle, Çıkış). “Tepsiye küçült” açıkken pencereyi kapatmak programı kapatmaz — tepsiden “Çıkış” ile tam kapatırsın. “PoE 2 açılınca göster” yalnız oyun sürecinin başlamasını izler (hafıza okuma/otomasyon YOK).', 'PoBe shows a tray icon (right-click: Show/Hide, Exit). With “minimize to tray” on, closing the window doesn’t quit the app — use “Exit” from the tray. “Show when PoE 2 launches” only watches for the game process starting (no memory reading/automation).') }}
          </div>
        </div>

        <!-- 4b) OYUN-İÇİ FİYAT KONTROLÜ (Faz 2) -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Oyun-içi Fiyat Kontrolü', 'In-game Price Check') }}</div>
          <div class="set-seg" style="margin-bottom: 7px">
            <button class="set-segbtn" :class="{ 'set-segbtn--on': priceEnabled }" @click="!priceEnabled && togglePriceEnabled()">{{ tr('Açık', 'On') }}</button>
            <button class="set-segbtn" :class="{ 'set-segbtn--on': !priceEnabled }" @click="priceEnabled && togglePriceEnabled()">{{ tr('Kapalı', 'Off') }}</button>
          </div>
          <div v-if="priceEnabled" class="set-row" style="display: flex; align-items: center; gap: 8px">
            <span class="set-label" style="min-width: 0">{{ tr('Kısayol', 'Shortcut') }}</span>
            <kbd class="set-kbd">{{ capturingShortcut ? tr('tuş kombinasyonuna bas…', 'press a key combo…') : priceShortcut }}</kbd>
            <button class="set-btn" @click="startCapture">{{ tr('Değiştir', 'Change') }}</button>
          </div>
          <div v-if="priceEnabled && !priceShortcutOk" class="set-hint" style="color: #e0a44f">
            ⚠ {{ tr('Kısayol kaydedilemedi (başka uygulama kullanıyor olabilir) — başka bir kombinasyon dene.', 'Could not register shortcut (another app may use it) — try another combo.') }}
          </div>
          <div class="set-hint">
            {{ tr('Kullanım: oyunda eşyaya gel → Ctrl+C → kısayola bas. Panodaki eşya okunur, benzer ilanlardan ≈ tahmini değer gösterilir. GİRDİ OTOMASYONU YOK — kendi Ctrl+C’ni sen yaparsın; yalnız pano okunur, hafıza okuma yok. Overlay yalnız oyunun Windowed Fullscreen / Borderless modunda görünür. AĞ İSTİSNASI: yalnız eşya/sorgu gönderilir, kişisel veri gitmez, otomatik alım yok.', 'Usage: hover an item in-game → Ctrl+C → press the shortcut. The clipboard item is read and an ≈ estimated value from similar listings is shown. NO INPUT AUTOMATION — you press Ctrl+C yourself; only the clipboard is read, no memory reading. The overlay is visible only in the game’s Windowed Fullscreen / Borderless mode. NETWORK EXCEPTION: only the item/query is sent, no personal data, no auto-buy.') }}
          </div>
        </div>

        <!-- 4c) OYUN-İÇİ TEHLİKE KONTROLÜ (Faz 8) -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Oyun-içi Tehlike Kontrolü', 'In-game Danger Check') }}</div>
          <div class="set-seg" style="margin-bottom: 7px">
            <button class="set-segbtn" :class="{ 'set-segbtn--on': dangerEnabled }" @click="!dangerEnabled && toggleDangerEnabled()">{{ tr('Açık', 'On') }}</button>
            <button class="set-segbtn" :class="{ 'set-segbtn--on': !dangerEnabled }" @click="dangerEnabled && toggleDangerEnabled()">{{ tr('Kapalı', 'Off') }}</button>
          </div>
          <div v-if="dangerEnabled" class="set-row" style="display: flex; align-items: center; gap: 8px">
            <span class="set-label" style="min-width: 0">{{ tr('Kısayol', 'Shortcut') }}</span>
            <kbd class="set-kbd">{{ capturingDanger ? tr('tuş kombinasyonuna bas…', 'press a key combo…') : dangerShortcut }}</kbd>
            <button class="set-btn" @click="startCaptureDanger">{{ tr('Değiştir', 'Change') }}</button>
          </div>
          <div v-if="dangerEnabled && !dangerShortcutOk" class="set-hint" style="color: #e0a44f">
            ⚠ {{ tr('Kısayol kaydedilemedi (başka uygulama kullanıyor olabilir) — başka bir kombinasyon dene.', 'Could not register shortcut (another app may use it) — try another combo.') }}
          </div>
          <div class="set-hint">
            {{ tr('Kullanım: endgame’de waystone/mekanik üstüne gel → Ctrl+C → kısayola bas. Takip ettiğin build’in defansına göre GÜVENLİ/DİKKAT/TEHLİKELİ + gerekçe gösterilir. Heuristik (garanti değil). GİRDİ OTOMASYONU YOK — yalnız pano okunur, oyun/ağ/hafıza etkileşimi YOK. Overlay yalnız Windowed Fullscreen / Borderless’ta görünür.', 'Usage: in endgame, hover a waystone/mechanic → Ctrl+C → press the shortcut. Shows SAFE/CAUTION/DANGEROUS + reasons vs your tracked build’s defenses. Heuristic (not guaranteed). NO INPUT AUTOMATION — only the clipboard is read, no game/network/memory interaction. The overlay is visible only in Windowed Fullscreen / Borderless.') }}
          </div>
        </div>

        <!-- 4d) TANITIM (onboarding tekrar) -->
        <div class="set-sec set-sec--inline">
          <div class="set-label">{{ tr('Tanıtım', 'Tour') }}</div>
          <button class="set-btn" @click="emit('show-tour')">{{ tr('Tanıtımı tekrar göster', 'Show the tour again') }}</button>
        </div>

        <!-- 5) DİL -->
        <div class="set-sec set-sec--inline">
          <div class="set-label">{{ tr('Dil', 'Language') }}</div>
          <button class="set-btn" @click="emit('toggle-lang')">
            {{ isTr ? 'English’e geç' : 'Türkçe’ye geç' }}
          </button>
        </div>

        <!-- GÜNCELLEME (ADIM C) -->
        <div class="set-sec">
          <div class="set-label">{{ tr('Güncelleme', 'Updates') }}</div>
          <div class="set-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <button class="set-btn" :disabled="upd?.status === 'checking' || upd?.status === 'downloading'" @click="checkUpdates">
              {{ upd?.status === 'checking' ? tr('Kontrol ediliyor…', 'Checking…') : tr('Güncellemeleri kontrol et', 'Check for updates') }}
            </button>
            <button v-if="upd?.status === 'available'" class="set-btn" @click="downloadUpdate">{{ tr('İndir', 'Download') }}</button>
            <button v-if="upd?.status === 'downloaded'" class="set-btn" @click="installUpdate">{{ tr('Yeniden başlat & kur', 'Restart & install') }}</button>
            <span class="set-sub">{{ updStatusText }}</span>
          </div>
          <div class="set-hint" style="margin-top: 6px">
            {{ tr('Mevcut sürüm', 'Current version') }}: <b>v{{ upd?.currentVersion || appVersion || '—' }}</b> ·
            {{ tr('son kontrol', 'last check') }}: {{ fmtTime(upd?.lastCheck ?? null) }}
            <template v-if="upd?.status === 'disabled-portable'">
              <br />⚠ {{ tr('Portable sürüm otomatik güncellenmez — yeni sürümü siteden indir.', 'Portable build does not auto-update — download the new version from the site.') }}
            </template>
          </div>
        </div>

        <!-- İLETİŞİM / HAKKINDA (ADIM D) -->
        <div class="set-sec">
          <div class="set-label">{{ tr('İletişim / Hakkında', 'Contact / About') }}</div>
          <div class="set-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <span class="set-sub" style="min-width: 70px">Discord</span>
            <code class="set-mid">{{ contact.discord }}</code>
            <button class="set-btn" @click="copyDiscord">{{ discordCopied ? tr('Kopyalandı ✓', 'Copied ✓') : tr('Kopyala', 'Copy') }}</button>
            <span class="set-sub">{{ tr('(Discord’da @panars’ı ekle/ara)', '(add/search @panars on Discord)') }}</span>
          </div>
          <div class="set-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px">
            <span class="set-sub" style="min-width: 70px">{{ tr('E-posta', 'Email') }}</span>
            <code class="set-mid">{{ contact.email }}</code>
            <button class="set-btn" @click="openEmail">{{ tr('E-posta gönder', 'Send email') }}</button>
          </div>
          <div v-if="contact.site" class="set-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px">
            <span class="set-sub" style="min-width: 70px">{{ tr('Web sitesi', 'Website') }}</span>
            <code class="set-mid">{{ contact.site.replace(/^https?:\/\//, '') }}</code>
            <button class="set-btn" @click="openSite">{{ tr('Siteyi aç ↗', 'Open site ↗') }}</button>
          </div>
          <div class="set-row" style="margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap">
            <button class="set-btn" @click="emit('show-whats-new')">✨ {{ tr('Neler değişti', 'What’s new') }}</button>
            <button class="set-btn" @click="emit('show-feedback')">💬 {{ tr('Geri bildirim gönder', 'Send feedback') }}</button>
          </div>
          <div class="set-hint" style="margin-top: 7px">
            Path of Berkay <b>v{{ appVersion || '—' }}</b> —
            {{ tr('kişisel/beta araç; GGG ToS uyumlu (yalnız meşru yollar: log/clipboard okuma, resmî API).', 'personal/beta tool; GGG ToS-compliant (legitimate methods only: log/clipboard read, official API).') }}
          </div>
        </div>

        <!-- 5) SIFIRLA -->
        <div class="set-sec set-sec--inline">
          <div class="set-label">{{ tr('İlerleme', 'Progress') }}</div>
          <button
            class="set-btn set-btn--warn"
            :class="{ 'set-btn--confirm': confirmReset }"
            @click="doReset"
            @blur="confirmReset = false"
          >
            {{ confirmReset ? tr('Emin misin? Tıkla', 'Are you sure? Click') : tr('İlerlemeyi sıfırla / yeni karakter', 'Reset progress / new character') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.set-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}
.set-panel {
  width: 560px;
  max-width: 92vw;
  max-height: 88vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 26px solid transparent;
  border-image: url(../../assets/ui/frame-ornate.png) 68 repeat;
  background-color: #0b1011;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.85));
}
.set-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 8px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.2);
}
.set-title {
  font-family: var(--font-serif);
  font-variant: small-caps;
  letter-spacing: 0.06em;
  font-size: 18px;
  color: var(--gem-teal);
}
.set-x {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}
.set-x:hover {
  color: #fff;
}
.set-body {
  overflow-y: auto;
  padding: 10px 2px 2px;
}
.set-sec {
  margin-bottom: 14px;
}
.set-sec--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.set-label {
  font-family: var(--font-serif);
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 13px;
  color: var(--gold-ornament);
  margin-bottom: 6px;
}
.set-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 12.5px;
  color: var(--text-default, #cdc3aa);
}
.set-toggle-row .set-seg {
  flex: none;
}
.set-soon {
  font-size: 10px;
  color: var(--text-muted);
  font-variant: normal;
  letter-spacing: 0;
}
.set-hint {
  font-size: 10.5px;
  color: var(--text-muted);
  margin-top: 5px;
  line-height: 1.4;
}
/* API anahtarı rehberi */
.set-keyguide {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.set-guidetoggle {
  background: none;
  border: none;
  color: #d8a857;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.set-guidetoggle:hover {
  color: #ecc24a;
}
.set-btn--open {
  font-size: 11px;
  padding: 3px 10px;
}
.set-guidebox {
  margin-top: 6px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(160, 130, 70, 0.3);
  border-radius: 4px;
}
.set-guidesteps {
  margin: 0;
  padding-left: 18px;
  color: #cabf9f;
  font-size: 11.5px;
  line-height: 1.6;
}
.set-guidesteps li {
  margin-bottom: 1px;
}
.set-mid {
  flex: 1;
  font-family: 'Consolas', monospace;
  font-size: 12.5px;
  letter-spacing: 0.05em;
  color: #ecd49a;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid #5a461f;
  border-radius: 4px;
  padding: 4px 9px;
  user-select: all;
}
.set-seg,
.set-cornerrow {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.set-segbtn,
.set-cbtn,
.set-btn {
  font-family: var(--font-serif);
  font-size: 12px;
  font-variant: small-caps;
  letter-spacing: 0.02em;
  color: var(--gold-title);
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 5px 12px;
  cursor: pointer;
}
.set-segbtn:hover,
.set-cbtn:hover,
.set-btn:hover {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
.set-segbtn--on,
.set-cbtn--on {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.set-pathrow {
  display: flex;
  gap: 8px;
  align-items: center;
}
.set-path {
  flex: 1;
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--frame-brown, #4a3d28);
  padding: 5px 8px;
  direction: rtl;
  text-align: left;
}
.set-status {
  flex: none;
  font-size: 11px;
  font-variant: small-caps;
  padding: 2px 8px;
  border-radius: 2px;
}
.set-status--ok {
  color: #0a1614;
  background: var(--gem-teal);
}
.set-status--bad {
  color: #fff;
  background: #7a2f24;
}
.set-btnrow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
}
.set-watch {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 4px;
}
.set-watch--on {
  color: var(--gem-teal);
}
.set-opacrow,
.set-cornerrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 7px;
}
.set-sub {
  flex: none;
  width: 62px;
  font-size: 12px;
  font-variant: small-caps;
  color: var(--text-muted);
}
.set-range {
  flex: 1;
  accent-color: var(--gem-teal);
}
.set-opacval {
  flex: none;
  width: 42px;
  text-align: right;
  font-size: 12px;
  color: var(--gem-teal);
}
.set-btn--warn {
  color: #d6a07a;
}
.set-btn--confirm {
  color: #fff;
  background: #7a2f24;
  border-color: #a8483a;
}
.set-provkey {
  color: #7fcf6a;
  font-size: 9px;
  vertical-align: middle;
}
.set-kbd {
  font-family: 'Consolas', monospace;
  font-size: 11.5px;
  color: #e3c172;
  background: rgba(201, 161, 74, 0.12);
  border: 1px solid rgba(201, 161, 74, 0.45);
  border-radius: 3px;
  padding: 2px 8px;
  min-width: 110px;
  text-align: center;
}
</style>
