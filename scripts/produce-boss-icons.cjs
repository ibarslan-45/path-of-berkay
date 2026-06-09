/**
 * produce-boss-icons.cjs
 * ----------------------------------------------------------------------------
 * Boss'lar sekmesi için ikon + banner üretir. Kaynak: extracted UI 2D oyun
 * dosyaları (texconv ile DDS->PNG, alfa korunur). YENİ İNDİRME YOK.
 *
 *   - icon   : boss'a özel yüz portresi / map-button (yoksa mekanik map-button)
 *   - banner : boss'a özel arena/hubtoast (yoksa mekanik hubtoast banner)
 *
 * Çıktı: src/renderer/assets/bosses/<id>.png ve <id>-banner.png
 * build-bosses.ts bu dosyaları <id>.png / <id>-banner.png olarak otomatik alır.
 *
 * NOT: assets/bosses/ içindeki worldmapcontent* kampanya madalyonlarına
 * (areas.json kullanıyor) DOKUNULMAZ; yalnızca 24 boss id'li dosyalar yazılır.
 *
 * Çalıştırma:  node scripts/produce-boss-icons.cjs
 * Sonra:       npm run build:bosses
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const EX = 'C:/Users/panar/Desktop/poe2-tools/extracted'
const TEXCONV = 'C:/Users/panar/Desktop/poe2-tools/texconv.exe'
const root = path.join(__dirname, '..')
const OUT = path.join(root, 'src', 'renderer', 'assets', 'bosses')
const CACHE = path.join(__dirname, '.boss-dds-cache') // assets dışı (glob'a sızmasın)

// kısayol prefiksleri (EX'e göre göreli)
const MB = '2d/2dart/uiimages/ingame/worldmap/4k/' // yuvarlak map-button ikonları
const HT = '2d/2dart/uiimages/ingame/4k/' // hubtoastdisplay geniş banner'lar
const PORT = '2d/2dart/uiimages/ingame/npcwindow/portraits/' // yüz portreleri

// boss id -> { icon, banner } (EX'e göre göreli .dds yolları)
// boss'a ÖZEL olanlar açıkça; gerisi mekanik/aile fallback'i (banner+icon).
const MAP = {
  // ---- PINNACLE (9) ----
  xesht: { icon: MB + 'mapbuttonbreach.dds', banner: HT + 'hubtoastdisplaybreach.dds' },
  olroth: { icon: MB + 'mapbuttonexpedition.dds', banner: HT + 'hubtoastdisplayexpedition.dds' },
  zarokh: {
    icon: '2d/2dart/uiimages/ingame/mtx/hourglassmapdevice/hourglassmapdeviceicondefault.dds',
    banner: HT + 'hubtoastdisplaytrialofsekhemas.dds',
    special: true
  },
  trialmaster: { icon: PORT + 'trialmaster.dds', banner: HT + 'hubtoastdisplaytrialofchaos.dds', special: true },
  'arbiter-of-divinity': {
    icon: MB + 'mapbuttonarbiterofdivinity.dds',
    banner: HT + 'hubtoastdisplayarbiterofdivinity.dds',
    special: true
  },
  bodach: { icon: MB + 'mapbuttonritual.dds', banner: HT + 'hubtoastdisplayritual.dds' },
  tangmazu: {
    icon: PORT + 'poe2/endgame/childtangmazu.dds',
    banner: HT + 'hubtoastdisplaydelirium.dds',
    special: true
  },
  'vessel-of-kulemak': {
    icon: MB + 'mapbuttonabysshub.dds',
    banner: '2d/2dart/uiimages/ingame/hideout/hideoutimages/4k/kulemakbossarenahideout.dds',
    special: true
  },
  'atziri-red-queen': {
    icon: 'skillicons/4k/atziriheraldofblood.dds',
    banner: '2d/2dart/uiimages/ingame/hideout/hideoutimages/4k/atzirisarenahideout.dds',
    special: true
  },
  // ---- GATE (13) ----
  'king-in-the-mists': {
    icon: '2d/2dart/uiimages/ingame/atlasscreen/atlasiconcontent/atlasiconcontentkinginthemists.dds',
    banner: HT + 'hubtoastdisplayritual.dds',
    special: true
  },
  'arbiter-of-ash': {
    icon: MB + 'mapbuttonarbiterofash.dds',
    banner: HT + 'hubtoastdisplayarbiterofash.dds',
    special: true
  },
  'tul-esh': { icon: MB + 'mapbuttonbreach.dds', banner: HT + 'hubtoastdisplaybreach.dds' },
  vruun: { icon: MB + 'mapbuttonbreach.dds', banner: HT + 'hubtoastdisplaybreach.dds' },
  'queen-in-the-mists': { icon: MB + 'mapbuttonritual.dds', banner: HT + 'hubtoastdisplayritual.dds' },
  medved: { icon: MB + 'mapbuttonexpedition.dds', banner: HT + 'hubtoastdisplayexpedition.dds' },
  uhtred: { icon: MB + 'mapbuttonexpedition.dds', banner: HT + 'hubtoastdisplayexpedition.dds' },
  phyx: { icon: MB + 'mapbuttonarbiterofdivinity.dds', banner: HT + 'hubtoastdisplayarbiterofdivinity.dds' },
  phya: { icon: MB + 'mapbuttonarbiterofdivinity.dds', banner: HT + 'hubtoastdisplayarbiterofdivinity.dds' },
  'geonor-doryani': {
    icon: PORT + 'poe2/act 4/doryani.dds',
    banner: '2d/2dart/uiimages/ingame/completionpopup/4k/completionpopupatlasdoryanioneline.dds',
    special: true
  },
  tasgul: { icon: MB + 'mapbuttonabysshub.dds', banner: HT + 'hubtoastdisplayabyss.dds' },
  vandroth: { icon: MB + 'mapbuttonabysshub.dds', banner: HT + 'hubtoastdisplayabyss.dds' },
  'architect-xipocado': {
    icon: '2d/2dart/uiimages/ingame/delve/mapencounters/bossvaalcity.dds',
    banner: '2d/2dart/uiimages/ingame/hideout/hideoutimages/crimsontemplehideout.dds',
    special: true
  },
  // ---- ENDGAME (2) ----
  omniphobia: { icon: MB + 'mapbuttondelirium.dds', banner: HT + 'hubtoastdisplaydelirium.dds' },
  kosis: { icon: MB + 'mapbuttondelirium.dds', banner: HT + 'hubtoastdisplaydelirium.dds' }
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true })

// DDS -> PNG (cache). Aynı kaynak birden çok boss'ta kullanılabilir -> 1 kez çevir.
function toPng(relDds) {
  const srcAbs = path.join(EX, relDds)
  if (!fs.existsSync(srcAbs)) return null
  const base = path.basename(relDds).replace(/\.dds$/i, '.png')
  const cached = path.join(CACHE, base)
  if (fs.existsSync(cached)) return cached
  try {
    execFileSync(TEXCONV, ['-ft', 'png', '-o', CACHE, '-y', '-nologo', srcAbs], { stdio: 'ignore' })
  } catch (e) {
    return null
  }
  return fs.existsSync(cached) ? cached : null
}

let iconCount = 0
let bannerCount = 0
let specialCount = 0
const missing = []

for (const [id, m] of Object.entries(MAP)) {
  // icon
  const iconPng = toPng(m.icon)
  if (iconPng) {
    fs.copyFileSync(iconPng, path.join(OUT, `${id}.png`))
    iconCount++
    if (m.special) specialCount++
  } else {
    missing.push(`${id} icon (${m.icon})`)
  }
  // banner
  const bannerPng = toPng(m.banner)
  if (bannerPng) {
    fs.copyFileSync(bannerPng, path.join(OUT, `${id}-banner.png`))
    bannerCount++
  } else {
    missing.push(`${id} banner (${m.banner})`)
  }
}

// cache temizle (assets'i kirletmesin)
try {
  for (const f of fs.readdirSync(CACHE)) fs.unlinkSync(path.join(CACHE, f))
  fs.rmdirSync(CACHE)
} catch (e) {
  /* yoksa boşver */
}

const total = Object.keys(MAP).length
console.log(`boss görseli üretildi: ${total} boss`)
console.log(`  ikon: ${iconCount}/${total} (boss'a özel: ${specialCount})`)
console.log(`  banner: ${bannerCount}/${total}`)
if (missing.length) console.log('  eksik kaynak:', missing.join(' | '))
else console.log('  eksik yok — her boss ikon + banner aldı.')
