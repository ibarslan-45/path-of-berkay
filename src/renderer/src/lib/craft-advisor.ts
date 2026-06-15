// Usta Craft Yardımcısı — Faz A: aday üretimi (saf, test edilebilir).
// Her adımda TÜM yasal işlemleri (currency, omen-modifiye, essence, catalyst,
// quality, rune, vaal, fracture, annul, divine) çıkarır ve her aday için:
//   - progressChance: eksik hedefe ilerletme olasılığı (GERÇEK weight'lerden)
//   - costRank: 1..5 GÖRELİ maliyet (fiyat verisi yok — yalnız nadirlik sırası)
//   - risk: istenen modu kaybetme/bozma olasılığı (gerçek state'ten)
// Tahmin yok: olasılıklar eligiblePool weight'lerinden, risk gerçek mod sayımından.
import {
  SIM_ESSENCES,
  SIM_OMENS,
  SIM_CATALYSTS,
  SIM_RUNES,
  SIM_MODS,
  canApply,
  canApplyEssence,
  canApplyCatalyst,
  canSocketRune,
  essencePreview,
  evaluateTarget,
  eligiblePool,
  previewAddState,
  weightForBase,
  modCount,
  rollMod,
  tierOf,
  type ItemState,
  type TargetRow,
  type OpName,
  type SimMod,
  type RolledMod,
  type EssenceSim,
  type OmenSim,
  type CatalystSim,
  type RuneSim,
  type TargetEntry
} from './craft-sim'

export type ActionKind =
  | 'currency'
  | 'omen-op'
  | 'essence'
  | 'catalyst'
  | 'quality'
  | 'rune'
  | 'vaal'
  | 'fracture'
  | 'annul'
  | 'divine'

export type RiskLevel = 'none' | 'low' | 'medium' | 'high'
export interface RiskInfo {
  level: RiskLevel
  lossChance: number // 0..1 — istenen modu kaybetme / item'ı bozma olasılığı (gerçek state)
  code: string // UI iki dilli şablon anahtarı
}

export interface ActionEval {
  id: string // 'op:exalt' | 'ess:<id>' | 'omen:<id>' | 'cat:<id>' | 'rune:<id>'
  kind: ActionKind
  op?: OpName // omen-op ise modifiye edilen baz op
  essence?: EssenceSim
  omen?: OmenSim
  catalyst?: CatalystSim
  rune?: RuneSim
  labelEn: string
  technique: string // teknik etiketi (Faz B stratejiyi bunlardan seçer)
  isAdd: boolean // mod ekleyen işlem mi
  guaranteed: boolean // garantili mod (essence force-add)
  progressChance: number // 0..1 eksik hedefe ilerletme (gerçek weight); add değilse 0
  helper: boolean // doğrudan ilerletmez ama hazırlık (quality/catalyst/rune/artificer)
  targetGroups: string[] // bu işlemin dokunabildiği eksik hedef grup(lar)ı
  costRank: number // 1..5 GÖRELİ maliyet
  risk: RiskInfo
  guaranteedTier?: number // essence'in force-add edeceği tier (yalnız essence)
}

// --- yardımcılar ---
function capsFor(r: ItemState['rarity']): { p: number; s: number } {
  if (r === 'rare') return { p: 3, s: 3 }
  if (r === 'magic') return { p: 1, s: 1 }
  return { p: 0, s: 0 }
}

interface MissingInfo {
  missing: Set<string> // karşılanmamış hedef grupları
  allTargets: Set<string> // tüm hedef grupları (karşılanan dahil — kayıp riski için)
  keepers: Set<string> // KARŞILANMIŞ (met) hedef grupları — korunması gereken yüksek-tier modlar
}
function missingInfo(item: ItemState, targets: TargetEntry[]): MissingInfo {
  const st = evaluateTarget(item, targets)
  const missing = new Set<string>()
  const keepers = new Set<string>()
  for (const r of st.rows) {
    if (!r.met) missing.add(r.group)
    else keepers.add(r.group)
  }
  const allTargets = new Set(targets.map((t) => t.group))
  return { missing, allTargets, keepers }
}

interface AddOpts {
  affix?: 'prefix' | 'suffix'
  homogenising?: boolean
}
/** Bir op uygulandığında eklenecek mod'un, eksik hedef gruplarından olma toplam olasılığı (gerçek weight). */
function addProgress(item: ItemState, op: OpName, missing: Set<string>, opts: AddOpts = {}): { chance: number; groups: string[] } {
  const state = previewAddState(item, op)
  if (!state) return { chance: 0, groups: [] }
  const c = capsFor(state.rarity)
  let pool: Array<{ mod: SimMod; weight: number }> = []
  if ((!opts.affix || opts.affix === 'prefix') && state.prefixes.length < c.p) pool.push(...eligiblePool(state, 'prefix'))
  if ((!opts.affix || opts.affix === 'suffix') && state.suffixes.length < c.s) pool.push(...eligiblePool(state, 'suffix'))
  if (opts.homogenising) {
    const tags = new Set<string>()
    for (const m of [...item.prefixes, ...item.suffixes]) for (const t of m.mod.tags) tags.add(t)
    const f = pool.filter((e) => e.mod.tags.some((t) => tags.has(t)))
    if (f.length) pool = f
  }
  let total = 0
  for (const e of pool) total += e.weight
  if (total <= 0) return { chance: 0, groups: [] }
  let p = 0
  const hit = new Set<string>()
  for (const e of pool) if (missing.has(e.mod.group)) {
    p += e.weight
    hit.add(e.mod.group)
  }
  return { chance: p / total, groups: [...hit] }
}

