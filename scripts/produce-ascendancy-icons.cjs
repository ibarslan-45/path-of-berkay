/**
 * produce-ascendancy-icons.cjs
 * ----------------------------------------------------------------------------
 * ascendancies.json'daki icon adlarını (assets/ascendancies/<base>.png) okur,
 * kaynak emblem .dds'i extracted oyun dosyalarında bulur (common/, common/4k
 * yedek), texconv ile PNG'ye çevirir. Tekrar çalıştırılabilir (idempotent).
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'ascendancies')
const EX = 'C:/Users/panar/Desktop/poe2-tools/extracted'
const TEXCONV = 'C:/Users/panar/Desktop/poe2-tools/texconv.exe'
const asc = require(path.join(ROOT, 'src', 'data', 'ascendancies.json'))

// extracted common/ ve common/4k içindeki dds: basename(lower) -> fullpath
function indexCommon() {
  const map = new Map()
  for (const sub of ['2d/2dart/uiimages/common', '2d/2dart/uiimages/common/4k']) {
    const dir = path.join(EX, sub)
    let ents
    try { ents = fs.readdirSync(dir) } catch (e) { continue }
    for (const f of ents) {
      if (!f.toLowerCase().endsWith('.dds')) continue
      const k = f.toLowerCase().replace(/\.dds$/, '')
      if (!map.has(k)) map.set(k, path.join(dir, f)) // non-4k önce gelir, korunur
    }
  }
  return map
}

function texconvTo(srcDds, destName) {
  fs.mkdirSync(OUT, { recursive: true })
  const dest = path.join(OUT, destName)
  if (fs.existsSync(dest)) return true
  const tmp = path.join(OUT, path.basename(srcDds).replace(/\.dds$/i, '.png'))
  try { execFileSync(TEXCONV, ['-ft', 'png', '-o', OUT, '-y', '-nologo', srcDds], { stdio: 'ignore' }) }
  catch (e) { return false }
  if (tmp !== dest && fs.existsSync(tmp)) fs.renameSync(tmp, dest)
  return fs.existsSync(dest)
}

const idx = indexCommon()
let ok = 0, miss = []
for (const r of asc) {
  if (!r.icon) continue
  const base = r.icon.split('/').pop().replace(/\.png$/i, '')
  const src = idx.get(base.toLowerCase())
  if (!src) { miss.push(r.en + ' (' + base + ')'); continue }
  if (texconvTo(src, base + '.png')) ok++
  else miss.push(r.en + ' (texconv başarısız: ' + base + ')')
}
console.log('Ascendancy/sınıf ikonu PNG:', ok, '/', asc.length)
if (miss.length) console.log('  eşleşmeyen (' + miss.length + '):\n   ' + miss.join('\n   '))
else console.log('  tüm ikonlar eşleşti.')
