import { app, shell, BrowserWindow, ipcMain, dialog, screen, net, globalShortcut, clipboard, session, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  watchFile,
  unwatchFile
} from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { execSync, execFile } from 'child_process'
import { createHash } from 'crypto'
import areasData from '../data/areas.json'
import { nextAllowedFromHeaders, searchPathCandidates } from './poe-rate'
// 0.17.4: Ctrl+C gibi OS-kritik accel'leri ASLA global bağlama (sistem kopyalaması serbest kalsın).
import { sanitizeShortcut } from './shortcut-sanitize'
import { buildLlmRequest, parseLlmResponse, notesCacheKey, chunkNotes, DEFAULT_MODELS, type LlmProvider } from './llm'
import { autoUpdater } from 'electron-updater'
import { UPDATE } from '../config/update'
import { notesForVersion, normalizeUpdaterNotes } from './update-notes'

// ============================================================================
// DIŞ BAĞLANTI BEYAZ LİSTESİ (0.17.0 güvenlik): yalnız https: (+ mailto:) ve GERÇEKTEN kullanılan
// domain'ler açılır. setWindowOpenHandler + open:external + shell.openExternal bu fonksiyondan geçer.
// Bilinmeyen protokol/host reddedilir (file:, javascript:, custom scheme vb. ASLA açılmaz).
// ----------------------------------------------------------------------------
// Tam host eşleşmesi (alt-domain yalnız github.io / netlify.app için — aşağıdaki SUFFIX).
const ALLOWED_EXACT_HOSTS = new Set([
  'github.com', 'www.github.com',
  'pathofexile.com', 'www.pathofexile.com',
  'mobalytics.gg', 'www.mobalytics.gg',
  'maxroll.gg', 'www.maxroll.gg',
  'poe2db.tw', 'www.poe2db.tw',
  'virustotal.com', 'www.virustotal.com',
  'console.anthropic.com',
  'platform.openai.com',
  'aistudio.google.com',
  'discord.gg', 'discord.com', 'www.discord.com',
  'gnu.org', 'www.gnu.org'
])
// Alt-domain'e izin verilen son ekler (kişisel site netlify'da, GitHub Pages github.io'da).
const ALLOWED_HOST_SUFFIXES = ['.github.io', '.netlify.app']
const MAILTO_RE = /^mailto:[^@\s]+@[^@\s]+\.[^@\s?]+(\?[\s\S]*)?$/i

/** Bir URL dış tarayıcıda/e-posta istemcisinde açılabilir mi? (yalnız https + izinli domain, veya mailto). */
function isAllowedExternalUrl(raw: string): boolean {
  if (typeof raw !== 'string' || !raw) return false
  if (MAILTO_RE.test(raw)) return true
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false // http/file/javascript/custom scheme reddedilir
  const host = u.hostname.toLowerCase()
  if (ALLOWED_EXACT_HOSTS.has(host)) return true
  return ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s))
}

// areas.json id (= oyun alan kodu) -> {act, type, en} hızlı arama tablosu.
interface AreaLite {
  id: string
  en: string
  act: string | number
  type: string
  area_level?: number
}
const areaByCode = new Map<string, { act: string; type: string; en: string; areaLevel: number }>()
for (const a of (areasData as { records?: AreaLite[] }).records ??
  (areasData as unknown as AreaLite[])) {
  areaByCode.set(a.id, {
    act: String(a.act),
    type: a.type,
    en: a.en,
    areaLevel: typeof a.area_level === 'number' ? a.area_level : 0
  })
}
const CAMPAIGN_ACTS = new Set(['1', '2', '3', '4'])

// --- Leveling Tracker kalıcı durumu (userData'da JSON) -----------------------
// visited: girilen kampanya bölgesi id'leri (areas.json id = oyun alan kodu)
// currentId: en son girilen bölge (şu an buradasın)
type LocationKind = 'campaign' | 'town' | 'map' | 'hideout'
interface LevelingState {
  visited: string[]
  currentId: string | null
  // Gerçek anlık konum (kampanya-dışıysa ilerleme değişmez, sadece not gösterilir)
  location: { kind: LocationKind; name: string } | null
  // Karakter seviyesi: Client.txt "Generating level N" satırından (gerçek);
  // simülasyonda alanın area_level'i proxy olarak kullanılır.
  level: number | null
}
const statePath = (): string => join(app.getPath('userData'), 'pobe-leveling.json')
let levelingState: LevelingState = { visited: [], currentId: null, location: null, level: null }

function loadLevelingState(): void {
  try {
    const raw = JSON.parse(readFileSync(statePath(), 'utf-8'))
    if (raw && Array.isArray(raw.visited)) {
      levelingState = {
        visited: raw.visited,
        currentId: raw.currentId ?? null,
        location: raw.location ?? null,
        level: typeof raw.level === 'number' ? raw.level : null
      }
    }
  } catch {
    // ilk çalıştırma / dosya yok -> varsayılan boş durum
  }
}
function saveLevelingState(): void {
  try {
    writeFileSync(statePath(), JSON.stringify(levelingState), 'utf-8')
  } catch (e) {
    console.error('leveling state kaydedilemedi', e)
  }
}
function broadcastLevelingState(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('leveling:state', levelingState)
  }
}
// Bir alan KODU işlendi (hem Client.txt watcher hem Faz1 simülasyonu buraya gelir).
// - Kampanya savaş bölgesi (act 1-4, town değil) -> ilerleme advance.
// - Kasaba (act 1-4, town) -> ilerleme SABİT, "Kasaba'tasın" notu.
// - Endgame/interlude harita -> ilerleme SABİT, "Harita'tasın" notu.
// - areas.json'da olmayan kod -> hideout ise not; değilse sessizce yoksay + log.
function handleAreaCode(code: string, level?: number): void {
  if (!code) return
  const a = areaByCode.get(code)
  if (!a) {
    if (/hideout/i.test(code)) {
      levelingState.location = { kind: 'hideout', name: 'Hideout' }
      if (typeof level === 'number' && Number.isFinite(level)) levelingState.level = level
      saveLevelingState()
      broadcastLevelingState()
    } else {
      console.log('[leveling] areas.json dışı alan kodu yok sayıldı:', code)
    }
    return
  }
  // Seviye: log'dan gerçek N geldiyse onu kullan; gelmezse (simülasyon) area_level proxy.
  if (typeof level === 'number' && Number.isFinite(level)) levelingState.level = level
  else if (a.areaLevel > 0) levelingState.level = a.areaLevel
  if (CAMPAIGN_ACTS.has(a.act) && a.type !== 'town') {
    levelingState.currentId = code
    if (!levelingState.visited.includes(code)) levelingState.visited.push(code)
    levelingState.location = { kind: 'campaign', name: a.en }
  } else if (a.type === 'town') {
    levelingState.location = { kind: 'town', name: a.en }
  } else {
    levelingState.location = { kind: 'map', name: a.en }
  }
  saveLevelingState()
  broadcastLevelingState()
}

// --- Client.txt watcher (SADECE log okuma; ToS uyumlu) -----------------------
const STEAM_DEFAULT =
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'
const GEN_RE = /Generating level (\d+) area "([^"]+)"/
const settingsPath = (): string => join(app.getPath('userData'), 'pobe-settings.json')
let logPath = ''
let watching = false
let readOffset = 0
let lineRemainder = ''

// Uygulama ayarları (mod + overlay) — logPath ile birlikte pobe-settings.json'da
type TrackerMode = 'inapp' | 'overlay' | 'both' | 'off'
type OverlayCorner = 'tl' | 'tr' | 'bl' | 'br'
interface OverlayBounds {
  x: number
  y: number
  width: number
  height: number
}
interface AppSettings {
  mode: TrackerMode
  overlay: {
    opacity: number
    corner: OverlayCorner
    bounds?: OverlayBounds
    scale: number // pencere ölçeği (boyut)
    fontScale: number // yazı ölçeği
  }
  lang: 'tr' | 'en'
  // Çoklu LLM sağlayıcı (Claude / ChatGPT / Gemini). Kullanıcı hangisini isterse o.
  // Her sağlayıcının anahtarı + modeli AYRI saklanır (geçiş yapabilsin). Anahtarlar
  // YALNIZ main'de; renderer'a asla gönderilmez (sadece hasKey + model + provider).
  advisor: {
    mode: 'offline' | 'llm'
    provider: LlmProvider
    keys: Record<LlmProvider, string>
    models: Record<LlmProvider, string>
  }
  // Oyun-içi fiyat kontrolü (Faz 2): global kısayol → pano oku → fiyat overlay.
  // GİRDİ OTOMASYONU YOK; yalnız pano okuma. enabled=false ise kısayol kaydedilmez.
  priceCheck: { enabled: boolean; shortcut: string }
  // Oyun-içi tehlike kontrolü (Faz 8): global kısayol → pano oku → waystone tehlike overlay.
  dangerCheck: { enabled: boolean; shortcut: string }
  // Tek-tuş fiyat/tehlike (0.15.1): kısayola basınca önce oyuna Ctrl+C gönder, panoyu oku.
  // VARSAYILAN AÇIK. Awakened PoE / Exiled Exchange ile aynı yöntem; kapatılabilir (kullanıcı kendi Ctrl+C'sini yapar).
  autoCopy: boolean
  // 0.17.8: "Trade'de Aç" nerede açılsın — 'app' (program-içi pencere) | 'browser' (varsayılan tarayıcı).
  tradeOpen: 'app' | 'browser'
  // 0.18.0 sistem tepsisi: X kapatınca tepsiye küçült | PoE2 açılınca pencereyi göster | Windows ile başlat.
  closeToTray: boolean
  poe2AutoShow: boolean
  launchOnStartup: boolean
  // Arayüz yazı tipi + ölçeği (0.15.1). font: 'helvetica'|'system'|'serif'; zoom: webContents zoom faktörü.
  ui: { font: string; zoom: number }
  // İlk açılış tanıtımı (onboarding) gösterildi mi (Cila ADIM 2).
  firstRunDone: boolean
  // "Neler değişti" — son gösterilen sürüm; app.getVersion() farklıysa güncelleme sonrası 1 kez gösterilir.
  lastSeenVersion: string
}
// Her sağlayıcının varsayılan modeli: DEFAULT_MODELS (llm.ts'ten; düzenlenebilir).
let appSettings: AppSettings = {
  mode: 'inapp',
  overlay: { opacity: 0.85, corner: 'tr', scale: 1, fontScale: 1 },
  lang: 'tr',
  advisor: {
    mode: 'offline',
    provider: 'claude',
    keys: { claude: '', openai: '', gemini: '' },
    models: { ...DEFAULT_MODELS }
  },
  priceCheck: { enabled: true, shortcut: 'CommandOrControl+D' },
  dangerCheck: { enabled: true, shortcut: 'CommandOrControl+E' },
  autoCopy: false, // 0.17.0: tek-tuş oto-kopyala VARSAYILAN KAPALI (kullanıcı açarsa yalnız PoE2 odaktayken çalışır)
  tradeOpen: 'app', // 0.17.8: varsayılan program-içi pencere; challenge'a takılırsa "Tarayıcıda Aç" sunulur
  closeToTray: true, // 0.18.0: X → tepsiye küçült (tepsi menüsünden Çıkış tam kapatır)
  poe2AutoShow: false, // PoE2 açılınca pencereyi öne getir (varsayılan kapalı)
  launchOnStartup: false, // Windows ile başlat (varsayılan kapalı)
  ui: { font: 'helvetica', zoom: 1 },
  firstRunDone: false,
  lastSeenVersion: ''
}

