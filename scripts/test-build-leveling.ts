/**
 * test-build-leveling.ts — build'e özel leveling/görev kontrol listesi birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-build-leveling.ts
 */
import { buildLevelingChecklist } from '../src/renderer/src/lib/build-leveling'
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

function gem(nameSpec: string, support = false): { nameSpec: string; skillId: string; gemId: string; level: number; quality: number; count: number; support: boolean } {
  return { nameSpec, skillId: '', gemId: '', level: 1, quality: 0, count: 1, support }
}

const build: PobBuild = {
  className: 'Ranger',
  ascendClassName: 'Deadeye',
  level: 90,
  targetVersion: '2',
  mainSocketGroup: 1,
  skillSets: [
    { id: '1', title: '1-12 Leveling', groups: [{ label: 'Main', mainActiveSkill: 1, gems: [gem('Lightning Arrow'), gem('Lightning Arrow Support', true)] }] },
    { id: '2', title: '13-40', groups: [{ label: 'Main', mainActiveSkill: 1, gems: [gem('Lightning Arrow'), gem('Herald of Thunder')] }] },
    { id: '3', title: 'Endgame', groups: [{ label: 'Main', mainActiveSkill: 1, gems: [gem('Lightning Arrow')] }] }
  ],
  specs: [],
  items: [],
  slots: {},
  notes: 'Welcome to the guide.\n- At Act 1 grab the +20 to maximum Life node.\n- Take "Increased Critical Strike Chance" passives.\n- General lore text that is not a leveling step.\nRespec at level 40.'
}

console.log('temel plan:')
const plan = buildLevelingChecklist(build, build.notes)
check('hasData true', plan.hasData)
check('3 aşama', plan.stages.length === 3, plan.stages.length)
check('ilk aşama level 1-12', plan.stages[0].level?.lo === 1 && plan.stages[0].level?.hi === 12, plan.stages[0].level)
check('ilk aşama act 1', plan.stages[0].act === 1, plan.stages[0].act)
check('endgame aşaması level null', plan.stages[2].level === null, plan.stages[2].level)
check('aktif beceri EN orijinal (Lightning Arrow)', plan.stages[0].skills.includes('Lightning Arrow'), plan.stages[0].skills)
check('support aktif sayılmaz', !plan.stages[0].skills.includes('Lightning Arrow Support'))
check('uncut gem önerisi var', plan.stages[0].uncut.some((u) => /Uncut Skill Gem/.test(u)), plan.stages[0].uncut)

console.log('\nyazar notları (leveling satırları):')
check('not adımları çıkarıldı', plan.notes.length >= 3, plan.notes.length)
const noteText = plan.notes.map((n) => n.text).join(' | ')
check('Act 1 satırı var', /Act 1/.test(noteText), noteText)
check('Respec satırı var', /Respec at level 40/.test(noteText))
// BUG #4: stat/term metni İNGİLİZCE orijinal kalmalı (çevrilmemeli)
check('+20 to maximum Life EN korunur', noteText.includes('+20 to maximum Life'), noteText)
check('stat metni "maksimum can"a çevrilmedi', !/maksimum can/i.test(noteText))
check('non-leveling lore satırı elendi', !/General lore text/.test(noteText))

console.log('\nid kararlılığı (ilerleme kalıcılığı):')
const plan2 = buildLevelingChecklist(build, build.notes)
check('aynı build → aynı id', plan.stages[0].id === plan2.stages[0].id, plan.stages[0].id)
check('id stage prefix', plan.stages[0].id.startsWith('st_'))
check('not id prefix', plan.notes[0].id.startsWith('nt_'))
const planOther = buildLevelingChecklist({ ...build, className: 'Witch' }, build.notes)
check('farklı sınıf → farklı id', planOther.stages[0].id !== plan.stages[0].id)

console.log('\nboş/null:')
const empty = buildLevelingChecklist(null)
check('build yok → hasData false', !empty.hasData)
check('build yok → 0 aşama', empty.stages.length === 0)
const noNotes = buildLevelingChecklist(build)
check('not yok → 0 not adımı', noNotes.notes.length === 0)
check('not yok ama aşama var → hasData true', noNotes.hasData)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