function removableMods(item: ItemState): RolledMod[] {
  return [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured)
}
/** Rastgele bir mod kaldıran işlemin (annul) istenen modu kaldırma olasılığı. */
function annulRisk(item: ItemState, allTargets: Set<string>): RiskInfo {
  const rem = removableMods(item)
  if (!rem.length) return { level: 'none', lossChance: 0, code: 'annul_random' }
  const wanted = rem.filter((m) => allTargets.has(m.mod.group)).length
  const loss = wanted / rem.length
  return { level: loss >= 0.5 ? 'high' : loss > 0 ? 'medium' : 'low', lossChance: loss, code: 'annul_random' }
}
/** Chaos: 1 rastgele (veya whittling ile en düşük tier) kaldırır → istenen modu kaybetme riski. */
function chaosRisk(item: ItemState, allTargets: Set<string>, opts: { whittling?: boolean; affix?: 'prefix' | 'suffix' } = {}): RiskInfo {
  let rem = removableMods(item)
  if (opts.affix === 'prefix') rem = item.prefixes.filter((m) => !m.fractured)
  else if (opts.affix === 'suffix') rem = item.suffixes.filter((m) => !m.fractured)
  if (!rem.length) return { level: 'none', lossChance: 0, code: 'chaos_remove' }
  if (opts.whittling) {
    // en yüksek tierOf = en düşük tier (en zayıf) — whittling onu kaldırır
    const victim = rem.reduce((a, b) => (tierOf(b.mod) > tierOf(a.mod) ? b : a))
    const loss = allTargets.has(victim.mod.group) ? 1 : 0
    return { level: loss ? 'high' : 'none', lossChance: loss, code: 'chaos_whittling' }
  }
  const wanted = rem.filter((m) => allTargets.has(m.mod.group)).length
  const loss = wanted / rem.length
  return { level: loss >= 0.5 ? 'high' : loss > 0 ? 'medium' : 'low', lossChance: loss, code: 'chaos_remove' }
}
/** Fracture: rastgele 1 mod'u kilitler — keeper OLMAYAN bir modu kilitleme (sonra kaldıramama) riski.
 *  İdeal: karşılanmış (met) yüksek-tier modu kilitler; çöp VEYA henüz-karşılanmamış hedefi kilitlemek kötü. */
function fractureRisk(item: ItemState, keepers: Set<string>): RiskInfo {
  const all = [...item.prefixes, ...item.suffixes]
  if (!all.length) return { level: 'none', lossChance: 0, code: 'fracture_random' }
  const nonKeeper = all.filter((m) => !keepers.has(m.mod.group)).length
  const loss = nonKeeper / all.length
  return { level: loss >= 0.5 ? 'medium' : 'low', lossChance: loss, code: 'fracture_random' }
}
const NONE_RISK: RiskInfo = { level: 'none', lossChance: 0, code: '' }

/** Bir grubun bu base+ilvl'de NORMAL havuzla (weight>0) erişilebilen en iyi tier'ı (yoksa 99). */
function normalBestTier(item: ItemState, group: string): number {
  const ms = SIM_MODS.filter(
    (m) => m.group === group && m.domain === item.base.domain && weightForBase(m, item.base) > 0 && m.ilvl <= item.ilvl
  )
  return ms.length ? Math.min(...ms.map((m) => tierOf(m))) : 99
}
/** Bir essence'in bu item'a force-add edeceği mod'un tier'ı (yoksa null). */
function essGuaranteedTier(item: ItemState, e: EssenceSim): number | null {
  const prev = essencePreview(item, e)
  if (!prev) return null
  const cap = Math.min(item.ilvl, e.ilvlCap)
  const ms = SIM_MODS.filter((m) => m.group === prev.group && m.domain === item.base.domain && m.ilvl <= cap)
  if (!ms.length) return null
  const top = ms.reduce((a, b) => (b.ilvl > a.ilvl ? b : a))
  return tierOf(top)
}

