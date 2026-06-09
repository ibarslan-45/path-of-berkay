<script setup lang="ts">
// WelcomeTour.vue — ilk açılış tanıtımı (onboarding, Cila ADIM 2).
// Logo + hoş geldin + ana özellikleri kısa adımlarla tanıtır. Bittiğinde 'done' emit eder.
// İki dilli (TR birincil). Ornate modal. Ayarlar'dan tekrar gösterilebilir.
import { ref, computed } from 'vue'
import pobeLogo from '../../assets/pobe-logo.png'
import { CONTACT } from '../../../config/contact'

const props = defineProps<{ isTr: boolean }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'open-settings'): void }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

interface Step {
  icon: string
  tr: { t: string; b: string }
  en: { t: string; b: string }
}
const steps: Step[] = [
  {
    icon: '📚',
    tr: { t: 'Veritabanı', b: 'Gem, eşya, eşsiz, özellik, bölge, yükseliş, pasif, atlas, mekanik, boss ve crafting sekmeleri. Arama hem İngilizce hem Türkçe eşleşir.' },
    en: { t: 'Database', b: 'Gems, items, uniques, mods, areas, ascendancies, passives, atlas, mechanics, bosses and crafting tabs. Search matches both English and Turkish.' }
  },
  {
    icon: '⚗️',
    tr: { t: 'Craft Simülatörü', b: 'Taban + ilvl seç, currency/essence/omen uygula, hedef koy; Usta Craft Yardımcısı en iyi adımı önerir. Tamamen yerel — gerçek currency harcanmaz.' },
    en: { t: 'Craft Simulator', b: 'Pick a base + ilvl, apply currency/essence/omen, set a target; the Master Craft advisor suggests the best step. Fully local — no real currency spent.' }
  },
  {
    icon: '🧬',
    tr: { t: 'Build İçe Aktarma', b: 'Build sekmesine PoB (PoE2) kodu ya da Maxroll/Mobalytics linki yapıştır → gear, gem, pasif ağaç, leveling. ".build oluştur" ile oyun-içi BuildPlanner\'a aktar.' },
    en: { t: 'Build Import', b: 'Paste a PoB (PoE2) code or a Maxroll/Mobalytics link in the Build tab → gear, gems, passive tree, leveling. "Create .build" exports to the in-game BuildPlanner.' }
  },
  {
    icon: '🏷️',
    tr: { t: 'Oyun-içi Fiyat (Ctrl+C + kısayol)', b: 'Eşyaya gel → KENDİ Ctrl+C\'nle kopyala → kısayol (varsayılan Ctrl+D) → ≈ tahmini değer + trade. Build karşılaştırması özellik-başına dahil.' },
    en: { t: 'In-game Price (Ctrl+C + shortcut)', b: 'Hover an item → press Ctrl+C yourself → shortcut (default Ctrl+D) → ≈ estimated value + trade. Per-stat build comparison included.' }
  },
  {
    icon: '⚔️',
    tr: { t: 'Tehlike Kontrolü (Ctrl+E)', b: 'Waystone\'a gel → Ctrl+C → kısayol (varsayılan Ctrl+E); build\'inin defansına göre GÜVENLİ/DİKKAT/TEHLİKELİ + gerekçe. Tehlike sekmesinden de yapıştırabilirsin.' },
    en: { t: 'Danger Check (Ctrl+E)', b: 'Hover a waystone → Ctrl+C → shortcut (default Ctrl+E); SAFE/CAUTION/DANGEROUS vs your build\'s defenses with reasons. You can also paste in the Danger tab.' }
  },
  {
    icon: '🎯',
    tr: { t: 'Loot Filter + Yardım/Sohbet', b: 'Build\'e özel loot filter üret (Build sekmesi). Takıldığında "Yardım / Sohbet" sekmesinden programı veya PoE2\'yi sor.' },
    en: { t: 'Loot Filter + Help/Chat', b: 'Generate a build-specific loot filter (Build tab). Stuck? Ask about the app or PoE2 in the "Help / Chat" tab.' }
  },
  {
    icon: '⚙️',
    tr: { t: 'Ayarlar & İpuçları', b: 'Overlay\'lerin görünmesi için oyunu **Windowed Fullscreen / Borderless** yap. Dil (TR/EN), kısayollar ve opsiyonel LLM sağlayıcı (Claude/ChatGPT/Gemini) Ayarlar\'da. LLM olmadan da çoğu şey çalışır.' },
    en: { t: 'Settings & Tips', b: 'Run the game in **Windowed Fullscreen / Borderless** so overlays appear. Language (TR/EN), shortcuts and an optional LLM provider (Claude/ChatGPT/Gemini) live in Settings. Most features work without an LLM.' }
  }
]

const idx = ref(0)
const isLast = computed(() => idx.value === steps.length - 1)
const cur = computed(() => (props.isTr ? steps[idx.value].tr : steps[idx.value].en))

function next(): void {
  if (isLast.value) finish()
  else idx.value++
}
function prev(): void {
  if (idx.value > 0) idx.value--
}
function finish(): void {
  emit('done')
}
function md(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
}

// İletişim (ADIM D) — son adımda gösterilir
const contact = CONTACT
const discordCopied = ref(false)
async function copyDiscord(): Promise<void> {
  try {
    await navigator.clipboard.writeText(contact.discord)
    discordCopied.value = true
    setTimeout(() => (discordCopied.value = false), 1500)
  } catch {
    /* sessiz */
  }
}
function openEmail(): void {
  window.api?.openExternal?.('mailto:' + contact.email)
}
function openSite(): void {
  if (contact.site) window.api?.openExternal?.(contact.site)
}
</script>

