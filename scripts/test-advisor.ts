// Faz A doğrulama: bir state'te üretilen TÜM adaylar + gerçek değerleri.
// Çalıştır: npx tsx scripts/test-advisor.ts
import { CraftSession, findBase, targetableGroups, tierOf, tierCount } from '../src/renderer/src/lib/craft-sim'
import { enumerateActions } from '../src/renderer/src/lib/craft-advisor'

function show(label: string, baseEn: string, ilvl: number, seed: () => CraftSession): void {
  const s = seed()
  const item = s.item
  const present = new Set([...item.prefixes, ...item.suffixes].map((m) => m.mod.group))
  // hedef: item'da OLMAYAN, erişilebilir 1 prefix + 1 suffix grubu
  const base = findBase(baseEn)!
  const groups = targetableGroups(base, ilvl).filter((g) => !present.has(g.group) && g.bestTier <= g.tierMax)
  const pre = groups.find((g) => g.affix === 'prefix')
  const suf = groups.find((g) => g.affix === 'suffix')
  const targets = [pre, suf].filter(Boolean).map((g) => ({ group: g!.group, minTier: Math.max(1, g!.bestTier) }))

  console.log('\n' + '═'.repeat(78))
  console.log(label + '  —  ' + baseEn + ' (ilvl ' + ilvl + '), ' + item.rarity)
  console.log('─'.repeat(78))
  console.log('MEVCUT MODLAR:')
  for (const m of item.prefixes) console.log('  [Önek] T' + tierOf(m.mod) + '/' + tierCount(m.mod) + '  ' + m.en.replace(/\n/g, ' '))
  for (const m of item.suffixes) console.log('  [Sonek] T' + tierOf(m.mod) + '/' + tierCount(m.mod) + '  ' + m.en.replace(/\n/g, ' '))
  if (!item.prefixes.length && !item.suffixes.length) console.log('  (yok)')
  console.log('HEDEFLER:')
  for (const t of targets) {
    const g = groups.find((x) => x.group === t.group)!
    console.log('  ' + (g.affix === 'prefix' ? '[Önek]' : '[Sonek]') + ' ' + g.en.replace(/\n/g, ' ') + '  T' + t.minTier + '+')
  }

  const cands = enumerateActions(item, targets)
  console.log('─'.repeat(78))
  console.log('ADAYLAR (' + cands.length + ') — ilerleme% | maliyet | risk(kayıp%) | teknik')
  console.log('─'.repeat(78))
  for (const a of cands) {
    const prog = (a.progressChance * 100).toFixed(1).padStart(5) + '%'
    const cost = '£'.repeat(a.costRank).padEnd(5)
    const risk = a.risk.level === 'none' ? '   —      ' : (a.risk.level + ' ' + (a.risk.lossChance * 100).toFixed(0) + '%').padEnd(10)
    const tag = a.guaranteed ? ' [GARANTİ]' : a.helper ? ' [yardımcı]' : ''
    console.log(
      '  ' + prog + ' | ' + cost + ' | ' + risk + ' | ' + a.technique.padEnd(16) + ' | ' + a.labelEn + tag
    )
  }
}

// Senaryo 1: alchemy ile rastgele rare (dolu/yarı dolu) — tüm işlem yelpazesi
show('SENARYO 1: Rastgele Rare (alchemy)', 'Gold Ring', 80, () => {
  const s = new CraftSession(findBase('Gold Ring')!, 80)
  s.apply('alchemy')
  return s
})

// Senaryo 2: temiz Magic (1 mod) — alt→regal yolu görünsün
show('SENARYO 2: Magic, tek mod (transmute)', 'Gold Ring', 80, () => {
  const s = new CraftSession(findBase('Gold Ring')!, 80)
  s.apply('transmute')
  return s
})

// Senaryo 3: silah — quality (blacksmith) + vaal + fracture adayları
show('SENARYO 3: Silah Rare (alchemy)', 'Iron Sceptre', 80, () => {
  const b = findBase('Iron Sceptre')
  const s = new CraftSession(b ?? findBase('Gold Ring')!, 80)
  s.apply('alchemy')
  return s
})
