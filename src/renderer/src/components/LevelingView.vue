<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import AreaCard from './AreaCard.vue'
import BuildLevelingChecklist from './BuildLevelingChecklist.vue'
import { ensureBuild } from '../lib/build-target'
import areasData from '../../../data/areas.json'

interface Area {
  id: string
  en: string
  tr: string
  act: string
  act_order: number
  area_level: number
  type: string
  has_waypoint: boolean | null
  quest_en: string
  quest_tr: string
  reward_en: string
  reward_tr: string
  boss_en: string[]
  boss_tr: string[]
  steps_en: string[]
  steps_tr: string[]
  area_image: string | null
  boss_images: string[]
  reward_icons: string[]
  source_facts: string | null
}

const props = defineProps<{ isTr: boolean }>()

const ACTS = ['1', '2', '3', '4']
const areas = ((areasData as { records?: Area[] }).records ?? (areasData as unknown as Area[]))

// Kanonik kampanya sırası: act içinde area_level artan (oyun ilerleyişine en yakın
// sağlam sinyal; Nehir Kıyısı lvl1 başta). Kasabalar kendi seviyesinde belirir.
function actSorted(act: string): Area[] {
  return areas
    .filter((a) => String(a.act) === act)
    .sort((a, b) => a.area_level - b.area_level || a.id.localeCompare(b.id))
}
const orderedByAct = computed(() => ACTS.map((act) => ({ act, zones: actSorted(act) })))
const flatOrder = computed(() => orderedByAct.value.flatMap((g) => g.zones))

// --- Leveling state (main process kaynak) ---
type LocKind = 'campaign' | 'town' | 'map' | 'hideout'
interface LvState {
  visited: string[]
  currentId: string | null
  location: { kind: LocKind; name: string } | null
}
const visited = ref<Set<string>>(new Set())
const currentId = ref<string | null>(null)
const location = ref<{ kind: LocKind; name: string } | null>(null)
const expandedId = ref<string | null>(null)
let unsub: (() => void) | null = null

function applyState(s: LvState): void {
  visited.value = new Set(s.visited)
  currentId.value = s.currentId
  location.value = s.location ?? null
}
onMounted(async () => {
  void ensureBuild() // takip edilen build'i (Bug #1 kalıcı snapshot) yükle → checklist görünsün
  const api = window.api?.leveling
  if (api) {
    applyState(await api.get())
    unsub = api.onState(applyState)
  }
})
onBeforeUnmount(() => unsub?.())

function statusOf(a: Area): 'done' | 'current' | 'upcoming' {
  if (a.id === currentId.value) return 'current'
  if (visited.value.has(a.id)) return 'done'
  return 'upcoming'
}

// Kampanya-dışı konum notu (kasaba/hideout/harita) — ilerleme sabit, sadece bilgi
const offNote = computed<string | null>(() => {
  const l = location.value
  if (!l || l.kind === 'campaign') return null
  const isTrV = props.isTr
  if (l.kind === 'town') return (isTrV ? 'Kasaba: ' : 'Town: ') + l.name
  if (l.kind === 'hideout') return isTrV ? "Hideout'tasın" : 'In Hideout'
  return (isTrV ? 'Harita/Bölge: ' : 'Map/Area: ') + l.name
})

const doneCount = computed(() => flatOrder.value.filter((a) => visited.value.has(a.id)).length)
const totalCount = computed(() => flatOrder.value.length)
const currentArea = computed(() => flatOrder.value.find((a) => a.id === currentId.value) ?? null)
const nextArea = computed(() => flatOrder.value.find((a) => !visited.value.has(a.id)) ?? null)

// --- Aksiyonlar ---
function toggle(a: Area): void {
  window.api?.leveling.toggle(a.id)
}
function expand(a: Area): void {
  expandedId.value = expandedId.value === a.id ? null : a.id
}
function simEnterNext(): void {
  if (nextArea.value) window.api?.leveling.enter(nextArea.value.id)
}
const jumpId = ref<string>('')
function simJump(): void {
  if (jumpId.value) window.api?.leveling.enter(jumpId.value)
}
function resetAll(): void {
  window.api?.leveling.reset()
}
// ATLA: current bölgeyi atla, sıradaki kanonik bölgeye geç (log gelince yine senkron)
function skipCurrent(): void {
  const list = flatOrder.value
  const i = currentArea.value ? list.indexOf(currentArea.value) : -1
  const next = list[i + 1]
  if (next) window.api?.leveling.setCurrent(next.id)
}

// Auto-scroll: current değişince o kartı listenin ortasına yumuşak kaydır.
// (scrollIntoView yerine manuel hesap — kapsayıcı .lv-list içinde güvenilir çalışır)
const listEl = ref<HTMLElement | null>(null)
function scrollToCurrent(): void {
  const list = listEl.value
  if (!list) return
  const el = list.querySelector('[data-current="1"]') as HTMLElement | null
  if (!el) return
  const target = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2
  list.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}
