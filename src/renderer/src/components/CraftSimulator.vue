<script setup lang="ts">
import { ref, computed, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue'
import currencyData from '../../../data/currency.json'
import {
  SIM_BASES,
  CraftSession,
  canApply,
  tierOf,
  tierCount,
  groupChances,
  rollInlineRangesPaired,
  qualityStats,
  catalystBoosted,
  SIM_ESSENCES,
  SIM_CATALYSTS,
  SIM_OMENS,
  SIM_RUNES,
  canApplyEssence,
  canApplyCatalyst,
  canSocketRune,
  essencePreview,
  type CatalystSim,
  type OmenSim,
  type RuneSim,
  targetableGroups,
  tierRangeText,
  groupTierRanges,
  evaluateTarget,
  type TargetEntry,
  type TargetableGroup,
  type SimBase,
  type ItemState,
  type HistoryEntry,
  type RolledMod,
  type OpName,
  type GroupChance,
  type EssenceSim
} from '../lib/craft-sim'
import {
  planCraft,
  enumerateActions,
  type CraftPlan,
  type PlanStep,
  type PlanAlternative,
  type RiskNote,
  type ActionEval
} from '../lib/craft-advisor'
import { itemStateToQueryItem, type QueryItem } from '../lib/trade-query'
import { estimateValue, openItemInTrade, priceErrMsg, type PriceEstimate } from '../lib/price-check'
import { ensureBuild, trackedBuild, gearSlots, slotItem, selectedSlot, guessSlot, consumeCraftSeed, craftSeedItem } from '../lib/build-target'
import { craftSeedFromItem, type CraftSeedItem } from '../lib/build-craft-seed'
import { compareMods, type CompareResult } from '../lib/build-compare'

const props = defineProps<{ isTr: boolean }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

// --- currency ikon + ad eşlemesi ---
interface Currency {
  en: string
  tr: string
  icon: string | null
}
const currencies = ((currencyData as { records?: Currency[] }).records ?? (currencyData as Currency[]))
const curByEn = new Map<string, Currency>()
for (const c of currencies) curByEn.set(c.en, c)
const curIconModules = import.meta.glob('../../assets/currency/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const curIconMap: Record<string, string> = {}
for (const p in curIconModules) curIconMap[(p.split('/').pop() as string).replace(/\.png$/i, '')] = curIconModules[p]
// item base ikonları (gerçek oyun ikonu) — src/renderer/assets/items
const itemIconModules = import.meta.glob('../../assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const itemIconMap: Record<string, string> = {}
for (const p in itemIconModules) itemIconMap[(p.split('/').pop() as string)] = itemIconModules[p]
function baseIcon(b: SimBase | null): string | null {
  if (!b || !b.icon) return null
  return itemIconMap[(b.icon.split('/').pop() as string)] ?? null
}
function curIcon(en: string): string | null {
  const c = curByEn.get(en)
  if (!c || !c.icon) return null
  return curIconMap[(c.icon.split('/').pop() as string).replace(/\.png$/i, '')] ?? null
}

// op -> currency adı (ikon + iki dilli ad için)
const OP_LIST: { op: OpName; en: string }[] = [
  { op: 'transmute', en: 'Orb of Transmutation' },
  { op: 'augment', en: 'Orb of Augmentation' },
  { op: 'regal', en: 'Regal Orb' },
  { op: 'alchemy', en: 'Orb of Alchemy' },
  { op: 'exalt', en: 'Exalted Orb' },
  { op: 'chaos', en: 'Chaos Orb' },
  { op: 'annul', en: 'Orb of Annulment' },
  { op: 'divine', en: 'Divine Orb' },
  { op: 'vaal', en: 'Vaal Orb' },
  { op: 'artificer', en: "Artificer's Orb" },
  { op: 'fracture', en: 'Fracturing Orb' },
  { op: 'blacksmith', en: "Blacksmith's Whetstone" },
  { op: 'armourer', en: "Armourer's Scrap" },
  { op: 'glassblower', en: "Glassblower's Bauble" }
]
function opName(en: string): string {
  const c = curByEn.get(en)
  return props.isTr && c?.tr ? c.tr : en
}

// --- taban seçimi ---
const classes = computed<string[]>(() => {
  const set = new Set<string>()
  for (const b of SIM_BASES) set.add(b.item_class)
  return [...set].sort((a, b) => a.localeCompare(b))
})
const selClass = ref<string>('Ring')
const basesOfClass = computed<SimBase[]>(() =>
  SIM_BASES.filter((b) => b.item_class === selClass.value).sort((a, b) => a.drop_level - b.drop_level || a.en.localeCompare(b.en))
)
const selBaseEn = ref<string>('Gold Ring')
const ilvl = ref<number>(80)
const selBase = computed<SimBase | null>(() => SIM_BASES.find((b) => b.en === selBaseEn.value) ?? basesOfClass.value[0] ?? null)
// taban arama: boşken sınıfın tabanları; doluyken TÜM tabanlarda item-class + ad (EN+TR) eşleşmesi
const baseSearch = ref('')
const baseOptions = computed<SimBase[]>(() => {
  const q = baseSearch.value.trim().toLowerCase()
  if (!q) return basesOfClass.value
  return SIM_BASES.filter((b) => (b.item_class + ' ' + b.en + ' ' + (b.tr || '')).toLowerCase().includes(q))
    .sort((a, b) => a.item_class.localeCompare(b.item_class) || a.drop_level - b.drop_level || a.en.localeCompare(b.en))
    .slice(0, 300)
})
function baseLabel(b: SimBase): string {
  // #4: taban adı HER ZAMAN İngilizce (özel adlar çevrilmez); yalnız çevre etiket TR olabilir.
  const cls = baseSearch.value.trim() ? b.item_class + ' · ' : ''
  return cls + b.en + ' (ilvl ' + b.drop_level + '+)'
}
// aramayla seçilen taban farklı sınıftansa sınıfı da güncelle
function onBaseSelect(): void {
  const b = SIM_BASES.find((x) => x.en === selBaseEn.value)
  if (b && b.item_class !== selClass.value) selClass.value = b.item_class
  startSession()
}

// --- oturum (sınıf state'i ref'lere kopyalanır) ---
let session: CraftSession | null = null
const item = shallowRef<ItemState | null>(null)
const history = ref<HistoryEntry[]>([])
const armedOmen = ref<OmenSim | null>(null) // kuşanılı omen (session'dan sync'lenir; sync()'ten önce tanımlı olmalı)
const canUndo = ref(false) // reaktif: session.canUndo (template non-reactive 'session'a bakmasın)
function sync(): void {
  if (!session) return
  item.value = session.item
  history.value = session.history.slice().reverse() // en yeni üstte
  armedOmen.value = session.armedOmen
  canUndo.value = session.canUndo
}
// implicit: base/ilvl seçilince bir kez rollanır, currency'lerle değişmez
const implicit = ref<{ en: string; tr: string } | null>(null)
function startSession(): void {
  const b = selBase.value
  if (!b) {
    session = null
    item.value = null
    history.value = []
    implicit.value = null
    return
  }
  const lv = Math.max(1, Math.min(100, Math.round(ilvl.value) || b.drop_level))
  session = new CraftSession(b, lv)
  implicit.value = b.implicit_en ? rollInlineRangesPaired(b.implicit_en, b.implicit_tr) : null
  canUndo.value = false
  sync()
}
function onClassChange(): void {
  selBaseEn.value = basesOfClass.value[0]?.en ?? ''
  startSession()
}
function doOp(op: OpName): void {
  if (!session || !item.value) return
  if (!canApply(item.value, op).ok) return
  session.apply(op)
  sync()
}
function undo(): void {
  session?.undo()
  sync()
}
function reset(): void {
  session?.reset()
  sync()
}
// ilk açılışta otomatik başlat
startSession()

// --- ESSENCE / CATALYST / OMEN / RUNE paneli ---
const craftMode = ref<'currency' | 'essence' | 'catalyst' | 'omen' | 'rune'>('currency')
// aktif malzeme listesi araması (ad EN+TR); mod değişince sıfırlanır
const matSearch = ref('')
watch(craftMode, () => {
  matSearch.value = ''
})
function matchMat(en: string, trName: string): boolean {
  const q = matSearch.value.trim().toLowerCase()
  if (!q) return true
  return (en + ' ' + (trName || '')).toLowerCase().includes(q)
}
const filteredOps = computed(() => OP_LIST.filter((o) => matchMat(o.en, curByEn.get(o.en)?.tr || '')))
const filteredOmens = computed(() => SIM_OMENS.filter((o) => matchMat(o.en, o.tr)))
const filteredRunes = computed(() => SIM_RUNES.filter((r) => matchMat(r.en, r.tr)))
function runeIcon(r: RuneSim): string | null {
  if (!r.icon) return null
  return curIconMap[(r.icon.split('/').pop() as string).replace(/\.png$/i, '')] ?? null
}
function runeName(r: RuneSim): string {
  return props.isTr && r.tr ? r.tr : r.en
}
function runeApplyState(r: RuneSim): { ok: boolean; reason: string } {
  return item.value ? canSocketRune(item.value, r) : { ok: false, reason: '—' }
}
function doRune(r: RuneSim): void {
  if (!session || !item.value || !canSocketRune(item.value, r).ok) return
  session.socketRune(r)
  sync()
}
const OMEN_OP_LABEL: Record<string, string> = { exalt: 'Exalted Orb', regal: 'Regal Orb', chaos: 'Chaos Orb' }
function omenIcon(o: OmenSim): string | null {
  if (!o.icon) return null
  return curIconMap[(o.icon.split('/').pop() as string).replace(/\.png$/i, '')] ?? null
}
function omenName(o: OmenSim): string {
  return props.isTr && o.tr ? o.tr : o.en
}
function omenEffect(o: OmenSim): string {
  return props.isTr ? o.effect_tr : o.effect_en
}
function armOmen(o: OmenSim): void {
  if (!session || !o.mappable) return
  session.armOmen(o)
  armedOmen.value = session.armedOmen
}
// catalyst: yalnız takı (jewellery hedefli), iki dilli
const jewelleryCatalysts = computed<CatalystSim[]>(() => SIM_CATALYSTS.filter((c) => c.target === 'jewellery'))
const filteredCatalysts = computed<CatalystSim[]>(() => jewelleryCatalysts.value.filter((c) => matchMat(c.en, c.tr)))
function catIcon(c: CatalystSim): string | null {
  if (!c.icon) return null
  return curIconMap[(c.icon.split('/').pop() as string).replace(/\.png$/i, '')] ?? null
}
function catName(c: CatalystSim): string {
  return props.isTr && c.tr ? c.tr : c.en
}
function catApplyState(c: CatalystSim): { ok: boolean; reason: string } {
  return item.value ? canApplyCatalyst(item.value, c) : { ok: false, reason: '—' }
}
function doCatalyst(c: CatalystSim): void {
  if (!session || !item.value || !canApplyCatalyst(item.value, c).ok) return
  session.applyCatalyst(c)
  sync()
}
type Tier = 'Lesser' | 'normal' | 'Greater' | 'Perfect'
const TIERS: { key: Tier; label: string }[] = [
  { key: 'Lesser', label: 'Lesser' },
  { key: 'normal', label: 'Normal' },
  { key: 'Greater', label: 'Greater' },
  { key: 'Perfect', label: 'Perfect' }
]
const essTier = ref<Tier>('Greater')
// seçili tier'daki essence'ler (tema sırasıyla)
const essencesOfTier = computed<EssenceSim[]>(() =>
  SIM_ESSENCES.filter((e) => e.tier === essTier.value).sort((a, b) => a.theme.localeCompare(b.theme))
)
const filteredEssences = computed<EssenceSim[]>(() => essencesOfTier.value.filter((e) => matchMat(e.en, e.tr)))
const selEssence = ref<EssenceSim | null>(null)
function essApplyState(e: EssenceSim): { ok: boolean; reason: string } {
  return item.value ? canApplyEssence(item.value, e) : { ok: false, reason: '—' }
}
function essIcon(e: EssenceSim): string | null {
  if (!e.icon) return null
  return curIconMap[(e.icon.split('/').pop() as string).replace(/\.png$/i, '')] ?? null
}
function essName(e: EssenceSim): string {
  return props.isTr && e.tr ? e.tr : e.en
}
// özel essence mod'larının temiz TR'si (weight=0 oldukları için ham TR kaba)
const SPECIAL_TR: Record<string, string> = {
  EssenceAbyss: 'Uçurum Lordu’nun İşaretini Taşır',
  SoulCore: 'Soketli Geliştirme Eşyalarının etkisi #% artar',
  CorruptionIntertactions: 'Yozlaşmada eşya iki Büyü kazanır',
  LocalMaximumQuality: 'Azami Kaliteye +#%'
}
const SPECIAL_GROUPS = new Set(Object.keys(SPECIAL_TR))
function fillNum(pattern: string, withNumbersFrom: string): string {
  const nums = withNumbersFrom.match(/[+-]?\d[\d.]*/g) ?? []
  let i = 0
  return pattern.replace(/#/g, () => nums[i++] ?? '')
}
// garantili mod önizlemesi (iki dilli, özel mod TR temiz)
const essPrev = computed(() => {
  if (!item.value || !selEssence.value) return null
  const p = essencePreview(item.value, selEssence.value)
  if (!p) return null
  const special = SPECIAL_GROUPS.has(p.group)
  return {
    en: p.en,
    tr: special ? SPECIAL_TR[p.group] : p.tr,
    affix: p.affix,
    approx: p.approx,
    special
  }
})
function selectEssence(e: EssenceSim): void {
  selEssence.value = e
}
function applyCurrentEssence(): void {
  const e = selEssence.value
  if (!session || !item.value || !e) return
  if (!canApplyEssence(item.value, e).ok) return
  session.applyEssence(e)
  sync()
}

// --- HEDEF EŞYA paneli ---
const targets = ref<TargetEntry[]>([])
const selTargetGroup = ref('')
const selMinTier = ref(1)
const targetGroups = computed<TargetableGroup[]>(() =>
  selBase.value ? targetableGroups(selBase.value, Math.max(1, Math.min(100, Math.round(ilvl.value) || 1))) : []
)
// hedef mod grubu araması (ad EN+TR)
const targetSearch = ref('')
const filteredTargetGroups = computed<TargetableGroup[]>(() => {
  const q = targetSearch.value.trim().toLowerCase()
  if (!q) return targetGroups.value
  return targetGroups.value.filter((g) => (g.en + ' ' + (g.tr || '')).toLowerCase().includes(q))
})
const selGroupInfo = computed<TargetableGroup | null>(
  () => targetGroups.value.find((g) => g.group === selTargetGroup.value) ?? null
)
// seçili grubun tier-bazlı (T1..Tn) değer aralıkları (index = tier-1)
const selGroupTierRanges = computed<string[]>(() =>
  selGroupInfo.value ? groupTierRanges(selGroupInfo.value.group, selGroupInfo.value.affix) : []
)
// hedef satırındaki gerekli tier'ın değer aralığı
function rowRange(r: { group: string; affix: 'prefix' | 'suffix'; minTier: number }): string {
  return groupTierRanges(r.group, r.affix)[r.minTier - 1] ?? ''
}
const targetStatus = computed(() => (item.value ? evaluateTarget(item.value, targets.value) : null))
const metCount = computed(() => targetStatus.value?.rows.filter((r) => r.met).length ?? 0)
function groupLabel(g: { en: string; tr: string }): string {
  return (props.isTr && g.tr ? g.tr : g.en).split('\n')[0]
}
function saveCraft(): void {
  window.api?.craft?.set(
    JSON.stringify({ class: selClass.value, base: selBaseEn.value, ilvl: ilvl.value, targets: targets.value })
  )
}
function addTarget(): void {
  const g = selTargetGroup.value
  if (!g || targets.value.some((t) => t.group === g)) return
  targets.value = [...targets.value, { group: g, minTier: selMinTier.value }]
  selTargetGroup.value = ''
  selMinTier.value = 1
  saveCraft()
}
function removeTarget(group: string): void {
  targets.value = targets.value.filter((t) => t.group !== group)
  saveCraft()
}
function clearTargets(): void {
  targets.value = []
  saveCraft()
}

// --- USTA CRAFT YARDIMCISI (offline, çok-adımlı) ---
const plan = computed<CraftPlan | null>(() =>
  item.value && targets.value.length ? planCraft(item.value, targets.value) : null
)
// bir ActionEval'in iki dilli adı (essence/omen/op/catalyst/rune)
function actionName(a: ActionEval): string {
  if (a.essence) return essName(a.essence)
  if (a.omen && a.op) return omenName(a.omen) + ' + ' + opLabelByName(a.op)
  if (a.catalyst) return catName(a.catalyst)
  if (a.rune) return runeName(a.rune)
  if (a.op) return opLabelByName(a.op)
  return a.labelEn
}
// hedef adının ilk satırı (iki dilli)
function tgtOf(en?: string, trv?: string): string {
  return (props.isTr && trv ? trv : en || '').split('\n')[0]
}
function chanceLabel(s: PlanStep): string {
  if (s.deterministic) return tr('kesin', 'sure')
  if (s.action.guaranteed) return '%100'
  return '%' + Math.round(s.chance * 100)
}
// bir adımın usta-craftçı cümlesi (rationaleCode → şablon)
function stepDesc(s: PlanStep): string {
  const n = actionName(s.action)
  const t = tgtOf(s.targetEn, s.targetTr)
  switch (s.rationaleCode) {
    case 'start':
      return tr(`${n} ile tabanı Magic yap — craft'a başla.`, `Use ${n} to make it Magic — begin crafting.`)
    case 'to_magic_for_essence':
      return tr(`${n} ile Magic yap; essence'i hemen ardından basacağız.`, `Use ${n} to make Magic; we'll slam the essence right after.`)
    case 'essence':
      return tr(`${n} bas — «${t}» garantili gelir (%100).`, `Slam ${n} — «${t}» comes guaranteed (100%).`)
    case 'essence_risk':
      return tr(`${n} bas — «${t}» garanti, ama rastgele 1 mod gider (riskli).`, `Slam ${n} — «${t}» guaranteed, but removes 1 random mod (risky).`)
    case 'augment':
      return tr(`${n} ile boş slota «${t}» dene.`, `Use ${n} to fill the open slot toward «${t}».`)
    case 'to_rare':
      return tr(`${n} ile Rare yap — «${t}» için daha çok slot.`, `Use ${n} to go Rare — more slots for «${t}».`)
    case 'omen_regal':
      return tr(`${n} — Regal'i «${t}» tarafına yönlendir (şans artar).`, `${n} — steer the Regal toward «${t}» (better odds).`)
    case 'exalt':
      return tr(`${n} ile «${t}» eklemeyi dene.`, `Use ${n} to add «${t}».`)
    case 'omen_exalt':
      return tr(`${n} — exalt'ı «${t}» tarafına kilitle, şans yükselir.`, `${n} — lock the exalt to «${t}»'s side, odds rise.`)
    case 'greater_exalt':
      return tr(`${n} — tek hamlede 2 mod ekle.`, `${n} — add 2 mods in one go.`)
    case 'annul_room':
      return tr(`${n} ile istenmeyen modu kaldır, «${t}»'ye yer aç (riskli).`, `Use ${n} to remove an unwanted mod, freeing room for «${t}» (risky).`)
    case 'tier_reroll':
      return tr(`${n} ile «${t}» tier'ını yeniden dene (Divine yalnız değeri yeniler, tier'ı değil).`, `Use ${n} to reroll «${t}»'s tier (Divine only rerolls values, not tier).`)
    case 'fracture_lock':
      return tr(`${n} ile keeper'ı kilitle, sonra Chaos ile gerisini güvenle düzelt.`, `Use ${n} to lock the keeper, then Chaos the rest safely.`)
    case 'quality_polish':
      return tr(`${n} ile kaliteyi yükselt — son rötuş.`, `Use ${n} to raise quality — final polish.`)
    default:
      return n
  }
}
// alternatif yaklaşımın karşılaştırma cümlesi
function altDesc(a: PlanAlternative): string {
  const n = actionName(a.action)
  const ch = '%' + Math.round(a.chance * 100)
  const cost = '£'.repeat(a.action.costRank)
  switch (a.rationaleCode) {
    case 'guaranteed_pricier':
      return tr(`${n} — %100 garanti ama daha pahalı (${cost}).`, `${n} — 100% guaranteed but pricier (${cost}).`)
    case 'guaranteed_same':
      return tr(`${n} — %100 garanti.`, `${n} — 100% guaranteed.`)
    case 'omen_higher':
      return tr(`${n} — omen ile daha yüksek şans (${ch}), biraz pahalı.`, `${n} — higher odds via omen (${ch}), a bit pricier.`)
    case 'cheaper_lower':
      return tr(`${n} — daha ucuz ama düşük şans (${ch}).`, `${n} — cheaper but lower odds (${ch}).`)
    case 'risky_faster':
      return tr(`${n} — daha hızlı ama riskli (${ch}).`, `${n} — faster but risky (${ch}).`)
    default:
      return tr(`${n} — alternatif (${ch}).`, `${n} — alternative (${ch}).`)
  }
}
// risk notu cümlesi
function riskDesc(r: RiskNote): string {
  const pct = r.lossChance > 0 ? ' ~%' + Math.round(r.lossChance * 100) : ''
  switch (r.code) {
    case 'annul_danger':
      return tr(`Annul rastgele kaldırır — istenen modu kaybetme${pct}.`, `Annul removes at random — chance to lose a wanted mod${pct}.`)
    case 'chaos_remove':
      return tr(`Chaos rastgele 1 mod siler — keeper riski${pct}.`, `Chaos deletes 1 random mod — keeper risk${pct}.`)
    case 'vaal_irreversible':
      return tr('Vaal GERİ ALINAMAZ — item kalıcı kilitlenir.', 'Vaal is IRREVERSIBLE — item gets permanently locked.')
    case 'corruption_locked':
      return tr('Item corrupted — artık değiştirilemez.', 'Item is corrupted — can no longer be changed.')
    case 'fracture_random':
      return tr(`Fracture rastgele kilitler — yanlış mod kilitlenebilir${pct}.`, `Fracture locks at random — may lock the wrong mod${pct}.`)
    default:
      return r.code
  }
}
// çıkmaz açıklaması + reset kapsamı
const deadendMsg = computed<string>(() => {
  const p = plan.value
  if (!p || p.kind !== 'deadend') return ''
  if (p.deadend?.code === 'limit')
    return tr('Hedefler slot limitini aşıyor — hedef sayısını azalt.', 'Targets exceed the slot limit — reduce the number of targets.')
  if (p.deadend?.scope === 'new-base')
    return tr('Bu hedef bu tabanda/ilvl’de imkânsız — yeni taban veya ilvl dene.', 'This target is impossible on this base/ilvl — try another base or ilvl.')
  return tr('Bu deneme tıkandı (slotlar dolu, keeper’lar korunuyor). Sıfırla ve yeniden dene.', 'This attempt is stuck (slots full, keepers protected). Reset and retry.')
})
const deadendBtn = computed<string>(() => {
  const p = plan.value
  return p?.deadend?.scope === 'new-base'
    ? tr('Sıfırla (yeni taban dene)', 'Reset (try a new base)')
    : tr('Sıfırla & yeniden dene', 'Reset & retry')
})
// strateji rozeti (iki dilli kısa ad)
function strategyLabel(s: CraftPlan['strategy']): string {
  switch (s) {
    case 'essence-slam': return tr('Essence-Slam', 'Essence-Slam')
    case 'alt-regal': return tr('Alt→Regal', 'Alt→Regal')
    case 'omen-exalt': return tr('Hedefli Exalt', 'Targeted Exalt')
    case 'annul-room': return tr('Yer Aç (Annul)', 'Make Room (Annul)')
    case 'chaos-reroll': return tr('Chaos Reroll', 'Chaos Reroll')
    case 'fracture-chaos': return tr('Fracture→Chaos', 'Fracture→Chaos')
    case 'quality-polish': return tr('Kalite Rötuş', 'Quality Polish')
    case 'rarity-start': return tr('Başlangıç', 'Start')
    default: return tr('Çıkmaz', 'Dead-end')
  }
}
// bir ActionEval'i uygula (omen tekniğinde önce kuşan, sonra op — tek tık)
function applyActionEval(a: ActionEval): void {
  if (!session) return
  if (a.essence) session.applyEssence(a.essence)
  else if (a.catalyst) session.applyCatalyst(a.catalyst)
  else if (a.rune) session.socketRune(a.rune)
  else if (a.omen && a.op) {
    session.armOmen(a.omen)
    session.apply(a.op)
  } else if (a.op) session.apply(a.op)
  sync()
}
function applyPrimary(): void {
  const p = plan.value
  if (!p) return
  if (p.kind === 'plan' && p.steps[0]) applyActionEval(p.steps[0].action)
  else if (p.kind === 'reached' && p.primary) applyActionEval(p.primary)
}
function applyAlt(a: PlanAlternative): void {
  applyActionEval(a.action)
}

// --- LLM modu (opsiyonel; kullanıcının kendi anahtarıyla, main process'ten) ---
const advisorMode = ref<'offline' | 'llm'>('offline')
const advisorHasKey = ref(false)
let unsubSettings: (() => void) | null = null
interface LlmState {
  loading: boolean
  text: string
  actionId: string
  fellBack: boolean
  error: string
}
const llm = ref<LlmState | null>(null)
let actionMap: Record<string, ActionEval> = {}
let llmTimer: ReturnType<typeof setTimeout> | null = null
let llmSeq = 0

/** LLM'e gönderilecek ground-truth bağlam (gerçek state + hedef + geçerli aksiyonlar + usta-craft analizi).
 *  Tüm sayılar gerçek (enumerateActions/planCraft); LLM SADECE validActions id'lerinden seçer. */
function buildLlmContext(): unknown {
  const it = item.value
  if (!it) return {}
  const status = evaluateTarget(it, targets.value)
  const p = planCraft(it, targets.value)
  const cands = enumerateActions(it, targets.value)
  actionMap = {}
  const pct = (n: number): number => +(n * 100).toFixed(1)
  // odaklı, grounded aksiyon listesi: ilerleten + garanti essence + temel manipülasyonlar
  const useful = cands.filter(
    (c) =>
      c.progressChance > 0 ||
      (c.kind === 'essence' && c.progressChance === 1) ||
      c.kind === 'annul' ||
      c.kind === 'vaal' ||
      c.kind === 'fracture' ||
      c.kind === 'quality'
  )
  const validActions = useful.map((c) => {
    actionMap[c.id] = c
    return {
      id: c.id,
      label: c.labelEn,
      kind: c.kind,
      technique: c.technique,
      progressChancePct: pct(c.progressChance),
      guaranteed: c.guaranteed,
      costRank: c.costRank,
      risk: { level: c.risk.level, lossChancePct: pct(c.risk.lossChance) }
    }
  })
  const offlineId = p.kind === 'plan' ? p.steps[0]?.action.id ?? '' : ''
  return {
    base: selBase.value?.en,
    ilvl: it.ilvl,
    rarity: it.rarity,
    prefixes: it.prefixes.map((m) => m.en),
    suffixes: it.suffixes.map((m) => m.en),
    target: status.rows.map((r) => ({ mod: r.en.replace(/\n/g, ' '), minTier: r.minTier, met: r.met, currentTier: r.currentTier })),
    targetReached: status.reached,
    // usta-craft analizi (offline çekirdek — LLM bunu dayanak alır)
    recognizedStrategy: p.strategy,
    recommendedPlan:
      p.kind === 'plan'
        ? p.steps.map((s) => ({ id: s.action.id, rationale: s.rationaleCode, chancePct: pct(s.chance), deterministic: s.deterministic }))
        : [],
    cumulativeApproxPct: pct(p.cumulative),
    cumulativeIsApprox: p.cumulativeApprox,
    alternatives: p.alternatives.map((a) => ({ id: a.action.id, rationale: a.rationaleCode, chancePct: pct(a.chance), costDelta: a.costDelta })),
    risks: p.risks.map((r) => ({ code: r.code, level: r.level, lossChancePct: pct(r.lossChance) })),
    deadend: p.deadend ?? null,
    offlineRecommendation: offlineId,
    validActions
  }
}

async function runLlm(): Promise<void> {
  if (advisorMode.value !== 'llm' || !item.value || !targets.value.length) {
    llm.value = null
    return
  }
  if (!advisorHasKey.value) {
    llm.value = { loading: false, text: '', actionId: '', fellBack: true, error: 'no_key' }
    return
  }
  const seq = ++llmSeq
  llm.value = { loading: true, text: '', actionId: '', fellBack: false, error: '' }
  const ctx = buildLlmContext()
  const res = (await window.api?.advisor?.llm(ctx, props.isTr ? 'tr' : 'en')) as
    | { ok: boolean; advice?: string; actionId?: string; error?: string }
    | undefined
  if (seq !== llmSeq) return // eskimiş yanıt
  if (res && res.ok) {
    llm.value = { loading: false, text: res.advice ?? '', actionId: res.actionId ?? '', fellBack: false, error: '' }
  } else {
    llm.value = { loading: false, text: '', actionId: '', fellBack: true, error: res?.error ?? 'network' }
  }
}
// state/hedef/mod değişince LLM'i (debounce) yeniden çağır
watch([item, targets, advisorMode], () => {
  if (advisorMode.value !== 'llm') {
    llm.value = null
    return
  }
  if (llmTimer) clearTimeout(llmTimer)
  llmTimer = setTimeout(runLlm, 450)
})
const llmWarn = computed<string>(() => {
  if (!llm.value?.fellBack) return ''
  if (llm.value.error === 'no_key')
    return tr('LLM seçili ama anahtar yok — Ayarlar’dan ekle. Offline öneri gösteriliyor.', 'LLM selected but no key — add one in Settings. Showing offline advice.')
  return tr(`LLM ulaşılamadı (${llm.value.error}) — offline öneri gösteriliyor.`, `LLM unavailable (${llm.value.error}) — showing offline advice.`)
})
function applyLlm(): void {
  if (!session || !llm.value) return
  const act = actionMap[llm.value.actionId]
  if (act) applyActionEval(act) // omen tekniğinde önce kuşan + uygula (applyActionEval içinde)
  else applyPrimary() // LLM geçerli id vermediyse offline öneriyi uygula
}

onMounted(async () => {
  const s = (await window.api?.settings?.get()) as { advisor?: { mode: 'offline' | 'llm'; hasKey: boolean } } | undefined
  if (s?.advisor) {
    advisorMode.value = s.advisor.mode
    advisorHasKey.value = s.advisor.hasKey
  }
  unsubSettings =
    window.api?.settings?.onChanged((st) => {
      const a = (st as { advisor?: { mode: 'offline' | 'llm'; hasKey: boolean } }).advisor
      if (a) {
        advisorMode.value = a.mode
        advisorHasKey.value = a.hasKey
      }
    }) ?? null
  if (advisorMode.value === 'llm') runLlm()
})
onBeforeUnmount(() => {
  unsubSettings?.()
  if (llmTimer) clearTimeout(llmTimer)
  if (valTimer) clearTimeout(valTimer)
})
// grup değişince min tier'ı sıfırla
watch(selTargetGroup, () => {
  selMinTier.value = 1
})
// base/ilvl değişince hedefi kaydet (feasibility yeniden değerlenir)
watch([selBaseEn, ilvl], () => saveCraft())

onMounted(async () => {
  const raw = (await window.api?.craft?.get()) ?? ''
  // #3 (0.17.2): bu await ÇÖZÜLENE kadar senkron mount'ta "Craft'la" tohumu uygulanmış olabilir
  // (seedApplied). Öyleyse kayıtlı craft state'i (önceki oturumun tabanı, ör. Gemini Bow) tohumun
  // ÜZERİNE YAZMAMALI — aksi halde tıklanan eşya yerine yanlış taban görünür.
  if (seedApplied.value) return
  if (!raw) return
  try {
    const c = JSON.parse(raw)
    if (c.class) selClass.value = c.class
    if (c.base) selBaseEn.value = c.base
    if (typeof c.ilvl === 'number') ilvl.value = c.ilvl
    if (Array.isArray(c.targets)) targets.value = c.targets
    startSession()
  } catch {
    /* bozuk kayıt -> yok say */
  }
})

// ============================================================================
// TAHMİNİ DEĞER (Faz 1) — craftlanan eşyayı trade2'de benzer ilanlarla fiyatlandır.
// AĞ İSTİSNASI: yalnız eşya/sorgu gönderilir; kişisel veri YOK. Otomatik alım YOK.
// Değer her zaman "≈ TAHMİNİ" (benzer ilan dağılımı). Ağ yok/hata → açık kart, çökme yok.
// ----------------------------------------------------------------------------
// Faz 1 fiyat motoru artık paylaşılan lib/price-check.ts'te (oyun-içi overlay de aynısını kullanır).
const valueState = ref<{ loading: boolean } & Partial<PriceEstimate> | null>(null)
const valErrMsg = (code: string): string => priceErrMsg(code, props.isTr)
const queryItem = ref<QueryItem | null>(null) // Faz 4: toggle'lar arasında korunur

async function runEstimate(): Promise<void> {
  if (!queryItem.value) return
  valueState.value = { loading: true }
  const r = await estimateValue(queryItem.value)
  valueState.value = { loading: false, ...r }
}
async function checkValue(): Promise<void> {
  if (!item.value) return
  queryItem.value = itemStateToQueryItem(item.value)
  await runEstimate()
}
// Faz 4: stat filtreleri (eşleşen mod'lar); kapatınca sorgudan çıkar
const filterMods = computed(() => queryItem.value?.mods.filter((m) => m.matched) ?? [])
const activeFilterCount = computed(() => filterMods.value.filter((m) => m.enabled).length)
// Part 3: stat ekle/çıkar + min değer → CANLI yeniden sorgula (debounce; rate-limit kuyruğu main'de)
let valTimer: ReturnType<typeof setTimeout> | null = null
function scheduleEstimate(): void {
  if (valTimer) clearTimeout(valTimer)
  valTimer = setTimeout(() => {
    valTimer = null
    void runEstimate()
  }, 650)
}
async function openInTrade(): Promise<void> {
  if (!item.value) return
  await openItemInTrade(queryItem.value ?? itemStateToQueryItem(item.value))
}

// --- BUILD KARŞILAŞTIRMA (Faz 3) — craft eşyasını takip edilen build hedef slotuyla karşılaştır ---
onMounted(() => {
  ensureBuild()
})

// --- Part 5: build eşyasından gelen "Craft'la" tohumunu uygula (SOL=taban, SAĞ=hedef modlar) ---
const seedSource = ref<CraftSeedItem | null>(null) // gösterim için orijinal build eşyası
const seedApplied = ref(false) // #3: bir "Craft'la" tohumu uygulandı mı (kayıtlı-craft yükleyici ezmesin)
const seedUnmatched = ref<string[]>([])
const seedNotice = ref<{ baseEn: string; matched: number; unmatched: number; suggested: boolean } | null>(null)
function applyCraftSeed(it: CraftSeedItem): void {
  const seed = craftSeedFromItem(it)
  seedApplied.value = true // kayıtlı-craft yükleyici (async) tohumu ezmesin
  seedSource.value = it
  seedUnmatched.value = seed.unmatched
  // baseEn artık item-class tahminiyle de dolabilir (baseSuggested) — selClass SIM sınıfı listede olmalı.
  if (seed.baseEn && seed.itemClass && classes.value.includes(seed.itemClass)) {
    // SOL taraf: bu eşyanın SAF/beyaz tabanı (kesin VEYA tahmini; kullanıcı taban kutusundan düzeltebilir)
    selClass.value = seed.itemClass
    selBaseEn.value = seed.baseEn
    ilvl.value = seed.ilvl
    baseSearch.value = ''
    startSession()
    // SAĞ taraf: hedef = build eşyasının eşleşen modları
    targets.value = seed.targets
    saveCraft()
    craftMode.value = 'currency'
  }
  seedNotice.value = { baseEn: seed.baseEn || '', matched: seed.matched.length, unmatched: seed.unmatched.length, suggested: seed.baseSuggested }
}
// mount'ta bekleyen tohumu tüket (CraftSimulator v-if ile her aktifleşmede yeniden mount olur)
onMounted(() => {
  const pending = consumeCraftSeed()
  if (pending) applyCraftSeed(pending)
})
// zaten mount'tayken yeni tohum gelirse (nadiren) uygula
watch(craftSeedItem, (v) => {
  if (v) {
    const it = consumeCraftSeed()
    if (it) applyCraftSeed(it)
  }
})
function dismissSeedNotice(): void {
  seedNotice.value = null
  seedSource.value = null
  seedUnmatched.value = []
}
const compareSlots = computed(() => (trackedBuild.value ? gearSlots(trackedBuild.value) : []))
// seçili slot: global selectedSlot (BuildView'dan) → yoksa item tabanına göre tahmin
const compareSlot = computed<string>({
  get() {
    if (selectedSlot.value && trackedBuild.value?.slots[selectedSlot.value]) return selectedSlot.value
    if (trackedBuild.value && item.value) return guessSlot(trackedBuild.value, item.value.base.item_class || item.value.base.en)
    return ''
  },
  set(v: string) {
    selectedSlot.value = v
  }
})
function craftCandidateLines(): string[] {
  if (!item.value) return []
  const out: string[] = []
  for (const im of item.value.implicits) out.push(...im.en.split('\n'))
  for (const m of item.value.prefixes) out.push(...m.en.split('\n'))
  for (const m of item.value.suffixes) out.push(...m.en.split('\n'))
  return out
}
const compareResult = computed<CompareResult | null>(() => {
  const b = trackedBuild.value
  if (!b || !item.value || !compareSlot.value) return null
  const tgt = slotItem(b, compareSlot.value)
  if (!tgt) return null
  return compareMods(tgt.mods, craftCandidateLines())
})
function scoreClass(s: number): string {
  return s >= 85 ? 'cs-cmp-ok' : s >= 55 ? 'cs-cmp-close' : 'cs-cmp-low'
}
function rowTag(row: { kind: string; status: string }): string {
  if (row.kind === 'missing') return tr('EKSİK', 'MISSING')
  if (row.kind === 'extra') return tr('FAZLA', 'EXTRA')
  if (row.status === 'ok') return tr('TAM', 'FULL')
  if (row.status === 'close') return tr('YAKIN', 'CLOSE')
  if (row.status === 'low') return tr('DÜŞÜK', 'LOW')
  return tr('VAR', 'OK')
}
function tagClass(row: { kind: string; status: string }): string {
  if (row.kind === 'missing') return 'cs-cmp-tag--missing'
  if (row.kind === 'extra') return 'cs-cmp-tag--extra'
  return 'cs-cmp-tag--' + row.status
}

// item değişince eski değer sonucunu + sorguyu temizle (yanıltıcı olmasın)
watch(item, () => {
  valueState.value = null
  queryItem.value = null
})

// --- olasılık göstergesi (tek-adım grup şansı) ---
// Mevcut state'e uygulanabilecek ilk EKLEME op'u (otomatik önizleme hedefi)
const ADD_OPS: OpName[] = ['transmute', 'augment', 'regal', 'exalt', 'alchemy', 'chaos']
const autoOp = computed<OpName | null>(() => {
  if (!item.value) return null
  for (const o of ADD_OPS) if (canApply(item.value, o).ok) return o
  return null
})
const hoverOp = ref<OpName | null>(null)
const previewOp = computed<OpName | null>(() => {
  // hover edilen op ekleme yapıyorsa onu, yoksa otomatik op'u önizle
  if (hoverOp.value && ADD_OPS.includes(hoverOp.value) && item.value && canApply(item.value, hoverOp.value).ok)
    return hoverOp.value
  return autoOp.value
})
const chances = computed(() => (item.value && previewOp.value ? groupChances(item.value, previewOp.value) : null))
function opLabelByName(op: OpName): string {
  const e = OP_LIST.find((o) => o.op === op)
  return e ? opName(e.en) : op
}
function pct(g: GroupChance): string {
  return (g.chance * 100).toFixed(g.chance < 0.01 ? 2 : 1) + '%'
}
const chanceText = (g: GroupChance): string => (props.isTr && g.tr ? g.tr : g.en).replace(/\n/g, ', ')

// --- tooltip yardımcıları ---
function modLine(m: RolledMod): { en: string; tr: string; tier: number; tierMax: number; range: string; special: boolean; boosted: boolean } {
  const special = SPECIAL_GROUPS.has(m.mod.group)
  // catalyst kalitesi: tag eşleşen mod'un değerleri artırılmış gösterilir
  const cb = item.value ? catalystBoosted(item.value, m) : { en: m.en, tr: m.tr, boosted: false }
  const enText = cb.en
  const trText = special ? fillNum(SPECIAL_TR[m.mod.group], enText) : cb.tr || ''
  return { en: enText, tr: trText, tier: tierOf(m.mod), tierMax: tierCount(m.mod), range: tierRangeText(m.mod), special, boosted: cb.boosted }
}
const rarityLabel = computed(() => {
  const r = item.value?.rarity
  if (r === 'rare') return tr('Nadir', 'Rare')
  if (r === 'magic') return tr('Sihirli', 'Magic')
  return tr('Normal', 'Normal')
})
const qStats = computed(() => (item.value ? qualityStats(item.value) : []))
function applyState(op: OpName): { ok: boolean; reason: string } {
  return item.value ? canApply(item.value, op) : { ok: false, reason: '—' }
}
// EN değer satırını sayıları vurgulayarak parçala
function parts(text: string): { t: string; num: boolean }[] {
  const out: { t: string; num: boolean }[] = []
  const re = /([+-]?\d[\d.]*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), num: false })
    out.push({ t: m[0], num: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), num: false })
  return out
}
</script>

<template>
  <div class="cs">
    <!-- Part 5: build eşyasından "Craft'la" bildirimi (SOL=taban, SAĞ=hedef modlar yüklendi) -->
    <div v-if="seedNotice" class="cs-seed">
      <div class="cs-seed-main">
        <span class="cs-seed-ic">⚒</span>
        <template v-if="seedNotice.baseEn">
          <b>{{ seedNotice.suggested ? seedNotice.baseEn : (seedSource?.pureBase || seedSource?.base) }}</b>
          {{ tr('build’den yüklendi — taban soldaki, hedef modlar sağdaki Hedef Eşya’da.', 'loaded from build — base on the left, target mods in the Target panel on the right.') }}
          <span v-if="seedNotice.suggested" class="cs-seed-stat cs-seed-stat--warn">{{ tr('tahmini taban — taban kutusundan düzelt', 'estimated base — fix it in the Base box') }}</span>
          <span class="cs-seed-stat">{{ seedNotice.matched }} {{ tr('hedef', 'targets') }}</span>
          <span v-if="seedNotice.unmatched" class="cs-seed-stat cs-seed-stat--warn">{{ seedNotice.unmatched }} {{ tr('eşleşmedi', 'unmatched') }}</span>
        </template>
        <template v-else>
          {{ tr('Bu eşyanın tabanı/sınıfı simülatörde bulunamadı — elle taban seç.', 'This item’s base/class isn’t in the simulator — pick a base manually.') }}
        </template>
        <button class="cs-seed-x" @click="dismissSeedNotice">✕</button>
      </div>
      <div v-if="seedUnmatched.length" class="cs-seed-unmatched">
        {{ tr('Hedefe çevrilemeyen (kendin ekleyebilirsin)', 'Not mapped to a target (you can add these)') }}:
        <span v-for="(u, i) in seedUnmatched" :key="i" class="cs-seed-um">{{ u }}</span>
      </div>
    </div>

    <!-- ÜST: taban seçici -->
    <div class="cs-top">
      <label class="cs-field">
        <span class="cs-lbl">{{ tr('Item Sınıfı', 'Item Class') }}</span>
        <select v-model="selClass" class="class-filter" @change="onClassChange">
          <option v-for="c in classes" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="cs-field cs-field--search">
        <span class="cs-lbl">{{ tr('Taban Ara', 'Search Base') }}</span>
        <input
          v-model="baseSearch"
          class="cs-search"
          type="text"
          :placeholder="tr('item-class / taban adı…', 'item-class / base name…')"
        />
      </label>
      <label class="cs-field cs-field--base">
        <span class="cs-lbl">{{ tr('Taban', 'Base') }}</span>
        <select v-model="selBaseEn" class="class-filter" @change="onBaseSelect">
          <option v-for="b in baseOptions" :key="b.id" :value="b.en">{{ baseLabel(b) }}</option>
        </select>
      </label>
      <label class="cs-field cs-field--ilvl">
        <span class="cs-lbl">ilvl</span>
        <input v-model.number="ilvl" type="number" min="1" max="100" class="cs-ilvl" @change="startSession" />
      </label>
    </div>

    <div class="cs-body">
      <!-- SOL: currency / essence -->
      <section class="cs-ops panel-frame">
        <div class="cs-modetabs">
          <button class="cs-modetab" :class="{ 'cs-modetab--on': craftMode === 'currency' }" @click="craftMode = 'currency'">{{ tr('Currency', 'Currency') }}</button>
          <button class="cs-modetab" :class="{ 'cs-modetab--on': craftMode === 'essence' }" @click="craftMode = 'essence'">Essence</button>
          <button class="cs-modetab" :class="{ 'cs-modetab--on': craftMode === 'catalyst' }" @click="craftMode = 'catalyst'">Catalyst</button>
          <button class="cs-modetab" :class="{ 'cs-modetab--on': craftMode === 'omen' }" @click="craftMode = 'omen'">Omen</button>
          <button class="cs-modetab" :class="{ 'cs-modetab--on': craftMode === 'rune' }" @click="craftMode = 'rune'">Rune</button>
        </div>

        <!-- aktif malzeme listesi araması -->
        <input
          v-model="matSearch"
          class="cs-search cs-search--mat"
          type="text"
          :placeholder="tr('Malzeme ara…', 'Search material…')"
        />

        <!-- kuşanılı omen göstergesi (tüm modlarda) -->
        <div v-if="armedOmen" class="cs-armed">
          <span class="cs-armed-lbl">{{ tr('Kuşanıldı', 'Armed') }}:</span>
          <span class="cs-armed-op">{{ tr('Sonraki', 'Next') }} {{ OMEN_OP_LABEL[armedOmen.op] }}</span>
          <span class="cs-armed-eff">{{ omenEffect(armedOmen) }}</span>
          <button class="cs-armed-x" :title="tr('Kaldır', 'Remove')" @click="armOmen(armedOmen)">×</button>
        </div>

        <!-- CURRENCY -->
        <div v-if="craftMode === 'currency'" class="cs-oplist">
          <button
            v-for="o in filteredOps"
            :key="o.op"
            class="cs-op"
            :class="{ 'cs-op--off': !applyState(o.op).ok }"
            :disabled="!applyState(o.op).ok"
            :title="applyState(o.op).ok ? opName(o.en) : opName(o.en) + ' — ' + applyState(o.op).reason"
            @click="doOp(o.op)"
            @mouseenter="hoverOp = o.op"
            @mouseleave="hoverOp = null"
          >
            <img v-if="curIcon(o.en)" :src="curIcon(o.en)!" class="cs-op-ic" alt="" />
            <span v-else class="cs-op-ph">◆</span>
            <span class="cs-op-name">{{ opName(o.en) }}</span>
          </button>
        </div>

        <!-- ESSENCE -->
        <div v-else-if="craftMode === 'essence'" class="cs-esswrap">
          <div class="cs-esstiers">
            <button
              v-for="t in TIERS"
              :key="t.key"
              class="cs-esstier"
              :class="{ 'cs-esstier--on': essTier === t.key }"
              @click="essTier = t.key"
            >{{ t.label }}</button>
          </div>
          <div class="cs-esslist">
            <button
              v-for="e in filteredEssences"
              :key="e.id"
              class="cs-ess"
              :class="{ 'cs-ess--off': !essApplyState(e).ok, 'cs-ess--sel': selEssence && selEssence.id === e.id }"
              :title="essApplyState(e).ok ? essName(e) : essName(e) + ' — ' + essApplyState(e).reason"
              @click="selectEssence(e)"
            >
              <img v-if="essIcon(e)" :src="essIcon(e)!" class="cs-ess-ic" alt="" />
              <span v-else class="cs-op-ph">◆</span>
              <span class="cs-ess-name">{{ essName(e) }}</span>
              <span v-if="!e.mappable" class="cs-ess-flag">{{ tr('veri yok', 'no data') }}</span>
            </button>
          </div>
        </div>

        <!-- CATALYST (takı tag-bazlı kalite) -->
        <div v-else-if="craftMode === 'catalyst'" class="cs-esswrap">
          <div class="cs-cathint">{{ tr('Takı (ring/amulet) — tag kalitesi', 'Jewellery (ring/amulet) — tag quality') }}</div>
          <div class="cs-esslist">
            <button
              v-for="c in filteredCatalysts"
              :key="c.id"
              class="cs-ess"
              :class="{ 'cs-ess--off': !catApplyState(c).ok, 'cs-ess--sel': item && item.catalystTag === c.tag }"
              :title="catApplyState(c).ok ? catName(c) + ' — ' + c.tag : catName(c) + ' — ' + catApplyState(c).reason"
              @click="doCatalyst(c)"
            >
              <img v-if="catIcon(c)" :src="catIcon(c)!" class="cs-ess-ic" alt="" />
              <span v-else class="cs-op-ph">◆</span>
              <span class="cs-ess-name">{{ catName(c) }}</span>
              <span class="cs-ess-flag cs-cattag">{{ c.tag }}</span>
            </button>
          </div>
        </div>

        <!-- RUNE / SOUL CORE (boş sokete sabit mod) -->
        <div v-else-if="craftMode === 'rune'" class="cs-esswrap">
          <div class="cs-cathint">{{ tr('Önce Artificer ile soket aç → rune tak', 'Open a socket with Artificer → socket a rune') }}</div>
          <div class="cs-esslist">
            <button
              v-for="r in filteredRunes"
              :key="r.id"
              class="cs-ess"
              :class="{ 'cs-ess--off': !runeApplyState(r).ok }"
              :title="r.mappable ? runeName(r) + ' — ' + (props.isTr ? r.effect_tr : r.effect_en) + ' (' + r.classes + ')' : runeName(r) + ' — ' + r.reason"
              @click="doRune(r)"
            >
              <img v-if="runeIcon(r)" :src="runeIcon(r)!" class="cs-ess-ic" alt="" />
              <span v-else class="cs-op-ph">◆</span>
              <span class="cs-ess-name">{{ runeName(r) }}</span>
              <span v-if="r.mappable" class="cs-ess-flag cs-cattag">{{ r.kind === 'soul_core' ? 'core' : 'rune' }}</span>
              <span v-else class="cs-ess-flag">{{ tr('veri yok', 'no data') }}</span>
            </button>
          </div>
        </div>

        <!-- OMEN (sonraki currency davranışı) -->
        <div v-else class="cs-esswrap">
          <div class="cs-cathint">{{ tr('Bir omen kuşan → sonraki ilgili currency değişir', 'Arm an omen → next matching currency changes') }}</div>
          <div class="cs-esslist">
            <button
              v-for="o in filteredOmens"
              :key="o.id"
              class="cs-ess"
              :class="{ 'cs-ess--off': !o.mappable, 'cs-ess--sel': armedOmen && armedOmen.id === o.id }"
              :title="o.mappable ? omenName(o) + ' — ' + omenEffect(o) : omenName(o) + ' — ' + o.reason"
              @click="armOmen(o)"
            >
              <img v-if="omenIcon(o)" :src="omenIcon(o)!" class="cs-ess-ic" alt="" />
              <span v-else class="cs-op-ph">◆</span>
              <span class="cs-ess-name">{{ omenName(o) }}</span>
              <span v-if="o.mappable" class="cs-ess-flag cs-cattag">{{ o.op }}</span>
              <span v-else class="cs-ess-flag">{{ tr('veri yok', 'no data') }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ORTA: item tooltip (oyun stili) -->
      <section class="cs-itemwrap">
        <div v-if="item" class="cs-tip" :class="'cs-tip--' + item.rarity">
          <div class="cs-tip-head" :class="['cs-tip-head--' + item.rarity, { 'cs-tip-head--corrupt': item.corrupted }]">
            <img v-if="baseIcon(selBase)" :src="baseIcon(selBase)!" class="cs-tip-icon" alt="" />
            <div v-else class="cs-tip-icon cs-tip-icon--ph" :title="tr('İkon yok', 'No icon')">◇</div>
            <div class="cs-tip-rarity">
              {{ rarityLabel }}<span v-if="item.corrupted" class="cs-corrupt-tag">{{ tr('CORRUPTED', 'CORRUPTED') }}</span>
            </div>
            <!-- #4: taban/eşya adı HER ZAMAN İngilizce (oyun İngilizce; özel adlar çevrilmez) -->
            <div class="cs-tip-name" :class="{ 'cs-name-corrupt': item.corrupted }">{{ selBase?.en }}</div>
          </div>
          <div class="cs-tip-sub">
            {{ tr('Item Seviyesi', 'Item Level') }}: <b>{{ item.ilvl }}</b>
            <span class="cs-tip-count">· {{ item.prefixes.length }}P / {{ item.suffixes.length }}S</span>
            <span v-if="item.quality > 0" class="cs-tip-qual">· {{ tr('Kalite', 'Quality') }} <b>%{{ item.quality }}</b><span v-if="item.catalystTag"> ({{ item.catalystTag }})</span></span>
          </div>

          <!-- base stat'lar (quality ile ölçekli) -->
          <div v-if="qStats.length" class="cs-tip-stats">
            <div v-for="(s, i) in qStats" :key="i" class="cs-tip-stat">
              <span class="cs-tip-statlbl">{{ props.isTr ? s.label_tr : s.label_en }}</span>
              <span class="cs-tip-statval" :class="{ 'cs-tip-statq': item.quality > 0 }">{{ s.value }}</span>
            </div>
          </div>

          <!-- IMPLICIT (doğuştan) + corruption implicit -->
          <template v-if="implicit || item.implicits.length">
            <div class="cs-tip-sep"></div>
            <div class="cs-implicit">
              <template v-if="implicit">
                <div class="cs-imp-en">{{ implicit.en }}</div>
                <div v-if="implicit.tr" class="cs-imp-tr">{{ implicit.tr }}</div>
              </template>
              <div v-for="(im, i) in item.implicits" :key="'ci' + i" class="cs-imp-corrupt">
                <div class="cs-imp-en cs-imp-en--corrupt">{{ im.en }}</div>
                <div v-if="im.tr && im.tr !== im.en" class="cs-imp-tr">{{ im.tr }}</div>
              </div>
            </div>
          </template>

          <!-- SOKETLER + takılı rune/core'lar -->
          <template v-if="item.sockets.count > 0">
            <div class="cs-tip-sep"></div>
            <div class="cs-sockets">
              <div class="cs-sock-row">
                <span class="cs-sock-icon" v-for="n in item.sockets.count" :key="n" :class="{ 'cs-sock-filled': n <= item.sockets.runes.length }">⬢</span>
                <span class="cs-sock-lbl">{{ item.sockets.runes.length }}/{{ item.sockets.count }} {{ tr('Soket', 'Socket') }}</span>
              </div>
              <div v-for="(rn, i) in item.sockets.runes" :key="'rn' + i" class="cs-sock-rune">
                <span class="cs-sock-rune-eff">{{ props.isTr ? rn.effect_tr : rn.effect_en }}</span>
                <span class="cs-sock-rune-name">({{ props.isTr && rn.name_tr ? rn.name_tr : rn.name_en }})</span>
              </div>
            </div>
          </template>

          <div v-if="item.prefixes.length || item.suffixes.length" class="cs-tip-sep"></div>

          <div v-if="!item.prefixes.length && !item.suffixes.length" class="cs-tip-empty">
            {{ tr('Mod yok — bir currency uygula', 'No mods — apply a currency') }}
          </div>

          <ul class="cs-mods">
            <li v-for="(m, i) in item.prefixes" :key="'p' + i" class="cs-mod" :class="{ 'cs-mod--frac': m.fractured }">
              <div class="cs-mod-top">
                <span class="cs-mod-badge cs-mod-badge--p">{{ tr('Önek', 'Prefix') }}</span>
                <span v-if="m.fractured" class="cs-mod-frac" :title="tr('Fractured — kilitli', 'Fractured — locked')">⛓ {{ tr('kilitli', 'locked') }}</span>
                <span v-if="modLine(m).boosted" class="cs-mod-boost" :title="tr('Catalyst kalitesiyle artırıldı', 'Enhanced by catalyst quality')">↑</span>
                <span class="cs-mod-tier">T{{ modLine(m).tier }}<span class="cs-mod-tiermax">/{{ modLine(m).tierMax }}</span></span>
                <span v-if="modLine(m).range" class="cs-mod-range" :title="tr('bu tier değer aralığı', 'this tier value range')">{{ modLine(m).range }}</span>
                <span class="cs-mod-en" :class="{ 'cs-mod-boosted': modLine(m).boosted }"><span v-for="(p, j) in parts(modLine(m).en)" :key="j" :class="{ 'cs-num': p.num }">{{ p.t }}</span></span>
              </div>
              <div v-if="modLine(m).tr" class="cs-mod-tr">{{ modLine(m).tr }}</div>
            </li>
            <li v-for="(m, i) in item.suffixes" :key="'s' + i" class="cs-mod" :class="{ 'cs-mod--frac': m.fractured }">
              <div class="cs-mod-top">
                <span class="cs-mod-badge cs-mod-badge--s">{{ tr('Sonek', 'Suffix') }}</span>
                <span v-if="m.fractured" class="cs-mod-frac" :title="tr('Fractured — kilitli', 'Fractured — locked')">⛓ {{ tr('kilitli', 'locked') }}</span>
                <span v-if="modLine(m).boosted" class="cs-mod-boost" :title="tr('Catalyst kalitesiyle artırıldı', 'Enhanced by catalyst quality')">↑</span>
                <span class="cs-mod-tier">T{{ modLine(m).tier }}<span class="cs-mod-tiermax">/{{ modLine(m).tierMax }}</span></span>
                <span v-if="modLine(m).range" class="cs-mod-range" :title="tr('bu tier değer aralığı', 'this tier value range')">{{ modLine(m).range }}</span>
                <span class="cs-mod-en" :class="{ 'cs-mod-boosted': modLine(m).boosted }"><span v-for="(p, j) in parts(modLine(m).en)" :key="j" :class="{ 'cs-num': p.num }">{{ p.t }}</span></span>
              </div>
              <div v-if="modLine(m).tr" class="cs-mod-tr">{{ modLine(m).tr }}</div>
            </li>
          </ul>
        </div>
        <div v-else class="cs-noitem">{{ tr('Taban seçilmedi', 'No base selected') }}</div>

        <!-- TAHMİNİ DEĞER (Faz 1) — benzer trade2 ilanlarından; her zaman "≈ tahmini" -->
        <div v-if="item" class="cs-value">
          <div class="cs-value-head">
            <span class="cs-value-icon">≈</span> {{ tr('Tahmini Değer', 'Estimated Value') }}
            <span class="cs-value-tag">{{ tr('tahmini', 'estimate') }}</span>
          </div>
          <div class="cs-value-actions">
            <button class="cs-value-btn" :disabled="valueState?.loading" @click="checkValue">
              {{ valueState?.loading ? tr('Sorgulanıyor…', 'Checking…') : tr('Değer sorgula', 'Check value') }}
            </button>
            <button class="cs-value-btn cs-value-btn--ghost" @click="openInTrade">{{ tr('Trade’de Aç ↗', 'Open in Trade ↗') }}</button>
          </div>

          <!-- sonuç: EN YAKIN EŞYA (ortalama değil) -->
          <template v-if="valueState && valueState.ok">
            <div class="cs-value-result">
              <span class="cs-value-num">≈ {{ valueState.nearest }}</span>
              <span class="cs-value-cur">{{ valueState.nearestCurrency }}</span>
              <span v-if="(valueState.bandCount ?? 0) > 1" class="cs-value-range">({{ valueState.bandLow }}–{{ valueState.bandHigh }})</span>
            </div>
            <div class="cs-value-meta">
              {{ tr('en yakın eşya', 'nearest item') }} · {{ tr('en benzer', 'closest of') }} {{ valueState.sampled }} {{ tr('ilan', 'listings') }}<span v-if="(valueState.count ?? 0) > (valueState.sampled ?? 0)"> / {{ valueState.count }} {{ tr('toplam', 'total') }}</span>
              · {{ valueState.nearMatched }}/{{ valueState.nearTotal }} {{ tr('stat eşleşti', 'stats match') }}
              <span v-if="(valueState.unmatched ?? 0) > 0" class="cs-value-warn" :title="tr('Bu mod’lar trade stat-id’ye eşlenemedi', 'These mods could not be mapped to a trade stat-id')">· {{ valueState.unmatched }} {{ tr('eşleşmedi', 'unmatched') }}</span>
            </div>
            <div class="cs-value-method">{{ valueState.method === 'cheapest' ? tr('mod verisi yok — en ucuz benzer ilan', 'no mod data — cheapest similar listing') : tr('en benzer ilanlara göre (ortalama değil)', 'by most-similar listings (not an average)') }}</div>
            <div v-if="valueState.usedStats === 0" class="cs-value-note">
              ⚠ {{ tr('Stat-id tablosu yok — yalnız taban+ilvl’e göre KABA aralık. Gerçek ağda otomatik dolar.', 'No stat-id table — COARSE base+ilvl estimate only. Auto-fills on real network.') }}
            </div>
          </template>

          <!-- Part 3: stat ekle/çıkar + min değer → CANLI yeniden sorgula -->
          <div v-if="filterMods.length" class="cs-filters">
            <div class="cs-filters-head">
              {{ tr('Stat filtreleri', 'Stat filters') }} ({{ activeFilterCount }}/{{ filterMods.length }})
              <span v-if="valueState?.loading" class="cs-filters-live">⋯</span>
              <button class="cs-value-btn cs-filters-re" :disabled="valueState?.loading" @click="runEstimate">↻ {{ tr('Yeniden sorgula', 'Re-search') }}</button>
            </div>
            <div v-for="(m, i) in filterMods" :key="i" class="cs-filter" :class="{ 'cs-filter--off': !m.enabled }">
              <input type="checkbox" v-model="m.enabled" @change="scheduleEstimate" />
              <span class="cs-filter-text">{{ m.text }}</span>
              <!-- "Adds A to B" → İKİ kutu (alt + üst); tek-sayılı mod → tek kutu -->
              <template v-if="m.enabled && m.ranged">
                <input type="number" class="cs-filter-min" :value="m.value" :title="tr('alt değer', 'low value')" @input="m.value = ($event.target as HTMLInputElement).valueAsNumber; scheduleEstimate()" />
                <span class="cs-filter-sep">–</span>
                <input type="number" class="cs-filter-min" :value="m.valueHi" :title="tr('üst değer', 'high value')" @input="m.valueHi = ($event.target as HTMLInputElement).valueAsNumber; scheduleEstimate()" />
              </template>
              <input
                v-else-if="m.enabled && m.value !== null"
                type="number"
                class="cs-filter-min"
                :value="m.value"
                :title="tr('min değer', 'min value')"
                @input="m.value = ($event.target as HTMLInputElement).valueAsNumber; scheduleEstimate()"
              />
            </div>
            <div class="cs-filters-hint">{{ tr('Stat ekle/çıkar veya min değiştir → değer anında güncellenir', 'Toggle a stat or change min → value updates live') }}</div>
          </div>

          <!-- hata -->
          <div v-else-if="valueState && valueState.error" class="cs-value-err">⚠ {{ valErrMsg(valueState.error) }}</div>

          <div class="cs-value-foot">{{ tr('Yalnız eşya/sorgu gönderilir · kişisel veri yok · otomatik alım yok', 'Only item/query sent · no personal data · no auto-buy') }}</div>
        </div>

        <!-- BUILD KARŞILAŞTIRMA (Faz 3) -->
        <div v-if="item" class="cs-compare">
          <div class="cs-cmp-head">
            <span class="cs-cmp-icon">⚖</span> {{ tr('Build Karşılaştırma', 'Build Comparison') }}
            <span v-if="compareResult" class="cs-cmp-score" :class="scoreClass(compareResult.score)">{{ compareResult.score }}%</span>
          </div>
          <div v-if="!trackedBuild" class="cs-cmp-empty">{{ tr('Önce Build sekmesinden bir build içe aktar.', 'Import a build from the Build tab first.') }}</div>
          <template v-else>
            <div class="cs-cmp-slotrow">
              <span class="cs-cmp-lbl">{{ tr('Hedef slot', 'Target slot') }}</span>
              <select v-model="compareSlot" class="cs-cmp-select">
                <option v-for="s in compareSlots" :key="s.slot" :value="s.slot">{{ s.slot }} — {{ s.item.name || s.item.base }}</option>
              </select>
            </div>
            <div v-if="!compareResult" class="cs-cmp-empty">{{ tr('Karşılaştırılacak hedef eşya yok', 'No target item to compare') }}</div>
            <template v-else>
              <ul class="cs-cmp-rows">
                <li v-for="(row, i) in compareResult.rows" :key="i" class="cs-cmp-row" :class="'cs-cmp--' + row.status">
                  <span class="cs-cmp-tag" :class="tagClass(row)">{{ rowTag(row) }}</span>
                  <!-- #4: stat/mod metni HER ZAMAN İngilizce kalır (oyun terimleri çevrilmez) -->
                  <span class="cs-cmp-text">{{ row.en }}</span>
                  <span v-if="row.kind === 'match' && row.approachPct !== null" class="cs-cmp-pct">{{ row.candidateValue }}/{{ row.targetValue }} · {{ row.approachPct }}%</span>
                  <span v-if="row.verify" class="cs-cmp-verify" :title="tr('stat-id eşleşmedi — doğrulanmalı', 'no stat-id match — verify')">?</span>
                </li>
              </ul>
              <div class="cs-cmp-summary">
                {{ compareResult.matchedCount }}/{{ compareResult.targetCount }} {{ tr('eşleşti', 'matched') }} · {{ compareResult.missingCount }} {{ tr('eksik', 'missing') }} · {{ compareResult.extraCount }} {{ tr('fazla', 'extra') }}
              </div>
            </template>
          </template>
        </div>

        <!-- USTA CRAFT YARDIMCISI (offline/LLM) — hedef tanımlıysa -->
        <div v-if="plan && plan.kind !== 'no_target'" class="cs-advisor" :class="'cs-advisor--' + plan.kind">
          <div class="cs-adv-head">
            <span class="cs-adv-icon">◆</span> {{ tr('Usta Craft Yardımcısı', 'Master Craft Advisor') }}
            <span class="cs-adv-tag" :class="{ 'cs-adv-tag--llm': advisorMode === 'llm' && !llm?.fellBack }">{{ advisorMode === 'llm' ? 'LLM · Claude' : tr('offline', 'offline') }}</span>
            <span v-if="plan.kind === 'plan' || plan.kind === 'reached'" class="cs-adv-strat">{{ strategyLabel(plan.strategy) }}</span>
          </div>

          <!-- HEDEFE ULAŞILDI -->
          <div v-if="plan.kind === 'reached'">
            <div class="cs-adv-reached">★ {{ tr('Hedefe ulaşıldı!', 'Target reached!') }}</div>
            <button v-if="plan.primary" class="cs-essapply cs-adv-btn" @click="applyPrimary">▸ {{ stepDesc({ action: plan.primary, rationaleCode: plan.rationaleCode, chance: 1, deterministic: false }) }}</button>
          </div>

          <!-- ÇIKMAZ -->
          <template v-else-if="plan.kind === 'deadend'">
            <div class="cs-adv-warn">⚠ {{ deadendMsg }}</div>
            <button class="cs-essapply cs-adv-btn cs-adv-reset" @click="reset">⟲ {{ deadendBtn }}</button>
          </template>

          <!-- PLAN (offline zengin + opsiyonel LLM anlatısı) -->
          <template v-else>
            <!-- LLM anlatısı (varsa) -->
            <template v-if="advisorMode === 'llm'">
              <div v-if="llm && llm.loading" class="cs-adv-text cs-adv-loading">⋯ {{ tr('LLM düşünüyor…', 'LLM thinking…') }}</div>
              <template v-else-if="llm && !llm.fellBack && llm.text">
                <div class="cs-adv-llmtext">“{{ llm.text }}”</div>
                <button class="cs-essapply cs-adv-btn" @click="applyLlm">▸ {{ tr('LLM önerisini uygula', 'Apply LLM suggestion') }}</button>
              </template>
              <div v-else class="cs-adv-warn">⚠ {{ llmWarn }}</div>
            </template>

            <!-- BİRİNCİL ADIM (büyük) -->
            <div class="cs-adv-primary">
              <div class="cs-adv-plabel">{{ tr('Önerilen ilk adım', 'Recommended first step') }}</div>
              <div class="cs-adv-ptext">{{ stepDesc(plan.steps[0]) }}</div>
              <button class="cs-essapply cs-adv-btn" @click="applyPrimary">▸ {{ actionName(plan.steps[0].action) }} — {{ tr('Uygula', 'Apply') }}</button>
            </div>

            <!-- ÇOK-ADIMLI YOL -->
            <div v-if="plan.steps.length > 1" class="cs-adv-path">
              <div class="cs-adv-sublbl">{{ tr('Yol', 'Path') }} ({{ plan.steps.length }} {{ tr('adım', 'steps') }})</div>
              <ol class="cs-adv-steps">
                <li v-for="(s, i) in plan.steps" :key="i" class="cs-adv-step" :class="{ 'cs-adv-step--first': i === 0 }">
                  <span class="cs-adv-stepn">{{ i + 1 }}</span>
                  <span class="cs-adv-steptxt">{{ stepDesc(s) }}</span>
                  <span class="cs-adv-stepch" :class="{ 'cs-adv-stepch--sure': s.deterministic }">{{ chanceLabel(s) }}</span>
                </li>
              </ol>
              <div class="cs-adv-cum">
                ≈ {{ tr('toplam başarı', 'overall success') }}: <b>%{{ (plan.cumulative * 100).toFixed(1) }}</b>
                <span v-if="plan.cumulativeApprox" class="cs-adv-approx">({{ tr('yaklaşık, bağımsız adım varsayımı', 'approx, independent-step assumption') }})</span>
              </div>
            </div>

            <!-- ALTERNATİFLER -->
            <div v-if="plan.alternatives.length" class="cs-adv-alts">
              <div class="cs-adv-sublbl">{{ tr('Alternatifler', 'Alternatives') }}</div>
              <div class="cs-adv-whyprimary">
                {{ tr('«' + actionName(plan.steps[0].action) + '» öneriyorum (en dengeli); alternatifler:', 'I recommend «' + actionName(plan.steps[0].action) + '» (most balanced); alternatives:') }}
              </div>
              <button v-for="(a, i) in plan.alternatives" :key="i" class="cs-adv-alt" @click="applyAlt(a)">
                <span class="cs-adv-alttxt">{{ altDesc(a) }}</span>
                <span class="cs-adv-altcost">{{ '£'.repeat(a.action.costRank) }}</span>
              </button>
            </div>
          </template>

          <!-- RİSK NOTLARI (tüm durumlarda) -->
          <div v-if="plan.risks.length" class="cs-adv-risks">
            <div v-for="(r, i) in plan.risks" :key="i" class="cs-adv-risk" :class="'cs-adv-risk--' + r.level">
              ⚠ {{ riskDesc(r) }}
            </div>
          </div>
        </div>

        <!-- olasılık göstergesi (tek-adım grup şansı) — currency mode -->
        <div v-if="craftMode === 'currency' && chances && previewOp" class="cs-chance">
          <div class="cs-chance-head">
            {{ tr('Düşme Şansı', 'Drop Chance') }} —
            <span class="cs-chance-op">{{ opLabelByName(previewOp) }}</span>
            <span class="cs-chance-note">{{ tr('(tek-adım, eklenen mod)', '(single step, added mod)') }}</span>
          </div>
          <div v-if="!chances.prefix.length && !chances.suffix.length" class="cs-chance-empty">
            {{ tr('Eklenebilecek mod yok (dolu / uygun değil)', 'No mod can be added (full / not eligible)') }}
          </div>
          <div v-else class="cs-chance-cols">
            <div class="cs-chance-col">
              <div class="cs-chance-collbl cs-chance-collbl--p">{{ tr('Önek', 'Prefix') }}</div>
              <div v-for="(g, i) in chances.prefix.slice(0, 6)" :key="'cp' + i" class="cs-chance-row">
                <span class="cs-chance-pct">{{ pct(g) }}</span>
                <span class="cs-chance-name">{{ chanceText(g) }}</span>
                <span v-if="g.range" class="cs-chance-range">{{ g.range }}</span>
              </div>
              <div v-if="!chances.prefix.length" class="cs-chance-row cs-chance-none">—</div>
            </div>
            <div class="cs-chance-col">
              <div class="cs-chance-collbl cs-chance-collbl--s">{{ tr('Sonek', 'Suffix') }}</div>
              <div v-for="(g, i) in chances.suffix.slice(0, 6)" :key="'cs' + i" class="cs-chance-row">
                <span class="cs-chance-pct">{{ pct(g) }}</span>
                <span class="cs-chance-name">{{ chanceText(g) }}</span>
                <span v-if="g.range" class="cs-chance-range">{{ g.range }}</span>
              </div>
              <div v-if="!chances.suffix.length" class="cs-chance-row cs-chance-none">—</div>
            </div>
          </div>
        </div>

        <!-- essence önizleme + uygula — essence mode -->
        <div v-if="craftMode === 'essence' && selEssence" class="cs-chance cs-esspreview">
          <div class="cs-chance-head">
            {{ tr('Garantili Mod', 'Guaranteed Mod') }} —
            <span class="cs-chance-op">{{ essName(selEssence) }}</span>
          </div>
          <div v-if="!selEssence.mappable" class="cs-essnote cs-essnote--nodata">
            ⓘ {{ selEssence.reason }}
          </div>
          <template v-else-if="essPrev">
            <div class="cs-essrow">
              <span class="cs-essrow-badge" :class="essPrev.affix === 'prefix' ? 'cs-mod-badge--p' : 'cs-mod-badge--s'">
                {{ essPrev.affix === 'prefix' ? tr('Önek', 'Prefix') : tr('Sonek', 'Suffix') }}
              </span>
              <span class="cs-essrow-en">{{ essPrev.en }}</span>
              <span v-if="essPrev.special" class="cs-essrow-special">{{ tr('(özel mod)', '(special mod)') }}</span>
            </div>
            <div v-if="essPrev.tr" class="cs-essrow-tr">{{ essPrev.tr }}</div>
            <div v-if="essPrev.approx" class="cs-essnote cs-essnote--approx">{{ tr('(yaklaşık değer — essence-birebir olmayabilir)', '(approx value — may differ from exact essence)') }}</div>
            <button
              class="cs-essapply"
              :class="{ 'cs-essapply--off': !essApplyState(selEssence).ok }"
              :disabled="!essApplyState(selEssence).ok"
              @click="applyCurrentEssence"
            >
              {{ essApplyState(selEssence).ok ? tr('Uygula', 'Apply') : essApplyState(selEssence).reason }}
            </button>
          </template>
          <div v-else class="cs-essnote cs-essnote--nodata">{{ essApplyState(selEssence).reason || tr('Bu item için uygulanamaz', 'Not applicable to this item') }}</div>
        </div>
      </section>

      <!-- SAĞ: hedef eşya + geçmiş -->
      <div class="cs-rightcol">
        <!-- HEDEF EŞYA -->
        <section class="cs-target panel-frame">
          <div class="cs-target-head">
            <span>{{ tr('Hedef Eşya', 'Target Item') }}</span>
            <span
              v-if="targets.length && targetStatus"
              class="cs-target-badge"
              :class="targetStatus.reached ? 'cs-target-badge--ok' : !targetStatus.feasible ? 'cs-target-badge--bad' : 'cs-target-badge--mid'"
            >
              {{ targetStatus.reached ? tr('ULAŞILDI ✓', 'REACHED ✓') : !targetStatus.feasible ? tr('ÇIKMAZ', 'DEAD-END') : metCount + '/' + targets.length }}
            </span>
          </div>
          <input
            v-model="targetSearch"
            class="cs-search cs-search--mat"
            type="text"
            :placeholder="tr('Mod ara…', 'Search mod…')"
          />
          <div class="cs-target-add">
            <select v-model="selTargetGroup" class="class-filter cs-target-grp">
              <option value="">{{ tr('Mod grubu seç…', 'Pick mod group…') }}</option>
              <option v-for="g in filteredTargetGroups" :key="g.group" :value="g.group">
                {{ groupLabel(g) }} [{{ g.affix === 'prefix' ? 'P' : 'S' }}]
              </option>
            </select>
            <select v-model.number="selMinTier" class="class-filter cs-target-tier">
              <option v-for="n in (selGroupInfo?.tierMax || 1)" :key="n" :value="n">
                T{{ n }}+{{ selGroupTierRanges[n - 1] ? ' · ' + selGroupTierRanges[n - 1] : '' }}
              </option>
            </select>
            <button class="cs-hbtn" :disabled="!selTargetGroup" @click="addTarget">+</button>
          </div>
          <div v-if="selGroupInfo && selGroupTierRanges[selMinTier - 1]" class="cs-target-rangehint">
            T{{ selMinTier }}+ {{ tr('aralık', 'range') }}: <b>{{ selGroupTierRanges[selMinTier - 1] }}</b>
          </div>
          <ul v-if="targetStatus && targetStatus.rows.length" class="cs-target-list">
            <li
              v-for="r in targetStatus.rows"
              :key="r.group"
              class="cs-target-row"
              :class="{ 'cs-target-row--met': r.met, 'cs-target-row--bad': !r.feasible }"
            >
              <span class="cs-target-check">{{ r.met ? '✓' : r.feasible ? '✗' : '⚠' }}</span>
              <span class="cs-target-name">
                {{ groupLabel(r) }} <b>T{{ r.minTier }}+</b>
                <span v-if="rowRange(r)" class="cs-target-range">{{ rowRange(r) }}</span>
                <span v-if="r.currentTier" class="cs-target-cur">· {{ tr('şu an', 'now') }} T{{ r.currentTier }}</span>
                <span v-if="!r.feasible" class="cs-target-bad">
                  · {{ r.reasonCode === 'not_on_base' ? tr('bu tabanda yok', 'not on base') : tr('en iyi T' + r.bestTier, 'best T' + r.bestTier) }}
                </span>
              </span>
              <button class="cs-target-rm" :title="tr('Kaldır', 'Remove')" @click="removeTarget(r.group)">×</button>
            </li>
          </ul>
          <div v-else class="cs-target-empty">{{ tr('Hedef mod ekle — ✓/✗ ve ulaşıldı durumu burada.', 'Add target mods — ✓/✗ and reached status here.') }}</div>

          <div v-if="targets.length && targetStatus && !targetStatus.feasible" class="cs-target-deadend">
            ⚠ {{ tr('Bu hedef bu tabanda/ilvl’de mümkün değil', 'This target is impossible on this base/ilvl') }}
            <span v-if="targetStatus.limitOver"> — {{ targetStatus.prefixWant }}P/{{ targetStatus.suffixWant }}S > {{ targetStatus.cap }}</span>
          </div>
          <div v-else-if="targetStatus && targetStatus.reached" class="cs-target-win">★ {{ tr('Hedefe ulaşıldı!', 'Target reached!') }}</div>
          <button v-if="targets.length" class="cs-hbtn cs-target-clear" @click="clearTargets">{{ tr('Hedefi temizle', 'Clear target') }}</button>
        </section>

        <!-- GEÇMİŞ -->
        <section class="cs-history panel-frame">
          <div class="cs-hist-head">
            <span>{{ tr('Roll Geçmişi', 'Roll History') }}</span>
            <span class="cs-hist-btns">
              <button class="cs-hbtn" :disabled="!canUndo" @click="undo">↶ {{ tr('Geri Al', 'Undo') }}</button>
              <button class="cs-hbtn" @click="reset">⟲ {{ tr('Sıfırla', 'Reset') }}</button>
            </span>
          </div>
          <ul class="cs-hist">
            <li v-for="(h, i) in history" :key="i" class="cs-hrow" :class="{ 'cs-hrow--init': h.op === 'init' }">
              <div class="cs-hop">{{ h.message }}</div>
              <div v-if="h.removed.length" class="cs-hdetail cs-hremove">− {{ h.removed.map((m) => m.en).join(', ') }}</div>
              <div v-if="h.added.length" class="cs-hdetail cs-hadd">+ {{ h.added.map((m) => m.en).join(', ') }}</div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
}
.cs-top {
  flex: none;
  display: flex;
  gap: 14px;
  align-items: flex-end;
}
.cs-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cs-lbl {
  font-size: 11px;
  font-variant: small-caps;
  color: var(--text-muted);
}
.cs-field--ilvl {
  width: 80px;
}
.cs-ilvl {
  font-family: var(--font-serif);
  font-size: 13px;
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--frame-brown);
  padding: 4px 6px;
}
.cs-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 232px 1fr 300px;
  gap: 12px;
}
.panel-frame {
  border: 13px solid transparent;
  border-image: url(../../assets/ui/frame-border3.png) 16 repeat;
  background:
    linear-gradient(rgba(13, 16, 17, 0.82), rgba(8, 11, 12, 0.88)),
    url(../../assets/ui/panel-filler.png);
  background-size: auto, 100% auto;
  background-repeat: no-repeat, repeat-y;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* --- currency düğmeleri --- */
.cs-ops {
  overflow: hidden;
  padding-top: 4px;
}
.cs-ops-head,
.cs-hist-head {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: var(--gem-teal);
  margin-bottom: 4px;
}
/* mode sekmeleri (Currency / Essence) */
.cs-modetabs {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}
.cs-modetab {
  flex: 1;
  font-family: var(--font-serif);
  font-size: 12px;
  font-variant: small-caps;
  color: var(--gold-ornament);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--frame-brown);
  padding: 3px 0;
  cursor: pointer;
}
.cs-modetab--on {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.cs-oplist {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: 100%;
}
/* essence panel */
.cs-esswrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.cs-esstiers {
  flex: none;
  display: flex;
  gap: 3px;
  margin-bottom: 5px;
}
.cs-esstier {
  flex: 1;
  font-family: var(--font-serif);
  font-size: 10.5px;
  font-variant: small-caps;
  color: var(--gold-ornament);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--frame-brown);
  padding: 2px 0;
  cursor: pointer;
}
.cs-esstier--on {
  color: #0a1614;
  background: var(--gold-ornament);
  border-color: var(--gold-ornament);
  font-weight: 600;
}
.cs-esslist {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-ess {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 5px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid transparent;
  cursor: pointer;
  text-align: left;
}
.cs-ess:hover {
  border-color: var(--frame-brown);
}
.cs-ess--sel {
  border-color: var(--gem-teal);
  background: rgba(122, 211, 197, 0.1);
}
.cs-ess--off {
  opacity: 0.4;
  filter: grayscale(0.7);
  cursor: not-allowed;
}
.cs-ess-ic {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex: none;
}
.cs-ess-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-default);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-ess-flag {
  font-size: 9px;
  font-variant: small-caps;
  color: #d39a4f;
  border: 1px solid rgba(211, 154, 79, 0.4);
  padding: 0 3px;
  border-radius: 2px;
  flex: none;
}
/* essence önizleme/uygula kutusu */
.cs-essrow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.cs-essrow-badge {
  font-size: 9.5px;
  font-variant: small-caps;
  padding: 0 4px;
  border-radius: 2px;
  flex: none;
}
.cs-essrow-en {
  font-size: 13px;
  color: var(--tt-augmented);
}
.cs-essrow-special {
  font-size: 10px;
  font-variant: small-caps;
  color: #b98ad8;
}
.cs-essrow-tr {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 1px;
}
.cs-essnote {
  font-size: 11px;
  margin-top: 5px;
  line-height: 1.4;
}
.cs-essnote--approx {
  color: #d39a4f;
}
.cs-essnote--nodata {
  color: var(--text-muted);
  font-style: normal;
}
.cs-essapply {
  margin-top: 8px;
  width: 100%;
  font-family: var(--font-serif);
  font-size: 13px;
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gem-teal);
  border: 1px solid var(--gem-teal);
  padding: 4px 0;
  cursor: pointer;
  font-weight: 600;
}
.cs-essapply--off {
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.4);
  border-color: var(--frame-brown);
  cursor: not-allowed;
  font-size: 11px;
}
.cs-op {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 7px;
  background: linear-gradient(rgba(42, 36, 23, 0.85), rgba(26, 22, 16, 0.9));
  border: 1px solid var(--metal-edge);
  cursor: pointer;
  text-align: left;
}
.cs-op:hover {
  border-color: var(--gold-line);
}
.cs-op--off {
  opacity: 0.38;
  cursor: not-allowed;
  filter: grayscale(0.8);
}
.cs-op-ic {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex: none;
}
.cs-op-ph {
  width: 26px;
  text-align: center;
  color: var(--gold-ornament);
  flex: none;
}
.cs-op-name {
  font-family: var(--font-serif);
  font-size: 12.5px;
  font-variant: small-caps;
  color: var(--gold-title);
}
/* --- item tooltip --- */
.cs-itemwrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  overflow-y: auto;
}
.cs-tip {
  width: 100%;
  max-width: 460px;
  background: var(--bg-tooltip);
  border: 1px solid var(--metal-edge);
  box-shadow: var(--shadow);
}
.cs-tip-head {
  text-align: center;
  padding: 6px 10px 5px;
  border-bottom: 1px solid rgba(94, 77, 45, 0.6);
  background: linear-gradient(rgba(40, 34, 22, 0.6), rgba(20, 17, 11, 0.3));
}
.cs-tip-icon {
  width: 44px;
  height: 44px;
  object-fit: contain;
  margin: 0 auto 2px;
  display: block;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
}
.cs-tip-icon--ph {
  font-size: 28px;
  color: var(--text-muted);
  line-height: 44px;
}
.cs-tip-head--magic {
  background: linear-gradient(rgba(40, 40, 90, 0.45), rgba(15, 15, 35, 0.3));
}
.cs-tip-head--rare {
  background: linear-gradient(rgba(70, 64, 20, 0.5), rgba(28, 26, 10, 0.3));
}
.cs-tip-rarity {
  font-size: 10.5px;
  font-variant: small-caps;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.cs-tip-name {
  font-variant: small-caps;
  font-size: 19px;
  line-height: 1.15;
  letter-spacing: 0.03em;
}
.cs-tip--normal .cs-tip-name {
  color: var(--rarity-normal);
}
.cs-tip--magic .cs-tip-name {
  color: var(--rarity-magic);
}
.cs-tip--rare .cs-tip-name {
  color: var(--rarity-rare);
}
.cs-tip-sub {
  text-align: center;
  font-size: 11.5px;
  color: var(--text-muted);
  padding: 4px 10px;
}
.cs-tip-sub b {
  color: var(--text-default);
}
.cs-tip-count {
  margin-left: 6px;
}
.cs-tip-qual {
  margin-left: 6px;
  color: var(--gem-teal);
}
.cs-tip-qual b {
  color: var(--gem-teal);
}
.cs-tip-stats {
  padding: 3px 14px 5px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cs-tip-stat {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.cs-tip-statlbl {
  color: var(--text-muted);
}
.cs-tip-statval {
  color: var(--text-default);
  font-weight: 600;
}
.cs-tip-statq {
  color: var(--gem-teal);
}
.cs-tip-sep {
  height: 0;
  border-top: 1px solid rgba(94, 77, 45, 0.5);
  margin: 0 14px;
}
.cs-implicit {
  text-align: center;
  padding: 6px 12px;
}
.cs-imp-en {
  font-size: 13px;
  color: var(--tt-augmented);
}
.cs-imp-tr {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}
.cs-imp-corrupt {
  margin-top: 3px;
}
.cs-imp-en--corrupt {
  color: #d02090;
}
.cs-sockets {
  padding: 4px 14px;
  text-align: center;
}
.cs-sock-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 2px;
}
.cs-sock-icon {
  font-size: 13px;
  color: var(--text-muted);
}
.cs-sock-filled {
  color: var(--gem-teal);
}
.cs-sock-lbl {
  font-size: 10.5px;
  color: var(--text-muted);
  font-variant: small-caps;
  margin-left: 4px;
}
.cs-sock-rune {
  font-size: 12px;
}
.cs-sock-rune-eff {
  color: var(--gem-teal);
}
.cs-sock-rune-name {
  color: var(--text-muted);
  font-size: 10.5px;
  margin-left: 4px;
}
.cs-tip-head--corrupt {
  background: linear-gradient(rgba(110, 20, 80, 0.4), rgba(30, 8, 22, 0.3)) !important;
  border-bottom-color: #d02090 !important;
}
.cs-corrupt-tag {
  margin-left: 6px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #fff;
  background: #d02090;
  padding: 0 5px;
  border-radius: 2px;
}
.cs-name-corrupt {
  color: #d02090 !important;
}
.cs-tip-empty {
  text-align: center;
  font-style: normal;
  color: var(--text-muted);
  padding: 14px;
  font-size: 12.5px;
}
.cs-mods {
  list-style: none;
  margin: 0;
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.cs-mod {
  text-align: center;
}
.cs-mod-top {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cs-mod-badge {
  font-size: 9.5px;
  font-variant: small-caps;
  padding: 0 4px;
  border-radius: 2px;
  flex: none;
}
.cs-mod-badge--p {
  color: #0a1614;
  background: #c8aa6e;
}
.cs-mod-badge--s {
  color: #0a1614;
  background: #9aa9c8;
}
.cs-mod-tier {
  font-size: 10px;
  color: var(--gold-ornament);
  font-variant: small-caps;
  flex: none;
}
.cs-mod-tiermax {
  color: var(--text-muted);
}
.cs-mod-en {
  font-size: 13.5px;
  color: var(--tt-augmented);
}
.cs-num {
  color: var(--stat-value);
  font-weight: 600;
}
.cs-mod-tr {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 1px;
}
.cs-mod--frac {
  background: linear-gradient(rgba(122, 211, 197, 0.1), rgba(122, 211, 197, 0));
  border-left: 2px solid var(--gem-teal);
  padding-left: 4px;
}
.cs-mod-frac {
  font-size: 9.5px;
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gem-teal);
  padding: 0 4px;
  border-radius: 2px;
}
.cs-mod-boost {
  color: var(--gem-teal);
  font-weight: 700;
}
.cs-mod-boosted .cs-num {
  color: var(--gem-teal);
}
.cs-cathint {
  flex: none;
  font-size: 10.5px;
  color: var(--text-muted);
  font-style: normal;
  margin-bottom: 5px;
}
.cs-armed {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 6px;
  padding: 4px 6px;
  background: linear-gradient(rgba(231, 180, 120, 0.14), rgba(0, 0, 0, 0.3));
  border: 1px solid var(--gold-ornament);
}
.cs-armed-lbl {
  font-size: 9.5px;
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gold-ornament);
  padding: 0 4px;
  border-radius: 2px;
}
.cs-armed-op {
  font-size: 11px;
  color: var(--gold-title);
  font-weight: 600;
}
.cs-armed-eff {
  font-size: 11px;
  color: var(--text-default);
  flex: 1 1 100%;
}
.cs-armed-x {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.cs-armed-x:hover {
  color: #e0664f;
}
.cs-cattag {
  color: var(--gem-teal) !important;
  border-color: rgba(122, 211, 197, 0.4) !important;
}
.cs-noitem {
  margin: auto;
  color: var(--text-muted);
  font-style: normal;
}
/* --- Akıllı Çözücü (danışman) --- */
/* --- Tahmini Değer paneli (Faz 1) — amber vurgu (advisor teal'inden ayrı) --- */
.cs-value {
  width: 100%;
  max-width: 560px;
  flex: none;
  border: 1px solid rgba(201, 161, 74, 0.55);
  background: linear-gradient(rgba(201, 161, 74, 0.07), rgba(0, 0, 0, 0.3));
  padding: 8px 11px 9px;
}
.cs-value-head {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: #d4af5a;
  margin-bottom: 6px;
}
.cs-value-icon {
  color: #d4af5a;
  font-weight: 700;
}
.cs-value-tag {
  font-size: 9.5px;
  color: var(--text-muted);
  border: 1px solid rgba(201, 161, 74, 0.4);
  padding: 0 4px;
  border-radius: 2px;
  margin-left: 6px;
}
.cs-value-actions {
  display: flex;
  gap: 7px;
  margin-bottom: 6px;
}
.cs-value-btn {
  font: inherit;
  font-size: 11.5px;
  color: #1a1408;
  background: linear-gradient(#d9b765, #c19a45);
  border: 1px solid #8a6f2e;
  padding: 3px 10px;
  cursor: pointer;
  border-radius: 2px;
}
.cs-value-btn:hover {
  filter: brightness(1.08);
}
.cs-value-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.cs-value-btn--ghost {
  color: #d4af5a;
  background: transparent;
  border: 1px solid rgba(201, 161, 74, 0.5);
}
.cs-value-result {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 3px 0 2px;
}
.cs-value-num {
  font-size: 18px;
  font-weight: 700;
  color: #f0d896;
}
.cs-value-cur {
  font-size: 12px;
  color: #d4af5a;
}
.cs-value-range {
  font-size: 11px;
  color: var(--text-muted);
}
.cs-value-meta {
  font-size: 10.5px;
  color: var(--text-muted);
}
.cs-value-warn {
  color: #e0a44f;
}
.cs-value-note {
  margin-top: 4px;
  font-size: 10.5px;
  color: #e0a44f;
  line-height: 1.35;
}
.cs-value-err {
  font-size: 11.5px;
  color: #e08a5a;
  margin: 2px 0;
}
.cs-value-foot {
  margin-top: 6px;
  font-size: 9.5px;
  color: var(--text-muted);
  opacity: 0.8;
}
.cs-filters {
  margin-top: 7px;
  border-top: 1px solid rgba(201, 161, 74, 0.22);
  padding-top: 5px;
}
.cs-filters-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  color: #d4af5a;
  margin-bottom: 4px;
}
.cs-filters-re {
  margin-left: auto;
  font-size: 10px;
  padding: 2px 8px;
}
.cs-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #d8cdb4;
  padding: 1px 0;
  cursor: pointer;
}
.cs-filter--off {
  opacity: 0.45;
  text-decoration: line-through;
}
.cs-filter input[type='checkbox'] {
  accent-color: #c9a14a;
}
.cs-filter-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-filter-sep {
  flex: none;
  color: #8c8060;
  font-size: 10px;
}
.cs-filter-min {
  flex: none;
  width: 44px;
  font: inherit;
  font-size: 10px;
  color: #f0d896;
  background: #161310;
  border: 1px solid rgba(201, 161, 74, 0.4);
  border-radius: 2px;
  padding: 0 4px;
  text-align: right;
}
.cs-filters-live {
  color: #e3c172;
  margin-left: 4px;
}
.cs-value-method {
  font-size: 9.5px;
  color: var(--text-muted);
  margin-top: 2px;
  font-style: normal;
}
.cs-filters-hint {
  font-size: 9.5px;
  color: var(--text-muted);
  margin-top: 3px;
}

/* --- Build Karşılaştırma paneli (Faz 3) — slate vurgu --- */
.cs-compare {
  width: 100%;
  max-width: 560px;
  flex: none;
  border: 1px solid rgba(120, 144, 184, 0.5);
  background: linear-gradient(rgba(120, 144, 184, 0.07), rgba(0, 0, 0, 0.3));
  padding: 8px 11px 9px;
}
.cs-cmp-head {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: #9fb4d8;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cs-cmp-icon {
  color: #9fb4d8;
}
.cs-cmp-score {
  margin-left: auto;
  font-size: 13px;
  font-weight: 700;
  padding: 0 7px;
  border-radius: 3px;
}
.cs-cmp-score.cs-cmp-ok {
  color: #1a2410;
  background: #7fcf6a;
}
.cs-cmp-score.cs-cmp-close {
  color: #2a2008;
  background: #e0c04f;
}
.cs-cmp-score.cs-cmp-low {
  color: #2a1010;
  background: #e07a5a;
}
.cs-cmp-empty {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}
.cs-cmp-slotrow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}
.cs-cmp-lbl {
  font-size: 11px;
  color: var(--text-muted);
}
.cs-cmp-select {
  flex: 1;
  font: inherit;
  font-size: 11px;
  color: #cfe0ff;
  background: #161a22;
  border: 1px solid rgba(120, 144, 184, 0.45);
  padding: 2px 5px;
  border-radius: 2px;
}
.cs-cmp-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-cmp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 4px;
  border-left: 2px solid transparent;
}
.cs-cmp-row.cs-cmp--ok {
  border-left-color: #7fcf6a;
}
.cs-cmp-row.cs-cmp--close {
  border-left-color: #e0c04f;
}
.cs-cmp-row.cs-cmp--low {
  border-left-color: #e07a5a;
}
.cs-cmp-row.cs-cmp--na {
  border-left-color: #6a6a6a;
  opacity: 0.85;
}
.cs-cmp-tag {
  font-size: 8.5px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 2px;
  letter-spacing: 0.03em;
  flex: none;
}
.cs-cmp-tag--ok {
  color: #1a2410;
  background: #7fcf6a;
}
.cs-cmp-tag--close {
  color: #2a2008;
  background: #e0c04f;
}
.cs-cmp-tag--low {
  color: #2a1010;
  background: #e07a5a;
}
.cs-cmp-tag--na {
  color: #ddd;
  background: #555;
}
.cs-cmp-tag--missing {
  color: #2a1010;
  background: #e07a5a;
}
.cs-cmp-tag--extra {
  color: #ddd;
  background: #555;
}
.cs-cmp-text {
  flex: 1;
  color: #d8cdb4;
}
.cs-cmp-pct {
  font-size: 10px;
  color: #9fb4d8;
  flex: none;
}
.cs-cmp-verify {
  color: #e0a44f;
  font-weight: 700;
  cursor: help;
}
.cs-cmp-summary {
  margin-top: 5px;
  font-size: 10px;
  color: var(--text-muted);
}

