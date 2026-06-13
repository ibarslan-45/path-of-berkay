<script setup lang="ts">
// PriceOverlay.vue — oyun-içi fiyat paneli (Faz 2). #price hash penceresinde mount edilir.
// AKIŞ: kullanıcı eşyaya gelir → KENDİ Ctrl+C'siyle kopyalar → global kısayola basar →
//   main panodaki metni gönderir → burada parse + Faz 1 fiyat motoru → panel.
// ToS: GİRDİ OTOMASYONU YOK (sentetik Ctrl+C yok). Yalnız pano okuma; hafıza yok.
// Overlay yalnız oyunun Windowed Fullscreen / Borderless modunda görünür.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { parseClipboard, isPriceableItem, type ParsedItem } from '../lib/clipboard-parse'
import { parsedToQueryItem, type QueryItem } from '../lib/trade-query'
import { estimateValue, openItemInTrade, priceErrMsg, type PriceEstimate } from '../lib/price-check'
import { ensureBuild, trackedBuild, gearSlots, slotItem, guessSlot } from '../lib/build-target'
import { compareMods, type CompareResult } from '../lib/build-compare'

const isTr = ref(true)
const tr = (a: string, b: string): string => (isTr.value ? a : b)

const status = ref<'idle' | 'invalid' | 'loading' | 'done' | 'error'>('idle')
const itemName = ref('')
const itemSub = ref('')
const rarity = ref('')
const result = ref<PriceEstimate | null>(null)
const errCode = ref('')
const lastQi = ref<QueryItem | null>(null)
const lastParsed = ref<ParsedItem | null>(null)
// Faz 4: stat filtreleri (eşleşen mod'lar)
const filterMods = computed(() => lastQi.value?.mods.filter((m) => m.matched) ?? [])
const activeFilterCount = computed(() => filterMods.value.filter((m) => m.enabled).length)

// --- Build karşılaştırma (Faz 3) ---
const compareSlot = ref<string>('')
const compareSlots = computed(() => (trackedBuild.value ? gearSlots(trackedBuild.value) : []))
const compareResult = computed<CompareResult | null>(() => {
  const b = trackedBuild.value
  const p = lastParsed.value
  if (!b || !p || !compareSlot.value) return null
  const tgt = slotItem(b, compareSlot.value)
  if (!tgt) return null
  const lines: string[] = []
  for (const m of p.implicits) lines.push(m.text)
  for (const m of p.explicits) lines.push(m.text)
  return compareMods(tgt.mods, lines)
})
function scoreClass(s: number): string {
  return s >= 85 ? 'po-cmp-ok' : s >= 55 ? 'po-cmp-close' : 'po-cmp-low'
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
  if (row.kind === 'missing') return 'po-cmp-tag--missing'
  if (row.kind === 'extra') return 'po-cmp-tag--extra'
  return 'po-cmp-tag--' + row.status // ok | close | low | na
}

let unsubCheck: (() => void) | null = null
let unsubSettings: (() => void) | null = null

async function handleClipboard(text: string): Promise<void> {
  const parsed = parseClipboard(text)
  if (!isPriceableItem(parsed)) {
    status.value = 'invalid'
    itemName.value = ''
    return
  }
  rarity.value = parsed!.rarity
  itemName.value = parsed!.name || parsed!.baseType
  itemSub.value = parsed!.name && parsed!.baseType && parsed!.name !== parsed!.baseType ? parsed!.baseType : ''
  lastParsed.value = parsed!
  // build varsa: eşyanın item-class/tabanına göre hedef slotu tahmin et
  if (trackedBuild.value) compareSlot.value = guessSlot(trackedBuild.value, parsed!.itemClass || parsed!.baseType)
  lastQi.value = parsedToQueryItem(parsed!)
  await runEstimate()
}

async function runEstimate(): Promise<void> {
  if (!lastQi.value) return
  status.value = 'loading'
  result.value = null
  errCode.value = ''
  const r = await estimateValue(lastQi.value)
  if (r.ok) {
    result.value = r
    status.value = 'done'
  } else {
    errCode.value = r.error
    result.value = r // usedStats/unmatched/count taşır
    status.value = 'error'
  }
}
// Part 3: stat ekle/çıkar VEYA min değer değişince CANLI yeniden sorgula (debounce; rate-limit kuyruğu
// main'de serileştirir, çökme yok). Hızlı değişikliklerde tek sorgu atılır.
let estTimer: ReturnType<typeof setTimeout> | null = null
function scheduleEstimate(): void {
  if (estTimer) clearTimeout(estTimer)
  estTimer = setTimeout(() => {
    estTimer = null
    void runEstimate()
  }, 650)
}

