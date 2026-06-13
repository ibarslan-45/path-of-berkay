// build-compare.ts — takip edilen build'in HEDEF eşyası ile elindeki ADAY eşyayı
// ÖZELLİK BAŞINA karşılaştırır (saf, test edilebilir). Mod eşleştirmesi mevcut
// trade stat-id + '#' kalıp altyapısını kullanır (uydurma yok; eşleşmeyen "doğrulanmalı").
//
// Hedef = PobItem.mods (EN metin satırları). Aday = clipboard/craft mod satırları (EN).
// Çıktı: eşleşen (değer % yaklaşma), eksik (hedefte var/adayda yok), fazla (adayda var/hedefte yok)
//   + toplam yakınlık skoru (eşleşen sayısı × değer yakınlığı, dürüst).

import modsData from '../../../data/mods.json'
import { matchStat, valueFromLine, type QueryItem, type QueryMod } from './trade-query'
import { modToPattern } from './clipboard-parse'
import type { PobItem } from './pob'

// mods.json: EN '#' kalıbı -> TR şablonu (iki dilli gösterim için)
const trByKey = new Map<string, string>()
function normKey(s: string): string {
  return s.toLowerCase().replace(/\+/g, '').replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim()
}
for (const m of modsData as Array<{ en: string; tr: string }>) {
  if (m.en && m.tr) trByKey.set(normKey(m.en), m.tr)
}
/** TR şablonundaki '#'leri ham satırdaki sayılarla doldur (yoksa '' döner). */
function trFor(pattern: string, rawLine: string): string {
  const tpl = trByKey.get(normKey(pattern))
  if (!tpl) return ''
  const nums = rawLine.match(/-?\d+(?:\.\d+)?/g) || []
  let i = 0
  return tpl.replace(/#/g, () => nums[i++] ?? '#')
}

/** PoB build eşyası → trade2 QueryItem (Faz 5: build eşyasından trade'de aç).
 *  Mod metni stat-id'ye eşlenir (temizlenmiş); text-stat yoksa taban/isimle aranır. */
export function pobItemToQueryItem(it: PobItem): { qi: QueryItem; searchableMods: number } {
  const norm = normMods(it.mods)
  const mods: QueryMod[] = norm.map((n) => ({
    pattern: n.pattern,
    text: n.raw,
    value: n.value,
    valueHi: null, // build "Trade'de Aç" tek-değer kullanır (iki-kutu UI overlay'e özel)
    ranged: false,
    kind: 'explicit',
    enabled: true,
    fromRune: false,
    statId: n.statId,
    matched: !!n.statId
  }))
  const isUnique = (it.rarity || '').toUpperCase() === 'UNIQUE'
  const qi: QueryItem = {
    baseType: it.base,
    name: isUnique ? it.name : '',
    rarity: isUnique ? 'Unique' : 'Rare',
    itemLevel: it.itemLevel || null,
    mods
  }
  return { qi, searchableMods: mods.filter((m) => m.matched).length }
}

/**
 * Build eşyasından GEVŞEK trade sorgusu (0.17.9 — "Trade'de Ara"). Build eşyaları çok-modlu "ideal"
 * item olabilir → TÜM modlarla arama 0 sonuç verir. Bu yüzden taban + yalnız ilk `maxMods` eşleşen modu
 * etkin bırakırız (kullanıcı trade'de daraltabilir). pureBase varsa taban olarak onu kullanır.
 */
export function buildItemTradeQuery(it: PobItem & { pureBase?: string }, maxMods = 3): QueryItem {
  const { qi } = pobItemToQueryItem({ ...it, base: it.pureBase || it.base })
  let kept = 0
  for (const m of qi.mods) {
    if (m.matched && kept < maxMods) {
      m.enabled = true
      kept++
    } else {
      m.enabled = false
    }
  }
  return qi
}

export interface NormMod {
  pattern: string // EN '#' kalıbı
  value: number | null // ilk sayısal değer
  statId?: string // trade stat-id (varsa)
  raw: string // ham satır (değerli)
}
// Affix OLMAYAN satırlar (PoB/clipboard'da görünür ama karşılaştırılabilir stat değil)
const NON_AFFIX =
  /^(Corrupted|Mirrored|Split|Unidentified|Grants Skill:|Allocates|Used when|Creates |Bonded:|Requires |Limited to:|Radius:|Source:|Implicit Modifier|Tabula|Has \d)/i
export function normMods(lines: string[]): NormMod[] {
  const out: NormMod[] = []
  for (const rawLine of lines) {
    // PoB işaretlerini ({enchant}{rune}{fractured}{desecrated}{crafted}…) at; satırı sadeleştir
    const t = rawLine.replace(/\{[^}]*\}/g, '').replace(/\s{2,}/g, ' ').trim()
    if (!t || NON_AFFIX.test(t)) continue
    const pattern = modToPattern(t)
    if (!pattern) continue
    out.push({ pattern, value: valueFromLine(t), statId: matchStat(pattern)?.id, raw: t })
  }
  return out
}
/** İki mod'un aynı stat olup olmadığı: stat-id eşitse kesin; yoksa kalıp eşitliği. */
function modKey(m: NormMod): string {
  return m.statId ? 'id:' + m.statId : 'p:' + normKey(m.pattern)
}

