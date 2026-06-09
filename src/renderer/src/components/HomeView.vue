<script setup lang="ts">
// HomeView.vue — görsel/estetik Ana Sayfa (varsayılan açılış). Logo + tanıtım + sürüm +
// BÜYÜK kategori kartları (bundled ikon + başlık + açıklama). Kart tıklanınca o bölüme gider.
// Görseller bundled (dış istek YOK). Ornate altın-koyu tema, hover, responsive grid. İki dilli.
import { ref, onMounted } from 'vue'
import pobeLogo from '../../assets/pobe-logo.png'

const props = defineProps<{ isTr: boolean }>()
const emit = defineEmits<{ (e: 'navigate', mode: string): void; (e: 'feedback'): void }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

// --- bundled ikon klasörleri (eager url) — kart başına temsilci oyun ikonu seç ---
const folders: Record<string, Record<string, string>> = {
  gems: import.meta.glob('../../assets/gems/*.png', { eager: true, query: '?url', import: 'default' }),
  currency: import.meta.glob('../../assets/currency/*.png', { eager: true, query: '?url', import: 'default' }),
  items: import.meta.glob('../../assets/items/*.png', { eager: true, query: '?url', import: 'default' }),
  uniques: import.meta.glob('../../assets/uniques/*.png', { eager: true, query: '?url', import: 'default' }),
  atlas: import.meta.glob('../../assets/atlas/*.png', { eager: true, query: '?url', import: 'default' }),
  bosses: import.meta.glob('../../assets/bosses/*.png', { eager: true, query: '?url', import: 'default' }),
  mechanics: import.meta.glob('../../assets/mechanics/*.png', { eager: true, query: '?url', import: 'default' }),
  passives: import.meta.glob('../../assets/passives/*.png', { eager: true, query: '?url', import: 'default' }),
  ascendancies: import.meta.glob('../../assets/ascendancies/*.png', { eager: true, query: '?url', import: 'default' }),
  rewards: import.meta.glob('../../assets/rewards/*.png', { eager: true, query: '?url', import: 'default' }),
  questitems: import.meta.glob('../../assets/questitems/*.png', { eager: true, query: '?url', import: 'default' })
}
// klasörden tercih-regex'e uyan ilk ikon (yoksa ilk); hiçbiri yoksa null (placeholder)
function pick(folder: string, prefer?: RegExp): string | null {
  const entries = Object.entries(folders[folder] || {})
  if (!entries.length) return null
  if (prefer) {
    const hit = entries.find(([p]) => prefer.test((p.split('/').pop() as string)))
    if (hit) return hit[1]
  }
  return entries[0][1]
}