// Kurulumda seçilen dil (NSIS custom script HKCU\Software\PathOfBerkay\lang yazar).
// İlk açılışta arayüz dilini bununla başlat; sonra kullanıcı Ayarlar'dan değiştirebilir.
function getInstallLang(): 'tr' | 'en' | '' {
  for (const flag of ['', ' /reg:64', ' /reg:32']) {
    try {
      const out = execSync('reg query "HKCU\\Software\\PathOfBerkay" /v lang' + flag, {
        encoding: 'utf-8',
        windowsHide: true
      })
      const m = out.match(/lang\s+REG_SZ\s+(\w+)/i)
      if (m && (m[1] === 'tr' || m[1] === 'en')) return m[1]
    } catch {
      // bir sonraki bayrağı dene
    }
  }
  return ''
}
function loadSettings(): void {
  // İlk çalıştırma = ayar dosyası henüz yok → kurulum dilini varsayılan yap.
  const firstRun = !existsSync(settingsPath())
  if (firstRun) {
    const il = getInstallLang()
    if (il) appSettings.lang = il
    console.log('[lang] ilk çalıştırma, kurulum dili:', il || '(yok → varsayılan tr)')
  }
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8'))
    if (raw && typeof raw.logPath === 'string') logPath = raw.logPath
    if (raw && typeof raw.mode === 'string') appSettings.mode = raw.mode
    if (raw && raw.overlay) {
      const o = raw.overlay
      appSettings.overlay = {
        opacity: typeof o.opacity === 'number' ? o.opacity : 0.85,
        corner: o.corner ?? 'tr',
        bounds: o.bounds,
        scale: typeof o.scale === 'number' ? o.scale : 1,
        fontScale: typeof o.fontScale === 'number' ? o.fontScale : 1
      }
    }
    if (raw && (raw.lang === 'tr' || raw.lang === 'en')) appSettings.lang = raw.lang
    if (raw && raw.advisor) {
      const a = raw.advisor
      const prov: LlmProvider = a.provider === 'openai' || a.provider === 'gemini' ? a.provider : 'claude'
      // Yeni format (keys/models) veya eski tek-anahtar (apiKey → claude'a taşı) migrasyonu
      const keys: Record<LlmProvider, string> = { claude: '', openai: '', gemini: '' }
      if (a.keys && typeof a.keys === 'object') {
        for (const p of ['claude', 'openai', 'gemini'] as LlmProvider[])
          if (typeof a.keys[p] === 'string') keys[p] = a.keys[p]
      } else if (typeof a.apiKey === 'string') {
        keys.claude = a.apiKey // eski sürüm: tek Anthropic anahtarı
      }
      const models: Record<LlmProvider, string> = { ...DEFAULT_MODELS }
      if (a.models && typeof a.models === 'object') {
        for (const p of ['claude', 'openai', 'gemini'] as LlmProvider[])
          if (typeof a.models[p] === 'string' && a.models[p].trim()) models[p] = a.models[p].trim()
      }
      appSettings.advisor = { mode: a.mode === 'llm' ? 'llm' : 'offline', provider: prov, keys, models }
    }
    if (raw && raw.priceCheck) {
      const pc = raw.priceCheck
      appSettings.priceCheck = {
        enabled: pc.enabled !== false,
        // Ctrl+C gibi yasaklı accel kayıtlıysa güvenli varsayılana düş (sistem kopyalaması serbest kalsın).
        shortcut: sanitizeShortcut(typeof pc.shortcut === 'string' ? pc.shortcut : '', 'CommandOrControl+D')
      }
    }
    if (raw && raw.dangerCheck) {
      const dc = raw.dangerCheck
      appSettings.dangerCheck = {
        enabled: dc.enabled !== false,
        shortcut: sanitizeShortcut(typeof dc.shortcut === 'string' ? dc.shortcut : '', 'CommandOrControl+E')
      }
    }
    if (raw && typeof raw.autoCopy === 'boolean') appSettings.autoCopy = raw.autoCopy
    if (raw && (raw.tradeOpen === 'app' || raw.tradeOpen === 'browser')) appSettings.tradeOpen = raw.tradeOpen
    if (raw && typeof raw.closeToTray === 'boolean') appSettings.closeToTray = raw.closeToTray
    if (raw && typeof raw.poe2AutoShow === 'boolean') appSettings.poe2AutoShow = raw.poe2AutoShow
    if (raw && typeof raw.launchOnStartup === 'boolean') appSettings.launchOnStartup = raw.launchOnStartup
    if (raw && raw.ui && typeof raw.ui === 'object') {
      const u = raw.ui
      appSettings.ui = {
        font: typeof u.font === 'string' && u.font ? u.font : 'helvetica',
        zoom: typeof u.zoom === 'number' && u.zoom >= 0.6 && u.zoom <= 2 ? u.zoom : 1
      }
    }
    if (raw && typeof raw.firstRunDone === 'boolean') appSettings.firstRunDone = raw.firstRunDone
    if (raw && typeof raw.lastSeenVersion === 'string') appSettings.lastSeenVersion = raw.lastSeenVersion
    // Yasaklı kısayol (ör. eski Ctrl+C) dosyada kaldıysa düzeltilmiş hâlini KALICI yaz (bir daha bağlanmasın).
    const rawPc = raw && raw.priceCheck && typeof raw.priceCheck.shortcut === 'string' ? raw.priceCheck.shortcut : ''
    const rawDc = raw && raw.dangerCheck && typeof raw.dangerCheck.shortcut === 'string' ? raw.dangerCheck.shortcut : ''
    if ((rawPc && rawPc !== appSettings.priceCheck.shortcut) || (rawDc && rawDc !== appSettings.dangerCheck.shortcut)) {
      console.log('[shortcut] yasaklı kısayol düzeltildi → kalıcı yazılıyor')
      saveSettings()
    }
  } catch {
    // yok
  }
}
function saveSettings(): void {
  try {
    writeFileSync(
      settingsPath(),
      JSON.stringify({
        logPath,
        mode: appSettings.mode,
        overlay: appSettings.overlay,
        lang: appSettings.lang,
        advisor: appSettings.advisor,
        priceCheck: appSettings.priceCheck,
        dangerCheck: appSettings.dangerCheck,
        autoCopy: appSettings.autoCopy,
        tradeOpen: appSettings.tradeOpen,
        closeToTray: appSettings.closeToTray,
        poe2AutoShow: appSettings.poe2AutoShow,
        launchOnStartup: appSettings.launchOnStartup,
        ui: appSettings.ui,
        firstRunDone: appSettings.firstRunDone,
        lastSeenVersion: appSettings.lastSeenVersion
      }),
      'utf-8'
    )
  } catch (e) {
    console.error('settings kaydedilemedi', e)
  }
}
function logStatus(): { path: string; exists: boolean; watching: boolean } {
  return { path: logPath, exists: !!logPath && existsSync(logPath), watching }
}
// Renderer'a giden ayar: API anahtarları ASLA gönderilmez — yalnız provider + model +
// hangi sağlayıcıda anahtar var (keysPresent) + seçili sağlayıcının hasKey/model'i.
function fullSettings(): Omit<AppSettings, 'advisor'> & {
  log: ReturnType<typeof logStatus>
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
  firstRunDone: boolean
  lastSeenVersion: string
} {
  const a = appSettings.advisor
  return {
    mode: appSettings.mode,
    overlay: appSettings.overlay,
    lang: appSettings.lang,
    advisor: {
      mode: a.mode,
      provider: a.provider,
      hasKey: !!a.keys[a.provider],
      model: a.models[a.provider],
      keysPresent: { claude: !!a.keys.claude, openai: !!a.keys.openai, gemini: !!a.keys.gemini },
      models: { ...a.models }
    },
    priceCheck: {
      enabled: appSettings.priceCheck.enabled,
      shortcut: appSettings.priceCheck.shortcut,
      shortcutOk: priceShortcutOk
    },
    dangerCheck: {
      enabled: appSettings.dangerCheck.enabled,
      shortcut: appSettings.dangerCheck.shortcut,
      shortcutOk: dangerShortcutOk
    },
    autoCopy: appSettings.autoCopy,
    tradeOpen: appSettings.tradeOpen,
    closeToTray: appSettings.closeToTray,
    poe2AutoShow: appSettings.poe2AutoShow,
    launchOnStartup: appSettings.launchOnStartup,
    ui: appSettings.ui,
    firstRunDone: appSettings.firstRunDone,
    lastSeenVersion: appSettings.lastSeenVersion,
    log: logStatus()
  }
}
function broadcastSettings(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('settings:changed', fullSettings())
  }
}

// ============================================================================
// PROVIDER-AGNOSTİK LLM ÇAĞRISI (Claude / ChatGPT / Gemini) — tek giriş noktası.
// Tüm LLM kullanıcıları (advisor:llm, build:translate) bunu çağırır (kod tekrarı yok).
// GÜVENLİK: anahtarlar YALNIZ burada (main); renderer'a hiç gitmez. net.fetch (Chromium).
// Hata/anahtar yok → {ok:false, error}; çağıran offline fallback'ine düşer (çökme yok).
// ----------------------------------------------------------------------------
type LlmResult = { ok: true; text: string } | { ok: false; error: string; detail?: string }

// Sadık çeviri sistem promptu (build:translate + build:translate-notes ORTAK). Bug #4:
// PoE2 oyun-içi terimleri (stat/affix/mod metni, item/gem/skill/pasif/currency/quest-reward adları)
// HİÇBİR koşulda çevrilmez — Türkçe cümlenin İÇİNDE bile İngilizce orijinal kalır. Yalnız düz prose çevrilir.
function NOTES_TRANSLATE_SYSTEM(lang: string): string {
  return (
    `You are a faithful translator for a Path of Exile 2 build guide. Translate the user's text to ${lang}. ` +
    'Translate FAITHFULLY: do NOT add, remove, summarize, reorder, or fabricate any content or numbers. ' +
    'CRITICAL — keep ALL Path of Exile 2 in-game terms in their ORIGINAL ENGLISH, even inside a translated sentence: ' +
    'stat / affix / modifier text, item names and item base types, gem names, skill names, support gem names, ' +
    'passive node names, ascendancy names, currency names, and quest-reward names. ' +
    'NEVER translate these. For example "+20 to maximum Life" must stay EXACTLY "+20 to maximum Life" (do NOT write "maksimum can"); ' +
    '"Increased Critical Strike Chance" stays in English. Translate ONLY the surrounding prose / instructions / explanations. ' +
    'Preserve line breaks and list structure. Output ONLY the translated text, with no preamble or commentary.'
  )
}

async function callLLM(opts: { system: string; user: string; maxTokens: number }): Promise<LlmResult> {
  const a = appSettings.advisor
  const provider = a.provider
  const key = a.keys[provider]
  const model = a.models[provider] || DEFAULT_MODELS[provider]
  if (!key) return { ok: false, error: 'no_key' }
  const req = buildLlmRequest(provider, model, key, opts.system, opts.user, opts.maxTokens)
  try {
    const res = await net.fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: 'http_' + res.status, detail: txt.slice(0, 200) }
    }
    const text = parseLlmResponse(provider, await res.json().catch(() => null))
    return text ? { ok: true, text } : { ok: false, error: 'empty_reply' }
  } catch (e) {
    return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network', detail: (e as Error).message }
  }
}
function resolveDefaultLogPath(): string {
  const env = process.env['POBE_LOG_PATH'] // test/override
  if (env) return env
  if (logPath && existsSync(logPath)) return logPath
  if (existsSync(STEAM_DEFAULT)) return STEAM_DEFAULT
  return logPath || ''
}

// Sona eklenen yeni baytları oku, satırlara böl, "Generating level area" eşle.
function readAppended(): void {
  let size = 0
  try {
    size = statSync(logPath).size
  } catch {
    return
  }
  if (size < readOffset) {
    // log rotation / yeni oturum -> baştan
    readOffset = 0
    lineRemainder = ''
  }
  if (size <= readOffset) return
  const len = size - readOffset
  const buf = Buffer.alloc(len)
  let fd: number | null = null
  try {
    fd = openSync(logPath, 'r')
    readSync(fd, buf, 0, len, readOffset)
  } catch {
    if (fd !== null) closeSync(fd)
    return
  }
  closeSync(fd)
  readOffset = size
  const text = lineRemainder + buf.toString('utf-8')
  const lines = text.split(/\r?\n/)
  lineRemainder = lines.pop() ?? '' // son parça yarım olabilir -> sakla
  for (const line of lines) {
    const m = GEN_RE.exec(line)
    if (m) handleAreaCode(m[2], parseInt(m[1], 10))
  }
}

// Açılışta: tüm geçmişi tekrar oynatma (offset = dosya sonu); ama son alan
// kodunu okuyup anlık KONUMU göster (visited'i toplu işaretlemeden).
function primeFromTail(): void {
  if (!logPath || !existsSync(logPath)) return
  try {
    const size = statSync(logPath).size
    const chunk = Math.min(size, 256 * 1024)
    const buf = Buffer.alloc(chunk)
    const fd = openSync(logPath, 'r')
    readSync(fd, buf, 0, chunk, size - chunk)
    closeSync(fd)
    const lines = buf.toString('utf-8').split(/\r?\n/)
    let lastCode: string | null = null
    let lastLevel: number | null = null
    for (const line of lines) {
      const m = GEN_RE.exec(line)
      if (m) {
        lastCode = m[2]
        lastLevel = parseInt(m[1], 10)
      }
    }
    if (lastCode) {
      const a = areaByCode.get(lastCode)
      if (a) {
        if (lastLevel !== null && Number.isFinite(lastLevel)) levelingState.level = lastLevel
        else if (a.areaLevel > 0) levelingState.level = a.areaLevel
        if (CAMPAIGN_ACTS.has(a.act) && a.type !== 'town') {
          levelingState.currentId = lastCode
          levelingState.location = { kind: 'campaign', name: a.en }
        } else if (a.type === 'town') {
          levelingState.location = { kind: 'town', name: a.en }
        } else {
          levelingState.location = { kind: 'map', name: a.en }
        }
        saveLevelingState()
      }
    }
  } catch {
    // yoksay
  }
}

function startWatcher(): void {
  stopWatcher()
  logPath = resolveDefaultLogPath()
  if (!logPath || !existsSync(logPath)) {
    console.log('[leveling] Client.txt bulunamadı; elle seçim gerekli:', logPath || '(yok)')
    watching = false
    return
  }
  try {
    readOffset = statSync(logPath).size // sadece yeni satırlar
  } catch {
    readOffset = 0
  }
  lineRemainder = ''
  primeFromTail()
  watchFile(logPath, { interval: 800 }, () => readAppended())
  watching = true
  console.log('[leveling] Client.txt izleniyor:', logPath)
}
function stopWatcher(): void {
  if (logPath && watching) {
    try {
      unwatchFile(logPath)
    } catch {
      // yoksay
    }
  }
  watching = false
}
function setLogPath(p: string): void {
  logPath = p
  saveSettings()
  startWatcher()
}