// GÖRELİ maliyet (1=ucuz … 5=çok pahalı). Gerçek fiyat DEĞİL — currency nadirlik sırası.
const OP_COST: Record<OpName, number> = {
  transmute: 1,
  augment: 1,
  regal: 2,
  alchemy: 2,
  blacksmith: 2,
  armourer: 2,
  glassblower: 2,
  artificer: 2,
  exalt: 3,
  chaos: 3,
  annul: 4,
  divine: 4,
  vaal: 4,
  fracture: 5
}
const OP_LABEL: Record<OpName, string> = {
  transmute: 'Orb of Transmutation',
  augment: 'Orb of Augmentation',
  regal: 'Regal Orb',
  alchemy: 'Orb of Alchemy',
  exalt: 'Exalted Orb',
  chaos: 'Chaos Orb',
  annul: 'Orb of Annulment',
  divine: 'Divine Orb',
  vaal: 'Vaal Orb',
  artificer: "Artificer's Orb",
  fracture: 'Fracturing Orb',
  blacksmith: "Blacksmith's Whetstone",
  armourer: "Armourer's Scrap",
  glassblower: "Glassblower's Bauble"
}
const ADD_OPS = new Set<OpName>(['transmute', 'augment', 'regal', 'exalt', 'alchemy', 'chaos'])
const HELPER_OPS = new Set<OpName>(['blacksmith', 'armourer', 'glassblower', 'artificer'])
const ALL_OPS: OpName[] = [
  'transmute', 'augment', 'regal', 'exalt', 'chaos', 'alchemy', 'annul', 'divine',
  'fracture', 'blacksmith', 'armourer', 'glassblower', 'vaal', 'artificer'
]
function opKind(op: OpName): ActionKind {
  if (op === 'vaal') return 'vaal'
  if (op === 'fracture') return 'fracture'
  if (op === 'annul') return 'annul'
  if (op === 'divine') return 'divine'
  if (HELPER_OPS.has(op)) return 'quality'
  return 'currency'
}
function opTechnique(op: OpName): string {
  switch (op) {
    case 'transmute': return 'to-magic'
    case 'augment': return 'augment-add'
    case 'regal': return 'magic-to-rare'
    case 'exalt': return 'exalt-add'
    case 'chaos': return 'chaos-reroll'
    case 'alchemy': return 'alchemy-slam'
    case 'annul': return 'annul-room'
    case 'divine': return 'divine-values'
    case 'fracture': return 'fracture-lock'
    case 'vaal': return 'vaal-corrupt'
    case 'artificer': return 'open-socket'
    default: return 'quality'
  }
}
function opRisk(op: OpName, item: ItemState, allTargets: Set<string>, keepers: Set<string>): RiskInfo {
  if (op === 'annul') return annulRisk(item, allTargets)
  if (op === 'chaos') return chaosRisk(item, allTargets)
  if (op === 'vaal') return { level: 'high', lossChance: 0.25, code: 'vaal_irreversible' }
  if (op === 'fracture') return fractureRisk(item, keepers)
  return NONE_RISK
}

/** Belirli bir state + hedef için TÜM yasal işlemleri değerlendirilmiş aday listesine çıkarır. */
export function enumerateActions(item: ItemState, targets: TargetEntry[], excluded: Set<string> = new Set()): ActionEval[] {
  const { missing, allTargets, keepers } = missingInfo(item, targets)
  const minTierByGroup = new Map<string, number>(targets.map((t) => [t.group, t.minTier]))
  const out: ActionEval[] = []

  // 1) düz currency + quality + vaal + fracture + annul + divine + artificer
  for (const op of ALL_OPS) {
    if (!canApply(item, op).ok) continue
    const isAdd = ADD_OPS.has(op)
    const prog = isAdd ? addProgress(item, op, missing) : { chance: 0, groups: [] }
    out.push({
      id: 'op:' + op,
      kind: opKind(op),
      op,
      labelEn: OP_LABEL[op],
      technique: opTechnique(op),
      isAdd,
      guaranteed: false,
      progressChance: prog.chance,
      helper: HELPER_OPS.has(op),
      targetGroups: prog.groups,
      costRank: OP_COST[op],
      risk: opRisk(op, item, allTargets, keepers)
    })
  }

  // 2) omen-modifiye exalt/regal/chaos (kuşanılabilir omen'ler)
  for (const o of SIM_OMENS) {
    if (!o.mappable) continue
    if (o.op !== 'exalt' && o.op !== 'regal' && o.op !== 'chaos') continue
    if (!canApply(item, o.op).ok) continue
    const opts: AddOpts = {}
    if (o.behavior === 'sinistral') opts.affix = 'prefix'
    else if (o.behavior === 'dextral') opts.affix = 'suffix'
    else if (o.behavior === 'homogenising') opts.homogenising = true
    const isAdd = o.op === 'exalt' || o.op === 'regal' || o.op === 'chaos'
    const prog = isAdd ? addProgress(item, o.op, missing, opts) : { chance: 0, groups: [] }
    // risk: yalnız chaos kaldırma yapar (whittling/sinistral/dextral'a göre)
    let risk: RiskInfo = NONE_RISK
    if (o.op === 'chaos') {
      risk = chaosRisk(item, allTargets, {
        whittling: o.behavior === 'whittling',
        affix: o.behavior === 'sinistral' ? 'prefix' : o.behavior === 'dextral' ? 'suffix' : undefined
      })
    }
    out.push({
      id: 'omen:' + o.id,
      kind: 'omen-op',
      op: o.op,
      omen: o,
      labelEn: o.en + ' + ' + OP_LABEL[o.op],
      technique: 'omen-' + (o.behavior || o.op),
      isAdd,
      guaranteed: false,
      progressChance: prog.chance,
      helper: false,
      targetGroups: prog.groups,
      costRank: Math.min(5, OP_COST[o.op] + 1), // omen ekstra maliyet
      risk
    })
  }

  // 3) essence — garantili mod (uygulanabilir olanlar)
  for (const e of SIM_ESSENCES) {
    if (!e.mappable || !canApplyEssence(item, e).ok) continue
    const prev = essencePreview(item, e)
    const grp = prev?.group ?? ''
    const gt = essGuaranteedTier(item, e)
    const need = grp ? minTierByGroup.get(grp) : undefined
    // GARANTİ yalnız: grup eksik hedef VE force-add edilen tier hedefi karşılıyorsa (gt ≤ minTier)
    const meets = !!grp && missing.has(grp) && gt != null && need != null && gt <= need
    const tierCost = e.tier === 'Perfect' ? 5 : e.tier === 'Greater' ? 4 : 3
    const risk: RiskInfo =
      e.mode === 'rare_remove_add' ? { ...annulRisk(item, allTargets), code: 'essence_remove' } : NONE_RISK
    out.push({
      id: 'ess:' + e.id,
      kind: 'essence',
      essence: e,
      labelEn: e.en,
      technique: 'essence-slam',
      isAdd: true,
      guaranteed: true,
      progressChance: meets ? 1 : 0, // garantili: hedefi tier'ıyla karşılıyorsa %100, değilse 0
      helper: false,
      targetGroups: meets ? [grp] : [],
      costRank: tierCost,
      risk,
      guaranteedTier: gt ?? undefined
    })
  }

  // 4) catalyst — takı tag kalitesi (yardımcı; yeni mod eklemez)
  for (const c of SIM_CATALYSTS) {
    if (c.target !== 'jewellery' || !canApplyCatalyst(item, c).ok) continue
    out.push({
      id: 'cat:' + c.id,
      kind: 'catalyst',
      catalyst: c,
      labelEn: c.en,
      technique: 'catalyst-quality',
      isAdd: false,
      guaranteed: false,
      progressChance: 0,
      helper: true,
      targetGroups: [],
      costRank: 3,
      risk: NONE_RISK
    })
  }

  // 5) rune — boş sokete sabit etki (yardımcı)
  for (const r of SIM_RUNES) {
    if (!canSocketRune(item, r).ok) continue
    out.push({
      id: 'rune:' + r.id,
      kind: 'rune',
      rune: r,
      labelEn: r.en,
      technique: 'rune-socket',
      isAdd: false,
      guaranteed: false,
      progressChance: 0,
      helper: true,
      targetGroups: [],
      costRank: 3,
      risk: NONE_RISK
    })
  }

  // KULLANICIDA OLMAYAN MALZEMELER ("bende yok") hariç tutulur: aynı id + bir baz op hariç
  // tutulduysa o op'u kullanan omen-op'lar da (omen+exalt için Exalted Orb gerekir) düşer.
  const usable = excluded.size
    ? out.filter((a) => !excluded.has(a.id) && !(a.kind === 'omen-op' && a.op != null && excluded.has('op:' + a.op)))
    : out
  // sıralama: önce ilerleten (yüksek şans), sonra ucuz, sonra düşük risk
  usable.sort((a, b) => {
    if (b.progressChance !== a.progressChance) return b.progressChance - a.progressChance
    if (a.costRank !== b.costRank) return a.costRank - b.costRank
    return a.risk.lossChance - b.risk.lossChance
  })
  return usable
}

