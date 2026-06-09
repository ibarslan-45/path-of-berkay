/**
 * build-trade-stats.ts
 * ----------------------------------------------------------------------------
 * Trade fiyat-kontrol özelliği için stat-id eşleme tablosu üretir
 *   -> src/data/trade_stats.json
 *
 * KAYNAK = RESMÎ trade2 veri ucu:  https://www.pathofexile.com/api/trade2/data/stats
 *   Bu, GGG'nin trade2 arama formundaki TÜM stat-id'lerinin gerçek-kaynağıdır
 *   (Exiled Exchange 2 yalnız REFERANS — kopya değil; biz doğrudan resmî uçtan çekeriz).
 *   Dönüş: { result: [ { id, label, entries: [ { id:"explicit.stat_xxx", text:"# to maximum Life", type } ] } ] }
 *
 * Her kayıt:  { id, text (EN '#' kalıbı), tr, type }  — eşleştirme anahtarı EN.
 * TR, mevcut src/data/mods.json kalıplarından join edilir (motor tekrar çalışmaz);
 *   eşleşmeyenler tr:'' kalır (pseudo/implicit vb. — DÜRÜST, uydurma yok).
 *
 * NOT (Cloudflare): pathofexile.com Cloudflare arkasındadır. Düz node fetch
 *   tarayıcı User-Agent'ı ile çoğu zaman geçer; geçmezse script bunu AÇIKÇA
 *   raporlar (HTTP 403) — uygulama içi çekim main-process net.fetch ile yapılır.
 *
 * Çalıştırma:  npm run build:trade-stats
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const STATS_URL = 'https://www.pathofexile.com/api/trade2/data/stats'
const GAME_VERSION = '0.5.0'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const dataDir = join(projectRoot, 'src', 'data')

interface RawStatEntry {
  id: string
  text: string
  type?: string
  option?: unknown // bazı stat'lar seçenekli (option.options) — şimdilik düz metin
}
interface RawStatGroup {
  id: string
  label: string
  entries: RawStatEntry[]
}
interface TradeStat {
  id: string // ör. "explicit.stat_3299347043"
  text: string // EN '#' kalıbı (trade metni)
  tr: string // bizim TR (eşleşmezse '')
  type: string // explicit | implicit | pseudo | fractured | rune | enchant | ...
}

/** Eşleştirme anahtarı: küçük harf, '+' işaretlerini at, boşlukları sadeleştir, sondaki '.' at. */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*$/, '')
    .trim()
}

async function main(): Promise<void> {
  console.log('Resmî trade2 stat verisi indiriliyor…')
  let raw: { result: RawStatGroup[] }
  try {
    const res = await fetch(STATS_URL, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    })
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} — Cloudflare engellemiş olabilir. ` +
          'Çözüm: tarayıcıda ' + STATS_URL + ' aç, JSON\'u scripts/.cache/trade2-stats.json olarak kaydet ' +
          've script\'i tekrar çalıştır (aşağıdaki yerel-dosya yedeği devreye girer).'
      )
    }
    raw = (await res.json()) as { result: RawStatGroup[] }
  } catch (e) {
    // Yerel yedek (kullanıcı tarayıcıdan kaydettiyse)
    const cachePath = join(__dirname, '.cache', 'trade2-stats.json')
    try {
      raw = JSON.parse(readFileSync(cachePath, 'utf-8')) as { result: RawStatGroup[] }
      console.log('Ağ başarısız; yerel yedek kullanıldı:', cachePath)
    } catch {
      throw e instanceof Error ? e : new Error(String(e))
    }
  }

  // mods.json EN kalıbı -> TR sözlüğü (build-mods-sim ile aynı yöntem)
  const displayMods = JSON.parse(readFileSync(join(dataDir, 'mods.json'), 'utf-8')) as Array<{
    en: string
    tr: string
  }>
  const trByKey = new Map<string, string>()
  for (const m of displayMods) if (m.en && m.tr) trByKey.set(normKey(m.en), m.tr)

  const stats: TradeStat[] = []
  let trHits = 0
  const byType: Record<string, number> = {}
  for (const grp of raw.result ?? []) {
    for (const e of grp.entries ?? []) {
      if (!e.id || !e.text) continue
      const type = e.type ?? grp.id ?? ''
      byType[type] = (byType[type] ?? 0) + 1
      const tr = trByKey.get(normKey(e.text)) ?? ''
      if (tr) trHits++
      stats.push({ id: e.id, text: e.text, tr, type })
    }
  }

  const out = {
    meta: {
      game_version: GAME_VERSION,
      source: 'pathofexile-trade2-data-stats',
      generated: new Date().toISOString().slice(0, 10),
      note: 'Trade2 stat-id eşleme tablosu. Eşleştirme anahtarı EN metin; tr boşsa eşleşmedi (dürüst).'
    },
    stats
  }
  mkdirSync(dataDir, { recursive: true })
  const outPath = join(dataDir, 'trade_stats.json')
  writeFileSync(outPath, JSON.stringify(out) + '\n', 'utf-8')

  const sizeKB = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)
  console.log('')
  console.log(`Yazıldı -> ${outPath}  (${sizeKB} KB)`)
  console.log(`  toplam stat: ${stats.length}`)
  console.log(`  iki dilli eşleşen (tr dolu): ${trHits}/${stats.length}  (boş: ${stats.length - trHits})`)
  console.log('  tür dağılımı:', byType)
}

main().catch((err) => {
  console.error('Hata:', err.message ?? err)
  process.exit(1)
})