interface Card {
  mode: string
  icon: string | null
  tr: { t: string; d: string }
  en: { t: string; d: string }
}
// 19 ana bölüm. Adlar EN kuralına uygun (özel adlar EN; başlık/açıklama TR/EN). mode = gidilecek sekme.
const cards: Card[] = [
  { mode: 'gems', icon: pick('gems', /Fireball|Spark/i), tr: { t: 'Taşlar', d: 'Skill + support taşları; etiket, açıklama, renk. EN/TR arama.' }, en: { t: 'Gems', d: 'Skill + support gems; tags, descriptions, colors. EN/TR search.' } },
  { mode: 'currency', icon: pick('currency', /Orb|Divine|Chaos/i), tr: { t: 'Para Birimi', d: 'Currency, essence, fosil, rune ve etkileri.' }, en: { t: 'Currency', d: 'Currency, essences, fossils, runes and their effects.' } },
  { mode: 'items', icon: pick('items', /Bow0|1HSword/i), tr: { t: 'Eşyalar', d: 'Ekipman tabanları; sınıf, slot, gereksinim, implicit.' }, en: { t: 'Items', d: 'Equipment bases; class, slot, requirements, implicit.' } },
  { mode: 'uniques', icon: pick('uniques'), tr: { t: 'Eşsizler', d: 'Unique eşyalar; modlar ve flavour metni.' }, en: { t: 'Uniques', d: 'Unique items; mods and flavour text.' } },
  { mode: 'mods', icon: pick('rewards', /AddModToRare/i), tr: { t: 'Özellikler', d: 'Mod havuzu; affix aileleri, tier merdiveni, item türü.' }, en: { t: 'Mods', d: 'Mod pool; affix families, tier ladders, item types.' } },
  { mode: 'areas', icon: pick('questitems', /Map|Atlas|Papers/i), tr: { t: 'Bölgeler', d: 'Kampanya + endgame bölgeleri; boss, bağlantı, walkthrough.' }, en: { t: 'Areas', d: 'Campaign + endgame zones; bosses, links, walkthrough.' } },
  { mode: 'ascendancies', icon: pick('ascendancies'), tr: { t: 'Yükselişler', d: '8 sınıf, 22 yükseliş ve pasif node’ları.' }, en: { t: 'Ascendancies', d: '8 classes, 22 ascendancies and their nodes.' } },
  { mode: 'passives', icon: pick('passives', /Life|Notable|Crit/i), tr: { t: 'Pasifler', d: 'Pasif ağaç node’ları; arama + görsel ağaç.' }, en: { t: 'Passives', d: 'Passive tree nodes; search + visual tree.' } },
  { mode: 'atlas', icon: pick('atlas', /EndgameMap1\.|Citadel|Tower/i), tr: { t: 'Atlas', d: 'Waystone, atlas node, tablet ve pinnacle içerik.' }, en: { t: 'Atlas', d: 'Waystones, atlas nodes, tablets and pinnacle content.' } },
  { mode: 'mechanics', icon: pick('mechanics', /^breach\.|^abyss\.|^ritual\./i), tr: { t: 'Mekanikler', d: 'Lig mekanikleri: Breach, Ritual, Expedition…' }, en: { t: 'Mechanics', d: 'League mechanics: Breach, Ritual, Expedition…' } },
  { mode: 'bosses', icon: pick('bosses', /^arbiter-of-ash\./i), tr: { t: 'Boss’lar', d: 'Pinnacle boss’lar; mekanik ve dikkat edilecekler.' }, en: { t: 'Bosses', d: 'Pinnacle bosses; mechanics and what to watch.' } },
  { mode: 'crafting', icon: pick('rewards', /UpgradeMagicToRare/i), tr: { t: 'Crafting', d: 'Craft akışları, bench, tarifler + Simülatör.' }, en: { t: 'Crafting', d: 'Craft flows, bench, recipes + Simulator.' } },
  { mode: 'crafting', icon: pick('currency', /Essence/i), tr: { t: 'Craft Simülatör', d: 'Yerel craft simülasyonu; gerçek currency harcanmaz.' }, en: { t: 'Craft Simulator', d: 'Local craft simulation; no real currency spent.' } },
  { mode: 'leveling', icon: pick('questitems', /Book|Skill/i), tr: { t: 'Leveling', d: 'Karakter ilerlemesi; Client.txt ile otomatik takip.' }, en: { t: 'Leveling', d: 'Character progress; auto-tracked via Client.txt.' } },
  { mode: 'build', icon: pick('gems', /LightningArrow|IceShot|Ranger/i), tr: { t: 'Build', d: 'PoB / Mobalytics / Maxroll / .build içe aktar; oyun görünümü.' }, en: { t: 'Build', d: 'Import PoB / Mobalytics / Maxroll / .build; game view.' } },
  { mode: 'build', icon: pick('rewards', /CoinPile|Coin/i), tr: { t: 'Fiyat / Trade', d: 'Ctrl+C + kısayol → ≈ tahmini değer + trade.' }, en: { t: 'Price / Trade', d: 'Ctrl+C + shortcut → ≈ estimated value + trade.' } },
  { mode: 'danger', icon: pick('bosses', /^arbiter-of-divinity\./i), tr: { t: 'Tehlike', d: 'Waystone modlarını build defansına göre değerlendir.' }, en: { t: 'Danger', d: 'Assess waystone mods vs your build’s defenses.' } },
  { mode: 'build', icon: pick('rewards', /Quality|Armour/i), tr: { t: 'Filter', d: 'Build’e özel loot filter üret (Build sekmesi).' }, en: { t: 'Filter', d: 'Generate a build-specific loot filter (Build tab).' } },
  { mode: 'chat', icon: pick('questitems', /Book|Tome/i), tr: { t: 'Sohbet / Yardım', d: 'Program veya PoE2 hakkında soru sor.' }, en: { t: 'Help / Chat', d: 'Ask about the app or PoE2.' } }
]

const version = ref('')
onMounted(async () => {
  version.value = (await window.api?.appVersion?.().catch(() => '')) || ''
})
function go(mode: string): void {
  emit('navigate', mode)
}
</script>

