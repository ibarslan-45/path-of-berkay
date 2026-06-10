// clipboard-parse.ts — PoE2 "Ctrl+C" eşya metnini yapılandırılmış ParsedItem'a çevirir.
// SAF + test edilebilir (ağ yok, oyun etkileşimi yok). Bu, oyun-içi değer için TEK
// yasal giriş yoludur (hafıza okuma YOK; sadece kullanıcının panosu).
//
// PoE2 formatı: bloklar 8+ tire (--------) ile ayrılır. İlk blok = başlık
// (Item Class / Rarity / isim satırları). Sonraki bloklar: özellikler, Requirements,
// Sockets, Item Level, mod satırları. Mod işaretleri: (implicit) (rune) (crafted)
// (fractured) (enchant). "Corrupted" / "Unidentified" satırları durum belirtir.
//
// DÜRÜSTLÜK: Magic eşyada isim taban-adıyla iç içedir → baseType güvenle çıkarılamaz,
//   '' bırakılır (eşleşme stat-id'ye düşer). Çıkaramadığımız hiçbir şeyi uydurmayız.

export type ParsedRarity =
  | 'Normal'
  | 'Magic'
  | 'Rare'
  | 'Unique'
  | 'Gem'
  | 'Currency'
  | 'Unknown'

export type ModKind = 'explicit' | 'implicit' | 'crafted' | 'fractured' | 'rune' | 'enchant'

export interface ParsedMod {
  text: string // ham satır (işaret etiketi temizlenmiş)
  kind: ModKind
}

export interface ParsedProperty {
  label: string
  value: string
  augmented: boolean
}

export interface ParsedItem {
  itemClass: string
  rarity: ParsedRarity
  name: string // Rare/Unique adı; Normal/Magic'te ''
  baseType: string // taban adı (best-effort; Magic'te '' olabilir)
  itemLevel: number | null
  quality: number // 0..20 (+%)
  sockets: number // soket sayısı
  socketText: string
  runes: string[] // sokete takılı rune adları (varsa)
  corrupted: boolean
  identified: boolean
  mirrored: boolean
  fractured: boolean // herhangi bir mod fractured ise
  influences: string[] // etki/durum etiketleri (Synthesised, Veiled, Searing Exarch, Eater of Worlds vb.)
  requirements: { level?: number; str?: number; dex?: number; int?: number }
  properties: ParsedProperty[]
  implicits: ParsedMod[]
  explicits: ParsedMod[] // crafted/fractured dahil (kind ile ayırt edilir)
  enchants: ParsedMod[] // enchant satırları (ayrı tutulur; sorguda kullanılmaz)
  note: string // trade fiyat notu ("~price 5 divine" vb.) — mod DEĞİL
  raw: string
}

const SEP_RE = /^-{3,}$/
const KNOWN_PROP_LABELS = new Set([
  'Quality',
  'Physical Damage',
  'Elemental Damage',
  'Fire Damage',
  'Cold Damage',
  'Lightning Damage',
  'Chaos Damage',
  'Critical Hit Chance',
  'Critical Strike Chance',
  'Attacks per Second',
  'Armour',
  'Evasion Rating',
  'Energy Shield',
  'Ward',
  'Block chance',
  'Block',
  'Spirit',
  'Reload Time',
  'Weapon Range',
  'Charm Slots',
  'Charges',
  'Limited to',
  'Radius',
  'Cooldown Time',
  'Stack Size'
])
// Etki/durum etiketleri (tek satırlık bloklarda görünür). PoE2'de influence sınırlı; yine de
// gelecekteki etiketleri yakalamak için keyword listesi (uydurma yok — yalnız bilinenler).
const INFLUENCE_RE =
  /^(Synthesised|Synthesized|Veiled|Fractured Item|Searing Exarch Item|Eater of Worlds Item|Shaper Item|Elder Item|Corrupted)$/i

function detectRarity(s: string): ParsedRarity {
  switch (s.trim()) {
    case 'Normal':
      return 'Normal'
    case 'Magic':
      return 'Magic'
    case 'Rare':
      return 'Rare'
    case 'Unique':
      return 'Unique'
    case 'Gem':
      return 'Gem'
    case 'Currency':
      return 'Currency'
    default:
      return 'Unknown'
  }
}

// Satır sonundaki tek işaret etiketini ayıkla: "... (implicit)" → kind
function stripKindTag(line: string): { text: string; kind: ModKind | null } {
  const m = line.match(/\s*\((implicit|crafted|fractured|rune|enchant|scourge|veiled)\)\s*$/i)
  if (!m) return { text: line, kind: null }
  const tag = m[1].toLowerCase()
  const kind =
    tag === 'implicit'
      ? 'implicit'
      : tag === 'crafted'
        ? 'crafted'
        : tag === 'fractured'
          ? 'fractured'
          : tag === 'rune'
            ? 'rune'
            : tag === 'enchant'
              ? 'enchant'
              : 'explicit'
  return { text: line.slice(0, m.index).trimEnd(), kind: kind as ModKind }
}

