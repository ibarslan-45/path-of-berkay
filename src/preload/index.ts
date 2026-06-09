import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// renderer'a açılan özel API'ler. Frameless pencere kontrolleri + Leveling Tracker.
const api = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizeChange: (cb: (max: boolean) => void): (() => void) => {
    const h = (_e: unknown, max: boolean): void => cb(max)
    ipcRenderer.on('window:maximize-state', h)
    return () => ipcRenderer.removeListener('window:maximize-state', h)
  },
  leveling: {
    get: (): Promise<unknown> => ipcRenderer.invoke('leveling:get'),
    enter: (id: string): void => ipcRenderer.send('leveling:enter', id),
    toggle: (id: string): void => ipcRenderer.send('leveling:toggle', id),
    setCurrent: (id: string | null): void => ipcRenderer.send('leveling:set-current', id),
    reset: (): void => ipcRenderer.send('leveling:reset'),
    getLogStatus: (): Promise<unknown> => ipcRenderer.invoke('leveling:get-log-status'),
    pickLog: (): Promise<unknown> => ipcRenderer.invoke('leveling:pick-log'),
    autoDetectLog: (): Promise<unknown> => ipcRenderer.invoke('leveling:auto-detect-log'),
    // state değişimlerini dinle; aboneliği iptal eden fonksiyon döner
    onState: (cb: (s: unknown) => void): (() => void) => {
      const h = (_e: unknown, s: unknown): void => cb(s)
      ipcRenderer.on('leveling:state', h)
      return () => ipcRenderer.removeListener('leveling:state', h)
    }
  },
  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
    set: (patch: unknown): void => ipcRenderer.send('settings:set', patch),
    onChanged: (cb: (s: unknown) => void): (() => void) => {
      const h = (_e: unknown, s: unknown): void => cb(s)
      ipcRenderer.on('settings:changed', h)
      return () => ipcRenderer.removeListener('settings:changed', h)
    }
  },
  overlay: {
    // tıklama geçirgenliği: interactive=true -> tıklanır; false -> oyuna geçer
    setInteractive: (interactive: boolean): void =>
      ipcRenderer.send('overlay:set-interactive', interactive)
  },
  build: {
    get: (): Promise<string> => ipcRenderer.invoke('build:get'),
    set: (code: string): void => ipcRenderer.send('build:set', code),
    // Bug #1: TAM snapshot (kod + reconstruction PobBuild JSON + meta) — kalıcı
    getFull: (): Promise<{ code: string; built: string | null; meta: unknown }> =>
      ipcRenderer.invoke('build:get-full'),
    setFull: (payload: { code: string; built: string | null; meta: unknown }): void =>
      ipcRenderer.send('build:set-full', payload),
    // Build'e özel leveling/görev ilerlemesi (Bug #3)
    levelingGet: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('build:leveling-get'),
    levelingSet: (progress: Record<string, boolean>): void =>
      ipcRenderer.send('build:leveling-set', progress),
    // Part 2: "elde ettim" işaretleme ilerlemesi
    progressGet: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('build:progress-get'),
    progressSet: (progress: Record<string, boolean>): void =>
      ipcRenderer.send('build:progress-set', progress),
    fetchUrl: (
      url: string
    ): Promise<{
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
    }> => ipcRenderer.invoke('build:fetch-url', url),
    translate: (text: string, lang: string): Promise<{ ok: boolean; text?: string; error?: string }> =>
      ipcRenderer.invoke('build:translate', { text, lang }),
    // Yazar notlarını TR'ye çevir (cache'li, chunk'lı) — Faz 5
    translateNotes: (
      text: string
    ): Promise<{ ok: boolean; text?: string; cached?: boolean; error?: string; detail?: string }> =>
      ipcRenderer.invoke('build:translate-notes', text),
    // .build dosyası dışa aktar (yerel yazma; custom=true → farklı konuma kaydet diyaloğu)
    exportFile: (
      json: string,
      filename: string,
      custom?: boolean
    ): Promise<{ ok: boolean; path?: string; dir?: string; error?: string; detail?: string }> =>
      ipcRenderer.invoke('build:export-file', { json, filename, custom }),
    openFolder: (): Promise<{ ok: boolean; dir?: string; error?: string }> =>
      ipcRenderer.invoke('build:open-folder'),
    onChanged: (cb: (code: string) => void): (() => void) => {
      const h = (_e: unknown, code: string): void => cb(code)
      ipcRenderer.on('build:changed', h)
      return () => ipcRenderer.removeListener('build:changed', h)
    }
  },
  // --- Loot filter (Faz 6-7) — yalnız yerel .filter yazma; custom=true → farklı konuma kaydet ---
  filter: {
    exportFile: (
      text: string,
      filename: string,
      custom?: boolean
    ): Promise<{ ok: boolean; path?: string; dir?: string; error?: string; detail?: string }> =>
      ipcRenderer.invoke('filter:export-file', { text, filename, custom }),
    openFolder: (): Promise<{ ok: boolean; dir?: string; error?: string }> =>
      ipcRenderer.invoke('filter:open-folder')
  },
  craft: {
    get: (): Promise<string> => ipcRenderer.invoke('craft:get'),
    set: (json: string): void => ipcRenderer.send('craft:set', json)
  },
  advisor: {
    // LLM çağrısı main'den yapılır; anahtar renderer'a gelmez
    llm: (context: unknown, lang: string): Promise<unknown> =>
      ipcRenderer.invoke('advisor:llm', { context, lang })
  },
  // --- Yardım/Sohbet botu (Cila ADIM 2) — callLLM (kullanıcı sağlayıcısı/anahtarı; main'de) ---
  chat: {
    send: (
      messages: Array<{ role: string; content: string }>,
      lang: string
    ): Promise<{ ok: boolean; text?: string; error?: string; detail?: string }> =>
      ipcRenderer.invoke('chat:send', { messages, lang })
  },
  // Dış bağlantıyı tarayıcıda aç (izinli yardım/sağlayıcı domain'leri + mailto; main whitelist eder)
  openExternal: (url: string): void => ipcRenderer.send('open:external', url),
  // Uygulama sürümü (İletişim/Hakkında — ADIM D)
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  // Uzak ikon (CDN) → cache → data URL (bundled ikon yoksa fallback; ADIM B görseller)
  cacheIcon: (url: string): Promise<{ ok: boolean; dataUrl?: string }> => ipcRenderer.invoke('icon:cache', url),
  // --- Otomatik güncelleme (ADIM C) ---
  update: {
    getState: (): Promise<unknown> => ipcRenderer.invoke('update:get-state'),
    check: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
    download: (): Promise<unknown> => ipcRenderer.invoke('update:download'),
    install: (): void => ipcRenderer.send('update:install'),
    onStatus: (cb: (s: unknown) => void): (() => void) => {
      const h = (_e: unknown, s: unknown): void => cb(s)
      ipcRenderer.on('update:status', h)
      return () => ipcRenderer.removeListener('update:status', h)
    }
  },
  // --- Fiyat / Trade (Faz 0). Hepsi main net.fetch + rate-limit kuyruğu. Oto-alım YOK. ---
  price: {
    leagues: (): Promise<{ ok: boolean; leagues?: Array<{ id: string; text: string; realm: string }>; error?: string }> =>
      ipcRenderer.invoke('price:leagues'),
    tradeStats: (
      force?: boolean
    ): Promise<{ ok: boolean; stats?: Array<{ id: string; text: string; type: string }>; cached?: boolean; error?: string }> =>
      ipcRenderer.invoke('price:trade-stats', force),
    tradeSearch: (
      league: string,
      body: unknown,
      sessId?: string
    ): Promise<{ ok: boolean; queryId?: string; ids?: string[]; total?: number; error?: string; retryAfterMs?: number; pathUsed?: string }> =>
      ipcRenderer.invoke('price:trade-search', { league, body, sessId }),
    tradeFetch: (
      ids: string[],
      queryId: string,
      sessId?: string
    ): Promise<{
      ok: boolean
      listings?: Array<{ amount: number; currency: string; mods: string[]; name: string; typeLine: string; ilvl: number | null }>
      error?: string
      retryAfterMs?: number
    }> => ipcRenderer.invoke('price:trade-fetch', { ids, queryId, sessId }),
    ninjaCurrency: (
      league: string
    ): Promise<{ ok: boolean; lines?: Array<{ id?: string; primaryValue?: number }>; items?: Array<{ id?: string; name?: string; icon?: string }>; error?: string }> =>
      ipcRenderer.invoke('price:ninja-currency', league),
    openTradeUrl: (url: string): void => ipcRenderer.send('trade:open-url', url)
  },
  // --- Oyun-içi fiyat overlay'i (Faz 2). Yalnız pano okuma; girdi otomasyonu YOK. ---
  priceCheck: {
    // global kısayolla okunan pano metnini al (overlay penceresi dinler)
    onCheck: (cb: (text: string) => void): (() => void) => {
      const h = (_e: unknown, text: string): void => cb(text)
      ipcRenderer.on('price:check', h)
      return () => ipcRenderer.removeListener('price:check', h)
    },
    close: (): void => ipcRenderer.send('priceoverlay:close')
  },
  // Uygulama-içi "Panodan al" — main panoyu okur (yalnız okuma)
  clipboardRead: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),
  // --- Oyun-içi tehlike kontrolü overlay'i (Faz 8). Yalnız pano okuma; girdi otomasyonu YOK. ---
  dangerCheck: {
    onCheck: (cb: (text: string) => void): (() => void) => {
      const h = (_e: unknown, text: string): void => cb(text)
      ipcRenderer.on('danger:check', h)
      return () => ipcRenderer.removeListener('danger:check', h)
    },
    close: (): void => ipcRenderer.send('dangeroverlay:close')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (tip tanımı index.d.ts içinde)
  window.electron = electronAPI
  // @ts-ignore (tip tanımı index.d.ts içinde)
  window.api = api
}