watch(currentId, async () => {
  await nextTick()
  scrollToCurrent()
})
</script>

<template>
  <div class="lv-wrap">
    <!-- Üst kontrol/durum çubuğu -->
    <div class="lv-bar">
      <div class="lv-progress">
        <span class="lv-pcount">{{ doneCount }} / {{ totalCount }}</span>
        <span class="lv-plabel">{{ isTr ? 'bölge tamamlandı' : 'zones done' }}</span>
        <span v-if="currentArea" class="lv-cur">
          · {{ isTr ? 'Konum' : 'Location' }}:
          <b>{{ currentArea.en }}</b>
        </span>
        <span v-if="nextArea" class="lv-next">
          · {{ isTr ? 'Sıradaki' : 'Next' }}:
          {{ nextArea.en }}
        </span>
        <span v-if="offNote" class="lv-offnote">{{ offNote }}</span>
      </div>
      <div class="lv-actions">
        <!-- ATLA: current'ı atla, sıradakine geç -->
        <button class="lv-btn" :disabled="!currentArea" @click="skipCurrent">
          {{ isTr ? 'Atla ⏭' : 'Skip ⏭' }}
        </button>
        <!-- SİMÜLASYON (oyun olmadan test) -->
        <span class="lv-sim">{{ isTr ? 'Sim' : 'Sim' }}:</span>
        <button class="lv-btn" :disabled="!nextArea" @click="simEnterNext">
          {{ isTr ? 'Sıradakine gir' : 'Enter next' }}
        </button>
        <select v-model="jumpId" class="lv-select" @change="simJump">
          <option value="">{{ isTr ? 'Bölgeye atla…' : 'Jump to zone…' }}</option>
          <optgroup v-for="g in orderedByAct" :key="g.act" :label="'Act ' + g.act">
            <option v-for="z in g.zones" :key="z.id" :value="z.id">{{ z.en }}</option>
          </optgroup>
        </select>
        <button class="lv-btn lv-btn--warn" @click="resetAll">
          {{ isTr ? 'Sıfırla' : 'Reset' }}
        </button>
      </div>
    </div>

    <!-- Build'e özel leveling/görev kontrol listesi (Bug #3) — takip edilen build varsa -->
    <BuildLevelingChecklist :is-tr="isTr" />

    <!-- Timeline -->
    <div ref="listEl" class="lv-list">
      <template v-for="g in orderedByAct" :key="g.act">
        <div class="lv-acthead">Act {{ g.act }}</div>
        <div
          v-for="(z, zi) in g.zones"
          :key="z.id"
          :data-current="z.id === currentId ? '1' : '0'"
        >
          <AreaCard
            :area="z"
            :is-tr="isTr"
            :status="statusOf(z)"
            :expanded="expandedId === z.id"
            :index="zi + 1"
            @toggle="toggle(z)"
            @expand="expand(z)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lv-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.lv-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: linear-gradient(rgba(42, 36, 23, 0.55), rgba(26, 22, 16, 0.6));
  border: 1px solid var(--frame-brown, #4a3d28);
}
.lv-progress {
  font-size: 13px;
  color: var(--text-default);
}
.lv-pcount {
  font-variant: small-caps;
  font-size: 16px;
  color: var(--gem-teal);
  font-weight: 600;
}
.lv-plabel {
  color: var(--text-muted);
  margin-left: 4px;
  font-variant: small-caps;
}
.lv-cur b {
  color: var(--gem-teal);
}
.lv-next {
  color: var(--text-muted);
}
.lv-offnote {
  margin-left: 8px;
  font-size: 11px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #0a1614;
  background: var(--gold-ornament, #c8aa6e);
  padding: 2px 8px;
  border-radius: 2px;
}
.lv-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.lv-sim {
  font-size: 11px;
  font-variant: small-caps;
  color: var(--gold-ornament);
}
.lv-btn {
  font-family: var(--font-serif);
  font-size: 11.5px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: var(--gold-title);
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 4px 10px;
  cursor: pointer;
}
.lv-btn:hover:not(:disabled) {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
.lv-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.lv-btn--warn {
  color: #d6a07a;
}
.lv-select {
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--gold-title);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 4px 6px;
  cursor: pointer;
  max-width: 200px;
}
.lv-select option,
.lv-select optgroup {
  background: #14110b;
  color: var(--text-default);
}
.lv-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  position: relative;
}
.lv-acthead {
  font-family: var(--font-serif);
  font-variant: small-caps;
  letter-spacing: 0.08em;
  font-size: 13px;
  color: var(--gold-ornament);
  margin: 12px 0 6px;
  padding-bottom: 3px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.2);
}
.lv-acthead:first-child {
  margin-top: 0;
}
</style>