// ============================================================================
// FAZ B — STRATEJİ TANIMA (8 craft tekniği)
// Ham aday setini gerçek craft tekniklerine eşler, tek "en iyi birincil adım"
// + tanınan stratejiyi seçer. Eklemeyen yardımcı işlemleri (annul-room, quality)
// doğru bağlamda "hazırlık adımı" olarak seçebilir. Tüm sayılar gerçek.
// ============================================================================
export type StrategyId =
  | 'rarity-start' // Normal → Magic/Rare ilk adım
  | 'essence-slam' // garantili mod
  | 'alt-regal' // doğru Magic → Regal
  | 'omen-exalt' // hedefli/çoklu exalt (sinistral/dextral/greater)
  | 'annul-room' // dolu tarafı açmak için kaldır (hazırlık)
  | 'chaos-reroll' // düşük tier'ı yeniden dene
  | 'fracture-chaos' // keeper'ı kilitle, gerisini chaos'la
  | 'quality-polish' // bitmiş item'ı kalite ile cilala
  | 'deadend' // çıkmaz (sıfırla / yeni taban)

export interface Recommendation {
  kind: 'plan' | 'reached' | 'no_target' | 'deadend'
  strategy: StrategyId
  primary?: ActionEval
  rationaleCode: string // UI iki dilli şablon anahtarı
  targetGroup?: string
  targetEn?: string
  targetTr?: string
  deadendCode?: string // 'limit' | 'infeasible' | 'restart' | 'no_room'
}

/** Bir essReq satırı (NORMAL havuz minTier'a ulaşamaz → essence gerekir). */
function isEssReq(item: ItemState, r: TargetRow): boolean {
  return normalBestTier(item, r.group) > r.minTier
}

