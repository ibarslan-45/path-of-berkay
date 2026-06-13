// Mobalytics YAPISAL build verisini (creator/profile build'lerde pobCode YOK → __PRELOADED_STATE__
// buildVariants) PoB-eşdeğeri PobBuild'e RECONSTRUCTION eder → mevcut matchBuild hattına beslenir.
// Mobalytics'in editorial build'leri hazır PoB kodu verir (o yol değişmedi); creator build'ler vermez.
// Best-effort + dürüst (PoB import dürüstlüğü; eşleşmeyen/belirsiz her şey işaretlenir):
//   - Pasif: "node-12345" → numeric node id → matchNode byGGG köprüsü (PoB ile AYNI) → ~%100 güvenilir.
//   - Aktif skill: activeSkill.name doğrudan veride → güvenilir; gemSlug ile gems.json id'si de bağlanır.
//   - Support: yalnız gemSlug → gems.json'a normalize-eşleme (best-effort); eşleşmeyen "eşleşmedi".
//   - Eşya: itemClassSlug (slot) + name + explicitDescriptions (temiz mod metni); taban tam değil → "doğrulanmalı".
//   - Class: tahsis edilen node'ların ağırlık merkezi → en yakın classStart (heuristik; yoksa boş).
// Uydurma YOK. Eşleşmeyen/eksik her şey işaretli.
import gemsData from '../../../data/gems.json'
import treeData from '../../../data/passive-tree.json'
import type { PobBuild, PobSkillSet, PobSpec, PobItem, PobGem, PobSkillGroup } from './pob'

// ---- main'in __PRELOADED_STATE__'ten çıkardığı yalın yapısal model ----
interface MbActive {
  gemSlug?: string
  name?: string
  level?: number
  iconURL?: string
}
interface MbSub {
  gemSlug?: string
  gemType?: string
  iconURL?: string
}
interface MbGemGroup {
  activeSkill?: MbActive | null
  subSkills?: MbSub[]
  // Gem'in ait olduğu silah seti (varsa). Çoğu build'de null (gem'ler sete özel değil) → rozet yok (dürüst).
  weaponSet?: number | null
  grantedByWeaponSet?: number | null
}
interface MbCommonItem {
  slug?: string
  isUnique?: boolean
  name?: string
  itemClassSlug?: string
  explicitDescriptions?: Array<{ description?: string }>
  iconURL?: string
}
interface MbSlot {
  commonItem?: MbCommonItem | null
  runes?: Array<{ slug?: string }>
  // SİLAH SETLERİ: mainHand/offHand'de eşya DOĞRUDAN commonItem değil, set1/set2 altında nested.
  // set1 = Silah Seti 1, set2 = Silah Seti 2 (swap). (#1/#2 kök neden — eskiden commonItem null → atlanıyordu.)
  set1?: MbSlot | null
  set2?: MbSlot | null
}
interface MbTreeSet {
  selectedSlugs?: string[] | null
}
interface MbVariant {
  id?: string
  name?: string | null
  equipment?: Record<string, MbSlot | null>
  skillGems?: { gems?: MbGemGroup[] }
  passiveTree?: {
    mainTree?: MbTreeSet
    set1Tree?: MbTreeSet
    set2Tree?: MbTreeSet
    ascendancyTree?: MbTreeSet
    attributeNodes?: Array<{ attribute?: string; nodeSlug?: string }>
  }
}
export interface MobalyticsData {
  name?: string
  variants?: MbVariant[]
}
export interface MobalyticsMeta {
  author?: { name?: string; url?: string }
  sourceUrl?: string
}

// ---- gem slug → gems.json (normalize-eşleme) ----
interface GemRec {
  id: string
  en: string
}
function records<T>(d: unknown): T[] {
  const o = d as { records?: T[] }
  return o.records ?? (d as T[])
}
const norm = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
// slug → çekirdek anahtar: "support" geç (önek/orta), "player…" ekini ve sıra ekini at
function gemKey(slug: string): string {
  return norm(slug)
    .replace(/support/g, '')
    .replace(/player.*$/, '')
    .replace(/(one|two|three|four|five|six)$/, '')
}
const gemByEn = new Map<string, GemRec>()
const gemBySuffix = new Map<string, GemRec>()
for (const g of records<GemRec>(gemsData)) {
  const e = norm(g.en)
  if (e && !gemByEn.has(e)) gemByEn.set(e, g)
  const m = (g.id || '').match(/(?:SupportGem|SkillGem)(\w+)$/)
  if (m) {
    const s = norm(m[1])
    if (s && !gemBySuffix.has(s)) gemBySuffix.set(s, g)
  }
}
function resolveGem(slug: string | undefined): GemRec | null {
  if (!slug) return null
  const k = gemKey(slug)
  return gemBySuffix.get(k) || gemByEn.get(k) || null
}

