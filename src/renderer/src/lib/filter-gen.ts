// filter-gen.ts — içe aktarılmış PobBuild → build'e ÖZEL PoE2 loot filter (.filter).
// SAF + test edilebilir. Yeni veri çekme YOK; mevcut PobBuild'den üretir.
//
// TELİF: NeverSink'in dosyaları BİREBİR kopyalanmaz. GGG'nin RESMÎ filter dili
// (telif edilemez sözdizimi) ile KENDİ filter'ımızı üretiriz; NeverSink/FilterBlade
// yalnız iyi-pratik referansıdır (blok sırası, sıkılık kademesi mantığı).
//
// DÜRÜSTLÜK: build'den ÇIKARDIĞIMIZ sinyaller (silah sınıfı, takılı tabanlar, eşsizler,
// sınıf→attribute) build'e özeldir; varsayım/eşleşmeyen her şey `notes`'a "doğrulanmalı".
// Currency taban adları PoE2 0.5'ten küratör küçük liste + generic Class blokları (uydurma yok).
//
// ToS: yalnız YEREL .filter yazma (resmî dil). Hafıza okuma / otomasyon YOK.
import type { PobBuild, PobItem } from './pob'

export type Strictness = 'soft' | 'regular' | 'strict' | 'very-strict'
const STRICT_RANK: Record<Strictness, number> = { soft: 0, regular: 1, strict: 2, 'very-strict': 3 }

// --- renk/stil tipleri ---
type RGB = [number, number, number] | [number, number, number, number]
type MiniColor =
  | 'Red' | 'Green' | 'Blue' | 'Brown' | 'White' | 'Yellow' | 'Cyan' | 'Grey' | 'Orange' | 'Pink' | 'Purple'
type MiniShape =
  | 'Circle' | 'Diamond' | 'Hexagon' | 'Square' | 'Star' | 'Triangle'
  | 'Cross' | 'Moon' | 'Raindrop' | 'Kite' | 'Pentagon' | 'UpsideDownHouse'
interface StyleSpec {
  text?: RGB
  border?: RGB
  bg?: RGB
  fontSize?: number
  icon?: [0 | 1 | 2, MiniColor, MiniShape]
  beam?: MiniColor
  sound?: [number, number] // [id 1-16, volume 0-300]
}
export interface FilterTheme {
  key: string
  nameEn: string
  nameTr: string
  build: StyleSpec // build'e özel vurgulanan eşyalar (silah sınıfı, tabanlar)
  unique: StyleSpec
  currency: StyleSpec
  gem: StyleSpec
  rare: StyleSpec
}

