<script setup lang="ts">
// DangerCard.vue — tehlike sonucunu (DangerResult) ornate temada gösterir.
// Hem overlay (#danger) hem uygulama-içi (DangerView) tarafından kullanılır. İki dilli.
import { computed } from 'vue'
import type { DangerResult } from '../lib/danger-check'

const props = defineProps<{
  result: DangerResult | null
  isTr: boolean
  title?: string // waystone adı / tabanı
  subtitle?: string // tier / area level vb.
}>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

const levelLabel = computed(() => {
  const l = props.result?.level
  if (l === 'danger') return tr('TEHLİKELİ', 'DANGEROUS')
  if (l === 'caution') return tr('DİKKAT', 'CAUTION')
  return tr('GÜVENLİ', 'SAFE')
})
const sevLabel = (s: string): string =>
  s === 'danger' ? tr('TEHLİKE', 'DANGER') : s === 'caution' ? tr('DİKKAT', 'CAUTION') : tr('BİLGİ', 'INFO')
</script>

<template>
  <div class="dc" :class="result ? 'dc--' + result.level : 'dc--none'">
    <div v-if="title" class="dc-name">
      {{ title }}<span v-if="subtitle" class="dc-sub"> · {{ subtitle }}</span>
    </div>

    <div class="dc-verdict" :class="result ? 'dc-verdict--' + result.level : ''">
      <span class="dc-verdict-icon">{{ result?.level === 'danger' ? '⚠' : result?.level === 'caution' ? '◆' : '✓' }}</span>
      {{ levelLabel }}
    </div>

    <!-- mod-başına gerekçe -->
    <ul v-if="result && result.findings.length" class="dc-findings">
      <li v-for="(f, i) in result.findings" :key="i" class="dc-finding" :class="'dc-finding--' + f.severity">
        <div class="dc-finding-mod">
          <span class="dc-finding-sev" :class="'dc-sev--' + f.severity">{{ sevLabel(f.severity) }}</span>
          {{ f.mod }}
        </div>
        <div class="dc-finding-reason">{{ isTr ? f.tr : f.en }}</div>
      </li>
    </ul>
    <div v-else-if="result && result.modCount > 0" class="dc-clean">
      {{ tr('Bu waystone\'da build\'in için belirgin tehlikeli mod yok.', 'No notably dangerous mods for your build on this waystone.') }}
    </div>
    <div v-else-if="result" class="dc-clean">
      {{ tr('Mod bulunamadı (boş veya magic-altı waystone).', 'No mods found (empty or sub-magic waystone).') }}
    </div>

    <!-- nelere dikkat et -->
    <div v-if="result && result.advice.length" class="dc-advice">
      <div class="dc-advice-head">{{ tr('Nelere dikkat et', 'What to watch for') }}</div>
      <ul>
        <li v-for="(a, i) in result.advice" :key="i">{{ isTr ? a.tr : a.en }}</li>
      </ul>
    </div>

    <!-- notlar (veri yok / doğrulanmalı) -->
    <ul v-if="result && result.notes.length" class="dc-notes">
      <li v-for="(n, i) in result.notes" :key="i">⚠ {{ n }}</li>
    </ul>
  </div>
</template>

<style scoped>
.dc {
  font-size: 12px;
  color: #d8c9a8;
}
.dc-name {
  font-size: 13px;
  color: #e7d4a6;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  margin-bottom: 6px;
}
.dc-sub {
  color: var(--text-muted, #9a8d70);
}
.dc-verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 9px;
  border: 1px solid;
}
.dc-verdict-icon {
  font-size: 20px;
}
.dc-verdict--danger {
  color: #ff6b6b;
  background: rgba(200, 40, 40, 0.14);
  border-color: rgba(255, 80, 80, 0.6);
}
.dc-verdict--caution {
  color: #ecc24a;
  background: rgba(220, 170, 40, 0.12);
  border-color: rgba(236, 194, 74, 0.55);
}
.dc-verdict--safe {
  color: #8fd07a;
  background: rgba(127, 207, 106, 0.12);
  border-color: rgba(127, 207, 106, 0.5);
}
.dc-findings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dc-finding {
  padding: 5px 8px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.28);
  border-left: 3px solid transparent;
}
.dc-finding--danger {
  border-left-color: #ff6b6b;
}
.dc-finding--caution {
  border-left-color: #ecc24a;
}
.dc-finding--info {
  border-left-color: #7a8a9a;
}
.dc-finding-mod {
  color: #cdbf9f;
  font-size: 11.5px;
  line-height: 1.35;
}
.dc-finding-sev {
  display: inline-block;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 2px;
  margin-right: 5px;
  vertical-align: middle;
}
.dc-sev--danger {
  color: #2a0d0d;
  background: #ff6b6b;
}
.dc-sev--caution {
  color: #2a1f08;
  background: #ecc24a;
}
.dc-sev--info {
  color: #0e1620;
  background: #8aa0b4;
}
.dc-finding-reason {
  color: #b9cbd0;
  font-size: 11px;
  margin-top: 2px;
  line-height: 1.4;
}
.dc-clean {
  color: var(--text-muted, #9a8d70);
  font-style: normal;
  padding: 4px 2px;
}
.dc-advice {
  margin-top: 9px;
  padding: 6px 9px;
  background: rgba(120, 90, 40, 0.1);
  border: 1px solid rgba(180, 140, 70, 0.3);
  border-radius: 3px;
}
.dc-advice-head {
  color: #d8a857;
  font-variant: small-caps;
  font-size: 11.5px;
  letter-spacing: 0.03em;
  margin-bottom: 3px;
}
.dc-advice ul,
.dc-notes {
  list-style: none;
  margin: 0;
  padding: 0;
}
.dc-advice li {
  color: #cabf9f;
  font-size: 11px;
  line-height: 1.4;
  padding-left: 12px;
  position: relative;
}
.dc-advice li::before {
  content: '›';
  position: absolute;
  left: 2px;
  color: #d8a857;
}
.dc-notes {
  margin-top: 8px;
}
.dc-notes li {
  color: #c79a6a;
  font-size: 10.5px;
  line-height: 1.4;
  margin-top: 2px;
}
</style>
