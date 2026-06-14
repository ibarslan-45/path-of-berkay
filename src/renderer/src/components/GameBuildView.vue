<script setup lang="ts">
// GameBuildView.vue — oyun-içi karakter ekranı tarzı build görünümü (Faz 3 görünüm epic).
// Build'i yapan kişinin gear'ı (paper-doll slot düzeni), gem socket grupları (active + support
// birlikte) ve aldığı pasif ağaç node'ları (highlight) OYUNDAKİ GİBİ gösterilir.
// Ham PobBuild kullanır (group yapısı korunur); gem/item/node ADLARI İngilizce orijinal kalır
// (kullanıcı tercihi: özel adlar EN). Başlıklar/etiketler TR. Eksik veri "—"/"doğrulanmalı".
import { ref, computed, watch, onMounted } from 'vue'
import type { PobBuild, PobItem } from '../lib/pob'
import type { MatchedItem } from '../lib/pob-match'
import { trackedStage, setStage, requestCraft } from '../lib/build-target'
import { buildSig, slotProgressId, modProgressId, gemProgressId, nodeProgressId } from '../lib/build-progress'
import { slotWeaponSet, buildHasWeaponSets } from '../lib/weapon-set'
import { buildItemTradeQuery } from '../lib/build-compare'
import { openItemInTrade } from '../lib/price-check'
import PassiveTreeCanvas from './PassiveTreeCanvas.vue'
import gemsData from '../../../data/gems.json'
import treeData from '../../../data/passive-tree.json'

// --- bundled ikon çözümü (assets/gems + assets/items; ağ gerekmez) ---
const gemAssets = import.meta.glob('../../assets/gems/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const itemAssets = import.meta.glob('../../assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const gemUrlByFile: Record<string, string> = {}
for (const p in gemAssets) gemUrlByFile[p.split('/').pop() as string] = gemAssets[p]
const itemUrlByFile: Record<string, string> = {}
for (const p in itemAssets) itemUrlByFile[p.split('/').pop() as string] = itemAssets[p]
// gem adı → ikon (gems.json en→icon path; roman rakam soyularak da denenir)
interface GemRec { en: string; icon: string | null }
const gemRecs = ((gemsData as { records?: GemRec[] }).records ?? (gemsData as GemRec[]))
const gemIconByEn = new Map<string, string>()
for (const g of gemRecs) if (g.en && g.icon && !gemIconByEn.has(g.en)) gemIconByEn.set(g.en, g.icon)
const ROMAN = /\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/
function gemIcon(name: string): string | null {
  let path = gemIconByEn.get(name)
  if (!path) path = gemIconByEn.get(name.replace(ROMAN, '').trim())
  if (!path) return null
  return gemUrlByFile[path.split('/').pop() as string] ?? null
}

interface PassiveLite {
  id: string
  en: string
  tr: string
  node_type: string
  stats_en: string[]
  stats_tr: string[]
  count: number
}
const props = defineProps<{
  raw: PobBuild
  items: MatchedItem[] // ikon/slot için (matchBuild çıktısı)
  passivesById: Record<string, PassiveLite>
  isTr: boolean
}>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)
const emit = defineEmits<{ (e: 'craft'): void }>()

// --- Part 2: "elde ettim" işaretleme (kalıcı; gear/mod/gem/node) ---
const sig = computed(() => buildSig(props.raw))
const progress = ref<Record<string, boolean>>({})
onMounted(async () => {
  progress.value = (await window.api?.build?.progressGet?.()) ?? {}
})
function persistProgress(): void {
  // ÖNEMLİ: progress.value Vue REAKTİF proxy'sidir; contextBridge (sandbox/contextIsolation)
  // proxy'yi serileştiremez → düz nesne klonu gönder (yoksa IPC sessizce başarısız, tikler kaydolmaz).
  window.api?.build?.progressSet?.({ ...progress.value })
}
function isDone(id: string): boolean {
  return !!progress.value[id]
}
function toggleDone(id: string): void {
  const next = { ...progress.value }
  if (next[id]) delete next[id]
  else next[id] = true
  progress.value = next
  persistProgress()
}
function setManyDone(ids: string[], val: boolean): void {
  const next = { ...progress.value }
  for (const id of ids) {
    if (val) next[id] = true
    else delete next[id]
  }
  progress.value = next
  persistProgress()
}

// --- aşama / variant seçici --- (Bug #1: PAYLAŞILAN + KALICI store; list görünümü ile ortak, restart korunur)
const stageIdx = trackedStage
const stages = computed(() => props.raw.skillSets ?? [])
const stage = computed(() => stages.value[Math.min(stageIdx.value, Math.max(0, stages.value.length - 1))] ?? null)
function selectStage(i: number): void {
  setStage(i) // kalıcı yaz (trackedStage'i de günceller)
}