/** Mevcut state + hedeften en iyi tekniği tanır ve birincil adımı döndürür (deterministik). */
export function recommendPrimary(item: ItemState, targets: TargetEntry[], excluded: Set<string> = new Set()): Recommendation {
  const cands = enumerateActions(item, targets, excluded)
  const st = evaluateTarget(item, targets)
  const byId = (id: string): ActionEval | undefined => cands.find((c) => c.id === id)
  const allTargetGroups = new Set(targets.map((t) => t.group))

  if (!st.rows.length) return { kind: 'no_target', strategy: 'rarity-start', rationaleCode: '' }
  if (st.reached) {
    // hedefe ulaşıldı — kalite ile cilalanabiliyorsa öner (polish)
    const q = cands.find((c) => c.kind === 'quality')
    return q
      ? { kind: 'reached', strategy: 'quality-polish', rationaleCode: 'quality_polish', primary: q }
      : { kind: 'reached', strategy: 'rarity-start', rationaleCode: '' }
  }
  if (!st.feasible)
    return { kind: 'deadend', strategy: 'deadend', rationaleCode: '', deadendCode: st.limitOver ? 'limit' : 'infeasible' }

  const missing = st.rows.filter((r) => !r.met)
  const absent = missing.filter((r) => r.currentTier === null)
  const weak = missing.filter((r) => r.currentTier !== null)
  const absentEss = absent.filter((r) => isEssReq(item, r))
  const absentNormal = absent.filter((r) => !isEssReq(item, r))

  const plan = (
    strategy: StrategyId,
    primary: ActionEval | undefined,
    rationaleCode: string,
    row?: TargetRow
  ): Recommendation => ({
    kind: 'plan',
    strategy,
    primary,
    rationaleCode,
    targetGroup: row?.group,
    targetEn: row?.en,
    targetTr: row?.tr
  })

  // hedefleri garantileyen en UCUZ uygun essence (gt ≤ minTier sağlanmış)
  const pickEssence = (rows: TargetRow[]): { ev: ActionEval; row: TargetRow } | null => {
    const groups = new Set(rows.map((r) => r.group))
    const es = cands
      .filter((c) => c.kind === 'essence' && c.progressChance === 1 && c.targetGroups.some((g) => groups.has(g)))
      .sort((a, b) => a.costRank - b.costRank)
    if (!es.length) return null
    const ev = es[0]
    const row = rows.find((r) => ev.targetGroups.includes(r.group)) ?? rows[0]
    return { ev, row }
  }

  // ---------------- NORMAL ----------------
  if (item.rarity === 'normal') {
    if (absentEss.length)
      // essence için önce Magic yap (removal'sız aşamada garanti gelecek)
      return plan('essence-slam', byId('op:transmute'), 'to_magic_for_essence', absentEss[0])
    // alt→regal yolu: ucuz, kontrollü Magic ile başla
    return plan('alt-regal', byId('op:transmute'), 'start', absentNormal[0] ?? missing[0])
  }

  // ---------------- MAGIC ----------------
  if (item.rarity === 'magic') {
    if (absentEss.length) {
      const e = pickEssence(absentEss)
      if (e) return plan('essence-slam', e.ev, 'essence', e.row) // magic→rare essence: removal yok
    }
    if (absentNormal.length) {
      const head = absentNormal[0]
      const room = modCount(item) < 2
      const aug = byId('op:augment')
      // boş slot varsa ve augment hedefe ilerletiyorsa (ve az hedef) → doğru Magic'i kur
      if (room && aug && aug.progressChance > 0 && targets.length <= 2) return plan('alt-regal', aug, 'augment', head)
      // değilse Regal ile Rare'e taş — tek taraflıysa omen'li Regal (Coronation) daha yüksek şans
      const regalFamily = cands.filter((c) => c.op === 'regal' && c.isAdd).sort((a, b) => b.progressChance - a.progressChance || a.costRank - b.costRank)
      const best = regalFamily[0]
      if (best && best.id !== 'op:regal') return plan('alt-regal', best, 'omen_regal', head)
      return plan('alt-regal', byId('op:regal'), 'to_rare', head)
    }
    // yalnız zayıf tier (Magic'te) → Rare'e taşıyıp düzelt
    if (weak.length) return plan('alt-regal', byId('op:regal'), 'to_rare', weak[0])
  }

  // ---------------- RARE ----------------
  if (item.rarity === 'rare') {
    // 1) essReq eksik → essence (rare_remove_add: kaldırma riski)
    if (absentEss.length) {
      const e = pickEssence(absentEss)
      if (e) {
        const risky = e.ev.risk.lossChance > 0
        return plan('essence-slam', e.ev, risky ? 'essence_risk' : 'essence', e.row)
      }
    }
    // 2) normal-erişilebilir eksik → exalt (yer varsa) / annul-room (taraf doluysa)
    if (absentNormal.length) {
      const head = absentNormal[0]
      const sideRoom = (a: 'prefix' | 'suffix'): boolean => (a === 'prefix' ? item.prefixes.length < 3 : item.suffixes.length < 3)
      // hangi taraflar eksik ve hangileri açık?
      const needSides = new Set(absentNormal.map((r) => r.affix))
      const anyRoom = [...needSides].some((a) => sideRoom(a))
      if (anyRoom) {
        // çoklu eksik + yeterli yer → Greater Exaltation (2 mod); değilse hedefli/düz exalt
        const greater = cands.find((c) => c.technique === 'omen-greater')
        if (absentNormal.length >= 2 && modCount(item) <= 4 && greater) return plan('omen-exalt', greater, 'greater_exalt', head)
        const exaltFamily = cands
          .filter((c) => c.op === 'exalt' && c.isAdd && c.technique !== 'omen-greater')
          .sort((a, b) => b.progressChance - a.progressChance || a.costRank - b.costRank)
        const best = exaltFamily[0]
        if (best && best.id !== 'op:exalt') return plan('omen-exalt', best, 'omen_exalt', head)
        return plan('omen-exalt', byId('op:exalt'), 'exalt', head)
      }
      // taraf dolu → annul-room ile yer aç (eğer kaldırılabilir istenmeyen mod var + risk kabul edilebilir)
      const annul = byId('op:annul')
      const sideMods = (head.affix === 'prefix' ? item.prefixes : item.suffixes).filter((m) => !m.fractured)
      const sideNonTarget = sideMods.filter((m) => !allTargetGroups.has(m.mod.group))
      if (annul && sideNonTarget.length > 0 && annul.risk.lossChance < 0.34)
        return plan('annul-room', annul, 'annul_room', head)
      // güvenli yer açma yok → çıkmaz/yeniden dene
      return { kind: 'deadend', strategy: 'deadend', rationaleCode: '', deadendCode: 'restart' }
    }
    // 3) zayıf tier (var ama düşük)
    if (weak.length) {
      const head = weak[0]
      // essReq ise: Perfect/Greater essence ile üzerine yaz (riskli)
      if (isEssReq(item, head)) {
        const e = pickEssence([head])
        if (e) return plan('essence-slam', e.ev, 'essence_risk', head)
      }
      // fracture→chaos: çok keeper + ≥4 mod + chaos keeper'ı silme riski yüksek + kilit isabeti olası
      const fracture = byId('op:fracture')
      const chaos = byId('op:chaos')
      const metKeepers = st.rows.filter((r) => r.met)
      const shouldFracture =
        !!fracture &&
        modCount(item) >= 4 &&
        metKeepers.length >= 1 &&
        chaos != null &&
        chaos.risk.level === 'high' &&
        fracture.risk.lossChance < 0.5
      if (shouldFracture) return plan('fracture-chaos', fracture, 'fracture_lock', head)
      // değilse chaos ile tier'ı yeniden dene (divine yalnız DEĞER yeniler, tier değişmez)
      return plan('chaos-reroll', chaos, 'tier_reroll', head)
    }
  }

  return { kind: 'deadend', strategy: 'deadend', rationaleCode: '', deadendCode: 'no_room' }
}

