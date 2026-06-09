// build-export.ts — parse edilmiş PobBuild → PoE2 0.5 resmî `.build` JSON (BuildPlanner).
// SAF + test edilebilir. Yeni çekme YOK; mevcut pipeline'ın PobBuild'inden üretir.
// Şema febsho/poe2-build-converter ile DOĞRULANDI (referans, kopya yok). Köprüler bizim verimizde:
//   - Pasif: passive-tree.json nodes [nodeId, x, y, ?, icon, gggStringId] → numeric node → GGG string id
//     (febsho passives_default.json "{nodeId}":{id} ile birebir). Ascendancy node'ları hariç.
//   - Ascendancy: passive-tree.json ascInfo {id:"Witch3", en:"Stormweaver"} → display → internal key.
//   - Gem: PoB gemId = "Metadata/Items/Gems/SkillGem…" (.build skill id formatı).
// DÜRÜSTLÜK: gemId yok (Maxroll), eşleşmeyen node, internal-key bulunamadı → rapora "doğrulanmalı".
//   META GEM şu an .build şemasında DESTEKLENMİYOR (rapora not). Uydurma yok.
import treeData from '../../../data/passive-tree.json'
import type { PobBuild } from './pob'

// --- passive-tree köprüleri ---
// node = [skill, x, y, type, icon, pid(tooltip), gggId(node.id)] — gggId = .build için tam string id
type TreeNode = [number, number, number, number, string | null, string | null, string | null]
const NODE_TO_GGGID = new Map<number, string>()
for (const n of (treeData as unknown as { nodes: TreeNode[] }).nodes) {
  const gid = n[6] // node.id (eksiksiz; pid/dedup değil)
  if (typeof n[0] === 'number' && typeof gid === 'string' && gid) NODE_TO_GGGID.set(n[0], gid)
}
const ASC_KEY = new Map<string, string>() // display (lower) → internal key (ör. "stormweaver" → "Witch3")
for (const a of (treeData as unknown as { ascInfo: Array<{ id: string; en: string }> }).ascInfo) {
  if (a.en && a.id) ASC_KEY.set(a.en.toLowerCase(), a.id)
}

const DEFAULT_INTERVAL: [number, number] = [0, 100]
// PoB slot adı → .build inventory_id (febsho translateSlotName ile doğrulı)
const SLOT_MAP: Record<string, string> = {
  'Weapon 1': 'Weapon',
  'Weapon 2': 'Offhand',
  'Weapon 1 Swap': 'Weapon2',
  'Weapon 2 Swap': 'Offhand2',
  'Body Armour': 'BodyArmour',
  Helmet: 'Helm',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Belt: 'Belt',
  Amulet: 'Amulet',
  'Ring 1': 'Ring',
  'Ring 2': 'Ring2',
  'Flask 1': 'Flask1',
  'Flask 2': 'Flask2',
  'Flask 3': 'Flask3',
  'Flask 4': 'Flask4',
  'Flask 5': 'Flask5'
}
function translateSlot(name: string): string {
  return SLOT_MAP[name] ?? name.replace(/\s+/g, '')
}

export interface BuildSupport {
  id: string
  level_interval: [number, number]
}
export interface BuildSkill {
  id: string
  level_interval: [number, number]
  support_skills: BuildSupport[]
}
export interface BuildItem {
  inventory_id: string
  slot_x: number
  slot_y: number
  level_interval: [number, number]
  unique_name?: string
  additional_text?: string
}
export interface PoeBuild {
  name: string
  description?: string
  ascendancy?: string
  skills?: BuildSkill[]
  passives?: string[]
  items?: BuildItem[]
}
export interface ExportReport {
  passives: { total: number; resolved: number; unresolved: number }
  skills: { groups: number; withGemId: number; omitted: number }
  items: { total: number; withText: number }
  ascendancy: { value: string; mappedToInternalKey: boolean }
  metaGemSupported: false
  notes: string[] // "doğrulanmalı" / desteklenmiyor uyarıları
}

/** En çok node içeren spec'i seç (endgame ağacı; leveling aşamalarından gürültü yok). */
function pickSpec(build: PobBuild): { nodes: number[] } {
  const specs = build.specs ?? []
  if (!specs.length) return { nodes: [] }
  return specs.reduce((a, b) => (b.nodes.length > a.nodes.length ? b : a))
}
/** Son (endgame) skillSet'i seç; yoksa en çok gem içeren. */
function pickSkillSet(build: PobBuild): { groups: PobBuild['skillSets'][number]['groups'] } {
  const sets = build.skillSets ?? []
  if (!sets.length) return { groups: [] }
  return sets[sets.length - 1]
}

