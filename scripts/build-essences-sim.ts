/**
 * build-essences-sim.ts
 * ----------------------------------------------------------------------------
 * Craft simülatörü ESSENCE desteği (Faz 2) için veri seti -> src/data/essences_sim.json.
 * currency.json'daki 82 essence'i tema+tier'a ayırır; web-DOĞRULI tema→mod-grubu haritasıyla
 * her essence'in garantilediği hedef grubu işaretler. Eşleşmeyen tema (the Abyss/Breach/Horror…)
 * "mappable:false" + sebep ile kalır (UYDURMA YOK).
 *
 * Yaklaşım (A): garantili mod, mevcut mods_sim weighted havuzundan seçilir (gerçek değerler;
 * bazı essence'lerin birebir değeri farklı olabilir — meta'da işaretli). Hedef gruplar mods_sim'de
 * var olduğu doğrulandı.
 *
 * Çalıştırma:  npm run build:essences-sim
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'src', 'data')

// Tema → hedef mod grubu (mods_sim group adları). weapon = silahta (genelde flat hasar),
// other = zırh/takı (genelde direnç). Aynıysa ikisi de aynı grup.
// KAYNAK: poewiki/fextralife/game8/mobalytics (2026-06 web doğrulaması).
interface ThemeMap {
  weapon?: string
  other?: string
  approx?: boolean // grup yaklaşık (tam karşılık belirsiz)
  special?: string // essence-özel (weight=0) grup; motor weight'siz force-add eder
  classes?: string[] // yalnız bu item-class kategorilerine uygulanır
  classGroups?: Record<string, string> // item-class kategorisine göre grup (Hysteria)
  source?: string // kaynak (data/web)
}
const THEME_MAP: Record<string, ThemeMap> = {
  'the Body': { weapon: 'IncreasedLife', other: 'IncreasedLife' },
  'the Mind': { weapon: 'IncreasedMana', other: 'IncreasedMana' },
  'the Infinite': { weapon: 'AllAttributes', other: 'AllAttributes' },
  Flames: { weapon: 'FireDamage', other: 'FireResistance' },
  Ice: { weapon: 'ColdDamage', other: 'ColdResistance' },
  Electricity: { weapon: 'LightningDamage', other: 'LightningResistance' },
  Ruin: { weapon: 'IncreasedChaosDamage', other: 'ChaosResistance' },
  Battle: { weapon: 'IncreasedAccuracy', other: 'IncreasedAccuracy' },
  Abrasion: { weapon: 'PhysicalDamage', other: 'PhysicalDamage' },
  Haste: { weapon: 'IncreasedAttackSpeed', other: 'IncreasedAttackSpeed' },
  Alacrity: { weapon: 'IncreasedCastSpeed', other: 'IncreasedCastSpeed' },
  Sorcery: { weapon: 'SpellDamage', other: 'SpellDamage' },
  Seeking: { weapon: 'CriticalStrikeChanceIncrease', other: 'CriticalStrikeChanceIncrease' },
  Command: { weapon: 'MinionDamage', other: 'MinionDamage' },
  Insulation: { weapon: 'FireResistance', other: 'FireResistance' },
  Grounding: { weapon: 'LightningResistance', other: 'LightningResistance' },
  Thawing: { weapon: 'ColdResistance', other: 'ColdResistance' },
  Opulence: { weapon: 'ItemFoundRarityIncrease', other: 'ItemFoundRarityIncrease' },
  Enhancement: { weapon: 'DefencesPercent', other: 'DefencesPercent', approx: true },
  // --- Özel/corrupted essence'ler (Adım 1.5, web + mods_sim weight=0 grup eşleşmesiyle kapatıldı) ---
  'the Abyss': {
    special: 'EssenceAbyss',
    source: 'mods_sim:EssenceAbyss + web (Mark of the Abyssal Lord)'
  },
  Insanity: {
    special: 'CorruptionIntertactions',
    classes: ['belt'],
    source: 'mods_sim + web (Belt: Corruption’da 2 Enchantment)'
  },
  Horror: {
    special: 'SoulCore',
    classes: ['gloves', 'boots'],
    source: 'mods_sim + web (Gloves/Boots: Socketed item etkisi)'
  },
  'the Breach': {
    special: 'LocalMaximumQuality',
    classes: ['ring', 'amulet'],
    source: 'mods_sim + web (Takı: +%20 Maximum Quality)'
  },
  Hysteria: {
    approx: true,
    classGroups: {
      helmet: 'IncreaseSocketedGemLevel',
      body_armour: 'Thorns',
      gloves: 'CriticalStrikeMultiplier',
      boots: 'MovementVelocity',
      ring: 'ManaRegeneration',
      amulet: 'DamageTakenGainedAsLife',
      belt: 'StunThreshold',
      shield: 'IncreasedShieldBlockPercentage',
      quiver: 'DamageWithWeaponTypeSkill',
      focus: 'EnergyShieldRegeneration'
    },
    source: 'web Game8 tablosu → regüler gruplar (yaklaşık değer)'
  }
}
// Hâlâ eşlenemeyen (uydurma yok): Delirium = skill tree’den rastgele Notable Passive ekler
// (item mod’u DEĞİL, pasif node) → mod sistemimizde temsil edilemez.
const UNMAPPED_REASON: Record<string, string> = {
  Delirium: 'Skill tree’den rastgele Notable Passive ekler (item mod’u değil — temsil edilemez)'
}

// tier → garantili mod için ilvl cap (yaklaşık; essence tier'ı mod tier'ını belirler)
const TIER_CAP: Record<string, number> = { Lesser: 30, normal: 45, Greater: 65, Perfect: 100 }

interface CurRec {
  en: string
  tr: string
  subtype: string
  desc_en?: string
  icon?: string | null
}
interface EssenceSim {
  id: string
  en: string
  tr: string
  theme: string
  tier: 'Lesser' | 'normal' | 'Greater' | 'Perfect'
  mode: 'magic_to_rare' | 'rare_remove_add'
  ilvlCap: number
  mappable: boolean
  reason: string
  source: string
  target: {
    weaponGroup: string
    otherGroup: string
    approx: boolean
    special: boolean // essence-özel weight=0 grup (force-add)
    classes: string[] // boşsa hepsi; doluysa yalnız bu kategoriler
    classGroups: Record<string, string> | null // Hysteria: kategori→grup
  } | null
  icon: string | null
}

/** "Lesser Essence of the Body" → { tier, theme }. */
function parseName(en: string): { tier: EssenceSim['tier']; theme: string } {
  let s = en.trim()
  let tier: EssenceSim['tier'] = 'normal'
  const m = s.match(/^(Lesser|Greater|Perfect)\s+/)
  if (m) {
    tier = m[1] as EssenceSim['tier']
    s = s.slice(m[0].length)
  }
  const theme = s.replace(/^Essence of\s+/i, '').replace(/^Essence\s+/i, '').trim()
  return { tier, theme }
}

