<script setup lang="ts">
// BuildLevelingChecklist.vue — takip edilen build'e özel leveling/görev kontrol listesi (Bug #3).
// Build aşamaları + yazar notlarından üretilir (build-leveling.ts). Her adım "tamam" işaretlenir;
// ilerleme userData'ya kaydedilir (build:leveling-get/set). Veri yoksa kibar not.
// TR SIZINTISI YOK: beceri/gem/stat/not metni İNGİLİZCE orijinal; yalnız etiketler TR.
import { ref, computed, onMounted, watch } from 'vue'
import { trackedBuild, trackedMeta } from '../lib/build-target'
import { buildLevelingChecklist, type LevelStep } from '../lib/build-leveling'
import { buildQuestSuggestion, type UncutReward } from '../lib/pob-quest'

const props = defineProps<{ isTr: boolean }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

const open = ref(true)
const progress = ref<Record<string, boolean>>({})

const plan = computed(() => buildLevelingChecklist(trackedBuild.value, trackedMeta.value.notes))
const allSteps = computed<LevelStep[]>(() => [...plan.value.stages, ...plan.value.notes])
const doneCount = computed(() => allSteps.value.filter((s) => progress.value[s.id]).length)

// --- Part 3: AYRI + BELİRGİN quest ödülleri kartı (build'e özel uncut gem ödülleri) ---
function areaNames(areas: UncutReward[]): string {
  const names = areas.map((a) => (props.isTr && a.tr ? a.tr : a.en))
  if (names.length <= 2) return names.join(' / ')
  return names.slice(0, 2).join(' / ') + ' +' + (names.length - 2)
}
interface QuestRewardRow {
  id: string
  stageTitle: string
  level: { lo: number; hi: number } | null
  act: number | null
  rewards: Array<{ kind: 'Skill' | 'Support' | 'Spirit'; gemLevel: number; areas: string; skills: string }>
}
const questRewards = computed<QuestRewardRow[]>(() => {
  const b = trackedBuild.value
  if (!b) return []
  const rows: QuestRewardRow[] = []
  const seen = new Set<string>()
  for (const ss of b.skillSets) {
    const gems = ss.groups.flatMap((g) => g.gems)
    const sug = buildQuestSuggestion({ title: ss.title, gems })
    const skillNames = sug.activeSkills.map((s) => s.en).slice(0, 4).join(', ')
    const rewards: QuestRewardRow['rewards'] = []
    if (sug.skill) rewards.push({ kind: 'Skill', gemLevel: sug.skill.gemLevel, areas: areaNames(sug.skill.areas), skills: skillNames })
    if (sug.support && sug.supportCount) rewards.push({ kind: 'Support', gemLevel: sug.support.gemLevel, areas: areaNames(sug.support.areas), skills: '' })
    if (sug.spirit && sug.usesSpirit) rewards.push({ kind: 'Spirit', gemLevel: sug.spirit.gemLevel, areas: areaNames(sug.spirit.areas), skills: '' })
    if (!rewards.length) continue
    const title = (ss.title || '').trim() || 'Stage'
    const id = 'qr_' + title.replace(/\s+/g, '_')
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({ id, stageTitle: title, level: sug.level, act: sug.act, rewards })
  }
  return rows
})
const questDone = computed(() => {
  let total = 0
  let done = 0
  for (const r of questRewards.value)
    for (const rw of r.rewards) {
      total++
      if (progress.value[r.id + '_' + rw.kind]) done++
    }
  return { total, done }
})
function rewardKindLabel(k: string): string {
  if (k === 'Skill') return tr('Beceri', 'Skill')
  if (k === 'Support') return tr('Support', 'Support')
  return tr('Spirit', 'Spirit')
}
function toggleReward(rowId: string, kind: string): void {
  const id = rowId + '_' + kind
  const next = { ...progress.value, [id]: !progress.value[id] }
  if (!next[id]) delete next[id]
  progress.value = next
  window.api?.build?.levelingSet?.(next)
}

onMounted(async () => {
  progress.value = (await window.api?.build?.levelingGet?.()) ?? {}
})