// Standart PoE renkleri tabanlı, accent (border/beam/icon) temaya göre değişir.
export const THEMES: Record<string, FilterTheme> = {
  amber: {
    key: 'amber',
    nameEn: 'Ornate Amber',
    nameTr: 'Süslü Kehribar',
    build: { text: [255, 214, 130], border: [255, 170, 60], fontSize: 40, icon: [1, 'Yellow', 'Diamond'], beam: 'Yellow', sound: [2, 300] },
    unique: { text: [175, 96, 37], border: [175, 96, 37], bg: [40, 20, 0, 220], fontSize: 42, icon: [0, 'Orange', 'Star'], beam: 'Orange', sound: [3, 300] },
    currency: { text: [210, 178, 110], border: [180, 140, 70], fontSize: 38, icon: [1, 'Yellow', 'Circle'], beam: 'White', sound: [1, 240] },
    gem: { text: [27, 162, 155], border: [27, 162, 155], fontSize: 36, icon: [1, 'Cyan', 'Triangle'] },
    rare: { text: [255, 255, 119], border: [200, 180, 60], fontSize: 34 }
  },
  crimson: {
    key: 'crimson',
    nameEn: 'Crimson Ember',
    nameTr: 'Kızıl Köz',
    build: { text: [255, 150, 150], border: [200, 40, 40], fontSize: 40, icon: [1, 'Red', 'Diamond'], beam: 'Red', sound: [2, 300] },
    unique: { text: [175, 96, 37], border: [200, 40, 40], bg: [40, 0, 0, 220], fontSize: 42, icon: [0, 'Red', 'Star'], beam: 'Orange', sound: [3, 300] },
    currency: { text: [220, 160, 120], border: [180, 90, 70], fontSize: 38, icon: [1, 'Orange', 'Circle'], beam: 'White', sound: [1, 240] },
    gem: { text: [27, 162, 155], border: [27, 162, 155], fontSize: 36, icon: [1, 'Cyan', 'Triangle'] },
    rare: { text: [255, 255, 119], border: [200, 100, 60], fontSize: 34 }
  },
  azure: {
    key: 'azure',
    nameEn: 'Azure Tide',
    nameTr: 'Mavi Gelgit',
    build: { text: [150, 210, 255], border: [40, 120, 220], fontSize: 40, icon: [1, 'Blue', 'Diamond'], beam: 'Blue', sound: [2, 300] },
    unique: { text: [175, 96, 37], border: [40, 120, 220], bg: [0, 10, 40, 220], fontSize: 42, icon: [0, 'Cyan', 'Star'], beam: 'Cyan', sound: [3, 300] },
    currency: { text: [170, 200, 230], border: [70, 120, 180], fontSize: 38, icon: [1, 'Cyan', 'Circle'], beam: 'White', sound: [1, 240] },
    gem: { text: [27, 162, 155], border: [27, 162, 155], fontSize: 36, icon: [1, 'Cyan', 'Triangle'] },
    rare: { text: [255, 255, 119], border: [60, 130, 200], fontSize: 34 }
  },
  emerald: {
    key: 'emerald',
    nameEn: 'Emerald Grove',
    nameTr: 'Zümrüt Koru',
    build: { text: [150, 255, 170], border: [40, 180, 80], fontSize: 40, icon: [1, 'Green', 'Diamond'], beam: 'Green', sound: [2, 300] },
    unique: { text: [175, 96, 37], border: [40, 180, 80], bg: [0, 30, 10, 220], fontSize: 42, icon: [0, 'Green', 'Star'], beam: 'Green', sound: [3, 300] },
    currency: { text: [180, 220, 160], border: [90, 160, 90], fontSize: 38, icon: [1, 'Green', 'Circle'], beam: 'White', sound: [1, 240] },
    gem: { text: [27, 162, 155], border: [27, 162, 155], fontSize: 36, icon: [1, 'Cyan', 'Triangle'] },
    rare: { text: [255, 255, 119], border: [90, 170, 80], fontSize: 34 }
  },
  mono: {
    key: 'mono',
    nameEn: 'Minimal Mono',
    nameTr: 'Sade Tek-renk',
    build: { text: [255, 255, 255], border: [220, 220, 220], fontSize: 40, icon: [1, 'White', 'Square'], beam: 'White', sound: [2, 220] },
    unique: { text: [175, 96, 37], border: [200, 200, 200], fontSize: 40, icon: [0, 'White', 'Star'] },
    currency: { text: [200, 200, 200], border: [160, 160, 160], fontSize: 36, icon: [1, 'Grey', 'Circle'] },
    gem: { text: [180, 200, 200], border: [150, 180, 180], fontSize: 34 },
    rare: { text: [230, 230, 200], border: [170, 170, 170], fontSize: 32 }
  }
}
export const DEFAULT_THEME = 'amber'

export interface FilterOptions {
  strictness: Strictness
  themeKey: string
  sound: boolean
  minimapIcon: boolean
  beam: boolean
  name?: string
}
export interface FilterAnalysis {
  className: string
  ascendancy: string
  attributes: string[] // ['Strength'] vb. (sınıftan; kanıt yoksa boş)
  weaponClasses: string[] // build'e özel — takılı silahtan
  equippedBases: string[] // build'e özel — yükseltme hedefi tabanlar
  uniqueNames: string[] // build'in eşsizleri (bilgi/yorum; filter Rarity Unique ile yakalar)
  notes: string[] // "doğrulanmalı" / varsayım uyarıları
}
export interface FilterResult {
  text: string
  blockCount: number
  filename: string
  analysis: FilterAnalysis
}

