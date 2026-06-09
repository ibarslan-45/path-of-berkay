/*
 * scrape-uniques.cjs
 * ----------------------------------------------------------------------------
 * poe2db.tw'den tüm unique'lerin SABİT MOD listesini ve FLAVOUR text'ini çeker;
 * scripts/uniques-scrape-cache.json'a HER unique sonrası kaydeder (resumable:
 * yarıda kesilirse kaldığı yerden devam eder). Çevirme YOK — yalnızca ham EN.
 *
 * Çalıştırma:  node scripts/scrape-uniques.cjs
 *
 * Saygılı kullanım: robots.txt 'Allow: /'. İstekler arası gecikme + 503'te
 * exponential backoff. Zaten başarıyla çekilmiş kayıtlar tekrar istenmez.
 */
const fs = require('fs')
const path = require('path')

const UA =
  'poe2-overlay-bilingual/0.1 (personal study tool; contact ibrahimberkayarslan98@gmail.com)'
const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'src', 'data', 'uniques.json')
const CACHE = path.join(__dirname, 'uniques-scrape-cache.json')

const BASE_DELAY = 2000 // istekler arası temel gecikme (ms)
const MAX_RETRY = 4

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function slug(name) {
  return name.replace(/[’']/g, '').replace(/\s+/g, '_')
}

// İlk <div class="...UniquePopup..."> bloğunu div-derinliği eşleştirmesiyle izole et.
function firstUniquePopup(html) {
  const start = html.search(/<div[^>]*class="[^"]*UniquePopup[^"]*"/)
  if (start < 0) return null
  const re = /<div\b|<\/div>/g
  re.lastIndex = start
  let depth = 0,
    m,
    end = -1
  while ((m = re.exec(html))) {
    if (m[0] === '</div>') {
      depth--
      if (depth === 0) {
        end = m.index + 6
        break
      }
    } else depth++
  }
  return end < 0 ? html.slice(start) : html.slice(start, end)
}

const stripTags = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')

function normMod(s) {
  return stripTags(s)
    .replace(/\n/g, ' ')
    .replace(/\s*—\s*/g, '-') // em-dash aralık -> tire
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+%/g, '%')
    .replace(/\s+/g, ' ')
    .trim()
}
function normFlavour(s) {
  return stripTags(s)
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function parse(html) {
  const box = firstUniquePopup(html)
  if (!box) return { ok: false, reason: 'no-popup', mods: [], flavour: '' }
  const mods = [...box.matchAll(/<div class="explicitMod">([\s\S]*?)<\/div>/g)]
    .map((m) => normMod(m[1]))
    .filter(Boolean)
  const fm = box.match(/<div class="FlavourText">([\s\S]*?)<\/div>/)
  const flavour = fm ? normFlavour(fm[1]) : ''
  return { ok: true, mods, flavour }
}

async function fetchHtml(url) {
  for (let a = 0; a <= MAX_RETRY; a++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      if (res.status === 200) return { status: 200, html: await res.text() }
      if (res.status === 404) return { status: 404, html: '' }
      // 503/429 vb. -> backoff
      await sleep(4000 * Math.pow(2, a))
    } catch {
      await sleep(4000 * Math.pow(2, a))
    }
  }
  return { status: 0, html: '' }
}

async function main() {
  const uniques = JSON.parse(fs.readFileSync(DATA, 'utf-8'))
  let cache = {}
  if (fs.existsSync(CACHE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE, 'utf-8'))
    } catch {
      cache = {}
    }
  }

  const todo = uniques.filter((u) => {
    const c = cache[u.id]
    return !c || c.status !== 'ok'
  })
  console.log(
    `Toplam ${uniques.length} unique; önbellekte ${uniques.length - todo.length} hazır; çekilecek ${todo.length}.`
  )

  let done = 0
  for (const u of todo) {
    const url = 'https://poe2db.tw/us/' + slug(u.en)
    const { status, html } = await fetchHtml(url)
    if (status === 200) {
      const r = parse(html)
      cache[u.id] = {
        en: u.en,
        slug: slug(u.en),
        status: r.ok ? 'ok' : 'no-popup',
        mods: r.mods,
        flavour: r.flavour
      }
    } else {
      cache[u.id] = {
        en: u.en,
        slug: slug(u.en),
        status: status === 404 ? 'http-404' : 'http-fail',
        mods: [],
        flavour: ''
      }
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n', 'utf-8')
    done++
    const c = cache[u.id]
    if (done % 10 === 0 || c.status !== 'ok') {
      console.log(
        `[${done}/${todo.length}] ${u.en} -> ${c.status} (mods:${c.mods.length}, flavour:${c.flavour ? 'var' : 'yok'})`
      )
    }
    await sleep(BASE_DELAY)
  }

  // Özet
  const all = Object.values(cache)
  const ok = all.filter((c) => c.status === 'ok').length
  const noPopup = all.filter((c) => c.status === 'no-popup').length
  const h404 = all.filter((c) => c.status === 'http-404').length
  const hFail = all.filter((c) => c.status === 'http-fail').length
  const okNoMods = all.filter((c) => c.status === 'ok' && c.mods.length === 0).length
  const okNoFlav = all.filter((c) => c.status === 'ok' && !c.flavour).length
  console.log('\n=== SCRAPE ÖZET ===')
  console.log(`  ok: ${ok}, no-popup: ${noPopup}, http-404: ${h404}, http-fail: ${hFail}`)
  console.log(`  ok ama mod yok: ${okNoMods}, ok ama flavour yok: ${okNoFlav}`)
  const fails = all.filter((c) => c.status !== 'ok')
  if (fails.length) {
    console.log('  BAŞARISIZ olanlar:')
    fails.forEach((c) => console.log(`    ${c.en} (${c.slug}) -> ${c.status}`))
  }
  console.log(`\nÖnbellek: ${CACHE}`)
}

main().catch((e) => {
  console.error('Hata:', e)
  process.exit(1)
})