async function openTrade(): Promise<void> {
  if (lastQi.value) await openItemInTrade(lastQi.value)
}
function close(): void {
  window.api?.priceCheck?.close()
}

onMounted(async () => {
  const s = (await window.api?.settings?.get()) as { lang?: 'tr' | 'en' } | undefined
  if (s?.lang) isTr.value = s.lang === 'tr'
  unsubSettings =
    window.api?.settings?.onChanged((st) => {
      const l = (st as { lang?: 'tr' | 'en' }).lang
      if (l) isTr.value = l === 'tr'
    }) ?? null
  unsubCheck = window.api?.priceCheck?.onCheck((text: string) => handleClipboard(text)) ?? null
  ensureBuild()
})
onBeforeUnmount(() => {
  unsubCheck?.()
  unsubSettings?.()
  if (estTimer) clearTimeout(estTimer)
})
</script>

<template>
  <div class="po-root">
    <div class="po-frame">
      <!-- başlık (sürükleme tutamağı) -->
      <div class="po-head">
        <span class="po-head-icon">≈</span>
        <span class="po-head-title">{{ tr('Tahmini Değer', 'Estimated Value') }}</span>
        <button class="po-close" :title="tr('Kapat', 'Close')" @click="close">✕</button>
      </div>

      <!-- içerik -->
      <div class="po-body">
        <!-- başlangıç ipucu -->
        <div v-if="status === 'idle'" class="po-hint">
          {{ tr('Eşyaya gel → Ctrl+C → kısayol', 'Hover item → Ctrl+C → shortcut') }}
        </div>

        <!-- geçersiz pano -->
        <div v-else-if="status === 'invalid'" class="po-hint po-warn">
          ⚠ {{ tr('Panoda geçerli eşya yok', 'No valid item in clipboard') }}
          <div class="po-hint-sub">{{ tr('Eşyaya gelip Ctrl+C ile kopyala, sonra kısayola bas', 'Hover an item, Ctrl+C, then press the shortcut') }}</div>
        </div>

        <template v-else>
          <!-- eşya başlığı -->
          <div class="po-item" :class="'po-item--' + rarity.toLowerCase()">
            <div class="po-item-name">{{ itemName }}</div>
            <div v-if="itemSub" class="po-item-sub">{{ itemSub }}</div>
          </div>

          <!-- yükleniyor -->
          <div v-if="status === 'loading'" class="po-loading">⋯ {{ tr('Benzer ilanlar sorgulanıyor…', 'Checking similar listings…') }}</div>

          <!-- sonuç: EN YAKIN EŞYA (ortalama değil) -->
          <template v-else-if="status === 'done' && result">
            <div class="po-value">
              <span class="po-value-num">≈ {{ result.nearest }}</span>
              <span class="po-value-cur">{{ result.nearestCurrency }}</span>
            </div>
            <div class="po-value-range">
              {{ tr('en yakın eşya', 'nearest item') }}<span v-if="result.bandCount > 1"> · {{ result.bandLow }}–{{ result.bandHigh }} ({{ result.bandCount }})</span>
            </div>
            <div class="po-meta">
              {{ tr('en benzer', 'closest of') }} {{ result.sampled }} {{ tr('ilan', 'listings') }}<span v-if="result.count > result.sampled"> / {{ result.count }}</span>
              · {{ result.nearMatched }}/{{ result.nearTotal }} {{ tr('stat eşleşti', 'stats match') }}
              <span v-if="result.unmatched > 0" class="po-warn"> · {{ result.unmatched }} {{ tr('eşleşmedi', 'unmatched') }}</span>
            </div>
            <div v-if="result.method === 'cheapest'" class="po-note">ⓘ {{ tr('mod verisi yok — en ucuz benzer ilan', 'no mod data — cheapest similar listing') }}</div>
            <div v-else-if="result.usedStats === 0" class="po-note">⚠ {{ tr('Stat-id yok — kaba taban+ilvl aralığı', 'No stat-id — coarse base+ilvl range') }}</div>
          </template>

          <!-- hata -->
          <div v-else-if="status === 'error'" class="po-err">⚠ {{ priceErrMsg(errCode, isTr) }}</div>

          <!-- Part 3: stat ekle/çıkar + min değer → CANLI yeniden sorgula (değer anında güncellenir) -->
          <div v-if="filterMods.length" class="po-filters">
            <div class="po-filters-head">
              <span>{{ tr('Filtreler', 'Filters') }} {{ activeFilterCount }}/{{ filterMods.length }}</span>
              <span v-if="status === 'loading'" class="po-filters-live">⋯</span>
              <button class="po-refilter" :disabled="status === 'loading'" @click="runEstimate">↻ {{ tr('Yeniden', 'Re') }}</button>
            </div>
            <div v-for="(m, i) in filterMods" :key="i" class="po-filter" :class="{ 'po-filter--off': !m.enabled }">
              <input type="checkbox" v-model="m.enabled" @change="scheduleEstimate" />
              <span class="po-filter-text">{{ m.text }}</span>
              <input
                v-if="m.enabled && m.value !== null"
                type="number"
                class="po-filter-min"
                :value="m.value"
                :title="tr('min değer', 'min value')"
                @input="m.value = ($event.target as HTMLInputElement).valueAsNumber; scheduleEstimate()"
              />
            </div>
            <div class="po-filters-hint">{{ tr('stat ekle/çıkar veya min değiştir → değer anında güncellenir', 'toggle a stat or change min → value updates live') }}</div>
          </div>

          <!-- build karşılaştırma (build içe aktarılmışsa) -->
          <div v-if="trackedBuild && compareResult" class="po-cmp">
            <div class="po-cmp-head">
              <span>⚖ {{ tr('Build', 'Build') }}</span>
              <span class="po-cmp-score" :class="scoreClass(compareResult.score)">{{ compareResult.score }}%</span>
              <select v-model="compareSlot" class="po-cmp-sel">
                <option v-for="s in compareSlots" :key="s.slot" :value="s.slot">{{ s.slot }}</option>
              </select>
            </div>
            <ul class="po-cmp-rows">
              <li v-for="(row, i) in compareResult.rows" :key="i" class="po-cmp-row" :class="'po-cmp--' + row.status">
                <span class="po-cmp-tag" :class="tagClass(row)">{{ rowTag(row) }}</span>
                <!-- #4: stat/mod metni HER ZAMAN İngilizce kalır (oyun terimleri çevrilmez) -->
                <span class="po-cmp-text">{{ row.en }}</span>
                <span v-if="row.kind === 'match' && row.approachPct !== null" class="po-cmp-pct">{{ row.approachPct }}%</span>
              </li>
            </ul>
          </div>

          <button class="po-trade" @click="openTrade">{{ tr('Trade’de Aç ↗', 'Open in Trade ↗') }}</button>
        </template>
      </div>

      <div class="po-foot">{{ tr('yalnız pano · veri gitmez · oto-alım yok', 'clipboard only · no data sent · no auto-buy') }}</div>
    </div>
  </div>
