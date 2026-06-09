// danger-check.ts — Endgame tehlike kontrolü (Faz 8). SAF + test edilebilir.
// Bir waystone/map mod listesi + takip edilen build'in DEFANS profili → çapraz analiz →
// GÜVENLİ / DİKKAT / TEHLİKELİ + mod-başına gerekçe (neden senin build'in için tehlikeli).
//
// HEURİSTİK (garanti DEĞİL): mod metni TAM-string yerine ANAHTAR-KELİME kalıbıyla eşlenir
// (gerçek PoE2 metnini, sürüm farkı olsa da yakalar). Eşleşmeyen mod → "info" (bilinmeyen).
// DÜRÜSTLÜK: defans verisi yoksa "veri yok / doğrulanmalı"; uydurma yok.
// ToS: yalnız kullanıcının panosundan/elle yapıştırdığı metin; oyun/ağ/hafıza YOK.
import type { PobBuild } from './pob'

export type DangerLevel = 'safe' | 'caution' | 'danger'
export type Severity = 'danger' | 'caution' | 'info'

export interface Finding {
  mod: string // mod metni (ham)
  severity: Severity
  category: string
  tr: string // gerekçe (TR)
  en: string // gerekçe (EN)
}
export interface DangerResult {
  level: DangerLevel
  findings: Finding[]
  advice: Array<{ tr: string; en: string }> // "nelere dikkat et"
  profileKnown: boolean
  notes: string[] // "veri yok / doğrulanmalı"
  modCount: number
}

/** Build'in defans profili (PoB PlayerStat'larından). Bilinmeyen alan = null. */
export interface DefenseProfile {
  fireRes: number | null
  coldRes: number | null
  lightningRes: number | null
  chaosRes: number | null
  maxFireRes: number
  maxColdRes: number
  maxLightningRes: number
  life: number | null
  energyShield: number | null
  known: boolean // herhangi bir defans verisi var mı
}

// PoB PlayerStat aday adları (sürüme göre değişebilir → birden çok aday dene).
const STAT_KEYS: Record<keyof Omit<DefenseProfile, 'known' | 'maxFireRes' | 'maxColdRes' | 'maxLightningRes'>, string[]> = {
  fireRes: ['FireResist', 'FireResistTotal', 'FireResistance'],
  coldRes: ['ColdResist', 'ColdResistTotal', 'ColdResistance'],
  lightningRes: ['LightningResist', 'LightningResistTotal', 'LightningResistance'],
  chaosRes: ['ChaosResist', 'ChaosResistTotal', 'ChaosResistance'],
  life: ['Life', 'TotalLife', 'LifeUnreserved', 'MaxLife'],
  energyShield: ['EnergyShield', 'TotalEnergyShield', 'MaxEnergyShield']
}
const MAX_RES_KEYS: Record<'maxFireRes' | 'maxColdRes' | 'maxLightningRes', string[]> = {
  maxFireRes: ['FireResistMax', 'FireResistanceMax', 'MaxFireResist'],
  maxColdRes: ['ColdResistMax', 'ColdResistanceMax', 'MaxColdResist'],
  maxLightningRes: ['LightningResistMax', 'LightningResistanceMax', 'MaxLightningResist']
}
function pick(stats: Record<string, number>, keys: string[]): number | null {
  for (const k of keys) if (k in stats && Number.isFinite(stats[k])) return stats[k]
  return null
}

/** PobBuild → DefenseProfile. Stat yoksa known=false (UI "build defans verisi yok" der). */
export function deriveDefense(build: PobBuild | null): DefenseProfile {
  const stats = build?.stats ?? {}
  const p: DefenseProfile = {
    fireRes: pick(stats, STAT_KEYS.fireRes),
    coldRes: pick(stats, STAT_KEYS.coldRes),
    lightningRes: pick(stats, STAT_KEYS.lightningRes),
    chaosRes: pick(stats, STAT_KEYS.chaosRes),
    maxFireRes: pick(stats, MAX_RES_KEYS.maxFireRes) ?? 75,
    maxColdRes: pick(stats, MAX_RES_KEYS.maxColdRes) ?? 75,
    maxLightningRes: pick(stats, MAX_RES_KEYS.maxLightningRes) ?? 75,
    life: pick(stats, STAT_KEYS.life),
    energyShield: pick(stats, STAT_KEYS.energyShield),
    known: false
  }
  p.known = [p.fireRes, p.coldRes, p.lightningRes, p.chaosRes, p.life, p.energyShield].some((x) => x !== null)
  return p
}