// "Advanced Mod Descriptions" açıklama satırından ({ Master Crafted Suffix Modifier ... }) mod türü ipucu.
function annotationKind(line: string): ModKind {
  if (/crafted/i.test(line)) return 'crafted'
  if (/fractured/i.test(line)) return 'fractured'
  if (/enchant/i.test(line)) return 'enchant'
  if (/\brune\b/i.test(line)) return 'rune'
  if (/implicit/i.test(line)) return 'implicit'
  return 'explicit' // Prefix/Suffix Modifier
}

function countSockets(socketText: string): number {
  // PoE2 soketleri harf/simge + ayraç (G-B-G veya "S S S"). Boş olmayan jeton sayısı.
  const toks = socketText.split(/[\s\-|,]+/).filter((t) => t && t !== '-')
  return toks.length
}

/** Ham clipboard metnini ParsedItem'a çevir. Tanınmazsa rarity:'Unknown' döner (çökmez). */
export function parseClipboard(raw: string): ParsedItem | null {
  if (!raw || typeof raw !== 'string') return null
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) return null

  const item: ParsedItem = {
    itemClass: '',
    rarity: 'Unknown',
    name: '',
    baseType: '',
    itemLevel: null,
    quality: 0,
    sockets: 0,
    socketText: '',
    runes: [],
    corrupted: false,
    identified: true,
    mirrored: false,
    fractured: false,
    influences: [],
    requirements: {},
    properties: [],
    implicits: [],
    explicits: [],
    enchants: [],
    note: '',
    raw: text
  }

  // bloklara böl
  const blocks: string[][] = [[]]
  for (const ln of text.split('\n')) {
    if (SEP_RE.test(ln.trim())) blocks.push([])
    else blocks[blocks.length - 1].push(ln)
  }

  // --- Başlık bloğu (0): Item Class / Rarity / isim satırları ---
  const header = blocks[0] ?? []
  const nameLines: string[] = []
  for (const ln of header) {
    const t = ln.trim()
    if (!t) continue
    if (/^Item Class:/i.test(t)) item.itemClass = t.replace(/^Item Class:\s*/i, '').trim()
    else if (/^Rarity:/i.test(t)) item.rarity = detectRarity(t.replace(/^Rarity:\s*/i, ''))
    else nameLines.push(t)
  }
  // isim/taban ayrımı
  if (item.rarity === 'Rare' || item.rarity === 'Unique') {
    item.name = nameLines[0] ?? ''
    item.baseType = nameLines[1] ?? nameLines[0] ?? ''
  } else if (item.rarity === 'Magic') {
    // Magic: tek satır, isim taban-adıyla iç içe → baseType güvenle çıkarılamaz (DÜRÜST)
    item.name = ''
    item.baseType = '' // stat-id eşleşmesine düşer
  } else {
    // Normal/Gem/Currency: tek satır = taban
    item.baseType = nameLines[0] ?? ''
    item.name = ''
  }

  // --- Diğer bloklar ---
  for (let b = 1; b < blocks.length; b++) {
    const lines = blocks[b].map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
    if (!lines.length) continue
    const first = lines[0].trim()

    // tekil-durum satırları
    if (lines.length === 1) {
      if (/^Corrupted$/i.test(first)) {
        item.corrupted = true
        continue
      }
      if (/^Unidentified$/i.test(first)) {
        item.identified = false
        continue
      }
      if (/^Mirrored$/i.test(first)) {
        item.mirrored = true
        continue
      }
      if (INFLUENCE_RE.test(first)) {
        if (/^Corrupted$/i.test(first)) item.corrupted = true
        else item.influences.push(first)
        continue
      }
      if (/^Note:\s*/i.test(first)) {
        item.note = first.replace(/^Note:\s*/i, '').trim()
        continue
      }
      if (/^Item Level:/i.test(first)) {
        const n = parseInt(first.replace(/[^\d]/g, ''), 10)
        item.itemLevel = Number.isFinite(n) ? n : null
        continue
      }
    }

    // Requirements bloğu ("Requirements:" başlığı veya tek satır "Requires Level 65, 100 Str")
    if (/^Requirements:/i.test(first) || /^Requires\b/i.test(first)) {
      // başlık satırının kalanı (inline "Requirements: Level 55, 60 Dex") + sonraki satırlar
      const firstRest = first.replace(/^Requirements:\s*/i, '').replace(/^Requires:?\s*/i, '')
      const reqLines = [firstRest, ...lines.slice(1)].filter((l) => l.trim())
      for (const ln of reqLines) {
        // "Level: 68" / "Requires Level 65" / inline "65 Str, 40 Dex"
        const lvl = ln.match(/(?:Level[:\s]+)(\d+)/i)
        if (lvl) item.requirements.level = parseInt(lvl[1], 10)
        for (const am of ln.matchAll(/(\d+)\s*(Str|Dex|Int|Strength|Dexterity|Intelligence)\b/gi)) {
          const v = parseInt(am[1], 10)
          const k = am[2].toLowerCase()
          if (k.startsWith('str')) item.requirements.str = v
          else if (k.startsWith('dex')) item.requirements.dex = v
          else if (k.startsWith('int')) item.requirements.int = v
        }
        for (const am of ln.matchAll(/(?:^|[,\s])(Str|Dex|Int|Strength|Dexterity|Intelligence)[:\s]+(\d+)/gi)) {
          const v = parseInt(am[2], 10)
          const k = am[1].toLowerCase()
          if (k.startsWith('str')) item.requirements.str = v
          else if (k.startsWith('dex')) item.requirements.dex = v
          else if (k.startsWith('int')) item.requirements.int = v
        }
      }
      continue
    }

    // Sockets bloğu
    if (/^Sockets:/i.test(first)) {
      item.socketText = first.replace(/^Sockets:\s*/i, '').trim()
      item.sockets = countSockets(item.socketText)
      continue
    }

    // Item Level (blok içinde tek başına değilse)
    if (/^Item Level:/i.test(first) && item.itemLevel === null) {
      const n = parseInt(first.replace(/[^\d]/g, ''), 10)
      item.itemLevel = Number.isFinite(n) ? n : null
      continue
    }

    // Özellik bloğu mu? (label: value satırları, bilinen etiketlerle)
    const propParsed: ParsedProperty[] = []
    let allProps = true
    for (const ln of lines) {
      const t = ln.trim()
      const m = t.match(/^([A-Za-z][A-Za-z .']+):\s*(.+)$/)
      if (m && KNOWN_PROP_LABELS.has(m[1].trim())) {
        const label = m[1].trim()
        const valRaw = m[2].trim()
        const augmented = /\(augmented\)/i.test(valRaw)
        const value = valRaw.replace(/\s*\(augmented\)/i, '').trim()
        propParsed.push({ label, value, augmented })
        if (label === 'Quality') {
          const q = parseInt(value.replace(/[^\d]/g, ''), 10)
          if (Number.isFinite(q)) item.quality = q
        }
      } else {
        allProps = false
        break
      }
    }
    if (allProps && propParsed.length) {
      item.properties.push(...propParsed)
      continue
    }

    // Aksi halde: mod satırları (implicit/crafted/fractured/rune/enchant/explicit)
    // "Advanced Mod Descriptions" AÇIK iken her mod'dan önce { ... Modifier ... } açıklama satırı
    // gelir (tier/affix/crafted bilgisi). Bu satır mod DEĞİLDİR → atlanır; ama bir sonraki mod'un
    // türü için ipucu verir (advanced modda inline (crafted)/(fractured) etiketi olmayabilir).
    let pendingKind: ModKind | null = null
    for (const ln of lines) {
      const t = ln.trim()
      if (!t) continue
      // advanced mod açıklama satırı: { ... } — türü çıkar, satırı mod havuzuna KOYMA
      if (/^\{.*\}$/.test(t)) {
        pendingKind = annotationKind(t)
        continue
      }
      // durum/not satırları: mod havuzuna karıştırma
      if (/^Corrupted$/i.test(t)) {
        item.corrupted = true
        continue
      }
      if (/^Mirrored$/i.test(t)) {
        item.mirrored = true
        continue
      }
      if (/^Unidentified$/i.test(t)) {
        item.identified = false
        continue
      }
      if (INFLUENCE_RE.test(t)) {
        item.influences.push(t)
        continue
      }
      if (/^Note:\s*/i.test(t) || /^~(price|b\/o)\b/i.test(t)) {
        item.note = t.replace(/^Note:\s*/i, '').trim()
        continue
      }
      const { text: clean, kind } = stripKindTag(t)
      const effKind = kind ?? pendingKind // inline etiket öncelikli; yoksa açıklama satırı ipucu
      pendingKind = null
      if (effKind === 'implicit') item.implicits.push({ text: clean, kind: 'implicit' })
      else if (effKind === 'enchant') item.enchants.push({ text: clean, kind: 'enchant' })
      else {
        if (effKind === 'fractured') item.fractured = true
        item.explicits.push({ text: clean, kind: effKind ?? 'explicit' })
      }
    }
  }

  // Sokete takılı rune'ları (kind:'rune') ayrıca derle (UI/sorgu için).
  item.runes = item.explicits.filter((m) => m.kind === 'rune').map((m) => m.text)

  return item
}

/** Bir mod satırını eşleştirme kalıbına çevirir: sayıları '#', boşlukları sadeleştirir.
 *  (mods_sim/trade_stats EN-anahtar formatıyla uyumlu — '+' işareti korunur, '#'e çevrilir.) */
export function modToPattern(line: string): string {
  return line
    .replace(/\d+(?:\.\d+)?/g, '#')
    .replace(/#\s*[-–]\s*#/g, '#') // "# - #" aralığı tek #
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