</template>

<style scoped>
.po-root {
  width: 100vw;
  height: 100vh;
  margin: 0;
  background: transparent;
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: #d8cdb4;
  user-select: none;
}
.po-frame {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(201, 161, 74, 0.7);
  background: linear-gradient(180deg, rgba(28, 22, 12, 0.97), rgba(12, 10, 7, 0.97));
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 6px 20px rgba(0, 0, 0, 0.55);
}
.po-head {
  -webkit-app-region: drag; /* sürüklenebilir başlık */
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: linear-gradient(180deg, rgba(201, 161, 74, 0.22), rgba(201, 161, 74, 0.06));
  border-bottom: 1px solid rgba(201, 161, 74, 0.4);
  font-variant: small-caps;
  letter-spacing: 0.04em;
}
.po-head-icon {
  color: #e3c172;
  font-weight: 700;
}
.po-head-title {
  flex: 1;
  font-size: 12.5px;
  color: #e3c172;
}
.po-close {
  -webkit-app-region: no-drag;
  background: transparent;
  border: none;
  color: #c0a068;
  cursor: pointer;
  font-size: 12px;
  padding: 0 3px;
}
.po-close:hover {
  color: #f0d896;
}
.po-body {
  flex: 1;
  padding: 8px 10px;
  overflow-y: auto;
}
.po-hint {
  font-size: 11.5px;
  color: #b8a982;
  line-height: 1.4;
}
.po-hint-sub {
  font-size: 10px;
  color: #8c8060;
  margin-top: 3px;
}
.po-warn {
  color: #e0a44f;
}
.po-item {
  border-left: 2px solid #8a6f2e;
  padding-left: 7px;
  margin-bottom: 6px;
}
.po-item--rare {
  color: #f0e35a;
  border-left-color: #c8b13a;
}
.po-item--unique {
  color: #d2864a;
  border-left-color: #af6025;
}
.po-item--magic {
  color: #8aa0e8;
  border-left-color: #5a6ec8;
}
.po-item--normal {
  color: #d8cdb4;
}
.po-item-name {
  font-size: 13px;
  font-weight: 600;
}
.po-item-sub {
  font-size: 11px;
  opacity: 0.85;
}
.po-loading {
  font-size: 11.5px;
  color: #b8a982;
  padding: 4px 0;
}
.po-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}
.po-value-num {
  font-size: 22px;
  font-weight: 700;
  color: #f0d896;
}
.po-value-cur {
  font-size: 13px;
  color: #d4af5a;
}
.po-value-range {
  font-size: 11px;
  color: #b8a982;
  margin-top: 1px;
}
.po-meta {
  font-size: 10px;
  color: #8c8060;
  margin-top: 3px;
}
.po-note {
  font-size: 10px;
  color: #e0a44f;
  margin-top: 3px;
  line-height: 1.3;
}
.po-err {
  font-size: 11.5px;
  color: #e08a5a;
  margin: 3px 0;
}
.po-trade {
  -webkit-app-region: no-drag;
  margin-top: 8px;
  width: 100%;
  font: inherit;
  font-size: 11.5px;
  color: #e3c172;
  background: transparent;
  border: 1px solid rgba(201, 161, 74, 0.55);
  padding: 4px 0;
  cursor: pointer;
  border-radius: 2px;
}
.po-trade:hover {
  background: rgba(201, 161, 74, 0.12);
}
.po-foot {
  font-size: 9px;
  color: #6f654a;
  text-align: center;
  padding: 3px 6px 4px;
  border-top: 1px solid rgba(201, 161, 74, 0.18);
}
/* Faz 4: stat filtreleri */
.po-filters {
  margin-top: 7px;
  border-top: 1px solid rgba(201, 161, 74, 0.25);
  padding-top: 5px;
}
.po-filters-head {
  display: flex;
  align-items: center;
  font-size: 10px;
  color: #d4af5a;
  margin-bottom: 3px;
}
.po-refilter {
  margin-left: auto;
  font: inherit;
  font-size: 9.5px;
  color: #e3c172;
  background: transparent;
  border: 1px solid rgba(201, 161, 74, 0.5);
  border-radius: 2px;
  padding: 1px 6px;
  cursor: pointer;
}
.po-refilter:disabled {
  opacity: 0.5;
}
.po-filter {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: #cdc3aa;
  padding: 1px 0;
  cursor: pointer;
}
.po-filter--off {
  opacity: 0.45;
  text-decoration: line-through;
}
.po-filter input[type='checkbox'] {
  accent-color: #c9a14a;
  margin: 0;
}
.po-filter-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.po-filter-min {
  flex: none;
  width: 46px;
  font: inherit;
  font-size: 9.5px;
  color: #f0d896;
  background: #161310;
  border: 1px solid rgba(201, 161, 74, 0.4);
  border-radius: 2px;
  padding: 0 3px;
  text-align: right;
}
.po-filter-min::-webkit-inner-spin-button {
  opacity: 0.4;
}
.po-filters-live {
  color: #e3c172;
  font-size: 10px;
  margin-left: 4px;
}

