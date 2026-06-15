// Craft simülasyon motoru (saf, test edilebilir). Veri: mods_sim.json.
// Gerçek currency harcanmaz — sadece mod havuzu + kurallarla roll simüle edilir.
//
// KURALLAR (PoE2): magic = 1 prefix + 1 suffix; rare = 3 prefix + 3 suffix.
// Mod havuzu: taban tag'i + item ilvl. weight = mod.weights içinde item'ın sahip olduğu
// İLK tag'in ağırlığı (0 → roll'a kapalı). Aynı group'tan iki mod gelemez. ilvl > item.ilvl gelmez.
import simData from '../../../data/mods_sim.json'
import essData from '../../../data/essences_sim.json'
import catData from '../../../data/catalysts_sim.json'
import omenData from '../../../data/omens_sim.json'
import runeData from '../../../data/runes_sim.json'

export interface SimWeight {
  tag: string
  weight: number
}
export interface SimMod {
  id: string
  affix: 'prefix' | 'suffix'
  group: string
  domain: 'item' | 'flask'
  name_en: string
  text_en: string
  text_tr: string
  ilvl: number
  values: string
  tags: string[]
  weights: SimWeight[]
}
export interface SimBase {
  id: string
  en: string
  tr: string
  item_class: string
  slot: string
  domain: 'item' | 'flask'
  tags: string[]
  drop_level: number
  implicit_en: string
  implicit_tr: string
  icon: string
  base_stats: Record<string, number>
}
export type Rarity = 'normal' | 'magic' | 'rare'
export interface RolledMod {
  mod: SimMod
  en: string // rollanmış sayılarla stat satırı (EN)
  tr: string // aynı değerlerle TR
  fractured?: boolean // Fracturing Orb ile kilitli — kaldırılamaz/değişmez
}
export interface ItemState {
  base: SimBase
  ilvl: number
  rarity: Rarity
  prefixes: RolledMod[]
  suffixes: RolledMod[]
  quality: number // 0-20 (kalite orb'ları + catalyst)
  catalystTag: string // takıda catalyst kalitesinin güçlendirdiği tag (boşsa generic kalite)
  corrupted: boolean // Vaal sonrası — başka işlem uygulanamaz
  implicits: { en: string; tr: string }[] // corruption implicit'leri (Vaal)
  sockets: SocketState // augment soketleri (Artificer/Vaal) + takılı rune/core'lar
}
export interface SocketedRune {
  id: string
  name_en: string
  name_tr: string
  effect_en: string
  effect_tr: string
}
export interface SocketState {
  count: number // toplam soket
  max: number // bu base için doğal soket üst sınırı (küratör)
  runes: SocketedRune[] // takılı rune/core'lar (length ≤ count)
}
export interface OpResult {
  item: ItemState
  ok: boolean
  message: string
  added: RolledMod[]
  removed: RolledMod[]
}

const data = simData as unknown as { meta: unknown; bases: SimBase[]; mods: SimMod[] }
export const SIM_BASES: SimBase[] = data.bases
export const SIM_MODS: SimMod[] = data.mods

// affix kapasiteleri
function caps(r: Rarity): { p: number; s: number } {
  if (r === 'rare') return { p: 3, s: 3 }
  if (r === 'magic') return { p: 1, s: 1 }
  return { p: 0, s: 0 }
}

/** mod'un bu tabandaki ağırlığı: weights'te item'ın sahip olduğu İLK tag'in weight'i (yoksa 0). */
export function weightForBase(mod: SimMod, base: SimBase): number {
  for (const w of mod.weights) if (base.tags.includes(w.tag)) return w.weight
  return 0
}

function usedGroups(item: ItemState): Set<string> {
  const s = new Set<string>()
  for (const m of item.prefixes) if (m.mod.group) s.add(m.mod.group)
  for (const m of item.suffixes) if (m.mod.group) s.add(m.mod.group)
  return s
}

/** Bir affix için uygun mod havuzu (kurallara uyan). */
export function eligiblePool(item: ItemState, affix: 'prefix' | 'suffix'): Array<{ mod: SimMod; weight: number }> {
  const groups = usedGroups(item)
  const out: Array<{ mod: SimMod; weight: number }> = []
  for (const mod of SIM_MODS) {
    if (mod.domain !== item.base.domain) continue // flask mod'ları yalnız flask base'lerine
    if (mod.affix !== affix) continue
    if (mod.ilvl > item.ilvl) continue
    if (mod.group && groups.has(mod.group)) continue
    const w = weightForBase(mod, item.base)
    if (w > 0) out.push({ mod, weight: w })
  }
  return out
}

function weightedPick(pool: Array<{ mod: SimMod; weight: number }>): { mod: SimMod; weight: number } | null {
  let total = 0
  for (const e of pool) total += e.weight
  if (total <= 0) return null
  let r = Math.random() * total
  for (const e of pool) {
    r -= e.weight
    if (r < 0) return e
  }
  return pool[pool.length - 1]
}

// --- değer rollama (tier aralığından gerçek sayı) ---
function rollToken(tok: string): string {
  const m = tok.match(/\(?(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\)?/)
  if (m) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[2])
    const dec = m[1].includes('.') || m[2].includes('.')
    const v = a + Math.random() * (b - a)
    return dec ? v.toFixed(1) : String(Math.round(v))
  }
  const n = tok.match(/-?\d+(?:\.\d+)?/)
  return n ? n[0] : ''
}
/** Metindeki '#' yer tutucularını sırayla verilen değerlerle doldur. */
function fillHashes(text: string, vals: string[]): string {
  let i = 0
  return text.replace(/#/g, () => {
    const v = vals[i] ?? vals[vals.length - 1] ?? ''
    i++
    return v
  })
}
/** Bir mod'u TEK roll'da hem EN hem TR (aynı değerlerle) üret. */
export function rollMod(mod: SimMod): { en: string; tr: string } {
  const ranges = mod.values ? mod.values.split(' / ') : []
  const vals = ranges.map(rollToken)
  return { en: fillHashes(mod.text_en, vals), tr: mod.text_tr ? fillHashes(mod.text_tr, vals) : '' }
}

