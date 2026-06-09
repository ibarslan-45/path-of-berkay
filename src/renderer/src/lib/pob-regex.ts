// PoB eşyasından kompakt stash/envanter arama regex'i üretir.
//
// DOĞRULANDI (web, 2026-06): PoE2 arama çubuğu regex destekler — stash, envanter,
// vendor ve pasif/atlas ağacında Ctrl-F. Operatörler: karakter aralığı [], gruplama (),
// nokta ., alternatif |. ilvl: / str: / dex: / int: gibi prefix'ler var. Karakter sınırı ~50
// (ileride 250'ye çıkması bekleniyor). Arama, item üzerinde GÖRÜNEN taban adı + mod metnine bakar.
//
// NOT: PoE2 vendor (Finn / gamble) rastgele item satar; mod'a göre ARAMAZ — arama çubuğu sadece
// hâlihazırda gösterilen item'ları süzer. Bu üreteç bu yüzden STASH / ENVANTER metin araması içindir.
import type { MatchedItem } from './pob-match'

const LIMIT = 50

// Bilinen statı, item metninde birebir geçen kısa-ayırt edici bir parçaya indirger.
// Sıra = öncelik (sınıra sığmazsa sondakiler düşer). İlk eşleşen kazanır.
const KEY: [RegExp, string][] = [
  [/movement speed/i, 'Movement'],
  [/maximum life/i, 'maximum Life'],
  [/maximum mana/i, 'maximum Mana'],
  [/energy shield/i, 'Energy Shield'],
  [/fire resist/i, 'Fire Res'],
  [/cold resist/i, 'Cold Res'],
  [/lightning resist/i, 'Lightning Res'],
  [/chaos resist/i, 'Chaos Res'],
  [/all elemental resist/i, 'Elemental Res'],
  [/to spirit/i, 'Spirit'],
  [/to strength/i, 'Strength'],
  [/to dexterity/i, 'Dexterity'],
  [/to intelligence/i, 'Intelligence'],
  [/all attributes/i, 'Attributes'],
  [/attack speed/i, 'Attack Speed'],
  [/cast speed/i, 'Cast Speed'],
  [/critical/i, 'Critical'],
  [/accuracy/i, 'Accuracy'],
  [/rarity of/i, 'Rarity'],
  [/life regen/i, 'Regen'],
  [/mana regen/i, 'Mana Regen'],
  [/stun threshold/i, 'Stun'],
  [/physical damage/i, 'Physical'],
  [/elemental damage/i, 'Elemental Dmg'],
  [/to armour/i, 'Armour'],
  [/to evasion/i, 'Evasion']
]

// Direnç token'ları (2+ varsa tek "Resist"e indirilir).
const RES = new Set(['Fire Res', 'Cold Res', 'Lightning Res', 'Chaos Res', 'Elemental Res'])

// Affix sayılmayan satırlar (charm/flask tetikleyici implicit'leri vb.) — atlanır.
const SKIP = /^(Used when|Used automatically|Recovers|Grants|Lasts|Charges|Charm|Consumes)\b/i

/** Bilinmeyen mod'dan kaba bir token çıkar: sayı/işaret/dolgu sözcüklerini at, kalan adı al. */
function fallbackToken(mod: string): string | null {
  if (SKIP.test(mod)) return null
  const cleaned = mod
    .replace(/[+\-]?\d+(\.\d+)?%?/g, ' ')
    .replace(/\b(to|increased|reduced|more|less|added|maximum|of|the|per|second|with|all|your)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  // İlk iki anlamlı sözcük yeter.
  const words = cleaned.split(' ').filter((w) => w.length > 2)
  if (!words.length) return null
  return words.slice(0, 2).join(' ')
}

export interface ItemRegex {
  /** Kopyalanabilir OR arama dizesi (mod token'ları). */
  regex: string
  /** Kullanılan token'lar. */
  tokens: string[]
  /** Saf taban türü (ayrı, basit arama için). */
  base: string
  /** Item seviyesi (ilvl: prefix'i için ipucu). */
  ilvl: number
  /** Sınır aşıldığı için kısaltıldı mı. */
  truncated: boolean
}

/** Eşleşmiş bir eşyadan stash/envanter arama regex'i üret. */
export function buildItemRegex(it: MatchedItem): ItemRegex {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const mod of it.mods || []) {
    let tok: string | null = null
    for (const [re, out] of KEY) {
      if (re.test(mod)) {
        tok = out
        break
      }
    }
    if (!tok) tok = fallbackToken(mod)
    if (tok && !seen.has(tok)) {
      seen.add(tok)
      tokens.push(tok)
    }
  }

  // 2+ direnç varsa tek "Resist"e indir (kompaktlık).
  let work = tokens.slice()
  const resCount = work.filter((t) => RES.has(t)).length
  if (resCount >= 2) {
    work = work.filter((t) => !RES.has(t))
    work.unshift('Resist')
  }

  // Sınıra sığdır: sondakileri düşür.
  let truncated = false
  while (work.length > 1 && work.join('|').length > LIMIT) {
    work.pop()
    truncated = true
  }

  return {
    regex: work.join('|'),
    tokens: work,
    base: it.pureBase || it.base || it.name || '',
    ilvl: it.itemLevel || 0,
    truncated
  }
}