// --- PoB build kodu kalıcılığı (parse renderer'da; main sadece ham kodu saklar) ---
const buildPath = (): string => join(app.getPath('userData'), 'pobe-build.json')
// Bug #1 kalıcılık: ham PoB kodu YANINDA reconstruction snapshot'ını (Mobalytics/Maxroll/.build —
// bunların PoB KODU yok) + meta (importedFrom/info/notes/aktif aşama) sakla. Sekme değişse, program
// kapanıp açılsa da build + variant korunur. `code` overlay/geri-uyumluluk için ayrı tutulur.
interface BuildStore {
  code: string // ham PoB export kodu ('' → reconstruction/.build)
  built: string | null // JSON.stringify(PobBuild) — reconstruction/.build için (code'suz)
  meta: unknown // { importedFrom, info, notes, authorName, authorUrl, sourceUrl, sourceSite, stage }
}
let buildStore: BuildStore = { code: '', built: null, meta: null }
function loadBuild(): void {
  try {
    const raw = JSON.parse(readFileSync(buildPath(), 'utf-8'))
    if (raw && typeof raw === 'object') {
      buildStore = {
        code: typeof raw.code === 'string' ? raw.code : '',
        built: typeof raw.built === 'string' ? raw.built : null,
        meta: raw.meta ?? null
      }
    }
  } catch {
    // yok
  }
}
function saveBuild(): void {
  try {
    writeFileSync(buildPath(), JSON.stringify(buildStore), 'utf-8')
  } catch (e) {
    console.error('build kaydedilemedi', e)
  }
}
// Build'e özel leveling/görev kontrol listesi ilerlemesi (Bug #3). Ayrı dosya (build değişse de kalır).
const buildLevelingPath = (): string => join(app.getPath('userData'), 'pobe-build-leveling.json')
function loadBuildLeveling(): Record<string, boolean> {
  try {
    const raw = JSON.parse(readFileSync(buildLevelingPath(), 'utf-8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}
function saveBuildLeveling(progress: Record<string, boolean>): void {
  try {
    writeFileSync(buildLevelingPath(), JSON.stringify(progress), 'utf-8')
  } catch (e) {
    console.error('build leveling ilerlemesi kaydedilemedi', e)
  }
}
// "Elde ettim" işaretleme ilerlemesi (Part 2): gear/mod/gem/node id → bool. id'ler build-imzası ile
// öneklidir → tüm build'lerin işaretleri tek dosyada çakışmadan saklanır (ayrı dosya, build değişse de kalır).
const buildProgressPath = (): string => join(app.getPath('userData'), 'pobe-build-progress.json')
function loadBuildProgress(): Record<string, boolean> {
  try {
    const raw = JSON.parse(readFileSync(buildProgressPath(), 'utf-8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}
function saveBuildProgress(progress: Record<string, boolean>): void {
  try {
    writeFileSync(buildProgressPath(), JSON.stringify(progress), 'utf-8')
  } catch (e) {
    console.error('build ilerlemesi kaydedilemedi', e)
  }
}

// ============================================================================
// OTOMATİK GÜNCELLEME (ADIM C) — electron-updater, "generic" provider (GitHub YOK).
// Açılışta sessiz kontrol → yeni sürüm varsa renderer banner (neler değişti + [Güncelle]).
// Yalnız NSIS KURULU sürüm güncellenir; PORTABLE + dev → devre dışı (kibar not). Hata → sessiz.
// ----------------------------------------------------------------------------
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
let updateState: UpdateState = {
  status: 'idle',
  currentVersion: '',
  newVersion: null,
  notes: [],
  progress: 0,
  lastCheck: null,
  error: '',
  portable: false
}
function isPortableBuild(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR
}
function broadcastUpdate(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', updateState)
}
function setUpdate(p: Partial<UpdateState>): void {
  updateState = { ...updateState, ...p }
  broadcastUpdate()
}
// host'ta changelog.json varsa o sürümün maddelerini çek (yoksa latest.yml notlarına düşülür)
async function fetchChangelogNotes(version: string): Promise<string[]> {
  if (!UPDATE.changelogUrl) return []
  try {
    const res = await net.fetch(UPDATE.changelogUrl, { cache: 'no-cache' })
    if (!res.ok) return []
    return notesForVersion(await res.json(), version)
  } catch {
    return []
  }
}
async function checkForUpdates(manual = false): Promise<void> {
  setUpdate({ lastCheck: Date.now() })
  if (!app.isPackaged) {
    setUpdate({ status: 'disabled-dev' })
    return
  }
  if (updateState.portable) {
    setUpdate({ status: 'disabled-portable' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    // ağ yok / feed erişilemez → sessiz (manuel kontrolde UI hata gösterir), çökme yok
    setUpdate({ status: 'error', error: (e as Error).message })
    if (!manual) console.log('[update] sessiz kontrol başarısız:', (e as Error).message)
  }
}
function initUpdater(): void {
  updateState.currentVersion = app.getVersion()
  updateState.portable = isPortableBuild()
  if (!app.isPackaged) {
    setUpdate({ status: 'disabled-dev' })
    return
  }
  if (updateState.portable) {
    setUpdate({ status: 'disabled-portable' })
    return // PORTABLE: otomatik güncelleme YOK (kullanıcı siteden günceller)
  }
  autoUpdater.autoDownload = false // indirme yalnız kullanıcı "Güncelle"ye basınca
  autoUpdater.autoInstallOnAppQuit = true
  // Feed = app-update.yml'ye gömülü GitHub config (build.publish). setFeedURL ile OVERRIDE ETME.
  autoUpdater.on('checking-for-update', () => setUpdate({ status: 'checking', error: '' }))
  autoUpdater.on('update-available', async (info) => {
    let notes = await fetchChangelogNotes(info.version)
    if (!notes.length) notes = normalizeUpdaterNotes(info.releaseNotes)
    setUpdate({ status: 'available', newVersion: info.version, notes })
  })
  autoUpdater.on('update-not-available', () => setUpdate({ status: 'not-available', newVersion: null }))
  autoUpdater.on('error', (e) => setUpdate({ status: 'error', error: e?.message || 'update error' }))
  autoUpdater.on('download-progress', (p) => setUpdate({ status: 'downloading', progress: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', () => setUpdate({ status: 'downloaded', progress: 100 }))
  void checkForUpdates() // açılışta sessiz kontrol
}

// --- Craft simülatörü hedef state kalıcılığı (renderer JSON'u olduğu gibi saklanır) ---
const craftPath = (): string => join(app.getPath('userData'), 'pobe-craft.json')
let craftState = ''
function loadCraft(): void {
  try {
    craftState = readFileSync(craftPath(), 'utf-8')
  } catch {
    // yok
  }
}
function saveCraft(): void {
  try {
    writeFileSync(craftPath(), craftState, 'utf-8')
  } catch (e) {
    console.error('craft state kaydedilemedi', e)
  }
}

// ============================================================================
// FİYAT / TRADE IPC (Faz 0) — net.fetch (Chromium ağ yığını → Cloudflare-güvenli)
// + kibar SERİ rate-limit kuyruğu. AĞ İSTİSNASI: yalnız eşya/sorgu gönderilir,
// kişisel veri YOK. Otomatik alım YOK; yalnız ARAMA + benzer-ilan fiyat tahmini.
// poe.ninja read-only currency kurları. Hepsi rate-limit header'larına uyar.
//
// NOT (ilk gerçek çalıştırmada DOĞRULA): trade2 realm segmenti topluluk arasında
//   küçük farklılık gösterebilir. 404 alırsan POE2_SEARCH/FETCH yollarındaki
//   '/poe2' segmentini kaldırıp dene. Uydurma değil — canlı doğrulanacak API yüzeyi.
// ----------------------------------------------------------------------------
const POE_BASE = 'https://www.pathofexile.com'
const POE_UA =
  'Path of Berkay/0.10 (PoE2 price-check; contact: app user) Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
// trade2 stat cache (runtime; renderer statik boş iskeleti bununla doldurur)
const tradeStatsCachePath = (): string => join(app.getPath('userData'), 'pobe-trade-stats.json')
// 0.17.5: cache ŞEMA versiyonu. Eski sürümlerde oluşmuş cache local silah hasar statlarını
// ("Adds # to # Cold/Lightning Damage") eksik içerebiliyordu → 4/4 yerine 2/4 eşleşme. Versiyon
// artınca eski cache YOK SAYILIR + taze çekilir (tüm local weapon damage stat'ları dahil gelir).
const STATS_CACHE_VERSION = 2

// --- Kibar seri kuyruk: pathofexile.com isteklerini sıraya dizer + boşluk bırakır ---
const MIN_SPACING_MS = 1500 // ardışık PoE isteği arası en az boşluk (kibar)
let nextAllowedAt = 0
let searchPathIdx = -1 // çalışan trade2 search yolu adayı (ilk başarılı çağrıda kilitlenir)
let poeChain: Promise<unknown> = Promise.resolve()
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)))

interface PoeResult {
  ok: boolean
  status: number
  json?: unknown
  error?: string
  retryAfterMs?: number
}
// Rate-limit header'larından bir sonraki izinli zamanı hesapla (saf mantık poe-rate.ts'te, test edilir).
function applyRateHeaders(headers: Headers): void {
  const next = nextAllowedFromHeaders((k) => headers.get(k), Date.now())
  if (next > nextAllowedAt) {
    nextAllowedAt = next
    const waitMs = next - Date.now()
    if (waitMs > 0) console.log(`[price] rate-limit: ${Math.round(waitMs)}ms bekleniyor (header'dan)`)
  }
}
// Tek bir PoE isteğini kuyruğa al (seri). JSON döndürür; rate-limit'e uyar.
function poeFetch(url: string, init?: { method?: string; body?: string; sessId?: string }): Promise<PoeResult> {
  const run = async (): Promise<PoeResult> => {
    const wait = nextAllowedAt - Date.now()
    if (wait > 0) await sleep(wait)
    nextAllowedAt = Date.now() + MIN_SPACING_MS // taban boşluk
    try {
      const headers: Record<string, string> = {
        'user-agent': POE_UA,
        accept: 'application/json',
        'content-type': 'application/json',
        'accept-language': 'en-US,en;q=0.9'
      }
      // POESESSID opsiyonel (limiti yükseltir; renderer hiç göndermezse oturumsuz çalışır)
      if (init?.sessId) headers['cookie'] = `POESESSID=${init.sessId}`
      const res = await net.fetch(url, { method: init?.method ?? 'GET', headers, body: init?.body })
      applyRateHeaders(res.headers)
      if (res.status === 429) {
        const ra = parseInt(res.headers.get('retry-after') || '0', 10)
        return { ok: false, status: 429, error: 'rate_limited', retryAfterMs: (Number.isFinite(ra) ? ra : 10) * 1000 }
      }
      if (res.status === 403) return { ok: false, status: 403, error: 'forbidden' } // Cloudflare/oturum
      if (!res.ok) return { ok: false, status: res.status, error: 'http_' + res.status }
      const json = await res.json().catch(() => null)
      return { ok: true, status: res.status, json }
    } catch (e) {
      return { ok: false, status: 0, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network' }
    }
  }
  const p = poeChain.then(run, run)
  poeChain = p.catch(() => {})
  return p
}

function registerPriceIpc(): void {
  // Mevcut PoE2 ligleri (lig adı koda GÖMÜLMEZ — değişebilir veri). Renderer seçtirir.
  ipcMain.handle('price:leagues', async () => {
    const r = await poeFetch(`${POE_BASE}/api/trade2/data/leagues`)
    if (!r.ok) return { ok: false, error: r.error }
    const list = (r.json as { result?: Array<{ id: string; realm?: string; text?: string }> })?.result ?? []
    return { ok: true, leagues: list.map((l) => ({ id: l.id, text: l.text ?? l.id, realm: l.realm ?? 'poe2' })) }
  })

  // Resmî trade2 stat-id tablosu → cache'le + renderer'a ver (statik iskeleti doldurur).
  ipcMain.handle('price:trade-stats', async (_e, force?: boolean) => {
    if (!force) {
      try {
        const cached = JSON.parse(readFileSync(tradeStatsCachePath(), 'utf-8'))
        // Yalnız GÜNCEL şema versiyonundaki cache kullanılır; eski/versiyonsuz cache → taze çek.
        if (cached && cached.version === STATS_CACHE_VERSION && Array.isArray(cached.stats) && cached.stats.length)
          return { ok: true, stats: cached.stats, cached: true }
      } catch {
        // cache yok → ağdan çek
      }
    }
    const r = await poeFetch(`${POE_BASE}/api/trade2/data/stats`)
    if (!r.ok) return { ok: false, error: r.error }
    const groups = (r.json as { result?: Array<{ id: string; entries?: Array<{ id: string; text: string; type?: string }> }> })?.result ?? []
    const stats: Array<{ id: string; text: string; type: string }> = []
    for (const g of groups) for (const e of g.entries ?? []) if (e.id && e.text) stats.push({ id: e.id, text: e.text, type: e.type ?? g.id })
    try {
      writeFileSync(tradeStatsCachePath(), JSON.stringify({ version: STATS_CACHE_VERSION, generated: Date.now(), stats }), 'utf-8')
    } catch {
      // cache yazılamazsa sorun değil
    }
    console.log(`[price] trade2 stat tablosu çekildi: ${stats.length} stat (cache → userData)`)
    return { ok: true, stats, cached: false }
  })

  // trade2 ARAMA: POST search → { queryId, ids[] }. Otomatik alım YOK; yalnız arama.
  // Realm yolu OTOMATİK çözülür: ilk çağrıda adayları (.../poe2/{lg}, .../{lg}) sırayla dener,
  // 404 dışı yanıt veren yolu KİLİTLER (sonraki çağrılar onu kullanır). Elle düzeltme gerekmez.
  ipcMain.handle('price:trade-search', async (_e, payload: { league: string; body: unknown; sessId?: string }) => {
    if (!payload?.league) return { ok: false, error: 'no_league' }
    const candidates = searchPathCandidates(POE_BASE, payload.league)
    const order = searchPathIdx >= 0 ? [searchPathIdx] : candidates.map((_, i) => i)
    const body = JSON.stringify(payload.body)
    let last: PoeResult | null = null
    for (const idx of order) {
      const r = await poeFetch(candidates[idx], { method: 'POST', body, sessId: payload.sessId })
      last = r
      if (r.ok) {
        if (searchPathIdx !== idx) {
          searchPathIdx = idx
          console.log(`[price] trade2 search yolu kilitlendi: ${candidates[idx]}`)
        }
        const j = r.json as { id?: string; result?: string[]; total?: number }
        console.log(`[price] search OK: total=${j.total ?? 0}, id=${j.id ?? '-'}`)
        return { ok: true, queryId: j.id ?? '', ids: j.result ?? [], total: j.total ?? 0, pathUsed: candidates[idx] }
      }
      // 404 → diğer adayı dene; 429/403/network → hemen dön (yol sorunu değil)
      if (r.status !== 404) {
        console.log(`[price] search HATA: ${r.error} (status ${r.status})`)
        return { ok: false, error: r.error, retryAfterMs: r.retryAfterMs }
      }
      console.log(`[price] search 404: ${candidates[idx]} → sonraki aday`)
    }
    return { ok: false, error: last?.error || 'http_404' }
  })

  // trade2 FETCH: arama id'lerinden ilan detayı (fiyat + EŞYANIN MODLARI). İlk 10 id (kibar).
  // Mod satırları "en yakın eşya" benzerlik skoru (price-similarity.ts) için döner — ortalama değil,
  // kullanıcının eşyasına en benzer ilan(lar)a göre değer biçilir.
  ipcMain.handle('price:trade-fetch', async (_e, payload: { ids: string[]; queryId: string; sessId?: string }) => {
    const ids = (payload?.ids ?? []).slice(0, 10)
    if (!ids.length) return { ok: true, listings: [] }
    const url = `${POE_BASE}/api/trade2/fetch/${ids.join(',')}?query=${encodeURIComponent(payload.queryId || '')}&realm=poe2`
    const r = await poeFetch(url, { sessId: payload.sessId })
    if (!r.ok) return { ok: false, error: r.error, retryAfterMs: r.retryAfterMs }
    interface FetchItem {
      listing?: { price?: { amount?: number; currency?: string } }
      item?: {
        name?: string
        typeLine?: string
        baseType?: string
        ilvl?: number
        implicitMods?: string[]
        explicitMods?: string[]
        craftedMods?: string[]
        fracturedMods?: string[]
        runeMods?: string[]
        enchantMods?: string[]
      }
    }
    const result = (r.json as { result?: FetchItem[] })?.result ?? []
    const listings = result
      .filter((it) => it.listing?.price && typeof it.listing.price.amount === 'number')
      .map((it) => {
        const p = it.listing!.price!
        const im = it.item ?? {}
        const mods = [
          ...(im.implicitMods ?? []),
          ...(im.explicitMods ?? []),
          ...(im.craftedMods ?? []),
          ...(im.fracturedMods ?? []),
          ...(im.runeMods ?? []),
          ...(im.enchantMods ?? [])
        ]
        return {
          amount: p.amount as number,
          currency: p.currency || '',
          mods,
          name: im.name || '',
          typeLine: im.typeLine || im.baseType || '',
          ilvl: typeof im.ilvl === 'number' ? im.ilvl : null
        }
      })
    return { ok: true, listings }
  })

  // poe.ninja PoE2 currency kurları (read-only). Tahmini değeri seçilen para birimine çevirmek için.
  ipcMain.handle('price:ninja-currency', async (_e, league: string) => {
    const lg = encodeURIComponent(league || '')
    const url = `https://poe.ninja/poe2/api/economy/currencyexchange/overview?leagueName=${lg}&overviewName=Currency`
    try {
      const res = await net.fetch(url, { headers: { 'user-agent': POE_UA, accept: 'application/json' } })
      if (!res.ok) return { ok: false, error: 'http_' + res.status }
      const j = (await res.json()) as { lines?: Array<{ id?: string; primaryValue?: number }>; items?: Array<{ id?: string; name?: string; icon?: string }> }
      return { ok: true, lines: j.lines ?? [], items: j.items ?? [] }
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network' }
    }
  })

  // Hazır trade2 arama URL'sini aç (otomatik alım değil). Ayara göre: 'app' → program-içi pencere
  // (kapatılabilir + geri + "Tarayıcıda Aç"); 'browser' → doğrudan varsayılan tarayıcı. (0.17.8)
  ipcMain.on('trade:open-url', (_e, url: string) => {
    if (typeof url !== 'string' || !/^https:\/\/(www\.)?pathofexile\.com\/trade2\//.test(url)) return
    if (appSettings.tradeOpen === 'browser') shell.openExternal(url)
    else createTradeWindow(url)
  })
  // Fiyat overlay'ini gizle (renderer × düğmesi)
  ipcMain.on('priceoverlay:close', () => priceWindow?.hide())
  // Tehlike overlay'ini gizle (renderer × düğmesi)
  ipcMain.on('dangeroverlay:close', () => dangerWindow?.hide())
  // Uygulama-içi "Panodan al" (Faz 8): main panoyu okur (yalnız okuma; ToS uyumlu).
  ipcMain.handle('clipboard:read', () => clipboard.readText() || '')
  // Teşhis (0.17.3): renderer parse sonucunu log'a ekler (pobe-pricelog.txt) — uçtan uca görünürlük.
  ipcMain.on('price:log', (_e, line: unknown) => {
    if (typeof line === 'string' && line) pricelog(line.slice(0, 240))
  })
}

function registerLevelingIpc(): void {
  ipcMain.handle('leveling:get', () => levelingState)
  // Build kodu: kalıcı sakla + tüm pencerelere yayınla (overlay'ler bunu dinler)
  ipcMain.handle('build:get', () => buildStore.code)
  ipcMain.on('build:set', (_e, code: string) => {
    // ham kod → reconstruction snapshot'ını temizle (kod yeterli; importPob yeniden üretir)
    buildStore = { code: typeof code === 'string' ? code : '', built: null, meta: buildStore.meta }
    saveBuild()
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('build:changed', buildStore.code)
  })
  // Bug #1: TAM snapshot (kod + reconstruction PobBuild JSON + meta). Sekme/oturum/restart kalıcı.
  ipcMain.handle('build:get-full', () => buildStore)
  ipcMain.on('build:set-full', (_e, payload: { code?: string; built?: string | null; meta?: unknown }) => {
    buildStore = {
      code: typeof payload?.code === 'string' ? payload.code : '',
      built: typeof payload?.built === 'string' ? payload.built : null,
      meta: payload?.meta ?? null
    }
    saveBuild()
    // overlay'ler ham koddan beslenir (reconstruction'da '' → overlay build göstermez, pre-existing)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('build:changed', buildStore.code)
  })
  // Build'e özel leveling/görev ilerlemesi (Bug #3): tamamlanan görev id → bool
  ipcMain.handle('build:leveling-get', () => loadBuildLeveling())
  ipcMain.on('build:leveling-set', (_e, progress: Record<string, boolean>) => {
    saveBuildLeveling(progress && typeof progress === 'object' ? progress : {})
  })
  // Part 2: "elde ettim" işaretleme ilerlemesi (gear/mod/gem/node id → bool)
  ipcMain.handle('build:progress-get', () => loadBuildProgress())
  ipcMain.on('build:progress-set', (_e, progress: Record<string, boolean>) => {
    saveBuildProgress(progress && typeof progress === 'object' ? progress : {})
  })
  // Build linkinden veri çek (Faz 2 Mobalytics + Faz 3 Maxroll). AĞ İSTİSNASI: yalnız build URL'si gider.
  // CORS/bot için main-process'ten (Electron net.fetch = Chromium ağ yığını → Cloudflare'i geçer).
  // Mobalytics: __PRELOADED_STATE__ içinde HAZIR PoB kodu ("pobCode"). Maxroll: HAZIR KOD YOK →
  //   guide→planner 2-adım, __remixContext'ten yapısal build verisi (renderer reconstruction eder).
  // Her hata net kodla döner (renderer Faz 1 rehberine düşer, çökme yok).
  async function fetchHtml(url: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await net.fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9'
        },
        signal: ctrl.signal
      })
      if (!res.ok) return { ok: false, error: 'http_' + res.status }
      return { ok: true, html: await res.text() }
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network' }
    } finally {
      clearTimeout(timer)
    }
  }
  // `marker = {...}` sonrası dengeli süslü-parantezle JSON nesnesini çıkar (string'leri atlar).
  function extractBalanced(html: string, marker: string): string | null {
    const i = html.indexOf(marker)
    if (i < 0) return null
    const s = html.indexOf('{', i)
    if (s < 0) return null
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = s; j < html.length; j++) {
      const c = html[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) return html.slice(s, j + 1)
      }
    }
    return null
  }
  // Rich-text ağacından (Lexical/Slate) düz metin topla — yazar notları için.
  function collectText(node: unknown, out: string[], depth = 0): void {
    if (!node || typeof node !== 'object' || depth > 24) return
    const o = node as Record<string, unknown>
    if (typeof o.text === 'string' && o.text) out.push(o.text)
    const kids = o.children
    if (Array.isArray(kids)) {
      for (const c of kids) collectText(c, out, depth + 1)
      const t = o.type
      if (t === 'paragraph' || t === 'heading' || t === 'listitem') out.push('\n')
    } else if (Array.isArray(node)) {
      for (const c of node as unknown[]) collectText(c, out, depth + 1)
    } else {
      for (const k of Object.keys(o)) collectText(o[k], out, depth + 1)
    }
  }
  function notesText(node: unknown): string {
    const out: string[] = []
    collectText(node, out)
    return out
      .join(' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, 8000) // payload/LLM sınırı
  }
  function findKey(root: unknown, key: string, depth = 0): unknown {
    if (!root || typeof root !== 'object' || depth > 18) return null
    const o = root as Record<string, unknown>
    if (o[key] !== undefined) return o[key]
    for (const k of Object.keys(o)) {
      const r = findKey(o[k], key, depth + 1)
      if (r != null) return r
    }
    return null
  }
  // `key`'i DOĞRUDAN içeren ilk nesneyi bul (findKey değeri döner; bu kapsayan nesneyi döner).
  function findObjectWithKey(root: unknown, key: string, depth = 0): Record<string, unknown> | null {
    if (!root || typeof root !== 'object' || depth > 18) return null
    const o = root as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(o, key)) return o
    for (const k of Object.keys(o)) {
      const r = findObjectWithKey(o[k], key, depth + 1)
      if (r) return r
    }
    return null
  }
  // Mobalytics yazar nesnesi → { name, url } (links[].url; youtube/twitch/twitter tercih).
  function mbAuthor(a: unknown): { name?: string; url?: string } | undefined {
    if (!a || typeof a !== 'object') return undefined
    const o = a as { name?: unknown; links?: Array<{ url?: string; network?: { id?: string } }> }
    if (typeof o.name !== 'string') return undefined
    let url: string | undefined
    const links = Array.isArray(o.links) ? o.links : []
    const pref = links.find((l) => /youtube|twitch|twitter|x/i.test(l?.network?.id || ''))
    url = (pref || links[0])?.url
    return { name: o.name, url }
  }
  ipcMain.handle('build:fetch-url', async (_e, rawUrl: string) => {
    try {
      if (typeof rawUrl !== 'string' || !rawUrl) return { ok: false, error: 'bad_url' }
      const url = rawUrl.trim()
      // --- MOBALYTICS ---
      // İKİ DURUM: (a) editorial build → HAZIR PoB kodu ("pobCode") gömülü → mevcut importPob hattı.
      //   (b) creator/profile build → "pobCode":null → YAPISAL veri (__PRELOADED_STATE__.buildVariants:
      //   equipment + skillGems + passiveTree) → renderer mobalyticsToPob ile reconstruction eder (Maxroll gibi).
      if (/^https:\/\/(www\.)?mobalytics\.gg\//i.test(url)) {
        const r = await fetchHtml(url)
        if (!r.ok) return { ok: false, error: r.error }
        // (a) hazır PoB kodu (URL-safe base64; null/eksikse yapısala düşülür)
        const m = r.html.match(/"pobCode":"([A-Za-z0-9_\-=]{40,})"/)
        // state'i bir kez parse et (hem yazar notları hem yapısal fallback için)
        let st: Record<string, unknown> | null = null
        try {
          const ctxStr = extractBalanced(r.html, '__PRELOADED_STATE__')
          if (ctxStr) st = JSON.parse(ctxStr) as Record<string, unknown>
        } catch {
          st = null
        }
        // yazar notları + yazar adı/linki (best-effort; başarısızsa import yine çalışır)
        let notes = ''
        let author: { name?: string; url?: string } | undefined
        if (st) {
          try {
            const queries = findKey(st, 'queries')
            if (queries) notes = notesText(queries)
            author = mbAuthor(findKey(st, 'author'))
          } catch {
            /* notes best-effort */
          }
        }
        if (m && m[1]) {
          return { ok: true, kind: 'pobcode', code: m[1], site: 'mobalytics', notes, author, sourceUrl: url }
        }
        // (b) YAPISAL fallback: buildVariants'ı içeren build dokümanını bul + yalına indir
        if (st) {
          const doc = findObjectWithKey(st, 'buildVariants')
          const valuesRaw = (doc?.buildVariants as { values?: unknown[] } | undefined)?.values
          if (Array.isArray(valuesRaw) && valuesRaw.length) {
            // GERÇEK variant başlıkları: childrenVariants[] = [{id,title}] (ör. "lvl 1-14","Endgame").
            // buildVariants.values[].title null geliyor → id ile childrenVariants'tan eşle.
            const titleById: Record<string, string> = {}
            const cv = findKey(st, 'childrenVariants')
            if (Array.isArray(cv)) {
              for (const c of cv) {
                const o = (c || {}) as { id?: unknown; title?: unknown }
                if (typeof o.id === 'string' && typeof o.title === 'string' && o.title.trim()) titleById[o.id] = o.title.trim()
              }
            }
            const variants = valuesRaw.map((vRaw) => {
              const v = (vRaw || {}) as Record<string, unknown>
              const id = typeof v.id === 'string' ? v.id : ''
              // öncelik: childrenVariants başlığı → variant.title → variant.name → null (converter "Variant N")
              const title = titleById[id] || (typeof v.title === 'string' ? v.title : '') || (typeof v.name === 'string' ? v.name : '') || null
              return {
                id: v.id,
                name: title,
                equipment: v.equipment ?? {},
                skillGems: v.skillGems ?? {},
                passiveTree: v.passiveTree ?? {}
              }
            })
            const name = typeof doc?.name === 'string' ? doc.name : undefined
            console.log(`[mobalytics] yapısal: ${variants.length} variant (başlıklar: ${variants.map((v) => v.name || '?').join(' | ')})`)
            return {
              ok: true,
              kind: 'mobalytics',
              site: 'mobalytics',
              data: { name, variants },
              meta: { author, sourceUrl: url },
              notes,
              author,
              sourceUrl: url
            }
          }
        }
        // #5: ne PoB kodu ne yapısal veri → net "veri yok" (UI kısmi/bozuk import yerine kart gösterir)
        return { ok: false, error: 'no_data' }
      }
      // --- MAXROLL: 2-adım (guide→planner) + __remixContext yapısal veri ---
      if (/^https:\/\/(www\.)?maxroll\.gg\/poe-?2\//i.test(url)) {
        let plannerUrl = url
        let guideHtml = ''
        if (!/\/planner\//i.test(url)) {
          const g = await fetchHtml(url)
          if (!g.ok) return { ok: false, error: g.error }
          guideHtml = g.html
          // guide içindeki ilk gerçek planner id (community-builds hariç)
          const ids = [...g.html.matchAll(/\/poe-?2\/planner\/([a-z0-9]{6,})/gi)].map((x) => x[1]).filter((id) => id !== 'community')
          if (!ids.length) return { ok: false, error: 'no_planner_link' }
          plannerUrl = 'https://maxroll.gg/poe2/planner/' + ids[0]
        }
        const p = await fetchHtml(plannerUrl)
        if (!p.ok) return { ok: false, error: p.error }
        // poe2-item span'leri: data-poe2-id -> görünen unique isim (build eşyası unique fallback'i).
        const uniqueNames: Record<string, string> = {}
        for (const html of [guideHtml, p.html]) {
          if (!html) continue
          for (const m of html.matchAll(/data-poe2-id="([^"]+)"[^>]*>([^<]{2,80})</g)) {
            const id = m[1]
            const name = m[2].replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'").trim()
            if (id && name && !uniqueNames[id]) uniqueNames[id] = name
          }
        }
        const ctxStr = extractBalanced(p.html, '__remixContext')
        if (!ctxStr) return { ok: false, error: 'no_remix' }
        type MaxProfile = { class?: string; name?: string; data?: string }
        let profile: MaxProfile | null = null
        try {
          const ctx = JSON.parse(ctxStr) as Record<string, unknown>
          // state.loaderData.poe2-planner-by-id.profile (recursive ara)
          const stack: unknown[] = [ctx]
          while (stack.length) {
            const o = stack.pop()
            if (!o || typeof o !== 'object') continue
            const rec = o as Record<string, unknown>
            if (rec['poe2-planner-by-id'] && typeof rec['poe2-planner-by-id'] === 'object') {
              profile = (rec['poe2-planner-by-id'] as { profile?: MaxProfile }).profile ?? null
              break
            }
            for (const k of Object.keys(rec)) stack.push(rec[k])
          }
        } catch {
          return { ok: false, error: 'parse' }
        }
        if (!profile || typeof profile.data !== 'string') return { ok: false, error: 'no_profile' }
        let data: { planner?: Record<string, unknown>; items?: unknown }
        try {
          data = JSON.parse(profile.data)
        } catch {
          return { ok: false, error: 'parse' }
        }
        const pl = (data.planner ?? {}) as Record<string, unknown>
        // payload'ı yalın tut: reconstruction'ın ihtiyacı (notes/changelog/embeds atılır)
        const trimmed = {
          planner: {
            class: pl.class,
            ascendancy: pl.ascendancy,
            level: pl.level,
            version: pl.version,
            skills: pl.skills,
            passives: pl.passives,
            equipment: pl.equipment
          },
          items: data.items ?? {}
        }
        console.log(`[maxroll] items DB=${Object.keys(trimmed.items as object).length}, uniqueNames=${Object.keys(uniqueNames).length} çekildi`)
        // yazar notları (Lexical root) + yazar adı/linki (best-effort)
        const notes = pl.notes ? notesText((pl.notes as { root?: unknown }).root ?? pl.notes) : ''
        let author: { name?: string; url?: string } | undefined
        const au = pl.author as { user?: { nickname?: string; social?: Record<string, string> } } | undefined
        if (au?.user?.nickname) {
          const soc = au.user.social || {}
          author = { name: au.user.nickname, url: soc.youtube || soc.twitch || soc.twitter }
        }
        return {
          ok: true,
          kind: 'maxroll',
          site: 'maxroll',
          data: trimmed,
          meta: { class: profile.class, name: profile.name, uniqueNames },
          notes,
          author,
          sourceUrl: url
        }
      }
      return { ok: false, error: 'unsupported' }
    } catch (e) {
      return { ok: false, error: 'network', detail: (e as Error).message }
    }
  })
  // Yazar notlarını TR'ye çevir (kullanıcının KENDİ anahtarı; yalnız main). SADIK çeviri, ekleme yok.
  ipcMain.handle('build:translate', async (_e, payload: { text: string; lang?: string }) => {
    const text = (payload?.text || '').slice(0, 8000)
    if (!text) return { ok: false, error: 'empty' }
    const lang = payload?.lang === 'en' ? 'English' : 'Turkish'
    const r = await callLLM({ system: NOTES_TRANSLATE_SYSTEM(lang), user: text, maxTokens: 4000 })
    return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error, detail: r.detail }
  })
  // YAZAR NOTLARI TR çevirisi (Faz 5) — build başına CACHE (sağlayıcı + not-hash anahtarı) +
  // uzun notları parçalara böl. Aynı build/sağlayıcı tekrar açılınca LLM çağrısı YOK.
  // Sadık çeviri (build:translate ile aynı prompt); anahtar yok/hata → {ok:false}.
  const notesCachePath = (): string => join(app.getPath('userData'), 'pobe-notes-cache.json')
  const loadNotesCache = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(notesCachePath(), 'utf-8'))
    } catch {
      return {}
    }
  }
  ipcMain.handle('build:translate-notes', async (_e, text: string) => {
    const t = (typeof text === 'string' ? text : '').slice(0, 8000)
    if (!t) return { ok: false, error: 'empty' }
    const provider = appSettings.advisor.provider
    if (!appSettings.advisor.keys[provider]) return { ok: false, error: 'no_key' }
    const key = notesCacheKey(provider, t) // cache anahtarı = sağlayıcı + not içeriği hash (llm.ts)
    const cache = loadNotesCache()
    if (cache[key]) return { ok: true, text: cache[key], cached: true } // CACHE HIT → LLM yok
    const system = NOTES_TRANSLATE_SYSTEM('Turkish')
    const chunks = chunkNotes(t)
    const parts: string[] = []
    for (const c of chunks) {
      const r = await callLLM({ system, user: c, maxTokens: 4000 })
      if (!r.ok) return { ok: false, error: r.error, detail: r.detail }
      parts.push(r.text)
    }
    const out = parts.join('\n\n')
    cache[key] = out
    try {
      writeFileSync(notesCachePath(), JSON.stringify(cache), 'utf-8')
    } catch {
      // cache yazılamazsa sorun değil
    }
    return { ok: true, text: out, cached: false }
  })
  // --- .build dosyası dışa aktarma (Faz 2) — yalnız YEREL dosya yazma; ToS sorunu yok ---
  // Varsayılan: Documents/My Games/Path of Exile 2/BuildPlanner (yoksa OLUŞTUR). Ya da "farklı kaydet".
  const buildPlannerDir = (): string =>
    join(app.getPath('documents'), 'My Games', 'Path of Exile 2', 'BuildPlanner')
  ipcMain.handle('build:export-file', async (_e, payload: { json: string; filename: string; custom?: boolean }) => {
    const json = typeof payload?.json === 'string' ? payload.json : ''
    if (!json) return { ok: false, error: 'empty' }
    const fname = (payload?.filename || 'PoE2_Build.build').replace(/[/\\:*?"<>|]+/g, '_')
    try {
      let target: string
      if (payload?.custom) {
        const res = await dialog.showSaveDialog({
          title: '.build dosyasını kaydet',
          defaultPath: join(buildPlannerDir(), fname),
          filters: [{ name: 'PoE2 Build', extensions: ['build'] }]
        })
        if (res.canceled || !res.filePath) return { ok: false, error: 'canceled' }
        target = res.filePath
      } else {
        const dir = buildPlannerDir()
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true }) // klasör yoksa oluştur
        target = join(dir, fname)
      }
      writeFileSync(target, json, 'utf-8')
      return { ok: true, path: target, dir: buildPlannerDir() }
    } catch (e) {
      return { ok: false, error: 'write_failed', detail: (e as Error).message }
    }
  })
  // BuildPlanner klasörünü dosya gezgininde aç (yoksa oluştur).
  ipcMain.handle('build:open-folder', async () => {
    const dir = buildPlannerDir()
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      await shell.openPath(dir)
      return { ok: true, dir }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // --- Loot filter dışa aktarma (Faz 6-7) — yalnız YEREL .filter yazma; ToS sorunu yok ---
  // PoE2 .filter dosyaları Documents/My Games/Path of Exile 2/ KÖKÜNE konur (oyun oradan listeler).
  const filterDir = (): string => join(app.getPath('documents'), 'My Games', 'Path of Exile 2')
  ipcMain.handle('filter:export-file', async (_e, payload: { text: string; filename: string; custom?: boolean }) => {
    const text = typeof payload?.text === 'string' ? payload.text : ''
    if (!text) return { ok: false, error: 'empty' }
    let fname = (payload?.filename || 'PoBe.filter').replace(/[/\\:*?"<>|]+/g, '_')
    if (!/\.filter$/i.test(fname)) fname += '.filter'
    try {
      let target: string
      if (payload?.custom) {
        const res = await dialog.showSaveDialog({
          title: 'Loot filter dosyasını kaydet',
          defaultPath: join(filterDir(), fname),
          filters: [{ name: 'PoE2 Filter', extensions: ['filter'] }]
        })
        if (res.canceled || !res.filePath) return { ok: false, error: 'canceled' }
        target = res.filePath
      } else {
        const dir = filterDir()
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true }) // klasör yoksa oluştur
        target = join(dir, fname)
      }
      writeFileSync(target, text, 'utf-8')
      return { ok: true, path: target, dir: filterDir() }
    } catch (e) {
      return { ok: false, error: 'write_failed', detail: (e as Error).message }
    }
  })
  // PoE2 filter klasörünü dosya gezgininde aç (yoksa oluştur).
  ipcMain.handle('filter:open-folder', async () => {
    const dir = filterDir()
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      await shell.openPath(dir)
      return { ok: true, dir }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Craft hedef state: kalıcı sakla (renderer JSON'u)
  ipcMain.handle('craft:get', () => craftState)
  ipcMain.on('craft:set', (_e, json: string) => {
    craftState = typeof json === 'string' ? json : ''
    saveCraft()
  })
  ipcMain.on('leveling:enter', (_e, id: string) => handleAreaCode(id))
  ipcMain.on('leveling:toggle', (_e, id: string) => {
    if (!id) return
    const i = levelingState.visited.indexOf(id)
    if (i >= 0) levelingState.visited.splice(i, 1)
    else levelingState.visited.push(id)
    saveLevelingState()
    broadcastLevelingState()
  })
  ipcMain.on('leveling:set-current', (_e, id: string | null) => {
    levelingState.currentId = id
    saveLevelingState()
    broadcastLevelingState()
  })
  ipcMain.on('leveling:reset', () => {
    levelingState = { visited: [], currentId: null, location: null, level: null }
    saveLevelingState()
    broadcastLevelingState()
  })
  // --- Ayarlar (mod + overlay + log yolu) — ayar paneli kullanır ---
  ipcMain.handle('settings:get', () => fullSettings())
  ipcMain.on('settings:set', (_e, patch: Partial<AppSettings>) => {
    const modeChanged = patch.mode && patch.mode !== appSettings.mode
    let cornerChanged = false
    if (patch.mode) appSettings.mode = patch.mode
    if (patch.lang === 'tr' || patch.lang === 'en') appSettings.lang = patch.lang
    let scaleChanged = false
    if (patch.overlay) {
      const po = patch.overlay
      cornerChanged = !!po.corner && po.corner !== appSettings.overlay.corner
      if (typeof po.opacity === 'number') appSettings.overlay.opacity = po.opacity
      if (po.corner) appSettings.overlay.corner = po.corner
      if (typeof po.scale === 'number' && po.scale !== appSettings.overlay.scale) {
        appSettings.overlay.scale = po.scale
        scaleChanged = true
      }
      if (typeof po.fontScale === 'number') appSettings.overlay.fontScale = po.fontScale
      // bounds elle taşımadan korunur (köşe değişince repositionOverlayCorner yeniler)
    }
    if (patch.advisor) {
      const pa = patch.advisor as { mode?: string; provider?: string; apiKey?: string; model?: string }
      if (pa.mode === 'offline' || pa.mode === 'llm') appSettings.advisor.mode = pa.mode
      if (pa.provider === 'claude' || pa.provider === 'openai' || pa.provider === 'gemini')
        appSettings.advisor.provider = pa.provider
      // apiKey/model SEÇİLİ sağlayıcıya yazılır (renderer aktif sağlayıcı için gönderir)
      const prov = appSettings.advisor.provider
      if (typeof pa.apiKey === 'string') appSettings.advisor.keys[prov] = pa.apiKey
      if (typeof pa.model === 'string') appSettings.advisor.models[prov] = pa.model.trim() || DEFAULT_MODELS[prov]
    }
    let priceShortcutChanged = false
    if (patch.priceCheck) {
      const pp = patch.priceCheck as { enabled?: boolean; shortcut?: string }
      if (typeof pp.enabled === 'boolean' && pp.enabled !== appSettings.priceCheck.enabled) {
        appSettings.priceCheck.enabled = pp.enabled
        priceShortcutChanged = true
        if (!pp.enabled) priceWindow?.hide()
      }
      if (typeof pp.shortcut === 'string' && pp.shortcut) {
        // Ctrl+C gibi yasaklı accel'i reddet (sistem kopyalamasını engellemesin) → Ctrl+D'ye düş.
        const sane = sanitizeShortcut(pp.shortcut, 'CommandOrControl+D')
        if (sane !== appSettings.priceCheck.shortcut) {
          appSettings.priceCheck.shortcut = sane
          priceShortcutChanged = true
        }
      }
    }
    let dangerShortcutChanged = false
    if (patch.dangerCheck) {
      const dp = patch.dangerCheck as { enabled?: boolean; shortcut?: string }
      if (typeof dp.enabled === 'boolean' && dp.enabled !== appSettings.dangerCheck.enabled) {
        appSettings.dangerCheck.enabled = dp.enabled
        dangerShortcutChanged = true
        if (!dp.enabled) dangerWindow?.hide()
      }
      if (typeof dp.shortcut === 'string' && dp.shortcut) {
        const sane = sanitizeShortcut(dp.shortcut, 'CommandOrControl+E')
        if (sane !== appSettings.dangerCheck.shortcut) {
          appSettings.dangerCheck.shortcut = sane
          dangerShortcutChanged = true
        }
      }
    }
    if (typeof patch.autoCopy === 'boolean') appSettings.autoCopy = patch.autoCopy
    if (patch.tradeOpen === 'app' || patch.tradeOpen === 'browser') appSettings.tradeOpen = patch.tradeOpen
    if (typeof patch.closeToTray === 'boolean') appSettings.closeToTray = patch.closeToTray
    if (typeof patch.poe2AutoShow === 'boolean') {
      appSettings.poe2AutoShow = patch.poe2AutoShow
      applyPoe2Watch()
    }
    if (typeof patch.launchOnStartup === 'boolean') {
      appSettings.launchOnStartup = patch.launchOnStartup
      applyLoginItem()
    }
    let zoomChanged = false
    if (patch.ui && typeof patch.ui === 'object') {
      const pu = patch.ui as { font?: string; zoom?: number }
      if (typeof pu.font === 'string' && pu.font) appSettings.ui.font = pu.font
      if (typeof pu.zoom === 'number' && pu.zoom >= 0.6 && pu.zoom <= 2 && pu.zoom !== appSettings.ui.zoom) {
        appSettings.ui.zoom = pu.zoom
        zoomChanged = true
      }
    }
    if (typeof patch.firstRunDone === 'boolean') appSettings.firstRunDone = patch.firstRunDone
    if (typeof patch.lastSeenVersion === 'string') appSettings.lastSeenVersion = patch.lastSeenVersion
    saveSettings()
    if (modeChanged) applyOverlayMode()
    if (cornerChanged) repositionOverlayCorner()
    else if (scaleChanged) resizeOverlayScale()
    if (priceShortcutChanged) applyPriceShortcut()
    if (dangerShortcutChanged) applyDangerShortcut()
    if (zoomChanged) applyUiZoom()
    broadcastSettings()
  })
  // --- Craft danışmanı LLM çağrısı (yalnız main; anahtar renderer'a sızmaz) ---
  // GROUNDED: renderer ground-truth bağlamı (geçerli işlemler + %şanslar + state + hedef) gönderir;
  // LLM SADECE verilen validActions'tan seçer, mekanik uydurmaz. Hata/anahtarsızlık -> {ok:false}.
  ipcMain.handle('advisor:llm', async (_e, payload: { context: unknown; lang: string }) => {
    const lang = payload?.lang === 'en' ? 'English' : 'Turkish'
    const system =
      'You are a MASTER Path of Exile 2 crafter advising inside a deterministic simulator. ' +
      'You receive a JSON ground-truth context with: the current item state, the target mods, an offline ' +
      'analysis (recognizedStrategy, recommendedPlan steps with real chances, cumulativeApproxPct, ' +
      'alternatives, risks, deadend), and "validActions" — the ONLY legal next operations, each with ' +
      'id, label, technique, progressChancePct, guaranteed, costRank (relative 1-5) and risk. ' +
      'Think like a master: weigh guaranteed essence-slams vs cheaper gambles, omen-targeted exalts, ' +
      'annul-to-make-room, fracture-then-chaos, and reset/new-base when stuck. ' +
      'STRICT RULES (do not break): choose exactly ONE action by its id from validActions. NEVER invent ' +
      'operations, mods, probabilities, costs or game mechanics not present in the data. Use the given ' +
      'chances/costs/risks as-is — do not fabricate numbers. The offline recommendedPlan is sound; only ' +
      'deviate if another validAction is clearly better, and justify briefly. If validActions is empty or ' +
      'the target is infeasible (deadend), advise resetting / a new base or ilvl. ' +
      `Reply ONLY with compact JSON: {"actionId":"<id from validActions>","advice":"<one short master-crafter sentence in ${lang}>"}.`
    const r = await callLLM({ system, user: JSON.stringify(payload.context), maxTokens: 300 })
    if (!r.ok) return { ok: false, error: r.error, detail: r.detail }
    const m = r.text.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as { actionId?: string; advice?: string }
        return { ok: true, actionId: parsed.actionId ?? '', advice: parsed.advice ?? r.text }
      } catch {
        return { ok: true, actionId: '', advice: r.text }
      }
    }
    return { ok: true, actionId: '', advice: r.text }
  })

  // --- Yardım/Sohbet botu (Cila ADIM 2) — program + PoE2 yardımı. callLLM (kullanıcı sağlayıcısı). ---
  // GROUNDED: PoBe özellik listesi system prompt'ta; kesin sayı/fiyat için "ilgili sekmeye bak". Uydurma yok.
  // Gizlilik: yalnız soru + program-bağlamı gider; kişisel/oyun verisi yok. Anahtarsız → {ok:false} (renderer SSS'e düşer).
  ipcMain.handle('chat:send', async (_e, payload: { messages: Array<{ role: string; content: string }>; lang: string }) => {
    const lang = payload?.lang === 'en' ? 'English' : 'Turkish'
    const system =
      `You are the in-app help assistant for "Path of Berkay" (PoBe), a bilingual (TR/EN) desktop database & overlay for Path of Exile 2. ` +
      `Answer the user's question about EITHER how to use PoBe OR about Path of Exile 2 itself. Reply in ${lang}. Be concise and practical.\n\n` +
      `PoBe features you can guide on:\n` +
      `- Database tabs: Gems/Currency, Items, Uniques, Mods (Özellikler), Areas (Bölgeler), Ascendancies, Passives (list + visual tree), Atlas, Mechanics, Bosses, Crafting reference. Search matches English and Turkish.\n` +
      `- Crafting > Simulator: pick a base + ilvl, apply currency/essence/omen/rune/vaal/quality, target an item; the Master Craft advisor suggests the best step. Fully local, no real currency spent.\n` +
      `- Build tab: import a Path of Building (PoE2) export code, OR paste a Maxroll/Mobalytics build link. Shows gear, gems, passive tree, leveling stages. "Create .build" exports a PoE2 0.5 .build file to Documents/My Games/Path of Exile 2/BuildPlanner. "Create filter for this build" generates a build-specific loot .filter.\n` +
      `- In-game Price Check: hover an item in game, press Ctrl+C yourself, then the shortcut (default Ctrl+D) → overlay shows an estimated value and lets you open trade. Build comparison per-stat is included.\n` +
      `- Endgame Danger Check (Tehlike tab): copy a waystone (Ctrl+C) then the shortcut (default Ctrl+E), OR paste it in the Tehlike tab and click "Panodan al"/Analyze → SAFE/CAUTION/DANGEROUS vs your build's defenses with reasons.\n` +
      `- Settings: language TR/EN, overlay opacity/scale, LLM provider (Claude/ChatGPT/Gemini) + your own API key, shortcuts.\n` +
      `- Overlays (price/danger/leveling) only appear when the game runs in Windowed Fullscreen / Borderless mode.\n` +
      `- TR localization model: proper names (gems, items, uniques, bosses, etc.) stay in English even in TR mode; only descriptions are Turkish.\n\n` +
      `RULES: Never invent exact prices, drop rates, numeric values, or game mechanics you are unsure of — for live numbers tell the user to check the relevant PoBe tab or the official trade site. Be honest when unsure. Keep answers short (a few sentences) unless asked for detail.`
    // son ~8 mesajı bağlama ver; kullanıcı son mesajı = soru
    const hist = (payload?.messages ?? []).slice(-8)
    const userBlock = hist.map((m) => (m.role === 'assistant' ? 'PoBe' : 'User') + ': ' + m.content).join('\n')
    const r = await callLLM({ system, user: userBlock, maxTokens: 700 })
    return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error, detail: r.detail }
  })
  // Dış bağlantıyı varsayılan tarayıcıda aç — yalnız beyaz listedeki https domain'leri + mailto.
  ipcMain.on('open:external', (_e, url: string) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url)
    else console.log('[security] open:external reddedildi:', url)
  })
  // Uygulama sürümü (İletişim/Hakkında bölümü) — package.json'dan.
  ipcMain.handle('app:version', () => app.getVersion())
  // --- Otomatik güncelleme IPC (ADIM C) ---
  ipcMain.handle('update:get-state', () => updateState)
  ipcMain.handle('update:check', async () => {
    await checkForUpdates(true)
    return updateState
  })
  ipcMain.handle('update:download', async () => {
    if (updateState.status !== 'available' && updateState.status !== 'error') return updateState
    try {
      setUpdate({ status: 'downloading', progress: 0, error: '' })
      await autoUpdater.downloadUpdate()
    } catch (e) {
      setUpdate({ status: 'error', error: (e as Error).message })
    }
    return updateState
  })
  ipcMain.on('update:install', () => {
    try {
      autoUpdater.quitAndInstall()
    } catch (e) {
      console.log('[update] quitAndInstall hatası:', (e as Error).message)
    }
  })
  // Uzak ikon (Mobalytics/Maxroll CDN) → net.fetch + userData CACHE → data URL.
  // Bundled ikon yoksa GameBuildView buradan ister. Her açılışta tekrar indirme YOK (disk cache).
  // ToS: yalnız ikon görseli çekilir; kişisel veri yok. Yalnız izinli CDN host'ları.
  ipcMain.handle('icon:cache', async (_e, rawUrl: string) => {
    try {
      if (typeof rawUrl !== 'string') return { ok: false }
      const url = rawUrl.trim()
      // yalnız bilinen oyun-verisi CDN'leri (uydurma/keyfi indirme yok)
      if (!/^https:\/\/(cdn\.mobalytics\.gg|[\w.-]*maxroll\.gg|web\.poecdn\.com|[\w.-]*poe2db\.tw)\//i.test(url)) return { ok: false }
      const dir = join(app.getPath('userData'), 'icon-cache')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const ext = (url.match(/\.(png|webp|jpe?g|gif)(?:\?|#|$)/i)?.[1] || 'img').toLowerCase()
      const fp = join(dir, createHash('sha1').update(url).digest('hex') + '.' + ext)
      let buf: Buffer
      if (existsSync(fp)) {
        buf = readFileSync(fp)
      } else {
        const res = await net.fetch(url)
        if (!res.ok) return { ok: false }
        buf = Buffer.from(await res.arrayBuffer())
        writeFileSync(fp, buf)
      }
      const mime =
        ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
      return { ok: true, dataUrl: `data:${mime};base64,` + buf.toString('base64') }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('leveling:get-log-status', () => logStatus())
  ipcMain.handle('leveling:pick-log', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Client.txt seç',
      properties: ['openFile'],
      filters: [{ name: 'Client log', extensions: ['txt'] }]
    })
    if (!res.canceled && res.filePaths[0]) {
      setLogPath(res.filePaths[0])
      broadcastSettings()
    }
    return logStatus()
  })
  // "Otomatik bul": Steam varsayılan yolunu tekrar dene
  ipcMain.handle('leveling:auto-detect-log', () => {
    if (existsSync(STEAM_DEFAULT)) {
      setLogPath(STEAM_DEFAULT)
    } else {
      startWatcher() // env/var olan yolu tekrar dene
    }
    broadcastSettings()
    return logStatus()
  })
  // Overlay tıklama geçirgenliği (overlay renderer hover/pin ile çağırır)
  ipcMain.on('overlay:set-interactive', (_e, interactive: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(!interactive, { forward: true })
  })
}

// --- Overlay penceresi (transparent, always-on-top; #overlay hash) -----------
const OVERLAY_SIZE = { width: 300, height: 200 }
let overlayWindow: BrowserWindow | null = null

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? '#' + hash : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}
function scaledSize(): { width: number; height: number } {
  const s = appSettings.overlay.scale || 1
  return {
    width: Math.round(OVERLAY_SIZE.width * s),
    height: Math.round(OVERLAY_SIZE.height * s)
  }
}
function cornerBounds(corner: OverlayCorner): OverlayBounds {
  const wa = screen.getPrimaryDisplay().workArea
  const { width: w, height: h } = scaledSize()
  const m = 16
  let x = wa.x + m
  let y = wa.y + m
  if (corner === 'tr' || corner === 'br') x = wa.x + wa.width - w - m
  if (corner === 'bl' || corner === 'br') y = wa.y + wa.height - h - m
  return { x, y, width: w, height: h }
}
// Ölçek değişince overlay'i yeniden boyutlandır (mevcut konumu/sol-üst köşeyi koru)
function resizeOverlayScale(): void {
  const { width, height } = scaledSize()
  const cur = appSettings.overlay.bounds ?? cornerBounds(appSettings.overlay.corner)
  const b: OverlayBounds = { x: cur.x, y: cur.y, width, height }
  appSettings.overlay.bounds = b
  saveSettings()
  if (overlayWindow) overlayWindow.setBounds(b)
}
function createOverlay(): void {
  if (overlayWindow) return
  const b = appSettings.overlay.bounds ?? cornerBounds(appSettings.overlay.corner)
  overlayWindow = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(true, { forward: true }) // varsayılan: tıklama geçer
  loadRenderer(overlayWindow, 'overlay')
  overlayWindow.once('ready-to-show', () => overlayWindow?.show())
  const saveBounds = (): void => {
    if (!overlayWindow) return
    const wb = overlayWindow.getBounds()
    appSettings.overlay.bounds = { x: wb.x, y: wb.y, width: wb.width, height: wb.height }
    saveSettings()
  }
  overlayWindow.on('moved', saveBounds)
  overlayWindow.on('resized', saveBounds)
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}
function closeOverlay(): void {
  if (overlayWindow) {
    overlayWindow.destroy()
    overlayWindow = null
  }
}
function applyOverlayMode(): void {
  if (appSettings.mode === 'overlay' || appSettings.mode === 'both') createOverlay()
  else closeOverlay()
}
function repositionOverlayCorner(): void {
  const b = cornerBounds(appSettings.overlay.corner)
  appSettings.overlay.bounds = b
  saveSettings()
  if (overlayWindow) overlayWindow.setBounds(b)
}

// ============================================================================
// OYUN-İÇİ FİYAT OVERLAY'İ (Faz 2) — global kısayol → PANO oku → fiyat paneli.
// ToS: GİRDİ OTOMASYONU YOK (sentetik tuş yok). Kullanıcı kendi Ctrl+C'siyle kopyalar,
// sonra kısayola basar; main yalnız panoyu OKUR. Overlay yalnız Borderless'ta görünür.
// ----------------------------------------------------------------------------
let priceShortcutOk = false
let registeredAccel = ''
// PROGRAM-İÇİ TRADE PENCERESI: "Trade'de Aç" varsayılan tarayıcı yerine kendi penceremizde
// pathofexile.com/trade2'yi yükler. GÜVENLİK: yalnız PoE + Steam-giriş domainlerine navigasyon izni;
// diğerleri reddedilir, contextIsolation+sandbox, Node yok. Native çerçeve (kapatılabilir) + enjekte GERİ butonu.
// 0.17.7: KALICI partition (persist:trade → çerez/oturum kalır, Steam girişi tamamlanır), Chrome UA
// (Steam varsayılan Electron UA'yı tıkamasın), did-fail-load/timeout → Yenile + Tarayıcıda Aç butonları.
let tradeWindow: BrowserWindow | null = null
const TRADE_PARTITION = 'persist:trade'
// 0.17.8: GERÇEK UA — sürümü Electron'un GÖMÜLÜ Chromium'undan (process.versions.chrome) türet.
// "Electron/..." ve uygulama adı token'ları ÇIKARILDI (bot işareti). Böylece UA major sürümü, Chromium'un
// kendi gönderdiği sec-ch-ua client-hint'leriyle EŞLEŞİR → Cloudflare "verify you are human" döngüsü kırılır.
// (Captcha bypass YOK; amaç pencerenin gerçek tarayıcı gibi davranıp kullanıcının doğrulamayı geçebilmesi.)
const TRADE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
// İzinli host'lar: PoE + Steam OpenID giriş akışı (steamcommunity + *.steampowered.com).
function isTradeNavHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return /(^|\.)pathofexile\.com$/.test(h) || /(^|\.)steamcommunity\.com$/.test(h) || /(^|\.)steampowered\.com$/.test(h)
  } catch {
    return false
  }
}
const BACK_BTN_JS = `(function(){try{
  if(document.getElementById('pobe-back'))return;
  var b=document.createElement('button');b.id='pobe-back';b.textContent='\\u2190 Geri';
  b.style.cssText='position:fixed;top:8px;left:8px;z-index:2147483647;font:600 13px system-ui,sans-serif;color:#1a1408;background:linear-gradient(#d9b765,#c19a45);border:1px solid #8a6f2e;border-radius:4px;padding:5px 12px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.4)';
  b.onclick=function(){history.back()};
  document.body.appendChild(b);
}catch(e){}})()`
// "Tarayıcıda Aç ↗" butonu (sağ üst, HER ZAMAN): target=_blank → setWindowOpenHandler → harici tarayıcı.
// Kullanıcı CF döngüsünden ya da herhangi bir anda gerçek tarayıcıya kaçabilir. (IPC/preload gerekmez.)
function openExternalBtnJs(url: string): string {
  const u = url.replace(/'/g, '%27').replace(/\\/g, '%5C')
  return `(function(){try{
  if(document.getElementById('pobe-ext'))return;
  var a=document.createElement('a');a.id='pobe-ext';a.href='${u}';a.target='_blank';a.textContent='Tarayıcıda Aç \\u2197';
  a.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483647;font:600 12px system-ui,sans-serif;color:#e3c172;background:rgba(20,16,10,.92);border:1px solid rgba(201,161,74,.6);border-radius:4px;padding:5px 12px;cursor:pointer;text-decoration:none;box-shadow:0 2px 6px rgba(0,0,0,.4)';
  document.body.appendChild(a);
}catch(e){}})()`
}
// 15 sn sonra Cloudflare "verify you are human" hâlâ duruyorsa BELİRGİN banner ("Tarayıcıda Aç") göster.
// CF doğrulamasını OTOMATİK GEÇMEZ/ÇÖZMEZ — yalnız kullanıcıya gerçek-tarayıcı kaçış yolu sunar.
function cfBannerJs(url: string): string {
  const u = url.replace(/'/g, '%27').replace(/\\/g, '%5C')
  return `(function(){try{
  var t=(document.title||'').toLowerCase();
  var cf = t.indexOf('just a moment')>=0 || t.indexOf('verify you are human')>=0 || !!document.querySelector('#challenge-running,#cf-challenge-running,.cf-turnstile,#turnstile-wrapper,iframe[src*="challenges.cloudflare.com"]');
  if(!cf) return;
  if(document.getElementById('pobe-cfbanner'))return;
  var d=document.createElement('div');d.id='pobe-cfbanner';
  d.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#1a140c;border-top:1px solid #8a6f2e;color:#d8cdb4;font:13px system-ui,sans-serif;padding:10px 14px;display:flex;align-items:center;gap:12px;justify-content:center';
  d.innerHTML='<span>Doğrulama uzun sürüyor. Burada tamamlayabilir ya da tarayıcıda açabilirsin.</span>';
  var a=document.createElement('a');a.href='${u}';a.target='_blank';a.textContent='Tarayıcıda Aç \\u2197';
  a.style.cssText='color:#1a1408;background:linear-gradient(#d9b765,#c19a45);border:1px solid #8a6f2e;border-radius:4px;padding:6px 14px;text-decoration:none;font-weight:600';
  d.appendChild(a);document.body.appendChild(d);
}catch(e){}})()`
}
// Yükleme takılır/başarısız olursa gösterilen hata sayfası: "Yenile" (location.href) + "Tarayıcıda Aç"
// (target=_blank → setWindowOpenHandler → harici tarayıcı). IPC/preload gerekmez.
function tradeErrorHtml(url: string): string {
  const u = url.replace(/'/g, '%27')
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>Trade</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0e10;color:#d8cdb4;font-family:system-ui,sans-serif">
<div style="text-align:center;max-width:420px;padding:24px">
<div style="font-size:15px;color:#e0a44f;margin-bottom:6px">⚠ Trade sayfası yüklenemedi</div>
<div style="font-size:12.5px;color:#b8a982;line-height:1.5;margin-bottom:18px">Bağlantı takıldı veya zaman aşımına uğradı. Yeniden deneyebilir ya da tarayıcıda açabilirsin.</div>
<button onclick="location.href='${u}'" style="font:600 13px system-ui;color:#1a1408;background:linear-gradient(#d9b765,#c19a45);border:1px solid #8a6f2e;border-radius:4px;padding:8px 18px;cursor:pointer;margin:4px">↻ Yenile</button>
<a href="${u}" target="_blank" style="display:inline-block;font:600 13px system-ui;color:#e3c172;background:transparent;border:1px solid rgba(201,161,74,.55);border-radius:4px;padding:8px 18px;cursor:pointer;margin:4px;text-decoration:none">Tarayıcıda Aç ↗</a>
</div></body></html>`)}`
}
/** Bir webContents'e güvenlik + UA + GERİ/Tarayıcıda-Aç butonu kancalarını uygula.
 *  tradeUrl verilirse (ana pencere) "Tarayıcıda Aç" butonu enjekte edilir; Steam child'larda verilmez. */
function wireTradeContents(wc: Electron.WebContents, tradeUrl?: string): void {
  wc.setUserAgent(TRADE_UA)
  wc.on('will-navigate', (e, navUrl) => {
    if (!isTradeNavHost(navUrl)) {
      e.preventDefault()
      if (isAllowedExternalUrl(navUrl)) shell.openExternal(navUrl)
    }
  })
  // Steam giriş popup'ları (steamcommunity/steampowered) AYNI partition'da child pencerede açılır;
  // pathofexile.com target=_blank ("Tarayıcıda Aç") harici tarayıcıya; diğerleri reddedilir.
  wc.setWindowOpenHandler((d) => {
    const h = (() => {
      try {
        return new URL(d.url).hostname.toLowerCase()
      } catch {
        return ''
      }
    })()
    if (/(^|\.)steamcommunity\.com$/.test(h) || /(^|\.)steampowered\.com$/.test(h)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          width: 900,
          height: 760,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: TRADE_PARTITION }
        }
      }
    }
    if (isAllowedExternalUrl(d.url)) shell.openExternal(d.url)
    return { action: 'deny' }
  })
  wc.on('did-create-window', (child) => wireTradeContents(child.webContents))
  const inject = (): void => {
    wc.executeJavaScript(BACK_BTN_JS).catch(() => {})
    if (tradeUrl) wc.executeJavaScript(openExternalBtnJs(tradeUrl)).catch(() => {})
  }
  wc.on('did-finish-load', inject)
  wc.on('did-navigate-in-page', inject)
}
function createTradeWindow(url: string): void {
  if (tradeWindow && !tradeWindow.isDestroyed()) {
    tradeWindow.loadURL(url)
    if (tradeWindow.isMinimized()) tradeWindow.restore()
    tradeWindow.focus()
    return
  }
  // Kalıcı partition + gerçek Chromium UA (çerez/oturum — cf_clearance dahil — diske yazılır, Steam tıkamaz).
  const ses = session.fromPartition(TRADE_PARTITION)
  ses.setUserAgent(TRADE_UA)
  console.log('[trade] partition persist:trade UA:', ses.getUserAgent())
  const wa = screen.getPrimaryDisplay().workArea
  const w = Math.min(1180, wa.width - 40)
  const h = Math.min(840, wa.height - 40)
  tradeWindow = new BrowserWindow({
    x: wa.x + Math.round((wa.width - w) / 2),
    y: wa.y + Math.round((wa.height - h) / 2),
    width: w,
    height: h,
    title: 'Path of Berkay — Trade',
    autoHideMenuBar: true,
    backgroundColor: '#0a0e10',
    icon: appIconPath(),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: TRADE_PARTITION }
  })
  const wc = tradeWindow.webContents
  wireTradeContents(wc, url) // url → "Tarayıcıda Aç" butonu enjekte edilir
  // Yükleme takıldı/başarısız → hata sayfası (Yenile + Tarayıcıda Aç). -3 = kullanıcı/iç iptal, yok say.
  let loadTimer: ReturnType<typeof setTimeout> | null = null
  let cfTimer: ReturnType<typeof setTimeout> | null = null
  const clearTimers = (): void => {
    if (loadTimer) {
      clearTimeout(loadTimer)
      loadTimer = null
    }
    if (cfTimer) {
      clearTimeout(cfTimer)
      cfTimer = null
    }
  }
  const showError = (): void => {
    if (loadTimer) {
      clearTimeout(loadTimer)
      loadTimer = null
    }
    if (tradeWindow && !tradeWindow.isDestroyed()) tradeWindow.webContents.loadURL(tradeErrorHtml(url)).catch(() => {})
  }
  wc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && !/^data:/.test(validatedURL)) showError()
  })
  // sayfa DOM'u geldi → yükleme timeout'unu iptal et; 15 sn sonra CF challenge hâlâ duruyorsa banner göster.
  wc.on('dom-ready', () => {
    if (loadTimer) {
      clearTimeout(loadTimer)
      loadTimer = null
    }
    if (cfTimer) clearTimeout(cfTimer)
    cfTimer = setTimeout(() => {
      if (tradeWindow && !tradeWindow.isDestroyed()) wc.executeJavaScript(cfBannerJs(url)).catch(() => {})
    }, 15000)
  })
  tradeWindow.on('closed', () => {
    clearTimers()
    tradeWindow = null
  })
  loadTimer = setTimeout(showError, 25000) // 25 sn içinde DOM gelmezse hata sayfası
  tradeWindow.loadURL(url)
}

