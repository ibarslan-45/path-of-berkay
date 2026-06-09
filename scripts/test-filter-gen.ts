/**
 * test-filter-gen.ts — build'e özel .filter üretimi birim testi (saf, ağsız).
 * Resmî GGG filter dili sözdizimi doğrulanır. Çalıştırma: npx tsx scripts/test-filter-gen.ts
 */
import { generateFilter, analyzeBuild, validateFilter, filterFileName, THEMES, type Strictness } from '../src/renderer/src/lib/filter-gen'
import type { PobBuild } from '../src/renderer/src/lib/pob'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

// Crossbow Mercenary, bir eşsiz + bir rare zırh tabanı.
const build: PobBuild = {
  className: 'Mercenary',
  ascendClassName: 'Witchhunter',
  level: 90,
  targetVersion: '',
  mainSocketGroup: 1,
  skillSets: [],
  specs: [],
  items: [
    { id: '1', rarity: 'RARE', name: 'Doom Shot', base: 'Advanced Tense Crossbow', itemLevel: 80, levelReq: 67, mods: [] },
    { id: '2', rarity: 'UNIQUE', name: 'Hyrri\'s Bite', base: 'Bone Quiver', itemLevel: 80, levelReq: 0, mods: [] },
    { id: '3', rarity: 'RARE', name: 'Storm Plate', base: 'Advanced Plate Vest', itemLevel: 78, levelReq: 65, mods: [] }
  ],
  slots: { 'Weapon 1': '1', Quiver: '2', 'Body Armour': '3' },
  notes: ''
}

console.log('Build çözümleme (analyzeBuild):')
const a = analyzeBuild(build)
check('className = Mercenary', a.className === 'Mercenary', a.className)
check('attribute Str+Dex', a.attributes.includes('Strength') && a.attributes.includes('Dexterity'), a.attributes)
check('silah sınıfı Crossbows', a.weaponClasses.includes('Crossbows'), a.weaponClasses)
check('eşsiz Hyrri\'s Bite', a.uniqueNames.includes('Hyrri\'s Bite'), a.uniqueNames)
check('takılı taban (rare crossbow)', a.equippedBases.includes('Advanced Tense Crossbow'), a.equippedBases)
check('eşsiz taban equippedBases\'te DEĞİL', !a.equippedBases.includes('Bone Quiver'), a.equippedBases)

console.log('\nÜretim (regular, amber, tüm efektler açık):')
const r = generateFilter(build, { strictness: 'regular', themeKey: 'amber', sound: true, minimapIcon: true, beam: true })
check('blockCount > 8', r.blockCount > 8, r.blockCount)
check('başlık yorum bloğu', r.text.startsWith('#'), r.text.slice(0, 20))
check('Show bloğu var', /\nShow\b/.test(r.text))
check('Hide bloğu var', /\nHide\b/.test(r.text))
check('build silah sınıfı (Crossbows) var', r.text.includes('"Crossbows"'))
check('Rarity Unique bloğu var', r.text.includes('Rarity Unique'))
check('takılı taban BaseType var', r.text.includes('Advanced Tense Crossbow'))
check('currency üst-kademe (Divine Orb) var', r.text.includes('Divine Orb'))
check('MinimapIcon var (açık)', r.text.includes('MinimapIcon '))
check('PlayEffect var (açık)', r.text.includes('PlayEffect '))
check('PlayAlertSound var (açık)', r.text.includes('PlayAlertSound '))
check('dosya adı .filter', r.filename.endsWith('.filter'), r.filename)

console.log('\nSözdizimi doğrulama (validateFilter):')
const v = validateFilter(r.text)
check('geçerli (0 hata)', v.ok, v.errors)
check('blok sayısı eşleşir', v.blocks === r.blockCount, { v: v.blocks, r: r.blockCount })

console.log('\nEfekt anahtarları (hepsi kapalı):')
const off = generateFilter(build, { strictness: 'regular', themeKey: 'amber', sound: false, minimapIcon: false, beam: false })
check('MinimapIcon YOK', !off.text.includes('MinimapIcon '))
check('PlayEffect YOK', !off.text.includes('PlayEffect '))
check('PlayAlertSound YOK', !off.text.includes('PlayAlertSound '))
check('renk yine var (SetTextColor)', off.text.includes('SetTextColor '))
check('kapalıyken de geçerli', validateFilter(off.text).ok, validateFilter(off.text).errors)

console.log('\nSıkılık kademesi (soft < strict Hide sayısı):')
function hideCount(s: Strictness): number {
  return (generateFilter(build, { strictness: s }).text.match(/\nHide\b/g) || []).length
}
const soft = hideCount('soft')
const strict = hideCount('strict')
const veryStrict = hideCount('very-strict')
check('soft en az Hide', soft <= strict, { soft, strict })
check('strict > soft Hide', strict > soft, { soft, strict })
check('very-strict ≥ strict', veryStrict >= strict, { strict, veryStrict })
check('very-strict ilvl eşiği (75)', generateFilter(build, { strictness: 'very-strict' }).text.includes('ItemLevel >= 75'))
check('soft catch-all Show', generateFilter(build, { strictness: 'soft' }).text.includes('Kalan her şey (soluk göster)'))
check('strict catch-all Hide', generateFilter(build, { strictness: 'strict' }).text.includes('Kalan her şey (strict: gizle)'))

console.log('\nTüm temalar geçerli sözdizimi üretir:')
for (const key of Object.keys(THEMES)) {
  const tr = generateFilter(build, { strictness: 'regular', themeKey: key })
  check(`tema "${key}" geçerli`, validateFilter(tr.text).ok, validateFilter(tr.text).errors.slice(0, 2))
}

console.log('\nBuild yok (genel filter, çökme yok):')
const none = generateFilter(null, { strictness: 'regular' })
check('build yok → yine geçerli', validateFilter(none.text).ok, validateFilter(none.text).errors.slice(0, 2))
check('build yok → not "doğrulanmalı"', none.analysis.notes.some((n) => /doğrulanmalı/.test(n)), none.analysis.notes)
check('build yok → silah sınıfı boş', none.analysis.weaponClasses.length === 0)

console.log('\nKenar durumlar:')
check('filterFileName sanitize', filterFileName('My Cool Build!! <x>') === 'My_Cool_Build_x.filter', filterFileName('My Cool Build!! <x>'))
check('bozuk filter yakalanır', !validateFilter('Show\n  BadKeyword 1 2 3').ok)
check('renk taşması yakalanır', !validateFilter('Show\n  SetTextColor 999 0 0').ok)
check('MinimapIcon bozuk yakalanır', !validateFilter('Show\n  MinimapIcon 5 Pink Blob').ok)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
