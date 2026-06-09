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
  window.api?.build?.progressSet?.(progress.value)
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
// item için ikon: (1) bundled taban ikonu; (2) uzak iconUrl (cache); (3) yok → placeholder
function itemIcon(item: PobItem | null): string | null {
  if (!item) return null
  const b = bundledIconById.value.get(item.id)
  if (b) return b
  if (item.iconUrl) return remoteIcons.value[item.iconUrl] ?? null
  return null
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
    itemClass: mi?.itemClass ?? null,
    rarity: item.rarity,
    mods: item.mods,
    itemLevel: item.itemLevel
  })
  emit('craft')
}
// #2: seçili AŞAMANIN gear'ı. stageSlots verilmişse (Mobalytics: variant başına gear) onu kullan,
// yoksa tek `slots` (PoB/.build/Maxroll). stageIdx'e bağlı → variant değişince gear da yenilenir.
const activeSlots = computed<Record<string, string>>(
  () => props.raw.stageSlots?.[stageIdx.value] ?? props.raw.slots ?? {}
)
const gearCells = computed<GearCell[]>(() => {
  const slots = activeSlots.value
  return GEAR_SLOTS.map((g) => {
    const id = slots[g.slot]
    return { slot: g.slot, label: props.isTr ? g.tr : g.en, item: id ? itemById.value.get(id) ?? null : null }
  })
})
// kanonik dışı slotlar (Charm/Jewel/Flask vb.) — varsa ayrı göster
const extraCells = computed<GearCell[]>(() => {
  const slots = activeSlots.value
  const known = new Set(GEAR_SLOTS.map((g) => g.slot))
  const out: GearCell[] = []
  for (const [slotName, id] of Object.entries(slots)) {
    if (known.has(slotName)) continue
    out.push({ slot: slotName, label: slotName, item: itemById.value.get(id) ?? null })
  }
  return out
})
// bir gear hücresinin slot + mod id'leri (işaretleme)
function cellSlotId(c: GearCell): string {
  return slotProgressId(sig.value, c.slot)
}
function cellModIds(c: GearCell): string[] {
  if (!c.item) return []
  return c.item.mods.map((m, i) => modProgressId(sig.value, c.slot, i, m))
}
// slot başlığını işaretle → o slotun TÜM modlarını da işaretle/kaldır
function toggleSlot(c: GearCell): void {
  const want = !isDone(cellSlotId(c))
  setManyDone([cellSlotId(c), ...cellModIds(c)], want)
}
// bundled ikonu olmayan ama uzak iconUrl taşıyan eşyalar için CDN ikonlarını önceden çek
watch(
  [gearCells, extraCells],
  () => {
    for (const c of [...gearCells.value, ...extraCells.value]) {
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
  actives: GemView[]
  supports: GemView[]
}
const gemGroups = computed<GemGroup[]>(() => {
  const groups = stage.value?.groups ?? []
  return groups
    .map((grp) => ({
      label: grp.label || '',
      actives: grp.gems.filter((g) => !g.support && g.nameSpec).map((g) => ({ name: g.nameSpec, level: g.level, icon: gemIcon(g.nameSpec) })),
      supports: grp.gems.filter((g) => g.support && g.nameSpec).map((g) => ({ name: g.nameSpec, level: g.level, icon: gemIcon(g.nameSpec) }))
    }))
    .filter((g) => g.actives.length || g.supports.length)
})
// gem işaretleme id'si (ad + aktif/support)
function gemDoneId(name: string, support: boolean): string {
  return gemProgressId(sig.value, name, support)
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
const showTree = ref(true) // varsayılan açık (aşama değişimi görsel olarak görünsün)

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

// --- Part 4: silah seti (weapon set 1/2) ayrımı (yalnız VARSA) ---
const setNodes = computed<{ set1: number[]; set2: number[] } | null>(() => {
  const s = stageSpec.value as { set1Nodes?: number[]; set2Nodes?: number[] } | null
  if (!s || !s.set1Nodes || !s.set2Nodes) return null
  if (!s.set1Nodes.length && !s.set2Nodes.length) return null
  return { set1: s.set1Nodes, set2: s.set2Nodes }
})
const hasWeaponSets = computed(() => !!setNodes.value)
// ağaçta hangi set vurgulanacak ('all' → aşama-eklenen amber; 'set1'/'set2' → o setin node'ları)
const setFilter = ref<'all' | 'set1' | 'set2'>('all')
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
  for (const c of [...gearCells.value, ...extraCells.value]) {
    if (!c.item) continue
    add(cellSlotId(c))
    for (const mid of cellModIds(c)) add(mid)
  }
  for (const grp of gemGroups.value) {
    for (const a of grp.actives) add(gemDoneId(a.name, false))
    for (const s of grp.supports) add(gemDoneId(s.name, true))
  }
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

    <div class="gv-cols">
      <!-- SOL: GEAR paper-doll -->
      <section class="gv-gear panel-frame">
        <div class="gv-sec-head">⚔ {{ tr('Ekipman', 'Equipment') }}</div>
        <div class="gv-gear-grid">
          <div v-for="(c, i) in gearCells" :key="i" class="gv-slot" :class="[itemRarityClass(c.item), { 'gv-slot--empty': !c.item, 'gv-slot--done': c.item && isDone(cellSlotId(c)) }]">
            <div class="gv-slot-head">
              <button
                v-if="c.item"
                class="gv-chk"
                :class="{ 'gv-chk--on': isDone(cellSlotId(c)) }"
                :title="tr('Bu eşyayı elde ettim', 'I obtained this item')"
                @click="toggleSlot(c)"
              >✓</button>
              <img v-if="itemIcon(c.item)" :src="itemIcon(c.item)!" class="gv-slot-icon" alt="" />
              <span v-else class="gv-slot-icon gv-slot-icon--ph">◇</span>
              <span class="gv-slot-label">{{ c.label }}</span>
              <button
                v-if="c.item"
                class="gv-craftbtn"
                :title="tr('Bu eşyayı Craft Simülatörü’ne gönder (hedef olarak)', 'Send this item to the Craft Simulator (as target)')"
                @click="craftItem(c.item)"
              >⚒ {{ tr('Craft’la', 'Craft') }}</button>
            </div>
            <template v-if="c.item">
              <div class="gv-item-name">{{ c.item.name || c.item.base }}</div>
              <div v-if="c.item.base && c.item.base !== c.item.name" class="gv-item-base">{{ c.item.base }}</div>
              <ul v-if="c.item.mods.length" class="gv-item-mods gv-item-mods--check">
                <li
                  v-for="(m, j) in c.item.mods"
                  :key="j"
                  class="gv-modline"
                  :class="{ 'gv-modline--done': isDone(modProgressId(sig, c.slot, j, m)) }"
                  @click="toggleDone(modProgressId(sig, c.slot, j, m))"
                >
                  <span class="gv-chk gv-chk--sm" :class="{ 'gv-chk--on': isDone(modProgressId(sig, c.slot, j, m)) }">✓</span>
                  <span class="gv-modtext">{{ m }}</span>
                </li>
              </ul>
              <div v-else class="gv-item-nomods">{{ tr('— mod verisi yok (doğrulanmalı)', '— no mod data (verify)') }}</div>
            </template>
            <div v-else class="gv-slot-empty">{{ tr('boş', 'empty') }}</div>
          </div>
        </div>
        <!-- charm / jewel / flask -->
        <template v-if="extraCells.length">
          <div class="gv-sec-sub">{{ tr('Diğer (Charm / Jewel / Flask)', 'Other (Charm / Jewel / Flask)') }}</div>
          <div class="gv-gear-grid">
            <div v-for="(c, i) in extraCells" :key="'x' + i" class="gv-slot gv-slot--sm" :class="itemRarityClass(c.item)">
              <div class="gv-slot-head"><span class="gv-slot-label">{{ c.label }}</span></div>
              <div v-if="c.item" class="gv-item-name">{{ c.item.name || c.item.base }}</div>
            </div>
          </div>
        </template>
      </section>

      <!-- SAĞ: GEM socket grupları -->
      <section class="gv-gems panel-frame">
        <div class="gv-sec-head">✦ {{ tr('Yetenek Taşları (Socket Grupları)', 'Skill Gems (Socket Groups)') }}</div>
        <div v-if="!gemGroups.length" class="gv-empty">{{ tr('Bu aşamada gem verisi yok', 'No gem data for this stage') }}</div>
        <div v-for="(grp, i) in gemGroups" :key="i" class="gv-group">
          <div
            v-for="(a, j) in grp.actives"
            :key="'a' + j"
            class="gv-active gv-gemrow"
            :class="{ 'gv-gemrow--done': isDone(gemDoneId(a.name, false)) }"
            @click="toggleDone(gemDoneId(a.name, false))"
          >
            <span class="gv-chk gv-chk--sm" :class="{ 'gv-chk--on': isDone(gemDoneId(a.name, false)) }">✓</span>
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
              :class="{ 'gv-gemrow--done': isDone(gemDoneId(s.name, true)) }"
              :title="s.name"
              @click="toggleDone(gemDoneId(s.name, true))"
            >
              <span class="gv-chk gv-chk--xs" :class="{ 'gv-chk--on': isDone(gemDoneId(s.name, true)) }">✓</span>
              <span class="gv-gemic gv-gemic--support">
                <img v-if="s.icon" :src="s.icon" alt="" />
                <span v-else class="gv-gemic-ph" :title="tr('görsel yok', 'no image')">◆</span>
              </span>
              {{ s.name }}
            </span>
          </div>
          <div v-if="!grp.actives.length && grp.supports.length" class="gv-group-note">{{ tr('(yalnız support — ana gem eşleşmedi)', '(supports only — no active gem)') }}</div>
        </div>

        <!-- pasif ağaç -->
        <div class="gv-sec-head" style="margin-top: 10px">
          ✤ {{ tr('Pasif Ağaç', 'Passive Tree') }}
          <span class="gv-treecount">{{ allocatedNodes.length }} {{ tr('node (bu aşamaya kadar)', 'nodes (through this stage)') }}</span>
          <span v-if="addedNodes.length && setFilter === 'all'" class="gv-treeadded">+{{ addedNodes.length }} {{ tr('bu aşamada', 'this stage') }}</span>
          <button class="gv-treebtn" @click="showTree = !showTree">{{ showTree ? tr('Gizle', 'Hide') : tr('Ağacı göster', 'Show tree') }}</button>
        </div>

        <!-- Part 4: silah seti (weapon set 1/2) ayrımı — yalnız VARSA -->
        <div v-if="hasWeaponSets && setNodes" class="gv-wset">
          <span class="gv-wset-lbl">{{ tr('Silah Seti', 'Weapon Set') }}:</span>
          <button class="gv-wset-btn" :class="{ 'gv-wset-btn--on': setFilter === 'all' }" @click="setFilter = 'all'">{{ tr('Tümü', 'All') }}</button>
          <button class="gv-wset-btn gv-wset-btn--s1" :class="{ 'gv-wset-btn--on': setFilter === 'set1' }" @click="setFilter = 'set1'">Set 1 · {{ setNodes.set1.length }}</button>
          <button class="gv-wset-btn gv-wset-btn--s2" :class="{ 'gv-wset-btn--on': setFilter === 'set2' }" @click="setFilter = 'set2'">Set 2 · {{ setNodes.set2.length }}</button>
          <span class="gv-wset-note">{{ tr('Bu aşamada sete özel pasifler', 'Set-specific passives this stage') }}</span>
        </div>

        <PassiveTreeCanvas
          v-if="showTree"
          class="gv-treehost"
          :passives-by-id="passivesById"
          :is-tr="isTr"
          :allocated="allocatedNodes"
          :highlight="treeHighlight"
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
.gv-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
.gv-gear,
.gv-gems {
  padding: 9px 11px;
  overflow-y: auto;
  min-height: 0;
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
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.gv-slot {
  border: 1px solid rgba(184, 154, 102, 0.25);
  background: rgba(0, 0, 0, 0.22);
  border-left-width: 3px;
  padding: 9px 11px;
  border-radius: 3px;
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
/* gem grupları */
.gv-group {
  border: 1px solid rgba(122, 211, 197, 0.28);
  background: rgba(122, 211, 197, 0.05);
  padding: 8px 11px;
  margin-bottom: 9px;
  border-radius: 3px;
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
  margin-left: auto;
  font: inherit;
  font-size: 10.5px;
  font-variant: small-caps;
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border: 1px solid #9a7330;
  border-radius: 2px;
  padding: 1px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.gv-craftbtn:hover {
  background: linear-gradient(#ecc279, #d6a052);
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
</style>