<template>
  <div class="hv">
    <!-- HERO -->
    <header class="hv-hero">
      <img :src="pobeLogo" class="hv-logo" alt="PoBe" />
      <div class="hv-hero-text">
        <h1 class="hv-name">Path of Berkay <span class="hv-ver">v{{ version || '…' }}</span></h1>
        <p class="hv-tag">
          {{ tr('PoE 2 için iki dilli veritabanı, build & craft araçları ve oyun-içi yardımcılar. Bir kart seç:', 'A bilingual database, build & craft tools and in-game helpers for PoE 2. Pick a card:') }}
        </p>
        <button class="hv-feedback" @click="emit('feedback')">
          💬 {{ tr('Geri bildirim / öneri gönder', 'Send feedback / suggestion') }}
        </button>
      </div>
    </header>

    <!-- KART GRID -->
    <div class="hv-grid">
      <button v-for="(c, i) in cards" :key="i" class="hv-card" @click="go(c.mode)">
        <span class="hv-card-thumb">
          <img v-if="c.icon" :src="c.icon" alt="" />
          <span v-else class="hv-card-ph">◆</span>
        </span>
        <span class="hv-card-text">
          <span class="hv-card-title">{{ isTr ? c.tr.t : c.en.t }}</span>
          <span class="hv-card-desc">{{ isTr ? c.tr.d : c.en.d }}</span>
        </span>
        <span class="hv-card-arrow">→</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.hv {
  height: calc(100vh - 96px);
  overflow-y: auto;
  padding: 22px 26px 40px;
  box-sizing: border-box;
}
.hv-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: 1180px;
  margin: 0 auto 22px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(122, 94, 44, 0.4);
}
.hv-logo {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(200, 160, 80, 0.5), 0 4px 16px rgba(0, 0, 0, 0.7);
  flex: none;
}
.hv-name {
  margin: 0;
  font-size: 28px;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: #ecc24a;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
  font-weight: 700;
}
.hv-ver {
  font-size: 14px;
  color: #9b8a6a;
  font-variant: normal;
  letter-spacing: 0;
}
.hv-tag {
  margin: 4px 0 0;
  font-size: 13.5px;
  color: #b6a576;
  max-width: 720px;
  line-height: 1.5;
}
.hv-feedback {
  margin-top: 9px;
  font-family: var(--font-serif);
  font-size: 12px;
  font-variant: small-caps;
  letter-spacing: 0.02em;
  color: var(--gem-teal);
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 5px 13px;
  cursor: pointer;
  border-radius: 4px;
}
.hv-feedback:hover {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
.hv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(255px, 1fr));
  gap: 14px;
  max-width: 1180px;
  margin: 0 auto;
}
.hv-card {
  display: flex;
  align-items: center;
  gap: 13px;
  text-align: left;
  padding: 13px 14px;
  border-radius: 9px;
  cursor: pointer;
  color: inherit;
  background: linear-gradient(150deg, rgba(40, 32, 17, 0.92), rgba(22, 17, 9, 0.92));
  border: 1px solid rgba(150, 120, 64, 0.42);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.3);
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.hv-card:hover {
  transform: translateY(-2px);
  border-color: rgba(232, 192, 116, 0.85);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(232, 192, 116, 0.35);
  background: linear-gradient(150deg, rgba(52, 41, 21, 0.96), rgba(28, 21, 11, 0.96));
}
.hv-card:active {
  transform: translateY(0);
}
.hv-card-thumb {
  flex: none;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: radial-gradient(circle at 50% 40%, rgba(90, 72, 36, 0.6), rgba(0, 0, 0, 0.5));
  border: 1px solid rgba(184, 154, 102, 0.5);
  overflow: hidden;
}
.hv-card-thumb img {
  width: 46px;
  height: 46px;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
}
.hv-card-ph {
  color: #c9a14a;
  font-size: 22px;
}
.hv-card-text {
  flex: 1;
  min-width: 0;
}
.hv-card-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #ecdcab;
  font-variant: small-caps;
  letter-spacing: 0.02em;
}
.hv-card-desc {
  display: block;
  font-size: 11.5px;
  color: #9f9072;
  line-height: 1.4;
  margin-top: 2px;
}
.hv-card-arrow {
  flex: none;
  color: #7a6336;
  font-size: 16px;
  transition: color 0.12s, transform 0.12s;
}
.hv-card:hover .hv-card-arrow {
  color: #ecc24a;
  transform: translateX(3px);
}
@media (max-width: 720px) {
  .hv-grid {
    grid-template-columns: 1fr;
  }
}
.hv::-webkit-scrollbar {
  width: 9px;
}
.hv::-webkit-scrollbar-thumb {
  background: #5a461f;
  border-radius: 4px;
}
.hv::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
}
</style>
