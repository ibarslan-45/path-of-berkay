/**
 * test-build-craft-seed.ts — build eşyası → Craft Simülatörü tohumu birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-build-craft-seed.ts
 */
import { craftSeedFromItem, matchSimBase } from '../src/renderer/src/lib/build-craft-seed'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

console.log('taban eşleme (matchSimBase):')
check('Sapphire Ring eşleşir', matchSimBase('Sapphire Ring')?.en === 'Sapphire Ring', matchSimBase('Sapphire Ring')?.en)
check('boş → null', matchSimBase('') === null)
check('uydurma taban → null', matchSimBase('Nonexistent Widget 9000') === null)

console.log('\nrare ring tohumu:')
const seed = craftSeedFromItem({
  base: 'Sapphire Ring',
  pureBase: 'Sapphire Ring',
  rarity: 'RARE',
  itemLevel: 82,
  mods: ['+45 to maximum Life', '+30% to Cold Resistance', '+25 to Intelligence']
})
check('baseEn = Sapphire Ring', seed.baseEn === 'Sapphire Ring', seed.baseEn)
check('itemClass = Ring', seed.itemClass === 'Ring', seed.itemClass)
check('ilvl = 82', seed.ilvl === 82, seed.ilvl)
check('3 hedef eşleşti', seed.targets.length === 3, seed.targets.length)
const life = seed.matched.find((m) => m.group === 'IncreasedLife')
check('Life → IncreasedLife grubu', !!life, seed.matched.map((m) => m.group))
check('Life tier mantıklı (+45 → T11 civarı)', !!life && life.tier >= 9 && life.tier <= 12, life?.tier)
check('Cold Resistance eşleşti', seed.matched.some((m) => m.group === 'ColdResistance'), seed.matched.map((m) => m.group))
check('Intelligence eşleşti', seed.matched.some((m) => m.group === 'Intelligence'))
check('eşleşmeyen yok', seed.unmatched.length === 0, seed.unmatched)
// targets minTier pozitif
check('targets minTier ≥ 1', seed.targets.every((t) => t.minTier >= 1))

console.log('\nyüksek roll daha iyi tier verir:')
const hi = craftSeedFromItem({ base: 'Sapphire Ring', pureBase: 'Sapphire Ring', itemLevel: 82, mods: ['+205 to maximum Life'] })
const hiLife = hi.matched.find((m) => m.group === 'IncreasedLife')
check('+205 Life → T1', !!hiLife && hiLife.tier === 1, hiLife?.tier)

console.log('\neşleşmeyen mod dürüst işaretlenir:')
const seed2 = craftSeedFromItem({
  base: 'Sapphire Ring',
  pureBase: 'Sapphire Ring',
  itemLevel: 80,
  mods: ['+45 to maximum Life', 'Completely Made Up Stat That Does Not Exist']
})
check('1 hedef eşleşti', seed2.targets.length === 1, seed2.targets.length)
check('uydurma stat unmatched', seed2.unmatched.some((u) => /Made Up/.test(u)), seed2.unmatched)

console.log('\nparantezli (rune/implicit) satır atlanır:')
const seed3 = craftSeedFromItem({
  base: 'Sapphire Ring',
  pureBase: 'Sapphire Ring',
  itemLevel: 80,
  mods: ['(Rune) Iron Rune', '+45 to maximum Life']
})
check('rune satırı hedef/unmatched değil', seed3.targets.length === 1 && seed3.unmatched.length === 0, { t: seed3.targets.length, u: seed3.unmatched })

console.log('\ntaban eşleşmezse modlar unmatched:')
const seed4 = craftSeedFromItem({ base: 'Mystery Base', pureBase: 'Mystery Base', mods: ['+45 to maximum Life'] })
check('baseEn null', seed4.baseEn === null)
check('hedef yok', seed4.targets.length === 0)
check('mod unmatched', seed4.unmatched.length === 1, seed4.unmatched)
check('ilvl varsayılan (80)', seed4.ilvl === 80, seed4.ilvl)

console.log(`\n${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
