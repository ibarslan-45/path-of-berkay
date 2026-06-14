/**
 * test-rune-info.ts — rune slug/ham id → gerçek oyun adı + ikon + etki çözümü (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-rune-info.ts
 */
import { resolveRune } from '../src/renderer/src/lib/rune-info'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

console.log('rune çözümü (Mobalytics ham slug → gerçek ad):')
const r1 = resolveRune('Runelightninglesser')
check('Runelightninglesser → Lesser Storm Rune', r1?.en === 'Lesser Storm Rune', r1?.en)
check('ikonu var', !!r1?.icon && /currency\//i.test(r1!.icon!), r1?.icon)
check('etki metni dolu (desc_en)', !!r1?.descEn && /Lightning/i.test(r1!.descEn), r1?.descEn?.slice(0, 40))

const r2 = resolveRune('Runecoldlesser')
check('Runecoldlesser → Lesser Glacial Rune', r2?.en === 'Lesser Glacial Rune', r2?.en)

const r3 = resolveRune('Runeenhance')
check('Runeenhance → Iron Rune', r3?.en === 'Iron Rune', r3?.en)

console.log('\nbiçim toleransı:')
check('"(Rune) " öneki temizlenir', resolveRune('(Rune) Runelightninglesser')?.en === 'Lesser Storm Rune')
check('ham küçük slug çözülür', resolveRune('runecoldlesser')?.en === 'Lesser Glacial Rune')
check('soulcore- öneki temizlenir', resolveRune('soulcore-runeenhance')?.en === 'Iron Rune')
check('gerçek ad ile de eşleşir', resolveRune('Lesser Storm Rune')?.en === 'Lesser Storm Rune')

console.log('\nbulunamayan:')
check('bilinmeyen → null', resolveRune('totally-not-a-rune') === null)
check('boş → null', resolveRune('') === null)

console.log(`\n${pass} geçti, ${fail} kaldı`)
if (fail) process.exit(1)