let priceWindow: BrowserWindow | null = null

function createPriceWindow(): void {
  if (priceWindow) return
  const wa = screen.getPrimaryDisplay().workArea
  const w = 320
  const h = 460
  priceWindow = new BrowserWindow({
    x: wa.x + Math.round((wa.width - w) / 2),
    y: wa.y + 90,
    width: w,
    height: h,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  priceWindow.setAlwaysOnTop(true, 'screen-saver')
  priceWindow.setTitle('PoBe-Price')
  loadRenderer(priceWindow, 'price')
  priceWindow.on('closed', () => {
    priceWindow = null
  })
}
// ODAK KORUMASI AYRILDI (0.17.3): Adanmış kısayol (Ctrl+D/Ctrl+E) kullanıcı BİLEREK bastığı için
// HER ZAMAN panoyu okur + paneli gösterir — odak koruması GEREKTİRMEZ (oyunda da çalışır).
// Odak koruması SADECE oto-kopyalama (sentetik Ctrl+C gönderme) içindir: yalnız ön plan PoE2 iken
// oyuna tuş gönderilir. Pano-izleyici YOKTUR; Ctrl+C'ye tepki YOKTUR (tek tetikleyici global kısayol).
// PS: ön plan başlığını P/Invoke ile al; doCopy + başlık "Path of Exile" içeriyorsa SendKeys ^c.
function fgPrepScript(doCopy: boolean): string {
  // başlık eşleşmesi case-insensitive substring (-like '*Path of Exile*'); başlık her zaman yazdırılır.
  const maybeSend = doCopy
    ? `if ($t -like '*Path of Exile*') { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c'); Write-Output 'SENT' }`
    : ``
  return `
$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class PoBeFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$h = [PoBeFg]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[void][PoBeFg]::GetWindowText($h, $sb, 256)
$t = $sb.ToString()
Write-Output ("TITLE:" + $t)
${maybeSend}`
}
/**
 * Ön plan başlığını al; doCopy + PoE2 ön planda ise oyuna Ctrl+C gönderir.
 * Dönüş: { title, sent }. title = ön-pencere başlığı (log için); sent = Ctrl+C gönderildi mi.
 * Windows dışında { title:'', sent:false }. ÇÖKMEZ (hata → boş).
 */
function foregroundPrep(doCopy: boolean): Promise<{ title: string; sent: boolean }> {
  if (process.platform !== 'win32') return Promise.resolve({ title: '', sent: false })
  return new Promise((resolve) => {
    try {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', fgPrepScript(doCopy)],
        { windowsHide: true, timeout: 2500 },
        (_err, stdout) => {
          const out = (stdout || '').replace(/\r/g, '')
          const m = out.match(/TITLE:(.*)/)
          resolve({ title: m ? m[1].trim() : '', sent: /(^|\n)SENT/.test(out) })
        }
      )
    } catch {
      resolve({ title: '', sent: false })
    }
  })
}

// TEŞHİS LOG'U (0.17.3): her fiyat/tehlike kısayolu basışı userData/pobe-pricelog.txt'ye yazılır.
// Kullanıcı oyunda deneyip log'u yollayabilir (pano zinciri uçtan uca görünür). Sessiz; hata yutar.
function pricelog(line: string): void {
  try {
    const p = join(app.getPath('userData'), 'pobe-pricelog.txt')
    appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* log hatası işlevi bozmasın */
  }
}

// Kısayola basıldı (0.17.3): HER ZAMAN panoyu oku + paneli göster (kullanıcı bilerek bastı; odak koruması
// YOK). autoCopy AÇIK ise odak korumalı sentetik Ctrl+C (yalnız PoE2 ön planda) gönderilir, sonra bekle.
// Pano metni DÜZ STRING olarak gider (proxy/clone yok — webContents.send string serileştirir).
async function showPriceCheck(): Promise<void> {
  const fg = await foregroundPrep(appSettings.autoCopy)
  if (fg.sent) await sleep(160) // oyunun kopyaladığı eşya panoya yazılana kadar kısa bekle
  const text = clipboard.readText() || ''
  pricelog(
    `PRICE fg="${fg.title}" autoCopy=${appSettings.autoCopy} sentCopy=${fg.sent} clipLen=${text.length} clip80="${text.slice(0, 80).replace(/\n/g, '⏎')}"`
  )
  createPriceWindow()
  if (!priceWindow) return
  const send = (): void => priceWindow?.webContents.send('price:check', text)
  if (priceWindow.webContents.isLoading()) priceWindow.webContents.once('did-finish-load', send)
  else send()
  if (!priceWindow.isVisible()) priceWindow.showInactive()
  else priceWindow.webContents.send('price:check', text) // zaten açıksa hemen güncelle
}
// Kısayolu (yeniden) kaydet — ayar değişince çağrılır. Kayıt başarısızsa shortcutOk=false (UI uyarır).
function applyPriceShortcut(): void {
  if (registeredAccel) {
    try {
      globalShortcut.unregister(registeredAccel)
    } catch {
      // yoksay
    }
    registeredAccel = ''
  }
  priceShortcutOk = false
  if (!appSettings.priceCheck.enabled) {
    console.log('[price] kısayol kapalı (ayar)')
    return
  }
  // Defans: Ctrl+C asla bağlanmasın (sistem kopyalaması serbest). Yasaklıysa Ctrl+D'ye düş.
  const accel = sanitizeShortcut(appSettings.priceCheck.shortcut, 'CommandOrControl+D')
  appSettings.priceCheck.shortcut = accel
  try {
    const ok = globalShortcut.register(accel, () => void showPriceCheck())
    priceShortcutOk = ok
    if (ok) registeredAccel = accel
    console.log('[price] global kısayol:', accel, ok ? 'KAYITLI' : 'BAŞARISIZ (çakışma?)')
  } catch (e) {
    priceShortcutOk = false
    console.log('[price] kısayol kayıt hatası:', accel, (e as Error).message)
  }
}

// ============================================================================
// OYUN-İÇİ TEHLİKE OVERLAY'İ (Faz 8) — global kısayol → PANO oku → waystone tehlike kartı.
// Aynı ToS deseni: GİRDİ OTOMASYONU YOK, hafıza YOK; yalnız pano okuma. showInactive.
// ----------------------------------------------------------------------------
let dangerShortcutOk = false
let registeredDangerAccel = ''
let dangerWindow: BrowserWindow | null = null

function createDangerWindow(): void {
  if (dangerWindow) return
  const wa = screen.getPrimaryDisplay().workArea
  const w = 360
  const h = 480
  dangerWindow = new BrowserWindow({
    x: wa.x + Math.round((wa.width - w) / 2),
    y: wa.y + 90,
    width: w,
    height: h,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  dangerWindow.setAlwaysOnTop(true, 'screen-saver')
  dangerWindow.setTitle('PoBe-Danger')
  loadRenderer(dangerWindow, 'danger')
  dangerWindow.on('closed', () => {
    dangerWindow = null
  })
}
async function showDangerCheck(): Promise<void> {
  // 0.17.3: HER ZAMAN oku + göster (odak koruması yok); autoCopy yalnız PoE2 ön planda Ctrl+C gönderir.
  const fg = await foregroundPrep(appSettings.autoCopy)
  if (fg.sent) await sleep(160)
  const text = clipboard.readText() || ''
  pricelog(
    `DANGER fg="${fg.title}" autoCopy=${appSettings.autoCopy} sentCopy=${fg.sent} clipLen=${text.length} clip80="${text.slice(0, 80).replace(/\n/g, '⏎')}"`
  )
  createDangerWindow()
  if (!dangerWindow) return
  const send = (): void => dangerWindow?.webContents.send('danger:check', text)
  if (dangerWindow.webContents.isLoading()) dangerWindow.webContents.once('did-finish-load', send)
  else send()
  if (!dangerWindow.isVisible()) dangerWindow.showInactive()
  else dangerWindow.webContents.send('danger:check', text)
}
function applyDangerShortcut(): void {
  if (registeredDangerAccel) {
    try {
      globalShortcut.unregister(registeredDangerAccel)
    } catch {
      // yoksay
    }
    registeredDangerAccel = ''
  }
  dangerShortcutOk = false
  if (!appSettings.dangerCheck.enabled) {
    console.log('[danger] kısayol kapalı (ayar)')
    return
  }
  const accel = sanitizeShortcut(appSettings.dangerCheck.shortcut, 'CommandOrControl+E')
  appSettings.dangerCheck.shortcut = accel
  try {
    const ok = globalShortcut.register(accel, () => void showDangerCheck())
    dangerShortcutOk = ok
    if (ok) registeredDangerAccel = accel
    console.log('[danger] global kısayol:', accel, ok ? 'KAYITLI' : 'BAŞARISIZ (çakışma?)')
  } catch (e) {
    dangerShortcutOk = false
    console.log('[danger] kısayol kayıt hatası:', accel, (e as Error).message)
  }
}

// Uygulama ikonu: paketliyken .exe ikonu (electron-builder win.icon) görevi görür;
// dev/preview'da pencere/taskbar ikonu için build/icon.png'i kullan (yoksa undefined).
function appIconPath(): string | undefined {
  const p = join(__dirname, '../../build/icon.png')
  return existsSync(p) ? p : undefined
}

// Arayüz ölçeği (0.15.1): tüm UI'yi tek seferde ölçekler (webContents zoom). Ayar değişince/açılışta uygulanır.
let mainWin: BrowserWindow | null = null
function applyUiZoom(): void {
  try {
    mainWin?.webContents.setZoomFactor(appSettings.ui.zoom || 1)
  } catch {
    // yoksay
  }
}

// ============================================================================
// SİSTEM TEPSİSİ + TEMİZ ÇIKIŞ + PoE2 İZLEME (0.18.0)
// ----------------------------------------------------------------------------
let tray: Tray | null = null
let isQuitting = false // tepsiden "Çıkış" → gerçekten kapan (X yalnız tepsiye küçültür)
let poe2WatchTimer: ReturnType<typeof setInterval> | null = null
let poe2WasRunning = false

/** Ana pencereyi göster + öne getir (tepsiden/PoE2 açılınca). */
function showMainWindow(): void {
  if (!mainWin) {
    createWindow()
    return
  }
  if (mainWin.isMinimized()) mainWin.restore()
  if (!mainWin.isVisible()) mainWin.show()
  mainWin.focus()
}

/** Sistem tepsisi ikonu + sağ-tık menüsü (Göster/Gizle, Çıkış). */
function createTray(): void {
  if (tray) return
  let img = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 })
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('Path of Berkay')
  const rebuild = (): void => {
    const visible = !!mainWin && mainWin.isVisible()
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: visible ? 'Gizle' : 'Göster', click: () => (visible && mainWin ? mainWin.hide() : showMainWindow()) },
        { type: 'separator' },
        { label: 'Çıkış', click: () => quitApp() }
      ])
    )
  }
  rebuild()
  tray.on('click', () => (mainWin && mainWin.isVisible() ? mainWin.hide() : showMainWindow()))
  tray.on('right-click', rebuild)
  // pencere görünürlüğü değişince menü etiketini tazele
  if (mainWin) {
    mainWin.on('show', rebuild)
    mainWin.on('hide', rebuild)
  }
}

