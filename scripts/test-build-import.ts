/**
 * test-build-import.ts — .build JSON → PobBuild ayrıştırma birim testi (saf, ağsız).
 * Ana strateji: ROUND-TRIP (PobBuild → exportBuild → importDotBuild) → köprülerin simetrik olduğunu kanıtlar.
 * Ayrıca: unique vs rare item, eşleşmeyen pasif, hatalı dosya. Çalıştırma: npx tsx scripts/test-build-import.ts
 */
import { exportBuild } from '../src/renderer/src/lib/build-export'
import { importDotBuild } from '../src/renderer/src/lib/build-import'
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

// Kaynak PobBuild (test-build-export ile aynı temel) → .build → geri PobBuild
const source: PobBuild = {
  className: 'Sorceress',
  ascendClassName: 'Stormweaver',
  level: 90,
  targetVersion: '',
  mainSocketGroup: 1,
  skillSets: [
    {
      id: 's1',
      title: 'Endgame',
      groups: [
        {
          label: '',
          mainActiveSkill: 1,
          gems: [
            { nameSpec: 'Spark', skillId: '', gemId: 'Metadata/Items/Gems/SkillGemSpark', level: 20, quality: 0, count: 1, support: false },
            { nameSpec: 'Added Lightning', skillId: '', gemId: 'Metadata/Items/Gems/SupportGemAddedLightning', level: 20, quality: 0, count: 1, support: true }
          ]
        }
      ]
    }
  ],
  specs: [{ title: 'Endgame', treeVersion: '', classId: '', ascendClassId: '', nodes: [4, 52, 55, 60] }],
  items: [
    { id: 'i1', rarity: 'RARE', name: 'Gloom Crown', base: 'Ancestral Tiara', itemLevel: 80, levelReq: 0, mods: ['+88 to maximum Life', '+30% to Fire Resistance'] },
    { id: 'i2', rarity: 'UNIQUE', name: 'Astramentis', base: 'Stellar Amulet', itemLevel: 50, levelReq: 0, mods: ['+50 to all Attributes'] }
  ],
  slots: { Helmet: 'i1', Amulet: 'i2' },
  notes: 'A spark build.'
}

const { build: dotBuild } = exportBuild(source)
// gerçek dosya yolu = JSON.stringify → importDotBuild(string)
const { build: rt, report } = importDotBuild(JSON.stringify(dotBuild))

console.log('Round-trip: PobBuild → .build → PobBuild')
check('className geri (Sorceress)', rt.className === 'Sorceress', rt.className)
check('ascendClassName geri (Stormweaver)', rt.ascendClassName === 'Stormweaver', rt.ascendClassName)
check('ascendancy çözüldü', report.ascendancy.resolved === true)

console.log('\nPassives (GGG id → numeric node, ters köprü):')
check('4 node geri çözüldü', rt.specs[0].nodes.length === 4, rt.specs[0].nodes.length)
check('node 4 var', rt.specs[0].nodes.includes(4))
check('node 52,55,60 var', [52, 55, 60].every((n) => rt.specs[0].nodes.includes(n)))
check('rapor resolved=4 unresolved=0', report.passives.resolved === 4 && report.passives.unresolved === 0)

console.log('\nSkills (Metadata id → gem):')
const g = rt.skillSets[0].groups[0].gems
check('1 grup', rt.skillSets[0].groups.length === 1)
check('aktif Spark (gemId→ad çözüldü)', g[0].nameSpec === 'Spark' && !g[0].support, g[0].nameSpec)
check('aktif gemId korundu', g[0].gemId === 'Metadata/Items/Gems/SkillGemSpark')
check('support Added Lightning', g.some((x) => x.support && x.nameSpec === 'Added Lightning'), g.map((x) => x.nameSpec))