function toggle(step: LevelStep): void {
  const next = { ...progress.value, [step.id]: !progress.value[step.id] }
  if (!next[step.id]) delete next[step.id]
  progress.value = next
  window.api?.build?.levelingSet?.(next)
}
function resetProgress(): void {
  progress.value = {}
  window.api?.build?.levelingSet?.({})
}
// build değişince ilerleme aynı dosyada kalır (id'ler build'e özel → çakışmaz)
watch(trackedBuild, () => {})

function levelLabel(s: LevelStep): string {
  if (!s.level) return tr('endgame', 'endgame')
  return s.level.lo === s.level.hi ? `Lv ${s.level.lo}` : `Lv ${s.level.lo}–${s.level.hi}`
}
</script>

<template>
  <div v-if="trackedBuild" class="blc panel-frame">
    <div class="blc-head" @click="open = !open">
      <span class="blc-title">✦ {{ tr('Bu Build için Leveling / Görevler', 'Leveling / Quests for this Build') }}</span>
      <span v-if="plan.hasData" class="blc-count">{{ doneCount }} / {{ allSteps.length }}</span>
      <span class="blc-toggle">{{ open ? '▾' : '▸' }}</span>
    </div>

    <div v-if="open" class="blc-body">
      <div v-if="!plan.hasData" class="blc-empty">
        {{ tr('Bu build için leveling verisi bulunamadı (aşama başlığı veya yazar notu yok).', 'No leveling data found for this build (no stage titles or author notes).') }}
      </div>

      <template v-else>
        <!-- Part 3: BELİRGİN quest ödülleri kartı (build'e özel uncut gem ödülleri) -->
        <div v-if="questRewards.length" class="blc-quest">
          <div class="blc-quest-head">
            <span class="blc-quest-ic">🎁</span>
            <span class="blc-quest-title">{{ tr('Quest Ödülleri (bu build için)', 'Quest Rewards (for this build)') }}</span>
            <span class="blc-quest-count">{{ questDone.done }} / {{ questDone.total }}</span>
          </div>
          <div class="blc-quest-note">
            {{ tr('PoE2’de quest sabit beceri vermez; bu Uncut Gem’leri oyup kendi becerilerine dönüştürürsün.', 'In PoE2 quests give no fixed skill; cut these Uncut Gems into your own skills.') }}
          </div>
          <div v-for="r in questRewards" :key="r.id" class="blc-qstage">
            <div class="blc-qstage-head">
              <span class="blc-qstage-lv">
                <template v-if="r.level">Lv {{ r.level.lo }}<template v-if="r.level.hi !== r.level.lo">–{{ r.level.hi }}</template></template>
                <template v-else>{{ tr('endgame', 'endgame') }}</template>
              </span>
              <span v-if="r.act" class="blc-qstage-act">Act {{ r.act }}</span>
              <span class="blc-qstage-ttl">{{ r.stageTitle }}</span>
            </div>
            <div
              v-for="rw in r.rewards"
              :key="rw.kind"
              class="blc-qreward"
              :class="['blc-qreward--' + rw.kind.toLowerCase(), { 'blc-qreward--done': progress[r.id + '_' + rw.kind] }]"
              @click="toggleReward(r.id, rw.kind)"
            >
              <span class="blc-box blc-box--q" :class="{ 'blc-box--on': progress[r.id + '_' + rw.kind] }">✓</span>
              <span class="blc-qreward-tag">{{ rewardKindLabel(rw.kind) }}</span>
              <span class="blc-qreward-gem">Lv {{ rw.gemLevel }} Uncut {{ rw.kind }} Gem</span>
              <span class="blc-qreward-area">{{ rw.areas }}</span>
            </div>
          </div>
        </div>

        <!-- Aşamalar -->
        <template v-if="plan.stages.length">
          <div class="blc-sec">{{ tr('Aşamalar (becerini bu seviyelerde edin)', 'Stages (acquire your skills at these levels)') }}</div>
          <ul class="blc-list">
            <li
              v-for="s in plan.stages"
              :key="s.id"
              class="blc-item"
              :class="{ 'blc-item--done': progress[s.id] }"
            >
              <label class="blc-check">
                <input type="checkbox" :checked="!!progress[s.id]" @change="toggle(s)" />
                <span class="blc-box">✓</span>
              </label>
              <div class="blc-main">
                <div class="blc-line1">
                  <span class="blc-lv">{{ levelLabel(s) }}</span>
                  <span v-if="s.act" class="blc-act">Act {{ s.act }}</span>
                  <span class="blc-stagettl">{{ s.title }}</span>
                </div>
                <div v-if="s.skills.length" class="blc-skills">
                  <span class="blc-sublbl">{{ tr('Beceriler', 'Skills') }}:</span>
                  <!-- EN orijinal beceri adları (Bug #4) -->
                  <span v-for="(sk, i) in s.skills" :key="i" class="blc-chip">{{ sk }}</span>
                </div>
                <div v-if="s.uncut.length" class="blc-uncut">
                  <span class="blc-sublbl">{{ tr('Gereken (quest ödülü)', 'Need (quest reward)') }}:</span>
                  <span v-for="(u, i) in s.uncut" :key="i" class="blc-uncut-tag">{{ u }}</span>
                </div>
              </div>
            </li>
          </ul>
        </template>

        <!-- Yazar notlarından leveling adımları -->
        <template v-if="plan.notes.length">
          <div class="blc-sec">{{ tr('Yazar notlarından (leveling)', 'From author notes (leveling)') }}</div>
          <ul class="blc-list">
            <li
              v-for="s in plan.notes"
              :key="s.id"
              class="blc-item blc-item--note"
              :class="{ 'blc-item--done': progress[s.id] }"
            >
              <label class="blc-check">
                <input type="checkbox" :checked="!!progress[s.id]" @change="toggle(s)" />
                <span class="blc-box">✓</span>
              </label>
              <!-- ham not satırı: EN orijinal (oyun terimleri korunur) -->
              <div class="blc-notetext">{{ s.text }}</div>
            </li>
          </ul>
        </template>

        <div class="blc-actions">
          <button class="blc-btn" @click="resetProgress">{{ tr('İlerlemeyi sıfırla', 'Reset progress') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.blc {
  margin-bottom: 10px;
  padding: 0;
  overflow: hidden;
}
.blc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 13px;
  cursor: pointer;
  background: linear-gradient(rgba(42, 36, 23, 0.55), rgba(26, 22, 16, 0.6));
  border-bottom: 1px solid rgba(184, 154, 102, 0.25);
}
.blc-title {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 14.5px;
  color: var(--gold-ornament, #c9a14a);
}
.blc-count {
  font-size: 13px;
  color: var(--gem-teal, #7ad3c5);
  font-weight: 600;
}
.blc-toggle {
  margin-left: auto;
  color: var(--gold-ornament);
}
.blc-body {
  padding: 10px 13px 12px;
  max-height: 360px;
  overflow-y: auto;
}
.blc-empty {
  font-size: 12.5px;
  color: var(--text-muted);
  font-style: normal;
}
.blc-sec {
  font-size: 12px;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  color: var(--gold-ornament);
  margin: 10px 0 6px;
}
.blc-sec:first-child {
  margin-top: 0;
}
.blc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.blc-item {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  padding: 7px 8px;
  border: 1px solid rgba(184, 154, 102, 0.18);
  border-left-width: 3px;
  border-radius: 3px;
  margin-bottom: 6px;
  background: rgba(0, 0, 0, 0.18);
}
.blc-item--done {
  opacity: 0.55;
  border-left-color: var(--gem-teal, #7ad3c5);
}
.blc-item--done .blc-stagettl,
.blc-item--done .blc-notetext {
  text-decoration: line-through;
}
.blc-check {
  flex: none;
  cursor: pointer;
  position: relative;
  margin-top: 1px;
}
.blc-check input {
  position: absolute;
  opacity: 0;
  width: 18px;
  height: 18px;
  cursor: pointer;
}
.blc-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--metal-edge, #6b5a36);
  border-radius: 3px;
  color: transparent;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.4);
}
.blc-check input:checked + .blc-box {
  color: #0a1614;
  background: var(--gem-teal, #7ad3c5);
  border-color: var(--gem-teal, #7ad3c5);
}
.blc-main {
  flex: 1;
  min-width: 0;
}
.blc-line1 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.blc-lv {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gem-teal, #7ad3c5);
}
.blc-act {
  font-size: 10.5px;
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gold-ornament, #c8aa6e);
  padding: 1px 7px;
  border-radius: 2px;
}
.blc-stagettl {
  font-size: 13px;
  color: var(--text-default);
}
.blc-skills,
.blc-uncut {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.blc-sublbl {
  font-size: 11px;
  color: var(--text-muted);
}
.blc-chip {
  font-size: 11.5px;
  color: #ece1c8;
  background: rgba(122, 211, 197, 0.1);
  border: 1px solid rgba(122, 211, 197, 0.3);
  padding: 1px 7px;
  border-radius: 2px;
}
.blc-uncut-tag {
  font-size: 11.5px;
  color: #d6c08a;
  border: 1px dashed rgba(200, 170, 110, 0.5);
  padding: 1px 7px;
  border-radius: 2px;
}
.blc-notetext {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-default);
}
.blc-actions {
  margin-top: 8px;
}
.blc-btn {
  font-family: var(--font-serif);
  font-size: 11.5px;
  font-variant: small-caps;
  color: #d6a07a;
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 4px 10px;
  cursor: pointer;
}
.blc-btn:hover {
  border-color: var(--gold-line, #b89a66);
}
/* Part 3: belirgin quest ödülleri kartı */
.blc-quest {
  margin-bottom: 12px;
  border: 1px solid rgba(201, 161, 74, 0.6);
  border-left: 3px solid var(--gold-ornament, #c9a14a);
  border-radius: 4px;
  background: linear-gradient(rgba(70, 56, 28, 0.42), rgba(40, 32, 18, 0.5));
  padding: 9px 12px;
  box-shadow: 0 0 0 1px rgba(201, 161, 74, 0.12) inset;
}
.blc-quest-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.blc-quest-ic {
  font-size: 15px;
}
.blc-quest-title {
  font-variant: small-caps;
  letter-spacing: 0.04em;
  font-size: 14px;
  color: var(--gold-title, #e6c878);
  font-weight: 600;
}
.blc-quest-count {
  margin-left: auto;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gem-teal, #7ad3c5);
}
.blc-quest-note {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-bottom: 7px;
}
.blc-qstage {
  margin-top: 6px;
}
.blc-qstage-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 3px;
}
.blc-qstage-lv {
  font-size: 12px;
  font-weight: 600;
  color: var(--gem-teal, #7ad3c5);
}
.blc-qstage-act {
  font-size: 10px;
  font-variant: small-caps;
  color: #0a1614;
  background: var(--gold-ornament, #c8aa6e);
  padding: 0 6px;
  border-radius: 2px;
}
.blc-qstage-ttl {
  font-size: 12px;
  color: var(--text-default);
}
.blc-qreward {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 7px;
  margin: 3px 0;
  border: 1px solid rgba(184, 154, 102, 0.22);
  border-left-width: 3px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
}
.blc-qreward--skill {
  border-left-color: #7ad3c5;
}
.blc-qreward--support {
  border-left-color: #b89a66;
}
.blc-qreward--spirit {
  border-left-color: #c98ad3;
}
.blc-qreward--done {
  opacity: 0.55;
}
.blc-qreward--done .blc-qreward-gem {
  text-decoration: line-through;
}
.blc-box--q {
  flex: none;
  cursor: pointer;
}
.blc-box--on {
  color: #0a1614;
  background: var(--gem-teal, #7ad3c5);
  border-color: var(--gem-teal, #7ad3c5);
}
.blc-qreward-tag {
  font-size: 10.5px;
  font-variant: small-caps;
  color: var(--text-muted);
  min-width: 52px;
}
.blc-qreward-gem {
  font-size: 12.5px;
  color: #e6d2a8;
  font-weight: 600;
}
.blc-qreward-area {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
  text-align: right;
}
</style>