// ============================================================================
// FAZ C — ÇOK-ADIMLI PLANLAYICI
// Seçilen stratejiye göre hedefe giden 2-3 adımlık kanonik yolu kurar. Her adım,
// O ADIMIN UYGULANACAĞI projeksiyon-state'inde GERÇEK tek-adım şansıyla hesaplanır.
// Yol mevcut item state'ten başlar (yapılmış adımlar atlanır). Kümülatif = bağımsız
// adım çarpımı (YAKLAŞIK — işaretli). projectSuccess: her adımın "başarılı olduğu"
// deterministik projeksiyonu (sonraki adım bunun üstünden tanınır).
// ============================================================================
export interface PlanStep {
  action: ActionEval
  rationaleCode: string
  chance: number // bu adımın amacını gerçekleştirme olasılığı (gerçek; mekanik setup=1)
  deterministic: boolean // mekanik kesin adım (rarity flip / annul / fracture / socket)
  targetGroup?: string
  targetEn?: string
  targetTr?: string
}
/** Birincil yola karşı bir ALTERNATİF yaklaşım (ilk adım için), karşılaştırmalı. */
export interface PlanAlternative {
  action: ActionEval
  technique: string
  chance: number // ilk adım amaç-başarı olasılığı (gerçek; garanti=1)
  guaranteed: boolean
  costDelta: number // costRank − birincil costRank (GÖRELİ; + pahalı, − ucuz)
  rationaleCode: string // karşılaştırma kodu (UI iki dilli)
}
/** Genel risk uyarısı (gerçek state'ten). */
export interface RiskNote {
  code: string // 'annul_danger' | 'chaos_remove' | 'vaal_irreversible' | 'corruption_locked' | 'fracture_random'
  level: RiskLevel
  lossChance: number // 0..1
}
/** Çıkmaz bilgisi + reset kapsamı. */
export interface DeadendInfo {
  code: string // 'limit' | 'infeasible' | 'restart' | 'no_room'
  scope: 'same-base' | 'new-base' // aynı tabanı sıfırla mı, yeni taban/ilvl mi
}

export interface CraftPlan {
  kind: 'plan' | 'reached' | 'no_target' | 'deadend'
  strategy: StrategyId
  primary?: ActionEval
  rationaleCode: string
  steps: PlanStep[]
  cumulative: number // ≈ toplam başarı olasılığı (YAKLAŞIK)
  cumulativeApprox: boolean
  alternatives: PlanAlternative[] // 1-2 alternatif yaklaşım (ilk adıma karşı)
  risks: RiskNote[] // genel risk notları
  deadend?: DeadendInfo
  deadendCode?: string
  targetEn?: string
  targetTr?: string
}

function affixOf(group: string): 'prefix' | 'suffix' {
  return SIM_MODS.find((m) => m.group === group)?.affix ?? 'prefix'
}
function modOfGroupBestTier(item: ItemState, group: string): SimMod | null {
  const ms = SIM_MODS.filter(
    (m) => m.group === group && m.domain === item.base.domain && weightForBase(m, item.base) > 0 && m.ilvl <= item.ilvl
  )
  return ms.length ? ms.reduce((a, b) => (tierOf(b) < tierOf(a) ? b : a)) : null
}
function cloneState(it: ItemState): ItemState {
  return {
    ...it,
    prefixes: it.prefixes.slice(),
    suffixes: it.suffixes.slice(),
    implicits: it.implicits.slice(),
    sockets: { ...it.sockets, runes: it.sockets.runes.slice() }
  }
}
function capOf(r: ItemState['rarity']): number {
  return r === 'rare' ? 3 : r === 'magic' ? 1 : 0
}
/** Projeksiyon: bir gruba ait mod'u (verilen tier veya en iyi tier) ilgili tarafa ekle (yer varsa). */
function pushGroup(ni: ItemState, group: string, tier?: number): void {
  const affix = affixOf(group)
  const arr = affix === 'prefix' ? ni.prefixes : ni.suffixes
  if (arr.length >= capOf(ni.rarity)) return
  let m: SimMod | null = null
  if (tier != null)
    m = SIM_MODS.find((x) => x.group === group && x.domain === ni.base.domain && x.ilvl <= ni.ilvl && tierOf(x) === tier) ?? null
  if (!m) m = modOfGroupBestTier(ni, group)
  if (!m) return
  arr.push({ mod: m, ...rollMod(m) })
}

