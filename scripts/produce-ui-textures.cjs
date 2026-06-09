/**
 * produce-ui-textures.cjs
 * ----------------------------------------------------------------------------
 * GERÇEK PoE2 UI texture'larını (extracted .../uiimages/common, 4k öncelikli)
 * texconv ile PNG'ye çevirir (alfa korunur) ve 9-slice / 3-slice composite'lere
 * birleştirip src/renderer/assets/ui/ altına yazar. Slice değerlerini
 * ui-slices.json manifest'ine döker (CSS border-image bunları kullanır).
 *
 * Çalıştırma:  node scripts/produce-ui-textures.cjs
 * Idempotent: her seferinde yeniden üretir (gerçek dokular kanonik kaynak).
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { PNG } = require('pngjs')

const ROOT = path.join(__dirname, '..')
const EX = 'C:/Users/panar/Desktop/poe2-tools/extracted'
const TEXCONV = 'C:/Users/panar/Desktop/poe2-tools/texconv.exe'
const COMMON = '2d/2dart/uiimages/common'
const OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'ui')
const WORK = path.join(ROOT, '.uiwork')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(WORK, { recursive: true })

// 4k ÖNCELİKLİ kaynak indeksi: basename(lower) -> fullpath
function indexCommon() {
  const map = new Map()
  for (const sub of [COMMON + '/4k', COMMON]) {
    const dir = path.join(EX, sub)
    let ents
    try { ents = fs.readdirSync(dir) } catch (e) { continue }
    for (const f of ents) {
      if (!f.toLowerCase().endsWith('.dds')) continue
      const k = f.toLowerCase().replace(/\.dds$/, '')
      if (!map.has(k)) map.set(k, path.join(dir, f)) // 4k önce -> korunur
    }
  }
  return map
}
const SRC = indexCommon()

// dds -> PNG (work dir), pngjs ile yükle {w,h,data(RGBA)}
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const dds = SRC.get(name.toLowerCase())
  if (!dds) throw new Error('kaynak yok: ' + name)
  const png = path.join(WORK, name + '.png')
  execFileSync(TEXCONV, ['-ft', 'png', '-o', WORK, '-y', '-nologo', dds], { stdio: 'ignore' })
  // texconv çıktıyı dds basename ile yazar; gerekirse yeniden adlandır
  const produced = path.join(WORK, path.basename(dds).replace(/\.dds$/i, '.png'))
  if (produced !== png) fs.renameSync(produced, png)
  const img = PNG.sync.read(fs.readFileSync(png))
  const o = { w: img.width, h: img.height, data: img.data }
  cache.set(name, o)
  return o
}

function canvas(w, h) { return { w, h, data: Buffer.alloc(w * h * 4, 0) } }
function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y
    if (ty < 0 || ty >= dst.h) continue
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x
      if (tx < 0 || tx >= dst.w) continue
      const si = (y * src.w + x) * 4
      const di = (ty * dst.w + tx) * 4
      const a = src.data[si + 3]
      if (a === 0) continue // şeffaf -> atla (üst-üste binme yok)
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = a
    }
  }
}
function save(cv, name) {
  const png = new PNG({ width: cv.w, height: cv.h })
  cv.data.copy(png.data)
  fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png))
  return { name, w: cv.w, h: cv.h }
}
function copyRaw(srcName, outName) {
  const im = load(srcName)
  return save(im, outName)
}

const manifest = {}

// --- 9-slice çerçeve: 8 yönlü parça -> köşeler köşeye, kenarlar dış-hizalı bant ---
// pfx: 'ornate' | 'border3' | 'selectionborder' ; out: dosya adı
function frame9(pfx, out) {
  const tl = load(pfx + 'topleft'), tr = load(pfx + 'topright')
  const bl = load(pfx + 'bottomleft'), br = load(pfx + 'bottomright')
  const tp = load(pfx + 'top'), bt = load(pfx + 'bottom')
  const lf = load(pfx + 'left'), rt = load(pfx + 'right')
  const leftW = Math.max(tl.w, bl.w, lf.w)
  const rightW = Math.max(tr.w, br.w, rt.w)
  const topH = Math.max(tl.h, tr.h, tp.h)
  const botH = Math.max(bl.h, br.h, bt.h)
  const midW = tp.w        // üst/alt kenar tile genişliği (tek tile, CSS repeat eder)
  const midH = lf.h        // sol/sağ kenar tile yüksekliği
  const W = leftW + midW + rightW
  const H = topH + midH + botH
  const cv = canvas(W, H)
  // köşeler (dış köşelere hizalı)
  blit(cv, tl, 0, 0)
  blit(cv, tr, W - tr.w, 0)
  blit(cv, bl, 0, H - bl.h)
  blit(cv, br, W - br.w, H - br.h)
  // kenarlar (dış kenara hizalı, orta banda yerleştir)
  blit(cv, tp, leftW, 0)                 // üst: y=0
  blit(cv, bt, leftW, H - bt.h)          // alt: y=H-h
  blit(cv, lf, 0, topH)                  // sol: x=0
  blit(cv, rt, W - rt.w, topH)           // sağ: x=W-w
  const r = save(cv, out)
  // border-image-slice: top right bottom left (kaynak px)
  manifest[out] = { ...r, slice: { top: topH, right: rightW, bottom: botH, left: leftW }, repeat: 'repeat' }
}

// RGB'yi factor ile carp (alfa korunur) — acik texture'i koyulastirmak icin
function darken(cv, factor) {
  for (let i = 0; i < cv.data.length; i += 4) {
    cv.data[i] = Math.round(cv.data[i] * factor)
    cv.data[i + 1] = Math.round(cv.data[i + 1] * factor)
    cv.data[i + 2] = Math.round(cv.data[i + 2] * factor)
  }
}

// --- Yatay 3-slice bar: left + middle(tile) + right ---
// names: [left, middle, right] ; out ; darkenF: opsiyonel parlaklik carpani
function bar3(names, out, darkenF) {
  const l = load(names[0]), m = load(names[1]), r = load(names[2])
  const H = Math.max(l.h, m.h, r.h)
  const W = l.w + m.w + r.w
  const cv = canvas(W, H)
  blit(cv, l, 0, 0)
  blit(cv, m, l.w, 0)
  blit(cv, r, l.w + m.w, 0)
  if (darkenF) darken(cv, darkenF)
  const res = save(cv, out)
  manifest[out] = { ...res, slice: { top: 0, right: r.w, bottom: 0, left: l.w }, fill: true, repeat: 'repeat' }
}

// --- Dikey 3-slice (scrollbar thumb): top + middle(tile) + bottom ---
function vbar3(names, out) {
  const t = load(names[0]), m = load(names[1]), b = load(names[2])
  const W = Math.max(t.w, m.w, b.w)
  const H = t.h + m.h + b.h
  const cv = canvas(W, H)
  blit(cv, t, 0, 0)
  blit(cv, m, 0, t.h)
  blit(cv, b, 0, t.h + m.h)
  const res = save(cv, out)
  manifest[out] = { ...res, slice: { top: t.h, right: 0, bottom: b.h, left: 0 }, fill: true, repeat: 'repeat' }
}

console.log('Çerçeveler (9-slice)...')
frame9('ornate', 'frame-ornate.png')
frame9('border3', 'frame-border3.png')
frame9('selectionborder', 'frame-selection.png')
frame9('innerborder', 'frame-inner.png')

console.log('Barlar (yatay 3-slice)...')
bar3(['windowtitlebarleft', 'windowtitlebarmiddle', 'windowtitlebarright'], 'bar-titlebar.png')
// Pasif sekme: acik tablabel texture'i KOYU tas zemine indir (refs: koyu + acik yazi)
bar3(['tablabelleft', 'tablabelmiddle', 'tablabelright'], 'tab-normal.png', 0.34)
// Aktif sekme: vurgulu ama yine de yaziyi okutacak kadar koyulastir
bar3(['publictabhighlightselectedleft', 'publictabhighlightselectedmiddle', 'publictabhighlightselectedright'], 'tab-active.png', 0.6)
bar3(['buttongenericnormalleft', 'buttongenericnormalmiddle', 'buttongenericnormalright'], 'btn-normal.png')
bar3(['buttongenerichoverleft', 'buttongenerichovermiddle', 'buttongenerichoverright'], 'btn-hover.png')
bar3(['buttongenericpressedleft', 'buttongenericpressedmiddle', 'buttongenericpressedright'], 'btn-pressed.png')

console.log('Scrollbar...')
vbar3(['scrollbarthumbtop', 'scrollbarthumbmiddle', 'scrollbarthumbbottom'], 'sb-thumb.png')
manifest['sb-track.png'] = copyRaw('scrollbartrack', 'sb-track.png')
manifest['sb-up.png'] = copyRaw('scrollbarup', 'sb-up.png')
manifest['sb-down.png'] = copyRaw('scrollbardown', 'sb-down.png')

console.log('Ayraç + yüzeyler...')
manifest['divider-line.png'] = copyRaw('categoryline', 'divider-line.png')
manifest['divider-diamond.png'] = copyRaw('icondiamondsmall', 'divider-diamond.png')
manifest['panel-filler.png'] = copyRaw('panelfiller', 'panel-filler.png')
manifest['bg-tile.png'] = copyRaw('background2', 'bg-tile.png')

fs.writeFileSync(path.join(OUT, 'ui-slices.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('\nTAMAM. Üretilen dosyalar -> src/renderer/assets/ui/')
for (const [k, v] of Object.entries(manifest)) {
  const s = v.slice ? `  slice ${v.slice.top} ${v.slice.right} ${v.slice.bottom} ${v.slice.left}${v.fill ? ' fill' : ''}` : ''
  console.log('  ' + k.padEnd(22) + ` ${v.w}x${v.h}` + s)
}