// --- build çözümleme yardımcıları ---
const CLASS_ATTR: Record<string, string[]> = {
  Warrior: ['Strength'], Marauder: ['Strength'],
  Ranger: ['Dexterity'],
  Witch: ['Intelligence'], Sorceress: ['Intelligence'],
  Monk: ['Dexterity', 'Intelligence'],
  Mercenary: ['Strength', 'Dexterity'],
  Druid: ['Strength', 'Intelligence'],
  Huntress: ['Dexterity'],
  Templar: ['Strength', 'Intelligence'], Shadow: ['Dexterity', 'Intelligence'], Duelist: ['Strength', 'Dexterity']
}
// Taban metni → silah Class adı (sıra önemli: crossbow, bow'dan önce).
const WEAPON_CLASS: Array<[RegExp, string]> = [
  [/crossbow/i, 'Crossbows'],
  [/\bbow\b/i, 'Bows'],
  [/quarter\s*staff/i, 'Quarterstaves'],
  [/\bstaff|stave/i, 'Staves'],
  [/wand/i, 'Wands'],
  [/sceptre/i, 'Sceptres'],
  [/spear/i, 'Spears'],
  [/flail/i, 'Flails'],
  [/dagger/i, 'Daggers'],
  [/claw/i, 'Claws'],
  [/two\s*hand.*mace|great\s*mace|greatmace/i, 'Two Hand Maces'],
  [/mace/i, 'One Hand Maces'],
  [/sword/i, 'Swords'],
  [/axe/i, 'Axes'],
  [/foci|focus/i, 'Foci']
]
function weaponClassOf(base: string): string | null {
  for (const [re, cls] of WEAPON_CLASS) if (re.test(base)) return cls
  return null
}
const WEAPON_SLOT = /weapon/i
const SWAP_SLOT = /swap/i

/** PobBuild'i build'e özel filter sinyallerine çöz. Saf. */
export function analyzeBuild(build: PobBuild | null): FilterAnalysis {
  const notes: string[] = []
  const a: FilterAnalysis = {
    className: build?.className || '',
    ascendancy: build?.ascendClassName || '',
    attributes: [],
    weaponClasses: [],
    equippedBases: [],
    uniqueNames: [],
    notes
  }
  if (!build) {
    notes.push('Build yok — yalnız genel (build-bağımsız) filter üretildi (doğrulanmalı).')
    return a
  }
  a.attributes = CLASS_ATTR[build.className] ?? []
  if (!a.attributes.length && build.className) notes.push(`Sınıf "${build.className}" attribute eşlemesi yok (doğrulanmalı).`)

  const byId = new Map(build.items.map((it) => [it.id, it]))
  const wClasses = new Set<string>()
  const bases = new Set<string>()
  const uniques = new Set<string>()
  for (const [slot, itemId] of Object.entries(build.slots || {})) {
    const it: PobItem | undefined = byId.get(itemId)
    if (!it) continue
    const isUnique = (it.rarity || '').toUpperCase() === 'UNIQUE'
    if (isUnique && it.name) uniques.add(it.name)
    // silah sınıfı (swap dahil değil — ana set)
    if (WEAPON_SLOT.test(slot) && !SWAP_SLOT.test(slot)) {
      const cls = weaponClassOf(it.base || it.name || '')
      if (cls) wClasses.add(cls)
      else if (it.base) notes.push(`Silah tabanı "${it.base}" sınıfa eşlenemedi (doğrulanmalı).`)
    }
    // yükseltme hedefi taban (eşsiz değil; benzersiz taban metni)
    if (!isUnique && it.base) bases.add(it.base)
  }
  a.weaponClasses = [...wClasses]
  a.equippedBases = [...bases]
  a.uniqueNames = [...uniques]
  return a
}

