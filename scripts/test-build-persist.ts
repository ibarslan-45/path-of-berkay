/**
 * test-build-persist.ts — build kalıcılığı snapshot kontratı (Part 1 regresyon koruması).
 * commitBuild → userData snapshot = { code, built: JSON.stringify(PobBuild), meta:{...,stage} }.
 * ensureBuild bu snapshot'tan (built varsa JSON.parse, yoksa code→importPob) + meta.stage'i geri yükler.
 * Burada AĞSIZ olarak serileştirme kontratını doğrularız: reconstruction build (PoB kodu YOK) +
 * stageSlots + set1/set2 node'ları + seçili aşama JSON round-trip'i AYNEN korunmalı.
 * Çalıştırma: npx tsx scripts/test-build-persist.ts
 */
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

// reconstruction (Mobalytics) gibi PoB KODU OLMAYAN build + variant-başına gear + weapon set node'ları
const build: PobBuild = {
  className: 'Witch',
  ascendClassName: 'Infernalist',
  level: 90,
  targetVersion: '2',
  mainSocketGroup: 1,
  skillSets: [
    { id: 'mb0', title: 'lvl 1-14', groups: [{ label: '', mainActiveSkill: 1, gems: [{ nameSpec: 'Fireball', skillId: '', gemId: '', level: 1, quality: 0, count: 1, support: false }] }] },
    { id: 'mb1', title: 'lvl 60+', groups: [{ label: '', mainActiveSkill: 1, gems: [{ nameSpec: 'Firestorm', skillId: '', gemId: '', level: 1, quality: 0, count: 1, support: false }] }] }
  ],
  specs: [
    { title: 'lvl 1-14', treeVersion: '', classId: '', ascendClassId: '', nodes: [1, 2, 3] },
    { title: 'lvl 60+', treeVersion: '', classId: '', ascendClassId: '', nodes: [1, 2, 3, 4, 5], set1Nodes: [4], set2Nodes: [5] }
  ],
  items: [{ id: 'mb1_0', rarity: 'RARE', name: 'X', base: 'Sapphire Ring', itemLevel: 0, levelReq: 0, mods: ['+45 to maximum Life'] }],
  slots: { 'Ring 1': 'mb1_0' },
  stageSlots: [{}, { 'Ring 1': 'mb1_0' }],
  notes: 'author notes'
}

// commitBuild'in yazdığı snapshot (main BuildStore'a giden payload)
const selectedStage = 1
const snapshot = {
  code: '', // reconstruction → PoB kodu yok
  built: JSON.stringify(build),
  meta: { importedFrom: 'mobalytics', info: { className: 'Witch', ascendClassName: 'Infernalist', level: 90 }, notes: 'author notes', stage: selectedStage }
}

// userData yazma/okuma simülasyonu (JSON dosyası round-trip)
const onDisk = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot

console.log('snapshot round-trip:')
check('built var (reconstruction kodu yok)', !!onDisk.built && onDisk.code === '')
const restored = JSON.parse(onDisk.built) as PobBuild
check('className korunur', restored.className === 'Witch')
check('2 skillSet', restored.skillSets.length === 2)
check('variant başlığı korunur (lvl 60+)', restored.skillSets[1].title === 'lvl 60+')
check('stageSlots korunur', !!restored.stageSlots && restored.stageSlots.length === 2, restored.stageSlots)
check('stageSlots[1] Ring 1 eşya', restored.stageSlots?.[1]['Ring 1'] === 'mb1_0')
check('set1Nodes korunur', JSON.stringify(restored.specs[1].set1Nodes) === '[4]', restored.specs[1].set1Nodes)
check('set2Nodes korunur', JSON.stringify(restored.specs[1].set2Nodes) === '[5]', restored.specs[1].set2Nodes)
check('ilk spec set node yok (undefined)', restored.specs[0].set1Nodes === undefined)

console.log('\nseçili aşama (variant) kalıcılığı:')
check('meta.stage = 1 korunur', onDisk.meta.stage === selectedStage, onDisk.meta.stage)
check('notlar korunur', restored.notes === 'author notes')

console.log('\nensureBuild seçim mantığı (built > code):')
// built varsa onu kullan; yoksa code→importPob (burada built var → built kullanılır)
const useBuilt = onDisk.built ? 'built' : onDisk.code ? 'code' : 'none'
check('built tercih edilir', useBuilt === 'built')
// kod yolu (PoB import) için: built null, code dolu → code kullanılır
const codeOnly = { code: 'POBCODE', built: null as string | null, meta: { stage: 0 } }
check('built yoksa code yolu', (codeOnly.built ? 'built' : codeOnly.code ? 'code' : 'none') === 'code')

console.log(`\n${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
