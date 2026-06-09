/**
 * test-danger-check.ts — endgame tehlike kontrolü birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-danger-check.ts
 */
import { analyzeDanger, deriveDefense, checkWaystone, type DefenseProfile } from '../src/renderer/src/lib/danger-check'
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

// Defans profilleri
const capped: DefenseProfile = { fireRes: 75, coldRes: 75, lightningRes: 75, chaosRes: 30, maxFireRes: 75, maxColdRes: 75, maxLightningRes: 75, life: 4000, energyShield: 0, known: true }
const lowFire: DefenseProfile = { fireRes: 20, coldRes: 75, lightningRes: 75, chaosRes: -20, maxFireRes: 75, maxColdRes: 75, maxLightningRes: 75, life: 3000, energyShield: 0, known: true }
const unknown: DefenseProfile = { fireRes: null, coldRes: null, lightningRes: null, chaosRes: null, maxFireRes: 75, maxColdRes: 75, maxLightningRes: 75, life: null, energyShield: null, known: false }

console.log('Extra damage as Fire:')
let r = analyzeDanger(['Monsters deal 35% of their Physical Damage as Extra Fire Damage'], lowFire)
check('düşük fire res → TEHLİKELİ', r.level === 'danger', r.level)
check('finding danger severity', r.findings[0]?.severity === 'danger', r.findings[0])
check('gerekçe ateş içerir', /Ateş|Fire/.test(r.findings[0]?.tr + r.findings[0]?.en))

r = analyzeDanger(['Monsters deal 35% of their Physical Damage as Extra Fire Damage'], capped)
check('cap\'li fire res → DİKKAT', r.level === 'caution', r.level)

r = analyzeDanger(['Monsters deal extra Fire Damage'], unknown)
check('res bilinmiyor → DİKKAT + not', r.level === 'caution' && r.notes.some((n) => /doğrulanmalı/.test(n)), { lvl: r.level, notes: r.notes })

console.log('\nMaksimum direnç cezası:')
r = analyzeDanger(['Players have -8% to all maximum Elemental Resistances'], capped)
check('cap\'li + max res düşüş → TEHLİKELİ', r.level === 'danger', r.level)
r = analyzeDanger(['Players have -8% to all maximum Elemental Resistances'], unknown)
check('veri yok + max res → TEHLİKELİ (varsayılan)', r.level === 'danger', r.level)

console.log('\nPenetrasyon:')
r = analyzeDanger(['Monster Damage Penetrates 15% Elemental Resistances'], capped)
check('penetrasyon → TEHLİKELİ', r.level === 'danger', r.level)

console.log('\nRegen / Leech engeli:')
r = analyzeDanger(['Players cannot Regenerate Life, Mana, or Energy Shield'], capped)
check('cannot regenerate → DİKKAT', r.level === 'caution', r.level)
check('kategori recovery', r.findings[0]?.category === 'recovery', r.findings[0])
r = analyzeDanger(['Players have less Life and Energy Shield Leech'], capped)
check('less leech → DİKKAT', r.level === 'caution', r.level)

console.log('\nReflect:')
r = analyzeDanger(['Monsters reflect 18% of Physical Damage'], capped)
check('reflect → DİKKAT', r.level === 'caution', r.level)
check('reflect gerekçesi fiziksel', /fiziksel|physical/i.test(r.findings[0]?.tr + r.findings[0]?.en))

console.log('\nGüvenli (yalnız ödül/tanky mod):')
r = analyzeDanger(['Monsters have 40% increased maximum Life', '25% increased Quantity of Items found'], capped)
check('yalnız tanky/ödül → GÜVENLİ', r.level === 'safe', { lvl: r.level, f: r.findings })
check('tanky info severity', r.findings.find((f) => f.category === 'tanky')?.severity === 'info')

console.log('\nÇoklu mod → en kötü kazanır + advice:')
r = analyzeDanger([
  'Monsters deal 30% of their Physical Damage as Extra Fire Damage',
  'Players cannot Regenerate Life',
  'Monsters have 25% increased Movement Speed'
], lowFire)
check('genel seviye TEHLİKELİ', r.level === 'danger', r.level)
check('3 finding', r.findings.length === 3, r.findings.length)
check('advice var', r.advice.length > 0, r.advice)
check('elemental advice', r.advice.some((a) => /direnç|resistance/i.test(a.tr + a.en)))

console.log('\nBoş / eşleşmeyen:')
r = analyzeDanger([], capped)
check('boş → GÜVENLİ', r.level === 'safe' && r.modCount === 0)
r = analyzeDanger(['10% increased Pack size', 'Area contains a Shrine'], capped)
check('zararsız modlar → GÜVENLİ', r.level === 'safe', r.findings)

console.log('\nDefans profili türetme (deriveDefense):')
const build: PobBuild = {
  className: 'Sorceress', ascendClassName: '', level: 90, targetVersion: '', mainSocketGroup: 1,
  skillSets: [], specs: [], items: [], slots: {}, notes: '',
  stats: { FireResist: 76, ColdResist: 75, LightningResist: 75, ChaosResist: -30, Life: 3500, EnergyShield: 1200 }
}
const dp = deriveDefense(build)
check('fireRes 76', dp.fireRes === 76, dp.fireRes)
check('chaosRes -30', dp.chaosRes === -30, dp.chaosRes)
check('life 3500', dp.life === 3500)
check('ES 1200', dp.energyShield === 1200)
check('known true', dp.known)
check('maxFireRes default 75', dp.maxFireRes === 75)

const noStats = deriveDefense({ ...build, stats: undefined })
check('stats yok → known false', !noStats.known)
check('null build → known false', !deriveDefense(null).known)

console.log('\ncheckWaystone (build köprüsü):')
r = checkWaystone(['Monster Damage Penetrates 20% Elemental Resistances'], build)
check('build ile penetrasyon TEHLİKELİ', r.level === 'danger', r.level)
check('profileKnown true', r.profileKnown)
r = checkWaystone(['Monster Damage Penetrates 20% Elemental Resistances'], null)
check('build yok → not "defans verisi yok"', r.notes.some((n) => /defans verisi yok/.test(n)))

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