// --- blok modeli + emit ---
interface Block {
  comment?: string
  action: 'Show' | 'Hide'
  conditions: string[]
  style?: StyleSpec
}
function col(name: string, c: RGB): string {
  return `  ${name} ${c.join(' ')}`
}
function blockToText(b: Block, opt: FilterOptions): string {
  const lines: string[] = []
  if (b.comment) lines.push(`# ${b.comment}`)
  lines.push(b.action)
  for (const c of b.conditions) lines.push(`  ${c}`)
  const s = b.style
  if (s) {
    if (s.text) lines.push(col('SetTextColor', s.text))
    if (s.border) lines.push(col('SetBorderColor', s.border))
    if (s.bg) lines.push(col('SetBackgroundColor', s.bg))
    if (s.fontSize) lines.push(`  SetFontSize ${s.fontSize}`)
    if (opt.minimapIcon && s.icon) lines.push(`  MinimapIcon ${s.icon[0]} ${s.icon[1]} ${s.icon[2]}`)
    if (opt.beam && s.beam) lines.push(`  PlayEffect ${s.beam}`)
    if (opt.sound && s.sound) lines.push(`  PlayAlertSound ${s.sound[0]} ${s.sound[1]}`)
  }
  return lines.join('\n')
}
function quoteList(items: string[]): string {
  return items.map((x) => `"${x.replace(/"/g, '')}"`).join(' ')
}

// strictness eşikleri
function thresholds(s: Strictness): { rareIlvl: number; waystoneTier: number; hideNormal: boolean; hideMagic: boolean; hideLowCurrency: boolean; catchAllHide: boolean } {
  const r = STRICT_RANK[s]
  return {
    rareIlvl: [0, 0, 65, 75][r],
    waystoneTier: [0, 1, 6, 11][r],
    hideNormal: r >= 1,
    hideMagic: r >= 2,
    hideLowCurrency: r >= 2,
    catchAllHide: r >= 2
  }
}

// PoE2 0.5 küratör listeler (uydurma yok; doğrulanmalı işaretli). Generic Class blokları kalanı yakalar.
const TOP_CURRENCY = ['Mirror of Kalandra', 'Divine Orb', 'Perfect Jeweller\'s Orb', 'Greater Jeweller\'s Orb']
const GOOD_CURRENCY = ['Exalted Orb', 'Chaos Orb', 'Orb of Annulment', 'Vaal Orb', 'Regal Orb', 'Orb of Alchemy', 'Orb of Chance', 'Artificer\'s Orb', 'Lesser Jeweller\'s Orb', 'Gemcutter\'s Prism', 'Glassblower\'s Bauble']
const LOW_CURRENCY = ['Scroll of Wisdom', 'Portal Scroll', 'Orb of Transmutation', 'Orb of Augmentation', 'Armourer\'s Scrap', 'Blacksmith\'s Whetstone']
const GEAR_CLASSES = ['Body Armours', 'Helmets', 'Gloves', 'Boots', 'Shields', 'Foci', 'Quivers', 'Amulets', 'Rings', 'Belts', 'Bows', 'Crossbows', 'Wands', 'Sceptres', 'Staves', 'Quarterstaves', 'Spears', 'Flails', 'Daggers', 'Claws', 'One Hand Maces', 'Two Hand Maces', 'Swords', 'Axes']