// --- yardımcılar: belirli elementin res'i + cap'i ---
type Elem = 'Fire' | 'Cold' | 'Lightning' | 'Chaos'
function resOf(p: DefenseProfile, e: Elem): number | null {
  return e === 'Fire' ? p.fireRes : e === 'Cold' ? p.coldRes : e === 'Lightning' ? p.lightningRes : p.chaosRes
}
function maxOf(p: DefenseProfile, e: Elem): number {
  return e === 'Fire' ? p.maxFireRes : e === 'Cold' ? p.maxColdRes : e === 'Lightning' ? p.maxLightningRes : 30
}
const TR_EL: Record<Elem, string> = { Fire: 'Ateş', Cold: 'Soğuk', Lightning: 'Şimşek', Chaos: 'Kaos' }

/** Tek bir mod satırını kurallara karşı değerlendirir (eşleşmezse null). */
function evalMod(mod: string, p: DefenseProfile, notes: string[]): Finding | null {
  const m = mod.trim()
  if (!m) return null
  const cat = (c: string): string => c

  // 1) Ekstra elemental hasar — PoE2 iki ifade biçimi:
  //    "Damage as Extra Fire Damage" / "extra Fire Damage" / "extra Damage as Fire"
  const em = m.match(/as\s+extra\s+(Fire|Cold|Lightning|Chaos)|extra\s+(Fire|Cold|Lightning|Chaos)\s+damage|extra\s+(?:damage|dmg)\s+as\s+(Fire|Cold|Lightning|Chaos)/i)
  if (em) {
    const raw = (em[1] || em[2] || em[3]) as string
    const e = (raw[0].toUpperCase() + raw.slice(1).toLowerCase()) as Elem
    const r = resOf(p, e)
    if (r === null) {
      notes.push(`${e} res bilinmiyor — "${m}" etkisi doğrulanmalı.`)
      return { mod: m, severity: 'caution', category: cat('extra-as-element'), tr: `Canavarlar ekstra ${TR_EL[e]} hasarı veriyor; ${TR_EL[e]} direncin bilinmiyor (doğrulanmalı).`, en: `Monsters deal extra ${e} damage; your ${e} resistance is unknown (verify).` }
    }
    const max = maxOf(p, e)
    if (r >= max - 1) return { mod: m, severity: 'caution', category: cat('extra-as-element'), tr: `Ekstra ${TR_EL[e]} hasarı, ama ${TR_EL[e]} direncin cap'te (${r}%) — yönetilebilir, yine de dikkat.`, en: `Extra ${e} damage, but your ${e} resistance is capped (${r}%) — manageable, stay alert.` }
    if (r < 50) return { mod: m, severity: 'danger', category: cat('extra-as-element'), tr: `TEHLİKE: ekstra ${TR_EL[e]} hasarı ve ${TR_EL[e]} direncin düşük (${r}%). Bu harita seni hızla öldürebilir.`, en: `DANGER: extra ${e} damage and your ${e} resistance is low (${r}%). This map can kill you fast.` }
    return { mod: m, severity: 'caution', category: cat('extra-as-element'), tr: `Ekstra ${TR_EL[e]} hasarı; ${TR_EL[e]} direncin tam cap değil (${r}%) — dikkatli oyna.`, en: `Extra ${e} damage; your ${e} resistance isn't fully capped (${r}%) — play carefully.` }
  }

  // 2) maksimum direnç cezası (-X% to maximum Resistances)
  if (/(?:-\s*\d+%?\s*to\s+(?:all\s+)?maximum|reduced\s+maximum|lower(?:ed)?\s+maximum)\s+.*?resist/i.test(m) || /maximum\s+(?:player\s+)?resist\w*\s+is\s+\d+/i.test(m)) {
    const capped = [p.fireRes, p.coldRes, p.lightningRes].some((r) => r !== null && r >= 74)
    if (!p.known) return { mod: m, severity: 'danger', category: cat('max-res'), tr: 'Maksimum direnç düşürülüyor — defans verin yok (doğrulanmalı), bu mod genelde çok tehlikelidir.', en: 'Maximum resistances reduced — no defense data (verify); this mod is usually very dangerous.' }
    return capped
      ? { mod: m, severity: 'danger', category: cat('max-res'), tr: 'TEHLİKE: maksimum direncin düşüyor ve dirençlerin cap\'te — efektif cap altına inip elemental hasara açık hale geliyorsun.', en: 'DANGER: your maximum resistance drops while you are capped — your effective cap falls and elemental hits land harder.' }
      : { mod: m, severity: 'caution', category: cat('max-res'), tr: 'Maksimum direnç düşüyor; dirençlerin zaten cap altında, ekstra dikkat et.', en: 'Maximum resistance drops; you are already below cap, be extra careful.' }
  }

  // 3) penetrasyon (Monster Damage Penetrates X% Elemental Resistances)
  if (/penetrat\w*\s+\d+%?.*resist/i.test(m) || /monsters?\s+penetrate/i.test(m)) {
    return { mod: m, severity: p.known ? 'danger' : 'caution', category: cat('penetration'), tr: 'Canavar hasarı direncini deliyor — efektif direncin düşer, elemental vuruşlar çok daha sert gelir.', en: 'Monster damage penetrates your resistances — effective resistance drops, elemental hits hurt much more.' }
  }

  // 4) regen/recovery engeli
  if (/cannot\s+regenerat/i.test(m) || /no\s+life\s+regenerat/i.test(m) || /less\s+recovery\s+rate/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('recovery'), tr: 'İyileşme/regen kısıtlı — regen\'e dayalı bir build\'sen tehlikeli; flask/leech ile telafi et (build bağımlılığı doğrulanmalı).', en: 'Recovery/regen is restricted — dangerous if your build relies on regen; compensate with flasks/leech (build dependency: verify).' }
  }

  // 5) leech engeli
  if (/leech/i.test(m) && /(cannot|less|reduced|no)\b/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('leech'), tr: 'Can/ES emme (leech) kısıtlı — leech\'e dayalıysan ayakta kalman zorlaşır (doğrulanmalı).', en: 'Life/ES leech is restricted — survival is harder if you rely on leech (verify).' }
  }

  // 6) reflect (yansıma)
  if (/reflect/i.test(m)) {
    const phys = /physical/i.test(m)
    return { mod: m, severity: 'caution', category: cat('reflect'), tr: `Canavarlar ${phys ? 'fiziksel' : 'elemental'} hasarı yansıtıyor — yüksek hasar/hızlı vuruşlu build\'lerde kendini öldürebilirsin.`, en: `Monsters reflect ${phys ? 'physical' : 'elemental'} damage — high-DPS/fast-hitting builds can kill themselves.` }
  }

  // 7) oyuncuya artan hasar / canavar artan hasar
  if (/players?\s+take\s+\d+%?\s+increased\s+damage/i.test(m) || /monsters?\s+deal\s+\d+%?\s+increased\s+damage/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('inc-damage'), tr: 'Aldığın hasar artıyor — patlama hasarına (burst) karşı dikkatli ol.', en: 'Incoming damage is increased — watch for burst damage.' }
  }

  // 8) canavar crit
  if (/(monsters?.*critical|critical.*(chance|damage|bonus))/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('crit'), tr: 'Canavar kritik vuruşu artıyor — ani büyük vuruşlar gelebilir; defans/blok işine yarar.', en: 'Monster critical hits increased — expect sudden big hits; defenses/block help.' }
  }

  // 9) ek mermi
  if (/additional\s+projectile/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('projectiles'), tr: 'Canavarlar ek mermi atıyor — menzilli yoğun hasar; hareket halinde kal.', en: 'Monsters fire extra projectiles — heavy ranged damage; keep moving.' }
  }

  // 10) alan etkisi / zemin efektleri
  if (/increased\s+area\s+of\s+effect/i.test(m) || /\bground\b/i.test(m) || /patches?\s+of/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('aoe'), tr: 'Geniş alan / zemin efektleri — yer hasarından kaçmak için pozisyon al.', en: 'Larger area / ground effects — reposition to avoid ground damage.' }
  }

  // 11) canavar hız (attack/cast/move)
  if (/monsters?.*increased\s+(attack|cast|movement)\s+speed/i.test(m) || /increased\s+(attack and cast|attack|cast|movement)\s+speed/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('speed'), tr: 'Canavarlar daha hızlı — kaçmak/kite etmek zorlaşır.', en: 'Monsters are faster — harder to escape/kite.' }
  }

  // 12) curse on players
  if (/players?\s+are\s+cursed/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('curse'), tr: 'Oyuncular lanetli — direnç/defans düşebilir; lanet etkisini hesaba kat.', en: 'Players are cursed — resistances/defenses may drop; account for the curse.' }
  }

  // 13) cooldown recovery
  if (/reduced\s+cooldown\s+recovery/i.test(m)) {
    return { mod: m, severity: 'caution', category: cat('cooldown'), tr: 'Cooldown toparlanması yavaş — kaçış/defans yetenekleri daha seyrek; dikkatli oyna.', en: 'Cooldown recovery is slower — escape/defense skills come up less often; play carefully.' }
  }

  // 14) canavar tankiness (öldürücü değil, sadece yavaş)
  if (/monsters?\s+have\s+\d+%?\s+increased\s+(maximum\s+life|.*resistance)/i.test(m)) {
    return { mod: m, severity: 'info', category: cat('tanky'), tr: 'Canavarlar daha dayanıklı — öldürmesi yavaş ama ölümcül değil.', en: 'Monsters are tankier — slower to kill but not lethal.' }
  }

  return null
}