/** PobBuild → resmî .build JSON + sınıflandırma raporu. */
export function exportBuild(build: PobBuild, opts: { name?: string } = {}): { build: PoeBuild; report: ExportReport } {
  const notes: string[] = []
  const out: PoeBuild = { name: '' }

  // --- name ---
  out.name =
    opts.name?.trim() ||
    [build.ascendClassName, build.className].filter(Boolean).join(' ').trim() ||
    'PoE2 Build'

  // --- ascendancy (display → internal key; bulunamazsa display + "doğrulanmalı") ---
  const ascDisplay = (build.ascendClassName || '').trim()
  let ascMapped = false
  if (ascDisplay) {
    const key = ASC_KEY.get(ascDisplay.toLowerCase())
    if (key) {
      out.ascendancy = key
      ascMapped = true
    } else {
      out.ascendancy = ascDisplay
      notes.push(`Yükseliş "${ascDisplay}" iç anahtara eşlenemedi — görünen ad geçirildi (doğrulanmalı).`)
    }
  }

  // --- passives (numeric node → GGG string id; ascendancy node'ları hariç) ---
  const spec = pickSpec(build)
  const passives: string[] = []
  let unresolved = 0
  const seen = new Set<string>()
  for (const nodeId of spec.nodes) {
    const gggId = NODE_TO_GGGID.get(nodeId)
    if (!gggId || /^Ascendancy/i.test(gggId)) {
      if (!gggId) unresolved++
      continue // ascendancy node'ları ayrı (yükseliş alanında) / eşleşmeyen = unresolved
    }
    if (seen.has(gggId)) continue
    seen.add(gggId)
    passives.push(gggId)
  }
  if (passives.length) out.passives = passives
  if (unresolved) notes.push(`${unresolved} pasif düğüm GGG id'sine eşlenemedi (doğrulanmalı).`)

  // --- skills (son skillSet; her grup → BuildSkill; gemId yoksa atla) ---
  const ss = pickSkillSet(build)
  const skills: BuildSkill[] = []
  let omitted = 0
  for (const group of ss.groups) {
    const gems = group.gems ?? []
    const active = gems.find((g) => !g.support && g.gemId)
    if (!active) {
      if (gems.some((g) => !g.support)) omitted++ // aktif var ama gemId yok (Maxroll) → atla
      continue
    }
    const supports: BuildSupport[] = gems
      .filter((g) => g !== active && g.gemId)
      .map((g) => ({ id: g.gemId, level_interval: [...DEFAULT_INTERVAL] as [number, number] }))
    skills.push({ id: active.gemId, level_interval: [...DEFAULT_INTERVAL] as [number, number], support_skills: supports })
  }
  if (skills.length) out.skills = skills
  if (omitted) notes.push(`${omitted} skill grubu gemId taşımıyor (ör. Maxroll) → atlandı (doğrulanmalı).`)

  // --- items (slot → inventory_id; rarity/base/mod → additional_text; unique → unique_name) ---
  const slots = build.slots ?? {}
  const byId = new Map(build.items.map((it) => [it.id, it]))
  const items: BuildItem[] = []
  let withText = 0
  for (const [slotName, itemId] of Object.entries(slots)) {
    const it = byId.get(itemId)
    if (!it) continue
    const bi: BuildItem = {
      inventory_id: translateSlot(slotName),
      slot_x: 0,
      slot_y: 0,
      level_interval: [...DEFAULT_INTERVAL] as [number, number]
    }
    const isUnique = (it.rarity || '').toUpperCase() === 'UNIQUE'
    if (isUnique && it.name) bi.unique_name = it.name
    const base = isUnique ? it.base : `${(it.rarity || 'NORMAL').toLowerCase()}: ${it.name || it.base}`
    const modText = (it.mods ?? []).join('\n')
    const full = [base, modText].filter(Boolean).join('\n')
    if (full) {
      bi.additional_text = full
      withText++
    }
    items.push(bi)
  }
  if (items.length) out.items = items

  // --- description (sınıf + yazar notları) ---
  const descBits: string[] = []
  if (build.className) descBits.push(`Class: ${build.className}.`)
  if (ascDisplay) descBits.push(`Ascendancy: ${ascDisplay}.`)
  if (build.notes) descBits.push(build.notes.replace(/\s+/g, ' ').slice(0, 500))
  if (descBits.length) out.description = descBits.join(' ')

  notes.push('Meta gem (meta skill) .build şemasında desteklenmiyor — atlandı.')

  return {
    build: out,
    report: {
      passives: { total: spec.nodes.length, resolved: passives.length, unresolved },
      skills: { groups: ss.groups.length, withGemId: skills.length, omitted },
      items: { total: items.length, withText },
      ascendancy: { value: out.ascendancy ?? '', mappedToInternalKey: ascMapped },
      metaGemSupported: false,
      notes
    }
  }
}

/** Dosya adı: build adından güvenli .build adı üret. */
export function buildFileName(name: string): string {
  const safe = (name || 'PoE2 Build').replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'PoE2_Build'
  return safe + '.build'
}