/** PobBuild + seçenekler → geçerli .filter metni + blok sayısı + çözümleme. Saf. */
export function generateFilter(build: PobBuild | null, options: Partial<FilterOptions> = {}): FilterResult {
  const opt: FilterOptions = {
    strictness: options.strictness ?? 'regular',
    themeKey: options.themeKey ?? DEFAULT_THEME,
    sound: options.sound ?? true,
    minimapIcon: options.minimapIcon ?? true,
    beam: options.beam ?? true,
    name: options.name
  }
  const theme = THEMES[opt.themeKey] ?? THEMES[DEFAULT_THEME]
  const a = analyzeBuild(build)
  const th = thresholds(opt.strictness)
  const blocks: Block[] = []

  // 1) Eşsizler — daima belirgin (Rarity Unique). Build'in eşsizleri yorumda.
  blocks.push({
    comment: a.uniqueNames.length ? `Eşsizler (build: ${a.uniqueNames.join(', ')})` : 'Eşsizler',
    action: 'Show',
    conditions: ['Rarity Unique'],
    style: theme.unique
  })

  // 2) Build silah sınıfı — build'e ÖZEL vurgulama (eşsiz olmayan, sınıf eşleşen).
  if (a.weaponClasses.length) {
    const conds = [`Class == ${quoteList(a.weaponClasses)}`, 'Rarity Normal Magic Rare']
    if (STRICT_RANK[opt.strictness] >= 3) conds.push('ItemLevel >= 65') // very-strict: yalnız üst ilvl
    blocks.push({ comment: `Build silahı: ${a.weaponClasses.join(', ')}`, action: 'Show', conditions: conds, style: theme.build })
  }

  // 3) Build takılı tabanları — yükseltme hedefi (build'e özel).
  if (a.equippedBases.length) {
    blocks.push({
      comment: 'Build tabanları (yükseltme hedefi)',
      action: 'Show',
      conditions: [`BaseType ${quoteList(a.equippedBases)}`],
      style: { ...theme.build, fontSize: (theme.build.fontSize ?? 38) - 2 }
    })
  }

  // 4) Currency — üst kademe (daima), iyi kademe (daima), düşük (strict'te Hide).
  blocks.push({ comment: 'Currency — en değerli', action: 'Show', conditions: [`BaseType ${quoteList(TOP_CURRENCY)}`], style: { ...theme.currency, fontSize: 45, icon: [0, theme.currency.icon?.[1] ?? 'Yellow', 'Star'] } })
  blocks.push({ comment: 'Currency — değerli', action: 'Show', conditions: [`BaseType ${quoteList(GOOD_CURRENCY)}`], style: theme.currency })
  if (th.hideLowCurrency) {
    blocks.push({ comment: 'Currency — düşük (strict: gizle)', action: 'Hide', conditions: [`BaseType ${quoteList(LOW_CURRENCY)}`] })
  }
  // kalan tüm currency (generic) — soft/regular göster, strict'te yine göster (düşük zaten gizlendi)
  blocks.push({ comment: 'Currency — genel', action: 'Show', conditions: ['Class "Currency" "Stackable Currency"'], style: { ...theme.currency, fontSize: 36, beam: undefined, sound: undefined } })

  // 5) Gem'ler (uncut/skill/support) — build gem kullanır.
  blocks.push({ comment: 'Gem (uncut / skill / support)', action: 'Show', conditions: ['Class "Skill Gems" "Support Gems" "Spirit Gems"'], style: theme.gem })
  blocks.push({ comment: 'Uncut gem tabanları', action: 'Show', conditions: ['BaseType "Uncut Skill Gem" "Uncut Support Gem" "Uncut Spirit Gem"'], style: theme.gem })

  // 6) Rune / Soul Core — değerli kraft materyali.
  blocks.push({ comment: 'Rune / Soul Core', action: 'Show', conditions: ['Class "Runes" "Soul Cores"'], style: { ...theme.currency, fontSize: 36 } })

  // 7) Waystone — tier eşiğine göre (endgame harita).
  if (th.waystoneTier > 0) {
    blocks.push({ comment: `Waystone (düşük tier < ${th.waystoneTier}: gizle)`, action: 'Hide', conditions: ['Class "Waystones"', `WaystoneTier < ${th.waystoneTier}`] })
  }
  blocks.push({ comment: 'Waystone', action: 'Show', conditions: ['Class "Waystones"'], style: { ...theme.currency, fontSize: 36, icon: [1, theme.currency.icon?.[1] ?? 'White', 'Pentagon'] } })

  // 8) Jewel — değerli (her zaman göster).
  blocks.push({ comment: 'Jewel', action: 'Show', conditions: ['Class "Jewels"'], style: { ...theme.rare, border: theme.build.border } })

  // 9) Rare ekipman — strictness ilvl eşiği.
  {
    const conds = ['Rarity Rare', `Class ${quoteList(GEAR_CLASSES)}`]
    if (th.rareIlvl > 0) conds.push(`ItemLevel >= ${th.rareIlvl}`)
    blocks.push({ comment: th.rareIlvl > 0 ? `Rare ekipman (ilvl ≥ ${th.rareIlvl})` : 'Rare ekipman', action: 'Show', conditions: conds, style: theme.rare })
  }

  // 10) Magic ekipman — strict'te gizle (build tabanları yukarıda zaten yakalandı).
  if (th.hideMagic) {
    blocks.push({ comment: 'Magic ekipman (strict: gizle)', action: 'Hide', conditions: ['Rarity Magic', `Class ${quoteList(GEAR_CLASSES)}`] })
  } else {
    blocks.push({ comment: 'Magic ekipman', action: 'Show', conditions: ['Rarity Magic', `Class ${quoteList(GEAR_CLASSES)}`], style: { text: [136, 136, 255], fontSize: 30 } })
  }

  // 11) Normal ekipman — regular+ gizle.
  if (th.hideNormal) {
    blocks.push({ comment: 'Normal ekipman (regular+: gizle)', action: 'Hide', conditions: ['Rarity Normal', `Class ${quoteList(GEAR_CLASSES)}`] })
  } else {
    blocks.push({ comment: 'Normal ekipman', action: 'Show', conditions: ['Rarity Normal', `Class ${quoteList(GEAR_CLASSES)}`], style: { text: [200, 200, 200], fontSize: 28 } })
  }

  // 12) Yakalama bloğu — strict'te kalan her şeyi gizle; soft/regular soluk göster.
  blocks.push(
    th.catchAllHide
      ? { comment: 'Kalan her şey (strict: gizle)', action: 'Hide', conditions: [] }
      : { comment: 'Kalan her şey (soluk göster)', action: 'Show', conditions: [], style: { text: [140, 140, 140], fontSize: 26 } }
  )

  // --- başlık + birleştir ---
  const filterName = (opt.name || a.className || 'PoBe').trim()
  const header = [
    '#===============================================================',
    `# ${filterName} — Path of Berkay (PoBe) build filter`,
    `# Sınıf: ${a.className || '?'}${a.ascendancy ? ' / ' + a.ascendancy : ''}` + (a.attributes.length ? `  ·  Attribute: ${a.attributes.join('+')}` : ''),
    `# Sıkılık: ${opt.strictness}  ·  Tema: ${theme.nameTr} (${theme.key})`,
    `# Build silahı: ${a.weaponClasses.join(', ') || '—'}`,
    `# Build eşsizleri: ${a.uniqueNames.join(', ') || '—'}`,
    '# Ses: ' + (opt.sound ? 'açık' : 'kapalı') + '  ·  Harita ikonu: ' + (opt.minimapIcon ? 'açık' : 'kapalı') + '  ·  Işık huzmesi: ' + (opt.beam ? 'açık' : 'kapalı'),
    '# Üretici: resmî GGG filter dili (NeverSink/FilterBlade referans alındı, kopya değil).',
    a.notes.length ? '# Notlar (doğrulanmalı): ' + a.notes.join(' | ') : '# Not: yok',
    '#==============================================================='
  ].join('\n')

  const text = header + '\n\n' + blocks.map((b) => blockToText(b, opt)).join('\n\n') + '\n'
  return { text, blockCount: blocks.length, filename: filterFileName(filterName), analysis: a }
}