export type RowKind = 'match' | 'missing' | 'extra'
export type RowStatus = 'ok' | 'close' | 'low' | 'na'
export interface CompareRow {
  kind: RowKind
  en: string // gösterim metni (hedef veya aday ham satırı)
  tr: string // TR şablonu doldurulmuş (yoksa '')
  pattern: string
  targetValue: number | null
  candidateValue: number | null
  approachPct: number | null // 0..100+ (null = sayısal değil / ikili)
  status: RowStatus
  verify: boolean // stat-id'ye eşlenemedi → "doğrulanmalı"
}
export interface CompareResult {
  rows: CompareRow[]
  score: number // 0..100 toplam yakınlık (hedef mod'larına göre)
  matchedCount: number
  targetCount: number
  missingCount: number
  extraCount: number
}

function statusFor(pct: number | null): RowStatus {
  if (pct === null) return 'na'
  if (pct >= 95) return 'ok'
  if (pct >= 70) return 'close'
  return 'low'
}

/** Hedef mod satırları + aday mod satırları → özellik-başına karşılaştırma + skor. */
export function compareMods(targetLines: string[], candidateLines: string[]): CompareResult {
  const target = normMods(targetLines)
  const cand = normMods(candidateLines)
  const candByKey = new Map<string, NormMod>()
  for (const c of cand) if (!candByKey.has(modKey(c))) candByKey.set(modKey(c), c)
  const usedCand = new Set<string>()

  const rows: CompareRow[] = []
  let scoreSum = 0
  let matchedCount = 0

  for (const t of target) {
    const key = modKey(t)
    const c = candByKey.get(key)
    if (c) {
      usedCand.add(key)
      matchedCount++
      let approachPct: number | null = null
      if (typeof t.value === 'number' && typeof c.value === 'number' && t.value !== 0) {
        approachPct = Math.round((c.value / t.value) * 100)
      } else if (t.value === null && c.value === null) {
        approachPct = 100 // ikili stat (ör. "Cannot be Frozen") — varsa tam
      }
      const contrib = approachPct === null ? 1 : Math.min(1, approachPct / 100)
      scoreSum += contrib
      rows.push({
        kind: 'match',
        en: c.raw,
        tr: trFor(c.pattern, c.raw),
        pattern: t.pattern,
        targetValue: t.value,
        candidateValue: c.value,
        approachPct,
        status: statusFor(approachPct),
        verify: !t.statId // hedef stat-id'siz eşleşti → kalıp eşitliğine güvenildi
      })
    } else {
      rows.push({
        kind: 'missing',
        en: t.raw,
        tr: trFor(t.pattern, t.raw),
        pattern: t.pattern,
        targetValue: t.value,
        candidateValue: null,
        approachPct: 0,
        status: 'low',
        verify: !t.statId
      })
    }
  }

  // adayda olup hedefte olmayan = FAZLA
  let extraCount = 0
  for (const c of cand) {
    const key = modKey(c)
    if (usedCand.has(key)) continue
    // aynı key birden çok aday → ilkini kullandık; kalanları da fazla say
    extraCount++
    rows.push({
      kind: 'extra',
      en: c.raw,
      tr: trFor(c.pattern, c.raw),
      pattern: c.pattern,
      targetValue: null,
      candidateValue: c.value,
      approachPct: null,
      status: 'na',
      verify: !c.statId
    })
    usedCand.add(key)
  }

  const targetCount = target.length
  const score = targetCount ? Math.round((scoreSum / targetCount) * 100) : 0
  return {
    rows,
    score,
    matchedCount,
    targetCount,
    missingCount: targetCount - matchedCount,
    extraCount
  }
}
