import { ElectronAPI } from '@electron-toolkit/preload'

interface LevelingState {
  visited: string[]
  currentId: string | null
  location: { kind: 'campaign' | 'town' | 'map' | 'hideout'; name: string } | null
  level: number | null
}
interface LogStatus {
  path: string
  exists: boolean
  watching: boolean
}
type TrackerMode = 'inapp' | 'overlay' | 'both' | 'off'
type OverlayCorner = 'tl' | 'tr' | 'bl' | 'br'
type LlmProvider = 'claude' | 'openai' | 'gemini'
interface AppSettings {
  mode: TrackerMode
  overlay: { opacity: number; corner: OverlayCorner; scale: number; fontScale: number }
  lang: 'tr' | 'en'
  advisor: {
    mode: 'offline' | 'llm'
    provider: LlmProvider
    hasKey: boolean // seçili sağlayıcıda anahtar var mı
    model: string // seçili sağlayıcının modeli
    keysPresent: Record<LlmProvider, boolean>
    models: Record<LlmProvider, string>
  }
  priceCheck: { enabled: boolean; shortcut: string; shortcutOk: boolean }
  dangerCheck: { enabled: boolean; shortcut: string; shortcutOk: boolean }
  autoCopy: boolean // tek-tuş oto-kopyala (varsayılan KAPALI; yalnız PoE2 odaktayken tetiklenir)
  tradeOpen: 'app' | 'browser' // Trade'de Aç: program-içi pencere | varsayılan tarayıcı
  closeToTray: boolean // X → tepsiye küçült
  poe2AutoShow: boolean // PoE2 açılınca pencereyi göster
  launchOnStartup: boolean // Windows ile başlat
  ui: { font: string; zoom: number }
  firstRunDone: boolean
  lastSeenVersion: string
  log: LogStatus
}
// settings.set patch: advisor için apiKey/model/provider (anahtarın kendisi yalnız main'e gider)
interface SettingsPatch {
  mode?: TrackerMode
  overlay?: Partial<{ opacity: number; corner: OverlayCorner; scale: number; fontScale: number }>
  lang?: 'tr' | 'en'
  advisor?: { mode?: 'offline' | 'llm'; provider?: LlmProvider; apiKey?: string; model?: string }
  priceCheck?: { enabled?: boolean; shortcut?: string }
  dangerCheck?: { enabled?: boolean; shortcut?: string }
  autoCopy?: boolean
  tradeOpen?: 'app' | 'browser'
  closeToTray?: boolean
  poe2AutoShow?: boolean
  launchOnStartup?: boolean
  ui?: Partial<{ font: string; zoom: number }>
  firstRunDone?: boolean
  lastSeenVersion?: string
}
type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'disabled-portable'
  | 'disabled-dev'
interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  newVersion: string | null
  notes: string[]
  progress: number
  lastCheck: number | null
  error: string
  portable: boolean
}
interface WindowControlsAPI {
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (cb: (max: boolean) => void) => () => void
  leveling: {
    get: () => Promise<LevelingState>
    enter: (id: string) => void
    toggle: (id: string) => void
    setCurrent: (id: string | null) => void
    reset: () => void
    getLogStatus: () => Promise<LogStatus>
    pickLog: () => Promise<LogStatus>
    autoDetectLog: () => Promise<LogStatus>
    onState: (cb: (s: LevelingState) => void) => () => void
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (patch: SettingsPatch) => void
    onChanged: (cb: (s: AppSettings) => void) => () => void
  }
  overlay: {
    setInteractive: (interactive: boolean) => void
  }
  build: {
    get: () => Promise<string>
    set: (code: string) => void
    getFull: () => Promise<{ code: string; built: string | null; meta: unknown }>
    setFull: (payload: { code: string; built: string | null; meta: unknown }) => void
    levelingGet: () => Promise<Record<string, boolean>>
    levelingSet: (progress: Record<string, boolean>) => void
    progressGet: () => Promise<Record<string, boolean>>
    progressSet: (progress: Record<string, boolean>) => void
    fetchUrl: (
      url: string
    ) => Promise<{
      ok: boolean
      kind?: string
      code?: string
      data?: unknown
      meta?: unknown
      site?: string
      notes?: string
      author?: { name?: string; url?: string }
      sourceUrl?: string
      error?: string
      detail?: string
    }>
    translate: (text: string, lang: string) => Promise<{ ok: boolean; text?: string; error?: string }>
    translateNotes: (
      text: string
    ) => Promise<{ ok: boolean; text?: string; cached?: boolean; error?: string; detail?: string }>
    exportFile: (
      json: string,
      filename: string,
      custom?: boolean
    ) => Promise<{ ok: boolean; path?: string; dir?: string; error?: string; detail?: string }>
    openFolder: () => Promise<{ ok: boolean; dir?: string; error?: string }>
    onChanged: (cb: (code: string) => void) => () => void
  }
  filter: {
    exportFile: (
      text: string,
      filename: string,
      custom?: boolean
    ) => Promise<{ ok: boolean; path?: string; dir?: string; error?: string; detail?: string }>
    openFolder: () => Promise<{ ok: boolean; dir?: string; error?: string }>
  }
  craft: {
    get: () => Promise<string>
    set: (json: string) => void
  }
  advisor: {
    llm: (context: unknown, lang: string) => Promise<unknown>
  }
  chat: {
    send: (
      messages: Array<{ role: string; content: string }>,
      lang: string
    ) => Promise<{ ok: boolean; text?: string; error?: string; detail?: string }>
  }
  openExternal: (url: string) => void
  appVersion: () => Promise<string>
  cacheIcon: (url: string) => Promise<{ ok: boolean; dataUrl?: string }>
  update: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    download: () => Promise<UpdateState>
    install: () => void
    onStatus: (cb: (s: UpdateState) => void) => () => void
  }
  price: {
    leagues: () => Promise<{ ok: boolean; leagues?: Array<{ id: string; text: string; realm: string }>; error?: string }>
    tradeStats: (
      force?: boolean
    ) => Promise<{ ok: boolean; stats?: Array<{ id: string; text: string; type: string }>; cached?: boolean; error?: string }>
    tradeSearch: (
      league: string,
      body: unknown,
      sessId?: string
    ) => Promise<{ ok: boolean; queryId?: string; ids?: string[]; total?: number; error?: string; retryAfterMs?: number; pathUsed?: string }>
    tradeFetch: (
      ids: string[],
      queryId: string,
      sessId?: string
    ) => Promise<{
      ok: boolean
      listings?: Array<{ amount: number; currency: string; mods: string[]; name: string; typeLine: string; ilvl: number | null }>
      error?: string
      retryAfterMs?: number
    }>
    ninjaCurrency: (
      league: string
    ) => Promise<{ ok: boolean; lines?: Array<{ id?: string; primaryValue?: number }>; items?: Array<{ id?: string; name?: string; icon?: string }>; error?: string }>
    openTradeUrl: (url: string) => void
  }
  priceCheck: {
    onCheck: (cb: (text: string) => void) => () => void
    close: () => void
  }
  clipboardRead: () => Promise<string>
  priceLog: (line: string) => void
  dangerCheck: {
    onCheck: (cb: (text: string) => void) => () => void
    close: () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowControlsAPI
  }
}