.cs-advisor {
  width: 100%;
  max-width: 560px;
  flex: none;
  border: 1px solid var(--gem-teal);
  background: linear-gradient(rgba(122, 211, 197, 0.08), rgba(0, 0, 0, 0.32));
  padding: 8px 11px 10px;
}
.cs-advisor--reached {
  border-color: #7fcf9a;
}
.cs-advisor--deadend {
  border-color: #e0a44f;
}
.cs-adv-head {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: var(--gem-teal);
  margin-bottom: 5px;
}
.cs-adv-icon {
  color: var(--gem-teal);
}
.cs-adv-tag {
  font-size: 9.5px;
  color: var(--text-muted);
  border: 1px solid rgba(131, 122, 100, 0.4);
  padding: 0 4px;
  border-radius: 2px;
  margin-left: 4px;
}
.cs-adv-tag--llm {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 700;
}
.cs-adv-loading {
  color: var(--gem-teal);
  font-style: normal;
}
.cs-adv-warn {
  font-size: 11px;
  color: #e0a44f;
  margin-bottom: 4px;
  line-height: 1.35;
}
.cs-adv-text {
  font-size: 13px;
  color: var(--text-default);
  line-height: 1.45;
}
.cs-adv-reached {
  font-size: 14px;
  color: #7fcf9a;
  font-variant: small-caps;
}
.cs-adv-btn {
  margin-top: 8px;
}
.cs-advisor--deadend .cs-adv-btn {
  background: var(--gold-ornament);
  border-color: var(--gold-ornament);
}
/* strateji rozeti */
.cs-adv-strat {
  margin-left: auto;
  font-size: 9.5px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #0a1614;
  background: var(--gold-ornament);
  padding: 1px 6px;
  border-radius: 2px;
  font-weight: 700;
}
.cs-adv-head {
  display: flex;
  align-items: center;
  gap: 5px;
}
/* birincil adım kutusu */
.cs-adv-primary {
  margin-top: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(122, 211, 197, 0.4);
  background: linear-gradient(rgba(122, 211, 197, 0.1), rgba(0, 0, 0, 0.25));
}
.cs-adv-plabel {
  font-size: 9.5px;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: var(--gem-teal);
  margin-bottom: 2px;
}
.cs-adv-ptext {
  font-size: 13.5px;
  color: var(--text-default);
  line-height: 1.4;
}
.cs-adv-primary .cs-adv-btn {
  width: 100%;
}
/* alt başlık */
.cs-adv-sublbl {
  font-size: 10px;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: var(--gold-ornament);
  margin: 9px 0 3px;
  border-top: 1px solid rgba(184, 154, 102, 0.22);
  padding-top: 6px;
}
/* çok-adımlı yol */
.cs-adv-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cs-adv-step {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  line-height: 1.35;
}
.cs-adv-stepn {
  flex: none;
  width: 16px;
  height: 16px;
  text-align: center;
  line-height: 16px;
  font-size: 10px;
  font-weight: 700;
  color: #0a1614;
  background: var(--gold-ornament);
  border-radius: 50%;
}
.cs-adv-step--first .cs-adv-stepn {
  background: var(--gem-teal);
}
.cs-adv-steptxt {
  flex: 1;
  color: var(--text-default);
}
.cs-adv-stepch {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--stat-value);
  font-variant: small-caps;
}
.cs-adv-stepch--sure {
  color: var(--gem-teal);
}
.cs-adv-cum {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-muted);
}
.cs-adv-cum b {
  color: var(--stat-value);
  font-size: 13px;
}
.cs-adv-approx {
  font-size: 9.5px;
  font-style: normal;
  color: var(--text-muted);
  margin-left: 4px;
}
/* alternatifler */
.cs-adv-whyprimary {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-bottom: 4px;
}
.cs-adv-alt {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  margin-bottom: 3px;
  padding: 4px 7px;
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--frame-brown);
  cursor: pointer;
}
.cs-adv-alt:hover {
  border-color: var(--gold-line);
  background: rgba(40, 34, 22, 0.5);
}
.cs-adv-alttxt {
  flex: 1;
  line-height: 1.35;
}
.cs-adv-altcost {
  flex: none;
  color: var(--gold-ornament);
  font-size: 11px;
  letter-spacing: -1px;
}
/* risk notları */
.cs-adv-risks {
  margin-top: 9px;
  border-top: 1px solid rgba(224, 164, 79, 0.25);
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-adv-risk {
  font-size: 11px;
  line-height: 1.35;
  color: #e0a44f;
}
.cs-adv-risk--high {
  color: #e0664f;
  font-weight: 600;
}
.cs-adv-reset {
  width: 100%;
}
.cs-adv-llmtext {
  font-size: 12.5px;
  font-style: normal;
  color: var(--gem-teal);
  line-height: 1.45;
  margin-bottom: 4px;
}
/* --- olasılık paneli --- */
.cs-chance {
  width: 100%;
  max-width: 560px;
  flex: none;
  border: 1px solid rgba(184, 154, 102, 0.3);
  background: rgba(0, 0, 0, 0.32);
  padding: 7px 10px 9px;
}
.cs-chance-head {
  font-variant: small-caps;
  font-size: 12px;
  color: var(--gem-teal);
  margin-bottom: 6px;
}
.cs-chance-op {
  color: var(--gold-title);
  font-weight: 600;
}
.cs-chance-note {
  color: var(--text-muted);
  font-size: 10.5px;
  margin-left: 4px;
}
.cs-chance-empty {
  font-size: 12px;
  color: var(--text-muted);
  font-style: normal;
}
.cs-chance-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 14px;
}
.cs-chance-collbl {
  font-size: 10.5px;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 2px;
  display: inline-block;
  margin-bottom: 3px;
  color: #0a1614;
}
.cs-chance-collbl--p {
  background: #c8aa6e;
}
.cs-chance-collbl--s {
  background: #9aa9c8;
}
.cs-chance-row {
  display: flex;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.45;
}
.cs-chance-pct {
  flex: none;
  width: 46px;
  text-align: right;
  color: var(--stat-value);
  font-weight: 600;
}
.cs-chance-name {
  color: var(--text-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-chance-none {
  color: var(--text-muted);
}
/* --- geçmiş --- */
/* sağ sütun: hedef + geçmiş */
.cs-rightcol {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.cs-target {
  flex: none;
  max-height: 48%;
  overflow-y: auto;
}
.cs-target-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 12px;
  color: var(--gem-teal);
  margin-bottom: 5px;
}
.cs-target-badge {
  font-size: 10.5px;
  font-variant: small-caps;
  padding: 1px 7px;
  border-radius: 2px;
  font-weight: 700;
}
.cs-target-badge--ok {
  color: #0a1614;
  background: #7fcf9a;
}
.cs-target-badge--bad {
  color: #fff;
  background: #b3402f;
}
.cs-target-badge--mid {
  color: #0a1614;
  background: var(--gold-ornament);
}
.cs-target-add {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}
.cs-target-grp {
  flex: 1;
  min-width: 0;
  font-size: 11px;
}
.cs-target-tier {
  flex: none;
  width: 54px;
  font-size: 11px;
}
.cs-target-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-target-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 11.5px;
  padding: 2px 0;
}
.cs-target-check {
  flex: none;
  width: 14px;
  text-align: center;
  color: var(--text-muted);
}
.cs-target-row--met .cs-target-check {
  color: #7fcf9a;
  font-weight: 700;
}
.cs-target-row--bad .cs-target-check {
  color: #e0a44f;
}
.cs-target-name {
  flex: 1;
  color: var(--text-default);
  line-height: 1.3;
}
.cs-target-name b {
  color: var(--gold-title);
}
.cs-target-cur {
  color: var(--gem-teal);
  font-size: 10.5px;
}
.cs-target-bad {
  color: #e0a44f;
  font-size: 10.5px;
}
.cs-target-rm {
  flex: none;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.cs-target-rm:hover {
  color: #e0664f;
}
.cs-target-empty {
  font-size: 11px;
  color: var(--text-muted);
  font-style: normal;
}
.cs-target-deadend {
  margin-top: 6px;
  font-size: 11px;
  color: #e0a44f;
  border-top: 1px solid rgba(224, 164, 79, 0.3);
  padding-top: 5px;
  line-height: 1.35;
}
.cs-target-win {
  margin-top: 6px;
  font-size: 12.5px;
  color: #7fcf9a;
  font-variant: small-caps;
  border-top: 1px solid rgba(127, 207, 154, 0.3);
  padding-top: 5px;
}
.cs-target-clear {
  margin-top: 7px;
  width: 100%;
}
.cs-history {
  overflow: hidden;
  flex: 1;
}
.cs-hist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.cs-hist-btns {
  display: flex;
  gap: 4px;
}
.cs-hbtn {
  font-family: var(--font-serif);
  font-size: 11px;
  font-variant: small-caps;
  color: var(--gold-title);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--metal-edge);
  padding: 2px 7px;
  cursor: pointer;
}
.cs-hbtn:hover:not(:disabled) {
  border-color: var(--gold-line);
  color: #fff;
}
.cs-hbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.cs-hist {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.cs-hrow {
  padding: 4px 2px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.12);
  font-size: 12px;
}
.cs-hrow--init {
  opacity: 0.6;
}
.cs-hop {
  color: var(--gold-title);
  font-variant: small-caps;
}
.cs-hdetail {
  font-size: 11.5px;
  margin-top: 1px;
}
.cs-hadd {
  color: #7fcf9a;
}
.cs-hremove {
  color: #e0664f;
}

/* --- arama kutuları (tema-uyumlu) --- */
.cs-field--search {
  flex: 1 1 200px;
  min-width: 140px;
  max-width: 280px;
}
.cs-field--base {
  flex: 0 1 240px;
  min-width: 0;
}
.cs-field--base .class-filter {
  width: 100%;
}
.cs-search {
  font-family: var(--font-serif);
  font-size: 12px;
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--frame-brown);
  padding: 4px 8px 4px 22px;
  outline: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='none'><circle cx='7' cy='7' r='4.2' stroke='%23b89a66' stroke-width='1.4'/><path d='M10.2 10.2L14 14' stroke='%23b89a66' stroke-width='1.4' stroke-linecap='round'/></svg>");
  background-repeat: no-repeat;
  background-position: 6px center;
}
.cs-search::placeholder {
  color: var(--text-muted);
  font-style: normal;
}
.cs-search:focus {
  border-color: var(--gold-line);
  box-shadow: 0 0 0 1px rgba(200, 170, 110, 0.25);
}
.cs-search--mat {
  flex: none;
  width: 100%;
  margin-bottom: 6px;
}