/** Map mod satırları + defans profili → tehlike sonucu. Saf. */
export function analyzeDanger(mods: string[], profile: DefenseProfile): DangerResult {
  const notes: string[] = []
  const findings: Finding[] = []
  for (const mod of mods) {
    const f = evalMod(mod, profile, notes)
    if (f) findings.push(f)
  }
  const hasDanger = findings.some((f) => f.severity === 'danger')
  const hasCaution = findings.some((f) => f.severity === 'caution')
  const level: DangerLevel = hasDanger ? 'danger' : hasCaution ? 'caution' : 'safe'

  if (!profile.known) notes.push('Build defans verisi yok (PoB PlayerStat eksik) — analiz kaba; dirence dayalı uyarılar doğrulanmalı.')

  const advice: Array<{ tr: string; en: string }> = []
  if (level === 'danger') advice.push({ tr: 'Bu haritayı yeniden roll etmeyi veya defans/flask hazır girmeyi düşün.', en: 'Consider re-rolling this map or entering with defenses/flasks ready.' })
  if (findings.some((f) => f.category === 'extra-as-element' || f.category === 'max-res' || f.category === 'penetration')) advice.push({ tr: 'Elemental tehdit yüksek — direnç cap\'ini ve maks direncini kontrol et.', en: 'High elemental threat — check your resistance caps and max resistances.' })
  if (findings.some((f) => f.category === 'recovery' || f.category === 'leech')) advice.push({ tr: 'İyileşme kısıtlı — flask şarjlarını ve alternatif recovery\'yi hazır tut.', en: 'Recovery is limited — keep flask charges and alternate recovery ready.' })
  if (findings.some((f) => f.category === 'reflect')) advice.push({ tr: 'Yansıma var — kendi hasar tipini ve leech\'ini gözden geçir.', en: 'Reflect present — review your damage type and leech.' })

  return { level, findings, advice, profileKnown: profile.known, notes, modCount: mods.length }
}

/** Kolaylık: parsed item mod satırları + build → tehlike sonucu. */
export function checkWaystone(modLines: string[], build: PobBuild | null): DangerResult {
  return analyzeDanger(modLines, deriveDefense(build))
}
