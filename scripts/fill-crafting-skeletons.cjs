// Doldurur: crafting.json'daki 4 needs-verification iskelet kaydı.
// Kaynak: 0.5 crafting referans araştırması.
// Güven etiketleri prose içine gömülür; renderer'da confidence alanı yok.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'src', 'data', 'crafting.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const M = 'Metadata/Items/Currency/';
const alloys = Array.from({ length: 13 }, (_, i) => M + 'CurrencyVerisiumAlloy' + (i + 1));
const bones = [
  'AbyssalBenchTicketWeaponLow', 'AbyssalBenchTicketWeapon', 'AbyssalBenchTicketWeaponHigh',
  'AbyssalBenchTicketArmourLow', 'AbyssalBenchTicketArmour', 'AbyssalBenchTicketArmourHigh',
  'AbyssalBenchTicketJewelleryLow', 'AbyssalBenchTicketJewellery', 'AbyssalBenchTicketJewelleryHigh',
  'AbyssalBenchTicketJewel', 'AbyssalBenchTicketWaystone'
].map((x) => M + x);

const updates = {
  'skeleton-runeforging': {
    en: 'Runeforging & Verisium (Runes of Aldur)',
    tr: 'Runeforging ve Verisium (Runes of Aldur)',
    status: 'ok',
    icon: 'assets/currency/RefinedVerisium.png',
    desc_en:
      "The 0.5 'Runes of Aldur' crafting layer built around Verisium — a material-and-currency that drops from monsters raised in Ezomyte Remnant encounters and is first found in Act 1 beneath the Tree of Souls. At the Verisium Anvil (unlocked via Farrow's 'The Runeseeker' quest in Act 1) you spend Verisium to add Runic Ward to non-unique armour, and later (Act 3) to upgrade the base type of low drop-level (<55) unique weapons and armour. Runic Ward is a separate last-line defence pool: when damage would drop you to 0 Life you are instead left at 1 Life and Runic Ward absorbs the rest, regenerating at 5% of its maximum per second. Armour below item level 55 gains Runic Ward for free; level 55+ armour sacrifices part of its existing defences. The system also adds 13 Alloy currencies (unlocked after Farrow's Act 2 quest) that each replace one modifier on a rare with a guaranteed Alloy-only modifier, plus 13 Ancient and 13 Mythical Runes (over 100 socketable runes in total). Specific Alloy effects and the rune→orb 'Runeshape' recipes are single-source (third-party guides) — verify in-game.",
    desc_tr:
      "0.5 'Runes of Aldur'un Verisium etrafında kurulan crafting katmanı. Verisium hem materyal hem currency'dir; Ezomyte Kalıntı (Remnant) karşılaşmalarında dirilen yaratıklardan düşer ve ilk kez Bölüm 1'de Tree of Souls'un altında bulunur. Verisium Anvil'da (Bölüm 1'de Farrow'un 'The Runeseeker' göreviyle açılır) Verisium harcayarak unique olmayan zırha Runic Ward eklersin; ileride (Bölüm 3) düşük drop seviyeli (<55) unique silah ve zırhların taban tipini yükseltirsin. Runic Ward ayrı bir son-savunma havuzudur: seni 0 Cana düşürecek hasar geldiğinde 1 Canda kalırsın ve kalanı Runic Ward emer; saniyede maksimumunun %5'i kadar yenilenir. Eşya seviyesi 55 altı zırh Runic Ward'u bedelsiz kazanır; 55+ zırh mevcut savunmasının bir kısmını feda eder. Sistem ayrıca 13 Alloy currency ekler (Farrow'un Bölüm 2 göreviyle açılır); her biri bir nadir eşyadaki bir özelliği kaldırıp yerine yalnızca Alloy'larla gelen garantili bir özellik koyar. Buna ek olarak 13 Ancient ve 13 Mythical Rune (toplam 100+ soketlenebilir rune) gelir. Alloy etkileri ve rune→küre 'Runeshape' recipe'leri tek kaynaklıdır (üçüncü taraf rehberler) — oyun içinde doğrula.",
    steps_en: [
      "Act 1: find/rescue Farrow and start 'The Runeseeker'; collect three Runestones (last in the Ogham Farmlands) and meet Farrow at the Grelwood. [verified]",
      'Enter the Lost Catacombs beneath the Tree of Souls and clear the Runic Vault — this introduces Verisium and unlocks the Verisium Anvil at Clearfell Camp.',
      'At the Verisium Anvil, select a non-unique armour piece and spend Verisium to add Runic Ward. Below item level 55 it is free; at 55+ some Evasion/Energy Shield is sacrificed. (Cost examples ~20 Verisium low-level / ~470 for a high-level Austere Garb are single-source.)',
      "After Farrow's Act 2 quest, unlock the 13 Alloys: applying one to a rare removes a random modifier and adds a guaranteed Alloy-only modifier (it counts as the item's single crafted modifier).",
      'Optional rune→orb recipes (single-source, verify in-game): Tempest + Lightning → Orb of Augmentation; Earth + Arcane + Tidal → Regal Orb; Death + Soul + Power + Life → Divine Orb.',
      "Aldur's Legacy (unique→rune): socket an Aldur's Legacy rune into an empty Augment slot of a non-corrupted Kalguuran/Ezomyte unique to destroy it and create a reduced 'Legacy' rune, which you socket into another item of the same base for a weaker version of the original."
    ],
    steps_tr: [
      "Bölüm 1: Farrow'u bul/kurtar ve 'The Runeseeker' görevini başlat; üç Runestone topla (sonuncusu Ogham Farmlands'te) ve Grelwood'da Farrow ile buluş. [doğrulandı]",
      'Tree of Souls altındaki Lost Catacombs\'a gir ve Runic Vault\'u temizle — bu Verisium\'u tanıtır ve Clearfell Camp\'taki Verisium Anvil\'ı açar.',
      'Verisium Anvil\'da unique olmayan bir zırh parçası seç ve Verisium harcayarak Runic Ward ekle. Eşya seviyesi 55 altında bedelsizdir; 55+ ise bir miktar Evasion/Energy Shield feda edilir. (Maliyet örnekleri: düşük seviyede ~20 Verisium, yüksek seviye bir Austere Garb için ~470 — tek kaynak.)',
      "Farrow'un Bölüm 2 göreviyle 13 Alloy açılır: birini bir nadir eşyaya uygulamak rastgele bir özelliği kaldırıp garantili bir Alloy özelliği ekler (eşyanın tek crafted özelliği sayılır).",
      'İsteğe bağlı rune→küre recipe\'leri (tek kaynak, oyun içi doğrula): Tempest + Lightning → Güçlendirme Küresi (Augmentation); Earth + Arcane + Tidal → Asalet Küresi (Regal); Death + Soul + Power + Life → İlahi Küre (Divine).',
      "Aldur's Legacy (unique→rune): bir Aldur's Legacy rune'unu, corrupted olmayan bir Kalguuran/Ezomyte unique'in boş Augment yuvasına soketle; eşya yok edilir ve küçültülmüş bir 'Legacy' rune oluşur. Bu rune'u aynı tabandan başka bir eşyaya soketleyerek orijinalin zayıf bir sürümünü kazanırsın."
    ],
    related: [M + 'CurrencyVerisiumMetal1', ...alloys],
    source:
      "compass 0.5 referansı · 1.1 Runeforging/Verisium · Runic Ward %5/sn + lvl 55 zırh eşiği [DOĞRULANDI: resmî patch notları] · Alloy etkileri & rune→orb recipe'leri & maliyetler [TEK KAYNAK — oyun içi doğrula]"
  },

  'skeleton-desecration': {
    en: 'Desecration & Abyssal Bones (0.3, core in 0.5)',
    tr: 'Desecration ve Abyssal Kemikler (0.3, 0.5\'te core)',
    status: 'ok',
    icon: 'assets/currency/AncientRibs.png',
    desc_en:
      "Note: this system was added in patch 0.3 'Rise of the Abyssal' and is core (permanent) content in 0.5 — it is not a 0.5 league mechanic. Its one big 0.5 change is the single crafted-modifier rule. Abyssal Bones are currency-like items you right-click onto a matching rare (no bench needed), adding one hidden 'Unrevealed Desecrated Modifier'. There are 11 bones: Gnawed/Preserved/Ancient versions of Jawbone (weapons & quivers), Rib (armour) and Collarbone (rings, amulets, belts), plus Preserved Cranium (jewels) and Preserved Vertebrae (waystones). Gnawed works only on item level ≤64; Preserved works on any ilvl with a random Desecrated mod; Ancient guarantees a Desecrated mod of at least level 40. To reveal the hidden mod you visit the Well of Souls (reached via Mastodon Badlands → Lightless Passage in Act 2) and pick one of three options. Desecrated modifiers come from three Lich pools — Amanamu, Kurgal and Ulaman. Under 0.5's single crafted-modifier rule an item can hold only one crafted/Desecrated modifier (single-source for the exact effect).",
    desc_tr:
      "Not: bu sistem patch 0.3 'Rise of the Abyssal' ile eklendi ve 0.5'te core (kalıcı) içeriktir — bir 0.5 lig mekaniği değildir. 0.5'teki tek büyük değişiklik, tek crafted-modifier kuralıdır. Abyssal Kemikler currency gibi kullanılan eşyalardır; uygun bir nadir eşyaya sağ tıklayıp uygularsın (bench gerekmez) ve bir gizli 'Açığa Çıkmamış Desecrated Özellik' eklenir. 11 kemik vardır: Jawbone (silah & sadak), Rib (zırh) ve Collarbone (yüzük, amulet, kemer) için Gnawed/Preserved/Ancient sürümleri, artı Preserved Cranium (jewel) ve Preserved Vertebrae (waystone). Gnawed yalnızca eşya seviyesi ≤64'te çalışır; Preserved her seviyede rastgele bir Desecrated özellik verir; Ancient en az seviye 40 garantili bir Desecrated özellik verir. Gizli özelliği açığa çıkarmak için Well of Souls'a gidilir (Bölüm 2'de Mastodon Badlands → Lightless Passage) ve sunulan üç seçenekten biri seçilir. Desecrated özellikler üç Lich havuzundan gelir — Amanamu, Kurgal ve Ulaman. 0.5'in tek crafted-modifier kuralı altında bir eşya yalnızca tek bir crafted/Desecrated özellik taşıyabilir (tam etki tek kaynak).",
    steps_en: [
      'Note: 0.3 content, core in 0.5. In a zone, find a green Abyssal fissure and kill nearby monsters; the fissures close and Abyssal monsters spawn.',
      'Close all fissures to open the Pit, then defeat the stronger monsters until the Abyssal Trove rises and drops Abyssal Bones (Abyssal Armoury → armour + Rib; Abyssal Arsenal → weapons + Jawbone).',
      'Right-click a bone onto a matching rare item — no bench needed. With a free slot it behaves like an Exalted Orb; on a full 6-mod item it behaves like a Chaos Orb (removes one mod, adds the hidden Desecrated mod).',
      'Go to the Well of Souls (Act 2: Mastodon Badlands → Lightless Passage, after speaking to the Lurking Creature) and choose Reveal.',
      'Pick one of the three offered modifiers and Confirm — this is permanent. An Omen of Abyssal Echoes can reroll the options once (expensive, ~99 Exalted, single-source).',
      "Endgame: desecrate Waystones with Preserved Vertebrae; Kulemak's Invitation grants access to the Vessel of Kulemak pinnacle boss."
    ],
    steps_tr: [
      'Not: 0.3 içeriği, 0.5\'te core. Bir bölgede yeşil bir Abyssal yarık (fissure) bul ve yakındaki yaratıkları öldür; yarıklar kapanır ve Abyssal yaratıklar çıkar.',
      'Tüm yarıkları kapatıp Pit\'i aç, sonra daha güçlü yaratıkları yenerek Abyssal Trove\'un (sandık) yükselmesini sağla; Abyssal Kemikler düşer (Abyssal Armoury → zırh + Rib; Abyssal Arsenal → silah + Jawbone).',
      'Bir kemiği uygun nadir eşyaya sağ tıklayıp uygula — bench gerekmez. Boş yuva varsa Yüce Küre (Exalted) gibi davranır; 6 özelliği dolu eşyada Kaos Küresi (Chaos) gibi davranır (bir özelliği kaldırır, gizli Desecrated özelliği ekler).',
      'Well of Souls\'a git (Bölüm 2: Mastodon Badlands → Lightless Passage, Lurking Creature ile konuştuktan sonra) ve Reveal\'ı seç.',
      'Sunulan üç özellikten birini seç ve Confirm\'le — bu kalıcıdır. Omen of Abyssal Echoes ile seçenekler bir kez yeniden çevrilebilir (pahalı, ~99 Exalted, tek kaynak).',
      "Endgame: Preserved Vertebrae ile Waystone'ları desecrate et; Kulemak's Invitation, Vessel of Kulemak pinnacle boss'una erişim verir."
    ],
    related: bones,
    source:
      "compass 0.5 referansı · 1.2 Desecration [DÜZELTME: 0.3 'Rise of the Abyssal' içeriği, 0.5'te CORE] · 11 bone + Lich havuzları (Amanamu/Kurgal/Ulaman) [DOĞRULANDI] · 0.5 tek-crafted-mod etkisi & reroll maliyeti [TEK KAYNAK]"
  },

  'skeleton-genesis-nodes': {
    en: 'Genesis Tree — Node List (partial, full list not public)',
    tr: 'Genesis Tree — Node Listesi (kısmî, tam liste kamuya açık değil)',
    status: 'ok',
    icon: 'assets/currency/BreachstoneSplinter.png',
    desc_en:
      "Important: as of June 2026 there is NO public, complete, verified node list for the PoE2 0.5 Genesis Tree. Long lists circulating online (Recessive Genes, Wild Growth, etc.) belong to PoE1 and must not be used here. The Genesis Tree is a deterministic Breach crafting system unlocked through Ailith at the Monastery of the Keepers after your first Breach. It uses two resources: Hiveblood (untradeable fuel from Breach) and Wombgift (a craft 'template' dropped by Breach mini-bosses). You place a Wombgift in its Womb, spend points, then spend Hiveblood to 'grow' the item; respec is free. Most sources describe 5 Wombs (some say 4 branches with Breachstone separate): Currency (Lavish Wombgift, the 'Exalted Path'), Amulet (Ornate), Ring (Signet), Belt (Banded) and a Breachstone Womb (Revelatory Wombgift, auto-created from 300 Breach Splinters). Only a few nodes are confirmed; the total node count is unverified.",
    desc_tr:
      "Önemli: Haziran 2026 itibarıyla PoE2 0.5 Genesis Tree için kamuya açık, eksiksiz ve doğrulanmış bir node listesi YOKTUR. İnternette dolaşan uzun listeler (Recessive Genes, Wild Growth vb.) PoE1'e aittir ve burada kullanılmamalıdır. Genesis Tree, Breach'e bağlı deterministik bir crafting sistemidir; Monastery of the Keepers'taki Ailith üzerinden, ilk Breach'ten sonra açılır. İki kaynak kullanır: Hiveblood (takas edilemez, Breach'ten gelen yakıt) ve Wombgift (Breach mini-boss'larından düşen craft 'şablonu'). Wombgift'i ilgili Womb'a yerleştirir, puan dağıtır, sonra Hiveblood harcayıp eşyayı 'büyütürsün'; respec ücretsizdir. Çoğu kaynak 5 Womb tarif eder (bazıları Breachstone ayrı olmak üzere 4 dal der): Currency (Lavish Wombgift, 'Exalted Path'), Amulet (Ornate), Ring (Signet), Belt (Banded) ve Breachstone Womb (Revelatory Wombgift, 300 Breach Splinter'dan otomatik oluşur). Yalnızca birkaç node doğrulanmıştır; toplam node sayısı doğrulanamadı.",
    steps_en: [
      'Womb structure (most sources; some say 4 branches): Currency Womb (Lavish Wombgift → currency), Amulet Womb (Ornate), Ring Womb (Signet), Belt Womb (Banded), Breachstone Womb (Revelatory, from 300 Breach Splinters).',
      "Confirmed node — 'For the Price of One' (Currency / Exalted Path): when you produce an Exalted Orb it grants an extra second Exalted Orb. [verified]",
      "Confirmed node — 'Imbue the Body' (Amulet): guarantees one chosen resistance on every crafted amulet; a follow-up node raises that resistance's minimum mod tier. [verified]",
      "Single-source node — 'Bloodstone Amulet' (Amulet): lets an Ornate Wombgift skip an unwanted base (exact mechanic unclear). [single-source]",
      'Breach Ring quality cap is contradictory across sources: ~50% standard vs up to 65% with a currency-branch / max-quality mod — verify in-game. [conflicting]',
      "Hiveblood costs are single-source: e.g. ~1,458 for an ilvl 84 guarantee, ~1,700-1,800 mid-tier, ~186 at low level (lvl 67). Note: 'Exquisite Design' and 'Reactive Hiveseeding' are Breach ATLAS-tree nodes, not Genesis nodes. Full node list not public — verify in-game."
    ],
    steps_tr: [
      'Womb yapısı (çoğu kaynak; bazıları 4 dal der): Currency Womb (Lavish Wombgift → currency), Amulet Womb (Ornate), Ring Womb (Signet), Belt Womb (Banded), Breachstone Womb (Revelatory, 300 Breach Splinter\'dan).',
      "Doğrulanan node — 'For the Price of One' (Currency / Exalted Path): bir Yüce Küre (Exalted) ürettiğinde ekstra ikinci bir Yüce Küre daha verir. [doğrulandı]",
      "Doğrulanan node — 'Imbue the Body' (Amulet): her craft edilen amulette seçilen bir direnci garanti eder; takip node'u o direncin minimum mod tier'ını yükseltir. [doğrulandı]",
      "Tek kaynak node — 'Bloodstone Amulet' (Amulet): bir Ornate Wombgift'in istenmeyen bir base'i atlamasını sağlar (kesin mekanik belirsiz). [tek kaynak]",
      'Breach Ring kalite tavanı kaynaklar arası çelişkili: standart ~%50, currency-dalı / maks-kalite mod ile %65\'e kadar — oyun içi doğrula. [çelişkili]',
      "Hiveblood maliyetleri tek kaynaklı: ör. ilvl 84 garantisi için ~1.458, orta seviye ~1.700-1.800, düşük seviye (lvl 67) ~186. Not: 'Exquisite Design' ve 'Reactive Hiveseeding' Genesis değil, Breach ATLAS ağacı node'larıdır. Tam node listesi kamuya açık değil — oyun içi doğrula."
    ],
    related: [M + 'CurrencyBreachShard'],
    source:
      "compass 0.5 referansı · 1.3 Genesis Tree · TAM NODE LİSTESİ KAMUYA AÇIK DEĞİL (PoE1 node'ları DIŞLANDI) · For the Price of One / Imbue the Body [DOĞRULANDI] · kalite tavanı %50/%65 [ÇELİŞKİLİ] · Hiveblood maliyetleri [TEK KAYNAK]"
  },

  'skeleton-tier-thresholds': {
    en: 'Greater/Perfect Tier Thresholds',
    tr: 'Ulu/Kusursuz Kademe Eşikleri',
    status: 'ok',
    icon: 'assets/currency/CurrencyUpgradeToMagic.png',
    desc_en:
      "Greater and Perfect orbs guarantee a minimum modifier level (the mod's required level, not its tier). The thresholds split into two groups: Transmutation & Augmentation (magic-craft orbs) → Greater 44, Perfect 70; Regal, Chaos & Exalted (rare-craft orbs) → Greater 35, Perfect 50. In 0.5 Greater Transmutation/Augmentation dropped from a minimum modifier level of 55 to 44 and can now begin dropping in Act 4. A rare item still holds at most 6 modifiers (3 prefix + 3 suffix), but under 0.5's single crafted-modifier rule only one may be a crafted modifier — Essences, Perfect Essences and the new Alloys all share that single crafted slot. These threshold numbers are verified (official 0.5 patch notes + domistae codex).",
    desc_tr:
      "Ulu (Greater) ve Kusursuz (Perfect) küreler garantili bir minimum özellik seviyesi (mod'un gerektirdiği seviye, tier'ı değil) sağlar. Eşikler iki gruba ayrılır: Dönüştürme & Güçlendirme (magic-craft küreleri) → Greater 44, Perfect 70; Asalet, Kaos & Yüce (rare-craft küreleri) → Greater 35, Perfect 50. 0.5'te Greater Dönüştürme/Güçlendirme'nin minimum özellik seviyesi 55'ten 44'e düştü ve artık Bölüm 4'te düşmeye başlayabilir. Bir nadir eşya hâlâ en fazla 6 özellik tutar (3 önek + 3 sonek), ama 0.5'in tek crafted-modifier kuralı altında bunlardan yalnızca biri crafted olabilir — Essence'lar, Perfect Essence'lar ve yeni Alloy'lar bu tek crafted yuvayı paylaşır. Bu eşik sayıları doğrulanmıştır (resmî 0.5 patch notları + domistae codex).",
    steps_en: [
      'Orb of Transmutation — Greater: min modifier level 44 (0.5; was 55), Perfect: 70. [verified]',
      'Orb of Augmentation — Greater: 44 (0.5; was 55), Perfect: 70. [verified]',
      'Regal Orb — Greater: 35, Perfect: 50. [verified]',
      'Chaos Orb — Greater: 35, Perfect: 50. [verified]',
      'Exalted Orb — Greater: 35, Perfect: 50. [verified]',
      'Rune merging is a 3-to-1 chain: 3 Lesser → 1 Standard, 3 Standard → 1 Greater. Runes have no Perfect tier (only Lesser/Standard/Greater). [single-source]',
      "Single crafted-modifier rule (0.5): an item can have only one crafted modifier; Essences, Perfect Essences and Alloys each occupy that one slot and overwrite an existing crafted/Essence mod. Rare items still cap at 6 mods total. [verified]"
    ],
    steps_tr: [
      'Dönüştürme Küresi (Transmutation) — Greater: minimum özellik seviyesi 44 (0.5; eskiden 55), Perfect: 70. [doğrulandı]',
      'Güçlendirme Küresi (Augmentation) — Greater: 44 (0.5; eskiden 55), Perfect: 70. [doğrulandı]',
      'Asalet Küresi (Regal) — Greater: 35, Perfect: 50. [doğrulandı]',
      'Kaos Küresi (Chaos) — Greater: 35, Perfect: 50. [doğrulandı]',
      'Yüce Küre (Exalted) — Greater: 35, Perfect: 50. [doğrulandı]',
      'Rune birleştirme 3-e-1 zinciridir: 3 Lesser → 1 Standard, 3 Standard → 1 Greater. Rune\'larda Perfect kademesi yoktur (yalnızca Lesser/Standard/Greater). [tek kaynak]',
      "Tek crafted-modifier kuralı (0.5): bir eşya yalnızca tek bir crafted özellik taşıyabilir; Essence'lar, Perfect Essence'lar ve Alloy'lar bu tek yuvayı kaplar ve mevcut bir crafted/Essence özelliğin üzerine yazar. Nadir eşyalar yine toplam 6 özellikle sınırlıdır. [doğrulandı]"
    ],
    related: [
      M + 'CurrencyUpgradeToMagic', M + 'CurrencyAddModToMagic',
      M + 'CurrencyUpgradeMagicToRare', M + 'CurrencyRerollRare', M + 'CurrencyAddModToRare'
    ],
    source:
      'compass 0.5 referansı · 1.4 Greater/Perfect eşikleri (Transmute/Augment 44/70 · Regal/Chaos/Exalt 35/50) [DOĞRULANDI: resmî 0.5 patch notları + domistae codex] · 3-e-1 rune zinciri [TEK KAYNAK]'
  }
};

let changed = 0;
for (const rec of data) {
  const u = updates[rec.id];
  if (!u) continue;
  Object.assign(rec, u);
  rec.tr_status = 'proposed';
  rec.last_updated = '2026-06-05';
  changed++;
}

if (changed !== 4) {
  console.error('BEKLENEN 4 kayıt güncellenmedi, güncellenen:', changed);
  process.exit(1);
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('OK — 4 kayıt güncellendi. Toplam kayıt:', data.length);