// --- GEAR (paper-doll) ---
// raw.slots: slotName → itemId. Kanonik slot düzeni (oyun karakter ekranı sırası).
const itemById = computed(() => new Map(props.raw.items.map((it) => [it.id, it])))
// id → bundled item ikon URL'si (MatchedItem.icon = items.json taban ikonu yolu → glob URL'si)
const bundledIconById = computed(() => {
  const m = new Map<string, string>()
  for (const it of props.items) {
    if (!it.icon) continue
    const url = itemUrlByFile[it.icon.split('/').pop() as string]
    if (url) m.set(it.id, url)
  }
  return m
})
// uzak ikon (CDN) cache: url → dataUrl (bundled yoksa main net.fetch ile çekilir)
const remoteIcons = ref<Record<string, string>>({})
async function ensureRemote(url?: string): Promise<void> {
  if (!url || remoteIcons.value[url]) return
  const r = await window.api?.cacheIcon?.(url).catch(() => null)
  if (r?.ok && r.dataUrl) remoteIcons.value = { ...remoteIcons.value, [url]: r.dataUrl }
}
// item için ikon (sorun #3 — yanlış base ikonu):
// EŞYA-ÖZGÜ CDN ikonu (iconUrl) VARSA ÖNCELİKLİDİR. Sebep: Mobalytics yapısal verisinde taban yalnız
// SINIF adının insanileştirilmişidir ("Ring","Body Armour"). Bazı sınıf adları (örn. "Ring") items.json'da
// GERÇEK bir tabana denk gelip o tabanın GENEL ikonunu döndürüyordu → eşyanın gerçek ikonu yerine yanlış
// genel ikon. CDN iconUrl her zaman eşyaya özgü/doğru → onu tercih et; yoksa bundled taban ikonu (PoB/.build,
// burada taban TAM ad → doğru). Hiçbiri yoksa placeholder.
function itemIcon(item: PobItem | null): string | null {
  if (!item) return null
  if (item.iconUrl) {
    const cdn = remoteIcons.value[item.iconUrl]
    if (cdn) return cdn
    // CDN yükleniyor: geçici olarak bundled taban ikonu (varsa), yoksa yüklenene kadar placeholder
    return bundledIconById.value.get(item.id) ?? null
  }
  return bundledIconById.value.get(item.id) ?? null
}
const GEAR_SLOTS: Array<{ slot: string; tr: string; en: string }> = [
  { slot: 'Weapon 1', tr: 'Silah', en: 'Weapon' },
  { slot: 'Weapon 2', tr: 'Yan El', en: 'Offhand' },
  { slot: 'Helmet', tr: 'Başlık', en: 'Helmet' },
  { slot: 'Body Armour', tr: 'Gövde', en: 'Body' },
  { slot: 'Gloves', tr: 'Eldiven', en: 'Gloves' },
  { slot: 'Boots', tr: 'Bot', en: 'Boots' },
  { slot: 'Amulet', tr: 'Kolye', en: 'Amulet' },
  { slot: 'Ring 1', tr: 'Yüzük 1', en: 'Ring 1' },
  { slot: 'Ring 2', tr: 'Yüzük 2', en: 'Ring 2' },
  { slot: 'Belt', tr: 'Kemer', en: 'Belt' }
]
interface GearCell {
  slot: string
  label: string
  item: PobItem | null
  set: 1 | 2 | null // silah seti (yalnız silah slotları); paylaşılan/silah-dışı = null
  extra: boolean // kanonik dışı (Flask/Jewel/Charm/Swap silah)
}
// swap silah slotuna okunur etiket
function niceSlotLabel(slot: string): string {
  if (/weapon 1 swap/i.test(slot)) return props.isTr ? 'Silah (Set 2)' : 'Weapon (Set 2)'
  if (/weapon 2 swap/i.test(slot)) return props.isTr ? 'Yan El (Set 2)' : 'Offhand (Set 2)'
  return slot
}
// id → eşleşmiş eşya (pureBase/itemClass → Craft tohumu için)
const matchedById = computed(() => new Map(props.items.map((i) => [i.id, i])))
// Part 5: bu eşyayı Craft Simülatörü'ne gönder (SOL=taban, SAĞ=hedef modlar). App mode'u Craft'a geçer.
function craftItem(item: PobItem | null): void {
  if (!item) return
  const mi = matchedById.value.get(item.id)
  requestCraft({
    base: item.base,
    pureBase: mi?.pureBase || item.base,
    name: item.name,
    itemClass: mi?.itemClass ?? null,
    rarity: item.rarity,
    mods: item.mods,
    itemLevel: item.itemLevel
  })
  emit('craft')
}
// 0.17.9: bu eşyayı TRADE'DE ARA (gevşek: taban + ilk birkaç mod). Trade penceresi/tarayıcı ayara göre açılır.
const tradeBusy = ref(false)
async function tradeItem(item: PobItem | null): Promise<void> {
  if (!item || tradeBusy.value) return
  tradeBusy.value = true
  try {
    const mi = matchedById.value.get(item.id)
    await openItemInTrade(buildItemTradeQuery({ ...item, pureBase: mi?.pureBase }))
  } finally {
    tradeBusy.value = false
  }
}
// #2: seçili AŞAMANIN gear'ı. stageSlots verilmişse (Mobalytics: variant başına gear) onu kullan,
// yoksa tek `slots` (PoB/.build/Maxroll). stageIdx'e bağlı → variant değişince gear da yenilenir.
const activeSlots = computed<Record<string, string>>(
  () => props.raw.stageSlots?.[stageIdx.value] ?? props.raw.slots ?? {}
)
// #5: TÜM eşyalar görünür — kanonik slotlar (paper-doll, boşlar dahil) + kanonik DIŞI dolu slotlar
// (Flask/Jewel/Charm/Swap silah) AYNI tam kartla. Hiçbir eşya gizlenmez.
const gearCells = computed<GearCell[]>(() => {
  const slots = activeSlots.value
  const cells: GearCell[] = GEAR_SLOTS.map((g) => {
    const id = slots[g.slot]
    return {
      slot: g.slot,
      label: props.isTr ? g.tr : g.en,
      item: id ? itemById.value.get(id) ?? null : null,
      set: slotWeaponSet(g.slot),
      extra: false
    }
  })
  const known = new Set(GEAR_SLOTS.map((g) => g.slot))
  for (const [slotName, id] of Object.entries(slots)) {
    if (known.has(slotName)) continue
    const item = itemById.value.get(id) ?? null
    if (!item) continue
    cells.push({ slot: slotName, label: niceSlotLabel(slotName), item, set: slotWeaponSet(slotName), extra: true })
  }
  return cells
})
// --- Sorun #4: rune ayrıştırma ---
// Eşya modları içinde rune bilgisi iki biçimde gelebilir:
//   (a) "(Rune) Iron"  → rune KİMLİĞİ (Mobalytics: takılı rune adı; bu satır stat değil, rune'un kendisi)
//   (b) "+X ... (rune)" → rune KAYNAKLI stat (clipboard biçimi; modun yanına rozet)
const RUNE_NAME_RE = /^\(\s*rune\s*\)\s*/i
const RUNE_SUFFIX_RE = /\s*\(\s*(?:rune|soul core)\s*\)\s*$/i
interface VMod {
  text: string // gösterilecek temiz metin
  orig: string // orijinal satır (progress id'si için — değişmez)
  idx: number // item.mods içindeki orijinal index
  fromRune: boolean
}
interface CellParsed {
  mods: VMod[] // görünür mod kontrol listesi (rune kimlik satırları HARİÇ)
  runes: string[] // takılı rune adları (Rünler satırı)
}
function parseCell(c: GearCell): CellParsed {
  const mods: VMod[] = []
  const runes: string[] = []
  if (!c.item) return { mods, runes }
  c.item.mods.forEach((m, idx) => {
    if (RUNE_NAME_RE.test(m)) {
      runes.push(m.replace(RUNE_NAME_RE, '').trim())
      return
    }
    if (RUNE_SUFFIX_RE.test(m)) {
      mods.push({ text: m.replace(RUNE_SUFFIX_RE, '').trim(), orig: m, idx, fromRune: true })
      return
    }
    mods.push({ text: m, orig: m, idx, fromRune: false })
  })
  return { mods, runes }
}
// gearCells + her hücrenin ayrıştırılmış mod/rune verisi (template tek kaynaktan okur)
const cellInfo = computed(() => gearCells.value.map((c) => ({ c, ...parseCell(c) })))