/** Satır içi "(a-b)" aralıklarını EN+TR'de AYNI değerlerle rollar (implicit gösterimi). */
export function rollInlineRangesPaired(en: string, tr: string): { en: string; tr: string } {
  const re = /\((-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\)/g
  const vals: string[] = []
  const rolledEn = en.replace(re, (_m, a: string, b: string) => {
    const dec = a.includes('.') || b.includes('.')
    const v = parseFloat(a) + Math.random() * (parseFloat(b) - parseFloat(a))
    const s = dec ? v.toFixed(1) : String(Math.round(v))
    vals.push(s)
    return s
  })
  let i = 0
  const rolledTr = tr.replace(re, () => vals[i++] ?? '')
  return { en: rolledEn, tr: rolledTr }
}

// --- state yardımcıları (saf: yeni state döndür) ---
// Doğal soket üst sınırı (küratör; veride yok — web genel kural). Jewellery/flask/quiver: 0.
const TWO_SOCKET = new Set(['Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace', 'Body Armour', 'Bow', 'Crossbow', 'Staff', 'Warstaff', 'Spear'])
const ONE_SOCKET = new Set([
  'One Hand Sword', 'One Hand Axe', 'One Hand Mace', 'Dagger', 'Claw', 'Flail', 'Wand', 'Sceptre',
  'Helmet', 'Gloves', 'Boots', 'Shield', 'Buckler', 'Focus'
])
export function socketMax(base: SimBase): number {
  if (TWO_SOCKET.has(base.item_class)) return 2
  if (ONE_SOCKET.has(base.item_class)) return 1
  return 0 // ring/amulet/belt/quiver/flask: rune soketi yok
}
export function makeItem(base: SimBase, ilvl: number): ItemState {
  return {
    base,
    ilvl,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    quality: 0,
    catalystTag: '',
    corrupted: false,
    implicits: [],
    sockets: { count: 0, max: socketMax(base), runes: [] }
  }
}
function clone(item: ItemState): ItemState {
  return {
    base: item.base,
    ilvl: item.ilvl,
    rarity: item.rarity,
    prefixes: item.prefixes.slice(),
    suffixes: item.suffixes.slice(),
    quality: item.quality,
    catalystTag: item.catalystTag,
    corrupted: item.corrupted,
    implicits: item.implicits.slice(),
    sockets: { count: item.sockets.count, max: item.sockets.max, runes: item.sockets.runes.slice() }
  }
}
export function modCount(item: ItemState): number {
  return item.prefixes.length + item.suffixes.length
}

interface AddOpts {
  affix?: 'prefix' | 'suffix' // omen: yalnız bu tarafa ekle (sinistral/dextral)
  homogenising?: boolean // omen: mevcut bir mod'la aynı tag'li mod ekle
}
/** Havuzdan (prefix+suffix, yer varsa) ağırlıklı bir mod ekle. opts ile omen davranışı. */
function addRandomMod(item: ItemState, opts: AddOpts = {}): { item: ItemState; added: RolledMod | null } {
  const c = caps(item.rarity)
  let pool: Array<{ mod: SimMod; weight: number }> = []
  if ((!opts.affix || opts.affix === 'prefix') && item.prefixes.length < c.p)
    for (const e of eligiblePool(item, 'prefix')) pool.push(e)
  if ((!opts.affix || opts.affix === 'suffix') && item.suffixes.length < c.s)
    for (const e of eligiblePool(item, 'suffix')) pool.push(e)
  if (opts.homogenising) {
    const existing = new Set<string>()
    for (const m of [...item.prefixes, ...item.suffixes]) for (const t of m.mod.tags) existing.add(t)
    const filtered = pool.filter((e) => e.mod.tags.some((t) => existing.has(t)))
    if (filtered.length) pool = filtered // eşleşen yoksa normale düş
  }
  const pick = weightedPick(pool)
  if (!pick) return { item, added: null }
  const rolled: RolledMod = { mod: pick.mod, ...rollMod(pick.mod) }
  const ni = clone(item)
  if (pick.mod.affix === 'prefix') ni.prefixes.push(rolled)
  else ni.suffixes.push(rolled)
  return { item: ni, added: rolled }
}

interface RemoveOpts {
  affix?: 'prefix' | 'suffix' // omen: yalnız bu taraftan kaldır (erasure)
  lowest?: boolean // omen: en düşük tier mod'u kaldır (whittling)
}
/** Bir mod kaldır (fractured korunur). opts ile omen davranışı. */
function removeRandomMod(item: ItemState, opts: RemoveOpts = {}): { item: ItemState; removed: RolledMod | null } {
  let all = [
    ...item.prefixes.filter((m) => !m.fractured).map((m) => ({ m, side: 'p' as const })),
    ...item.suffixes.filter((m) => !m.fractured).map((m) => ({ m, side: 's' as const }))
  ]
  if (opts.affix === 'prefix') all = all.filter((x) => x.side === 'p')
  else if (opts.affix === 'suffix') all = all.filter((x) => x.side === 's')
  if (!all.length) return { item, removed: null }
  let target: (typeof all)[number]
  if (opts.lowest) {
    // en yüksek tierOf = en zayıf (en düşük tier)
    target = all.reduce((a, b) => (tierOf(b.m.mod) > tierOf(a.m.mod) ? b : a))
  } else {
    target = all[Math.floor(Math.random() * all.length)]
  }
  const ni = clone(item)
  if (target.side === 'p') ni.prefixes = ni.prefixes.filter((x) => x !== target.m)
  else ni.suffixes = ni.suffixes.filter((x) => x !== target.m)
  return { item: ni, removed: target.m }
}

function res(item: ItemState, ok: boolean, message: string, added: RolledMod[] = [], removed: RolledMod[] = []): OpResult {
  return { item, ok, message, added, removed }
}

// --- Çekirdek currency işlemleri (Faz 1) — saf state→state ---
export function transmute(item: ItemState): OpResult {
  if (item.rarity !== 'normal') return res(item, false, 'Transmute yalnız Normal item')
  const ni = clone(item)
  ni.rarity = 'magic'
  const r = addRandomMod(ni)
  return res(r.item, true, 'Transmute → Magic', r.added ? [r.added] : [])
}
export function augment(item: ItemState): OpResult {
  if (item.rarity !== 'magic') return res(item, false, 'Augment yalnız Magic item')
  if (modCount(item) >= 2) return res(item, false, 'Magic dolu (1 prefix + 1 suffix)')
  const r = addRandomMod(item)
  return res(r.item, !!r.added, r.added ? 'Augment +1 mod' : 'Uygun mod yok', r.added ? [r.added] : [])
}
// Omen davranışları (bir sonraki currency'yi değiştirir)
export type OmenBehavior = 'sinistral' | 'dextral' | 'greater' | 'homogenising' | 'whittling' | 'corruption'
function addOptsFor(omen?: OmenBehavior): AddOpts {
  if (omen === 'sinistral') return { affix: 'prefix' }
  if (omen === 'dextral') return { affix: 'suffix' }
  if (omen === 'homogenising') return { homogenising: true }
  return {}
}
export function regal(item: ItemState, omen?: OmenBehavior): OpResult {
  if (item.rarity !== 'magic') return res(item, false, 'Regal yalnız Magic item')
  const ni = clone(item)
  ni.rarity = 'rare'
  const r = addRandomMod(ni, addOptsFor(omen))
  const tag = omen ? ` (${omen})` : ''
  return res(r.item, true, 'Regal → Rare +1 mod' + tag, r.added ? [r.added] : [])
}
export function exalt(item: ItemState, omen?: OmenBehavior): OpResult {
  if (item.rarity !== 'rare') return res(item, false, 'Exalt yalnız Rare item')
  if (modCount(item) >= 6) return res(item, false, 'Rare dolu (6 mod)')
  if (omen === 'greater') {
    const r1 = addRandomMod(item)
    if (!r1.added) return res(item, false, 'Uygun mod yok')
    const r2 = addRandomMod(r1.item)
    const added = [r1.added, ...(r2.added ? [r2.added] : [])]
    return res(r2.item, true, `Exalt (Greater): +${added.length} mod`, added)
  }
  const r = addRandomMod(item, addOptsFor(omen))
  const tag = omen ? ` (${omen})` : ''
  return res(r.item, !!r.added, r.added ? 'Exalt +1 mod' + tag : 'Uygun mod yok (omen tarafı dolu olabilir)', r.added ? [r.added] : [])
}
export function chaos(item: ItemState, omen?: OmenBehavior): OpResult {
  if (item.rarity !== 'rare') return res(item, false, 'Chaos yalnız Rare item')
  const rmOpts: RemoveOpts =
    omen === 'sinistral' ? { affix: 'prefix' } : omen === 'dextral' ? { affix: 'suffix' } : omen === 'whittling' ? { lowest: true } : {}
  const rm = removeRandomMod(item, rmOpts)
  const ad = addRandomMod(rm.item)
  const tag = omen ? ` (${omen})` : ''
  return res(ad.item, true, 'Chaos: 1 çıkar + 1 ekle' + tag, ad.added ? [ad.added] : [], rm.removed ? [rm.removed] : [])
}
export function alchemy(item: ItemState): OpResult {
  if (item.rarity !== 'normal') return res(item, false, 'Alchemy yalnız Normal item')
  let ni = clone(item)
  ni.rarity = 'rare'
  const added: RolledMod[] = []
  for (let k = 0; k < 4; k++) {
    const r = addRandomMod(ni)
    if (!r.added) break
    ni = r.item
    added.push(r.added)
  }
  return res(ni, true, `Alchemy → Rare (${added.length} mod)`, added)
}
export function annul(item: ItemState): OpResult {
  if (modCount(item) === 0) return res(item, false, 'Kaldırılacak mod yok')
  const r = removeRandomMod(item)
  return res(r.item, !!r.removed, r.removed ? 'Annul: 1 mod kaldırıldı' : '—', [], r.removed ? [r.removed] : [])
}
export function divine(item: ItemState): OpResult {
  if (modCount(item) === 0) return res(item, false, 'Divine için mod yok')
  const reroll = (m: RolledMod): RolledMod => (m.fractured ? m : { mod: m.mod, ...rollMod(m.mod) })
  const ni = clone(item)
  ni.prefixes = ni.prefixes.map(reroll)
  ni.suffixes = ni.suffixes.map(reroll)
  return res(ni, true, 'Divine: değerler yeniden yuvarlandı (fractured korunur)')
}
// Fracturing Orb: rare + ≥4 mod, kilitli yoksa → rastgele 1 mod'u "fractured" (kilitli) yap.
export function fracture(item: ItemState): OpResult {
  if (item.rarity !== 'rare') return res(item, false, 'Fracture yalnız Rare item')
  if (modCount(item) < 4) return res(item, false, 'En az 4 mod gerekir')
  const all = [...item.prefixes, ...item.suffixes]
  if (all.some((m) => m.fractured)) return res(item, false, 'Item zaten fractured')
  const ni = clone(item)
  const list = [...ni.prefixes, ...ni.suffixes]
  const victimIdx = Math.floor(Math.random() * list.length)
  const victim = list[victimIdx]
  // aynı mod'u fractured işaretle (yeni referans)
  const mark = (arr: RolledMod[]): RolledMod[] => arr.map((m) => (m === victim ? { ...m, fractured: true } : m))
  ni.prefixes = mark(ni.prefixes)
  ni.suffixes = mark(ni.suffixes)
  return res(ni, true, 'Fracture: «' + victim.en.replace(/\n/g, ' ') + '» kilitlendi')
}

// --- VAAL ORB (Faz 4d): corrupt ---
// Corruption implicit havuzu (küratör, web-doğrulı örnekler; gerçek havuz daha geniş olabilir).
// item-class kategorisine göre; kategoride yoksa "veri yok" temsili implicit.
const CORRUPT_IMPLICITS: Record<string, { en: string; tr: string }[]> = {
  helmet: [
    { en: '+1 to Level of all Minion Skills', tr: 'tüm Uşak Yeteneklerinin Seviyesine +1' },
    { en: '+8% to maximum Fire Resistance', tr: 'Azami Ateş Direncine +8%' }
  ],
  body_armour: [{ en: '+1 to Level of all Skill Gems', tr: 'tüm Yetenek Taşlarının Seviyesine +1' }],
  boots: [{ en: 'Cannot be Frozen', tr: 'Dondurulamaz' }],
  gloves: [{ en: '+18% to Critical Damage Bonus', tr: 'Kritik Hasar Bonusuna +18%' }],
  ring: [{ en: '+8% to maximum Lightning Resistance', tr: 'Azami Yıldırım Direncine +8%' }],
  amulet: [{ en: '+1 to Level of all Skill Gems', tr: 'tüm Yetenek Taşlarının Seviyesine +1' }],
  weapon: [{ en: 'Hits cannot be Evaded', tr: 'Vuruşlar Kaçınılamaz' }],
  shield: [{ en: 'Cannot be Stunned', tr: 'Sersemletilemez' }],
  focus: [{ en: 'Cannot be Stunned', tr: 'Sersemletilemez' }]
}
export type VaalOutcome = 'no_change' | 'implicit' | 'reroll' | 'socket'
/** Vaal Orb: ~%25 eşit 4 sonuç (Maxroll corruption-outcomes, web-doğrulı). Corrupt → kilitlenir.
 *  omenCorruption=true (Omen of Corruption) "değişmez" sonucunu eler (diğer 3 arasında ~%33). */
export function vaal(item: ItemState, omenCorruption?: boolean): OpResult {
  if (item.corrupted) return res(item, false, 'Item zaten corrupted')
  const pool: VaalOutcome[] = omenCorruption ? ['implicit', 'reroll', 'socket'] : ['no_change', 'implicit', 'reroll', 'socket']
  const outcome = pool[Math.floor(Math.random() * pool.length)]
  const ni = clone(item)
  ni.corrupted = true
  if (outcome === 'no_change') {
    return res(ni, true, 'Vaal: değişmedi (yalnız corrupt)')
  }
  if (outcome === 'socket') {
    // Vaal doğal cap'i aşabilir (en fazla 3); soketlenemeyen tabanda (takı) implicit'e düş
    if (socketMax(item.base) === 0) {
      ni.corrupted = true
      return res(ni, true, 'Vaal: değişmedi (bu taban soketlenemez)')
    }
    ni.sockets = { ...ni.sockets, count: Math.min(3, ni.sockets.count + 1) }
    return res(ni, true, `Vaal: soket eklendi (${ni.sockets.count})`)
  }
  if (outcome === 'implicit') {
    const cat = itemCategory(item.base)
    const pickPool = CORRUPT_IMPLICITS[cat]
    if (pickPool && pickPool.length) {
      const imp = pickPool[Math.floor(Math.random() * pickPool.length)]
      ni.implicits = [...ni.implicits, imp]
      return res(ni, true, `Vaal: corruption implicit — ${imp.en}`)
    }
    ni.implicits = [...ni.implicits, { en: '(corruption implicit — veri yok)', tr: '(corruption implicit — veri yok)' }]
    return res(ni, true, 'Vaal: corruption implicit (bu sınıf için veri yok)')
  }
  // reroll: fractured olmayan tüm mod'ları yeniden roll
  const keepP = ni.prefixes.filter((m) => m.fractured)
  const keepS = ni.suffixes.filter((m) => m.fractured)
  const reN = ni.prefixes.length - keepP.length + (ni.suffixes.length - keepS.length)
  ni.prefixes = keepP
  ni.suffixes = keepS
  let cur = ni
  for (let k = 0; k < reN; k++) {
    const r = addRandomMod(cur)
    if (!r.added) break
    cur = r.item
  }
  cur.corrupted = true
  return res(cur, true, 'Vaal: tüm mod’lar yeniden rollandı')
}

// --- SOKET + RUNE (Faz 4e) ---
export interface RuneSim {
  id: string
  en: string
  tr: string
  kind: 'rune' | 'soul_core'
  classes: string
  effect_en: string
  effect_tr: string
  mappable: boolean
  reason: string
  icon: string | null
}
export const SIM_RUNES: RuneSim[] = (runeData as unknown as { runes: RuneSim[] }).runes

/** Artificer's Orb: uygun ekipmana +1 soket (doğal max'a kadar). */
export function artificer(item: ItemState): OpResult {
  if (item.corrupted) return res(item, false, 'Item corrupted')
  if (item.sockets.max === 0) return res(item, false, 'Bu taban soketlenemez (silah/zırh değil)')
  if (item.sockets.count >= item.sockets.max) return res(item, false, `Soket dolu (max ${item.sockets.max})`)
  const ni = clone(item)
  ni.sockets = { ...ni.sockets, count: ni.sockets.count + 1 }
  return res(ni, true, `Artificer: +1 soket (${ni.sockets.count}/${ni.sockets.max})`)
}

// rune'un uygulanabilir class metni base ile uyuyor mu (kaba metin eşleşmesi)
function runeFitsBase(r: RuneSim, base: SimBase): boolean {
  const cls = r.classes.toLowerCase()
  if (/any equipment/.test(cls)) return socketMax(base) > 0
  const ic = base.item_class.toLowerCase()
  if (cls.includes(ic)) return true
  // genel kategoriler
  if (/martial weapon|^weapon/.test(cls) && isWeaponBase(base)) return true
  if (/armour/.test(cls) && isArmourBase(base)) return true
  return false
}
export function canSocketRune(item: ItemState, r: RuneSim): { ok: boolean; reason: string } {
  if (!r.mappable) return { ok: false, reason: r.reason || 'Etki verisi yok' }
  if (item.corrupted) return { ok: false, reason: 'Item corrupted' }
  if (item.sockets.count === 0) return { ok: false, reason: 'Önce Artificer ile soket aç' }
  if (item.sockets.runes.length >= item.sockets.count) return { ok: false, reason: 'Boş soket yok' }
  if (!runeFitsBase(r, item.base)) return { ok: false, reason: `Yalnız: ${r.classes}` }
  return { ok: true, reason: '' }
}
export function socketRune(item: ItemState, r: RuneSim): OpResult {
  const can = canSocketRune(item, r)
  if (!can.ok) return res(item, false, can.reason)
  const ni = clone(item)
  ni.sockets = {
    ...ni.sockets,
    runes: [...ni.sockets.runes, { id: r.id, name_en: r.en, name_tr: r.tr, effect_en: r.effect_en, effect_tr: r.effect_tr }]
  }
  return res(ni, true, `${r.en} takıldı: ${r.effect_en}`)
}

// --- KALİTE (Faz 4a) ---
const ARMOUR_CLASSES = new Set(['Helmet', 'Body Armour', 'Gloves', 'Boots', 'Shield', 'Buckler', 'Focus'])
export function isWeaponBase(b: SimBase): boolean {
  return itemCategory(b) === 'weapon'
}
export function isArmourBase(b: SimBase): boolean {
  return ARMOUR_CLASSES.has(b.item_class)
}
function addQuality(item: ItemState): OpResult {
  if (item.quality >= 20) return res(item, false, 'Kalite zaten %20 (maksimum)')
  const ni = clone(item)
  ni.quality = Math.min(20, ni.quality + 5)
  return res(ni, true, `Kalite → %${ni.quality}`)
}
export function blacksmith(item: ItemState): OpResult {
  if (!isWeaponBase(item.base)) return res(item, false, 'Yalnız silah (martial weapon)')
  return addQuality(item)
}
export function armourer(item: ItemState): OpResult {
  if (!isArmourBase(item.base)) return res(item, false, 'Yalnız zırh')
  return addQuality(item)
}
export function glassblower(item: ItemState): OpResult {
  if (item.base.domain !== 'flask') return res(item, false, 'Yalnız iksir/charm')
  return addQuality(item)
}
export interface DisplayStat {
  label_en: string
  label_tr: string
  value: string
}
/** Quality ile ölçeklenmiş base_stat'lar (silah phys / zırh savunma). Gerçek değer. */
export function qualityStats(item: ItemState): DisplayStat[] {
  const q = item.quality
  const bs = item.base.base_stats || {}
  const scale = (n: number): number => Math.round(n * (1 + q / 100))
  const out: DisplayStat[] = []
  if (typeof bs.phys_min === 'number' && typeof bs.phys_max === 'number') {
    out.push({ label_en: 'Physical Damage', label_tr: 'Fiziksel Hasar', value: scale(bs.phys_min) + '–' + scale(bs.phys_max) })
    if (typeof bs.aps === 'number') out.push({ label_en: 'Attacks per Second', label_tr: 'Saniyedeki Saldırı', value: bs.aps.toFixed(2) })
    if (typeof bs.crit === 'number') out.push({ label_en: 'Critical Chance', label_tr: 'Kritik Şans', value: bs.crit + '%' })
  }
  if (typeof bs.armour === 'number') out.push({ label_en: 'Armour', label_tr: 'Zırh', value: String(scale(bs.armour)) })
  if (typeof bs.evasion === 'number') out.push({ label_en: 'Evasion', label_tr: 'Kaçınma', value: String(scale(bs.evasion)) })
  if (typeof bs.energy_shield === 'number') out.push({ label_en: 'Energy Shield', label_tr: 'Enerji Kalkanı', value: String(scale(bs.energy_shield)) })
  return out
}

// --- CATALYST (Faz 4b): takıda tag-bazlı kalite ---
export interface CatalystSim {
  id: string
  en: string
  tr: string
  type: string
  tag: string
  target: 'jewellery' | 'jewel'
  mappable: boolean
  reason: string
  icon: string | null
}
export const SIM_CATALYSTS: CatalystSim[] = (catData as unknown as { catalysts: CatalystSim[] }).catalysts
const JEWELLERY_CLASSES = new Set(['Ring', 'Amulet', 'Belt'])

export function canApplyCatalyst(item: ItemState, c: CatalystSim): { ok: boolean; reason: string } {
  if (!c.mappable) return { ok: false, reason: c.reason || 'veri yok' }
  if (c.target === 'jewel') return { ok: false, reason: 'Jewel’e uygulanır (kapsam dışı)' }
  if (!JEWELLERY_CLASSES.has(item.base.item_class)) return { ok: false, reason: 'Yalnız ring/amulet/belt' }
  // aynı tag'de %20 dolduysa daha fazla yok; farklı tag her zaman değiştirir
  if (item.catalystTag === c.tag && item.quality >= 20) return { ok: false, reason: 'Kalite %20 (maks)' }
  return { ok: true, reason: '' }
}
export function applyCatalyst(item: ItemState, c: CatalystSim): OpResult {
  const can = canApplyCatalyst(item, c)
  if (!can.ok) return res(item, false, can.reason)
  const ni = clone(item)
  if (ni.catalystTag !== c.tag) {
    // farklı catalyst -> kalite türü değişir, baştan başlar
    ni.catalystTag = c.tag
    ni.quality = 5
  } else {
    ni.quality = Math.min(20, ni.quality + 5)
  }
  return res(ni, true, `${c.en} → kalite %${ni.quality} (${c.tag})`)
}

/** Catalyst kalitesi: mod o tag'i taşıyorsa değerleri %quality oranında artırılmış gösterilir. */
export function catalystBoosted(item: ItemState, m: RolledMod): { en: string; tr: string; boosted: boolean } {
  const q = item.quality
  if (!q || !item.catalystTag || !m.mod.tags.includes(item.catalystTag)) return { en: m.en, tr: m.tr, boosted: false }
  const factor = 1 + q / 100
  const scale = (s: string): string =>
    s.replace(/\d+(\.\d+)?/g, (n) => {
      const v = parseFloat(n) * factor
      return n.includes('.') ? v.toFixed(1) : String(Math.round(v))
    })
  return { en: scale(m.en), tr: scale(m.tr), boosted: true }
}

// --- OMEN (Faz 4c): bir sonraki currency'nin davranışını değiştirir ---
export interface OmenSim {
  id: string
  en: string
  tr: string
  op: 'exalt' | 'regal' | 'chaos' | 'vaal' | ''
  behavior: OmenBehavior | ''
  effect_en: string
  effect_tr: string
  mappable: boolean
  reason: string
  icon: string | null
}
export const SIM_OMENS: OmenSim[] = (omenData as unknown as { omens: OmenSim[] }).omens

export function findBase(en: string): SimBase | undefined {
  return SIM_BASES.find((b) => b.en === en)
}

// ---------------- ESSENCE (Faz 2) ----------------
export interface EssenceSim {
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
    special: boolean
    classes: string[]
    classGroups: Record<string, string> | null
  } | null
  icon: string | null
}
export const SIM_ESSENCES: EssenceSim[] = (essData as unknown as { essences: EssenceSim[] }).essences

