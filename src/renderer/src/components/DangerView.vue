<script setup lang="ts">
// DangerView.vue — uygulama-içi tehlike kontrolü sekmesi (Faz 8).
// Kullanıcı bir waystone/map metnini yapıştırır → takip edilen build'e göre tehlike analizi.
// Overlay (#danger) ile AYNI motoru (danger-check) ve kartı (DangerCard) kullanır.
import { ref, computed, onMounted } from 'vue'
import { parseClipboard } from '../lib/clipboard-parse'
import { ensureBuild, trackedBuild } from '../lib/build-target'
import { checkWaystone, type DangerResult } from '../lib/danger-check'
import DangerCard from './DangerCard.vue'

const props = defineProps<{ isTr: boolean }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

const text = ref('')
const result = ref<DangerResult | null>(null)
const title = ref('')
const subtitle = ref('')
const analyzed = ref(false)

const hasBuild = computed(() => !!trackedBuild.value)
const buildName = computed(() => {
  const b = trackedBuild.value
  if (!b) return ''
  return [b.ascendClassName, b.className].filter(Boolean).join(' · ') || b.className
})

function analyze(): void {
  const parsed = parseClipboard(text.value)
  const modLines = parsed ? [...parsed.implicits, ...parsed.explicits].map((m) => m.text) : []
  if (!parsed || modLines.length === 0) {
    result.value = null
    analyzed.value = true
    title.value = ''
    return
  }
  title.value = parsed.name || parsed.baseType || tr('Waystone', 'Waystone')
  const tierM = parsed.raw.match(/Waystone\s+Tier:\s*(\d+)/i)
  const lvlM = parsed.raw.match(/(?:Area|Map)\s+Level:\s*(\d+)/i)
  const bits: string[] = []
  if (tierM) bits.push('Tier ' + tierM[1])
  if (lvlM) bits.push(tr('Alan sv. ', 'Area lvl ') + lvlM[1])
  subtitle.value = bits.join(' · ')
  result.value = checkWaystone(modLines, trackedBuild.value)
  analyzed.value = true
}
function clearText(): void {
  text.value = ''
  result.value = null
  analyzed.value = false
}
// Panodan oku (kullanıcı oyunda waystone'a gelip Ctrl+C yapar → buraya tıklar). Yalnız pano okuma.
async function fromClipboard(): Promise<void> {
  let t = ''
  try {
    t = (await window.api?.clipboardRead?.()) ?? ''
  } catch {
    /* main pano okunamazsa navigator'a düş */
  }
  if (!t) {
    try {
      t = await navigator.clipboard.readText()
    } catch {
      /* erişim yoksa sessiz geç */
    }
  }
  if (t) {
    text.value = t
    analyze()
  }
}

onMounted(() => {
  ensureBuild()
})
</script>

