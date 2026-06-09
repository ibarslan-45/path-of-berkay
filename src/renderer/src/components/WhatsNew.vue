<script setup lang="ts">
// WhatsNew.vue — "Neler değişti" ekranı. Güncelleme sonrası ilk açılışta o sürümün
// CHANGELOG notlarını gösterir (sürüm başına 1 kez; lastSeenVersion settings'te). Yardım/Hakkında'dan
// tekrar açılabilir. Markdown hafif render (changelog.ts renderMarkdownLite). Çökme yok.
import { computed } from 'vue'
import pobeLogo from '../../assets/pobe-logo.png'
import { notesForVersionMd, renderMarkdownLite } from '../lib/changelog'
import changelogMd from '../../../../CHANGELOG.md?raw'

const props = defineProps<{ isTr: boolean; version: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

// mevcut sürümün notları; yoksa en üstteki (ilk) sürüm gövdesi → render
const bodyHtml = computed<string>(() => {
  let md = notesForVersionMd(changelogMd, props.version)
  if (!md) {
    // sürüm CHANGELOG'da yoksa en üstteki girdiyi göster (yine de bir şey gösterelim)
    const m = changelogMd.split(/^##\s+/m)[1]
    md = m ? m.replace(/^.*\n/, '').split(/^##\s+/m)[0].trim() : ''
  }
  return md ? renderMarkdownLite(md) : ''
})
</script>

<template>
  <div class="wn-backdrop" @click.self="emit('close')">
    <div class="wn-modal">
      <div class="wn-head">
        <img :src="pobeLogo" class="wn-logo" alt="PoBe" />
        <div class="wn-head-text">
          <div class="wn-title">{{ tr('Neler Değişti', 'What’s New') }}</div>
          <div class="wn-sub">Path of Berkay <b>v{{ version }}</b></div>
        </div>
        <button class="wn-x" @click="emit('close')" :title="tr('Kapat', 'Close')">✕</button>
      </div>
      <div class="wn-body" v-if="bodyHtml" v-html="bodyHtml"></div>
      <div class="wn-body wn-empty" v-else>{{ tr('Bu sürüm için not bulunamadı.', 'No notes for this version.') }}</div>
      <div class="wn-foot">
        <button class="wn-btn wn-btn--primary" @click="emit('close')">{{ tr('Anladım', 'Got it') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wn-backdrop {
  position: fixed;
  inset: 0;
  z-index: 210;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wn-modal {
  width: 540px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, #1c150b, #110c06);
  border: 1px solid #7a5e2c;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 18px 60px rgba(0, 0, 0, 0.7);
}
.wn-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px 12px;
  border-bottom: 1px solid rgba(122, 94, 44, 0.45);
}
.wn-logo {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(200, 160, 80, 0.5);
  flex: none;
}
.wn-head-text {
  flex: 1;
}
.wn-title {
  font-size: 17px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #ecc24a;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.wn-sub {
  font-size: 12px;
  color: #b6a576;
}
.wn-sub b {
  color: #e6d2a8;
}
.wn-x {
  align-self: flex-start;
  background: none;
  border: none;
  color: #9a8a60;
  font-size: 15px;
  cursor: pointer;
}
.wn-x:hover {
  color: #e0664f;
}
.wn-body {
  padding: 14px 20px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.55;
  color: #cabf9f;
}
.wn-empty {
  color: #9a8a60;
  font-style: normal;
}
.wn-body :deep(h3) {
  font-size: 14px;
  color: #e7d4a6;
  font-variant: small-caps;
  letter-spacing: 0.02em;
  margin: 10px 0 5px;
}
.wn-body :deep(h4) {
  font-size: 12.5px;
  color: #d8b76a;
  margin: 8px 0 4px;
}
.wn-body :deep(b) {
  color: #ecc24a;
}
.wn-body :deep(ul) {
  margin: 4px 0 8px;
  padding-left: 18px;
}
.wn-body :deep(li) {
  margin: 3px 0;
}
.wn-body :deep(code) {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(122, 94, 44, 0.4);
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11.5px;
  color: #d8b888;
}
.wn-foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 10px 18px 14px;
  border-top: 1px solid rgba(122, 94, 44, 0.3);
}
.wn-btn {
  font-size: 12.5px;
  padding: 7px 18px;
  border-radius: 5px;
  cursor: pointer;
  color: #2a1f08;
  background: linear-gradient(#e8c074, #cf9a46);
  border: 1px solid #9a7330;
  font-weight: 600;
}
.wn-btn:hover {
  filter: brightness(1.07);
}
</style>
