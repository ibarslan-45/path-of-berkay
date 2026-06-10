/**
 * test-clipboard.ts — clipboard-parse.ts birim testi (saf, ağsız).
 * Gerçek PoE2 Ctrl+C örnekleriyle doğrular.  Çalıştırma: npx tsx scripts/test-clipboard.ts
 */
import { parseClipboard, modToPattern } from '../src/renderer/src/lib/clipboard-parse'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : ''))
  }
}

// --- Örnek 1: Rare gövde zırhı (web-doğrulı format) ---
const RARE = `Item Class: Body Armours
Rarity: Rare
Gloom Sanctuary
Cutthroat's Garb
--------
Quality: +20% (augmented)
Evasion Rating: 727 (augmented)
--------
Requirements:
Level: 68
Dex: 148
Int: 47
--------
Sockets: S S
--------
Item Level: 70
--------
+12% to Fire Resistance (implicit)
--------
+83 to Evasion Rating
9% increased Evasion Rating
+88 to maximum Life
6% increased Stun Threshold
+24% to Cold Resistance
--------
Corrupted`

console.log('Örnek 1 — Rare Body Armour:')
const r = parseClipboard(RARE)!
check('itemClass = Body Armours', r.itemClass === 'Body Armours', r.itemClass)
check('rarity = Rare', r.rarity === 'Rare', r.rarity)
check('name = Gloom Sanctuary', r.name === 'Gloom Sanctuary', r.name)
check("baseType = Cutthroat's Garb", r.baseType === "Cutthroat's Garb", r.baseType)
check('itemLevel = 70', r.itemLevel === 70, r.itemLevel)
check('quality = 20', r.quality === 20, r.quality)
check('sockets = 2', r.sockets === 2, r.sockets)
check('corrupted = true', r.corrupted === true, r.corrupted)
check('identified = true', r.identified === true)
check('implicit count = 1', r.implicits.length === 1, r.implicits.length)
check('implicit text', r.implicits[0]?.text === '+12% to Fire Resistance', r.implicits[0]?.text)
check('explicit count = 5', r.explicits.length === 5, r.explicits.length)
check('explicit has Life', r.explicits.some((m) => /maximum Life/.test(m.text)))
check('property Evasion augmented', r.properties.some((p) => p.label === 'Evasion Rating' && p.augmented))

// --- Örnek 2: Normal taban (kimliksiz değil, mod yok) ---
const NORMAL = `Item Class: Wands
Rarity: Normal
Siphoning Wand
--------
Requirements:
Level: 65
Int: 116
--------
Item Level: 81`

console.log('\nÖrnek 2 — Normal Wand:')
const n = parseClipboard(NORMAL)!
check('rarity = Normal', n.rarity === 'Normal', n.rarity)
check('baseType = Siphoning Wand', n.baseType === 'Siphoning Wand', n.baseType)
check('name = (boş)', n.name === '', n.name)
check('itemLevel = 81', n.itemLevel === 81, n.itemLevel)
check('explicit yok', n.explicits.length === 0, n.explicits.length)

// --- Örnek 3: crafted + fractured işaretleri ---
const CRAFTED = `Item Class: Rings
Rarity: Rare
Gloom Coil
Sapphire Ring
--------
Item Level: 82
--------
+25% to Cold Resistance (implicit)
--------
+45 to maximum Life
+38% to Lightning Resistance (fractured)
+12 to Dexterity (crafted)`

console.log('\nÖrnek 3 — crafted/fractured işaretleri:')
const c = parseClipboard(CRAFTED)!
check('explicit count = 3', c.explicits.length === 3, c.explicits.length)
check('fractured işaretli', c.explicits.some((m) => m.kind === 'fractured'))
check('crafted işaretli', c.explicits.some((m) => m.kind === 'crafted'))
check('fractured metin temiz', c.explicits.find((m) => m.kind === 'fractured')?.text === '+38% to Lightning Resistance')

// --- Örnek 4: modToPattern ---
console.log('\nÖrnek 4 — modToPattern:')
check('Life kalıbı', modToPattern('+88 to maximum Life') === '+# to maximum Life', modToPattern('+88 to maximum Life'))
check('% kalıbı', modToPattern('9% increased Evasion Rating') === '#% increased Evasion Rating', modToPattern('9% increased Evasion Rating'))
check('aralık kalıbı', modToPattern('Adds 5 to 12 Fire Damage') === 'Adds # to # Fire Damage', modToPattern('Adds 5 to 12 Fire Damage'))

// --- Örnek 5: boş/bozuk girdi (çökmemeli) ---
console.log('\nÖrnek 5 — dayanıklılık:')
check('boş string null', parseClipboard('') === null)
check('rastgele metin Unknown', parseClipboard('merhaba dünya')?.rarity === 'Unknown')

// --- Örnek 6: enchant + rune + note + corrupted (tam çekme) ---
const FULL = `Item Class: Helmets
Rarity: Rare
Pain Visor
Advanced Spired Greathelm
--------
Quality: +12% (augmented)
Armour: 480 (augmented)
--------
Requirements:
Level: 67
Str: 138
--------
Sockets: S S
--------
Item Level: 79
--------
Allocates Heavy Bombardment (enchant)
--------
+62 to maximum Life
+38% to Fire Resistance
12% increased Armour (rune)
--------
Corrupted
--------
Note: ~price 3 divine`

