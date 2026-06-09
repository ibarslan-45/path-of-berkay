/**
 * produce-passive-icons.cjs
 * ----------------------------------------------------------------------------
 * passives.json'daki benzersiz node ikonlarını üretir -> assets/passives/.
 * Öncelik: (1) extracted oyun dosyası SkillIcons/passives/<base>.dds (texconv),
 *          (2) RePoE Art/2DArt/SkillIcons/passives/<base>.png (yalnız bir kısmı var).
 * Tekrar çalıştırılabilir (idempotent). extracted klasörü gelince yeniden çalıştır.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'passives')
const EX = 'C:/Users/panar/Desktop/poe2-tools/extracted'
const TEXCONV = 'C:/Users/panar/Desktop/poe2-tools/texconv.exe'
const REPOE_ICON = 'https://repoe-fork.github.io/poe2/Art/2DArt/SkillIcons/passives/'
const passives = require(path.join(ROOT, 'src', 'data', 'passives.json'))

// extracted SkillIcons/passives (varsa): basename(lower) -> fullpath
function indexExtracted() {
  const map = new Map()
  // passives'e özel klasörler önce (öncelik), sonra TÜM skillicons ağacı (yeni
  // Azmeri companion / mekanik node'ları skillicons kökünde ve alt klasörlerde).
  const candidates = [
    path.join(EX, 'passives'),
    path.join(EX, '2d/2dart/skillicons/passives'),
    path.join(EX, 'skillicons/passives'),
    path.join(EX, 'art/2dart/skillicons/passives'),
    path.join(EX, 'skillicons'),
    path.join(EX, 'art/2dart/skillicons')
  ]
  function walk(d, acc) {
    let ents
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
    for (const x of ents) {
      const p = path.join(d, x.name)
      if (x.isDirectory()) walk(p, acc)
      else if (x.name.toLowerCase().endsWith('.dds')) acc.push(p)
    }
  }
  const all = []
  for (const c of candidates) walk(c, all)
  // önce normal çözünürlük (4k olmayan), sonra 4k yedek; ilk gelen korunur
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

// GGG icon adı ≠ oyun dosyası adı olan GÜVENLİ (1:1 doğrulanmış) eşlemeler.
// Belirsizler eklenmez; node tipine göre renkli placeholder kalır.
const ICON_ALIAS = {
  crimsonassaultkeystone: 'crimsondance' // Crimson Assault (kanama) keystone arti
}

async function main() {
  // benzersiz ikon basename'leri: passives.json (liste) + passive-tree.json (ağaç,
  // mastery sembolleri + sınıf start ikonları dahil).
  const bases = new Set()
  for (const r of passives) {
    if (!r.icon) continue
    bases.add(r.icon.split('/').pop().replace(/\.png$/i, ''))
  }
  const treePath = path.join(ROOT, 'src', 'data', 'passive-tree.json')
  if (fs.existsSync(treePath)) {
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'))
    for (const n of tree.nodes) {
      const base = n[4] // [skill,x,y,typeCode,iconBase,pid]
      if (base) bases.add(base)
    }
  }
  const exIdx = indexExtracted()
  console.log('benzersiz node ikonu:', bases.size, '| extracted SkillIcons/passives bulundu:', exIdx.size)

  let fromExtract = 0, fromRepoe = 0, miss = []
  for (const base of bases) {
    const dest = path.join(OUT, base + '.png')
    if (fs.existsSync(dest)) { continue }
    const lc = base.toLowerCase()
    const src = exIdx.get(lc) || exIdx.get(ICON_ALIAS[lc])
    if (src && texconvTo(src, base + '.png')) { fromExtract++; continue }
    if (await downloadPng(base, base + '.png')) { fromRepoe++; continue }
    miss.push(base)
  }
  const have = bases.size - miss.length
  console.log('toplam üretilen/var:', have, '/', bases.size,
    '(extracted:', fromExtract, ', RePoE:', fromRepoe, ')')
  console.log('EKSİK ikon:', miss.length)
  if (exIdx.size === 0) {
    console.log('\n! extracted SkillIcons/passives YOK. Tüm ikonlar için VisualGGPK3 ile çıkar:')
    console.log('   Art/2DArt/SkillIcons/passives/')
    console.log('  (çıkarınca bu scripti tekrar çalıştır.)')
  }
  if (miss.length) console.log('  örnek eksik:', miss.slice(0, 10).join(', '))
}

main().catch((e) => { console.error('HATA:', e); process.exit(1) })
