/**
 * build-keywords.cjs
 * ----------------------------------------------------------------------------
 * Oyun anahtar-kelime listesini (EN + TR) uretir -> src/data/keywords.json.
 * Kaynak: tum tr-*-glossary.json icindeki `tags` (otomatik; yeni tag eklenince
 * buyur) + asagidaki CORE durum-etkisi / sarj / oznitelik / mekanik terimleri.
 * Renderer bu listeyi okuyup tooltip metninde gecen terimlerin altini cizer.
 *
 * Calistirma:  node scripts/build-keywords.cjs   (npm run build:keywords)
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

// 1) Tum glossary `tags` (Life/Can, Fire/Ateş, Cold/Soğuk, ...) — otomatik kaynak
const pairs = new Map() // en -> tr
for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
  if (!/^tr-.*-glossary\.json$/.test(f)) continue
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'))
  if (g.tags) for (const k in g.tags) {
    const t = g.tags[k]
    if (t && t.en && t.tr) pairs.set(t.en, t.tr)
  }
}

// 2) CORE: refs'te alti cizili gecen durum-etkisi / sarj / oznitelik / mekanik
//    terimleri (proje talimatları TR karsiliklari). Cogul/cekim varyantlari ayri yazilir.
const CORE = {
  // Durum etkileri (Ailments)
  Freeze: 'Donma', Frozen: 'Donmuş', Freezing: 'Dondurma',
  Chill: 'Üşüme', Chilled: 'Üşümüş',
  Shock: 'Şok', Shocked: 'Şoklu', Shocking: 'Şoklama',
  Ignite: 'Tutuşma', Ignited: 'Tutuşmuş', Ignites: 'Tutuşturma', Burning: 'Yanan',
  Poison: 'Zehir', Poisoned: 'Zehirli',
  Bleed: 'Kanama', Bleeding: 'Kanayan',
  Scorch: 'Kavurma', Brittle: 'Kırılgan', Sap: 'Tüketme',
  // Sarjlar
  'Power Charge': 'Güç Şarjı', 'Power Charges': 'Güç Şarjları',
  'Frenzy Charge': 'Çılgınlık Şarjı', 'Frenzy Charges': 'Çılgınlık Şarjları',
  'Endurance Charge': 'Dayanıklılık Şarjı', 'Endurance Charges': 'Dayanıklılık Şarjları',
  Charge: 'Şarj', Charges: 'Şarjlar',
  // Oznitelikler (kisaltma dahil)
  Strength: 'Güç', Dexterity: 'Çeviklik', Intelligence: 'Zekâ',
  Str: 'Güç', Dex: 'Çeviklik', Int: 'Zekâ',
  // Mekanikler / terimler
  Mark: 'İşaret', Curse: 'Lanet', Hex: 'Büyü', Brand: 'Damga',
  Stun: 'Sersemletme', Stunned: 'Sersemletilmiş', Knockback: 'Geri Tepme',
  Skill: 'Yetenek', Skills: 'Yetenekler',
  Hit: 'Vuruş', Hits: 'Vuruşlar', Hitting: 'Vurma',
  'Critical Hit': 'Kritik Vuruş', Crit: 'Kritik',
  Leech: 'Emme', Regeneration: 'Yenilenme', Recovery: 'Yenileme',
  Buff: 'Güçlendirme', Debuff: 'Zayıflatma', Aura: 'Aura',
  Minion: 'Uşak', Totem: 'Totem', Projectile: 'Mermi', Melee: 'Yakın Dövüş',
  Spirit: 'Ruh', Rage: 'Öfke', Combo: 'Combo', Channel: 'Kanalize',
  Consume: 'Tüket', Consuming: 'Tüketme',
  'Damage over Time': 'Zamana Yayılan Hasar', Reservation: 'Rezervasyon'
}
for (const [en, tr] of Object.entries(CORE)) pairs.set(en, tr)

// Cikti: {en, tr} dizisi, en uzunluk azalan (uzun-once eslesme: "Power Charge" > "Charge")
const list = [...pairs.entries()]
  .map(([en, tr]) => ({ en, tr }))
  .filter(o => o.en.length >= 2)
  .sort((a, b) => b.en.length - a.en.length || b.tr.length - a.tr.length)

const out = path.join(ROOT, 'src', 'data', 'keywords.json')
fs.writeFileSync(out, JSON.stringify(list, null, 0) + '\n')
console.log('Yazıldı: keywords.json ->', list.length, 'terim (EN+TR)')
