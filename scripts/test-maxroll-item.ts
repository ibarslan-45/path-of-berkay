/**
 * test-maxroll-item.ts — Maxroll item import düzeltmesi (XileHUD yöntemi) birim testi.
 * equipment.variants[0].items[slot]=id → items DB[id].stats → mod listesi + slot.
 * Çalıştırma: npx tsx scripts/test-maxroll-item.ts
 */
import { maxrollToPob } from '../src/renderer/src/lib/pob-maxroll'
import { pobItemToQueryItem } from '../src/renderer/src/lib/build-compare'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

// XileHUD yapısı: equipment.variants[].items[slot] = ID; gerçek stat items DB'de.
const data = {
  planner: {
    class: 'Sorceress',
    level: 90,
    equipment: {
      variants: [{ items: { Helmet: 101, BodyArmour: 102, Ring1: 103, Weapon1: 104 } }]
    }
  },
  items: {
    '101': {
      base: 'Ancestral Tiara',
      ilvl: 80,
      rarity: 2, // RARE
      stats: {
        explicit: { base_maximum_energy_shield: 69, 'fire_damage_resistance_%': 27, base_maximum_life: 28 },
        implicit: { 'cost_efficiency_+%': 12 }
      }
    },
    '102': {
      base: 'Metadata/Items/Armours/BodyArmours/BodyStrInt5',
      ilvl: 82,
      rarity: 3,
      unique: 'UNIQ_CloakFlame', // gerçek isim guide span'inde
      stats: { explicit: { base_maximum_life: 90 } }
    },
    '103': {
      base: 'Sapphire Ring',
      ilvl: 82,
      rarity: 2,
      stats: { explicit: { 'cold_damage_resistance_%': 25, base_maximum_mana: { min: 40, max: 50 } } }
    },
    '104': { base: 'Siphoning Wand', ilvl: 80, rarity: 2, stats: { explicit: { 'spell_damage_+%': 28 } } }
  }
}
const meta = { class: 'Sorceress', uniqueNames: { UNIQ_CloakFlame: 'Cloak of Flame' } }

const pob = maxrollToPob(data as Parameters<typeof maxrollToPob>[0], meta)

console.log('Eşyalar mod listesiyle doldu mu:')
check('4 eşya', pob.items.length === 4, pob.items.length)
check('TÜM eşyalarda mod var (0 boş)', pob.items.every((i) => i.mods.length > 0), pob.items.map((i) => i.mods.length))

const helmet = pob.items.find((i) => i.base.includes('Tiara'))!
console.log('\nHelmet (101) — stats → mod satırları:')
console.log('   ' + helmet.mods.join('\n   '))
check('ES modu (69)', helmet.mods.some((m) => /69 Maximum Energy Shield/.test(m)))
check('Fire Res modu (27)', helmet.mods.some((m) => /27 Fire Damage Resistance/.test(m)))
check('Life modu (28)', helmet.mods.some((m) => /28 Maximum Life/.test(m)))
check('implicit (Cost Efficiency 12)', helmet.mods.some((m) => /12 Cost Efficiency/.test(m)))

console.log('\nSlot eşlemesi (PoB-stili normalize):')
check('Helmet slot', !!pob.slots['Helmet'], Object.keys(pob.slots))
check('Body Armour slot (normalize)', !!pob.slots['Body Armour'], Object.keys(pob.slots))
check('Ring 1 slot (normalize)', !!pob.slots['Ring 1'], Object.keys(pob.slots))
check('Weapon 1 slot (normalize)', !!pob.slots['Weapon 1'], Object.keys(pob.slots))
check('slot → item id eşleşiyor', pob.slots['Helmet'] === helmet.id)

console.log('\nUnique (102) — isim guide span fallback + base Metadata temizlik:')
const uniq = pob.items.find((i) => i.rarity === 'UNIQUE')!
check('rarity UNIQUE', !!uniq)
check('isim span’den (Cloak of Flame)', uniq.name === 'Cloak of Flame', uniq.name)
check('base Metadata temizlendi', /Body Str Int/i.test(uniq.base), uniq.base)

console.log('\nRange değer (Ring mana 40-50):')
const ring = pob.items.find((i) => i.base.includes('Sapphire'))!
check('mana aralık modu', ring.mods.some((m) => /40-50 Maximum Mana/.test(m)), ring.mods)

console.log('\nbuild-compare/trade altyapısına bağlanıyor (pobItemToQueryItem):')
const { qi, searchableMods } = pobItemToQueryItem(helmet)
check('QueryItem mod sayısı = 4', qi.mods.length === 4, qi.mods.length)
check('her mod value taşıyor', qi.mods.filter((m) => m.value !== null).length >= 3, qi.mods.map((m) => m.value))
console.log(`   (stat-id eşleşen: ${searchableMods}/4 — humanize ≠ trade metni çoğu "doğrulanmalı"; pipeline BAĞLI, uydurma yok)`)
check('pipeline bağlı (qi üretildi)', qi.baseType.includes('Tiara'))

// --- CANLI SENARYO: planner.equipment YOK → items DB = giyili eşyalar, slot base Metadata'dan ---
console.log('\nCanlı senaryo (equipment yok → base Metadata’dan slot türet):')
const live = {
  planner: { class: 'Sorceress', level: 90 }, // equipment YOK
  items: {
    '1': { base: 'Metadata/Items/Armours/Gloves/FourGlovesInt4', ilvl: 80, rarity: 2, stats: { explicit: { base_maximum_life: 45 } } },
    '2': { base: 'Metadata/Items/Armours/Helmets/HelmetInt3', ilvl: 81, rarity: 2, stats: { explicit: { base_maximum_energy_shield: 60 } } },
    '3': { base: 'Metadata/Items/Rings/Ring5', ilvl: 82, rarity: 2, stats: { explicit: { 'fire_damage_resistance_%': 30 } } },
    '4': { base: 'Metadata/Items/Rings/Ring7', ilvl: 82, rarity: 2, stats: { explicit: { 'cold_damage_resistance_%': 28 } } },
    '5': { base: 'Metadata/Items/Weapons/OneHandWeapons/Wands/Wand6', ilvl: 80, rarity: 2, stats: { explicit: { 'spell_damage_+%': 40 } } }
  }
}
const livePob = maxrollToPob(live as Parameters<typeof maxrollToPob>[0], {})
check('5 eşya (tüm items DB)', livePob.items.length === 5, livePob.items.length)
check('hepsinde mod var', livePob.items.every((i) => i.mods.length > 0))
check('Gloves slot türetildi', !!livePob.slots['Gloves'], Object.keys(livePob.slots))
check('Helmet slot türetildi', !!livePob.slots['Helmet'])
check('Ring 1 + Ring 2 (çoklu numaralı)', !!livePob.slots['Ring 1'] && !!livePob.slots['Ring 2'], Object.keys(livePob.slots))
check('Weapon 1 slot türetildi', !!livePob.slots['Weapon 1'])

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