// camelCase/kebab gem slug → okunur ad (eşleşmeyen support için fallback)
function humanizeGemSlug(slug: string): string {
  let s = (slug || '').replace(/^support/i, '').replace(/player.*$/i, '')
  s = s.replace(/[-_]/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim()
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()) || slug
}

// ---- pasif: "node-12345" → numeric node id ----
function slugToNodeId(slug: string): number | null {
  const m = (slug || '').match(/(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

// ---- class: tahsis node'larının ağırlık merkezi → en yakın classStart ----
type TreeNodeArr = [number, number, number, number, string, string | null, string | null]
const NODE_XY = new Map<number, [number, number]>()
for (const n of (treeData as unknown as { nodes: TreeNodeArr[] }).nodes) {
  if (typeof n[0] === 'number') NODE_XY.set(n[0], [n[1], n[2]])
}
const CLASS_STARTS = (treeData as unknown as { classStarts: Array<{ en: string; x: number; y: number }> }).classStarts || []
function deriveClassName(nodeIds: number[]): string {
  let sx = 0
  let sy = 0
  let c = 0
  for (const id of nodeIds) {
    const xy = NODE_XY.get(id)
    if (xy) {
      sx += xy[0]
      sy += xy[1]
      c++
    }
  }
  if (!c || !CLASS_STARTS.length) return ''
  const cx = sx / c
  const cy = sy / c
  let best = ''
  let bestD = Infinity
  for (const cs of CLASS_STARTS) {
    const d = (cs.x - cx) ** 2 + (cs.y - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = cs.en
    }
  }
  return best
}

// ---- equipment slot anahtarı → PoB slot ----
// Mobalytics değişik anahtarlar kullanabilir (mainHand/weapon/weapon1…); hepsini KÜÇÜK harf eşle.
const EQUIP_SLOT: Record<string, string> = {
  amulet: 'Amulet',
  belt: 'Belt',
  body: 'Body Armour',
  bodyarmour: 'Body Armour',
  bodyarmor: 'Body Armour',
  chest: 'Body Armour',
  boots: 'Boots',
  gloves: 'Gloves',
  helmet: 'Helmet',
  helm: 'Helmet',
  leftring: 'Ring 1',
  rightring: 'Ring 2',
  ring1: 'Ring 1',
  ring2: 'Ring 2',
  extraring: 'Ring 3',
  ring3: 'Ring 3',
  // SİLAH/yan el — tüm bilinen anahtar varyantları (#5: eksik silah/off-hand kök nedeni)
  mainhand: 'Weapon 1',
  weapon: 'Weapon 1',
  weapon1: 'Weapon 1',
  mainweapon: 'Weapon 1',
  weaponone: 'Weapon 1',
  offhand: 'Weapon 2',
  weapon2: 'Weapon 2',
  offweapon: 'Weapon 2',
  secondary: 'Weapon 2',
  shield: 'Weapon 2',
  quiver: 'Weapon 2',
  flask1: 'Flask 1',
  flask2: 'Flask 2',
  charm1: 'Charm 1',
  charm2: 'Charm 2',
  charm3: 'Charm 3'
}
// item-class slug'ından slot çıkarımı (slotKey tanınmazsa yedek). Silah sınıfları → Weapon 1,
// yan el sınıfları (quiver/shield/focus) → Weapon 2. (#5: Mobalytics weapon anahtarı bilinmediğinde.)
const OFFHAND_CLASS_RE = /quiver|shield|buckler|focus/i
const WEAPON_CLASS_RE = /bow|crossbow|wand|sceptre|scepter|staff|stave|mace|axe|sword|dagger|claw|spear|flail|warstaff|quarterstaff/i
/** Bir equipment girdisi için PoB slotunu çöz: anahtar eşlemesi → item-class çıkarımı (silah dahil). */
function resolveEquipSlot(slotKey: string, itemClassSlug: string, taken: Record<string, string>): string {
  const direct = EQUIP_SLOT[(slotKey || '').toLowerCase()]
  if (direct) return direct
  const cls = (itemClassSlug || '').toLowerCase()
  if (OFFHAND_CLASS_RE.test(cls)) return taken['Weapon 2'] ? '' : 'Weapon 2'
  if (WEAPON_CLASS_RE.test(cls)) return !taken['Weapon 1'] ? 'Weapon 1' : !taken['Weapon 2'] ? 'Weapon 2' : ''
  return '' // gerçekten eşya değil (priorityList vb.)
}
/**
 * Bir equipment girdisini {pobSlot, ci, runes} listesine genişlet (#1/#2 KÖK NEDEN):
 * SİLAH SETLERİ — mainHand/offHand'de eşya DOĞRUDAN commonItem değil, set1/set2 altında nested.
 *   set1 → "Weapon N" (Silah Seti 1), set2 → "Weapon N Swap" (Silah Seti 2). Eskiden `slot.commonItem`
 *   null olduğu için silah/yan el TAMAMEN atlanıyordu. Diğer slotlar (zırh/takı/flask) doğrudan commonItem.
 */
function expandEquip(
  slotKey: string,
  slot: MbSlot | null,
  taken: Record<string, string>
): Array<{ pobSlot: string; ci: MbCommonItem; runes?: Array<{ slug?: string }> }> {
  if (!slot) return []
  const valid = (ci?: MbCommonItem | null): ci is MbCommonItem => !!ci && !!(ci.name || ci.itemClassSlug)
  // (b) set1/set2 yuvalanması (silah/yan el)
  if (!slot.commonItem && (slot.set1 || slot.set2)) {
    const s1 = slot.set1?.commonItem
    const s2 = slot.set2?.commonItem
    let base = EQUIP_SLOT[(slotKey || '').toLowerCase()] // mainHand→Weapon 1, offHand→Weapon 2
    if (!base) base = resolveEquipSlot(slotKey, s1?.itemClassSlug || s2?.itemClassSlug || '', taken)
    if (!base) return []
    const out: Array<{ pobSlot: string; ci: MbCommonItem; runes?: Array<{ slug?: string }> }> = []
    if (valid(s1)) out.push({ pobSlot: base, ci: s1, runes: slot.set1?.runes })
    if (valid(s2)) out.push({ pobSlot: base + ' Swap', ci: s2, runes: slot.set2?.runes })
    return out
  }
  // (a) doğrudan commonItem (zırh/takı/flask)
  const ci = slot.commonItem
  if (!valid(ci)) return []
  const pobSlot = resolveEquipSlot(slotKey, ci.itemClassSlug || '', taken)
  return pobSlot ? [{ pobSlot, ci, runes: slot.runes }] : []
}
// itemClassSlug ("body-armour","lifeflask","warstaff") → okunur taban (tam taban değil; "doğrulanmalı")
function humanizeClass(slug: string): string {
  let s = (slug || '').replace(/-/g, ' ')
  s = s
    .replace(/lifeflask/i, 'Life Flask')
    .replace(/manaflask/i, 'Mana Flask')
    .replace(/utilityflask/i, 'Utility Flask')
  s = s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).trim()
  return s
}

/** Mobalytics yapısal verisini PobBuild'e reconstruction eder (matchBuild bunu tüketir). */
export function mobalyticsToPob(data: MobalyticsData, _meta: MobalyticsMeta = {}): PobBuild {
  const variants = (data.variants ?? []).filter(Boolean)

  // SKILL SET'ler (her variant bir aşama; aktif + support)
  const skillSets: PobSkillSet[] = variants.map((v, vi) => {
    const groups: PobSkillGroup[] = (v.skillGems?.gems ?? []).map((grp): PobSkillGroup => {
      const gems: PobGem[] = []
      const act = grp.activeSkill
      if (act && (act.name || act.gemSlug)) {
        const rec = resolveGem(act.gemSlug)
        gems.push({
          nameSpec: act.name || (rec ? rec.en : humanizeGemSlug(act.gemSlug || '')),
          skillId: '',
          gemId: rec ? rec.id : '',
          level: typeof act.level === 'number' ? act.level : 1,
          quality: 0,
          count: 1,
          support: false
        })
      }
      for (const ss of grp.subSkills ?? []) {
        const rec = resolveGem(ss.gemSlug)
        gems.push({
          nameSpec: rec ? rec.en : humanizeGemSlug(ss.gemSlug || ''),
          skillId: '',
          gemId: rec ? rec.id : '',
          level: 1,
          quality: 0,
          count: 1,
          support: true
        })
      }
      // Gem grubunun silah seti (varsa) → slot adına çevir ki GameBuildView `slotWeaponSet` ile rozet
      // gösterebilsin. Mobalytics weaponSet 0-indeksli (0=Set 1, 1=Set 2). null → slot yok (rozet yok).
      const ws = typeof grp.weaponSet === 'number' ? grp.weaponSet : typeof grp.grantedByWeaponSet === 'number' ? grp.grantedByWeaponSet : null
      const slot = ws == null ? undefined : ws >= 1 ? 'Weapon 1 Swap' : 'Weapon 1'
      return { label: '', mainActiveSkill: 1, gems, slot }
    })
    return { id: 'mb' + vi, title: v.name || 'Variant ' + (vi + 1), groups }
  })

  // SPEC'ler (her variant bir ağaç aşaması). #6 düzeltme: TÜM tree set'lerini birleştir
  // (mainTree + set1/set2 + ascendancy + attribute) → bazı build'ler allocation'ı set1/set2'de
  // tutuyor; yalnız mainTree'ye bakınca 0 eşleşme çıkıyordu. Çözülemeyen node'lar matchNode'da işaretli.
  const specs: PobSpec[] = variants.map((v, vi) => {
    const pt = v.passiveTree ?? {}
    const ids: number[] = []
    const toIds = (slugs?: string[] | null): number[] => {
      const out: number[] = []
      for (const s of slugs ?? []) {
        const id = slugToNodeId(s)
        if (id != null) out.push(id)
      }
      return out
    }
    const push = (slugs?: string[] | null): void => {
      for (const id of toIds(slugs)) ids.push(id)
    }
    push(pt.mainTree?.selectedSlugs)
    // Part 4: silah seti 1/2'ye ÖZEL node'lar (mainTree dışında). Birleşik node listesine de katılır
    // (eşleşme/sayım için), ama AYRICA set bazında saklanır → görünümde Set 1/Set 2 etiketlenebilir.
    const set1 = toIds(pt.set1Tree?.selectedSlugs)
    const set2 = toIds(pt.set2Tree?.selectedSlugs)
    ids.push(...set1, ...set2)
    push(pt.ascendancyTree?.selectedSlugs)
    for (const a of pt.attributeNodes ?? []) {
      const id = slugToNodeId(a.nodeSlug || '')
      if (id != null) ids.push(id)
    }
    const uniq = [...new Set(ids)]
    const spec: PobSpec = { title: v.name || 'Variant ' + (vi + 1), treeVersion: '', classId: '', ascendClassId: '', nodes: uniq }
    // yalnız GERÇEKTEN set'e özel node varsa ekle (her ikisi de boşsa undefined → görünüm göstermez)
    if (set1.length || set2.length) {
      spec.set1Nodes = [...new Set(set1)]
      spec.set2Nodes = [...new Set(set2)]
    }
    return spec
  })

  // EŞYALAR — HER variant KENDİ gear setini taşır (#2 düzeltme): tüm variant eşyaları tek `items`
  // listesinde (benzersiz id), `stageSlots[vi]` = o variant'ın slot→itemId eşlemesi. Seçili aşama
  // değişince oyun görünümü stageSlots[vi]'yi okur → gear da yenilenir.
  const items: PobItem[] = []
  const stageSlots: Record<string, string>[] = variants.map((v, vi) => {
    const slots: Record<string, string> = {}
    let idx = 0
    for (const [slotKey, slot] of Object.entries(v.equipment ?? {})) {
      for (const { pobSlot, ci, runes } of expandEquip(slotKey, slot, slots)) {
        if (slots[pobSlot]) continue
        const mods = (ci.explicitDescriptions ?? []).map((d) => (d.description || '').trim()).filter(Boolean)
        for (const r of runes ?? []) {
          if (r.slug) mods.push('(Rune) ' + humanizeGemSlug(r.slug.replace(/^soulcore-/, '')))
        }
        const rarity = ci.isUnique ? 'UNIQUE' : mods.length ? 'RARE' : 'NORMAL'
        const base = humanizeClass(ci.itemClassSlug || '')
        const id = 'mb' + vi + '_' + idx++
        items.push({
          id,
          rarity,
          name: (ci.name || base || '').trim(),
          base,
          itemLevel: 0,
          levelReq: 0,
          mods,
          iconUrl: ci.iconURL || undefined // Mobalytics CDN ikonu (bundled taban eşleşmezse fallback)
        })
        slots[pobSlot] = id
      }
    }
    return slots
  })
  // varsayılan `slots` = son variant (endgame) — Liste görünümü/tek-set tüketiciler için
  const slots = stageSlots[stageSlots.length - 1] ?? {}

  // class: ilk variant'ın ağacından heuristik (yoksa boş)
  const className = deriveClassName(specs[0]?.nodes ?? [])

  return {
    className,
    ascendClassName: '',
    level: 1,
    targetVersion: '',
    mainSocketGroup: 1,
    skillSets,
    specs,
    items,
    slots,
    stageSlots,
    notes: ''
  }
}
