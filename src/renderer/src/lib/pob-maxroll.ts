// Maxroll planner verisini (main'in __remixContext'ten çıkardığı yapısal model) PoB-eşdeğeri
// PobBuild yapısına RECONSTRUCTION eder → mevcut matchBuild hattına beslenir.
// HAZIR PoB KODU YOK (Mobalytics'in aksine) → bizim kuruyoruz. Best-effort + dürüst:
//   - Pasif ağaç: GGG node id (history replay) → güvenilir (matchNode byGGG köprüsü PoB ile aynı).
//   - Gem: "Metadata/.../SkillGemSpark" → "Spark" dönüşümü; eşleşmeyen pob-match'te "eşleşmedi".
//   - Eşya: Maxroll yapısal stat (metin yok) → taban best-effort, mod yok ("doğrulanmalı").
// guide2pob yalnız referans (kopya yok). Uydurma yok.
import type { PobBuild, PobSkillSet, PobSpec, PobItem, PobGem } from './pob'

interface MxGem { id?: string; level?: number; quality?: number; corrupted?: boolean }
interface MxSkillGroup { gems?: MxGem[] }
interface MxStep { name?: string; skills?: MxSkillGroup[] }
interface MxVariant { name?: string; history?: (number | { remove?: number[] })[] }
// XileHUD yöntemi: gerçek statlar items DB'sinde — { base, name, rarity, unique, stats:{explicit,implicit} }
interface MxStatBag {
  explicit?: Record<string, unknown>
  implicit?: Record<string, unknown>
}
interface MxItem {
  base?: string
  ilvl?: number
  rarity?: string | number
  name?: string
  unique?: string | number | boolean
  stats?: MxStatBag
}
export interface MaxrollData {
  planner: {
    class?: string
    ascendancy?: string
    level?: number
    version?: string
    skills?: { steps?: MxStep[] }
    passives?: { variants?: MxVariant[] }
    // equipment.variants[].items[slot] = item ID (gerçek stat items DB'de)
    equipment?: { variants?: { items?: Record<string, number> }[] }
  }
  items?: Record<string, MxItem>
}
export interface MaxrollMeta {
  class?: string
  name?: string
  // guide HTML'deki poe2-item span'lerinden: data-poe2-id -> görünen isim (unique fallback)
  uniqueNames?: Record<string, string>
}

// CamelCase Metadata gem id → görünen ad ("SupportGemArcaneTempo" → "Arcane Tempo")
const CONNECTORS = new Set(['of', 'on', 'to', 'the', 'and', 'from', 'for', 'in'])
export function maxrollGemName(id: string): { name: string; support: boolean } {
  let s = id.split('/').pop() || id
  const support = /^Support/.test(s)
  s = s.replace(/^SupportGem/, '').replace(/^SkillGem/, '')
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  // baştaki hariç bağlaçları küçült ("Orb Of Storms" → "Orb of Storms")
  const name = words.map((w, i) => (i > 0 && CONNECTORS.has(w.toLowerCase()) ? w.toLowerCase() : w)).join(' ')
  return { name, support }
}

// history (ekle/çıkar logu) → final allocated GGG node id seti
function finalNodes(v: MxVariant): number[] {
  const set = new Set<number>()
  for (const e of v.history ?? []) {
    if (typeof e === 'number') set.add(e)
    else if (e && Array.isArray(e.remove)) for (const r of e.remove) set.delete(r)
  }
  return [...set]
}

// Metadata taban yolu → okunur taban (best-effort; çoğu eşleşmeyebilir → işaretli)
function baseFromMeta(meta: string): string {
  const tail = (meta.split('/').pop() || meta).replace(/\d+$/, '')
  return tail.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim()
}