/** Güvenli .filter dosya adı. */
export function filterFileName(name: string): string {
  const safe = (name || 'PoBe').replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '_').slice(0, 50) || 'PoBe'
  return safe + '.filter'
}

// --- sözdizimi doğrulayıcı (test + UI için) ---
const BLOCK_KW = new Set(['Show', 'Hide', 'Minimal', 'Continue', 'Import'])
const COND_KW = new Set(['Class', 'BaseType', 'Rarity', 'ItemLevel', 'AreaLevel', 'DropLevel', 'Quality', 'StackSize', 'WaystoneTier', 'Sockets', 'SocketGroup', 'Corrupted', 'Identified', 'Mirrored', 'FracturedItem', 'Height', 'Width', 'GemLevel', 'UnidentifiedItemTier', 'HasExplicitMod'])
const ACTION_KW = new Set(['SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'SetFontSize', 'PlayAlertSound', 'PlayAlertSoundPositional', 'CustomAlertSound', 'MinimapIcon', 'PlayEffect', 'DisableDropSound', 'EnableDropSound'])
const MINI_COLORS = new Set(['Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan', 'Grey', 'Orange', 'Pink', 'Purple'])
const MINI_SHAPES = new Set(['Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'])

export interface ValidationResult { ok: boolean; errors: string[]; blocks: number }
/** .filter metnini resmî dile karşı doğrula (yüzeysel ama gerçek sözdizimi kontrolü). */
export function validateFilter(text: string): ValidationResult {
  const errors: string[] = []
  let blocks = 0
  let inBlock = false
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const tok = line.split(/\s+/)
    const kw = tok[0]
    if (BLOCK_KW.has(kw)) {
      if (kw === 'Show' || kw === 'Hide') {
        blocks++
        inBlock = true
      }
      continue
    }
    // blok içi satır: koşul veya aksiyon olmalı
    if (!COND_KW.has(kw) && !ACTION_KW.has(kw)) {
      errors.push(`Satır ${i + 1}: bilinmeyen anahtar kelime "${kw}"`)
      continue
    }
    if (!inBlock) errors.push(`Satır ${i + 1}: "${kw}" bir Show/Hide bloğu dışında`)
    // renk aksiyonları: 3-4 tamsayı 0-255
    if (kw === 'SetTextColor' || kw === 'SetBorderColor' || kw === 'SetBackgroundColor') {
      const nums = tok.slice(1).map(Number)
      if (nums.length < 3 || nums.length > 4 || nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        errors.push(`Satır ${i + 1}: ${kw} 3-4 tamsayı (0-255) bekler — "${line}"`)
      }
    }
    if (kw === 'MinimapIcon') {
      const size = Number(tok[1])
      if (![0, 1, 2].includes(size) || !MINI_COLORS.has(tok[2]) || !MINI_SHAPES.has(tok[3])) {
        errors.push(`Satır ${i + 1}: MinimapIcon <0-2> <renk> <şekil> bekler — "${line}"`)
      }
    }
    if (kw === 'PlayEffect') {
      if (!MINI_COLORS.has(tok[1])) errors.push(`Satır ${i + 1}: PlayEffect geçersiz renk — "${line}"`)
    }
    if (kw === 'PlayAlertSound') {
      const id = Number(tok[1])
      if (!Number.isInteger(id) || id < 1 || id > 16) errors.push(`Satır ${i + 1}: PlayAlertSound id 1-16 olmalı — "${line}"`)
    }
    if (kw === 'SetFontSize') {
      const sz = Number(tok[1])
      if (!Number.isInteger(sz) || sz < 1 || sz > 60) errors.push(`Satır ${i + 1}: SetFontSize 1-60 olmalı — "${line}"`)
    }
  }
  if (blocks === 0) errors.push('Hiç Show/Hide bloğu yok')
  return { ok: errors.length === 0, errors, blocks }
}
