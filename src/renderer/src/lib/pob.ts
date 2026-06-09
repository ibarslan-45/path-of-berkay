// Path of Building 2 (PoE2) export kodu çözücü + parser.
// Kod: URL-safe base64 -> zlib inflate -> XML (<PathOfBuilding2>).
// Bağımlılık-hafif: regex tabanlı (Node + tarayıcıda aynı çalışır).
import pako from 'pako'

export interface PobGem {
  nameSpec: string
  skillId: string
  gemId: string
  level: number
  quality: number
  count: number
  support: boolean
}
export interface PobSkillGroup {
  label: string
  mainActiveSkill: number
  gems: PobGem[]
}
export interface PobSkillSet {
  id: string
  title: string
  groups: PobSkillGroup[]
}
export interface PobSpec {
  title: string
  treeVersion: string
  classId: string
  ascendClassId: string
  nodes: number[]
  // Silah seti (weapon set 1/2) ayrımı VARSA: o sete özel tahsis edilen node'lar (paylaşılan
  // mainTree dışında). Yalnız Mobalytics weaponSet verisinde dolu; yoksa undefined (gösterme).
  set1Nodes?: number[]
  set2Nodes?: number[]
}
export interface PobItem {
  id: string
  rarity: string
  name: string
  base: string
  itemLevel: number
  levelReq: number
  mods: string[]
  // Uzak ikon URL'si (Mobalytics/Maxroll CDN) — bundled ikon yoksa fallback (main net.fetch cache).
  iconUrl?: string
}
export interface PobBuild {
  className: string
  ascendClassName: string
  level: number
  targetVersion: string
  mainSocketGroup: number
  skillSets: PobSkillSet[]
  specs: PobSpec[]
  items: PobItem[]
  // slot adı -> item id
  slots: Record<string, string>
  // AŞAMA-BAŞINA gear (Mobalytics: her variant kendi ekipmanını taşır). specs/skillSets ile
  // paralel indeks; verilirse oyun görünümü seçili aşamanın gear'ını gösterir. Yoksa `slots` (tek set).
  stageSlots?: Record<string, string>[]
  notes: string
  // PoB <PlayerStat stat value/> → defans/res profili (Faz 8 tehlike kontrolü). Yoksa boş/undefined.
  stats?: Record<string, number>
}

/** URL-safe base64 metnini Uint8Array'e çevir (Node + tarayıcı). */
function b64ToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  // Node ortamı
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

/** PoB kodunu çöz -> XML metni. Hatalıysa Error fırlatır. */
export function decodePob(code: string): string {
  const trimmed = (code || '').trim().replace(/\s+/g, '')
  if (!trimmed) throw new Error('Boş kod')
  const bytes = b64ToBytes(trimmed)
  let xml: string
  try {
    xml = pako.inflate(bytes, { to: 'string' })
  } catch (e) {
    throw new Error('Çözme başarısız (geçersiz PoB kodu olabilir): ' + (e as Error).message)
  }
  if (!/<PathOfBuilding2?\b/.test(xml)) {
    throw new Error('Bu bir Path of Building export kodu değil')
  }
  return xml
}