<template>
  <div class="dv">
    <div class="dv-intro panel-frame">
      <div class="dv-intro-head">⚔ {{ tr('Endgame Tehlike Kontrolü', 'Endgame Danger Check') }}</div>
      <div class="dv-intro-note">
        {{ tr('Bir waystone/map metnini (oyunda Ctrl+C) aşağıya yapıştır → takip ettiğin build\'in defansına göre tehlike analizi. Oyun-içi için: Ayarlar\'daki kısayol (varsayılan Ctrl+E) ile overlay. Yalnız pano; oyun/ağ/hafıza etkileşimi YOK.', 'Paste a waystone/map text (Ctrl+C in game) below → danger analysis vs your tracked build\'s defenses. In-game: the shortcut in Settings (default Ctrl+E) shows an overlay. Clipboard only; no game/network/memory interaction.') }}
      </div>
      <div class="dv-build" :class="hasBuild ? 'dv-build--ok' : 'dv-build--none'">
        <template v-if="hasBuild">✓ {{ tr('Takip edilen build', 'Tracked build') }}: <b>{{ buildName }}</b></template>
        <template v-else>⚠ {{ tr('Build seçili değil — Build sekmesinden bir build içe aktar (analiz kaba kalır).', 'No build selected — import one in the Build tab (analysis stays coarse).') }}</template>
      </div>
    </div>

    <div class="dv-input panel-frame">
      <textarea
        v-model="text"
        class="dv-text"
        spellcheck="false"
        :placeholder="tr('Waystone metnini buraya yapıştır (Item Class: Waystones … mod satırları)…', 'Paste waystone text here (Item Class: Waystones … mod lines)…')"
      ></textarea>
      <div class="dv-btns">
        <button class="dv-btn dv-btn--primary" @click="analyze">
          <svg class="dv-ico" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.2" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          {{ tr('Analiz et', 'Analyze') }}
        </button>
        <button class="dv-btn" @click="fromClipboard">
          <svg class="dv-ico" viewBox="0 0 16 16" fill="none"><rect x="3" y="2.5" width="10" height="12" rx="1.6" stroke="currentColor" stroke-width="1.3"/><rect x="5.5" y="1.2" width="5" height="2.6" rx="0.8" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 7h5M5.5 9.5h5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
          {{ tr('Panodan al', 'From clipboard') }}
        </button>
        <button class="dv-btn" @click="clearText">
          <svg class="dv-ico" viewBox="0 0 16 16" fill="none"><path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          {{ tr('Temizle', 'Clear') }}
        </button>
      </div>
    </div>

    <div v-if="analyzed" class="dv-result panel-frame">
      <DangerCard v-if="result" :result="result" :is-tr="isTr" :title="title" :subtitle="subtitle" />
      <div v-else class="dv-empty">
        ⚠ {{ tr('Geçerli waystone metni bulunamadı (mod satırı yok). Oyunda waystone\'a gelip Ctrl+C ile kopyala.', 'No valid waystone text found (no mod lines). Hover a waystone in game and Ctrl+C.') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.dv {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
}
.dv-intro,
.dv-input,
.dv-result {
  padding: 12px 14px;
}
.dv-intro-head {
  color: #e0b46a;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  font-size: 15px;
}
.dv-intro-note {
  color: var(--text-muted, #9a8d70);
  font-size: 12px;
  line-height: 1.5;
  margin: 5px 0 9px;
}
.dv-build {
  font-size: 12px;
  padding: 5px 9px;
  border-radius: 3px;
}
.dv-build--ok {
  color: #cfe8c4;
  background: rgba(127, 207, 106, 0.08);
  border: 1px solid rgba(127, 207, 106, 0.3);
}
.dv-build--none {
  color: #e0a060;
  background: rgba(200, 140, 60, 0.08);
  border: 1px solid rgba(200, 140, 60, 0.3);
}
.dv-text {
  width: 100%;
  min-height: 130px;
  resize: vertical;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid #4a3c1e;
  border-radius: 4px;
  color: #cdbf9f;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  padding: 8px 10px;
  box-sizing: border-box;
}
.dv-text:focus {
  outline: none;
  border-color: #8a6d35;
}
.dv-btns {
  display: flex;
  gap: 8px;
  margin-top: 9px;
}
.dv-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 5px 13px;
  border-radius: 3px;
  cursor: pointer;
  color: #c8bca0;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(160, 130, 70, 0.4);
  transition: border-color 0.12s, background 0.12s, transform 0.06s;
}
.dv-btn:hover {
  border-color: rgba(216, 168, 87, 0.7);
  background: rgba(40, 30, 12, 0.4);
}
.dv-btn:active {
  transform: translateY(1px);
}
.dv-ico {
  width: 14px;
  height: 14px;
  flex: none;
}
.dv-btn--primary {
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border-color: #9a7330;
  font-weight: 600;
}
.dv-empty {
  color: #e0a060;
  font-size: 12px;
  line-height: 1.5;
}
</style>
