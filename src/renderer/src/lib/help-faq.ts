// help-faq.ts — anahtarsız (LLM yok) durumda program-kullanımı için gömülü yerel SSS.
// Keyword eşleşmeli; iki dilli. Kesin sayı/fiyat YOK (ilgili sekmeye yönlendirir). Uydurma yok.
export interface FaqEntry {
  keys: RegExp
  tr: string
  en: string
}

export const FAQ: FaqEntry[] = [
  {
    keys: /\b(build|pob|path of building|import|içe aktar|maxroll|mobalytics)\b/i,
    tr: 'Build içe aktarmak: **Build** sekmesine git → Path of Building (PoE2) export kodunu yapıştır ya da Maxroll/Mobalytics build linkini yapıştır. Gear, gem, pasif ağaç ve leveling aşamaları görünür. "Create .build" ile oyun-içi BuildPlanner\'a aktarır, "Bu build için filter oluştur" ile build\'e özel loot filter üretir.',
    en: 'Importing a build: open the **Build** tab → paste a Path of Building (PoE2) export code, or paste a Maxroll/Mobalytics build link. You\'ll see gear, gems, the passive tree and leveling stages. "Create .build" exports to the in-game BuildPlanner; "Create filter for this build" generates a build-specific loot filter.'
  },
  {
    keys: /\b(fiyat|price|değer|value|kaç|worth|trade|sat)\b/i,
    tr: 'Fiyat kontrolü: Oyunda eşyaya gel → KENDİ Ctrl+C\'nle kopyala → kısayola bas (varsayılan Ctrl+D). Overlay benzer ilanlardan ≈ tahmini değer gösterir ve trade\'de açabilir. Overlay yalnız oyun Borderless/Windowed Fullscreen modundayken görünür. Değer her zaman "≈ tahmini".',
    en: 'Price check: hover an item in game → press Ctrl+C yourself → press the shortcut (default Ctrl+D). The overlay shows an ≈ estimated value from similar listings and can open trade. The overlay only appears when the game runs in Borderless/Windowed Fullscreen. Value is always "≈ estimate".'
  },
  {
    keys: /\b(tehlike|danger|waystone|map|harita|tehlikeli|güvenli)\b/i,
    tr: 'Tehlike kontrolü: Endgame\'de waystone\'a gel → Ctrl+C → kısayol (varsayılan Ctrl+E); ya da **Tehlike** sekmesine metni yapıştır / "Panodan al" → takip ettiğin build\'in defansına göre GÜVENLİ/DİKKAT/TEHLİKELİ + mod-başına gerekçe. Heuristik (garanti değil).',
    en: 'Danger check: in endgame hover a waystone → Ctrl+C → shortcut (default Ctrl+E); or paste the text in the **Tehlike** (Danger) tab / "From clipboard" → SAFE/CAUTION/DANGEROUS vs your tracked build\'s defenses with per-mod reasons. Heuristic (not guaranteed).'
  },
  {
    keys: /\b(craft|üret|simül|simulator|currency|essence|orb|roll|mod ekle)\b/i,
    tr: 'Craft Simülatörü: **Crafting** sekmesi → Simülatör. Taban + ilvl seç, currency/essence/omen/rune/vaal/kalite uygula, hedef tanımla; Usta Craft Yardımcısı en iyi adımı önerir. Tamamen yerel — gerçek currency harcanmaz, oyunla/ağla etkileşim yok.',
    en: 'Craft Simulator: **Crafting** tab → Simulator. Pick a base + ilvl, apply currency/essence/omen/rune/vaal/quality, set a target; the Master Craft advisor suggests the best step. Fully local — no real currency spent, no game/network interaction.'
  },
  {
    keys: /\b(filter|loot|.filter)\b/i,
    tr: 'Loot filter: **Build** sekmesinde bir build varken "Bu build için filter oluştur" → sıkılık + tema + efekt seç → "Oluştur ve kaydet". .filter, Documents/My Games/Path of Exile 2/ klasörüne yazılır ve oyun-içi filter listesinde görünür.',
    en: 'Loot filter: in the **Build** tab with a build loaded, click "Create filter for this build" → choose strictness + theme + effects → "Create & save". The .filter is written to Documents/My Games/Path of Exile 2/ and appears in the in-game filter list.'
  },
  {
    keys: /\b(llm|api|anahtar|key|claude|openai|chatgpt|gemini|sağlayıcı|provider)\b/i,
    tr: 'LLM sağlayıcı: **Ayarlar** → Akıllı Çözücü\'de Claude / ChatGPT / Gemini seç + KENDİ anahtarını gir (her sağlayıcının yanında "Anahtar nasıl alınır?" rehberi var). Anahtar yalnız bu cihazda kalır; sadece görev/soru metni gönderilir, kişisel veri gitmez. Anahtar yoksa Offline çözücü ücretsiz çalışır.',
    en: 'LLM provider: **Settings** → in the Smart Solver pick Claude / ChatGPT / Gemini + enter your OWN key (each provider has a "How to get a key?" guide). The key stays on this device; only the task/question text is sent, no personal data. Without a key, the free Offline solver still works.'
  },
  {
    keys: /\b(overlay|borderless|fullscreen|görün|göster|kısayol|shortcut)\b/i,
    tr: 'Overlay\'ler (fiyat/tehlike/leveling) yalnız oyun **Windowed Fullscreen / Borderless** modundayken görünür (exclusive Fullscreen\'de hiçbir overlay görünmez). Kısayolları **Ayarlar**\'dan değiştirebilirsin.',
    en: 'Overlays (price/danger/leveling) only appear when the game runs in **Windowed Fullscreen / Borderless** mode (no overlay shows in exclusive Fullscreen). You can change the shortcuts in **Settings**.'
  },
  {
    keys: /\b(dil|language|türkçe|english|ingilizce|çeviri)\b/i,
    tr: 'Dil: sağ üstteki dil düğmesi ya da **Ayarlar** ile TR/EN geçişi. TR modunda özel adlar (gem/eşya/eşsiz/boss) İngilizce kalır, açıklamalar Türkçe gösterilir.',
    en: 'Language: toggle TR/EN via the language button at top-right or in **Settings**. In TR mode, proper names (gems/items/uniques/bosses) stay in English while descriptions are shown in Turkish.'
  },
  {
    keys: /\b(leveling|seviye|level|act|bölge ilerle|client\.txt)\b/i,
    tr: 'Leveling Tracker: **Leveling** sekmesi kampanya bölgelerini sırayla gösterir. Client.txt\'yi seçersen karakter seviyen otomatik takip edilir (yalnız log okuma; hafıza okuma/otomasyon YOK).',
    en: 'Leveling Tracker: the **Leveling** tab lists campaign zones in order. If you select Client.txt, your character level is auto-tracked (log reading only; no memory reading/automation).'
  }
]

/** Soruya en uygun yerel SSS cevabı (yoksa null). */
export function localAnswer(question: string, isTr: boolean): string | null {
  const q = question || ''
  for (const e of FAQ) if (e.keys.test(q)) return isTr ? e.tr : e.en
  return null
}
