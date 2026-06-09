// FINAL doğrulama: tüm src/data/*.json için 9-kelime karışık taraması + needs-translation.
// 9 kelime (görev spesifikasyonu): your, while, not, that, per, when, if, with, of
const fs = require('fs')
const path = require('path')
const dataDir = path.join(__dirname, '..', '..', 'src', 'data')
const L = 'A-Za-zÀ-ÿçğışöüÇĞİŞÖÜ'
const WORDS = ['your', 'while', 'not', 'that', 'per', 'when', 'if', 'with', 'of']
// Türkçe gloss/loanword/özel-ad bağlamını ELE: tek başına geçen İngilizce dilbilgisi
// kelimesini ararız; "Not:" (Türkçe), parantez içi gloss ve özel adları yanlış-pozitif sayarız.
function rawFlag(s) {
  for (const w of WORDS) {
    const re = new RegExp('(^|[^' + L + '])(' + w + ')([^' + L + ']|$)', 'i')
    if (re.test(s)) return w
  }
  return null
}
// Yanlış-pozitif eleme: kelimeyi sar ve bağlamına bak
function genuine(s) {
  for (const w of WORDS) {
    const re = new RegExp('(^|[^' + L + '])(' + w + ')([^' + L + ']|$)', 'gi')
    let m
    while ((m = re.exec(s))) {
      const idx = m.index + m[1].length
      // Türkçe "Not:" / "Not " başı -> büyük N ile ve : veya cümle başı
      const matched = s.slice(idx, idx + m[2].length)
      if (w === 'not' && /^Not$/.test(matched)) continue // Türkçe "Not:"
      // parantez içi gloss: ( ... of/with ... ) -> İngilizce özel ad bloğu
      const before = s.slice(0, idx)
      const after = s.slice(idx)
      const openP = before.lastIndexOf('(')
      const closeP = before.lastIndexOf(')')
      const inParen = openP > closeP && after.indexOf(')') !== -1
      if (inParen) continue
      // 'of/with/that' büyük harfli özel ad zinciri: önceki ve sonraki kelime Büyük harfle başlıyorsa özel ad
      const prevWord = (before.match(/([A-Za-zÀ-ÿ']+)\s*$/) || [, ''])[1]
      const nextWord = (after.slice(matched.length).match(/^\s*([A-Za-zÀ-ÿ']+)/) || [, ''])[1]
      const propChain = /^[A-Z]/.test(prevWord) && /^[A-Z]/.test(nextWord)
      if (propChain) continue
      return w // gerçek karışık
    }
  }
  return null
}
const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'))
const rows = []
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'))
  const recs = d.records || d
  if (!Array.isArray(recs)) continue
  let raw = 0, gen = 0, needs = 0
  const genSamples = []
  function walk(o) {
    if (!o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o)) {
      if (k === 'tr_status' && v === 'needs-translation') needs++
      const isTr = k === 'tr' || k.endsWith('_tr')
      const vals = Array.isArray(v) ? v : [v]
      if (isTr) for (const tv of vals) {
        if (typeof tv === 'string' && tv) {
          if (rawFlag(tv)) raw++
          const g = genuine(tv)
          if (g) { gen++; if (genSamples.length < 4) genSamples.push('[' + g + '] ' + tv.slice(0, 90)) }
        }
      }
      for (const x of vals) if (x && typeof x === 'object') walk(x)
    }
  }
  for (const r of recs) walk(r)
  rows.push({ f, n: recs.length, raw, gen, needs, genSamples })
}
console.log('dosya'.padEnd(20), 'kayıt'.padStart(6), '9kelime-ham'.padStart(12), 'gerçek-karışık'.padStart(15), 'needs-tr'.padStart(9))
let tg = 0, tn = 0
for (const r of rows) {
  console.log(r.f.padEnd(20), String(r.n).padStart(6), String(r.raw).padStart(12), String(r.gen).padStart(15), String(r.needs).padStart(9))
  tg += r.gen; tn += r.needs
}
console.log('-'.repeat(66))
console.log('TOPLAM gerçek-karışık:', tg, '| TOPLAM needs-translation:', tn)
console.log('\n--- gerçek-karışık örnekler (varsa) ---')
for (const r of rows) if (r.gen) { console.log('##', r.f); r.genSamples.forEach((s) => console.log('  ', s)) }