// item_class -> kategori (classGroups/classes anahtarlarıyla uyumlu)
const CLASS_CAT: Record<string, string> = {
  Ring: 'ring',
  Amulet: 'amulet',
  Belt: 'belt',
  Helmet: 'helmet',
  'Body Armour': 'body_armour',
  Gloves: 'gloves',
  Boots: 'boots',
  Shield: 'shield',
  Buckler: 'shield',
  Focus: 'focus',
  Quiver: 'quiver'
}
export function itemCategory(base: SimBase): string {
  if (CLASS_CAT[base.item_class]) return CLASS_CAT[base.item_class]
  if (base.tags.includes('weapon')) return 'weapon'
  return base.item_class.toLowerCase()
}

/** Essence'in bu item için garantileyeceği hedef mod grubu (yoksa ''). */
function essenceGroup(item: ItemState, e: EssenceSim): string {
  const t = e.target
  if (!t) return ''
  const cat = itemCategory(item.base)
  if (t.classGroups) return t.classGroups[cat] ?? ''
  // normal/special: silahsa weaponGroup, değilse otherGroup
  return cat === 'weapon' ? t.weaponGroup || t.otherGroup : t.otherGroup || t.weaponGroup
}

/** Garantili mod adayı: hedef gruptan, ilvl≤min(item.ilvl,cap), en yüksek tier; yer olan affix tercih. */
function essenceCandidate(item: ItemState, e: EssenceSim): SimMod | null {
  const grp = essenceGroup(item, e)
  if (!grp) return null
  const all = SIM_MODS.filter((m) => m.group === grp && m.ilvl <= item.ilvl)
  if (!all.length) return null
  const capped = all.filter((m) => m.ilvl <= e.ilvlCap)
  const pool = (capped.length ? capped : all).slice().sort((a, b) => b.ilvl - a.ilvl)
  // rare kapasitesine göre yer olan affix'i tercih (EssenceAbyss prefix/suffix için)
  const roomy = pool.find((m) =>
    m.affix === 'prefix' ? item.prefixes.length < 3 : item.suffixes.length < 3
  )
  return roomy ?? pool[0]
}

