/**
 * produce-mechanic-icons.cjs
 * ----------------------------------------------------------------------------
 * Mekanikler sekmesi için ikon + banner üretir. YENİ indirme YOK: mevcut
 * extracted asset'leri yeniden kullanır.
 *   - icon   : atlas node ikonu (küçük, liste + kart başlığı) -> assets/atlas/
 *   - banner : area loading-screen (kart hero görseli)        -> assets/areas/
 * Çıktı: src/renderer/assets/mechanics/<id>.png ve <id>-banner.png
 *
 * Çalıştırma:  node scripts/produce-mechanic-icons.cjs
 * Sonra:       npm run build:mechanics   (icon/banner alanlarını doldurmak için)
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const atlasDir = path.join(root, 'src', 'renderer', 'assets', 'atlas')
const areasDir = path.join(root, 'src', 'renderer', 'assets', 'areas')
const outDir = path.join(root, 'src', 'renderer', 'assets', 'mechanics')

// id -> { icon: atlas dosyası, banner: area dosyası (ops.) }
const MAP = {
  breach: { icon: 'BreachNode2.png', banner: 'breachhub.png' },
  delirium: { icon: 'DeliriumNode1.png', banner: 'deliriumhub.png' },
  ritual: { icon: 'RitualNode1.png', banner: 'ritualhub.png' },
  expedition: { icon: 'PrecursorTabletExpedition.png' },
  abyss: { icon: 'AbyssCrack.png', banner: 'abyssalloadingscreen.png' },
  sanctum: { icon: 'AtlasMasteryGeneric.png', banner: 'trialofsekhemas.png' },
  ultimatum: { icon: 'TrialmasterKey1.png', banner: 'chaostempletrial.png' },
  strongbox: { icon: 'StrongboxNode1.png' },
  shrine: { icon: 'AtlasMasteryShrine.png' },
  essence: { icon: 'EssenceNode1.png' }
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

let icons = 0
let banners = 0
let missing = []
for (const [id, m] of Object.entries(MAP)) {
  const iconSrc = path.join(atlasDir, m.icon)
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(outDir, `${id}.png`))
    icons++
  } else {
    missing.push(`${id} icon (${m.icon})`)
  }
  if (m.banner) {
    const bSrc = path.join(areasDir, m.banner)
    if (fs.existsSync(bSrc)) {
      fs.copyFileSync(bSrc, path.join(outDir, `${id}-banner.png`))
      banners++
    } else {
      missing.push(`${id} banner (${m.banner})`)
    }
  }
}

console.log(`ikon: ${icons}/${Object.keys(MAP).length}, banner: ${banners}`)
if (missing.length) console.log('eksik kaynak:', missing.join(', '))