<template>
  <div class="wt-backdrop">
    <div class="wt-modal">
      <div class="wt-hero">
        <img :src="pobeLogo" class="wt-logo" alt="PoBe" />
        <div class="wt-hero-text">
          <div class="wt-welcome">{{ tr('Path of Berkay\'a hoş geldin', 'Welcome to Path of Berkay') }}</div>
          <div class="wt-sub">{{ tr('PoE 2 için iki dilli veritabanı & overlay', 'A bilingual database & overlay for PoE 2') }}</div>
        </div>
        <button class="wt-skip" @click="finish">{{ tr('Atla', 'Skip') }}</button>
      </div>

      <div class="wt-step">
        <div class="wt-step-icon">{{ steps[idx].icon }}</div>
        <div class="wt-step-body">
          <div class="wt-step-title">{{ idx + 1 }}. {{ cur.t }}</div>
          <div class="wt-step-text" v-html="md(cur.b)"></div>
        </div>
      </div>

      <!-- İletişim (son adım) -->
      <div v-if="isLast" class="wt-contact">
        <span class="wt-contact-t">{{ tr('İletişim', 'Contact') }}:</span>
        <span class="wt-contact-i">Discord <code>{{ contact.discord }}</code></span>
        <button class="wt-contact-btn" @click="copyDiscord">{{ discordCopied ? tr('Kopyalandı ✓', 'Copied ✓') : tr('Kopyala', 'Copy') }}</button>
        <span class="wt-contact-i"><code>{{ contact.email }}</code></span>
        <button class="wt-contact-btn" @click="openEmail">{{ tr('E-posta', 'Email') }}</button>
        <button v-if="contact.site" class="wt-contact-btn" @click="openSite">{{ tr('Web sitesi ↗', 'Website ↗') }}</button>
      </div>

      <div class="wt-dots">
        <span v-for="(_s, i) in steps" :key="i" class="wt-dot" :class="{ 'wt-dot--on': i === idx }" @click="idx = i"></span>
      </div>

      <div class="wt-actions">
        <button class="wt-btn" :disabled="idx === 0" @click="prev">{{ tr('Geri', 'Back') }}</button>
        <button class="wt-btn wt-btn--ghost" @click="emit('open-settings')">{{ tr('Ayarlar / LLM', 'Settings / LLM') }}</button>
        <button class="wt-btn wt-btn--primary" @click="next">
          {{ isLast ? tr('Başla', 'Get started') : tr('İleri', 'Next') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wt-modal {
  width: 560px;
  max-width: calc(100vw - 40px);
  background: linear-gradient(165deg, #1c150b, #110c06);
  border: 1px solid #7a5e2c;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 18px 60px rgba(0, 0, 0, 0.7);
  padding: 18px 20px 16px;
}
.wt-hero {
  display: flex;
  align-items: center;
  gap: 13px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(122, 94, 44, 0.45);
}
.wt-logo {
  width: 52px;
  height: 52px;
  border-radius: 9px;
  box-shadow: 0 0 0 1px rgba(200, 160, 80, 0.5), 0 2px 8px rgba(0, 0, 0, 0.7);
  flex: none;
}
.wt-hero-text {
  flex: 1;
}
.wt-welcome {
  font-size: 18px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #ecc24a;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.wt-sub {
  font-size: 12px;
  color: #b6a576;
  margin-top: 1px;
}
.wt-skip {
  align-self: flex-start;
  background: none;
  border: none;
  color: #9a8a60;
  font-size: 12px;
  cursor: pointer;
}
.wt-skip:hover {
  color: #d8a857;
}
.wt-step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-height: 96px;
  padding: 18px 4px 8px;
}
.wt-step-icon {
  font-size: 34px;
  line-height: 1;
  flex: none;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.7));
}
.wt-step-title {
  font-size: 15px;
  color: #e7d4a6;
  font-variant: small-caps;
  letter-spacing: 0.02em;
  margin-bottom: 5px;
}
.wt-step-text {
  font-size: 13px;
  line-height: 1.55;
  color: #cabf9f;
}
.wt-step-text :deep(b) {
  color: #ecc24a;
}
.wt-contact {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 12px;
  color: #b6a576;
  padding: 8px 10px;
  margin: 2px 0 4px;
  background: rgba(207, 168, 95, 0.06);
  border: 1px solid rgba(122, 94, 44, 0.4);
  border-radius: 6px;
}
.wt-contact-t {
  color: #e7d4a6;
  font-variant: small-caps;
}
.wt-contact-i code {
  color: #ecc24a;
}
.wt-contact-btn {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  color: #d8c9a8;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(160, 130, 70, 0.45);
}
.wt-contact-btn:hover {
  border-color: rgba(216, 168, 87, 0.8);
}
.wt-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 6px 0 12px;
}
.wt-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(180, 150, 90, 0.3);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.wt-dot--on {
  background: #d8a857;
  transform: scale(1.25);
}
.wt-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.wt-btn {
  font-size: 12.5px;
  padding: 7px 16px;
  border-radius: 5px;
  cursor: pointer;
  color: #d8c9a8;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(160, 130, 70, 0.45);
  transition: border-color 0.12s, background 0.12s, transform 0.06s;
}
.wt-btn:hover:not(:disabled) {
  border-color: rgba(216, 168, 87, 0.8);
}
.wt-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.wt-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.wt-btn--ghost {
  margin-right: auto;
}
.wt-btn--primary {
  color: #2a1f08;
  background: linear-gradient(#e8c074, #cf9a46);
  border-color: #9a7330;
  font-weight: 600;
}
</style>
