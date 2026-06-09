/**
 * produce-class-portraits.cjs
 * ----------------------------------------------------------------------------
 * 8 PoE 2 sınıfının TAM-GÖVDE illüstrasyonunu (oyundaki karakter-seçim görseli;
 * dairesel maskeli, ŞEFFAF köşeler) PNG'ye çevirir ->
 * src/renderer/assets/classes/<class>.png. Görsel ağaçta sınıfın İLK başlangıç
 * node'unun dibinde, arka planı şeffaf gösterilir.
 *
 * Kaynak: Art/2DArt/BaseClassIllustrations/ (extracted) — 1500x1500 BC7, alfa
 * kanallı (RGBA). texconv ile PNG'ye çevrilir, alfa/şeffaflık KORUNUR.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'classes')
const SRC = 'C:/Users/panar/Desktop/poe2-tools/extracted/baseclassillustrations'
const TEXCONV = 'C:/Users/panar/Desktop/poe2-tools/texconv.exe'

// PoE 2 sınıf -> kaynak DDS base (BaseClassIllustrations şeffaf tam-gövde)
const MAP = {
  warrior: 'warriorbaseillustration',
  ranger: 'rangerbaseillustration',
  huntress: 'huntressbaseillustration',
  witch: 'witchbaseillustration',
  sorceress: 'sorceressbaseillustration',
  mercenary: 'mercenarybaseillustration',
  monk: 'monkbaseillustration',
  druid: 'druidbaseillustration'
}

fs.mkdirSync(OUT, { recursive: true })
let done = 0
const miss = []
for (const [cls, base] of Object.entries(MAP)) {
  const dest = path.join(OUT, cls + '.png')
  const src = path.join(SRC, base + '.dds')
  if (!fs.existsSync(src)) { miss.push(cls + ' (' + base + ')'); continue }
  const tmp = path.join(OUT, base + '.png')
  // -ft png: alfa korunur (RGBA). -y: üzerine yaz.
  try { execFileSync(TEXCONV, ['-ft', 'png', '-o', OUT, '-y', '-nologo', src], { stdio: 'ignore' }) }
  catch (e) { miss.push(cls + ' (texconv)'); continue }
  if (fs.existsSync(tmp)) { fs.renameSync(tmp, dest); done++ }
}
console.log('sınıf illüstrasyonu üretildi:', done, '/', Object.keys(MAP).length)
if (miss.length) console.log('EKSİK:', miss.join(', '))
