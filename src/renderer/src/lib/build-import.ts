// build-import.ts — PoE2 0.5 resmî `.build` JSON → PobBuild (build-export.ts'in TERSİ).
// SAF + test edilebilir. Kullanıcının yüklediği .build dosyası, PoB kodu / Mobalytics / Maxroll ile
// AYNI build görünümüne (gear, gem, pasif ağaç) beslenir. Yalnız yerel dosya okuma — ToS sorunu yok.
// Köprüler bizim verimizde (export ile simetrik):
//   - Pasif: GGG string id (n[6]) → numeric node id (n[0]) ters köprü → matchNode/matchBuild.
//   - Ascendancy: internal key ("Sorceress1") → ascInfo → görünen ad (en) + sınıf (classEn → className).
//   - Skill: BuildSkill.id = "Metadata/.../SkillGem…" → gemId; nameSpec gems.json'dan (yoksa humanize).
//   - Item: inventory_id → slot; additional_text/unique_name → rarity/name/base/mod.
// DÜRÜSTLÜK: rare/magic tabanı .build'de saklanmaz (yalnız "rarity: ad" + mod) → base boş, "doğrulanmalı".
//   Eşleşmeyen GGG id / gemId → işaretli. Uydurma YOK.
import treeData from '../../../data/passive-tree.json'
import gemsData from '../../../data/gems.json'
import type { PobBuild, PobItem, PobGem, PobSkillGroup } from './pob'

// ---- .build şeması (build-export PoeBuild ile aynı) ----
export interface DotBuildSupport {
  id: string
  level_interval?: [number, number]
}
export interface DotBuildSkill {
  id: string
  level_interval?: [number, number]
  support_skills?: DotBuildSupport[]
}
export interface DotBuildItem {
  inventory_id?: string
  slot_x?: number
  slot_y?: number
  level_interval?: [number, number]
  unique_name?: string
  additional_text?: string
}
export interface DotBuild {
  name?: string
  description?: string
  ascendancy?: string
  author?: string
  skills?: DotBuildSkill[]
  // İKİ FORMAT: bizim export `string[]` · gerçek oyun `[{id}]`
  passives?: Array<string | { id?: string }>
  // İKİ FORMAT: bizim export `items` · gerçek oyun `inventory_slots`
  items?: DotBuildItem[]
  inventory_slots?: DotBuildItem[]
}

export interface ImportReport {
  passives: { total: number; resolved: number; unresolved: number }
  skills: { total: number; withGemName: number }
  items: { total: number; withSlot: number }
  ascendancy: { value: string; resolved: boolean }
  notes: string[]
}

// ---- pasif ters köprü: GGG string id (n[6]) → numeric node id (n[0]) ----
type TreeNode = [number, number, number, number, string | null, string | null, string | null]
const GGGID_TO_NODE = new Map<string, number>()
for (const n of (treeData as unknown as { nodes: TreeNode[] }).nodes) {
  const gid = n[6]
  if (typeof gid === 'string' && gid && typeof n[0] === 'number' && !GGGID_TO_NODE.has(gid)) GGGID_TO_NODE.set(gid, n[0])
}

// ---- ascendancy ters köprü: internal key → { en (görünen), classEn (sınıf) } ----
const ASC_BY_KEY = new Map<string, { en: string; classEn: string }>()
for (const a of (treeData as unknown as { ascInfo: Array<{ id: string; en: string; classEn?: string }> }).ascInfo) {
  if (a.id) ASC_BY_KEY.set(a.id.toLowerCase(), { en: a.en || a.id, classEn: a.classEn || '' })
}

