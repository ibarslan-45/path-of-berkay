/**
 * build-catalysts-sim.ts
 * ----------------------------------------------------------------------------
 * Craft simülatörü CATALYST desteği (Faz 4b) -> src/data/catalysts_sim.json.
 * currency.json'daki 24 catalyst'i alır; desc'teki "enhances X modifiers" ifadesinden
 * mod TAG'ine eşler (küratör, desc-doğrulı). Tag mods_sim'de gerçekten var mı doğrular.
 * Refined catalyst'ler jewel içindir (kapsam dışı) -> target:'jewel' işaretlenir.
 *
 * Çalıştırma:  npm run build:catalysts-sim
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'src', 'data')

// "enhances X modifiers" -> mods_sim tag'i (küratör)
const TAG_MAP: Record<string, string> = {
  Attribute: 'attribute',
  'Armour, Evasion and Energy Shield': 'defences',
  Chaos: 'chaos',
  Lightning: 'lightning',
  Life: 'life',
  Mana: 'mana',
  Attack: 'attack',
  Caster: 'caster',
  Speed: 'speed',
  Cold: 'cold',
  Physical: 'physical',
  Fire: 'fire'
}

interface CurRec {
  en: string
  tr: string
  subtype: string
  desc_en?: string
  icon?: string | null
}
interface CatalystSim {
  id: string
  en: string
  tr: string
  type: string // güçlendirdiği modifier türü (EN)
  tag: string // mods_sim tag'i
  target: 'jewellery' | 'jewel'
  mappable: boolean
  reason: string
  icon: string | null
}

function main(): void {
  const cur = JSON.parse(readFileSync(join(dataDir, 'currency.json'), 'utf-8')) as { records?: CurRec[] } | CurRec[]
  const recs = (cur as { records?: CurRec[] }).records ?? (cur as CurRec[])
  const sim = JSON.parse(readFileSync(join(dataDir, 'mods_sim.json'), 'utf-8')) as { mods: Array<{ tags: string[] }> }
  const allTags = new Set<string>()
  for (const m of sim.mods) for (const t of m.tags) allTags.add(t)

  const cats = recs.filter((r) => r.subtype === 'catalyst')
  const out: CatalystSim[] = []
  for (const c of cats) {
    const m = (c.desc_en || '').match(/enhances (.+?) modifiers/i)
    const type = m ? m[1].trim() : ''
    const tag = TAG_MAP[type] ?? ''
    const target: 'jewellery' | 'jewel' = /jewel/i.test(c.desc_en || '') ? 'jewel' : 'jewellery'
    let mappable = false
    let reason = ''
    if (!tag) reason = `Tür haritada yok (${type || '?'})`
    else if (!allTags.has(tag)) reason = `Tag mods_sim'de yok (${tag})`
    else mappable = true
    out.push({
      id: c.en.replace(/\s+/g, '_').toLowerCase(),
      en: c.en,
      tr: c.tr,
      type,
      tag,
      target,
      mappable,
      reason,
      icon: c.icon ?? null
    })
  }

  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    join(dataDir, 'catalysts_sim.json'),
    JSON.stringify({ meta: { game_version: '0.5.0', source: 'currency.json desc + küratör tag map', note: 'tag-bazlı takı kalitesi; o tag\'li mod değerlerini %quality artırır' }, catalysts: out }, null, 1) + '\n',
    'utf-8'
  )

  const mapped = out.filter((c) => c.mappable)
  const jewellery = mapped.filter((c) => c.target === 'jewellery')
  const jewel = mapped.filter((c) => c.target === 'jewel')
  const trOk = out.filter((c) => c.tr && c.tr.trim()).length
  console.log('Yazıldı -> catalysts_sim.json')
  console.log(`  toplam catalyst: ${out.length}`)
  console.log(`  EŞLEŞTİ: ${mapped.length}  (takı/jewellery ${jewellery.length}, jewel ${jewel.length})`)
  console.log(`  EŞLEŞMEDİ: ${out.length - mapped.length}`)
  console.log(`  iki dilli (tr dolu): ${trOk}/${out.length}`)
  console.log(`  takı catalyst tag'leri: ${jewellery.map((c) => c.tag).join(', ')}`)
  if (out.length - mapped.length > 0) console.log(`  eşleşmeyenler: ${out.filter((c) => !c.mappable).map((c) => c.en + ' (' + c.reason + ')').join('; ')}`)
}

main()