// bir gear hücresinin slot + mod id'leri (işaretleme). NOT: rune kimlik satırları (Rünler'e taşınan)
// kontrol listesine GİRMEZ → id'ler de yalnız görünür modlar için (özet sayımı tutarlı).
function cellSlotId(c: GearCell): string {
  return slotProgressId(sig.value, c.slot)
}
function cellModIds(c: GearCell): string[] {
  if (!c.item) return []
  return parseCell(c).mods.map((vm) => modProgressId(sig.value, c.slot, vm.idx, vm.orig))
}
// slot başlığını işaretle → o slotun TÜM modlarını da işaretle/kaldır
function toggleSlot(c: GearCell): void {
  const want = !isDone(cellSlotId(c))
  setManyDone([cellSlotId(c), ...cellModIds(c)], want)
}
// bundled ikonu olmayan ama uzak iconUrl taşıyan eşyalar için CDN ikonlarını önceden çek
watch(
  [gearCells],
  () => {
    for (const c of gearCells.value) {
      if (c.item && !bundledIconById.value.get(c.item.id) && c.item.iconUrl) void ensureRemote(c.item.iconUrl)
    }
  },
  { immediate: true }
)
function itemRarityClass(it: PobItem | null): string {
  return 'gv-rar-' + (it?.rarity || 'normal').toLowerCase()
}

// --- GEM SOCKET GRUPLARI (active + linked supports), İKONLU ---
interface GemView { name: string; level: number; icon: string | null }
interface GemGroup {
  label: string
  set: 1 | 2 | null // silaha soketli grup → silah seti; aksi paylaşılan (null)
  actives: GemView[]
  supports: GemView[]
}
const gemGroups = computed<GemGroup[]>(() => {
  const groups = stage.value?.groups ?? []
  return groups
    .map((grp) => ({
      label: grp.label || '',
      set: slotWeaponSet(grp.slot),
      actives: grp.gems.filter((g) => !g.support && g.nameSpec).map((g) => ({ name: g.nameSpec, level: g.level, icon: gemIcon(g.nameSpec) })),
      supports: grp.gems.filter((g) => g.support && g.nameSpec).map((g) => ({ name: g.nameSpec, level: g.level, icon: gemIcon(g.nameSpec) }))
    }))
    .filter((g) => g.actives.length || g.supports.length)
})
// #3 (0.17.4): bu build silah seti kullanıyor ama HİÇBİR gem grubuna set atanmamış mı?
// (Mobalytics'te gem→weaponSet çoğu build'de null.) Öyleyse gem bölümünde DÜRÜST not göster
// (rozet yerine "gem'ler silah setine göre ayrılmamış") — boş bırakma.
const gemsHaveSetData = computed(() => gemGroups.value.some((g) => g.set != null))
// gem işaretleme id'si — BİLEŞİK anahtar (grup index + grup-içi sıra + ad). Aynı isimli gem birden çok
// socket grubunda olunca (örn. "Elemental Armament") ada-göre anahtar ÇAKIŞIYORDU → birini işaretleyince
// diğeri de işaretleniyordu. groupIdx (gemGroups sırası) + idx (aktif/support içindeki sıra) ile benzersiz.
function gemDoneId(groupIdx: number, support: boolean, idx: number, name: string): string {
  return gemProgressId(sig.value, 'g' + groupIdx, support, idx, name)
}

// --- node adı/türü çözümü (passive-tree.json node[5]=pid → passivesById; canvas ile aynı köprü) ---
type TreeArr = [number, number, number, number, string, string | null, string | null]
const treeNodes = (treeData as unknown as { nodes: TreeArr[] }).nodes
const nodeMeta = computed<Map<number, { name: string; type: string }>>(() => {
  const m = new Map<number, { name: string; type: string }>()
  for (const n of treeNodes) {
    const pid = n[5]
    if (pid && props.passivesById[pid]) {
      const p = props.passivesById[pid]
      m.set(n[0], { name: p.en, type: (p.node_type || '').toLowerCase() })
    }
  }
  return m
})

// --- PASİF AĞAÇ (aşama-progresif: bu aşamaya kadarki node'lar + "bu aşamada eklenenler" amber) ---
// Aşamayı spec'e eşle: başlık eşleşmesi → index (sınırlı) → en çok node'lu.
function specForStage(i: number): { title: string; nodes: number[] } | null {
  const specs = props.raw.specs ?? []
  if (!specs.length) return null
  const title = stages.value[i]?.title
  return (
    (title ? specs.find((s) => s.title === title) : undefined) ??
    specs[Math.min(i, specs.length - 1)] ??
    specs.reduce((a, b) => (b.nodes.length > a.nodes.length ? b : a))
  )
}
const stageSpec = computed(() => specForStage(stageIdx.value))
const allocatedNodes = computed<number[]>(() => stageSpec.value?.nodes ?? [])
// "bu aşamada eklenen" = bu aşama node'ları − önceki aşamanın node'ları (yalnız spec FARKLI ise; tek-spec'te boş).
const addedNodes = computed<number[]>(() => {
  if (stageIdx.value <= 0) return []
  const prev = specForStage(stageIdx.value - 1)
  const cur = stageSpec.value
  if (!prev || !cur || prev === cur) return []
  const prevSet = new Set(prev.nodes)
  return cur.nodes.filter((n) => !prevSet.has(n))
})
// --- Sorun #2: bölümleri ALT ALTA tam genişlik + AÇ/KAPA (accordion); durum kalıcı (localStorage) ---
type SecKey = 'equip' | 'gems' | 'tree'
const LS_ACC = 'gv-accordion-v1'
function loadAcc(): Record<SecKey, boolean> {
  try {
    const r = JSON.parse(localStorage.getItem(LS_ACC) || 'null')
    if (r && typeof r === 'object') return { equip: r.equip !== false, gems: r.gems !== false, tree: r.tree !== false }
  } catch {
    /* yok say */
  }
  return { equip: true, gems: true, tree: true }
}
const openSec = ref<Record<SecKey, boolean>>(loadAcc())
function toggleSec(k: SecKey): void {
  openSec.value = { ...openSec.value, [k]: !openSec.value[k] }
  try {
    localStorage.setItem(LS_ACC, JSON.stringify(openSec.value))
  } catch {
    /* yok say */
  }
}