/** Essence uygulanabilir mi? (roll yapmadan) */
export function canApplyEssence(item: ItemState, e: EssenceSim): { ok: boolean; reason: string } {
  const no = (r: string): { ok: boolean; reason: string } => ({ ok: false, reason: r })
  if (item.base.domain === 'flask') return no('Essence iksirlere uygulanmaz')
  if (!e.mappable) return no(e.reason || 'Bu essence simüle edilemez (veri yok)')
  if (e.mode === 'magic_to_rare' && item.rarity !== 'magic') return no('Magic item gerekir')
  if (e.mode === 'rare_remove_add' && item.rarity !== 'rare') return no('Rare item gerekir')
  const t = e.target!
  const cat = itemCategory(item.base)
  if (t.classes.length && !t.classes.includes(cat))
    return no('Yalnız şu item-class’lar: ' + t.classes.join(', '))
  const grp = essenceGroup(item, e)
  if (!grp) return no('Bu item-class için tanımlı essence mod yok')
  const cand = essenceCandidate(item, e)
  if (!cand) return no('Bu ilvl’de uygun tier yok')
  // magic→rare: aynı grup zaten varsa eklenemez
  if (e.mode === 'magic_to_rare') {
    const used = usedGroups(item)
    if (used.has(grp)) return no('Bu mod grubu item’da zaten var')
    // affix tarafı magic'te dolu olabilir mi? rare 3 kapasiteli, magic max 1 → her zaman yer var
  }
  return { ok: true, reason: '' }
}

