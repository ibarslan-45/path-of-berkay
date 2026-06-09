<script setup lang="ts">
// DangerOverlay.vue — oyun-içi endgame tehlike paneli (Faz 8). #danger hash penceresinde.
// AKIŞ: kullanıcı waystone/mekanik üstünde KENDİ Ctrl+C'siyle kopyalar → global kısayola basar →
//   main panodaki metni gönderir → burada parse + danger-check (takip edilen build'e göre) → kart.
// ToS: GİRDİ OTOMASYONU YOK (sentetik Ctrl+C yok). Yalnız pano okuma; hafıza yok. showInactive.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { parseClipboard } from '../lib/clipboard-parse'
import { ensureBuild, trackedBuild } from '../lib/build-target'
import { checkWaystone, type DangerResult } from '../lib/danger-check'
import DangerCard from './DangerCard.vue'

const isTr = ref(true)
const tr = (a: string, b: string): string => (isTr.value ? a : b)

const status = ref<'idle' | 'invalid' | 'done'>('idle')
const result = ref<DangerResult | null>(null)
const title = ref('')
const subtitle = ref('')
const noBuild = ref(false)

let unsubCheck: (() => void) | null = null
let unsubSettings: (() => void) | null = null

function handleClipboard(text: string): void {
  const parsed = parseClipboard(text)
  const modLines = parsed ? [...parsed.implicits, ...parsed.explicits].map((m) => m.text) : []
  const isWaystoneLike =
    parsed &&
    (/waystone|map|tablet/i.test(parsed.itemClass) || modLines.length > 0)
  if (!parsed || !isWaystoneLike) {
    status.value = 'invalid'
    result.value = null
    return
  }
  // başlık + tier (ham metinden)
  title.value = parsed.name || parsed.baseType || tr('Waystone', 'Waystone')
  const tierM = parsed.raw.match(/Waystone\s+Tier:\s*(\d+)/i)
  const lvlM = parsed.raw.match(/(?:Area|Map)\s+Level:\s*(\d+)/i)
  const bits: string[] = []
  if (tierM) bits.push(tr('Tier ', 'Tier ') + tierM[1])
  if (lvlM) bits.push(tr('Alan sv. ', 'Area lvl ') + lvlM[1])
  subtitle.value = bits.join(' · ')

  const build = trackedBuild.value
  noBuild.value = !build
  result.value = checkWaystone(modLines, build)
  status.value = 'done'
}

function close(): void {
  window.api?.dangerCheck?.close()
}

onMounted(async () => {
  const s = (await window.api?.settings?.get()) as { lang?: 'tr' | 'en' } | undefined
  if (s?.lang) isTr.value = s.lang === 'tr'
  unsubSettings =
    window.api?.settings?.onChanged((st) => {
      const l = (st as { lang?: 'tr' | 'en' }).lang
      if (l) isTr.value = l === 'tr'
    }) ?? null
  unsubCheck = window.api?.dangerCheck?.onCheck((text: string) => handleClipboard(text)) ?? null
  await ensureBuild()
})
onBeforeUnmount(() => {
  unsubCheck?.()
  unsubSettings?.()
})
</script>

<template>
  <div class="dg-root">
    <div class="dg-frame">
      <div class="dg-head">
        <span class="dg-head-icon">⚔</span>
        <span class="dg-head-title">{{ tr('Tehlike Kontrolü', 'Danger Check') }}</span>
        <button class="dg-close" :title="tr('Kapat', 'Close')" @click="close">✕</button>
      </div>

      <div class="dg-body">
        <div v-if="status === 'idle'" class="dg-hint">
          {{ tr('Waystone\'a gel → Ctrl+C → kısayol', 'Hover waystone → Ctrl+C → shortcut') }}
        </div>

        <div v-else-if="status === 'invalid'" class="dg-hint dg-warn">
          ⚠ {{ tr('Panoda geçerli waystone yok', 'No valid waystone in clipboard') }}
          <div class="dg-hint-sub">{{ tr('Waystone/mekanik üstüne gelip Ctrl+C ile kopyala, sonra kısayola bas', 'Hover a waystone/mechanic, Ctrl+C, then press the shortcut') }}</div>
        </div>

        <template v-else>
          <div v-if="noBuild" class="dg-nobuild">
            ⚠ {{ tr('Build seçili değil — Build sekmesinden bir build içe aktar (analiz kaba kalır).', 'No build selected — import one in the Build tab (analysis stays coarse).') }}
          </div>
          <DangerCard :result="result" :is-tr="isTr" :title="title" :subtitle="subtitle" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dg-root {
  width: 100vw;
  height: 100vh;
  padding: 0;
  background: transparent;
  user-select: none;
}
.dg-frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(160deg, rgba(24, 18, 10, 0.97), rgba(14, 10, 6, 0.97));
  border: 1px solid #6b5128;
  border-radius: 6px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 6px 24px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.dg-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  background: linear-gradient(#2a2010, #1c1509);
  border-bottom: 1px solid #6b5128;
  -webkit-app-region: drag;
}
.dg-head-icon {
  color: #e0b46a;
  font-size: 14px;
}
.dg-head-title {
  flex: 1;
  color: #e7d4a6;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 13px;
}
.dg-close {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: #b09060;
  cursor: pointer;
  font-size: 13px;
  padding: 0 3px;
}
.dg-close:hover {
  color: #ff6b6b;
}
.dg-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 11px 12px;
}
.dg-hint {
  color: #9a8d70;
  font-size: 12px;
  text-align: center;
  padding: 18px 8px;
}
.dg-hint-sub {
  font-size: 10.5px;
  color: #7d7256;
  margin-top: 5px;
}
.dg-warn {
  color: #e0a060;
}
.dg-nobuild {
  font-size: 11px;
  color: #e0a060;
  background: rgba(200, 140, 60, 0.1);
  border: 1px solid rgba(200, 140, 60, 0.35);
  border-radius: 3px;
  padding: 5px 8px;
  margin-bottom: 9px;
  line-height: 1.4;
}
/* temalı scrollbar */
.dg-body::-webkit-scrollbar {
  width: 8px;
}
.dg-body::-webkit-scrollbar-thumb {
  background: #5a461f;
  border-radius: 4px;
}
.dg-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
}
</style>
