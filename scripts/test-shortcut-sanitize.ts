/**
 * test-shortcut-sanitize.ts — global kısayol sanitizer birim testi (saf, ağsız).
 * 0.17.4 KÖK NEDEN regresyon koruması: Ctrl+C ASLA global bağlanmamalı (sistem kopyalamasını engeller).
 * Çalıştırma: npx tsx scripts/test-shortcut-sanitize.ts
 */
import { sanitizeShortcut, isBindableShortcut, normAccel, FORBIDDEN_ACCELS } from '../src/main/shortcut-sanitize'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : ''))
  }
}

console.log('Ctrl+C ve türevleri yasak → fallback:')
check('CommandOrControl+C → Ctrl+D', sanitizeShortcut('CommandOrControl+C', 'CommandOrControl+D') === 'CommandOrControl+D')
check('Control+C → fallback', sanitizeShortcut('Control+C', 'CommandOrControl+D') === 'CommandOrControl+D')
check('Ctrl+C → fallback', sanitizeShortcut('Ctrl+C', 'CommandOrControl+D') === 'CommandOrControl+D')
check('ctrl+c (küçük) → fallback', sanitizeShortcut('ctrl+c', 'CommandOrControl+D') === 'CommandOrControl+D')
check('CmdOrCtrl+C boşluklu → fallback', sanitizeShortcut('Command Or Control + C', 'CommandOrControl+D') === 'CommandOrControl+D')
check('Ctrl+V yasak', sanitizeShortcut('CommandOrControl+V', 'CommandOrControl+D') === 'CommandOrControl+D')
check('Ctrl+X yasak', sanitizeShortcut('CommandOrControl+X', 'CommandOrControl+D') === 'CommandOrControl+D')

console.log('\nGeçerli accel aynen korunur:')
check('Ctrl+D korunur', sanitizeShortcut('CommandOrControl+D', 'CommandOrControl+D') === 'CommandOrControl+D')
check('Ctrl+E korunur', sanitizeShortcut('CommandOrControl+E', 'CommandOrControl+E') === 'CommandOrControl+E')
check('Alt+Q korunur', sanitizeShortcut('Alt+Q', 'CommandOrControl+D') === 'Alt+Q')
check('F8 korunur', sanitizeShortcut('F8', 'CommandOrControl+D') === 'F8')
check('Ctrl+Shift+C korunur (kopya değil)', sanitizeShortcut('CommandOrControl+Shift+C', 'CommandOrControl+D') === 'CommandOrControl+Shift+C')

console.log('\nBoş/geçersiz → fallback:')
check('boş string → fallback', sanitizeShortcut('', 'CommandOrControl+D') === 'CommandOrControl+D')
check('undefined → fallback', sanitizeShortcut(undefined, 'CommandOrControl+D') === 'CommandOrControl+D')
check('sadece boşluk → fallback', sanitizeShortcut('   ', 'CommandOrControl+E') === 'CommandOrControl+E')

console.log('\nisBindable / norm:')
check('Ctrl+C bağlanamaz', isBindableShortcut('CommandOrControl+C') === false)
check('Ctrl+D bağlanabilir', isBindableShortcut('CommandOrControl+D') === true)
check('boş bağlanamaz', isBindableShortcut('') === false)
check('norm CommandOrControl+C = ctrl+c', normAccel('CommandOrControl+C') === 'ctrl+c')
check('FORBIDDEN ctrl+c içerir', FORBIDDEN_ACCELS.has('ctrl+c'))

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