// --- Stat çözümü (XileHUD): items DB stat key → okunur mod satırı ---
// base_ önekini at, PascalCase/underscore'u boşlukla ayır, kelimeleri büyüt. UYDURMA YOK.
function humanizeStatKey(k: string): string {
  return k
    .replace(/^(base|local|global)_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+%/g, '%')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
}
// Stat değeri → okunur metin (sayı / {value} / {min,max} / dizi). Yoksa ''.
function statValueText(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1)
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) return v.map(statValueText).filter(Boolean).join(', ')
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.value === 'number' || typeof o.value === 'string') return statValueText(o.value)
    if (typeof o.min === 'number' && typeof o.max === 'number')
      return o.min === o.max ? statValueText(o.min) : `${statValueText(o.min)}-${statValueText(o.max)}`
  }
  return ''
}
// stats.explicit + stats.implicit → mod satırları ("<değer> <Humanize Key>"). Boş key atlanır.
function statsToMods(stats?: MxStatBag): string[] {
  if (!stats) return []
  const out: string[] = []
  const emit = (obj?: Record<string, unknown>): void => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      const name = humanizeStatKey(k)
      if (!name) continue
      const val = statValueText(v)
      out.push(val ? `${val} ${name}` : name)
    }
  }
  emit(stats.explicit)
  emit(stats.implicit)
  return out
}
// Maxroll slot adı → PoB-stili ("BodyArmour"→"Body Armour", "Ring1"→"Ring 1", "Weapon1"→"Weapon 1")
function normSlot(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}
// Base Metadata yolundan slot türet (planner.equipment yoksa: items DB = giyili eşyalar).
// ör. "Metadata/Items/Armours/Gloves/FourGlovesInt4" → "Gloves". Çoklu (Ring/Weapon/Jewel) numaralanır.
function slotFromMeta(meta: string): string {
  const m = (meta || '').toLowerCase()
  if (/\/gloves?\b|glove/.test(m)) return 'Gloves'
  if (/\/boots?\b|boot/.test(m)) return 'Boots'
  if (/bodyarmour|body_?armour|\/armours\/body/.test(m)) return 'Body Armour'
  if (/\/helmets?\b|helmet|\/hats?\b/.test(m)) return 'Helmet'
  if (/\/shields?\b|shield|buckler/.test(m)) return 'Weapon 2'
  if (/\/quivers?\b|quiver/.test(m)) return 'Quiver'
  if (/\/amulets?\b|amulet/.test(m)) return 'Amulet'
  if (/\/rings?\b|ring/.test(m)) return 'Ring'
  if (/\/belts?\b|belt/.test(m)) return 'Belt'
  if (/\/jewels?\b|jewel/.test(m)) return 'Jewel'
  if (/\/flasks?\b|flask/.test(m)) return 'Flask'
  if (/charm/.test(m)) return 'Charm'
  if (/\/weapons?\b|wand|staff|sceptre|bow|crossbow|sword|axe|mace|dagger|claw|spear|flail|focus/.test(m)) return 'Weapon'
  return ''
}

// rarity (string/number) + unique → PobItem rarity metni
function rarityOf(it: MxItem): string {
  if (it.unique) return 'UNIQUE'
  const r = it.rarity
  if (typeof r === 'string' && r) return r.toUpperCase()
  if (typeof r === 'number') return ['NORMAL', 'MAGIC', 'RARE', 'UNIQUE'][r] ?? 'NORMAL'
  return 'NORMAL'
}

