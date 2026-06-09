// build-craft-seed.ts — Build'deki bir eşyayı Craft Simülatörü'ne "tohum" olarak aktarır (Part 5).
//
// Kullanıcı build'deki bir eşyada "Craft'la" deyince:
//   - SAĞ (hedef) = build eşyası (istenen tam eşya) → mod satırları hedef gruplara eşlenir (TargetEntry).
//   - SOL (taban) = o eşyanın SAF/beyaz tabanı (implicit base ile birlikte) → selClass/selBaseEn/ilvl.
// Craft koçu (mevcut planCraft/advisor) bu hedeflere doğru yardım eder.
//
// SAF + test edilebilir. Eşleşmeyen mod satırları dürüstçe `unmatched` listesinde işaretlenir (uydurma yok).
import {
  SIM_BASES,
  targetableGroups,
  groupTierRanges,
  type SimBase,
  type TargetEntry
} from './craft-sim'

export interface CraftSeedItem {
  base: string // saf taban adı (pureBase tercih)
  pureBase?: string
  itemClass?: string | null
  rarity?: string
  mods: string[]
  itemLevel?: number
}

export interface CraftSeed {
  baseEn: string | null // SIM_BASES'te eşleşen taban (yoksa null)
  itemClass: string | null // taban sınıfı (selClass için)
  ilvl: number
  targets: TargetEntry[] // eşleşen hedef modlar (advisor besler)
  matched: Array<{ line: string; group: string; tier: number }>
  unmatched: string[] // eşlenemeyen mod satırları (dürüst işaret)
}

// mod metnini eşleştirme anahtarına indir: sayı/+/%/#/noktalama at, küçük harf, boşluk sıkıştır
function normKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // (parantez içi) kaldır (ör. rune/aralık notları)
    .replace(/[+\-]?\d+(?:\.\d+)?/g, ' ') // sayılar
    .replace(/[#%]/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// taban adını normalize et (eşleme için)
function normBase(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

const baseByName = new Map<string, SimBase>()
for (const b of SIM_BASES) {
  const k = normBase(b.en)
  if (k && !baseByName.has(k)) baseByName.set(k, b)
}

/** Saf taban adından SIM_BASES eşleşmesi (tam ad → içerme fallback). */
export function matchSimBase(pureBase: string): SimBase | null {
  const k = normBase(pureBase)
  if (!k) return null
  const exact = baseByName.get(k)
  if (exact) return exact
  // içerme: build tabanı SIM tabanını içeriyorsa (en uzun eşleşme)
  let best: SimBase | null = null
  let bestLen = 0
  for (const [name, b] of baseByName) {
    if ((k === name || k.includes(name) || name.includes(k)) && name.length > bestLen) {
      best = b
      bestLen = name.length
    }
  }
  return best
}

// bir mod satırının değerini gruptaki tier aralıklarına oturt → minTier (yoksa 1)
// index 0 = en yüksek tier (T1). Hibrit modlar (geniş aralık) sırayı bozabildiği için:
// değerin TABANINI (lo ≤ val) karşılayan tier'lar arasından EN YÜKSEK lo'lu olanı seç (en sıkı tier).
function tierForValue(group: string, affix: 'prefix' | 'suffix', line: string): number {
  const ranges = groupTierRanges(group, affix)
  if (!ranges.length) return 1
  const nums = (line.match(/[+\-]?\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n))
  if (!nums.length) return 1
  const val = Math.max(...nums)
  let bestIdx = -1
  let bestLo = -Infinity
  for (let i = 0; i < ranges.length; i++) {
    const m = ranges[i].match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/)
    if (!m) continue
    const lo = Math.min(parseFloat(m[1]), parseFloat(m[2]))
    if (lo <= val && lo > bestLo) {
      bestLo = lo
      bestIdx = i
    }
  }
  return bestIdx >= 0 ? bestIdx + 1 : ranges.length
}

/**
 * Build eşyasını Craft tohumuna çevir. base/ilvl + mod→hedef grup eşlemesi.
 * Eşleşmeyen modlar `unmatched` (advisor'a girmez; kullanıcı görür).
 */
export function craftSeedFromItem(item: CraftSeedItem): CraftSeed {
  const pure = item.pureBase || item.base || ''
  const simBase = matchSimBase(pure)
  const ilvl = Math.max(1, Math.min(100, item.itemLevel || (simBase ? simBase.drop_level : 80) || 80))

  const seed: CraftSeed = {
    baseEn: simBase ? simBase.en : null,
    itemClass: simBase ? simBase.item_class : item.itemClass ?? null,
    ilvl,
    targets: [],
    matched: [],
    unmatched: []
  }
  if (!simBase) {
    // taban eşleşmedi → modları hedefe çeviremeyiz (grup tabana bağlı). Hepsi unmatched.
    seed.unmatched = item.mods.filter((m) => m && !/^\(/.test(m.trim()))
    return seed
  }

  const groups = targetableGroups(simBase, ilvl)
  // normalize edilmiş grup anahtarı → grup (ilk eşleşme)
  const groupByKey = new Map<string, { group: string; affix: 'prefix' | 'suffix' }>()
  for (const g of groups) {
    const k = normKey(g.en)
    if (k && !groupByKey.has(k)) groupByKey.set(k, { group: g.group, affix: g.affix })
  }

  const usedGroups = new Set<string>()
  for (const raw of item.mods) {
    const line = (raw || '').trim()
    if (!line) continue
    // implicit/rune/parantezli notlar atlanır (taban implicit'i zaten gelir)
    if (/^\(/.test(line)) continue
    const key = normKey(line)
    if (!key) continue
    // tam eşleşme → içerme fallback (en uzun grup anahtarı)
    let hit = groupByKey.get(key)
    if (!hit) {
      let bestLen = 0
      for (const [gk, gv] of groupByKey) {
        if ((key.includes(gk) || gk.includes(key)) && gk.length > bestLen) {
          hit = gv
          bestLen = gk.length
        }
      }
    }
    if (!hit || usedGroups.has(hit.group)) {
      if (!hit) seed.unmatched.push(line)
      continue
    }
    usedGroups.add(hit.group)
    const tier = tierForValue(hit.group, hit.affix, line)
    seed.targets.push({ group: hit.group, minTier: tier })
    seed.matched.push({ line, group: hit.group, tier })
  }
  return seed
}