/** Garantili mod önizlemesi (pattern, iki dilli, approx). */
export function essencePreview(
  item: ItemState,
  e: EssenceSim
): { en: string; tr: string; affix: 'prefix' | 'suffix'; group: string; approx: boolean } | null {
  const cand = essenceCandidate(item, e)
  if (!cand) return null
  return {
    en: cand.text_en,
    tr: cand.text_tr,
    affix: cand.affix,
    group: cand.group,
    approx: !!e.target?.approx
  }
}

/** Essence uygula (saf state→state). */
export function applyEssence(item: ItemState, e: EssenceSim): OpResult {
  const can = canApplyEssence(item, e)
  if (!can.ok) return res(item, false, can.reason)
  const cand = essenceCandidate(item, e)!
  const rolled: RolledMod = { mod: cand, ...rollMod(cand) }
  let ni = clone(item)
  const removed: RolledMod[] = []

  if (e.mode === 'rare_remove_add') {
    // garantili mod'un affix tarafı doluysa O taraftan, değilse rastgele çıkar
    const sideFull = cand.affix === 'prefix' ? ni.prefixes.length >= 3 : ni.suffixes.length >= 3
    let rm: { item: ItemState; removed: RolledMod | null }
    if (sideFull) {
      // hedef affix tarafından bir mod çıkar
      const arr = cand.affix === 'prefix' ? ni.prefixes : ni.suffixes
      const victim = arr[Math.floor(Math.random() * arr.length)]
      const n2 = clone(ni)
      if (cand.affix === 'prefix') n2.prefixes = n2.prefixes.filter((x) => x !== victim)
      else n2.suffixes = n2.suffixes.filter((x) => x !== victim)
      rm = { item: n2, removed: victim }
    } else {
      rm = removeRandomMod(ni)
    }
    ni = rm.item
    if (rm.removed) removed.push(rm.removed)
  } else {
    // magic → rare
    ni.rarity = 'rare'
  }

  // garantili mod'u force-add (weight'siz)
  if (cand.affix === 'prefix') ni.prefixes.push(rolled)
  else ni.suffixes.push(rolled)

  const label = `${e.en}${e.target?.approx ? ' (yaklaşık değer)' : ''}`
  return res(ni, true, label, [rolled], removed)
}

// --- UI yardımcıları (saf) ---
/** Bir işlem şu state'e uygulanabilir mi? (roll yapmadan ön-koşul kontrolü) */
export function canApply(item: ItemState, op: OpName): { ok: boolean; reason: string } {
  const n = modCount(item)
  const yes = { ok: true, reason: '' }
  const no = (r: string): { ok: boolean; reason: string } => ({ ok: false, reason: r })
  // Corrupted item'a hiçbir işlem uygulanamaz
  if (item.corrupted) return no('Item corrupted (artık değiştirilemez)')
  // İksirler (flask/charm) yalnız Magic olabilir — Rare yapan/gerektiren op'lar uygulanamaz
  if (item.base.domain === 'flask' && (op === 'regal' || op === 'exalt' || op === 'chaos' || op === 'alchemy'))
    return no('İksirler Rare olamaz (sadece Magic)')
  switch (op) {
    case 'transmute':
      return item.rarity === 'normal' ? yes : no('Yalnız Normal item')
    case 'augment':
      return item.rarity !== 'magic' ? no('Yalnız Magic item') : n >= 2 ? no('Magic dolu (1+1)') : yes
    case 'regal':
      return item.rarity === 'magic' ? yes : no('Yalnız Magic item')
    case 'exalt':
      return item.rarity !== 'rare' ? no('Yalnız Rare item') : n >= 6 ? no('Rare dolu (6 mod)') : yes
    case 'chaos':
      return item.rarity === 'rare' ? yes : no('Yalnız Rare item')
    case 'alchemy':
      return item.rarity === 'normal' ? yes : no('Yalnız Normal item')
    case 'annul':
      return n > 0 ? yes : no('Kaldırılacak mod yok')
    case 'divine':
      return n > 0 ? yes : no('Değer için mod yok')
    case 'fracture':
      return item.rarity !== 'rare'
        ? no('Yalnız Rare item')
        : n < 4
          ? no('En az 4 mod gerekir')
          : [...item.prefixes, ...item.suffixes].some((m) => m.fractured)
            ? no('Item zaten fractured')
            : yes
    case 'blacksmith':
      return !isWeaponBase(item.base) ? no('Yalnız silah') : item.quality >= 20 ? no('Kalite %20 (maks)') : yes
    case 'armourer':
      return !isArmourBase(item.base) ? no('Yalnız zırh') : item.quality >= 20 ? no('Kalite %20 (maks)') : yes
    case 'glassblower':
      return item.base.domain !== 'flask' ? no('Yalnız iksir/charm') : item.quality >= 20 ? no('Kalite %20 (maks)') : yes
    case 'vaal':
      return yes // normal/magic/rare hepsi corrupt edilebilir (corrupted üstte engellendi)
    case 'artificer':
      return item.sockets.max === 0
        ? no('Bu taban soketlenemez')
        : item.sockets.count >= item.sockets.max
          ? no(`Soket dolu (max ${item.sockets.max})`)
          : yes
    default:
      return no('Bilinmeyen')
  }
}

// Tier rank: aynı affix+group ailesi ilvl'e göre azalan; T1 = en yüksek ilvl (en güçlü).
const familyCache = new Map<string, SimMod[]>()
function family(mod: SimMod): SimMod[] {
  const key = mod.affix + '|' + mod.group
  let fam = familyCache.get(key)
  if (!fam) {
    fam = SIM_MODS.filter((m) => m.affix === mod.affix && m.group === mod.group).sort((a, b) => b.ilvl - a.ilvl)
    familyCache.set(key, fam)
  }
  return fam
}
export function tierOf(mod: SimMod): number {
  if (!mod.group) return 1
  const fam = family(mod)
  const idx = fam.findIndex((m) => m.id === mod.id)
  return idx < 0 ? 1 : idx + 1
}
export function tierCount(mod: SimMod): number {
  return mod.group ? family(mod).length : 1
}

/** Bir mod'un tier değer aralığını okunur metne çevirir: "(80-99)% / (10-20)" → "80–99% / 10–20". */
export function tierRangeText(mod: SimMod): string {
  if (!mod.values) return ''
  return mod.values.replace(/\(\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*\)/g, '$1–$2')
}

/** Bir grubun affix'i için tier-bazlı (T1..Tn) değer aralığı metinleri (index = tier-1). */
export function groupTierRanges(group: string, affix: 'prefix' | 'suffix'): string[] {
  const fam = SIM_MODS.filter((m) => m.group === group && m.affix === affix).sort((a, b) => b.ilvl - a.ilvl)
  return fam.map((m) => tierRangeText(m))
}

/**
 * ELLE GİRİŞ (gerçek oyun sonucu): bir grup+affix için, kullanıcının girdiği gerçek değer(ler)e uyan
 * SimMod'u seç + o değerlerle RolledMod üret. Tier, değerin tier aralıklarına oturtulmasıyla belirlenir
 * (build-craft-seed.tierForValue ile aynı mantık). Değer verilmezse T1, taban için geçerli mod yoksa null.
 */