/** Bir adımın "başarılı olduğu" deterministik projeksiyonu (planlama için). */
function projectSuccess(state: ItemState, action: ActionEval, rec: Recommendation, targets: TargetEntry[]): ItemState | null {
  const ni = cloneState(state)
  const grp = rec.targetGroup
  const allTargets = new Set(targets.map((t) => t.group))
  const keepers = new Set(evaluateTarget(state, targets).rows.filter((r) => r.met).map((r) => r.group))

  if (action.kind === 'essence') {
    const e = action.essence!
    if (e.mode === 'magic_to_rare') ni.rarity = 'rare'
    else {
      // rare_remove_add: en iyi durumda keeper-olmayan bir mod kaldırılır → yer açılır
      const affix = grp ? affixOf(grp) : 'prefix'
      const arr = affix === 'prefix' ? ni.prefixes : ni.suffixes
      const idx = arr.findIndex((m) => !m.fractured && !keepers.has(m.mod.group))
      if (idx >= 0) arr.splice(idx, 1)
    }
    if (grp) pushGroup(ni, grp, action.guaranteedTier)
    return ni
  }

  const op = action.op
  if (op === 'transmute') {
    ni.rarity = 'magic'
    if (rec.rationaleCode === 'start' && grp) pushGroup(ni, grp)
    return ni
  }
  if (op === 'augment') {
    if (grp) pushGroup(ni, grp)
    return ni
  }
  if (op === 'regal') {
    ni.rarity = 'rare'
    if (grp) pushGroup(ni, grp)
    return ni
  }
  if (op === 'exalt') {
    if (grp) pushGroup(ni, grp)
    return ni
  }
  if (op === 'annul') {
    // keeper-olmayan bir modu kaldır (hedef tarafından tercihen) → yer aç
    const affix = grp ? affixOf(grp) : 'prefix'
    const tryArr = affix === 'prefix' ? ni.prefixes : ni.suffixes
    let idx = tryArr.findIndex((m) => !m.fractured && !allTargets.has(m.mod.group))
    if (idx >= 0) tryArr.splice(idx, 1)
    else {
      // o tarafta yoksa herhangi bir keeper-olmayan modu kaldır
      for (const arr of [ni.prefixes, ni.suffixes]) {
        idx = arr.findIndex((m) => !m.fractured && !allTargets.has(m.mod.group))
        if (idx >= 0) {
          arr.splice(idx, 1)
          break
        }
      }
    }
    return ni
  }
  if (op === 'chaos') {
    // tier reroll: zayıf grubun modunu en iyi tier ile değiştir
    if (grp) {
      const affix = affixOf(grp)
      const arr = affix === 'prefix' ? ni.prefixes : ni.suffixes
      const idx = arr.findIndex((m) => m.mod.group === grp && !m.fractured)
      if (idx >= 0) arr.splice(idx, 1)
      pushGroup(ni, grp)
    }
    return ni
  }
  if (op === 'fracture') {
    // bir keeper modu kilitle (sonraki chaos onu korur)
    const mark = (arr: ItemState['prefixes']): boolean => {
      const idx = arr.findIndex((m) => keepers.has(m.mod.group) && !m.fractured)
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], fractured: true }
        return true
      }
      return false
    }
    if (!mark(ni.prefixes)) mark(ni.suffixes)
    return ni
  }
  // quality / catalyst / rune / vaal / artificer / divine: hedef-mod state'i değişmez
  return ni
}

/** Bir adımın amaç-başarı şansı + mekanik-kesin (deterministik setup) mi. */
function stepChance(action: ActionEval, rationaleCode: string): { chance: number; deterministic: boolean } {
  if (action.guaranteed) return { chance: 1, deterministic: false } // essence: %100 (garanti)
  if (rationaleCode === 'to_magic_for_essence') return { chance: 1, deterministic: true } // sadece Magic yap
  if (action.op === 'annul' || action.op === 'fracture' || action.op === 'artificer')
    return { chance: 1, deterministic: true } // mekanik kesin (kaldır/kilitle/soket)
  return { chance: action.progressChance, deterministic: false } // olasılıklı ekleme/reroll
}