function main(): void {
  const cur = JSON.parse(readFileSync(join(dataDir, 'currency.json'), 'utf-8')) as { records?: CurRec[] } | CurRec[]
  const recs = (cur as { records?: CurRec[] }).records ?? (cur as CurRec[])
  const sim = JSON.parse(readFileSync(join(dataDir, 'mods_sim.json'), 'utf-8')) as { mods: Array<{ group: string; weights: Array<{ weight: number }> }> }
  // mods_sim'de weight>0 mevcut grup seti (normal eşleme) + tüm gruplar (özel/weight=0 için)
  const rollableGroups = new Set<string>()
  const allGroups = new Set<string>()
  for (const m of sim.mods) {
    allGroups.add(m.group)
    if (m.weights.some((w) => w.weight > 0)) rollableGroups.add(m.group)
  }

  const essRecs = recs.filter((r) => r.subtype === 'essence')
  const out: EssenceSim[] = []
  const unmappedThemes = new Set<string>()
  for (const e of essRecs) {
    const { tier, theme } = parseName(e.en)
    const mode: EssenceSim['mode'] = /Removes a random modifier/i.test(e.desc_en || '') ? 'rare_remove_add' : 'magic_to_rare'
    const map = THEME_MAP[theme]
    let mappable = false
    let reason = ''
    let source = ''
    let target: EssenceSim['target'] = null
    if (map) {
      source = map.source ?? 'web tema→grup haritası'
      if (map.special) {
        // essence-özel weight=0 grup (the Abyss/Insanity/Horror/the Breach)
        if (allGroups.has(map.special)) {
          mappable = true
          target = { weaponGroup: map.special, otherGroup: map.special, approx: false, special: true, classes: map.classes ?? [], classGroups: null }
        } else {
          reason = `Özel grup mods_sim'de yok (${map.special})`
          unmappedThemes.add(theme)
        }
      } else if (map.classGroups) {
        // Hysteria: kategori→grup; hepsi rollable mı?
        const missing = Object.values(map.classGroups).filter((g) => !rollableGroups.has(g))
        if (missing.length === 0) {
          mappable = true
          target = { weaponGroup: '', otherGroup: '', approx: !!map.approx, special: false, classes: map.classes ?? [], classGroups: map.classGroups }
        } else {
          reason = `classGroups eksik: ${missing.join(',')}`
          unmappedThemes.add(theme)
        }
      } else {
        // normal tema: weapon/other rollable mı?
        const wOk = !!map.weapon && rollableGroups.has(map.weapon)
        const oOk = !!map.other && rollableGroups.has(map.other)
        if (wOk || oOk) {
          mappable = true
          target = { weaponGroup: wOk ? map.weapon! : '', otherGroup: oOk ? map.other! : '', approx: !!map.approx, special: false, classes: map.classes ?? [], classGroups: null }
        } else {
          reason = `Hedef grup mods_sim'de yok (${map.weapon}/${map.other})`
          unmappedThemes.add(theme)
        }
      }
    } else {
      reason = UNMAPPED_REASON[theme] ?? 'Tema haritada yok (doğrulanmadı)'
      unmappedThemes.add(theme)
    }
    out.push({
      id: e.en.replace(/\s+/g, '_').toLowerCase(),
      en: e.en,
      tr: e.tr,
      theme,
      tier,
      mode,
      ilvlCap: TIER_CAP[tier] ?? 45,
      mappable,
      reason,
      source,
      target,
      icon: e.icon ?? null
    })
  }

  const outObj = {
    meta: {
      game_version: '0.5.0',
      league: 'The Runes of Aldur',
      source: 'currency.json + web-doğrulı tema→grup haritası',
      note: 'Garantili mod mevcut mods_sim weighted havuzundan seçilir (gerçek değerler; bazı essence değerleri birebir farklı olabilir). tier→ilvlCap yaklaşıktır.',
      generated: new Date().toISOString().slice(0, 10)
    },
    essences: out
  }
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'essences_sim.json'), JSON.stringify(outObj, null, 1) + '\n', 'utf-8')

  // --- Rapor ---
  const mapped = out.filter((e) => e.mappable)
  const unmapped = out.filter((e) => !e.mappable)
  const trOk = out.filter((e) => e.tr && e.tr.trim()).length
  console.log(`Yazıldı -> essences_sim.json`)
  console.log(`  toplam essence: ${out.length}`)
  console.log(`  EŞLEŞTİ (mappable): ${mapped.length}`)
  console.log(`  EŞLEŞMEDİ (veri yok): ${unmapped.length}`)
  console.log(`  iki dilli ad (tr dolu): ${trOk}/${out.length}`)
  console.log(`  mode: magic_to_rare ${out.filter((e) => e.mode === 'magic_to_rare').length}, rare_remove_add ${out.filter((e) => e.mode === 'rare_remove_add').length}`)
  const byTheme: Record<string, number> = {}
  for (const e of mapped) byTheme[e.theme] = (byTheme[e.theme] ?? 0) + 1
  console.log(`  eşleşen tema sayısı: ${Object.keys(byTheme).length}`)
  console.log(`  EŞLEŞMEYEN temalar: ${[...unmappedThemes].join(', ') || '(yok)'}`)
  console.log(`  eşleşmeyen essence'ler: ${unmapped.map((e) => e.en).join(', ')}`)
  const approx = mapped.filter((e) => e.target?.approx)
  if (approx.length) console.log(`  YAKLAŞIK grup (işaretli): ${[...new Set(approx.map((e) => e.theme))].join(', ')}`)
}

main()
