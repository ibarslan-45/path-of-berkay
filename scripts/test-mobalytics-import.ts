/**
 * test-mobalytics-import.ts — Mobalytics YAPISAL build → PobBuild reconstruction birim testi (saf, ağsız).
 * Fixture, canlı mobalytics.gg/poe-2 creator build'inin __PRELOADED_STATE__.buildVariants yapısını yansıtır
 * (probe ile doğrulı: gemSlug/activeSkill.name, node-XXXXX pasif, equipment.commonItem.explicitDescriptions).
 * Çalıştırma: npx tsx scripts/test-mobalytics-import.ts
 */
import { mobalyticsToPob, type MobalyticsData } from '../src/renderer/src/lib/pob-mobalytics'
import { slotWeaponSet, buildHasWeaponSets } from '../src/renderer/src/lib/weapon-set'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

const data: MobalyticsData = {
  name: 'INFINITE Charges GEMLING',
  variants: [
    {
      id: 'v0',
      name: null,
      skillGems: {
        gems: [
          {
            activeSkill: { gemSlug: 'fallingthunderplayer', name: 'Falling Thunder', level: 19 },
            subSkills: [
              { gemSlug: 'supportperpetualchargeplayer', gemType: 'SUPPORT' },
              { gemSlug: 'supportnovaprojectilesplayer', gemType: 'SUPPORT' },
              { gemSlug: 'totallymadeupsupportplayer', gemType: 'SUPPORT' } // eşleşmeyecek → "eşleşmedi"
            ],
            // GERÇEK VERİ: weaponSet STRING "set1"/"set2" (probe ile doğrulı). #4 fix.
            weaponSet: 'set1'
          },
          {
            activeSkill: { gemSlug: 'heraldoficeplayer', name: 'Herald of Ice', level: 1 },
            subSkills: [],
            weaponSet: 'set2'
          }
        ]
      },
      passiveTree: {
        // node-XXXXX: numeric kısım = passive-tree.json node id (n[0]); 4/16 gerçek, 999999 sahte
        mainTree: { selectedSlugs: ['node-4', 'node-16', 'node-999999'] },
        set1Tree: { selectedSlugs: ['node-100'] }, // #6: set1 de birleştirilmeli
        ascendancyTree: { selectedSlugs: null },
        attributeNodes: [{ attribute: 'dex', nodeSlug: 'node-52' }]
      },
      equipment: {
        amulet: {
          commonItem: {
            slug: "amulet-fouruniqueamulet20-serpent's-egg",
            isUnique: true,
            name: "Serpent's Egg",
            itemClassSlug: 'amulet',
            explicitDescriptions: [{ description: '+22% to Chaos Resistance' }, { description: '28% increased Mana Regeneration Rate' }]
          }
        },
        body: {
          commonItem: {
            slug: 'armour-fourbodystr-rare',
            isUnique: false,
            name: 'Doom Shell',
            itemClassSlug: 'body-armour',
            explicitDescriptions: [{ description: '+120 to maximum Life' }]
          },
          runes: [{ slug: 'soulcore-runeenhancegreater' }]
        },
        flask1: {
          commonItem: {
            slug: 'flask-fourflasklife7',
            isUnique: false,
            name: 'Gargantuan Life Flask',
            itemClassSlug: 'lifeflask',
            explicitDescriptions: [{ description: '50% increased Recovery rate' }]
          }
        },
        // #1/#2 GERÇEK YAPI: mainHand/offHand'de eşya DOĞRUDAN commonItem değil, set1/set2 altında nested.
        // set1 → Weapon 1 (Set 1), set2 → Weapon 1 Swap (Set 2). Eskiden commonItem null → silah atlanıyordu.
        mainHand: {
          set1: {
            commonItem: { slug: 'bow-fourbow-rare', isUnique: false, name: 'Warden Bow', itemClassSlug: 'bow', explicitDescriptions: [{ description: '49% increased Physical Damage' }] }
          },
          set2: {
            commonItem: { slug: 'talisman-rare', isUnique: false, name: 'Changeling Talisman', itemClassSlug: 'talisman', explicitDescriptions: [{ description: '+30 to Spirit' }] }
          }
        },
        offHand: {
          set1: {
            commonItem: { slug: 'quiver-fourquiver-rare', isUnique: false, name: 'Broadhead Quiver', itemClassSlug: 'quiver', explicitDescriptions: [{ description: '+1 to Level of all Projectile Skills' }] }
          },
          set2: { commonItem: null } // set 2'de yan el yok
        },
        priorityList: null // eşya değil → atlanmalı
      }
    },
    {
      id: 'v1',
      name: 'Endgame',
      skillGems: { gems: [{ activeSkill: { gemSlug: 'sparkplayer', name: 'Spark', level: 20 }, subSkills: [] }] },
      passiveTree: { mainTree: { selectedSlugs: ['node-55', 'node-60'] }, attributeNodes: [] },
      equipment: {}
    }
  ]
}

const pob = mobalyticsToPob(data, { author: { name: 'Spud', url: 'https://twitch.tv/x' }, sourceUrl: 'https://mobalytics.gg/poe-2/...' })

