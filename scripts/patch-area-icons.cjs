/**
 * patch-area-icons.cjs — area-asset-map.json'a eksik boss + ödül ikonlarını ekler.
 * Mevcut girdiler EZİLMEZ (yalnız eksik anahtarlar eklenir). Sonra: npm run build:areas
 *
 * - bossIcons: area boss adı -> ikon (yalnız bosses.json'da görseli olanlar)
 * - rewardIconsByArea: bölge adı -> ödül ikon dizisi (rewards/questitems; basename çözülür)
 *   İlerleme-temelli (item olmayan) ödüller BOŞ bırakılır (uydurma yok).
 */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'area-asset-map.json');
const m = JSON.parse(fs.readFileSync(P, 'utf8'));
m.bossIcons ??= {};
m.rewardIconsByArea ??= {};

// --- 1) Boss ikonları: yalnız bosses.json'da gerçek görseli olan 2 boss ---
const bossAdd = {
  'Omniphobia, Fear Manifest': 'assets/bosses/omniphobia.png',
  'The King in the Mists': 'assets/bosses/king-in-the-mists.png'
};

// --- 2) Ödül ikonları: bölge -> ikon(lar). Ödül semantiğine göre eşleştirildi. ---
const rewardAdd = {
  'The Grelwood': ['assets/rewards/UncutSupportGem.png'],
  'The Grim Tangle': ['assets/rewards/UncutSupportGem.png'],
  'Hunting Grounds': ['assets/rewards/SkillPoint.png'],
  'Ogham Farmlands': ['assets/rewards/SkillPoint.png'],
  'The Manor Ramparts': ['assets/rewards/UncutSupportGem.png'],
  "Traitor's Passage": ['assets/questitems/DjinnFlaskFull.png'],
  'Valley of the Titans': ['assets/questitems/KaruiCharm.png'],
  'Path of Mourning': ['assets/rewards/UncutSupportGem.png'],
  'The Spires of Deshar': ['assets/rewards/LightningResistanceEssence.png'],
  'Dreadnought': ['assets/questitems/BookOfJamanra.png'],
  'Sandswept Marsh': ['assets/rewards/UncutSkillGem.png'],
  'Jungle Ruins': ['assets/rewards/SkillPoint.png'],
  'The Matlan Waterways': ['assets/rewards/RareBelt.png'],
  'Aggorat': ['assets/rewards/SkillPoint.png'],
  'Abandoned Prison': ['assets/questitems/FinnsPotion.png'],
  'Eye of Hinekora': ['assets/questitems/GrandManaRuneCharged.png'],
  'Singing Caverns': ['assets/questitems/ClamshellPearlQuestItem.png'],
  'Trial of the Ancestors': ['assets/rewards/SkillPoint.png'],
  'The Excavation': ['assets/questitems/SoleraisSpear.png'],
  "Plunder's Point": ['assets/questitems/ExpeditionLogbook1.png'],
  'The Blackwood': ['assets/rewards/Omen.png']
  // İlerleme ödülleri (item yok -> BOŞ): Temple of Kopec, The Black Chambers,
  // Heart of the Tribe, Holten Estate
};

let bAdded = 0, rAdded = 0;
for (const [k, v] of Object.entries(bossAdd)) if (!(k in m.bossIcons)) { m.bossIcons[k] = v; bAdded++; }
for (const [k, v] of Object.entries(rewardAdd)) if (!(k in m.rewardIconsByArea)) { m.rewardIconsByArea[k] = v; rAdded++; }

fs.writeFileSync(P, JSON.stringify(m, null, 2) + '\n', 'utf8');
console.log(`bossIcons +${bAdded}, rewardIconsByArea +${rAdded}`);