/** Tam çıkış: bayrağı kaldır, temizlik will-quit'te yapılır. */
function quitApp(): void {
  isQuitting = true
  app.quit()
}

/** Windows ile başlat (app.setLoginItemSettings). Yalnız paketlide anlamlı; dev'de no-op güvenli. */
function applyLoginItem(): void {
  if (process.platform !== 'win32') return
  try {
    app.setLoginItemSettings({ openAtLogin: appSettings.launchOnStartup, args: ['--hidden'] })
  } catch (e) {
    console.log('[startup] login item ayarlanamadı:', (e as Error).message)
  }
}

// PoE2 süreç izleme: PathOfExile.exe / PathOfExileSteam.exe çalışıyor mu (tasklist poll).
// Hafıza okuma/injection YOK — yalnız süreç adı listesi (ToS uyumlu). Başlama anında pencereyi göster.
function isPoe2Running(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    try {
      execFile(
        'tasklist',
        ['/fi', 'imagename eq PathOfExile*', '/nh'],
        { windowsHide: true, timeout: 4000 },
        (_err, stdout) => {
          const out = (stdout || '').toLowerCase()
          resolve(/pathofexile(steam)?\.exe/.test(out))
        }
      )
    } catch {
      resolve(false)
    }
  })
}
function applyPoe2Watch(): void {
  if (poe2WatchTimer) {
    clearInterval(poe2WatchTimer)
    poe2WatchTimer = null
  }
  if (!appSettings.poe2AutoShow || process.platform !== 'win32') return
  poe2WasRunning = false
  poe2WatchTimer = setInterval(async () => {
    const running = await isPoe2Running()
    if (running && !poe2WasRunning) {
      console.log('[poe2] başladı → PoBe penceresi gösteriliyor')
      showMainWindow()
    }
    poe2WasRunning = running
  }, 5000)
}

