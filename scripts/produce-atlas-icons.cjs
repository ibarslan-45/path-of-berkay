/**
 * produce-atlas-icons.cjs
 * ----------------------------------------------------------------------------
 * atlas.json'daki atlas_node ikonlarını üretir -> assets/atlas/.
 * Kaynak: extracted SkillIcons/passives/.../AtlasTrees (texconv), yoksa RePoE PNG.
 * Tekrar çalıştırılabilir (idempotent). Waystone/tablet/pinnacle ikonları
 * build-atlas.ts tarafından RePoE'den indirilir; bu script SADECE node ikonları.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'atlas')
const EX = 'C:/Users/panar/Desktop/poe2-tools/extracted'
const TEXCONV = 'C:/Users/panar/Desktop/poe2-tools/texconv.exe'
const REPOE_ICON = 'https://repoe-fork.github.io/poe2/Art/2DArt/SkillIcons/passives/'
const atlas = require(path.join(ROOT, 'src', 'data', 'atlas.json'))

// extracted skillicons ağacı: basename(lower) -> fullpath (4k olmayan önce)
function indexExtracted() {
  const map = new Map()
  const candidates = [
    path.join(EX, 'skillicons/passives'),
    path.join(EX, '2d/2dart/skillicons/passives'),
    path.join(EX, 'art/2dart/skillicons/passives'),
    path.join(EX, 'skillicons'),
    path.join(EX, 'art/2dart/skillicons')
  ]
  const all = []
  function walk(d) {
    let ents
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
    for (const x of ents) {
      const p = path.join(d, x.name)
      if (x.isDirectory()) walk(p)
      else if (x.name.toLowerCase().endsWith('.dds')) all.push(p)
    }
  }
  for (const c of candidates) walk(c)
  const nonHi = all.filter((p) => !/[\\/]4k[\\/]/i.test(p))
  const hi = all.filter((p) => /[\\/]4k[\\/]/i.test(p))
  for (const p of [...nonHi, ...hi]) {
    const k = path.basename(p).toLowerCase().replace(/\.dds$/, '')
    if (!map.has(k)) map.set(k, p)
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

async function downloadPng(base, destName) {
  fs.mkdirSync(OUT, { recursive: true })
  const dest = path.join(OUT, destName)
  if (fs.existsSync(dest)) return true
  try {
    const r = await fetch(REPOE_ICON + base + '.png')
    if (!r.ok) return false
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
    return true
  } catch (e) { return false }
}

async function main() {
  const bases = new Set()
  for (const r of atlas) {
    if (r.subtype !== 'atlas_node' || !r.icon) continue
    bases.add(r.icon.split('/').pop().replace(/\.png$/i, ''))
  }
  // ağaç node'larının ikonları da (root/jewel/icon-only — atlas.json'da kaydı olmayanlar dahil)
  const treePath = path.join(ROOT, 'src', 'data', 'atlas-tree.json')
  if (fs.existsSync(treePath)) {
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'))
    for (const n of tree.nodes) { const b = n[4]; if (b) bases.add(b) } // [hash,x,y,type,iconBase,pid]
  }
  const exIdx = indexExtracted()
  console.log('benzersiz atlas node ikonu:', bases.size, '| extracted skillicons bulundu:', exIdx.size)

  let fromExtract = 0, fromRepoe = 0
  const miss = []
  for (const base of bases) {
    const dest = path.join(OUT, base + '.png')
    if (fs.existsSync(dest)) continue
    const src = exIdx.get(base.toLowerCase())
    if (src && texconvTo(src, base + '.png')) { fromExtract++; continue }
    if (await downloadPng(base, base + '.png')) { fromRepoe++; continue }
    miss.push(base)
  }
  const have = bases.size - miss.length
  console.log('üretilen/var:', have, '/', bases.size, '(extracted:', fromExtract, ', RePoE:', fromRepoe, ')')
  console.log('EKSİK ikon:', miss.length, miss.length ? '-> ' + miss.slice(0, 12).join(', ') : '')
}

main().catch((e) => { console.error('HATA:', e); process.exit(1) })