/** İlk adım birincil aksiyona karşı 1-2 alternatif yaklaşım (farklı teknik, karşılaştırmalı). */
function buildAlternatives(item: ItemState, targets: TargetEntry[], primary: ActionEval, primaryChance: number, excluded: Set<string> = new Set()): PlanAlternative[] {
  const cands = enumerateActions(item, targets, excluded)
  // hedefe ilerleten adaylar (ekleme şansı>0 VEYA garantili-isabet essence)
  const progressors = cands.filter((c) => c.progressChance > 0 || (c.kind === 'essence' && c.progressChance === 1))
  // teknik başına en iyi (şans desc, maliyet asc)
  const byTech = new Map<string, ActionEval>()
  for (const c of progressors) {
    const cur = byTech.get(c.technique)
    if (!cur || c.progressChance > cur.progressChance || (c.progressChance === cur.progressChance && c.costRank < cur.costRank))
      byTech.set(c.technique, c)
  }
  let alts = [...byTech.values()].filter((c) => c.id !== primary.id && c.technique !== primary.technique)
  // garanti önce, sonra yüksek şans, sonra ucuz
  alts.sort(
    (a, b) =>
      Number(b.guaranteed) - Number(a.guaranteed) || b.progressChance - a.progressChance || a.costRank - b.costRank
  )
  alts = alts.slice(0, 2)
  const compare = (a: ActionEval): string => {
    if (a.guaranteed && !primary.guaranteed) return a.costRank > primary.costRank ? 'guaranteed_pricier' : 'guaranteed_same'
    if (a.technique.startsWith('omen') && a.progressChance > primaryChance) return 'omen_higher'
    if (a.costRank < primary.costRank) return 'cheaper_lower'
    if (a.risk.level === 'high' || a.risk.level === 'medium') return 'risky_faster'
    return 'alternative'
  }
  return alts.map((a) => ({
    action: a,
    technique: a.technique,
    chance: a.guaranteed ? 1 : a.progressChance,
    guaranteed: a.guaranteed,
    costDelta: a.costRank - primary.costRank,
    rationaleCode: compare(a)
  }))
}

const RISK_RANK: Record<string, number> = { corruption_locked: 0, annul_danger: 1, chaos_remove: 2, fracture_random: 3, vaal_irreversible: 4 }
/** Mevcut state için en alakalı genel risk notları (gerçek sayılarla). */
function buildRisks(item: ItemState, targets: TargetEntry[], excluded: Set<string> = new Set()): RiskNote[] {
  const cands = enumerateActions(item, targets, excluded)
  const risks: RiskNote[] = []
  if (item.corrupted) risks.push({ code: 'corruption_locked', level: 'high', lossChance: 0 })
  const annul = cands.find((c) => c.op === 'annul')
  if (annul && annul.risk.lossChance > 0) risks.push({ code: 'annul_danger', level: annul.risk.level, lossChance: annul.risk.lossChance })
  const chaos = cands.find((c) => c.op === 'chaos')
  if (chaos && chaos.risk.level === 'high') risks.push({ code: 'chaos_remove', level: 'high', lossChance: chaos.risk.lossChance })
  // vaal notu yalnız KORUNACAK mod (met keeper) varken anlamlı (aksi halde gürültü)
  const hasKeepers = evaluateTarget(item, targets).rows.some((r) => r.met)
  const vaal = cands.find((c) => c.op === 'vaal')
  if (vaal && hasKeepers) risks.push({ code: 'vaal_irreversible', level: 'high', lossChance: 0.25 })
  risks.sort((a, b) => (RISK_RANK[a.code] ?? 9) - (RISK_RANK[b.code] ?? 9))
  return risks.slice(0, 3)
}

/** Hedefe giden çok-adımlı plan (mevcut state'ten başlar; 1-3 adım). */
export function planCraft(item: ItemState, targets: TargetEntry[], excluded: Set<string> = new Set()): CraftPlan {
  const rec0 = recommendPrimary(item, targets, excluded)
  if (rec0.kind !== 'plan') {
    const deadend: DeadendInfo | undefined =
      rec0.kind === 'deadend'
        ? { code: rec0.deadendCode ?? 'infeasible', scope: rec0.deadendCode === 'limit' || rec0.deadendCode === 'infeasible' ? 'new-base' : 'same-base' }
        : undefined
    return {
      kind: rec0.kind,
      strategy: rec0.strategy,
      primary: rec0.primary,
      rationaleCode: rec0.rationaleCode,
      steps: [],
      cumulative: rec0.kind === 'reached' ? 1 : 0,
      cumulativeApprox: false,
      alternatives: [],
      risks: buildRisks(item, targets, excluded),
      deadend,
      deadendCode: rec0.deadendCode,
      targetEn: rec0.targetEn,
      targetTr: rec0.targetTr
    }
  }
  const steps: PlanStep[] = []
  let state = item
  for (let i = 0; i < 3; i++) {
    const rec = recommendPrimary(state, targets, excluded)
    if (rec.kind === 'reached') break
    if (rec.kind !== 'plan' || !rec.primary) break
    const sc = stepChance(rec.primary, rec.rationaleCode)
    steps.push({
      action: rec.primary,
      rationaleCode: rec.rationaleCode,
      chance: sc.chance,
      deterministic: sc.deterministic,
      targetGroup: rec.targetGroup,
      targetEn: rec.targetEn,
      targetTr: rec.targetTr
    })
    const next = projectSuccess(state, rec.primary, rec, targets)
    if (!next) break
    state = next
    if (evaluateTarget(state, targets).reached) break
  }
  let cumulative = 1
  for (const s of steps) cumulative *= s.chance
  const firstStep = steps[0]
  const alternatives = firstStep ? buildAlternatives(item, targets, firstStep.action, firstStep.chance, excluded) : []
  return {
    kind: 'plan',
    strategy: rec0.strategy,
    primary: rec0.primary,
    rationaleCode: rec0.rationaleCode,
    steps,
    cumulative,
    cumulativeApprox: steps.some((s) => !s.deterministic && s.chance < 1),
    alternatives,
    risks: buildRisks(item, targets, excluded),
    targetEn: rec0.targetEn,
    targetTr: rec0.targetTr
  }
}