// --- küçük XML yardımcıları (regex) ---
function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(name + '="([^"]*)"'))
  return m ? m[1] : ''
}
function num(tag: string, name: string, def = 0): number {
  const v = attr(tag, name)
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}
function section(xml: string, tagName: string): string {
  const m = xml.match(new RegExp('<' + tagName + '\\b[\\s\\S]*?</' + tagName + '>'))
  return m ? m[0] : ''
}
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Çözülmüş XML'i yapılandırılmış PobBuild'e ayrıştır. */
export function parsePob(xml: string): PobBuild {
  const buildTag = (xml.match(/<Build\b[^>]*>/) || [''])[0]

  // --- SkillSet'ler (aşamalı: "1-5","6-12"...) ---
  const skillSets: PobSkillSet[] = []
  const skillsXml = section(xml, 'Skills')
  for (const sm of skillsXml.matchAll(/<SkillSet\b([^>]*)>([\s\S]*?)<\/SkillSet>/g)) {
    const setOpen = '<SkillSet' + sm[1] + '>'
    const groups: PobSkillGroup[] = []
    for (const km of sm[2].matchAll(/<Skill\b([^>]*)>([\s\S]*?)<\/Skill>/g)) {
      const skillOpen = '<Skill' + km[1] + '>'
      const gems: PobGem[] = []
      for (const gm of km[2].matchAll(/<Gem\b[^>]*\/>/g)) {
        const g = gm[0]
        const gemId = attr(g, 'gemId')
        gems.push({
          nameSpec: attr(g, 'nameSpec'),
          skillId: attr(g, 'skillId'),
          gemId,
          level: num(g, 'level', 1),
          quality: num(g, 'quality', 0),
          count: num(g, 'count', 1),
          support: /SupportGem/i.test(gemId) || /Support/i.test(attr(g, 'skillId'))
        })
      }
      if (gems.length) {
        groups.push({
          label: attr(skillOpen, 'label'),
          mainActiveSkill: num(skillOpen, 'mainActiveSkill', 1),
          gems
        })
      }
    }
    skillSets.push({ id: attr(setOpen, 'id'), title: attr(setOpen, 'title'), groups })
  }

  // --- Tree Spec'leri (nodes csv) ---
  const specs: PobSpec[] = []
  const treeXml = section(xml, 'Tree')
  for (const sm of treeXml.matchAll(/<Spec\b[^>]*>/g)) {
    const t = sm[0]
    const nodesStr = attr(t, 'nodes')
    const nodes = nodesStr
      ? nodesStr.split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n))
      : []
    specs.push({
      title: attr(t, 'title'),
      treeVersion: attr(t, 'treeVersion'),
      classId: attr(t, 'classId'),
      ascendClassId: attr(t, 'ascendClassId'),
      nodes
    })
  }

  // --- Items (düz metin blok) + Slot eşlemesi ---
  const items: PobItem[] = []
  const itemsXml = section(xml, 'Items')
  for (const im of itemsXml.matchAll(/<Item\b([^>]*)>([\s\S]*?)<\/Item>/g)) {
    const id = attr('<Item' + im[1] + '>', 'id')
    // ModRange/iç etiketleri at, sadece metin satırları
    const body = decodeEntities(im[2].replace(/<[^>]+>/g, '')).trim()
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    // Yapı: Rarity / Ad / [Taban (rare/unique)] / [meta...] / Item Level / mod'lar.
    // Ad toplama İLK meta satırında durur; rare/unique'te taban = 2. ad satırı.
    const META = /^(Unique ID|Item Level|LevelReq|Implicits|Quality|Sockets|Socketed|Rune|Prefix|Suffix|Crafted|Selected|League|Source|Armour|Evasion|EnergyShield|Energy Shield|Requires|Catalyst|Charm Slots|Talisman Tier):/i
    let rarity = '',
      itemLevel = 0,
      levelReq = 0
    const nameLines: string[] = []
    const mods: string[] = []
    let phase: 'name' | 'mods' = 'name'
    for (const line of lines) {
      const r = line.match(/^Rarity:\s*(\w+)/i)
      if (r) {
        rarity = r[1].toUpperCase()
        continue
      }
      const il = line.match(/^Item Level:\s*(\d+)/i)
      if (il) {
        itemLevel = parseInt(il[1], 10)
        phase = 'mods'
        continue
      }
      const lr = line.match(/^LevelReq:\s*(\d+)/i)
      if (lr) {
        levelReq = parseInt(lr[1], 10)
        phase = 'mods'
        continue
      }
      if (META.test(line)) {
        phase = 'mods' // meta -> ad bloğu biter; satırı gösterme
        continue
      }
      if (phase === 'name') nameLines.push(line)
      else mods.push(line)
    }
    const isRareLike = rarity === 'RARE' || rarity === 'UNIQUE'
    items.push({
      id,
      rarity,
      name: nameLines[0] ?? '',
      base: isRareLike ? (nameLines[1] ?? nameLines[0] ?? '') : (nameLines[0] ?? ''),
      itemLevel,
      levelReq,
      mods
    })
  }
  const slots: Record<string, string> = {}
  for (const sm of itemsXml.matchAll(/<Slot\b[^>]*\/>/g)) {
    const name = attr(sm[0], 'name')
    const itemId = attr(sm[0], 'itemId')
    if (name && itemId && itemId !== '0') slots[name] = itemId
  }

  const notesXml = section(xml, 'Notes')
  const notes = decodeEntities(notesXml.replace(/<\/?Notes>/g, '').trim())

  // --- PlayerStat'lar (defans/res profili; Build bölümünde <PlayerStat stat="X" value="Y"/>) ---
  const stats: Record<string, number> = {}
  const buildXml = section(xml, 'Build') || xml
  for (const pm of buildXml.matchAll(/<PlayerStat\b[^>]*\/>/g)) {
    const k = attr(pm[0], 'stat')
    const v = parseFloat(attr(pm[0], 'value'))
    if (k && Number.isFinite(v)) stats[k] = v
  }

  return {
    className: attr(buildTag, 'className'),
    ascendClassName: attr(buildTag, 'ascendClassName'),
    level: num(buildTag, 'level', 1),
    targetVersion: attr(buildTag, 'targetVersion'),
    mainSocketGroup: num(buildTag, 'mainSocketGroup', 1),
    skillSets,
    specs,
    items,
    slots,
    notes,
    stats
  }
}

/** Kolaylık: kod -> PobBuild. */
export function importPob(code: string): PobBuild {
  return parsePob(decodePob(code))
}
