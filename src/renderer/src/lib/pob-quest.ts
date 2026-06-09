// Build aşamasından quest "uncut gem" önerisi üretir.
//
// MODEL (PoE2 gerçeği): Quest'ler SABİT bir beceri vermez — "Uncut Skill / Support / Spirit Gem
// (Level N)" verir; oyuncu istediği beceriyi bu uncut gem'den oyar. areas.json'daki doğrulanmış
// reward_en alanlarından bu ödülleri çıkarıyoruz. Bir build aşamasının becerilerini oymak için
// gereken uncut gem seviyesini, o aşamanın karakter-seviyesi → kampanya act'i eşlemesiyle buluyoruz.
//
// DOĞRULANMALI: karakter seviyesi → act eşlemesi YAKLAŞIK (eşikler aşağıda). PoB'daki gem seviyeleri
// leveling için güvenilmez (çoğu Lv20/Lv1) — bu yüzden aşama başlığındaki karakter seviyesini baz alıyoruz.
import areasData from '../../../data/areas.json'

// Yapısal minimum: hem MatchedGem hem ham PobGem geçer (build-leveling raw groups'tan besler).
export interface QuestGem {
  nameSpec: string
  support: boolean
  tr?: string | null
}

interface AreaRec {
  id: string
  en: string
  tr: string
  act: string
  act_order: number
  reward_en: string
}
function records<T>(d: unknown): T[] {
  const o = d as { records?: T[] }
  return o.records ?? (d as T[])
}
const areas = records<AreaRec>(areasData)

type Kind = 'Skill' | 'Support' | 'Spirit'
export interface UncutReward {
  kind: Kind
  gemLevel: number
  en: string
  tr: string
  act: number
  actRaw: string
}

// areas.json'dan tüm uncut gem ödüllerini çıkar (doğrulanmış veri).
const uncut: UncutReward[] = []
for (const a of areas) {
  const re = /Uncut (Skill|Support|Spirit) Gem \(Level (\d+)\)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(a.reward_en || ''))) {
    const act = parseInt(a.act, 10)
    uncut.push({
      kind: m[1] as Kind,
      gemLevel: parseInt(m[2], 10),
      en: a.en,
      tr: a.tr,
      act: Number.isFinite(act) ? act : 99, // interlude/endgame -> en sona
      actRaw: a.act
    })
  }
}

/** Karakter seviyesi → yaklaşık kampanya act'i (YAKLAŞIK — doğrulanmalı). */
function levelToAct(hi: number): number {
  if (hi <= 12) return 1
  if (hi <= 21) return 2
  if (hi <= 30) return 3
  return 4
}

/** Verilen tür için, act ≤ maxAct olan en yüksek seviyeli uncut ödülü seç. */
function pickReward(kind: Kind, maxAct: number): { gemLevel: number; areas: UncutReward[] } | null {
  const cand = uncut.filter((u) => u.kind === kind && u.act <= maxAct)
  if (!cand.length) return null
  const maxLvl = Math.max(...cand.map((u) => u.gemLevel))
  const at = cand.filter((u) => u.gemLevel === maxLvl).sort((a, b) => a.act - b.act)
  return { gemLevel: maxLvl, areas: at }
}

export interface NamePair {
  en: string
  tr: string | null
}
export interface QuestSuggestion {
  stageTitle: string
  level: { lo: number; hi: number } | null
  act: number | null
  endgame: boolean
  activeSkills: NamePair[]
  supportCount: number
  usesSpirit: boolean
  skill: { gemLevel: number; areas: UncutReward[] } | null
  support: { gemLevel: number; areas: UncutReward[] } | null
  spirit: { gemLevel: number; areas: UncutReward[] } | null
  /** Support uncut verisi yalnızca erken act'leri kapsıyorsa true. */
  supportDataLimited: boolean
}

/** Aşama başlığından karakter seviyesi aralığını çöz ("1-5","6-12","13 (...)","22"). */
function parseLevel(title: string): { lo: number; hi: number } | null {
  const m = (title || '').match(/^\s*(\d+)\s*(?:[-–]\s*(\d+))?/)
  if (!m) return null
  const lo = parseInt(m[1], 10)
  const hi = m[2] ? parseInt(m[2], 10) : lo
  return { lo, hi }
}

/**
 * Karakter seviyesine göre uygun aşama indexini bul. Aşama başlıklarının baştaki sayısı
 * eşik kabul edilir ("1-5"→1, "6-12"→6, "13"→13...); level ≥ eşik olan en büyük aşama seçilir.
 * Sayısız (endgame: "Map Start", "Whirling/Rain Swap") başlıklar otomatik seçilmez.
 */
export function stageIndexForLevel(titles: string[], level: number | null): number {
  if (level == null) return 0
  let best = -1
  let bestLo = -1
  titles.forEach((t, i) => {
    const m = (t || '').match(/^\s*(\d+)/)
    if (!m) return
    const lo = parseInt(m[1], 10)
    if (lo <= level && lo > bestLo) {
      bestLo = lo
      best = i
    }
  })
  return best >= 0 ? best : 0
}

const SPIRIT_SKILL = /Herald|Banner|Mantra|Aura|Blasphemy|Skitterbots/i

/** Eşleşmiş bir aşamadan quest uncut-gem önerisi üret. */
export function buildQuestSuggestion(stage: { title: string; gems: QuestGem[] }): QuestSuggestion {
  const level = parseLevel(stage.title)
  const endgame = !level
  const hi = level ? level.hi : 99
  const act = endgame ? 99 : levelToAct(hi) // endgame -> tüm kampanya/interlude ödülleri mevcut

  // benzersiz aktif beceriler + support sayısı
  const seenA = new Set<string>()
  const activeSkills: NamePair[] = []
  const seenS = new Set<string>()
  for (const g of stage.gems) {
    const name = (g.nameSpec || '').trim()
    if (!name) continue
    if (g.support) {
      if (!seenS.has(name)) seenS.add(name)
    } else if (!seenA.has(name)) {
      seenA.add(name)
      activeSkills.push({ en: name, tr: g.tr ?? null })
    }
  }
  const usesSpirit = activeSkills.some((s) => SPIRIT_SKILL.test(s.en))

  return {
    stageTitle: stage.title,
    level,
    act: endgame ? null : act,
    endgame,
    activeSkills,
    supportCount: seenS.size,
    usesSpirit,
    skill: pickReward('Skill', act),
    support: pickReward('Support', act),
    spirit: usesSpirit ? pickReward('Spirit', act) : null,
    // support uncut verisi en fazla act 2 (Lv2) — act 3+ aşamalarda eksik olduğunu işaretle
    supportDataLimited: act >= 3
  }
}