export function manualModForValue(
  base: SimBase,
  group: string,
  affix: 'prefix' | 'suffix',
  valuesText: string
): RolledMod | null {
  const cands = SIM_MODS.filter(
    (m) => m.group === group && m.affix === affix && m.domain === base.domain && weightForBase(m, base) > 0
  ).sort((a, b) => tierOf(a) - tierOf(b)) // T1 başta
  if (!cands.length) return null
  const nums = valuesText.match(/-?\d+(?:\.\d+)?/g) || []
  let mod = cands[0]
  if (nums.length) {
    const val = Math.max(...nums.map(Number))
    const ranges = groupTierRanges(group, affix) // index 0 = T1
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
    const tierNum = bestIdx >= 0 ? bestIdx + 1 : ranges.length
    mod = cands.find((c) => tierOf(c) === tierNum) ?? cands[Math.min(tierNum - 1, cands.length - 1)] ?? cands[0]
  }
  const vals = nums.length ? nums : mod.values ? mod.values.split(' / ').map(rollToken) : []
  return { mod, en: fillHashes(mod.text_en, vals), tr: mod.text_tr ? fillHashes(mod.text_tr, vals) : '' }
}

/** Birden çok tier'ı birleştirip toplam değer aralığı verir (en düşük alt – en yüksek üst sınır). */
function combinedRange(mods: SimMod[]): string {
  const segs: { lo: number; hi: number; dec: boolean; suffix: string }[] = []
  for (const mod of mods) {
    if (!mod.values) continue
    mod.values.split(' / ').forEach((p, i) => {
      const suffix = p.includes('%') ? '%' : ''
      const m = p.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/)
      let lo: number, hi: number, dec: boolean
      if (m) {
        lo = parseFloat(m[1])
        hi = parseFloat(m[2])
        dec = m[1].includes('.') || m[2].includes('.')
      } else {
        const n = p.match(/-?\d+(?:\.\d+)?/)
        if (!n) return
        lo = hi = parseFloat(n[0])
        dec = n[0].includes('.')
      }
      const s = segs[i]
      if (!s) segs[i] = { lo, hi, dec, suffix }
      else {
        s.lo = Math.min(s.lo, lo)
        s.hi = Math.max(s.hi, hi)
        s.dec = s.dec || dec
        if (!s.suffix) s.suffix = suffix
      }
    })
  }
  return segs
    .map((s) => {
      const fmt = (v: number): string => (s.dec ? v.toFixed(1) : String(Math.round(v)))
      return (s.lo === s.hi ? fmt(s.lo) : fmt(s.lo) + '–' + fmt(s.hi)) + s.suffix
    })
    .join(' / ')
}

// ---------------- HEDEF EŞYA (Faz 3b) ----------------
export interface TargetableGroup {
  group: string
  en: string
  tr: string
  affix: 'prefix' | 'suffix'
  tierMax: number
  bestTier: number // bu base/ilvl'de erişilebilecek en iyi tier (yoksa tierMax+1)
}
/** Bir base+ilvl için hedef seçilebilecek (eligible) mod grupları. */
export function targetableGroups(base: SimBase, ilvl: number): TargetableGroup[] {
  const byGroup = new Map<string, { affix: 'prefix' | 'suffix'; en: string; tr: string; mods: SimMod[] }>()
  for (const m of SIM_MODS) {
    if (m.domain !== base.domain || !m.group) continue
    if (weightForBase(m, base) <= 0) continue
    let g = byGroup.get(m.group)
    if (!g) {
      g = { affix: m.affix, en: m.text_en, tr: m.text_tr, mods: [] }
      byGroup.set(m.group, g)
    }
    g.mods.push(m)
  }
  const out: TargetableGroup[] = []
  for (const [group, g] of byGroup) {
    const reachable = g.mods.filter((m) => m.ilvl <= ilvl)
    const tierMax = tierCount(g.mods[0])
    const bestTier = reachable.length ? Math.min(...reachable.map((m) => tierOf(m))) : tierMax + 1
    out.push({ group, en: g.en, tr: g.tr, affix: g.affix, tierMax, bestTier })
  }
  out.sort((a, b) => (a.affix === b.affix ? a.en.localeCompare(b.en) : a.affix === 'prefix' ? -1 : 1))
  return out
}

export interface TargetEntry {
  group: string
  minTier: number // kabul edilen en kötü tier (T{minTier} veya daha iyi)
}

// Essence, normal havuzun tier-cap'ini aşabilir. Base+ilvl için bir grubu essence ile
// erişilebilecek en iyi tier (yoksa 99). Feasibility bunu hesaba katar.
function essenceGroupForBase(base: SimBase, e: EssenceSim): string {
  const t = e.target
  if (!t) return ''
  const cat = itemCategory(base)
  if (t.classGroups) return t.classGroups[cat] ?? ''
  return cat === 'weapon' ? t.weaponGroup || t.otherGroup : t.otherGroup || t.weaponGroup
}
function essenceBestTier(base: SimBase, ilvl: number, group: string): number {
  let best = 99
  for (const e of SIM_ESSENCES) {
    if (!e.mappable) continue
    if (essenceGroupForBase(base, e) !== group) continue
    const cap = Math.min(ilvl, e.ilvlCap)
    const mods = SIM_MODS.filter((m) => m.group === group && m.domain === base.domain && m.ilvl <= cap)
    if (!mods.length) continue
    const t = Math.min(...mods.map((m) => tierOf(m)))
    if (t < best) best = t
  }
  return best
}
export interface TargetRow {
  group: string
  en: string
  tr: string
  affix: 'prefix' | 'suffix'
  minTier: number
  tierMax: number
  currentTier: number | null
  met: boolean
  feasible: boolean
  reasonCode: '' | 'not_on_base' | 'tier_unreachable'
  bestTier: number
}
export interface TargetStatus {
  rows: TargetRow[]
  reached: boolean
  feasible: boolean
  prefixWant: number
  suffixWant: number
  cap: number
  limitOver: boolean
}
/** Mevcut item'a göre hedefi değerlendir: ulaşıldı mı + çıkmaz mı. */
export function evaluateTarget(item: ItemState, targets: TargetEntry[]): TargetStatus {
  const base = item.base
  const cap = base.domain === 'flask' ? 1 : 3
  let prefixWant = 0
  let suffixWant = 0
  const rows: TargetRow[] = targets.map((t) => {
    const groupMods = SIM_MODS.filter((m) => m.group === t.group && m.domain === base.domain)
    const any = groupMods[0]
    const affix = any?.affix ?? 'prefix'
    if (affix === 'prefix') prefixWant++
    else suffixWant++
    // mevcut item'da bu grup var mı + tier
    const present = [...item.prefixes, ...item.suffixes].find((m) => m.mod.group === t.group)
    const currentTier = present ? tierOf(present.mod) : null
    const met = currentTier !== null && currentTier <= t.minTier
    // teorik erişilebilirlik
    const eligible = groupMods.filter((m) => weightForBase(m, base) > 0)
    const reachable = eligible.filter((m) => m.ilvl <= item.ilvl)
    const normalBest = reachable.length ? Math.min(...reachable.map((m) => tierOf(m))) : 99
    // essence ile erişilebilen tier (normal havuzun cap'ini aşabilir)
    const essBest = essenceBestTier(base, item.ilvl, t.group)
    const bestTier = Math.min(normalBest, essBest)
    let feasible = true
    let reasonCode: TargetRow['reasonCode'] = ''
    if (met) {
      feasible = true
    } else if (!eligible.length && essBest === 99) {
      feasible = false
      reasonCode = 'not_on_base'
    } else if (bestTier > t.minTier) {
      feasible = false
      reasonCode = 'tier_unreachable'
    }
    return {
      group: t.group,
      en: any?.text_en ?? t.group,
      tr: any?.text_tr ?? '',
      affix,
      minTier: t.minTier,
      tierMax: any ? tierCount(any) : 1,
      currentTier,
      met,
      feasible,
      reasonCode,
      bestTier
    }
  })
  const limitOver = prefixWant > cap || suffixWant > cap
  const feasible = !limitOver && rows.every((r) => r.feasible)
  const reached = rows.length > 0 && rows.every((r) => r.met)
  return { rows, reached, feasible, prefixWant, suffixWant, cap, limitOver }
}

// ---------------- OFFLINE AKILLI ÇÖZÜCÜ (Faz 3c) ----------------
export interface Advice {
  kind: 'reached' | 'no_target' | 'deadend' | 'step'
  op?: OpName
  essence?: EssenceSim
  chance: number // 0..1 hedefe ilerletme olasılığı (essence'te 1)
  reasonCode: string // UI şablonu için
  targetEn?: string
  targetTr?: string
  deadendRows?: TargetRow[]
  limitOver?: boolean
}