console.log('Variants → skillSets / specs:')
check('2 skillSet (variant başına)', pob.skillSets.length === 2, pob.skillSets.length)
check('2 spec', pob.specs.length === 2)
check('variant 0 başlık "Variant 1"', pob.skillSets[0].title === 'Variant 1', pob.skillSets[0].title)
check('variant 1 başlık "Endgame" (verilen ad)', pob.skillSets[1].title === 'Endgame', pob.skillSets[1].title)

console.log('\nSkills (active + support):')
const g0 = pob.skillSets[0].groups[0].gems
check('grup0 aktif = Falling Thunder', g0[0].nameSpec === 'Falling Thunder' && !g0[0].support, g0[0].nameSpec)
check('aktif gemId çözüldü (Metadata…)', /Metadata\/Items\/Gem/i.test(g0[0].gemId), g0[0].gemId)
check('aktif level 19', g0[0].level === 19)
check('support Perpetual Charge çözüldü', g0.some((g) => g.support && g.nameSpec === 'Perpetual Charge'), g0.map((g) => g.nameSpec))
check('support gemId bağlandı', g0.find((g) => g.nameSpec === 'Perpetual Charge')?.gemId !== '', g0.find((g) => g.nameSpec === 'Perpetual Charge')?.gemId)
const unmatchedSup = g0.filter((g) => g.support && g.gemId === '')
check('eşleşmeyen support gemId boş (1 tane: uydurma slug)', unmatchedSup.length === 1, unmatchedSup.map((g) => g.nameSpec))
check('eşleşmeyen support yine de bir nameSpec taşır', !!unmatchedSup[0]?.nameSpec, unmatchedSup[0]?.nameSpec)

console.log('\n#4 — gem silah seti (weaponSet STRING "set1"/"set2"):')
const grp0 = pob.skillSets[0].groups[0] as { slot?: string }
const grp1 = pob.skillSets[0].groups[1] as { slot?: string }
check('set1 grubu slot "Weapon 1" → Set 1', slotWeaponSet(grp0.slot) === 1, grp0.slot)
check('set2 grubu slot "Weapon 1 Swap" → Set 2', slotWeaponSet(grp1.slot) === 2, grp1.slot)
check('gem set verisi VAR (gemsHaveSetData true olur)', !!grp0.slot && !!grp1.slot)

console.log('\nPassives (node-XXXXX → numeric, benzersiz; set1Tree birleşik #6):')
const sp0 = pob.specs[0].nodes
check('main 4,16 + set1 100 + attr 52 + 999999 = 5 node', sp0.length === 5, sp0)
check('4 ve 16 var', sp0.includes(4) && sp0.includes(16))
check('set1Tree node 100 dahil (#6 union)', sp0.includes(100), sp0)
check('attribute node 52 dahil', sp0.includes(52))
check('sahte 999999 ham geçer (matchNode eşlemez)', sp0.includes(999999))
check('variant 1 specs = [55,60]', JSON.stringify(pob.specs[1].nodes) === '[55,60]', pob.specs[1].nodes)

console.log('\nGear — HER variant KENDİ seti (#2): stageSlots[vi]:')
check('stageSlots 2 variant', pob.stageSlots?.length === 2, pob.stageSlots?.length)
const ss0 = pob.stageSlots![0]
check('6 eşya (amulet+body+flask+bow+talisman+quiver; priorityList atlandı)', pob.items.length === 6, pob.items.length)
// #1/#2: silah set1/set2 yuvalanması → Weapon 1 / Weapon 1 Swap / Weapon 2
const bow = pob.items.find((i) => i.name === 'Warden Bow')!
check('bow (mainHand.set1) Weapon 1 slotunda', ss0['Weapon 1'] === bow.id, ss0)
const tali = pob.items.find((i) => i.name === 'Changeling Talisman')!
check('talisman (mainHand.set2) Weapon 1 Swap slotunda (Set 2)', ss0['Weapon 1 Swap'] === tali.id, ss0)
const quiv = pob.items.find((i) => i.name === 'Broadhead Quiver')!
check('quiver (offHand.set1) Weapon 2 slotunda', ss0['Weapon 2'] === quiv.id, ss0)
check('Weapon 1 = Set 1, Weapon 1 Swap = Set 2', slotWeaponSet('Weapon 1') === 1 && slotWeaponSet('Weapon 1 Swap') === 2)
check('build dual-set algılandı (hasWeaponSets)', buildHasWeaponSets(pob) === true)
const amu = pob.items.find((i) => i.name === "Serpent's Egg")!
check('amulet UNIQUE', amu.rarity === 'UNIQUE')
check('variant0 amulet slot Amulet', ss0['Amulet'] === amu.id, ss0)
check('amulet mod metni', amu.mods.includes('+22% to Chaos Resistance'))
const body = pob.items.find((i) => i.name === 'Doom Shell')!
check('body RARE (unique değil, modlu)', body.rarity === 'RARE', body.rarity)
check('variant0 body slot Body Armour', ss0['Body Armour'] === body.id)
check('rune mod satırı eklendi', body.mods.some((m) => /Rune/i.test(m)), body.mods)
check('variant0 flask slot Flask 1', !!ss0['Flask 1'])
check('variant1 gear boş (kendi seti)', Object.keys(pob.stageSlots![1]).length === 0, pob.stageSlots![1])

console.log('\nClass (heuristik centroid):')
check('className boş değil (4/16/52 düğümünden türedi)', pob.className.length > 0, pob.className)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
