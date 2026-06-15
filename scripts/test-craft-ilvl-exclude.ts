/**
 * test-craft-ilvl-exclude.ts — 0.19.6: gereken ilvl (tier→ilvl) + "bende yok" hariç tutma (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-craft-ilvl-exclude.ts
 */
import {
  SIM_BASES,
  SIM_MODS,
  requiredIlvlForTier,
  modAtTier,
  evaluateTarget,
  groupChances,
  makeItem,
  type SimBase,
  type TargetEntry
} from '../src/renderer/src/lib/craft-sim'
import { planCraft, enumerateActions } from '../src/renderer/src/lib/craft-advisor'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}

const ring = SIM_BASES.find((b) => b.en === 'Sapphire Ring') as SimBase
const bow = SIM_BASES.find((b) => b.en === 'Cultist Bow') as SimBase
check('test base’leri var', !!ring && !!bow)

console.log('\n#2 — gereken item level (tier → ilvl):')
// IncreasedLife yüzük prefix grubu
const lifeFam = SIM_MODS.filter((m) => m.group === 'IncreasedLife' && m.affix === 'prefix').sort((a, b) => b.ilvl - a.ilvl)
check('IncreasedLife ailesi var', lifeFam.length > 0, lifeFam.length)
const t1 = requiredIlvlForTier('IncreasedLife', 'prefix', 1)
const t1mod = modAtTier('IncreasedLife', 'prefix', 1)
check('T1 reqIlvl = en yüksek ilvl mod', t1 != null && t1 === lifeFam[0].ilvl, { t1, exp: lifeFam[0].ilvl })
const tLast = requiredIlvlForTier('IncreasedLife', 'prefix', lifeFam.length)
check('en düşük tier reqIlvl ≤ T1 reqIlvl', tLast != null && t1 != null && tLast <= t1, { tLast, t1 })
check('modAtTier(1) = aile[0]', t1mod?.id === lifeFam[0].id)
check('olmayan tier → null', requiredIlvlForTier('IncreasedLife', 'prefix', 999) === null)

console.log('\n#2 — evaluateTarget satırına reqIlvl yazılır:')
const lowItem = makeItem(ring, 1) // ilvl 1
const tg: TargetEntry[] = [{ group: 'IncreasedLife', minTier: 1 }] // T1 ister
const st = evaluateTarget(lowItem, tg)
const row = st.rows[0]
check('row.reqIlvl dolu', row.reqIlvl != null, row.reqIlvl)
// reqIlvl = NORMAL rollamak için gereken ilvl (T1 Life = ilvl 80) → mevcut ilvl 1’den büyük
check('reqIlvl = T1 normal ilvl (80) > mevcut (1)', row.reqIlvl === 80, row.reqIlvl)
check('reqIlvl = requiredIlvlForTier ile tutarlı', row.reqIlvl === requiredIlvlForTier('IncreasedLife', 'prefix', 1), row.reqIlvl)
// daha düşük hedef tier → daha düşük gereken ilvl (T10 Life ≈ ilvl 33)
const st10 = evaluateTarget(lowItem, [{ group: 'IncreasedLife', minTier: 10 }])
check('T10 reqIlvl < T1 reqIlvl', (st10.rows[0].reqIlvl ?? 99) < (row.reqIlvl ?? 0), { t10: st10.rows[0].reqIlvl, t1: row.reqIlvl })

console.log('\n#2 — groupChances topTier + nextIlvl:')
const midItem = makeItem(ring, 50) // orta ilvl
const gc = groupChances(midItem, 'transmute')
const lifeG = [...gc.prefix, ...gc.suffix].find((g) => g.group === 'IncreasedLife')
check('IncreasedLife grubu şanslarda var', !!lifeG, gc.prefix.map((g) => g.group))
if (lifeG) {
  check('topTier mantıklı (≥1)', lifeG.topTier >= 1 && lifeG.topTier < 99, lifeG.topTier)
  // ilvl 50’de T1 yoksa nextIlvl bir üst tier’ı açan ilvl olmalı (> 50)
  check('nextIlvl ya null (T1) ya > mevcut ilvl', lifeG.nextIlvl === null || lifeG.nextIlvl > 50, lifeG.nextIlvl)
}

console.log('\n#3 — "bende yok": hariç tutulan malzeme plandan çıkar:')
// rare bow, exalt ile eklenebilir bir hedef → exalt önerilir; exalt hariç tutunca exalt ÇIKAR
const rare = makeItem(bow, 80)
rare.rarity = 'rare'
// hedef: normal-erişilebilir bir suffix (attack speed) — exalt ile eklenir
const tgtExalt: TargetEntry[] = [{ group: 'IncreasedAttackSpeed', minTier: 6 }]
const baseCands = enumerateActions(rare, tgtExalt)
const hasExalt = baseCands.some((c) => c.id === 'op:exalt')
check('normalde exalt aday', hasExalt, baseCands.map((c) => c.id).slice(0, 8))
const excl = new Set<string>(['op:exalt'])
const exCands = enumerateActions(rare, tgtExalt, excl)
check('hariç sonrası op:exalt YOK', !exCands.some((c) => c.id === 'op:exalt'))
check('hariç sonrası omen+exalt da YOK (Exalted Orb gerekir)', !exCands.some((c) => c.kind === 'omen-op' && c.op === 'exalt'), exCands.filter((c) => c.op === 'exalt').map((c) => c.id))
const planNo = planCraft(rare, tgtExalt, excl)
const planYes = planCraft(rare, tgtExalt)
check('exalt’sız plan farklı (exalt önermiyor)', planNo.steps.every((s) => s.action.op !== 'exalt' || s.action.kind === 'omen-op' ? s.action.op !== 'exalt' : true) && !planNo.steps.some((s) => s.action.id === 'op:exalt'), planNo.steps.map((s) => s.action.id))
check('exalt’lı (varsayılan) plan exalt içerebiliyordu', planYes.kind === 'plan' || planYes.kind === 'reached')

console.log(`\n${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