/** Maxroll yapısal verisini PobBuild'e reconstruction eder (matchBuild bunu tüketir). */
export function maxrollToPob(data: MaxrollData, meta: MaxrollMeta): PobBuild {
  const pl = data.planner || {}

  // SKILL SET'ler (her step bir aşama; gem id → ad)
  const skillSets: PobSkillSet[] = (pl.skills?.steps ?? []).map((step, si) => ({
    id: 'mx' + si,
    title: step.name || 'Set ' + (si + 1),
    groups: (step.skills ?? []).map((grp) => ({
      label: '',
      mainActiveSkill: 1,
      gems: (grp.gems ?? [])
        .filter((g) => g.id)
        .map((g): PobGem => {
          const { name, support } = maxrollGemName(g.id as string)
          return {
            nameSpec: name,
            skillId: '',
            gemId: '',
            level: typeof g.level === 'number' ? g.level : 1,
            quality: typeof g.quality === 'number' ? g.quality : 0,
            count: 1,
            support
          }
        })
    }))
  }))

  // SPEC'ler (her passives variant bir ağaç aşaması; final node id'ler)
  const specs: PobSpec[] = (pl.passives?.variants ?? []).map((v) => ({
    title: v.name || 'Tree',
    treeVersion: pl.version ? String(pl.version) : '',
    classId: '',
    ascendClassId: '',
    nodes: finalNodes(v)
  }))

  // EŞYALAR (XileHUD yöntemi): gerçek statlar data.items[id].stats içinde → mod satırları.
  // Slot→item: ÖNCE planner.equipment.variants[0].items (varsa); YOKSA (canlı veride yaygın)
  //   items DB = giyili eşyalar → slot her item'ın base Metadata yolundan türetilir.
  const allItems = data.items ?? {}
  const uniqueNames = meta.uniqueNames ?? {}
  const items: PobItem[] = []
  const slots: Record<string, string> = {}
  let idx = 0
  // çoklu slot sayaçları (Ring 1/2, Weapon 1/2, Jewel 1..)
  const slotCount: Record<string, number> = {}
  const NUMBERED = new Set(['Ring', 'Weapon', 'Jewel', 'Flask', 'Charm'])
  function assignSlot(raw: string): string {
    const norm = normSlot(raw) || 'Item'
    // çoklu olabilen slotlar her zaman numaralı (Ring 1/2, Weapon 1/2…)
    if (NUMBERED.has(norm)) {
      slotCount[norm] = (slotCount[norm] ?? 0) + 1
      return `${norm} ${slotCount[norm]}`
    }
    // tekil slot; nadir çakışmada numaralandır
    if (!slots[norm]) return norm
    slotCount[norm] = (slotCount[norm] ?? 1) + 1
    return `${norm} ${slotCount[norm]}`
  }

  const firstSet = pl.equipment?.variants?.[0]?.items
  const entries: Array<[string, MxItem]> =
    firstSet && Object.keys(firstSet).length
      ? // equipment var: slot adı → itemId → items DB
        Object.entries(firstSet)
          .map(([slot, id]): [string, MxItem] | null => {
            const it = allItems[String(id)]
            return it ? [slot, it] : null
          })
          .filter((x): x is [string, MxItem] => !!x)
      : // equipment yok: TÜM items DB (giyili) → slot base Metadata'dan
        Object.values(allItems).map((it): [string, MxItem] => [slotFromMeta(it.base || ''), it])

  for (const [rawSlot, it] of entries) {
    const id = 'mxitem' + idx++
    const rarity = rarityOf(it)
    const base = baseFromMeta(it.base || '')
    // unique adı: items DB name → guide HTML span (data-poe2-id) → taban (dürüst sıra)
    let name = (it.name || '').trim()
    if (!name && rarity === 'UNIQUE' && it.unique != null) name = (uniqueNames[String(it.unique)] || '').trim()
    if (!name) name = base
    items.push({
      id,
      rarity,
      name,
      base,
      itemLevel: typeof it.ilvl === 'number' ? it.ilvl : 0,
      levelReq: 0,
      mods: statsToMods(it.stats)
    })
    if (rawSlot) slots[assignSlot(rawSlot)] = id
  }

  const className = (meta.class || pl.ascendancy || '').replace(/\d+$/, '') || 'Unknown'

  return {
    className,
    ascendClassName: '',
    level: typeof pl.level === 'number' ? pl.level : 1,
    targetVersion: pl.version ? String(pl.version) : '',
    mainSocketGroup: 1,
    skillSets,
    specs,
    items,
    slots,
    notes: ''
  }
}