/** Bir op'un eklenen mod'unun, verilen grup-setinden (eksik hedefler) olma toplam olasılığı. */
function pToward(item: ItemState, op: OpName, groups: Set<string>): number {
  const ch = groupChances(item, op)
  let p = 0
  for (const g of [...ch.prefix, ...ch.suffix]) if (groups.has(g.group)) p += g.chance
  return p
}
/** Eksik bir hedef grubunu garantileyen, şu an uygulanabilir en iyi-tier essence. */
function bestEssenceFor(item: ItemState, missing: Set<string>): EssenceSim | null {
  const rank: Record<string, number> = { Perfect: 4, Greater: 3, normal: 2, Lesser: 1 }
  let best: EssenceSim | null = null
  for (const e of SIM_ESSENCES) {
    if (!e.mappable) continue
    if (!canApplyEssence(item, e).ok) continue
    if (!missing.has(essenceGroup(item, e))) continue
    if (!best || (rank[e.tier] ?? 0) > (rank[best.tier] ?? 0)) best = e
  }
  return best
}

/** Mevcut state + hedeften EN İYİ sonraki adımı hesapla (deterministik, oyun kurallarında hatasız). */
export function adviseStep(item: ItemState, targets: TargetEntry[]): Advice {
  const status = evaluateTarget(item, targets)
  if (!status.rows.length) return { kind: 'no_target', chance: 0, reasonCode: '' }
  if (status.reached) return { kind: 'reached', chance: 1, reasonCode: '' }
  if (!status.feasible)
    return {
      kind: 'deadend',
      chance: 0,
      reasonCode: status.limitOver ? 'limit' : 'infeasible',
      deadendRows: status.rows.filter((r) => !r.feasible),
      limitOver: status.limitOver
    }

  const missingRows = status.rows.filter((r) => !r.met)
  // Normal havuz (exalt) bu tier'a ulaşabilir mi? Ulaşamıyorsa hedef ESSENCE-GEREKTİRİR.
  const normalBestOf = (group: string): number => {
    const ms = SIM_MODS.filter(
      (m) => m.group === group && m.domain === item.base.domain && weightForBase(m, item.base) > 0 && m.ilvl <= item.ilvl
    )
    return ms.length ? Math.min(...ms.map((m) => tierOf(m))) : 99
  }
  const essReq = (r: TargetRow): boolean => normalBestOf(r.group) > r.minTier
  const essReqAbsent = missingRows.filter((r) => r.currentTier === null && essReq(r))
  const normalAbsent = missingRows.filter((r) => r.currentTier === null && !essReq(r))
  const weak = missingRows.filter((r) => r.currentTier !== null)

  // ÖNCELİK 1: essence-gerektiren EKSİK hedefler — magic aşamasında (removal'sız) hallet.
  if (essReqAbsent.length) {
    const head = essReqAbsent[0]
    if (item.rarity === 'normal')
      return { kind: 'step', op: 'transmute', chance: 0, reasonCode: 'to_magic_for_essence', targetEn: head.en, targetTr: head.tr }
    const groups = new Set(essReqAbsent.map((r) => r.group))
    const ess = bestEssenceFor(item, groups)
    if (ess) {
      const row = essReqAbsent.find((r) => essenceGroup(item, ess) === r.group) ?? head
      const risk = ess.mode === 'rare_remove_add'
      return { kind: 'step', essence: ess, chance: 1, reasonCode: risk ? 'essence_risk' : 'essence', targetEn: row.en, targetTr: row.tr }
    }
  }

  // ÖNCELİK 2: normal-erişilebilir EKSİK hedefler — sadece-ekleme yoluyla.
  if (normalAbsent.length) {
    const groups = new Set(normalAbsent.map((r) => r.group))
    const head = normalAbsent[0]
    if (item.rarity === 'normal')
      return { kind: 'step', op: 'transmute', chance: pToward(item, 'transmute', groups), reasonCode: 'start', targetEn: head.en, targetTr: head.tr }
    if (item.rarity === 'magic') {
      const room = modCount(item) < 2
      const augP = room ? pToward(item, 'augment', groups) : 0
      if (room && augP > 0 && targets.length <= 2)
        return { kind: 'step', op: 'augment', chance: augP, reasonCode: 'augment', targetEn: head.en, targetTr: head.tr }
      return { kind: 'step', op: 'regal', chance: pToward(item, 'regal', groups), reasonCode: 'to_rare', targetEn: head.en, targetTr: head.tr }
    }
    // rare
    const needAffixes = new Set(normalAbsent.map((r) => r.affix))
    const hasRoom = modCount(item) < 6 && [...needAffixes].some((a) => (a === 'prefix' ? item.prefixes.length < 3 : item.suffixes.length < 3))
    if (hasRoom)
      return { kind: 'step', op: 'exalt', chance: pToward(item, 'exalt', groups), reasonCode: 'exalt', targetEn: head.en, targetTr: head.tr }
    // yer yok: annul rastgele kaldırır. Korunması gereken (met essence-gerektiren) mod varsa
    // thrash etme — yeniden dene öner. Yoksa annul ile yer aç.
    const metEssReq = status.rows.some((r) => r.met && essReq(r))
    const targetGroups = new Set(targets.map((t) => t.group))
    const nonTarget = [...item.prefixes, ...item.suffixes].filter((m) => !targetGroups.has(m.mod.group))
    if (nonTarget.length && !metEssReq)
      return { kind: 'step', op: 'annul', chance: 0, reasonCode: 'annul_room', targetEn: head.en, targetTr: head.tr }
    return { kind: 'deadend', chance: 0, reasonCode: 'restart', deadendRows: missingRows }
  }

  // ÖNCELİK 3: var ama tier düşük — essence-gerektiriyorsa Perfect essence (riskli), değilse chaos reroll.
  if (weak.length) {
    const head = weak[0]
    if (essReq(head)) {
      const ess = bestEssenceFor(item, new Set([head.group]))
      if (ess)
        return { kind: 'step', essence: ess, chance: 1, reasonCode: 'essence_risk', targetEn: head.en, targetTr: head.tr }
    }
    return { kind: 'step', op: 'chaos', chance: 0, reasonCode: 'tier_reroll', targetEn: head.en, targetTr: head.tr }
  }
  return { kind: 'deadend', chance: 0, reasonCode: 'no_room', deadendRows: missingRows }
}

// --- Tek-adım grup olasılığı (anlık; tam zincir-motor DEĞİL) ---
/** Bir op'un rastgele MOD EKLEME adımından hemen önceki state (havuz bunun üstünden hesaplanır). */
export function previewAddState(item: ItemState, op: OpName): ItemState | null {
  switch (op) {
    case 'transmute':
      return { ...item, rarity: 'magic', prefixes: [], suffixes: [] } // boş magic
    case 'alchemy':
      return { ...item, rarity: 'rare', prefixes: [], suffixes: [] } // boş rare (ilk ekleme)
    case 'augment':
      return item // mevcut magic
    case 'regal':
      return { ...item, rarity: 'rare' } // rare, mevcut magic mod'ları kalır
    case 'exalt':
    case 'chaos':
      return item // mevcut rare (chaos: çıkarma modellenmez ≈ yaklaşık)
    default:
      return null // annul / divine ekleme yapmaz
  }
}

export interface GroupChance {
  group: string
  affix: 'prefix' | 'suffix'
  en: string
  tr: string
  weight: number
  chance: number // 0..1 (birleşik havuza göre)
  range: string // bu grupta erişilebilir tier'ların birleşik değer aralığı
}
export interface ChancePreview {
  total: number
  prefix: GroupChance[]
  suffix: GroupChance[]
}