// ---- gem: Metadata id → gems.json kaydı (görünen ad) ----
interface GemRec {
  id: string
  en: string
}
function records<T>(d: unknown): T[] {
  const o = d as { records?: T[] }
  return o.records ?? (d as T[])
}
const gemBySuffix = new Map<string, GemRec>()
function gemSuffix(id: string): string {
  return (id || '').replace(/^Metadata\/Items\/Gems?\//i, '')
}
for (const g of records<GemRec>(gemsData)) {
  const s = gemSuffix(g.id)
  if (s && !gemBySuffix.has(s)) gemBySuffix.set(s, g)
}
// "Metadata/Items/Gems/SkillGemSpark" → "Spark" (eşleşmeyen gemId için okunur fallback)
function humanizeGemId(id: string): string {
  const s = gemSuffix(id).replace(/^(SkillGem|SupportGem)/, '')
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim() || id
}
function gemFromId(id: string): { nameSpec: string; gemId: string; matched: boolean } {
  const rec = gemBySuffix.get(gemSuffix(id))
  return { nameSpec: rec ? rec.en : humanizeGemId(id), gemId: id, matched: !!rec }
}

// ---- item: inventory_id → PoB slot adı (build-export SLOT_MAP'in tersi) ----
// inventory_id → kanonik PoB slot. İKİ FORMAT: bizim export numarasız (Weapon, Helm, BodyArmour),
// gerçek OYUN numaralı (Weapon1, Helm1, Offhand1, Ring1, Charm1). Aşağıda numarasız tabanlar;
// mapInvId trailing "1"'i (singleton slot) soyarak ikisini de eşler. Ring2/Flask N/Charm N korunur.
const INV_TO_SLOT: Record<string, string> = {
  Weapon: 'Weapon 1',
  Weapon1: 'Weapon 1',
  Offhand: 'Weapon 2',
  Offhand1: 'Weapon 2',
  Weapon2: 'Weapon 1 Swap',
  Offhand2: 'Weapon 2 Swap',
  BodyArmour: 'Body Armour',
  Body: 'Body Armour',
  Helm: 'Helmet',
  Helmet: 'Helmet',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Belt: 'Belt',
  Amulet: 'Amulet',
  Ring: 'Ring 1',
  Ring1: 'Ring 1',
  Ring2: 'Ring 2',
  Flask1: 'Flask 1',
  Flask2: 'Flask 2',
  Flask3: 'Flask 3',
  Flask4: 'Flask 4',
  Flask5: 'Flask 5',
  Charm1: 'Charm 1',
  Charm2: 'Charm 2',
  Charm3: 'Charm 3'
}
// "BodyArmour" / "Ring2" → okunur ("Body Armour" / "Ring 2") — bilinmeyen inventory_id için fallback
function humanizeInv(inv: string): string {
  return (inv || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim()
}
// inventory_id → PoB slot: direkt eşleme → trailing "1" soyup tekrar dene (oyun Weapon1→Weapon) → humanize
function mapInvId(inv: string): string {
  if (!inv) return ''
  if (INV_TO_SLOT[inv]) return INV_TO_SLOT[inv]
  const noOne = inv.replace(/1$/, '')
  if (noOne !== inv && INV_TO_SLOT[noOne]) return INV_TO_SLOT[noOne]
  return humanizeInv(inv)
}

/** .build JSON metni/nesnesini ayrıştırıp PobBuild + raporu döndürür. Hatalıysa Error fırlatır. */
export function importDotBuild(input: string | DotBuild): { build: PobBuild; report: ImportReport } {
  let db: DotBuild
  if (typeof input === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(input)
    } catch (e) {
      throw new Error('Geçersiz .build JSON: ' + (e as Error).message)
    }
    db = parsed as DotBuild
  } else {
    db = input
  }
  if (!db || typeof db !== 'object') throw new Error('Boş veya geçersiz .build dosyası')
  // En azından bir build alanı bulunmalı (yanlış dosya tipini reddet)
  if (
    db.skills === undefined &&
    db.passives === undefined &&
    db.items === undefined &&
    db.inventory_slots === undefined &&
    db.ascendancy === undefined &&
    db.name === undefined
  ) {
    throw new Error('Bu bir Path of Exile 2 .build dosyası değil')
  }

  const notes: string[] = []
  // İki .build şeması: (A) bizim export (passives:string[], items[]) (B) gerçek oyun
  // (passives:[{id}], inventory_slots[]). İkisini de tanı → eksik veri gelmesin (#3 düzeltme).
  const rawItems = (db.items && db.items.length ? db.items : db.inventory_slots) ?? []

  // --- ascendancy → görünen ad + className ---
  let ascendClassName = ''
  let className = ''
  let ascResolved = false
  const ascRaw = (db.ascendancy || '').trim()
  if (ascRaw) {
    const info = ASC_BY_KEY.get(ascRaw.toLowerCase())
    if (info) {
      ascendClassName = info.en
      className = info.classEn
      ascResolved = true
    } else {
      ascendClassName = ascRaw
      notes.push(`Yükseliş "${ascRaw}" iç anahtardan çözülemedi — ham değer kullanıldı (doğrulanmalı).`)
    }
  }

  // --- passives: GGG string id → numeric node id (string VEYA {id} kabul) ---
  const nodes: number[] = []
  let unresolved = 0
  const unresolvedIds: string[] = []
  for (const p of db.passives ?? []) {
    const gid = typeof p === 'string' ? p : (p && typeof p === 'object' ? p.id : '') || ''
    if (!gid) continue
    const nid = GGGID_TO_NODE.get(gid)
    if (nid != null) nodes.push(nid)
    else {
      unresolved++
      if (unresolvedIds.length < 6) unresolvedIds.push(gid)
    }
  }
  if (unresolved) notes.push(`${unresolved} pasif id eşlenemedi (ör. ${unresolvedIds.join(', ')}) — doğrulanmalı.`)

  // --- skills → tek skillSet, her skill bir grup (aktif + supportlar) ---
  const groups: PobSkillGroup[] = []
  let withGemName = 0
  let gemTotal = 0
  const unmatchedGems: string[] = []
  for (const sk of db.skills ?? []) {
    if (!sk || !sk.id) continue
    const gems: PobGem[] = []
    const a = gemFromId(sk.id)
    gemTotal++
    if (a.matched) withGemName++
    else if (unmatchedGems.length < 8) unmatchedGems.push(a.nameSpec)
    gems.push({ nameSpec: a.nameSpec, skillId: '', gemId: a.gemId, level: 1, quality: 0, count: 1, support: false })
    for (const sup of sk.support_skills ?? []) {
      if (!sup || !sup.id) continue
      const s = gemFromId(sup.id)
      gemTotal++
      if (s.matched) withGemName++
      else if (unmatchedGems.length < 8) unmatchedGems.push(s.nameSpec)
      gems.push({ nameSpec: s.nameSpec, skillId: '', gemId: s.gemId, level: 1, quality: 0, count: 1, support: true })
    }
    if (gems.length) groups.push({ label: '', mainActiveSkill: 1, gems })
  }
  if (gemTotal - withGemName > 0) notes.push(`${gemTotal - withGemName} gem veritabanında bulunamadı (ör. ${unmatchedGems.join(', ')}) — doğrulanmalı.`)

  // --- items: additional_text/unique_name → rarity/name/base/mod; inventory_id → slot.
  // İKİ FORMAT: (A) bizim export "rarity: ad" başlıklı (taban YOK) · (B) gerçek oyun: ilk satır
  // = TABAN, modlar "1. ..." numaralı (taban VAR). unique_name → UNIQUE. ---
  const items: PobItem[] = []
  const slots: Record<string, string> = {}
  const slotCount: Record<string, number> = {}
  let withSlot = 0
  let noBase = 0
  let idx = 0
  const stripNum = (s: string): string => s.replace(/^\s*\d+[.)]\s*/, '').trim() // "1. mod" → "mod"
  for (const it of rawItems) {
    if (!it) continue
    const lines = (it.additional_text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    let rarity = 'NORMAL'
    let name = ''
    let base = ''
    let mods: string[] = []
    const head = lines[0]?.match(/^(normal|magic|rare|unique):\s*(.+)$/i)
    if (it.unique_name) {
      rarity = 'UNIQUE'
      name = it.unique_name.trim()
      base = lines[0] || '' // oyun + bizim export: unique'te ilk satır = taban
      mods = lines.slice(1).map(stripNum)
    } else if (head) {
      // (A) bizim export non-unique: "rarity: ad" — taban .build'de saklanmaz
      rarity = head[1].toUpperCase()
      name = head[2].trim()
      mods = lines.slice(1).map(stripNum)
      noBase++
    } else if (lines.length) {
      // (B) gerçek oyun non-unique: ilk satır = TABAN, kalan = numaralı mod
      base = lines[0]
      mods = lines.slice(1).map(stripNum)
      rarity = mods.length ? 'RARE' : 'NORMAL'
    }
    const id = 'dbitem' + idx++
    items.push({ id, rarity, name, base, itemLevel: 0, levelReq: 0, mods })
    // slot
    const inv = it.inventory_id || ''
    let slotName = mapInvId(inv)
    if (slotName) {
      if (slots[slotName]) {
        slotCount[slotName] = (slotCount[slotName] ?? 1) + 1
        slotName = `${slotName} ${slotCount[slotName]}`
      }
      slots[slotName] = id
      withSlot++
    }
  }
  if (noBase) notes.push(`${noBase} rare/magic eşyanın taban türü .build’de yok (yalnız "rarity: ad" + mod) — taban doğrulanmalı.`)
  // eksik veri tanılaması (konsola; "neyin neden boş kaldığı")
  console.log(
    `[build-import] "${db.name || '?'}": pasif ${nodes.length}/${(db.passives ?? []).length}` +
      `, skill grubu ${groups.length}, eşya ${items.length} (slot ${withSlot}), gem ${withGemName}/${gemTotal}` +
      (notes.length ? ' · notlar: ' + notes.length : '')
  )

  const build: PobBuild = {
    className,
    ascendClassName,
    level: 1,
    targetVersion: '',
    mainSocketGroup: 1,
    skillSets: [{ id: 'db0', title: db.name || 'Build', groups }],
    specs: [{ title: db.name || 'Build', treeVersion: '', classId: '', ascendClassId: '', nodes }],
    items,
    slots,
    notes: (db.description || '').trim()
  }

  return {
    build,
    report: {
      passives: { total: (db.passives ?? []).length, resolved: nodes.length, unresolved },
      skills: { total: groups.length, withGemName },
      items: { total: items.length, withSlot },
      ascendancy: { value: ascendClassName, resolved: ascResolved },
      notes
    }
  }
}