// kayda değer (notable/keystone) tahsis edilen node'lar → işaretlenebilir liste (her node yerine
// anlamlı node'lar; minör node'lar sayıyla gösterilir — dürüst, kullanışlı yorum)
const notableNodes = computed<Array<{ id: number; name: string }>>(() => {
  const out: Array<{ id: number; name: string }> = []
  const seen = new Set<string>()
  for (const id of allocatedNodes.value) {
    const meta = nodeMeta.value.get(id)
    if (!meta || !/notable|keystone/.test(meta.type)) continue
    if (seen.has(meta.name)) continue
    seen.add(meta.name)
    out.push({ id, name: meta.name })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
})
const minorNodeCount = computed(() => Math.max(0, allocatedNodes.value.length - notableNodes.value.length))
function nodeDoneId(id: number): string {
  return nodeProgressId(sig.value, id)
}
// #3: ağaçta "elde ettim" işaretli (acquired) node id'leri — tıklanınca toggle + kalıcı.
const acquiredNodeIds = computed<number[]>(() => allocatedNodes.value.filter((id) => isDone(nodeDoneId(id))))
function onToggleNode(id: number): void {
  toggleDone(nodeDoneId(id))
}

// --- Part 4: silah seti (weapon set 1/2) ayrımı (yalnız VARSA) ---
const setNodes = computed<{ set1: number[]; set2: number[] } | null>(() => {
  const s = stageSpec.value as { set1Nodes?: number[]; set2Nodes?: number[] } | null
  if (!s || !s.set1Nodes || !s.set2Nodes) return null
  if (!s.set1Nodes.length && !s.set2Nodes.length) return null
  return { set1: s.set1Nodes, set2: s.set2Nodes }
})
// Part 4/#2: build 2 silah seti kullanıyor mu (pasif set1/2 VEYA swap silah/grup) → Set 1/2 etiketleri
const hasWeaponSets = computed(() => buildHasWeaponSets(props.raw))
// ağaçta hangi set vurgulanacak ('all' → aşama-eklenen amber; 'set1'/'set2' → o setin node'ları)
const setFilter = ref<'all' | 'set1' | 'set2'>('all')
// setFilter'e göre bir öğe (silah seti) soluk gösterilsin mi? (paylaşılan/null öğeler her zaman görünür)
function dimForSet(set: 1 | 2 | null): boolean {
  if (setFilter.value === 'all' || set == null) return false
  return (setFilter.value === 'set1' ? 1 : 2) !== set
}
// kısa rozet metni
function setBadge(set: 1 | 2 | null): string {
  return set === 1 ? 'Set 1' : set === 2 ? 'Set 2' : ''
}
const treeHighlight = computed<number[]>(() => {
  if (!setNodes.value || setFilter.value === 'all') return addedNodes.value
  return setFilter.value === 'set1' ? setNodes.value.set1 : setNodes.value.set2
})

// --- Part 2: ilerleme özeti (seçili aşama: gear slot + mod + gem + notable node) ---
const progressSummary = computed(() => {
  const p = progress.value
  let total = 0
  let done = 0
  const add = (id: string): void => {
    total++
    if (p[id]) done++
  }
  for (const c of gearCells.value) {
    if (!c.item) continue
    add(cellSlotId(c))
    for (const mid of cellModIds(c)) add(mid)
  }
  gemGroups.value.forEach((grp, gi) => {
    grp.actives.forEach((a, j) => add(gemDoneId(gi, false, j, a.name)))
    grp.supports.forEach((s, k) => add(gemDoneId(gi, true, k, s.name)))
  })
  for (const n of notableNodes.value) add(nodeDoneId(n.id))
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
})
</script>

<template>
  <div class="gv">
    <!-- aşama / variant seçici (birden çok skillSet varsa) -->
    <div v-if="stages.length > 1" class="gv-stages">
      <span class="gv-stages-lbl">{{ tr('Aşama / Variant', 'Stage / Variant') }}</span>
      <button
        v-for="(s, i) in stages"
        :key="s.id"
        class="gv-stage"
        :class="{ 'gv-stage--on': i === stageIdx }"
        @click="selectStage(i)"
      >
        {{ s.title || tr('Aşama', 'Stage') + ' ' + (i + 1) }}
      </button>
    </div>

    <!-- Part 2: ilerleme özeti (bu aşama için "elde ettiğim" oranı) -->
    <div class="gv-prog">
      <span class="gv-prog-lbl">{{ tr('İlerleme (bu aşama)', 'Progress (this stage)') }}</span>
      <div class="gv-prog-bar"><div class="gv-prog-fill" :style="{ width: progressSummary.pct + '%' }"></div></div>
      <span class="gv-prog-num">{{ progressSummary.done }} / {{ progressSummary.total }} · {{ progressSummary.pct }}%</span>
    </div>

    <!-- #2: silah seti (weapon set 1/2) filtresi — gear + gem + pasif ağaç hepsine uygulanır (yalnız VARSA) -->
    <div v-if="hasWeaponSets" class="gv-wset gv-wset--global">
      <span class="gv-wset-lbl">{{ tr('Silah Seti', 'Weapon Set') }}:</span>
      <button class="gv-wset-btn" :class="{ 'gv-wset-btn--on': setFilter === 'all' }" @click="setFilter = 'all'">{{ tr('Tümü', 'All') }}</button>
      <button class="gv-wset-btn gv-wset-btn--s1" :class="{ 'gv-wset-btn--on': setFilter === 'set1' }" @click="setFilter = 'set1'">Set 1</button>
      <button class="gv-wset-btn gv-wset-btn--s2" :class="{ 'gv-wset-btn--on': setFilter === 'set2' }" @click="setFilter = 'set2'">Set 2</button>
      <span class="gv-wset-note">{{ tr('silahlar, silaha soketli gem’ler ve sete özel pasifler etiketlenir', 'weapons, weapon-socketed gems and set-specific passives are labeled') }}</span>
    </div>

    <!-- Sorun #2: bölümler ALT ALTA, tam genişlik, her biri AÇ/KAPA (accordion) -->
    <div class="gv-stack">
      <!-- ══ EKİPMAN ══ -->
      <section class="gv-acc panel-frame">
        <button class="gv-acc-head" @click="toggleSec('equip')">
          <span class="gv-acc-caret">{{ openSec.equip ? '▾' : '▸' }}</span>
          ⚔ {{ tr('Ekipman', 'Equipment') }}
          <span class="gv-acc-count">{{ gearCells.filter((c) => c.item).length }} {{ tr('eşya', 'items') }}</span>
        </button>
        <div v-show="openSec.equip" class="gv-acc-body">
          <div class="gv-gear-grid">
            <div v-for="info in cellInfo" :key="info.c.slot" class="gv-slot" :class="[itemRarityClass(info.c.item), { 'gv-slot--empty': !info.c.item, 'gv-slot--done': info.c.item && isDone(cellSlotId(info.c)), 'gv-slot--dim': dimForSet(info.c.set) }]">
              <div class="gv-slot-head">
                <button
                  v-if="info.c.item"
                  class="gv-chk"
                  :class="{ 'gv-chk--on': isDone(cellSlotId(info.c)) }"
                  :title="tr('Bu eşyayı elde ettim', 'I obtained this item')"
                  @click="toggleSlot(info.c)"
                >✓</button>
                <img v-if="itemIcon(info.c.item)" :src="itemIcon(info.c.item)!" class="gv-slot-icon" alt="" />
                <span v-else class="gv-slot-icon gv-slot-icon--ph">◇</span>
                <span class="gv-slot-label">{{ info.c.label }}</span>
                <span v-if="hasWeaponSets && info.c.set" class="gv-setbadge" :class="'gv-setbadge--s' + info.c.set">{{ setBadge(info.c.set) }}</span>
              </div>
              <template v-if="info.c.item">
                <div class="gv-item-name">{{ info.c.item.name || info.c.item.base }}</div>
                <div v-if="info.c.item.base && info.c.item.base !== info.c.item.name" class="gv-item-base">{{ info.c.item.base }}</div>
                <ul v-if="info.mods.length" class="gv-item-mods gv-item-mods--check">
                  <li
                    v-for="m in info.mods"
                    :key="m.idx"
                    class="gv-modline"
                    :class="{ 'gv-modline--done': isDone(modProgressId(sig, info.c.slot, m.idx, m.orig)) }"
                    @click="toggleDone(modProgressId(sig, info.c.slot, m.idx, m.orig))"
                  >
                    <span class="gv-chk gv-chk--sm" :class="{ 'gv-chk--on': isDone(modProgressId(sig, info.c.slot, m.idx, m.orig)) }">✓</span>
                    <span class="gv-modtext">{{ m.text }}</span>
                    <!-- Sorun #4: rune kaynaklı stat → rozet -->
                    <span v-if="m.fromRune" class="gv-runebadge" :title="tr('Bu stat bir rune’dan geliyor', 'This stat comes from a rune')">🔹 {{ tr('Rün', 'Rune') }}</span>
                  </li>
                </ul>
                <div v-else-if="!info.runes.length" class="gv-item-nomods">{{ tr('— mod verisi yok (doğrulanmalı)', '— no mod data (verify)') }}</div>
                <!-- Sorun #4: ayrı RÜNLER satırı — kaç soket / hangi rune takılı -->
                <div v-if="info.runes.length" class="gv-runes">
                  <span class="gv-runes-lbl">🔹 {{ tr('Rünler', 'Runes') }}</span>
                  <span class="gv-runes-count">{{ info.runes.length }} {{ tr('soket', info.runes.length === 1 ? 'socket' : 'sockets') }}</span>
                  <span
                    v-for="(rn, ri) in info.runes"
                    :key="ri"
                    class="gv-rune-chip"
                    :title="tr('Takılı rune', 'Socketed rune') + ': ' + rn"
                  >{{ rn }}</span>
                </div>
                <!-- aksiyon butonları KENDİ satırında (başlıkla çakışmaz) -->
                <div class="gv-slot-actions">
                  <button
                    class="gv-craftbtn"
                    :title="tr('Bu eşyayı Craft Simülatörü’ne gönder (hedef olarak)', 'Send this item to the Craft Simulator (as target)')"
                    @click="craftItem(info.c.item)"
                  >⚒ {{ tr('Craft’la', 'Craft') }}</button>
                  <button
                    class="gv-tradebtn"
                    :disabled="tradeBusy"
                    :title="tr('Bu eşyayı trade’de ara (taban + öne çıkan modlar; gevşek)', 'Search this item on trade (base + top mods; loose)')"
                    @click="tradeItem(info.c.item)"
                  >↗ {{ tr('Trade’de Ara', 'Trade') }}</button>
                </div>
              </template>
              <div v-else class="gv-slot-empty">{{ tr('boş', 'empty') }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ══ YETENEK TAŞLARI ══ -->
      <section class="gv-acc panel-frame">
        <button class="gv-acc-head" @click="toggleSec('gems')">
          <span class="gv-acc-caret">{{ openSec.gems ? '▾' : '▸' }}</span>
          ✦ {{ tr('Yetenek Taşları (Socket Grupları)', 'Skill Gems (Socket Groups)') }}
          <span class="gv-acc-count">{{ gemGroups.length }} {{ tr('grup', 'groups') }}</span>
        </button>
        <div v-show="openSec.gems" class="gv-acc-body">
          <div v-if="!gemGroups.length" class="gv-empty">{{ tr('Bu aşamada gem verisi yok', 'No gem data for this stage') }}</div>
          <!-- build silah seti kullanıyor ama gem'lere set atanmamış → dürüst not (rozet yerine) -->
          <div v-if="hasWeaponSets && !gemsHaveSetData && gemGroups.length" class="gv-gemsetnote">
            ⓘ {{ tr('Bu build’de gem’ler silah setine göre ayrılmamış (kaynak veri set bilgisi içermiyor).', 'This build does not assign gems to weapon sets (source data has no set info).') }}
          </div>
          <div class="gv-gem-grid">
            <div v-for="(grp, i) in gemGroups" :key="i" class="gv-group" :class="{ 'gv-group--dim': dimForSet(grp.set) }">
              <div v-if="hasWeaponSets && grp.set" class="gv-group-set" :class="'gv-setbadge--s' + grp.set">{{ setBadge(grp.set) }} {{ tr('(silaha soketli)', '(in weapon)') }}</div>
              <div
                v-for="(a, j) in grp.actives"
                :key="'a' + j"
                class="gv-active gv-gemrow"
                :class="{ 'gv-gemrow--done': isDone(gemDoneId(i, false, j, a.name)) }"
                @click="toggleDone(gemDoneId(i, false, j, a.name))"
              >
                <span class="gv-chk gv-chk--sm" :class="{ 'gv-chk--on': isDone(gemDoneId(i, false, j, a.name)) }">✓</span>
                <span class="gv-gemic gv-gemic--active">
                  <img v-if="a.icon" :src="a.icon" alt="" />
                  <span v-else class="gv-gemic-ph" :title="tr('görsel yok', 'no image')">◆</span>
                </span>
                <span class="gv-gem-name">{{ a.name }}</span>
                <span v-if="a.level" class="gv-gem-lv">Lv {{ a.level }}</span>
              </div>
              <div v-if="grp.supports.length" class="gv-supports">
                <span
                  v-for="(s, k) in grp.supports"
                  :key="'s' + k"
                  class="gv-support gv-gemrow"
                  :class="{ 'gv-gemrow--done': isDone(gemDoneId(i, true, k, s.name)) }"
                  :title="s.name"
                  @click="toggleDone(gemDoneId(i, true, k, s.name))"
                >
                  <span class="gv-chk gv-chk--xs" :class="{ 'gv-chk--on': isDone(gemDoneId(i, true, k, s.name)) }">✓</span>
                  <span class="gv-gemic gv-gemic--support">
                    <img v-if="s.icon" :src="s.icon" alt="" />
                    <span v-else class="gv-gemic-ph" :title="tr('görsel yok', 'no image')">◆</span>
                  </span>
                  {{ s.name }}
                </span>
              </div>
              <div v-if="!grp.actives.length && grp.supports.length" class="gv-group-note">{{ tr('(yalnız support — ana gem eşleşmedi)', '(supports only — no active gem)') }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ══ PASİF AĞAÇ ══ -->
      <section class="gv-acc panel-frame">
        <button class="gv-acc-head" @click="toggleSec('tree')">
          <span class="gv-acc-caret">{{ openSec.tree ? '▾' : '▸' }}</span>
          ✤ {{ tr('Pasif Ağaç', 'Passive Tree') }}
          <span class="gv-acc-count">{{ allocatedNodes.length }} {{ tr('node', 'nodes') }}</span>
          <span v-if="addedNodes.length && setFilter === 'all'" class="gv-treeadded">+{{ addedNodes.length }} {{ tr('bu aşamada', 'this stage') }}</span>
        </button>
        <div v-show="openSec.tree" class="gv-acc-body">
          <!-- Part 4: sete özel pasif node sayısı (yalnız passive set verisi varsa) -->
          <div v-if="setNodes && setFilter !== 'all'" class="gv-wset-note gv-wset-note--tree">
            {{ setFilter === 'set1' ? 'Set 1' : 'Set 2' }}: {{ (setFilter === 'set1' ? setNodes.set1 : setNodes.set2).length }} {{ tr('sete özel pasif (amber)', 'set-specific passives (amber)') }}
          </div>
          <div class="gv-treehint">
            {{ tr('İpucu: ağaçtaki bir node’a tıkla → "elde ettim" (yeşil) işaretle; kapat-aç’ta kalır.', 'Tip: click a node on the tree → mark as acquired (green); persists across restarts.') }}
          </div>
          <PassiveTreeCanvas
            v-if="openSec.tree"
            class="gv-treehost"
            :passives-by-id="passivesById"
            :is-tr="isTr"
            :allocated="allocatedNodes"
            :highlight="treeHighlight"
            :done="acquiredNodeIds"
            :markable="true"
            @toggle-node="onToggleNode"
          />

          <!-- Part 2: kayda değer (notable/keystone) node işaretleme -->
          <div v-if="notableNodes.length" class="gv-nodes">
            <div class="gv-nodes-head">
              {{ tr('Kayda Değer Pasifler (işaretle)', 'Notable Passives (check off)') }}
              <span v-if="minorNodeCount" class="gv-nodes-minor">+{{ minorNodeCount }} {{ tr('küçük node', 'minor nodes') }}</span>
            </div>
            <div class="gv-nodes-grid">
              <span
                v-for="n in notableNodes"
                :key="n.id"
                class="gv-noderow"
                :class="{ 'gv-noderow--done': isDone(nodeDoneId(n.id)) }"
                @click="toggleDone(nodeDoneId(n.id))"
              >
                <span class="gv-chk gv-chk--xs" :class="{ 'gv-chk--on': isDone(nodeDoneId(n.id)) }">✓</span>
                {{ n.name }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}
.gv-stages {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.gv-stages-lbl {
  font-size: 12.5px;
  color: var(--text-muted);
}
.gv-stage {
  font: inherit;
  font-size: 13px;
  color: #cdc3aa;
  background: #1a1712;
  border: 1px solid rgba(184, 154, 102, 0.35);
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 2px;
}
.gv-stage--on {
  color: #1a1408;
  background: linear-gradient(#d9b765, #c19a45);
  border-color: #8a6f2e;
}
/* Sorun #2: bölümler ALT ALTA, tam genişlik; tüm yığın tek scroll alanı */
.gv-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}
/* accordion bölümü */
.gv-acc {
  padding: 0;
  overflow: hidden;
}
.gv-acc-head {
  width: 100%;
  text-align: left;
  font: inherit;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 16px;
  color: var(--gold-ornament, #c9a14a);
  background: rgba(0, 0, 0, 0.25);
  border: none;
  border-bottom: 1px solid rgba(184, 154, 102, 0.25);
  padding: 9px 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 9px;
}
.gv-acc-head:hover {
  background: rgba(201, 161, 74, 0.08);
}
.gv-acc-caret {
  font-size: 12px;
  width: 14px;
  color: var(--gold-ornament, #c9a14a);
}
.gv-acc-count {
  font-size: 11px;
  font-variant: normal;
  color: var(--text-muted);
  margin-left: auto;
}
.gv-acc-body {
  padding: 11px 13px;
}
.gv-sec-head {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 16px;
  color: var(--gold-ornament, #c9a14a);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gv-sec-sub {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 12px 0 6px;
}
.gv-gear-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  align-items: start;
}
.gv-slot {
  border: 1px solid rgba(184, 154, 102, 0.25);
  background: rgba(0, 0, 0, 0.22);
  border-left-width: 3px;
  padding: 9px 11px;
  border-radius: 3px;
  min-width: 0;
  overflow: hidden;
}
/* #1: aksiyon butonları kendi satırında — başlık/label ile çakışmaz, dar kartta da düzgün sarar */
.gv-slot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.gv-slot--sm {
  grid-column: auto;
}
.gv-slot--empty {
  opacity: 0.5;
  border-style: dashed;
}
.gv-slot-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.gv-slot-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex: none;
}
.gv-slot-icon--ph {
  color: var(--gold-ornament, #c9a14a);
  font-size: 24px;
  text-align: center;
  width: 34px;
}
.gv-slot-label {
  font-size: 12px;
  color: var(--text-muted);
  font-variant: small-caps;
  letter-spacing: 0.04em;
}
.gv-item-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.gv-item-base {
  font-size: 12.5px;
  opacity: 0.82;
  margin-top: 1px;
}
.gv-item-mods {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  font-size: 12.5px;
  color: #97a9e6;
  line-height: 1.5;
}
.gv-item-more {
  color: var(--text-muted);
}
.gv-item-nomods,
.gv-slot-empty {
  font-size: 11.5px;
  color: var(--text-muted);
  font-style: normal;
}
/* rarity renk vurgusu (sol kenar + isim) */
.gv-rar-rare {
  border-left-color: #c8b13a;
}
.gv-rar-rare .gv-item-name {
  color: #f0e35a;
}
.gv-rar-unique {
  border-left-color: #af6025;
}
.gv-rar-unique .gv-item-name {
  color: #d2864a;
}
.gv-rar-magic {
  border-left-color: #5a6ec8;
}
.gv-rar-magic .gv-item-name {
  color: #8aa0e8;
}
.gv-rar-normal .gv-item-name {
  color: #d8cdb4;
}
/* Sorun #2: gem grupları tam genişlikte rahat dizilsin (responsive çok-sütun) */
.gv-gem-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 9px;
  align-items: start;
}
/* gem grupları */
.gv-group {
  border: 1px solid rgba(122, 211, 197, 0.28);
  background: rgba(122, 211, 197, 0.05);
  padding: 8px 11px;
  margin-bottom: 0;
  border-radius: 3px;
}
/* Sorun #4: rune rozeti + Rünler satırı */
.gv-runebadge {
  flex: none;
  font-size: 10px;
  color: #8fb8ff;
  background: rgba(90, 130, 220, 0.16);
  border: 1px solid rgba(120, 160, 235, 0.5);
  border-radius: 3px;
  padding: 0 5px;
  margin-left: 4px;
  white-space: nowrap;
  align-self: center;
}
.gv-runes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 7px;
  margin-top: 7px;
  padding: 5px 7px;
  border: 1px solid rgba(120, 160, 235, 0.32);
  background: rgba(90, 130, 220, 0.08);
  border-radius: 3px;
}
.gv-runes-lbl {
  font-size: 11.5px;
  font-weight: 600;
  color: #9cc0ff;
  font-variant: small-caps;
  letter-spacing: 0.03em;
}
.gv-runes-count {
  font-size: 10.5px;
  color: var(--text-muted);
}
.gv-rune-chip {
  font-size: 11px;
  color: #d6e2ff;
  background: rgba(90, 130, 220, 0.2);
  border: 1px solid rgba(120, 160, 235, 0.45);
  border-radius: 3px;
  padding: 1px 7px;
}
.gv-active {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14.5px;
}
.gv-gem-name {
  font-weight: 600;
  color: #ece1c8;
}
.gv-gem-lv {
  font-size: 11.5px;
  color: var(--text-muted);
}
.gv-gem-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.gv-gem-dot--active {
  background: #7ad3c5;
  box-shadow: 0 0 4px rgba(122, 211, 197, 0.7);
}
.gv-gem-dot--support {
  background: #b89a66;
  width: 7px;
  height: 7px;
}
/* gem ikonları (socket grupları, oyundaki gibi) */
.gv-gemic {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
}
.gv-gemic img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.gv-gemic--active {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(122, 211, 197, 0.6);
  box-shadow: 0 0 5px rgba(122, 211, 197, 0.35);
}
.gv-gemic--support {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(184, 154, 102, 0.5);
}
.gv-gemic-ph {
  color: var(--gold-ornament, #c9a14a);
  font-size: 16px;
  opacity: 0.7;
}
.gv-treeadded {
  font-size: 10px;
  color: #ffcf6a;
  font-variant: normal;
  border: 1px solid rgba(255, 207, 106, 0.5);
  border-radius: 3px;
  padding: 0 5px;
}
.gv-supports {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 11px;
  margin-top: 7px;
  padding-left: 18px;
}
.gv-support {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #d4cbb4;
}
.gv-group-note {
  font-size: 9.5px;
  color: var(--text-muted);
  font-style: normal;
}
.gv-empty {
  font-size: 11px;
  color: var(--text-muted);
}
.gv-gemsetnote {
  font-size: 11px;
  color: #c2b283;
  background: rgba(184, 154, 102, 0.08);
  border-left: 2px solid rgba(184, 154, 102, 0.45);
  padding: 4px 8px;
  margin-bottom: 6px;
  line-height: 1.35;
}
.gv-treecount {
  font-size: 10px;
  color: var(--text-muted);
  font-variant: normal;
}
.gv-treebtn {
  margin-left: auto;
  font: inherit;
  font-size: 10.5px;
  color: var(--gem-teal, #7ad3c5);
  background: transparent;
  border: 1px solid rgba(122, 211, 197, 0.45);
  border-radius: 2px;
  padding: 1px 8px;
  cursor: pointer;
}
.gv-treehost {
  height: 440px;
  margin-top: 8px;
}

/* --- Part 2: işaretleme (checkbox) + ilerleme --- */
.gv-prog {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 4px;
}
.gv-prog-lbl {
  font-size: 12px;
  color: var(--text-muted);
  font-variant: small-caps;
  letter-spacing: 0.03em;
}
.gv-prog-bar {
  flex: 1;
  height: 9px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(184, 154, 102, 0.3);
  border-radius: 5px;
  overflow: hidden;
}
.gv-prog-fill {
  height: 100%;
  background: linear-gradient(90deg, #6fb058, #8fd07a);
  transition: width 0.2s;
}
.gv-prog-num {
  font-size: 12px;
  color: var(--gem-teal, #7ad3c5);
  font-weight: 600;
  white-space: nowrap;
}
/* yeşil tik düğmesi */
.gv-chk {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border: 1px solid var(--metal-edge, #6b5a36);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.4);
  color: transparent;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1;
  padding: 0;
}
.gv-chk--sm {
  width: 16px;
  height: 16px;
  font-size: 11px;
}
.gv-chk--xs {
  width: 14px;
  height: 14px;
  font-size: 10px;
}
.gv-chk--on {
  color: #0a1608;
  background: linear-gradient(#8fd07a, #6fb058);
  border-color: #4f8a3e;
}
.gv-slot--done {
  border-left-color: #6fb058 !important;
  background: rgba(111, 176, 88, 0.08);
}
.gv-craftbtn {
  font: inherit;
  font-size: 10.5px;
  font-variant: small-caps;
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border: 1px solid #9a7330;
  border-radius: 2px;
  padding: 2px 9px;
  cursor: pointer;
  white-space: nowrap;
}
.gv-craftbtn:hover {
  background: linear-gradient(#ecc279, #d6a052);
}
.gv-tradebtn {
  font: inherit;
  font-size: 10.5px;
  font-variant: small-caps;
  color: #e3c172;
  background: transparent;
  border: 1px solid rgba(201, 161, 74, 0.55);
  border-radius: 2px;
  padding: 2px 9px;
  cursor: pointer;
  white-space: nowrap;
}
.gv-tradebtn:hover {
  background: rgba(201, 161, 74, 0.14);
}
.gv-tradebtn:disabled {
  opacity: 0.5;
  cursor: default;
}
.gv-item-mods--check {
  color: inherit;
}
.gv-modline {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  cursor: pointer;
  padding: 1px 0;
}
.gv-modtext {
  color: #97a9e6;
  flex: 1;
}
.gv-modline--done .gv-modtext {
  color: #7faf6a;
  text-decoration: line-through;
  opacity: 0.7;
}
.gv-gemrow {
  cursor: pointer;
}
.gv-gemrow--done .gv-gem-name,
.gv-gemrow--done {
  opacity: 0.62;
}
.gv-gemrow--done .gv-gem-name {
  text-decoration: line-through;
}
/* notable node işaretleme */
.gv-nodes {
  margin-top: 10px;
  border-top: 1px solid rgba(184, 154, 102, 0.2);
  padding-top: 8px;
}
.gv-nodes-head {
  font-size: 12px;
  color: var(--gold-ornament, #c9a14a);
  font-variant: small-caps;
  letter-spacing: 0.03em;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gv-nodes-minor {
  font-size: 10.5px;
  color: var(--text-muted);
  font-variant: normal;
}
.gv-nodes-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
}
.gv-noderow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #d6c08a;
  border: 1px solid rgba(184, 154, 102, 0.3);
  border-radius: 3px;
  padding: 2px 7px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.18);
}
.gv-noderow--done {
  color: #7faf6a;
  border-color: #4f8a3e;
  background: rgba(111, 176, 88, 0.1);
}
.gv-noderow--done {
  text-decoration: line-through;
}
/* Part 4: weapon set toggle */
.gv-wset {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 4px 0 2px;
}
.gv-wset-lbl {
  font-size: 12px;
  color: var(--text-muted);
  font-variant: small-caps;
}
.gv-wset-btn {
  font: inherit;
  font-size: 11.5px;
  color: #cdc3aa;
  background: #1a1712;
  border: 1px solid rgba(184, 154, 102, 0.35);
  padding: 2px 9px;
  cursor: pointer;
  border-radius: 2px;
}
.gv-wset-btn--on {
  color: #1a1408;
  background: linear-gradient(#d9b765, #c19a45);
  border-color: #8a6f2e;
}
.gv-wset-btn--s1.gv-wset-btn--on {
  background: linear-gradient(#e0b46a, #c89446);
}
.gv-wset-btn--s2.gv-wset-btn--on {
  background: linear-gradient(#7fb0e0, #4f88c8);
  border-color: #2e5f8a;
}
.gv-wset-note {
  font-size: 10.5px;
  color: var(--text-muted);
}
.gv-treehint {
  font-size: 10.5px;
  color: var(--text-muted);
  margin: 4px 0 2px;
}
.gv-wset--global {
  margin: 2px 0 4px;
  padding: 4px 6px;
  border: 1px solid rgba(184, 154, 102, 0.25);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.18);
}
.gv-wset-note--tree {
  margin: 4px 0;
}
/* #2: silah seti rozeti (gear + gem) */
.gv-setbadge {
  font-size: 9.5px;
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  padding: 0 5px;
  border-radius: 2px;
  flex: none;
}
.gv-setbadge--s1 {
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
}
.gv-setbadge--s2 {
  color: #0a1828;
  background: linear-gradient(#7fb0e0, #4f88c8);
}
.gv-slot--dim,
.gv-group--dim {
  opacity: 0.32;
}
.gv-group-set {
  display: inline-block;
  font-size: 9.5px;
  font-weight: 700;
  font-variant: small-caps;
  padding: 0 6px;
  border-radius: 2px;
  margin-bottom: 5px;
}
</style>