/* build karşılaştırma (kompakt) */
.po-cmp {
  margin-top: 8px;
  border-top: 1px solid rgba(120, 144, 184, 0.3);
  padding-top: 6px;
}
.po-cmp-head {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: #9fb4d8;
  margin-bottom: 4px;
}
.po-cmp-sel {
  flex: 1;
  font: inherit;
  font-size: 10px;
  color: #cfe0ff;
  background: #161a22;
  border: 1px solid rgba(120, 144, 184, 0.45);
  border-radius: 2px;
  padding: 1px 3px;
}
.po-cmp-score {
  font-weight: 700;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
}
.po-cmp-score.po-cmp-ok {
  color: #1a2410;
  background: #7fcf6a;
}
.po-cmp-score.po-cmp-close {
  color: #2a2008;
  background: #e0c04f;
}
.po-cmp-score.po-cmp-low {
  color: #2a1010;
  background: #e07a5a;
}
.po-cmp-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.po-cmp-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  padding: 1px 3px;
  border-left: 2px solid transparent;
}
.po-cmp--ok {
  border-left-color: #7fcf6a;
}
.po-cmp--close {
  border-left-color: #e0c04f;
}
.po-cmp--low {
  border-left-color: #e07a5a;
}
.po-cmp--na {
  border-left-color: #666;
  opacity: 0.8;
}
.po-cmp-tag {
  font-size: 8px;
  font-weight: 700;
  padding: 0 3px;
  border-radius: 2px;
  flex: none;
}
.po-cmp-tag--ok {
  color: #1a2410;
  background: #7fcf6a;
}
.po-cmp-tag--close {
  color: #2a2008;
  background: #e0c04f;
}
.po-cmp-tag--low {
  color: #2a1010;
  background: #e07a5a;
}
.po-cmp-tag--na {
  color: #ddd;
  background: #555;
}
.po-cmp-tag--missing {
  color: #2a1010;
  background: #e07a5a;
}
.po-cmp-tag--extra {
  color: #ddd;
  background: #555;
}
.po-cmp-text {
  flex: 1;
  color: #cdc3aa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.po-cmp-pct {
  flex: none;
  color: #9fb4d8;
}
</style>