/* --- tier değer aralığı rozetleri --- */
.cs-mod-range {
  font-size: 10px;
  color: var(--gem-teal);
  font-variant: small-caps;
  background: rgba(122, 211, 197, 0.12);
  border: 1px solid rgba(122, 211, 197, 0.28);
  border-radius: 2px;
  padding: 0 4px;
  flex: none;
  white-space: nowrap;
}
.cs-chance-range {
  flex: none;
  margin-left: auto;
  color: var(--gem-teal);
  font-size: 10.5px;
  white-space: nowrap;
}
.cs-chance-name {
  flex: 0 1 auto;
}
.cs-target-range {
  color: var(--gem-teal);
  font-size: 10px;
  margin-left: 2px;
  white-space: nowrap;
}
.cs-target-rangehint {
  margin-bottom: 6px;
  font-size: 10.5px;
  color: var(--text-muted);
}
.cs-target-rangehint b {
  color: var(--gem-teal);
}

/* --- belirgin tema scrollbar'ı (simülatör panelleri) --- */
.cs-oplist::-webkit-scrollbar,
.cs-esslist::-webkit-scrollbar,
.cs-hist::-webkit-scrollbar,
.cs-target::-webkit-scrollbar,
.cs-itemwrap::-webkit-scrollbar,
.cs-history::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}
.cs-oplist::-webkit-scrollbar-track,
.cs-esslist::-webkit-scrollbar-track,
.cs-hist::-webkit-scrollbar-track,
.cs-target::-webkit-scrollbar-track,
.cs-itemwrap::-webkit-scrollbar-track,
.cs-history::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.55);
  border-left: 1px solid rgba(94, 77, 45, 0.4);
}
.cs-oplist::-webkit-scrollbar-thumb,
.cs-esslist::-webkit-scrollbar-thumb,
.cs-hist::-webkit-scrollbar-thumb,
.cs-target::-webkit-scrollbar-thumb,
.cs-itemwrap::-webkit-scrollbar-thumb,
.cs-history::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #b89a66, #6e5a32);
  border: 1px solid #2a2114;
  border-radius: 3px;
  background-clip: padding-box;
  min-height: 36px;
}
.cs-oplist::-webkit-scrollbar-thumb:hover,
.cs-esslist::-webkit-scrollbar-thumb:hover,
.cs-hist::-webkit-scrollbar-thumb:hover,
.cs-target::-webkit-scrollbar-thumb:hover,
.cs-itemwrap::-webkit-scrollbar-thumb:hover,
.cs-history::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #e7c98a, #a07f44);
}
/* Part 5: build eşyasından craft tohumu bildirimi */
.cs-seed {
  flex: none;
  margin-bottom: 8px;
  border: 1px solid rgba(201, 161, 74, 0.5);
  background: linear-gradient(rgba(70, 56, 28, 0.4), rgba(40, 32, 18, 0.45));
  border-radius: 4px;
  padding: 7px 11px;
}
.cs-seed-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: #e6d2a8;
  flex-wrap: wrap;
}
.cs-seed-ic {
  font-size: 15px;
  color: var(--gold-ornament, #c9a14a);
}
.cs-seed-main b {
  color: #f0e0b0;
}
.cs-seed-stat {
  font-size: 11px;
  color: #0a1614;
  background: var(--gem-teal, #7ad3c5);
  padding: 1px 7px;
  border-radius: 2px;
  font-weight: 600;
}
.cs-seed-stat--warn {
  background: #e0a44f;
}
.cs-seed-x {
  margin-left: auto;
  font: inherit;
  color: #c9a14a;
  background: transparent;
  border: 1px solid rgba(201, 161, 74, 0.5);
  border-radius: 2px;
  cursor: pointer;
  padding: 0 7px;
}
.cs-seed-unmatched {
  margin-top: 5px;
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: center;
}
.cs-seed-um {
  color: #d0a86a;
  border: 1px dashed rgba(200, 170, 110, 0.45);
  border-radius: 2px;
  padding: 0 6px;
}
</style>
