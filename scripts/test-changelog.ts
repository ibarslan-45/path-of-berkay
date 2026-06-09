/**
 * test-changelog.ts — CHANGELOG.md parse + hafif markdown render birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-changelog.ts
 */
import { parseChangelogMd, notesForVersionMd, renderMarkdownLite } from '../src/renderer/src/lib/changelog'
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

const sample = `# Changelog

## 0.14.3
- **Ana Sayfa** eklendi
- "Neler değişti" ekranı

## 0.14.2
- Variant isimleri düzeldi
- .build import tam

## 0.14.1
- Web sitesi linki
`

console.log('parse:')
const entries = parseChangelogMd(sample)
check('3 sürüm girdisi', entries.length === 3, entries.length)
check('en üstteki 0.14.3', entries[0].version === '0.14.3', entries[0].version)
check('0.14.3 gövdesi Ana Sayfa içerir', /Ana Sayfa/.test(entries[0].body))
check('0.14.2 gövdesi .build içerir', entries[1].body.includes('.build import tam'))

console.log('\nnotesForVersionMd:')
check('0.14.2 notları', notesForVersionMd(sample, '0.14.2').includes('Variant isimleri'))
check('v-prefix toleranslı', notesForVersionMd(sample, 'v0.14.1').includes('Web sitesi'))
check('olmayan sürüm → boş', notesForVersionMd(sample, '9.9.9') === '')

console.log('\nrenderMarkdownLite:')
const h = renderMarkdownLite(entries[0].body)
check('liste <ul><li>', /<ul>\s*<li>/.test(h), h)
check('kalın **→<b>', /<b>Ana Sayfa<\/b>/.test(h), h)
check('### → <h4>', renderMarkdownLite('### Alt').includes('<h4>Alt</h4>'))
check('XSS kaçışı (<script> escape)', !renderMarkdownLite('- <script>x').includes('<script>'), renderMarkdownLite('- <script>x'))

console.log('\nGERÇEK CHANGELOG.md:')
const realMd = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8')
const real = parseChangelogMd(realMd)
check('gerçek changelog ≥1 sürüm', real.length >= 1, real.length)
check('gerçek ilk sürüm semver', /^\d+\.\d+\.\d+$/.test(real[0].version), real[0]?.version)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
