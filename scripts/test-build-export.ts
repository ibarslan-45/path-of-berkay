/**
 * test-build-export.ts — PobBuild → .build JSON üretimi birim testi (saf, ağsız).
 * Şema febsho/poe2-build-converter ile doğrulı. Çalıştırma: npx tsx scripts/test-build-export.ts
 */
import { exportBuild, buildFileName } from '../src/renderer/src/lib/build-export'
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

const build: PobBuild = {
  className: 'Sorceress',
  ascendClassName: 'Stormweaver',
  level: 90,
  targetVersion: '',
  mainSocketGroup: 1,
  skillSets: [
    { id: 's0', title: 'Leveling', groups: [] },
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
        },
        { label: '', mainActiveSkill: 1, gems: [{ nameSpec: 'NoId', skillId: '', gemId: '', level: 1, quality: 0, count: 1, support: false }] }
      ]
    }
  ],
  specs: [
    { title: 'Leveling', treeVersion: '', classId: '', ascendClassId: '', nodes: [4] },
    { title: 'Endgame', treeVersion: '', classId: '', ascendClassId: '', nodes: [4, 52, 55, 60, 999999] }
  ],
  items: [
    { id: 'i1', rarity: 'RARE', name: 'Gloom Crown', base: 'Ancestral Tiara', itemLevel: 80, levelReq: 0, mods: ['+88 to maximum Life', '+30% to Fire Resistance'] },
    { id: 'i2', rarity: 'UNIQUE', name: 'Astramentis', base: 'Stellar Amulet', itemLevel: 50, levelReq: 0, mods: ['+50 to all Attributes'] }
  ],
  slots: { Helmet: 'i1', Amulet: 'i2' },
  notes: 'A spark build.   Lots   of   spaces.'
}

const { build: b, report } = exportBuild(build)

console.log('Üst şema:')
check('name = Stormweaver Sorceress', b.name === 'Stormweaver Sorceress', b.name)
check('ascendancy = Sorceress1 (internal key)', b.ascendancy === 'Sorceress1', b.ascendancy)
check('ascendancy mapped flag', report.ascendancy.mappedToInternalKey === true)
check('description Class içerir', /Class: Sorceress\./.test(b.description ?? ''), b.description)
check('description notları sıkıştırır', /A spark build\. Lots of spaces\./.test(b.description ?? ''))

console.log('\nPassives (numeric node → GGG string id, endgame spec):')
check('passives dizi', Array.isArray(b.passives))
check('lightning14 var', b.passives!.includes('lightning14'))
check('zealots_oath var', b.passives!.includes('passive_keystone_zealots_oath'))
check('ailments38 + blind2 var', b.passives!.includes('ailments38') && b.passives!.includes('blind2'))
check('resolved = 4', report.passives.resolved === 4, report.passives.resolved)
check('unresolved = 1 (999999)', report.passives.unresolved === 1, report.passives.unresolved)
check('endgame spec kullanıldı (total 5)', report.passives.total === 5, report.passives.total)

console.log('\nSkills (son skillSet, slot-slot):')
check('1 skill (gemId’li)', b.skills!.length === 1, b.skills!.length)
check('skill id = SkillGemSpark', b.skills![0].id === 'Metadata/Items/Gems/SkillGemSpark', b.skills![0].id)
check('support = AddedLightning', b.skills![0].support_skills[0]?.id === 'Metadata/Items/Gems/SupportGemAddedLightning')
check('level_interval [0,100]', JSON.stringify(b.skills![0].level_interval) === '[0,100]')
check('gemId’siz grup atlandı (omitted=1)', report.skills.omitted === 1, report.skills.omitted)

console.log('\nItems (slot → inventory_id, mod metni):')
const helm = b.items!.find((i) => i.inventory_id === 'Helm')!
const amu = b.items!.find((i) => i.inventory_id === 'Amulet')!
check('Helmet → Helm', !!helm)
check('Helm additional_text mod içerir', /maximum Life/.test(helm.additional_text ?? ''), helm.additional_text)
check('Helm rare etiketi', /rare: Gloom Crown/.test(helm.additional_text ?? ''))
check('Amulet unique_name', amu.unique_name === 'Astramentis', amu.unique_name)
check('item slot_x/y = 0', helm.slot_x === 0 && helm.slot_y === 0)

console.log('\nMeta gem + dosya adı:')
check('metaGemSupported = false', report.metaGemSupported === false)
check('meta gem notu var', report.notes.some((n) => /Meta gem/i.test(n)))
check('dosya adı', buildFileName('Stormweaver Sorceress') === 'Stormweaver_Sorceress.build', buildFileName('Stormweaver Sorceress'))

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