function createWindow(): void {
  // Ana uygulama penceresi. Frameless: turuncu Electron cubugu yerine
  // renderer icindeki kendi koyu baslik barimizi kullaniriz.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    resizable: true,
    maximizable: true,
    backgroundColor: '#0d0d0d',
    autoHideMenuBar: true,
    title: 'Path of Berkay',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Güvenlik sıkılaştırma (0.17.0): preload yalnız contextBridge+ipcRenderer kullanır → sandbox uyumlu.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWin = mainWindow

  // Renderer'daki ozel baslik bari dugmeleri icin pencere kontrolleri.
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:close', () => mainWindow.close())
  // 0.18.0: X → closeToTray ise gerçekten kapatma, tepsiye küçült. Çıkış yalnız tepsi menüsünden.
  mainWindow.on('close', (e) => {
    if (!isQuitting && appSettings.closeToTray && tray) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
  ipcMain.on('window:toggle-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized())
  // Maximize/restore durumunu renderer'a bildir (ikon değişimi için)
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximize-state', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximize-state', false))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    applyUiZoom() // kaydedilen arayüz ölçeğini uygula (kalıcı)
  })
  // Zoom faktörü sayfa yüklenince sıfırlanabilir → her yüklemede yeniden uygula.
  mainWindow.webContents.on('did-finish-load', () => applyUiZoom())

  // Ana pencere kapanınca overlay de kapansın (arkada açık kalmasın -> tüm
  // pencereler kapanır -> window-all-closed -> uygulama tamamen çıkar).
  mainWindow.on('closed', () => {
    mainWin = null
    closeOverlay()
  })

  // Dış bağlantıları varsayılan tarayıcıda aç (pencere içinde ASLA değil) — yalnız beyaz listedekiler.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isAllowedExternalUrl(details.url)) shell.openExternal(details.url)
    else console.log('[security] dış bağlantı reddedildi:', details.url)
    return { action: 'deny' }
  })
  // Sayfa-içi gezinmeyi (renderer'ın dışarı navigasyonu) engelle — uygulama yalnız kendi dosyasını yükler.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const ok = is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])
    if (!ok && !url.startsWith('file://')) {
      e.preventDefault()
      if (isAllowedExternalUrl(url)) shell.openExternal(url)
    }
  })

  // Geliştirme modunda Vite dev sunucusunu, üretimde paketlenmiş dosyayı yükle.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 0.18.0: TEK ÖRNEK kilidi — ikinci başlatma mevcut pencereyi öne getirir, çift süreç olmaz.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()
