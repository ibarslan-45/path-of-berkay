<script setup lang="ts">
import { computed } from 'vue'

interface Area {
  id: string
  en: string
  tr: string
  act: string
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

const props = defineProps<{
  area: Area
  isTr: boolean
  status: 'done' | 'current' | 'upcoming'
  expanded: boolean
  index: number
}>()
const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'expand'): void
}>()

// Görsel çözümleme — ana App.vue ile AYNI 4 klasör (rewards/questitems/areas/bosses)
const assetModules = {
  ...(import.meta.glob('../../assets/rewards/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../assets/questitems/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../assets/areas/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../assets/bosses/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
}
const assetMap: Record<string, string> = {}
for (const p in assetModules) assetMap[(p.split('/').pop() as string)] = assetModules[p]
function assetUrl(rel: string | null | undefined): string | null {
  if (!rel) return null
  return assetMap[(rel.split('/').pop() as string)] ?? null
}

// GRUP 4: leveling tracker'da bölge/boss/görev-eşyası/quest ADLARI her zaman
// ORİJİNAL İNGİLİZCE (oyundaki ekranla eşleşsin). Açıklama/adım metinleri TR kalır.
const name = computed(() => props.area.en)
const quest = computed(() => props.area.quest_en)
const reward = computed(() => props.area.reward_en)
const bosses = computed(() => props.area.boss_en)
// Adımlar dile uyar; her adım için opsiyonel mi tespit et (soluk + "ops." etiketi)
const OPT_RE = /optional|opsiyonel|isteğe bağlı|istersen/i
const steps = computed(() => {
  const s = props.isTr ? props.area.steps_tr : props.area.steps_en
  const arr = s && s.length ? s : props.area.steps_en
  return arr.map((t) => ({ t, opt: OPT_RE.test(t) }))
})
const banner = computed(() => assetUrl(props.area.area_image))
const showFull = computed(() => props.status === 'current' || props.expanded)
// Yalnızca gerçekten çözülen ikonlar (kırık img yok)
const bossIcons = computed(() =>
  props.area.boss_images.map(assetUrl).filter((u): u is string => !!u)
)
const rewardIcons = computed(() =>
  props.area.reward_icons.map(assetUrl).filter((u): u is string => !!u)
)
</script>

<template>
  <div class="lv-card" :class="['lv-card--' + status, { 'lv-card--full': showFull }]">
    <!-- Üst satır: tik + ad + seviye + durum rozeti -->
    <div class="lv-row" @click="emit('expand')">
      <span class="lv-num">{{ index }}</span>
      <button
        class="lv-check"
        :class="{ 'lv-check--on': status === 'done' || status === 'current' }"
        :aria-label="status === 'done' ? 'İşareti kaldır' : 'Tamamlandı işaretle'"
        @click.stop="emit('toggle')"
      >
        <svg v-if="status === 'done' || status === 'current'" width="13" height="13" viewBox="0 0 13 13">
          <path d="M2 7 L5 10 L11 3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <span class="lv-name">{{ name }}</span>
      <span v-if="area.has_waypoint" class="lv-wp" :title="isTr ? 'Waypoint var' : 'Has waypoint'">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1 L11 6 L6 11 L1 6 Z" stroke="currentColor" stroke-width="1.3" /><circle cx="6" cy="6" r="1.6" fill="currentColor" /></svg>
      </span>
      <span class="lv-lvl">{{ isTr ? 'Sv' : 'Lv' }} {{ area.area_level }}</span>
      <span v-if="status === 'current'" class="lv-here">{{ isTr ? 'Şu an buradasın' : 'You are here' }}</span>
    </div>

    <!-- Genişletilmiş içerik (şu anki bölge ya da elle açılan) -->
    <div v-if="showFull" class="lv-body">
      <div v-if="banner" class="lv-banner">
        <img :src="banner" :alt="name" />
      </div>

      <div v-if="quest" class="lv-meta">
        <span class="lv-k">{{ isTr ? 'Görev' : 'Quest' }}</span>
        <span class="lv-v">{{ quest }}</span>
      </div>
      <div v-if="bosses.length" class="lv-meta">
        <span class="lv-k">{{ isTr ? 'Boss' : 'Boss' }}</span>
        <span class="lv-bossv">
          <span class="lv-bossicon" aria-hidden="true">
            <img v-if="bossIcons.length" :src="bossIcons[0]" alt="" />
            <span v-else class="lv-symdefault lv-symdefault--boss">☠</span>
          </span>
          <span class="lv-v lv-bossname">{{ bosses.join(', ') }}</span>
        </span>
      </div>
      <div v-if="reward" class="lv-meta">
        <span class="lv-k">{{ isTr ? 'Ödül' : 'Reward' }}</span>
        <span class="lv-rewardv">
          <span class="lv-rewicon" aria-hidden="true">
            <img v-if="rewardIcons.length" :src="rewardIcons[0]" alt="" />
            <span v-else class="lv-symdefault lv-symdefault--rew">◆</span>
          </span>
          <span class="lv-v lv-rewardname">{{ reward }}</span>
        </span>
      </div>

      <ol v-if="steps.length" class="lv-steps">
        <li v-for="(s, i) in steps" :key="i" :class="{ 'lv-step--opt': s.opt }">
          <span v-if="s.opt" class="lv-opttag">{{ isTr ? 'ops.' : 'opt.' }}</span>{{ s.t }}
        </li>
      </ol>

      <p v-if="area.source_facts === 'maxroll-campaign-guide'" class="lv-source">
        {{ isTr ? 'Kaynak' : 'Source' }}:
        <a
          href="https://maxroll.gg/poe2/getting-started/path-of-exile-2-campaign-guide"
          target="_blank"
          rel="noopener"
          >Maxroll — PoE 2 Campaign Guide</a
        >
      </p>
    </div>
  </div>
</template>

<style scoped>
.lv-card {
  border: 1px solid rgba(120, 100, 60, 0.18);
  background: linear-gradient(rgba(20, 22, 20, 0.5), rgba(10, 12, 11, 0.55));
  margin-bottom: 6px;
  /* ilerleme/işaretleme değişiminde yumuşak geçiş */
  transition: opacity 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease,
    background 0.3s ease;
}
.lv-card--done {
  opacity: 0.5;
}
.lv-card--upcoming {
  opacity: 0.72;
}
.lv-card--current {
  opacity: 1;
  border-color: var(--gem-teal);
  box-shadow: 0 0 0 1px var(--gem-teal), 0 0 16px rgba(122, 211, 197, 0.18);
  background: linear-gradient(rgba(16, 28, 28, 0.55), rgba(9, 16, 16, 0.6));
}
.lv-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  cursor: pointer;
}
.lv-num {
  flex: none;
  min-width: 20px;
  text-align: center;
  font-size: 11px;
  font-variant: small-caps;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(120, 100, 60, 0.25);
  border-radius: 2px;
  padding: 1px 4px;
}
.lv-card--current .lv-num {
  color: var(--gem-teal);
  border-color: var(--gem-teal);
}
.lv-check {
  flex: none;
  width: 19px;
  height: 19px;
  border: 1.5px solid var(--metal-edge, #6b5a36);
  background: rgba(0, 0, 0, 0.4);
  color: var(--gem-teal);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 2px;
}
.lv-check--on {
  border-color: var(--gem-teal);
  background: rgba(27, 162, 155, 0.16);
}
.lv-name {
  flex: 1;
  font-family: var(--font-serif);
  font-variant: small-caps;
  letter-spacing: 0.03em;
  font-size: 14px;
  color: var(--text-default);
}
.lv-card--current .lv-name {
  color: var(--gem-teal);
  font-size: 16px;
}
.lv-lvl {
  flex: none;
  font-size: 11px;
  font-variant: small-caps;
  color: var(--gold-ornament);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(120, 100, 60, 0.3);
  padding: 1px 6px;
  border-radius: 2px;
}
.lv-here {
  flex: none;
  font-size: 10px;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: #0a1614;
  background: var(--gem-teal);
  padding: 2px 7px;
  border-radius: 2px;
  font-weight: 600;
}
.lv-body {
  padding: 2px 12px 10px;
}
.lv-banner {
  margin: 0 0 8px;
  overflow: hidden;
  border: 1px solid rgba(120, 100, 60, 0.25);
}
.lv-banner img {
  display: block;
  width: 100%;
  height: 96px;
  object-fit: cover;
  opacity: 0.92;
}
.lv-meta {
  display: flex;
  gap: 8px;
  font-size: 12.5px;
  margin: 3px 0;
  align-items: baseline;
}
.lv-k {
  flex: none;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: var(--gem-teal);
}
.lv-k::after {
  content: ':';
}
.lv-v {
  color: var(--stat-value, #fff);
}
.lv-bossv,
.lv-rewardv {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* boss = kırmızımsı, görev eşyası/ödül = sarı/altın (PoE temasına uygun) */
.lv-bossname {
  color: #e0664f;
}
.lv-rewardname {
  color: #e8c061;
}
.lv-bossicon img,
.lv-rewicon img {
  width: 22px;
  height: 22px;
  vertical-align: middle;
  object-fit: contain;
}
.lv-symdefault {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.3);
}
.lv-symdefault--boss {
  color: #e0664f;
  border: 1px solid rgba(224, 102, 79, 0.4);
}
.lv-symdefault--rew {
  color: #e8c061;
  border: 1px solid rgba(232, 192, 97, 0.4);
}
/* waypoint rozeti (ad yanında) */
.lv-wp {
  flex: none;
  display: inline-flex;
  align-items: center;
  color: var(--gem-teal);
  opacity: 0.85;
}
.lv-steps {
  margin: 7px 0 4px;
  padding-left: 20px;
}
.lv-steps li {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-default);
  margin: 2px 0;
}
/* opsiyonel adım: soluk + "ops." etiketi */
.lv-step--opt {
  color: var(--text-muted);
  font-style: normal;
}
.lv-opttag {
  font-variant: small-caps;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--gold-ornament);
  border: 1px solid rgba(184, 154, 102, 0.35);
  border-radius: 2px;
  padding: 0 4px;
  margin-right: 5px;
}
.lv-source {
  margin: 8px 0 0;
  padding-top: 6px;
  border-top: 1px solid rgba(184, 154, 102, 0.16);
  font-size: 10.5px;
  font-style: normal;
  color: var(--text-muted);
}
.lv-source a {
  color: var(--gold-ornament);
  text-decoration: underline;
}
</style>
