/**
 * test-weapon-set.ts — silah seti türetme birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-weapon-set.ts
 */
import { slotWeaponSet, buildHasWeaponSets } from '../src/renderer/src/lib/weapon-set'
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

console.log('slotWeaponSet:')
check('Weapon 1 → set 1', slotWeaponSet('Weapon 1') === 1)
check('Weapon 2 → set 1', slotWeaponSet('Weapon 2') === 1)
check('Weapon 1 Swap → set 2', slotWeaponSet('Weapon 1 Swap') === 2)
check('Weapon 2 Swap → set 2', slotWeaponSet('Weapon 2 Swap') === 2)
check('Body Armour → null (paylaşılan)', slotWeaponSet('Body Armour') === null)
check('Helmet → null', slotWeaponSet('Helmet') === null)
check('boş → null', slotWeaponSet('') === null)
check('Offhand Swap → set 2', slotWeaponSet('Offhand Swap') === 2)

function emptyBuild(over: Partial<PobBuild>): PobBuild {
  return {
    className: 'Ranger', ascendClassName: '', level: 90, targetVersion: '2', mainSocketGroup: 1,
    skillSets: [], specs: [], items: [], slots: {}, notes: '', ...over
  }
}

console.log('\nbuildHasWeaponSets:')
check('swap slot var → true', buildHasWeaponSets(emptyBuild({ slots: { 'Weapon 1': 'a', 'Weapon 1 Swap': 'b' } })))
check('swap yok → false', buildHasWeaponSets(emptyBuild({ slots: { 'Weapon 1': 'a', Helmet: 'h' } })) === false)
check('grup slot swap → true', buildHasWeaponSets(emptyBuild({ skillSets: [{ id: '1', title: 'x', groups: [{ label: '', mainActiveSkill: 1, slot: 'Weapon 1 Swap', gems: [] }] }] })))
check('pasif set1/2 → true', buildHasWeaponSets(emptyBuild({ specs: [{ title: 'x', treeVersion: '', classId: '', ascendClassId: '', nodes: [1, 2], set1Nodes: [1], set2Nodes: [2] }] })))
check('stageSlots swap → true', buildHasWeaponSets(emptyBuild({ stageSlots: [{ 'Weapon 1 Swap': 'a' }] })))
check('null build → false', buildHasWeaponSets(null) === false)

console.log(`\n${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