app.on('second-instance', () => showMainWindow())

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return // ikinci örnek → çık (yukarıda app.quit çağrıldı)
  electronApp.setAppUserModelId('com.pathofberkay.pobe')
  // 0.17.8: TÜM webContents'in varsayılan UA'sı = gerçek Chromium UA (Electron/app token YOK) → tutarlı,
  // Cloudflare'a "gerçek tarayıcı" gibi görünür. Trade penceresi de aynı UA'yı kullanır.
  app.userAgentFallback = TRADE_UA
  console.log('[trade] UA:', TRADE_UA, '| contains Electron:', /electron/i.test(TRADE_UA))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  loadLevelingState()
  loadSettings()
  loadBuild()
  loadCraft()
  registerLevelingIpc()
  registerPriceIpc()
  createWindow()
  createTray() // 0.18.0 sistem tepsisi (Göster/Gizle, Çıkış)
  applyLoginItem() // Windows ile başlat ayarı
  applyPoe2Watch() // PoE2 açılınca pencereyi göster (ayar açıksa)
  startWatcher()
  applyOverlayMode()
  applyPriceShortcut()
  applyDangerShortcut()
  initUpdater() // açılışta sessiz güncelleme kontrolü (ADIM C; dev/portable → devre dışı)
  // --hidden ile başladıysa (Windows ile başlat) pencereyi gösterme; tepside bekle.
  if (process.argv.includes('--hidden') && mainWin) mainWin.hide()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true // 'close' engelini kaldır → pencere gerçekten kapanır
})
app.on('will-quit', () => {
  // 0.18.0: tam temizlik — zombie süreç kalmasın (watcher + overlay + kısayol + tepsi + poll timer).
  stopWatcher()
  closeOverlay()
  globalShortcut.unregisterAll()
  if (poe2WatchTimer) {
    clearInterval(poe2WatchTimer)
    poe2WatchTimer = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
})

app.on('window-all-closed', () => {
  // closeToTray + tepsi varken pencere gizlenir (kapanmaz) → buraya düşmez, tepside çalışmaya devam.
  if (process.platform !== 'darwin') app.quit()
})
