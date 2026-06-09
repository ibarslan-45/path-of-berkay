<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import areasData from '../../../data/areas.json'
import { importPob } from '../lib/pob'
import { matchBuild, niceNodeName, type MatchedBuild, type MatchedGem } from '../lib/pob-match'
import { buildQuestSuggestion, stageIndexForLevel, type UncutReward } from '../lib/pob-quest'

interface Area {
  id: string
  en: string
  tr: string
  act: string
  area_level: number
  type: string
  has_waypoint: boolean | null
  reward_en: string
  boss_en: string[]
  steps_en: string[]
  steps_tr: string[]
  boss_images: string[]
  reward_icons: string[]
}
type LocKind = 'campaign' | 'town' | 'map' | 'hideout'
interface LvState {
  visited: string[]
  currentId: string | null
  location: { kind: LocKind; name: string } | null
  level: number | null
}

// Görsel çözümleme (AreaCard ile aynı 4 klasör)
const assetModules = {
  ...(import.meta.glob('../../assets/rewards/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../assets/questitems/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../assets/bosses/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
}
const assetMap: Record<string, string> = {}
for (const p in assetModules) assetMap[(p.split('/').pop() as string)] = assetModules[p]
function asset(rel: string | undefined): string | null {
  if (!rel) return null
  return assetMap[(rel.split('/').pop() as string)] ?? null
}

const isTr = ref(true)
const fontScale = ref(1)
const ACTS = ['1', '2', '3', '4']
const areas = (areasData as { records?: Area[] }).records ?? (areasData as unknown as Area[])
const flatOrder = ACTS.flatMap((act) =>
  areas
    .filter((a) => String(a.act) === act)
    .sort((a, b) => a.area_level - b.area_level || a.id.localeCompare(b.id))
)

const visited = ref<Set<string>>(new Set())
const currentId = ref<string | null>(null)
const location = ref<{ kind: LocKind; name: string } | null>(null)
const level = ref<number | null>(null)
const opacity = ref(0.85)
const pinned = ref(false)
let unsubState: (() => void) | null = null
let unsubSettings: (() => void) | null = null
let unsubBuild: (() => void) | null = null

// --- Build (PoB) gösterimi ---
const gemIcons = import.meta.glob('../../assets/gems/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const gemMap: Record<string, string> = {}
for (const p in gemIcons) gemMap[(p.split('/').pop() as string)] = gemIcons[p]
function gemIcon(rel: string | null): string | null {
  return rel ? gemMap[(rel.split('/').pop() as string)] ?? null : null
}
const mbuild = ref<MatchedBuild | null>(null)
function loadBuildCode(c: string): void {
  if (!c) { mbuild.value = null; return }
  try { mbuild.value = matchBuild(importPob(c)) } catch { mbuild.value = null }
}

onMounted(async () => {
  const lv = window.api?.leveling
  if (lv) {
    apply((await lv.get()) as LvState)
    unsubState = lv.onState((st) => apply(st as LvState))
  }
  const se = window.api?.settings
  if (se) {
    applySettings((await se.get()) as SettingsLite)
    unsubSettings = se.onChanged((st) => applySettings(st as SettingsLite))
  }
  const bd = window.api?.build
  if (bd) {
    loadBuildCode((await bd.get()) ?? '')
    unsubBuild = bd.onChanged((c) => loadBuildCode(c))
  }
})
onBeforeUnmount(() => {
  unsubState?.()
  unsubSettings?.()
  unsubBuild?.()
})

interface SettingsLite {
  overlay?: { opacity?: number; fontScale?: number }
  lang?: 'tr' | 'en'
}
function applySettings(s: SettingsLite): void {
  if (s.overlay && typeof s.overlay.opacity === 'number') opacity.value = s.overlay.opacity
  if (s.overlay && typeof s.overlay.fontScale === 'number') fontScale.value = s.overlay.fontScale
  if (s.lang === 'en' || s.lang === 'tr') isTr.value = s.lang === 'tr'
}
function apply(s: LvState): void {
  visited.value = new Set(s.visited)
  currentId.value = s.currentId
  location.value = s.location ?? null
  level.value = s.level ?? null
}

// --- Build: mevcut seviyeye göre otomatik aşama + kompakt bilgi ---
const buildStage = computed(() => {
  const b = mbuild.value
  if (!b || !b.skillSets.length) return null
  const idx = stageIndexForLevel(b.skillSets.map((s) => s.title), level.value)
  return { idx, set: b.skillSets[idx] }
})
const buildActive = computed<MatchedGem[]>(() => buildStage.value?.set.gems.filter((g) => !g.support && g.nameSpec) ?? [])
const buildSupportCount = computed(() => buildStage.value?.set.gems.filter((g) => g.support && g.nameSpec).length ?? 0)
const buildQuest = computed(() => (buildStage.value ? buildQuestSuggestion(buildStage.value.set) : null))
const buildNotables = computed<string[]>(() => {
  const b = mbuild.value
  const st = buildStage.value
  if (!b || !st) return []
  const spec = b.specs.find((s) => s.title === st.set.title) ?? b.specs[st.idx] ?? null
  if (!spec) return []
  const out: string[] = []
  for (const n of spec.nodes) {
    if (!n.notable || !n.matched) continue
    const nm = niceNodeName(n.name)
    if (nm && !out.includes(nm)) out.push(nm)
    if (out.length >= 4) break
  }
  return out
})
function gemName(g: { nameSpec: string; tr: string | null }): string {
  return isTr.value && g.tr ? g.tr : g.nameSpec
}
function areaShort(a: UncutReward | undefined): string {
  if (!a) return ''
  return isTr.value && a.tr ? a.tr : a.en
}

const currentArea = computed(() => flatOrder.find((a) => a.id === currentId.value) ?? null)
const upcoming = computed(() => {
  const ci = currentArea.value ? flatOrder.indexOf(currentArea.value) : -1
  return flatOrder.filter((a, i) => i > ci && !visited.value.has(a.id)).slice(0, 2)
})
// Sayaç: ana state'teki gerçek tamamlanan kampanya bölgesi sayısı (birebir in-app ile)
const doneCount = computed(() => flatOrder.filter((a) => visited.value.has(a.id)).length)
const offNote = computed<string | null>(() => {
  const l = location.value
  if (!l || l.kind === 'campaign') return null
  if (l.kind === 'town') return (isTr.value ? 'Kasaba: ' : 'Town: ') + l.name
  if (l.kind === 'hideout') return isTr.value ? "Hideout'tasın" : 'In Hideout'
  return (isTr.value ? 'Harita: ' : 'Map: ') + l.name
})
// GRUP 4: ad/boss/ödül EN (oyun ekranıyla eşleşsin); adım TR
function nm(a: Area): string {
  return a.en
}
function bossName(a: Area): string {
  return a.boss_en && a.boss_en.length ? a.boss_en.join(', ') : ''
}
function rewardName(a: Area): string {
  return a.reward_en || ''
}
function bossIcon(a: Area): string | null {
  return asset(a.boss_images?.[0])
}
function rewardIcon(a: Area): string | null {
  return asset(a.reward_icons?.[0])
}
function step(a: Area): string {
  const s = isTr.value ? a.steps_tr : a.steps_en
  return s && s.length ? s[0] : ''
}
const tlabel = computed(() => ({
  here: isTr.value ? 'Şu an buradasın' : 'You are here',
  next: isTr.value ? 'Sıradaki' : 'Next',
  empty: isTr.value ? 'Henüz bölgeye girilmedi' : 'No zone entered yet',
  skip: isTr.value ? 'Atla' : 'Skip'
}))
const rootStyle = computed(() => ({
  background: `rgba(8, 12, 13, ${opacity.value})`,
  '--ovfs': String(fontScale.value)
}))

// --- Tıklama geçirgenliği + sürükleme ---
function setInteractive(v: boolean): void {
  window.api?.overlay?.setInteractive(v)
}
function onEnter(): void {
  setInteractive(true)
}
function onLeave(): void {
  if (!pinned.value) setInteractive(false)
}
function togglePin(): void {
  pinned.value = !pinned.value
  setInteractive(true)
}
function skipCurrent(): void {
  const i = currentArea.value ? flatOrder.indexOf(currentArea.value) : -1
  const next = flatOrder[i + 1]
  if (next) window.api?.leveling.setCurrent(next.id)
}
</script>

<template>
  <div
    class="ov"
    :style="rootStyle"
    :class="{ 'ov--pinned': pinned }"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <div class="ov-bar">
      <span class="ov-progress">{{ doneCount }}/{{ flatOrder.length }}</span>
      <span class="ov-title">Leveling</span>
      <button
        class="ov-skip nodrag"
        :title="tlabel.skip"
        :disabled="!currentArea"
        @click="skipCurrent"
      >
        ⏭
      </button>
      <button
        class="ov-pin nodrag"
        :class="{ 'ov-pin--on': pinned }"
        :title="pinned ? 'Sabitlemeyi kaldır (tıklama geçer)' : 'Sabitle (taşı/tik için)'"
        @click="togglePin"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M6 1.5h4l-.6 4 2.1 2.1H4.5L6.6 5.5 6 1.5Z M8 9.6v5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div v-if="offNote" class="ov-off">{{ offNote }}</div>

    <div v-if="currentArea" class="ov-cur">
      <div class="ov-herrow">
        <span class="ov-here">{{ tlabel.here }}</span>
        <span v-if="currentArea.has_waypoint" class="ov-wp" title="Waypoint">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1 L11 6 L6 11 L1 6 Z" stroke="currentColor" stroke-width="1.3" /><circle cx="6" cy="6" r="1.5" fill="currentColor" /></svg>
        </span>
      </div>
      <div class="ov-curname">{{ nm(currentArea) }}</div>
      <div v-if="bossName(currentArea)" class="ov-line">
        <img v-if="bossIcon(currentArea)" :src="bossIcon(currentArea)!" class="ov-ic" alt="" />
        <span v-else class="ov-sym ov-sym--boss">☠</span>
        <span class="ov-boss">{{ bossName(currentArea) }}</span>
      </div>
      <div v-if="rewardName(currentArea)" class="ov-line">
        <img v-if="rewardIcon(currentArea)" :src="rewardIcon(currentArea)!" class="ov-ic" alt="" />
        <span v-else class="ov-sym ov-sym--rew">◆</span>
        <span class="ov-reward">{{ rewardName(currentArea) }}</span>
      </div>
      <div v-if="step(currentArea)" class="ov-step">{{ step(currentArea) }}</div>
    </div>
    <div v-else class="ov-empty">{{ tlabel.empty }}</div>

    <div v-if="upcoming.length" class="ov-next">
      <span class="ov-nextlabel">{{ tlabel.next }}</span>
      <span v-for="z in upcoming" :key="z.id" class="ov-nextz">{{ nm(z) }}</span>
    </div>

    <!-- Build (PoB): import edilmişse, mevcut seviyeye göre kompakt göster -->
    <div v-if="mbuild && buildStage" class="ov-build">
      <div class="ov-bld-head">
        <span class="ov-bld-tag">Build</span>
        <span class="ov-bld-stage">{{ buildStage.set.title }}</span>
      </div>
      <div v-if="buildActive.length" class="ov-bld-gems">
        <span v-for="(g, i) in buildActive" :key="i" class="ov-bld-gem" :title="gemName(g)">
          <img v-if="gemIcon(g.icon)" :src="gemIcon(g.icon)!" class="ov-bld-gic" alt="" />
          <span v-else class="ov-bld-gph">◆</span>
          <span class="ov-bld-gn">{{ gemName(g) }}</span>
        </span>
        <span v-if="buildSupportCount" class="ov-bld-sup">+{{ buildSupportCount }} sup</span>
      </div>
      <div v-if="buildQuest && buildQuest.skill" class="ov-bld-uncut">
        <span class="ov-bld-uc">⚒ Lv{{ buildQuest.skill.gemLevel }} Skill</span>
        <span class="ov-bld-ucarea">{{ areaShort(buildQuest.skill.areas[0]) }}</span>
        <span v-if="buildQuest.spirit && buildQuest.usesSpirit" class="ov-bld-uc2">
          · Lv{{ buildQuest.spirit.gemLevel }} Spirit {{ areaShort(buildQuest.spirit.areas[0]) }}
        </span>
      </div>
      <div v-if="buildNotables.length" class="ov-bld-pas">
        <span class="ov-bld-paslbl">{{ isTr ? 'Pasif' : 'Passive' }}:</span>
        <span v-for="(n, i) in buildNotables" :key="i" class="ov-bld-node">{{ n }}</span>
      </div>
    </div>
  </div>
</template>

<style>
html,
body {
  background: transparent !important;
  margin: 0;
  overflow: hidden;
}
</style>

<style scoped>
.ov {
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding: 8px 10px 10px;
  border: 1px solid rgba(184, 154, 102, 0.45);
  font-family: var(--font-serif);
  color: #e8e2d2;
  user-select: none;
  overflow: hidden;
  /* sürükleme: panelin her yeri tutamaç (butonlar .nodrag) */
  -webkit-app-region: drag;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.nodrag {
  -webkit-app-region: no-drag;
}
.ov--pinned {
  border-color: var(--gem-teal);
}
.ov-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.25);
  padding-bottom: 5px;
  margin-bottom: 5px;
}
.ov-progress {
  font-variant: small-caps;
  font-size: calc(14px * var(--ovfs));
  color: var(--gem-teal);
  font-weight: 700;
}
.ov-title {
  flex: 1;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  font-size: calc(12px * var(--ovfs));
  color: var(--gold-ornament);
}
.ov-skip,
.ov-pin {
  flex: none;
  height: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--metal-edge, #6b5a36);
  color: var(--gold-ornament);
  cursor: pointer;
  border-radius: 2px;
}
.ov-skip {
  width: 24px;
  font-size: 12px;
}
.ov-pin {
  width: 23px;
}
.ov-skip:disabled {
  opacity: 0.4;
  cursor: default;
}
.ov-pin--on {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
}
.ov-off {
  font-size: calc(11px * var(--ovfs));
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gold-ornament);
  padding: 1px 7px;
  border-radius: 2px;
  display: inline-block;
  margin-bottom: 5px;
  text-shadow: none;
}
.ov-herrow {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ov-here {
  font-size: calc(10px * var(--ovfs));
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: #0a1614;
  background: var(--gem-teal);
  padding: 1px 6px;
  border-radius: 2px;
  display: inline-block;
  font-weight: 600;
  text-shadow: none;
}
.ov-wp {
  display: inline-flex;
  color: var(--gem-teal);
}
.ov-curname {
  font-variant: small-caps;
  font-size: calc(18px * var(--ovfs));
  color: var(--gem-teal);
  font-weight: 600;
  line-height: 1.12;
  margin: 3px 0 3px;
}
.ov-line {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: calc(13px * var(--ovfs));
  margin: 1px 0;
}
.ov-ic {
  width: calc(18px * var(--ovfs));
  height: calc(18px * var(--ovfs));
  object-fit: contain;
  flex: none;
}
.ov-sym {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(16px * var(--ovfs));
  height: calc(16px * var(--ovfs));
  font-size: calc(11px * var(--ovfs));
  flex: none;
}
.ov-sym--boss {
  color: #e0664f;
}
.ov-sym--rew {
  color: #e8c061;
}
.ov-boss {
  color: #f08a76;
  font-weight: 600;
}
.ov-reward {
  color: #eecb72;
  font-weight: 600;
}
.ov-step {
  font-size: calc(12px * var(--ovfs));
  line-height: 1.4;
  color: #cfc7b2;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ov-empty {
  font-size: calc(13px * var(--ovfs));
  color: var(--text-muted);
  font-style: normal;
}
.ov-next {
  margin-top: 7px;
  padding-top: 5px;
  border-top: 1px solid rgba(184, 154, 102, 0.18);
  font-size: calc(12px * var(--ovfs));
}
.ov-nextlabel {
  font-variant: small-caps;
  color: var(--gold-ornament);
  margin-right: 6px;
}
.ov-nextz {
  color: #c7bfa8;
  margin-right: 8px;
}
/* --- Build bölümü --- */
.ov-build {
  margin-top: 7px;
  padding-top: 5px;
  border-top: 1px solid rgba(95, 208, 191, 0.3);
}
.ov-bld-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}
.ov-bld-tag {
  font-variant: small-caps;
  font-size: calc(10px * var(--ovfs));
  color: #0a1614;
  background: var(--gem-teal);
  padding: 0 6px;
  border-radius: 2px;
  font-weight: 700;
  text-shadow: none;
}
.ov-bld-stage {
  font-variant: small-caps;
  font-size: calc(12px * var(--ovfs));
  color: var(--gem-teal);
  font-weight: 600;
}
.ov-bld-gems {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin: 2px 0;
}
.ov-bld-gem {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: calc(12px * var(--ovfs));
}
.ov-bld-gic {
  width: calc(15px * var(--ovfs));
  height: calc(15px * var(--ovfs));
  object-fit: contain;
  flex: none;
}
.ov-bld-gph {
  color: var(--gold-ornament);
  font-size: calc(10px * var(--ovfs));
}
.ov-bld-gn {
  color: #e3dcc8;
}
.ov-bld-sup {
  font-size: calc(11px * var(--ovfs));
  color: var(--gold-ornament);
  font-variant: small-caps;
}
.ov-bld-uncut {
  font-size: calc(12px * var(--ovfs));
  margin: 2px 0;
  line-height: 1.35;
}
.ov-bld-uc {
  color: #eecb72;
  font-weight: 600;
}
.ov-bld-ucarea {
  color: #cfc7b2;
  margin-left: 4px;
}
.ov-bld-uc2 {
  color: #b98ad8;
  margin-left: 4px;
}
.ov-bld-pas {
  font-size: calc(11.5px * var(--ovfs));
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ov-bld-paslbl {
  font-variant: small-caps;
  color: var(--gold-ornament);
  margin-right: 5px;
}
.ov-bld-node {
  color: #9fd0c6;
  margin-right: 7px;
}
</style>