/** Verilen op uygulandığında eklenecek mod'un grup-bazlı düşme şansları (anlık). */
export function groupChances(item: ItemState, op: OpName): ChancePreview {
  const state = previewAddState(item, op)
  if (!state) return { total: 0, prefix: [], suffix: [] }
  const c = caps(state.rarity)
  const pool: Array<{ mod: SimMod; weight: number }> = []
  if (state.prefixes.length < c.p) pool.push(...eligiblePool(state, 'prefix'))
  if (state.suffixes.length < c.s) pool.push(...eligiblePool(state, 'suffix'))
  let total = 0
  for (const e of pool) total += e.weight
  const agg = new Map<string, GroupChance>()
  const groupMods = new Map<string, SimMod[]>()
  for (const e of pool) {
    const key = e.mod.affix + '|' + e.mod.group
    let g = agg.get(key)
    if (!g) {
      g = { group: e.mod.group, affix: e.mod.affix, en: e.mod.text_en, tr: e.mod.text_tr, weight: 0, chance: 0, range: '' }
      agg.set(key, g)
    }
    g.weight += e.weight
    let gm = groupMods.get(key)
    if (!gm) groupMods.set(key, (gm = []))
    gm.push(e.mod)
  }
  const all = [...agg.values()]
  for (const g of all) {
    g.chance = total > 0 ? g.weight / total : 0
    g.range = combinedRange(groupMods.get(g.affix + '|' + g.group) ?? [])
  }
  all.sort((a, b) => b.weight - a.weight)
  return {
    total,
    prefix: all.filter((g) => g.affix === 'prefix'),
    suffix: all.filter((g) => g.affix === 'suffix')
  }
}

// --- Oturum yöneticisi: geçmiş (stack) + geri al + sıfırla ---
export const OPS = { transmute, augment, regal, exalt, chaos, alchemy, annul, divine, fracture, blacksmith, armourer, glassblower, vaal, artificer } as const
export type OpName = keyof typeof OPS

export interface HistoryEntry {
  op: OpName | 'init' | 'essence' | 'manual'
  message: string
  added: RolledMod[]
  removed: RolledMod[]
}

export class CraftSession {
  private stack: ItemState[]
  private logs: HistoryEntry[]
  /** Kuşanılı omen: bir sonraki ilgili currency uygulanınca davranışı değişir, sonra tükenir. */
  armedOmen: OmenSim | null = null

  constructor(base: SimBase, ilvl: number) {
    this.stack = [makeItem(base, ilvl)]
    this.logs = [{ op: 'init', message: 'Temiz taban', added: [], removed: [] }]
  }

  /** Şu anki (en üstteki) item state. */
  get item(): ItemState {
    return this.stack[this.stack.length - 1]
  }
  get history(): HistoryEntry[] {
    return this.logs
  }
  get canUndo(): boolean {
    return this.stack.length > 1
  }

  /** Omen kuşan/kaldır (toggle). Aynı omen tekrar seçilirse kaldırır. */
  armOmen(o: OmenSim | null): void {
    if (!o) {
      this.armedOmen = null
      return
    }
    if (this.armedOmen?.id === o.id) this.armedOmen = null
    else if (o.mappable && (o.op === 'exalt' || o.op === 'regal' || o.op === 'chaos' || o.op === 'vaal')) this.armedOmen = o
  }

  /** Bir işlem uygula; kuşanılı omen ilgili currency ise davranışını uygula + tüket. */
  apply(op: OpName): OpResult {
    const omen = this.armedOmen && this.armedOmen.op === op ? this.armedOmen : null
    let r: OpResult
    if (omen && op === 'vaal') {
      r = vaal(this.item, true) // Omen of Corruption: "değişmez" elenir
    } else if (omen && (op === 'exalt' || op === 'regal' || op === 'chaos')) {
      r = OPS[op](this.item, omen.behavior as OmenBehavior)
    } else {
      r = OPS[op](this.item)
    }
    if (r.ok) {
      this.stack.push(r.item)
      this.logs.push({ op, message: r.message, added: r.added, removed: r.removed })
      if (omen) this.armedOmen = null // tüket
    }
    return r
  }

  /** Bir essence uygula; başarılıysa yığına ekle. */
  applyEssence(e: EssenceSim): OpResult {
    const r = applyEssence(this.item, e)
    if (r.ok) {
      this.stack.push(r.item)
      this.logs.push({ op: 'essence', message: r.message, added: r.added, removed: r.removed })
    }
    return r
  }

  /** Bir catalyst uygula (takı kalitesi); başarılıysa yığına ekle. */
  applyCatalyst(c: CatalystSim): OpResult {
    const r = applyCatalyst(this.item, c)
    if (r.ok) {
      this.stack.push(r.item)
      this.logs.push({ op: 'essence', message: r.message, added: [], removed: [] })
    }
    return r
  }

  /** Bir rune/core'u boş sokete tak; başarılıysa yığına ekle. */
  socketRune(r: RuneSim): OpResult {
    const out = socketRune(this.item, r)
    if (out.ok) {
      this.stack.push(out.item)
      this.logs.push({ op: 'essence', message: out.message, added: [], removed: [] })
    }
    return out
  }

  /** Son işlemi geri al (önceki state'e dön). */
  undo(): void {
    if (this.stack.length > 1) {
      this.stack.pop()
      this.logs.pop()
    }
  }

  /** Aynı tabanı temiz Normal'e döndür. */
  reset(): void {
    const init = this.stack[0]
    this.stack = [makeItem(init.base, init.ilvl)]
    this.logs = [{ op: 'init', message: 'Sıfırlandı', added: [], removed: [] }]
    this.armedOmen = null
  }

  /** Yeni taban/ilvl ile temiz başla. */
  setBase(base: SimBase, ilvl: number): void {
    this.stack = [makeItem(base, ilvl)]
    this.logs = [{ op: 'init', message: 'Temiz taban', added: [], removed: [] }]
    this.armedOmen = null
  }

  // --- ELLE DÜZENLEME: gerçek oyun sonucunu yansıt (sim-tahmin değil) ---
  // Her biri yeni state'i yığına iter (undo çalışır) ve 'manual' olarak loglar.

  /** Rarity'yi elle ayarla; düşürürken kapasiteyi aşan modlar sondan kırpılır. */
  setRarityManual(r: Rarity): void {
    const ni = clone(this.item)
    ni.rarity = r
    const c = caps(r)
    while (ni.prefixes.length > c.p) ni.prefixes.pop()
    while (ni.suffixes.length > c.s) ni.suffixes.pop()
    this.stack.push(ni)
    this.logs.push({ op: 'manual', message: 'Rarity → ' + r, added: [], removed: [] })
    this.armedOmen = null
  }

  /** Gerçek rollanmış bir mod ekle (gruptan + girilen değer). Yer yoksa rarity otomatik yükselir.
   *  Dolu/uygulanamazsa { ok:false, reason }. */
  addManualMod(group: string, affix: 'prefix' | 'suffix', valuesText: string): { ok: boolean; reason: string } {
    const it = this.item
    const rolled = manualModForValue(it.base, group, affix, valuesText)
    if (!rolled) return { ok: false, reason: 'Bu taban için uygun mod yok' }
    const ni = clone(it)
    const groups = new Set([...ni.prefixes, ...ni.suffixes].map((m) => m.mod.group).filter(Boolean))
    if (rolled.mod.group && groups.has(rolled.mod.group)) return { ok: false, reason: 'Bu grup zaten var' }
    // kapasite: gerekiyorsa rarity yükselt
    const side = (): number => (affix === 'prefix' ? ni.prefixes.length : ni.suffixes.length)
    let cap = (): number => (affix === 'prefix' ? caps(ni.rarity).p : caps(ni.rarity).s)
    if (side() >= cap()) {
      if (ni.rarity === 'normal') ni.rarity = 'magic'
      else if (ni.rarity === 'magic') ni.rarity = 'rare'
    }
    cap = (): number => (affix === 'prefix' ? caps(ni.rarity).p : caps(ni.rarity).s)
    if (side() >= cap()) return { ok: false, reason: 'O taraf dolu (3/3)' }
    if (affix === 'prefix') ni.prefixes.push(rolled)
    else ni.suffixes.push(rolled)
    this.stack.push(ni)
    this.logs.push({ op: 'manual', message: 'Mod eklendi', added: [rolled], removed: [] })
    this.armedOmen = null
    return { ok: true, reason: '' }
  }

  /** Bir modu elle kaldır (gerçek annul/regret sonrası). */
  removeManualMod(side: 'prefix' | 'suffix', index: number): void {
    const ni = clone(this.item)
    const arr = side === 'prefix' ? ni.prefixes : ni.suffixes
    if (index < 0 || index >= arr.length) return
    const [removed] = arr.splice(index, 1)
    this.stack.push(ni)
    this.logs.push({ op: 'manual', message: 'Mod kaldırıldı', added: [], removed: removed ? [removed] : [] })
    this.armedOmen = null
  }
}
