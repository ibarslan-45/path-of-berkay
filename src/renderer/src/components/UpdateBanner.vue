<script setup lang="ts">
// UpdateBanner.vue — açılışta yeni sürüm bulunursa üstte bildirim (ADIM C).
// "Yeni sürüm vX.Y.Z mevcut" + NELER DEĞİŞTİ (release notes) + [Güncelle] [Sonra].
// [Güncelle] → indirme ilerlemesi → indince [Yeniden başlat & kur]. Portable/dev → gizli.
// Veri main update:status'tan; çökme yok (anahtar yok/feed yok → sessiz).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

interface UpdateState {
  status: string
  currentVersion: string
  newVersion: string | null
  notes: string[]
  progress: number
  lastCheck: number | null
  error: string
  portable: boolean
}
const props = defineProps<{ isTr: boolean }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

const state = ref<UpdateState | null>(null)
const dismissed = ref(false)
let unsub: (() => void) | null = null

onMounted(async () => {
  state.value = (await window.api?.update?.getState().catch(() => null)) as UpdateState | null
  unsub = window.api?.update?.onStatus((s) => {
    state.value = s as UpdateState
  }) ?? null
})
onBeforeUnmount(() => unsub?.())

// banner yalnız anlamlı durumlarda görünür (portable/dev/idle/not-available → gizli)
const show = computed(() => {
  if (dismissed.value || !state.value) return false
  return ['available', 'downloading', 'downloaded'].includes(state.value.status)
})
const st = computed(() => state.value?.status ?? 'idle')
function update(): void {
  window.api?.update?.download()
}
function install(): void {
  window.api?.update?.install()
}
function later(): void {
  dismissed.value = true
}
</script>

<template>
  <div v-if="show" class="ub">
    <div class="ub-main">
      <span class="ub-spark">⬆</span>
      <div class="ub-text">
        <div class="ub-title">
          <template v-if="st === 'downloaded'">{{ tr('Güncelleme indirildi', 'Update downloaded') }} · v{{ state!.newVersion }}</template>
          <template v-else-if="st === 'downloading'">{{ tr('İndiriliyor…', 'Downloading…') }} v{{ state!.newVersion }}</template>
          <template v-else>{{ tr('Yeni sürüm', 'New version') }} <b>v{{ state!.newVersion }}</b> {{ tr('mevcut', 'available') }}</template>
          <span class="ub-cur">({{ tr('mevcut', 'current') }} v{{ state!.currentVersion }})</span>
        </div>
        <!-- neler değişti -->
        <ul v-if="state!.notes.length && st !== 'downloading'" class="ub-notes">
          <li v-for="(n, i) in state!.notes.slice(0, 6)" :key="i">{{ n }}</li>
          <li v-if="state!.notes.length > 6" class="ub-more">+{{ state!.notes.length - 6 }} {{ tr('madde', 'more') }}</li>
        </ul>
        <div v-else-if="st === 'available'" class="ub-nonotes">{{ tr('Sürüm notu yok.', 'No release notes.') }}</div>
        <!-- ilerleme -->
        <div v-if="st === 'downloading'" class="ub-prog">
          <div class="ub-prog-bar" :style="{ width: state!.progress + '%' }"></div>
          <span class="ub-prog-pct">{{ state!.progress }}%</span>
        </div>
      </div>
    </div>
    <div class="ub-actions">
      <template v-if="st === 'available'">
        <button class="ub-btn ub-btn--primary" @click="update">{{ tr('Güncelle', 'Update') }}</button>
        <button class="ub-btn" @click="later">{{ tr('Sonra', 'Later') }}</button>
      </template>
      <template v-else-if="st === 'downloaded'">
        <button class="ub-btn ub-btn--primary" @click="install">{{ tr('Yeniden başlat & kur', 'Restart & install') }}</button>
        <button class="ub-btn" @click="later">{{ tr('Sonra', 'Later') }}</button>
      </template>
      <span v-else-if="st === 'downloading'" class="ub-busy">⋯</span>
    </div>
  </div>
</template>

<style scoped>
.ub {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: linear-gradient(180deg, rgba(60, 46, 18, 0.96), rgba(40, 30, 12, 0.96));
  border-bottom: 1px solid rgba(216, 168, 87, 0.6);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
.ub-main {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
}
.ub-spark {
  color: #ecc24a;
  font-size: 16px;
  flex: none;
  margin-top: 1px;
}
.ub-title {
  font-size: 12.5px;
  color: #ecdcab;
}
.ub-title b {
  color: #ecc24a;
}
.ub-cur {
  color: #9b8a6a;
  font-size: 11px;
  margin-left: 6px;
}
.ub-notes {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 11.5px;
  color: #cabf9f;
  line-height: 1.45;
  max-height: 96px;
  overflow-y: auto;
}
.ub-more {
  color: #9b8a6a;
  list-style: none;
}
.ub-nonotes {
  font-size: 11px;
  color: #9b8a6a;
  margin-top: 3px;
}
.ub-prog {
  position: relative;
  margin-top: 6px;
  height: 10px;
  width: 260px;
  max-width: 50vw;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(216, 168, 87, 0.4);
  border-radius: 5px;
  overflow: hidden;
}
.ub-prog-bar {
  height: 100%;
  background: linear-gradient(90deg, #c89446, #e8c074);
  transition: width 0.2s;
}
.ub-prog-pct {
  position: absolute;
  inset: 0;
  text-align: center;
  font-size: 9px;
  line-height: 10px;
  color: #1a1408;
  font-weight: 600;
}
.ub-actions {
  display: flex;
  gap: 7px;
  align-items: center;
  flex: none;
}
.ub-btn {
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 4px;
  cursor: pointer;
  color: #d8c9a8;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(160, 130, 70, 0.5);
  white-space: nowrap;
}
.ub-btn:hover {
  border-color: rgba(216, 168, 87, 0.85);
}
.ub-btn--primary {
  color: #2a1f08;
  background: linear-gradient(#e8c074, #cf9a46);
  border-color: #9a7330;
  font-weight: 600;
}
.ub-busy {
  color: #ecc24a;
}
</style>
