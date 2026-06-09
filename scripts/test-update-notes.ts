/**
 * test-update-notes.ts — güncelleme notu normalize + sürüm karşılaştırma birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-update-notes.ts
 */
import { parseChangelog, notesForVersion, normalizeUpdaterNotes, compareVersions, isNewer } from '../src/main/update-notes'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

console.log('Sürüm karşılaştırma:')
check('0.14.0 > 0.13.1', compareVersions('0.14.0', '0.13.1') === 1)
check('0.13.1 < 0.13.2', compareVersions('0.13.1', '0.13.2') === -1)
check('eşit = 0', compareVersions('1.2.3', '1.2.3') === 0)
check('v ön-eki temizlenir', compareVersions('v0.14.0', '0.14.0') === 0)
check('farklı uzunluk (1.2 vs 1.2.0)', compareVersions('1.2', '1.2.0') === 0)
check('isNewer 0.14.0 vs 0.13.1', isNewer('0.14.0', '0.13.1') === true)
check('isNewer aynı = false', isNewer('0.13.1', '0.13.1') === false)
check('isNewer eski = false', isNewer('0.13.0', '0.13.1') === false)

console.log('\nchangelog.json — MAP şekli:')
const mapData = {
  '0.14.0': ['Auto-update eklendi', 'İletişim bölümü'],
  '0.13.1': ['Çok dilli kurulum'],
  '0.13.0': 'Lisans sistemi<br>NSIS paketleme'
}
const entries = parseChangelog(mapData)
check('3 entry', entries.length === 3, entries.length)
check('sürüme göre azalan (ilk 0.14.0)', entries[0].version === '0.14.0', entries[0].version)
check('0.14.0 notları 2 madde', entries[0].notes.length === 2)
check('html string → satırlara bölündü', entries[2].notes.length === 2, entries[2].notes)
check('notesForVersion(0.14.0)', notesForVersion(mapData, '0.14.0').includes('Auto-update eklendi'))
check('notesForVersion(v0.13.1) v-prefix', notesForVersion(mapData, 'v0.13.1')[0] === 'Çok dilli kurulum')
check('notesForVersion(yok) → boş', notesForVersion(mapData, '9.9.9').length === 0)

console.log('\nchangelog.json — DİZİ şekli:')
const arrData = [
  { version: '0.14.0', date: '2026-06-09', notes: ['x', 'y'] },
  { version: 'v0.13.1', notes: 'tek<br>iki' }
]
const ae = parseChangelog(arrData)
check('2 entry', ae.length === 2)
check('date korunur', ae[0].date === '2026-06-09')
check('dizi-içi html string bölündü', ae.find((e) => e.version === '0.13.1')?.notes.length === 2)

console.log('\nelectron-updater releaseNotes normalize:')
check('string HTML → satırlar', normalizeUpdaterNotes('<ul><li>Bir</li><li>İki</li></ul>').length === 2)
check('dizi [{version,note}] → satırlar', normalizeUpdaterNotes([{ version: '0.14.0', note: 'a<br>b' }]).length === 2)
check('null → boş', normalizeUpdaterNotes(null).length === 0)
check('düz metin satırları', normalizeUpdaterNotes('Tek satır').length === 1)

console.log('\nHatalı/boş giriş (çökme yok):')
check('null changelog → []', parseChangelog(null).length === 0)
check('sayı changelog → []', parseChangelog(42 as unknown).length === 0)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
