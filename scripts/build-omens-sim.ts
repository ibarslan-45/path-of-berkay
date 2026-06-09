/**
 * build-omens-sim.ts
 * ----------------------------------------------------------------------------
 * Craft simülatörü OMEN desteği (Faz 4c) -> src/data/omens_sim.json.
 * currency.json'daki craft omen'lerini (bir sonraki currency'nin davranışını değiştirenler)
 * alır; her birini {op, behavior} ile eşler (desc-doğrulı küratör). Waystone/map omen'leri
 * (Chaotic*) item-craft DEĞİL → mappable:false. İki dilli temiz etki açıklaması.
 *
 * Çalıştırma:  npm run build:omens-sim
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'src', 'data')

type OmenOp = 'exalt' | 'regal' | 'chaos' | 'vaal'
type Behavior = 'sinistral' | 'dextral' | 'greater' | 'homogenising' | 'whittling' | 'corruption'
interface OmenMap {
  op: OmenOp
  behavior: Behavior
  effect_en: string
  effect_tr: string
}
// Omen adı -> {op, behavior, etki} (desc-doğrulı küratör)
const OMEN_MAP: Record<string, OmenMap> = {
  'Omen of Sinistral Exaltation': { op: 'exalt', behavior: 'sinistral', effect_en: 'Exalt: adds only a Prefix', effect_tr: 'Exalt: yalnız Önek ekler' },
  'Omen of Dextral Exaltation': { op: 'exalt', behavior: 'dextral', effect_en: 'Exalt: adds only a Suffix', effect_tr: 'Exalt: yalnız Sonek ekler' },
  'Omen of Greater Exaltation': { op: 'exalt', behavior: 'greater', effect_en: 'Exalt: adds TWO modifiers', effect_tr: 'Exalt: İKİ mod ekler' },
  'Omen of Homogenising Exaltation': { op: 'exalt', behavior: 'homogenising', effect_en: 'Exalt: adds a Modifier of the same type as an existing one', effect_tr: 'Exalt: mevcutla aynı türde mod ekler' },
  'Omen of Sinistral Coronation': { op: 'regal', behavior: 'sinistral', effect_en: 'Regal: adds only a Prefix', effect_tr: 'Regal: yalnız Önek ekler' },
  'Omen of Dextral Coronation': { op: 'regal', behavior: 'dextral', effect_en: 'Regal: adds only a Suffix', effect_tr: 'Regal: yalnız Sonek ekler' },
  'Omen of Homogenising Coronation': { op: 'regal', behavior: 'homogenising', effect_en: 'Regal: adds a Modifier of the same type as an existing one', effect_tr: 'Regal: mevcutla aynı türde mod ekler' },
  'Omen of Sinistral Erasure': { op: 'chaos', behavior: 'sinistral', effect_en: 'Chaos: removes only a Prefix', effect_tr: 'Chaos: yalnız Önek kaldırır' },
  'Omen of Dextral Erasure': { op: 'chaos', behavior: 'dextral', effect_en: 'Chaos: removes only a Suffix', effect_tr: 'Chaos: yalnız Sonek kaldırır' },
  'Omen of Whittling': { op: 'chaos', behavior: 'whittling', effect_en: 'Chaos: removes the lowest-tier modifier', effect_tr: 'Chaos: en düşük tier mod’u kaldırır' },
  'Omen of Corruption': { op: 'vaal', behavior: 'corruption', effect_en: 'Vaal: always changes (no "no effect")', effect_tr: 'Vaal: her zaman değişir ("etki yok" çıkmaz)' }
}
// Item-craft DEĞİL (Waystone/map) -> mappable:false
const OUT_OF_SCOPE = /Chaotic (Effectiveness|Monsters|Quantity|Rarity)|Catalysing/i

interface CurRec {
  en: string
  tr: string
  subtype: string
  desc_en?: string
  icon?: string | null
}
interface OmenSim {
  id: string
  en: string
  tr: string
  op: OmenOp | ''
  behavior: Behavior | ''
  effect_en: string
  effect_tr: string
  mappable: boolean
  reason: string
  icon: string | null
}

function main(): void {
  const cur = JSON.parse(readFileSync(join(dataDir, 'currency.json'), 'utf-8')) as { records?: CurRec[] } | CurRec[]
  const recs = (cur as { records?: CurRec[] }).records ?? (cur as CurRec[])
  const omens = recs.filter((r) => r.subtype === 'omen')
  // sadece craft-ilgili (next-orb davranışı) omen'ler
  const craft = omens.filter((o) => /your next (Chaos|Exalted|Regal|Vaal) Orb/i.test(o.desc_en || ''))

  const out: OmenSim[] = []
  for (const o of craft) {
    const map = OMEN_MAP[o.en]
    let mappable = false
    let reason = ''
    if (map) mappable = true
    else if (OUT_OF_SCOPE.test(o.en)) reason = 'Waystone/map omen’i (item-craft değil)'
    else reason = 'Davranış haritada yok (doğrulanmadı)'
    // TR kelime sırası düzelt: "Alâmeti Dextral Exaltation" -> "Dextral Exaltation Alâmeti"
    const trClean = (o.tr || '').replace(/^Alâmeti\s+(.+)$/, '$1 Alâmeti')
    out.push({
      id: o.en.replace(/\s+/g, '_').toLowerCase(),
      en: o.en,
      tr: trClean,
      op: map?.op ?? '',
      behavior: map?.behavior ?? '',
      effect_en: map?.effect_en ?? '',
      effect_tr: map?.effect_tr ?? '',
      mappable,
      reason,
      icon: o.icon ?? null
    })
  }

  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    join(dataDir, 'omens_sim.json'),
    JSON.stringify({ meta: { game_version: '0.5.0', source: 'currency.json desc + küratör davranış map', note: 'omen bir sonraki ilgili currency’nin davranışını değiştirir, sonra tükenir' }, omens: out }, null, 1) + '\n',
    'utf-8'
  )

  const mapped = out.filter((o) => o.mappable)
  const byOp: Record<string, number> = {}
  for (const o of mapped) byOp[o.op] = (byOp[o.op] ?? 0) + 1
  console.log('Yazıldı -> omens_sim.json')
  console.log(`  craft-ilgili omen: ${out.length}`)
  console.log(`  EŞLEŞTİ (mappable): ${mapped.length}`)
  console.log(`  EŞLEŞMEDİ: ${out.length - mapped.length}  (${out.filter((o) => !o.mappable).map((o) => o.en).join(', ')})`)
  console.log(`  currency'ye göre: ${Object.entries(byOp).map(([k, v]) => k + ':' + v).join(', ')}`)
  console.log(`  iki dilli ad (tr dolu): ${out.filter((o) => o.tr).length}/${out.length}`)
}

main()