console.log('\nItems (additional_text/unique_name → rarity/name/base/mod):')
const helm = rt.items.find((i) => rt.slots['Helmet'] === i.id)!
check('Helm → Helmet slot', !!helm)
check('Helm RARE', helm.rarity === 'RARE', helm.rarity)
check('Helm ad Gloom Crown', helm.name === 'Gloom Crown', helm.name)
check('Helm mod korundu', helm.mods.includes('+88 to maximum Life'))
check('Helm taban boş (rare tabanı .build’de yok)', helm.base === '', helm.base)
const amu = rt.items.find((i) => rt.slots['Amulet'] === i.id)!
check('Amulet UNIQUE', amu.rarity === 'UNIQUE')
check('Amulet ad = unique_name', amu.name === 'Astramentis', amu.name)
check('Amulet taban = Stellar Amulet (unique tabanı korunur)', amu.base === 'Stellar Amulet', amu.base)
check('Amulet mod korundu', amu.mods.includes('+50 to all Attributes'))

console.log('\nEşleşmeyen pasif + hatalı dosya:')
const { report: r2 } = importDotBuild({ name: 'x', passives: ['lightning14', 'this_is_not_a_real_node_id'] })
check('1 çözülen + 1 çözülemeyen', r2.passives.resolved === 1 && r2.passives.unresolved === 1, r2.passives)
let threw = false
try {
  importDotBuild('{ not json ')
} catch {
  threw = true
}
check('bozuk JSON → Error', threw)
let threw2 = false
try {
  importDotBuild(JSON.stringify({ foo: 'bar', baz: 1 }))
} catch {
  threw2 = true
}
check('yanlış dosya tipi → Error', threw2)
// boş ama geçerli .build (yalnız name) → çökmeden boş build
const empty = importDotBuild(JSON.stringify({ name: 'Empty' }))
check('yalnız name → çökmez, boş build', empty.build.skillSets[0].groups.length === 0 && empty.build.items.length === 0)

console.log('\nGERÇEK OYUN formatı (passives:[{id}], inventory_slots, numaralı mod, taban ilk satır):')
const gameBuild = {
  name: 'Ice Shot Deadeye',
  ascendancy: 'Ranger1',
  author: 'someone',
  passives: [{ id: 'lightning14' }, { id: 'passive_keystone_zealots_oath' }, { id: 'not_a_real_node' }],
  skills: [{ id: 'Metadata/Items/Gem/SkillGemIceShot', level_interval: [32, 100], support_skills: [{ id: 'Metadata/Items/Gems/SupportGemFork' }] }],
  inventory_slots: [
    { inventory_id: 'Weapon1', additional_text: 'Artillery Bow\n1. 109% increased Physical Damage\n2. 7% increased Attack Speed', slot_x: 0, slot_y: 0 },
    { inventory_id: 'Helm1', additional_text: 'Iron Mask\n1. +40 to maximum Life' },
    { inventory_id: 'Ring2', unique_name: 'Heatshiver', additional_text: 'Sapphire Ring\n+30% Cold Damage' }
  ]
}
const { build: gb, report: gr } = importDotBuild(JSON.stringify(gameBuild))
check('class Ranger / Deadeye (Ranger1)', gb.className === 'Ranger' && gb.ascendClassName === 'Deadeye', gb.className + '/' + gb.ascendClassName)
check('passives [{id}] çözüldü (2/3)', gr.passives.resolved === 2 && gr.passives.unresolved === 1, gr.passives)
check('inventory_slots → 3 eşya', gb.items.length === 3, gb.items.length)
const bow = gb.items.find((i) => gb.slots['Weapon 1'] === i.id)!
check('Weapon1 → "Weapon 1" slot', !!bow, Object.keys(gb.slots))
check('oyun rare: taban = ilk satır (Artillery Bow)', bow.base === 'Artillery Bow', bow.base)
check('mod numarası temizlendi ("1. " düştü)', bow.mods[0] === '109% increased Physical Damage', bow.mods)
check('Helm1 → "Helmet" slot', !!gb.slots['Helmet'])
const ring = gb.items.find((i) => i.name === 'Heatshiver')!
check('Ring2 unique → "Ring 2" + base', gb.slots['Ring 2'] === ring.id && ring.base === 'Sapphire Ring', ring.base)
check('skill IceShot çözüldü', gb.skillSets[0].groups[0].gems[0].nameSpec === 'Ice Shot', gb.skillSets[0].groups[0].gems[0]?.nameSpec)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