console.log('\nÖrnek 6 — enchant + rune + note + corrupted:')
const f = parseClipboard(FULL)!
check('itemClass = Helmets', f.itemClass === 'Helmets', f.itemClass)
check('quality = 12', f.quality === 12, f.quality)
check('itemLevel = 79', f.itemLevel === 79, f.itemLevel)
check('req level = 67', f.requirements.level === 67, f.requirements.level)
check('req str = 138', f.requirements.str === 138, f.requirements.str)
check('sockets = 2', f.sockets === 2, f.sockets)
check('enchant ayrı tutuldu', f.enchants.length === 1 && /Heavy Bombardment/.test(f.enchants[0].text), f.enchants)
check('enchant explicit DEĞİL', !f.explicits.some((m) => m.kind === 'enchant'), f.explicits.map((m) => m.kind))
check('rune yakalandı', f.runes.length === 1 && /increased Armour/.test(f.runes[0]), f.runes)
check('explicit count = 3 (rune dahil)', f.explicits.length === 3, f.explicits.length)
check('corrupted = true', f.corrupted === true, f.corrupted)
check('note = ~price 3 divine', /price 3 divine/.test(f.note), f.note)
check('note explicit havuzuna girmedi', !f.explicits.some((m) => /price/.test(m.text)), f.explicits)

// --- Örnek 7: Synthesised + fractured bayrağı + inline Requires ---
const SYNTH = `Item Class: Amulets
Rarity: Rare
Brood Choker
Jade Amulet
--------
Requirements: Level 55, 60 Dex
--------
Item Level: 80
--------
+20 to Dexterity (implicit)
--------
+409 to Evasion Rating (fractured)
+25% to Chaos Resistance
--------
Synthesised`

console.log('\nÖrnek 7 — Synthesised + fractured bayrağı + inline Requires:')
const sy = parseClipboard(SYNTH)!
check('req level (inline) = 55', sy.requirements.level === 55, sy.requirements.level)
check('req dex (inline) = 60', sy.requirements.dex === 60, sy.requirements.dex)
check('fractured bayrağı = true', sy.fractured === true, sy.fractured)
check('influences Synthesised', sy.influences.some((i) => /Synthesised/i.test(i)), sy.influences)
check('implicit Dexterity', sy.implicits.length === 1 && /Dexterity/.test(sy.implicits[0].text), sy.implicits)

// --- Örnek 8: birden çok damage property + Charm Slots ---
const WEAPON = `Item Class: Crossbows
Rarity: Rare
Storm Core
Advanced Tense Crossbow
--------
Physical Damage: 42-78 (augmented)
Fire Damage: 10-22 (augmented)
Critical Hit Chance: 6.50%
Attacks per Second: 1.45
--------
Item Level: 81
--------
Adds 10 to 22 Fire Damage
35% increased Physical Damage`

console.log('\nÖrnek 8 — çoklu damage property:')
const w = parseClipboard(WEAPON)!
check('Physical Damage property', w.properties.some((p) => p.label === 'Physical Damage'), w.properties.map((p) => p.label))
check('Fire Damage property', w.properties.some((p) => p.label === 'Fire Damage'))
check('Crit property', w.properties.some((p) => p.label === 'Critical Hit Chance'))
check('explicit count = 2', w.explicits.length === 2, w.explicits.length)

console.log('\nÖrnek 9 — Advanced Mod Descriptions (açık) → { ... } satırları atlanır, kind ipucu uygulanır:')
const ADV = `Item Class: Rings
Rarity: Rare
Hypnotic Whorl
Sapphire Ring
--------
Item Level: 81
--------
{ Implicit Modifier }
+22% to Cold Resistance (implicit)
--------
{ Prefix Modifier "Athlete's" (Tier: 2) — Life }
+95 to maximum Life
{ Suffix Modifier "of the Walrus" (Tier: 3) — Cold }
+34% to Cold Resistance
{ Master Crafted Prefix Modifier "Upgraded" (Rank: 1) }
+1 to Level of all Fire Spell Skills
{ Fractured Suffix Modifier "of the Bear" (Tier: 1) }
+25 to Strength`
const adv = parseClipboard(ADV)!
check('1 implicit (annotation atlandı)', adv.implicits.length === 1, adv.implicits.length)
check('4 explicit (4 annotation atlandı)', adv.explicits.length === 4, adv.explicits.length)
check('hiçbir mod metni "Modifier"/"{" içermez', !adv.explicits.concat(adv.implicits).some((m) => /Modifier|\{|Tier:|Rank:/.test(m.text)))
check('crafted inline etiket olmadan tespit', adv.explicits.some((m) => m.kind === 'crafted' && /Fire Spell/.test(m.text)))
check('fractured annotation’dan + fractured=true', adv.fractured === true && adv.explicits.some((m) => m.kind === 'fractured' && /Strength/.test(m.text)))
check('Life mod düz explicit', adv.explicits.some((m) => m.kind === 'explicit' && /maximum Life/.test(m.text)))

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
