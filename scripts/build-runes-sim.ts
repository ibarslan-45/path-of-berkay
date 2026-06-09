/**
 * build-runes-sim.ts
 * ----------------------------------------------------------------------------
 * Craft simülatörü RUNE + SOUL CORE desteği (Faz 4e) -> src/data/runes_sim.json.
 * Soket'e takılan SABİT mod ekleyen rune/core'ları üretir. Etki currency.json desc'inde YOK
 * (sadece uygulanabilir class var) -> generic stat rune'larının (Adept/Resolve/Robust × tier)
 * etkisi WEB-DOĞRULI küratör; soul core etkileri çıkarılamadı -> "veri yok" (kısmi kapsam).
 * Legacy/Ancient/named rune'lar (unique-özel) DIŞLANIR.
 *
 * Çalıştırma:  npm run build:runes-sim
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'src', 'data')

// Generic stat rune etkileri (web-doğrulı: Robust→Str, Adept→Dex, Resolve→Int; +6/9/12).
const RUNE_EFFECTS: Record<string, { en: string; tr: string }> = {
  'Lesser Robust Rune': { en: '+6 to Strength', tr: 'Güce +6' },
  'Robust Rune': { en: '+9 to Strength', tr: 'Güce +9' },
  'Greater Robust Rune': { en: '+12 to Strength', tr: 'Güce +12' },
  'Lesser Adept Rune': { en: '+6 to Dexterity', tr: 'Çevikliğe +6' },
  'Adept Rune': { en: '+9 to Dexterity', tr: 'Çevikliğe +9' },
  'Greater Adept Rune': { en: '+12 to Dexterity', tr: 'Çevikliğe +12' },
  'Lesser Resolve Rune': { en: '+6 to Intelligence', tr: 'Zekâya +6' },
  'Resolve Rune': { en: '+9 to Intelligence', tr: 'Zekâya +9' },
  'Greater Resolve Rune': { en: '+12 to Intelligence', tr: 'Zekâya +12' }
}

interface CurRec {
  en: string
  tr: string
  subtype: string
  desc_en?: string
  icon?: string | null
}
interface RuneSim {
  id: string
  en: string
  tr: string
  kind: 'rune' | 'soul_core'
  classes: string // uygulanabilir item-class metni (desc'ten)
  effect_en: string
  effect_tr: string
  mappable: boolean
  reason: string
  icon: string | null
}

// desc'ten uygulanabilir class metni (ör. "Martial Weapon", "Body Armour or a Focus")
function parseClasses(desc: string): string {
  const m = desc.match(/Socket in (?:a |an |a pair of )?(.+?) to apply/i)
  return m ? m[1].trim() : 'any Equipment'
}

function main(): void {
  const cur = JSON.parse(readFileSync(join(dataDir, 'currency.json'), 'utf-8')) as { records?: CurRec[] } | CurRec[]
  const recs = (cur as { records?: CurRec[] }).records ?? (cur as CurRec[])
  const out: RuneSim[] = []

  // 1) Generic stat rune'ları (web-doğrulı etki)
  for (const [name, eff] of Object.entries(RUNE_EFFECTS)) {
    const r = recs.find((x) => x.en === name)
    if (!r) continue
    out.push({
      id: name.replace(/\s+/g, '_').toLowerCase(),
      en: name,
      tr: r.tr || name,
      kind: 'rune',
      classes: 'any Equipment',
      effect_en: eff.en,
      effect_tr: eff.tr,
      mappable: true,
      reason: '',
      icon: r.icon ?? null
    })
  }

  // 2) Soul Core'lar — class çıkar, etki "veri yok" (desc'te etki yok)
  const cores = recs.filter((r) => r.subtype === 'soul_core' && /Augment Socket/i.test(r.desc_en || ''))
  for (const c of cores) {
    out.push({
      id: c.en.replace(/\s+/g, '_').toLowerCase(),
      en: c.en,
      tr: c.tr || c.en,
      kind: 'soul_core',
      classes: parseClasses(c.desc_en || ''),
      effect_en: '',
      effect_tr: '',
      mappable: false,
      reason: 'Etki verisi yok (desc’te belirtilmemiş)',
      icon: c.icon ?? null
    })
  }

  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    join(dataDir, 'runes_sim.json'),
    JSON.stringify({ meta: { game_version: '0.5.0', source: 'currency.json + web-doğrulı generic rune etkileri', note: 'soket’e takılan sabit mod; generic stat rune’ları web-doğrulı, soul core etkileri veri yok' }, runes: out }, null, 1) + '\n',
    'utf-8'
  )

  const mapped = out.filter((r) => r.mappable)
  console.log('Yazıldı -> runes_sim.json')
  console.log(`  toplam (rune+core): ${out.length}`)
  console.log(`  EŞLEŞTİ (etki var): ${mapped.length}  — ${mapped.map((r) => r.en).join(', ')}`)
  console.log(`  veri yok (etki çıkarılamadı): ${out.length - mapped.length} soul core`)
  console.log(`  iki dilli ad: ${out.filter((r) => r.tr).length}/${out.length}`)
  console.log('  NOT: 100+ Legacy/Ancient/named rune (unique-özel) kapsam dışı bırakıldı.')
}

main()
