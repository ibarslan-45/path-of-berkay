/**
 * test-build-progress.ts — "elde ettim" işaretleme modeli birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-build-progress.ts
 */
import {
  buildSig,
  enumerateProgress,
  progressStats,
  slotProgressId,
  modProgressId,
  gemProgressId,
  nodeProgressId,
  slotModIds
} from '../src/renderer/src/lib/build-progress'
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
    { id: '1', title: '1-12', groups: [{ label: 'Main', mainActiveSkill: 1, gems: [gem('Lightning Arrow'), gem('Martial Tempo', true)] }] },
    { id: '2', title: 'Endgame', groups: [{ label: 'Main', mainActiveSkill: 1, gems: [gem('Lightning Arrow'), gem('Herald of Thunder'), gem('Martial Tempo', true)] }] }
  ],
  specs: [
    { title: '1-12', treeVersion: '2', classId: '', ascendClassId: '', nodes: [101, 102] },
    { title: 'Endgame', treeVersion: '2', classId: '', ascendClassId: '', nodes: [101, 102, 103, 104] }
  ],
  items: [
    { id: 'i1', rarity: 'RARE', name: 'Storm Coil', base: 'Sapphire Ring', itemLevel: 80, levelReq: 0, mods: ['+45 to maximum Life', '+30% to Cold Resistance'] },
    { id: 'i2', rarity: 'RARE', name: 'Doom Cap', base: 'Iron Helmet', itemLevel: 80, levelReq: 0, mods: ['+60 to maximum Life'] }
  ],
  slots: { 'Ring 1': 'i1', Helmet: 'i2' },
  notes: ''
}

console.log('imza (buildSig):')
const sig = buildSig(build)
check('imza boş değil', !!sig, sig)
check('aynı build → aynı imza', sig === buildSig(build))
const build2 = { ...build, className: 'Witch' }
check('farklı build → farklı imza', sig !== buildSig(build2))
check('null → boş imza', buildSig(null) === '')

console.log('\nstage 0 enumerate:')
const m0 = enumerateProgress(build, 0)
check('imza eşleşir', m0.sig === sig)
const slots0 = m0.sections.find((s) => s.key === 'slots')!
check('2 slot', slots0.checks.length === 2, slots0.checks.length)
const mods0 = m0.sections.find((s) => s.key === 'mods')!
check('3 mod (2+1)', mods0.checks.length === 3, mods0.checks.length)
const gems0 = m0.sections.find((s) => s.key === 'gems')!
check('2 gem (1 aktif + 1 support)', gems0.checks.length === 2, gems0.checks.length)
const nodes0 = m0.sections.find((s) => s.key === 'nodes')!
check('2 node (stage 0 spec)', nodes0.checks.length === 2, nodes0.checks.length)
check('toplam = 2+3+2+2 = 9', m0.total === 9, m0.total)

console.log('\nstage 1 (endgame) enumerate:')
const m1 = enumerateProgress(build, 1)
check('endgame 4 node', m1.sections.find((s) => s.key === 'nodes')!.checks.length === 4)
check('endgame 3 gem', m1.sections.find((s) => s.key === 'gems')!.checks.length === 3)

console.log('\nid kararlılığı + benzersizlik:')
check('slot id kararlı', slotProgressId(sig, 'Ring 1') === slotProgressId(sig, 'Ring 1'))
check('mod id kararlı', modProgressId(sig, 'Ring 1', 0, '+45 to maximum Life') === modProgressId(sig, 'Ring 1', 0, '+45 to maximum Life'))
check('gem aktif≠support id', gemProgressId(sig, 'g0', false) !== gemProgressId(sig, 'g0', true))
// BİLEŞİK anahtar: aynı isimli gem farklı GRUPLARDA çakışmamalı (kritik bug — bağlı checkbox)
check(
  'aynı gem farklı grup → farklı id',
  gemProgressId(sig, 'g0', true, 0, 'Elemental Armament') !== gemProgressId(sig, 'g1', true, 0, 'Elemental Armament')
)
check(
  'aynı gem aynı grup aynı sıra → aynı id (kararlı)',
  gemProgressId(sig, 'g0', true, 0, 'Elemental Armament') === gemProgressId(sig, 'g0', true, 0, 'Elemental Armament')
)
check('node id numeric', nodeProgressId(sig, 103) === `nd_${sig}_103`)
check('farklı slot → farklı mod id', modProgressId(sig, 'Ring 1', 0, 'X') !== modProgressId(sig, 'Helmet', 0, 'X'))
const allIds = [
  ...slots0.checks.map((c) => c.id),
  ...mods0.checks.map((c) => c.id),
  ...gems0.checks.map((c) => c.id),
  ...nodes0.checks.map((c) => c.id)
]
check('tüm id benzersiz', new Set(allIds).size === allIds.length, allIds.length)

console.log('\nslotModIds:')
const r1 = build.items[0]
const mids = slotModIds(sig, 'Ring 1', r1)
check('slot mod id sayısı = mod sayısı', mids.length === 2, mids.length)
check('slotModIds enumerate ile eşleşir', mids[0] === mods0.checks[0].id)

console.log('\nprogressStats:')
const progress: Record<string, boolean> = {}
progress[slots0.checks[0].id] = true
progress[mods0.checks[0].id] = true
progress[mods0.checks[1].id] = true
const st = progressStats(m0, progress)
check('done = 3', st.done === 3, st.done)
check('total = 9', st.total === 9, st.total)
check('slots perSection done=1', st.perSection.slots.done === 1, st.perSection.slots)
check('mods perSection done=2 total=3', st.perSection.mods.done === 2 && st.perSection.mods.total === 3, st.perSection.mods)
check('nodes perSection done=0', st.perSection.nodes.done === 0)

console.log('\nboş build:')
const empty = enumerateProgress(null, 0)
check('null build total 0', empty.total === 0)
check('null build sig boş', empty.sig === '')

console.log(`\n${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
