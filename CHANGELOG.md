# Path of Berkay — Değişiklik Günlüğü / Changelog

> Sürüm notları hem uygulama-içi "Neler Değişti" bildiriminde hem de GitHub Releases açıklamasında gösterilir.
> Her sürüm iki dillidir (🇹🇷 Türkçe / 🇬🇧 English). En üstte en yeni sürüm.

## 0.19.3
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 💍 **Eşya base → ikon eşlemesi düzeldi.** "Iron Ring" gibi RARE eşyalar yanlış ikon (Mirror Ring) gösteriyordu; artık ikon, base_items veritabanından eşyanın gerçek adıyla TAM eşleşmeyle gelir (substring/fuzzy yok) — Iron Ring → Iron Ring, Sapphire Charm → Sapphire Charm (Sapphire Ring ile karışmaz). Tam eşleşme yoksa yanlış ikon değil "ikon yok".
- 🧩 **Tek merkezi ikon çözümleyici.** Build (oyun görünümü + liste) artık aynı merkezi fonksiyondan ikon alır → tüm görünümlerde tutarlı/doğru.
### 🇬🇧 English
#### 🐛 Fixes
- 💍 **Item base → icon mapping fixed.** RARE items like "Iron Ring" showed a wrong icon (Mirror Ring); icons now come from an EXACT match against the base_items DB by the item's real name (no substring/fuzzy) — Iron Ring → Iron Ring, Sapphire Charm → Sapphire Charm (no mix-up with Sapphire Ring). No exact match → "no icon" instead of a wrong one.
- 🧩 **Single central icon resolver.** The build (game view + list) now resolves icons through the same central function → consistent/correct across all views.

## 0.19.2
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🎖️ **Ascendancy node ikonları düzeldi.** Ağaçta ascendancy başlangıç node'u (örn. Deadeye) yanlışlıkla generic kırmızı yumruk ikonu gösteriyordu; artık ascendancy emblemini (kendi ikon setinden) gösterir. Eşleşmeyen ascendancy node'a yumruk değil nötr daire konur.
- 🔤 **Node adları İngilizce.** Özel-ad kuralı gereği pasif/ascendancy node adları (ve sınıf/ascendancy seçici) TR modunda da İngilizce kalır ("Deadeye", "Mirage Deadeye" — "Keskin Nişancı" değil); yalnız stat/açıklama metni Türkçe.
### 🇬🇧 English
#### 🐛 Fixes
- 🎖️ **Ascendancy node icons fixed.** The ascendancy start node (e.g. Deadeye) in the tree wrongly showed a generic red fist icon; it now shows the ascendancy emblem (from its own icon set). Unmatched ascendancy nodes get a neutral circle, not a fist.
- 🔤 **Node names in English.** Per the proper-name rule, passive/ascendancy node names (and the class/ascendancy picker) stay English in TR mode too ("Deadeye", "Mirage Deadeye" — not the translated form); only stat/description text is Turkish.

## 0.19.1
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🌳 **Pasif ağaç node ikonları artık görünüyor.** Eskiden uzak (varsayılan) yakınlaştırmada node'lar yalnızca renkli daireydi; ikonlar daha küçük zoom'da da çizilir. Eşleşmeyen/dosyası olmayan node'a yanlış ikon değil nötr daire gösterilir.
- 🖼️ **Ascendancy görseli artık doğru.** Ascendancy, tahsis edilen ascendancy node'larının ADLARINDAN açık eşlemeyle belirlenir (en yakın merkez tahmini kaldırıldı); ice-shot → Deadeye doğru emblemi.
- 🎒 **Eşya ikonları eksiksiz.** Build'de bazı eşyalar (özellikle flask/charm) boş ikon gösterebiliyordu; artık eşyanın gerçek adından bundled ikon da denenir (CDN gelmese bile görünür), eşleşmezse "ikon yok".
### 🇬🇧 English
#### 🐛 Fixes
- 🌳 **Passive tree node icons now show.** Previously at the default (zoomed-out) view nodes were just colored circles; icons now render at smaller zoom too. Unmatched/missing-file nodes show a neutral circle instead of a wrong icon.
- 🖼️ **Ascendancy image is now correct.** The ascendancy is determined from the NAMES of the allocated ascendancy nodes via an explicit mapping (nearest-center guessing removed); ice-shot → the correct Deadeye emblem.
- 🎒 **Complete item icons.** Some build items (especially flasks/charms) could show a blank icon; a bundled icon is now also resolved from the item's real name (visible even without CDN), with "no icon" only when nothing matches.

## 0.19.0
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🧭 **Seçili aşama/variant artık korunuyor.** Build sekmesinden başka sekmeye geçip dönünce seçtiğin variant (örn. "lvl 15-23") sıfırlanmıyor; elle seçtiğin variant kalıcı kalır ve karakter-seviyesi otomatik takibi onu ezmez.
- 💎 **Trade artık unique eşyaları bulur.** Unique bir eşyada "Trade'de Ara" → arama eşyanın ADIYLA + rarity (Unique) ile kurulur (rastgele stat'larla değil), böylece o unique gelir.
- 🖼️ **Ascendancy görselleri doğru.** Build görünümünde ascendancy/sınıf emblemi adından doğru eşlenir (örn. Deadeye); eşleşme yoksa yanlış görsel yerine "ikon yok" gösterilir.
- 🌳 **Pasif ağaç tam ekran.** Build'de pasif ağacı "Tam ekran" butonuyla büyütebilirsin; büyükken rahat yakınlaştır/kaydır ve node işaretleme çalışır (Esc ile kapanır).
- 🔍 **Eksik görseller azaltıldı.** Gem ikon eşleşmesi daha esnek (büyük/küçük harf, noktalama, "Support" eki) — daha çok gem ikonu görünür; eşleşmeyenlerde yine "ikon yok".
### 🇬🇧 English
#### 🐛 Fixes
- 🧭 **Selected stage/variant is now preserved.** Switching away from the Build tab and back no longer resets your chosen variant (e.g. "lvl 15-23"); a manually selected variant persists and character-level auto-tracking won't override it.
- 💎 **Trade now finds unique items.** "Search on Trade" for a unique builds the query by the item NAME + rarity (Unique) instead of random stats, so the unique actually shows up.
- 🖼️ **Ascendancy images are correct.** The ascendancy/class emblem in the build view is mapped from the name correctly (e.g. Deadeye); when nothing matches it shows "no icon" instead of a wrong image.
- 🌳 **Full-screen passive tree.** Enlarge the passive tree with a "Full screen" button in the Build view; zoom/pan comfortably and node marking works while enlarged (Esc to close).
- 🔍 **Fewer missing visuals.** Gem icon matching is more lenient (case, punctuation, "Support" suffix) so more gem icons resolve; unmatched ones still show "no icon".

## 0.18.5
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🔹 **Rünler artık okunur.** Ham id ("Runelightninglesser") yerine oyundaki gerçek ad (örn. "Lesser Storm Rune"), rune ikonu ve üstüne gelince etki tooltip'i (silahta/zırhta verdiği stat) gösterilir.
- 🖼️ **Yanlış eşya ikonları giderildi.** Mobalytics build'lerinde taban yalnızca sınıf adı olduğundan ("Ring" gibi) bazen yanlış genel ikon geliyordu; artık eşyaya özgü ikon kullanılır, eşleşmeyen olursa yanlış ikon yerine "ikon yok" gösterilir.
- 📐 **Ana bölümler öne çıkıyor.** İkincil kısımlar (içe aktarma kutusu, Yazar Notları, aşama/variant üst bölümü) build yüklenince varsayılan kapalı ve küçültülebilir; Ekipman / Yetenek Taşları / Pasif Ağaç tam genişlikte, ferah kartlarla ekranı kaplar. Aç/kapa durumları kayıtlı kalır.
### 🇬🇧 English
#### 🐛 Fixes
- 🔹 **Runes are now readable.** Instead of a raw id ("Runelightninglesser"), the real in-game name (e.g. "Lesser Storm Rune") is shown with the rune icon and a hover tooltip describing its effect (the stat it grants on a weapon/armour).
- 🖼️ **Wrong item icons fixed.** In Mobalytics builds the base is only a class name (like "Ring"), which sometimes produced a wrong generic icon; the item-specific icon is now used, and when none matches it shows "no icon" instead of a wrong one.
- 📐 **Main sections take focus.** Secondary parts (import box, Author Notes, stage/variant header) are collapsed by default and collapsible once a build is loaded; Equipment / Skill Gems / Passive Tree fill the screen full-width with roomy cards. Open/closed states are remembered.

## 0.18.4
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 📐 **Build ekranı bölümleri artık tam açılıyor.** Açılan accordion bölümleri (Ekipman / Yetenek Taşları / Pasif Ağaç) tek satıra sıkışıp sağdan kesiliyordu. Artık her açık bölüm tam yükseklikte render edilir, ekipman ve gem kartları çok satıra sarar (kesilmez) ve içerik için sayfa aşağı kayar.
### 🇬🇧 English
#### 🐛 Fixes
- 📐 **Build screen sections now expand fully.** Open accordion sections (Equipment / Skill Gems / Passive Tree) were squeezed into one row and cut off on the right. Each open section now renders at full height, equipment and gem cards wrap across multiple rows (no clipping), and the page scrolls for the content.

## 0.18.3
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- ☑️ **Bağlı kutucuk hatası giderildi.** Bir skill'in support gem'ini (ör. "Elemental Armament") işaretleyince başka skill'deki aynı isimli gem de işaretleniyordu. Artık her kutucuk gruba/sıraya özgü benzersiz anahtar kullanır → bağımsız işaretlenir (modlar için de aynısı).
- 📐 **Build ekranı yeniden düzenlendi.** Ekipman, Yetenek Taşları ve Pasif Ağaç artık yan yana sıkışmak yerine alt alta, tam genişlikte ve her biri aç/kapa (accordion) başlığıyla. Ekipman ve gem'ler ferah bir grid'e yayılır; aç/kapa durumu kayıtlı kalır.
- 🖼️ **Yanlış eşya ikonları düzeltildi.** Bazı slotlarda genel sınıf ikonu (ör. yüzük) doğru eşya ikonunu eziyordu; artık eşyaya özgü ikon tercih edilir.
- 🔹 **Rünler artık net.** Rün kaynaklı stat'ın yanında "🔹 Rün" rozeti, eşya kartında ayrı bir "Rünler" satırı (kaç soket, hangi rune takılı).
### 🇬🇧 English
#### 🐛 Fixes
- ☑️ **Linked-checkbox bug fixed.** Checking a skill's support gem (e.g. "Elemental Armament") also checked the same-named gem under another skill. Each checkbox now uses a key unique to its group/position → independent (same for item mods).
- 📐 **Build screen relaid out.** Equipment, Skill Gems and Passive Tree are now stacked full-width with collapsible (accordion) headers instead of being cramped side by side. Equipment and gems spread into a roomy grid; open/closed state is remembered.
- 🖼️ **Wrong item icons fixed.** On some slots a generic class icon (e.g. a ring) overrode the correct item icon; the item-specific icon is now preferred.
- 🔹 **Runes are now clear.** A "🔹 Rune" badge next to rune-sourced stats, plus a separate "Runes" line on the item card (socket count, which rune is fitted).

## 0.18.2
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🔎 **Build eşyasında "Trade'de Ara" artık gerçekten çalışıyor.** Build eşyalarının tabanı bir kategoriydi ("Yay", "Gövde Zırhı") ve trade bunu geçersiz sayıp aramayı reddediyordu. Artık geçerli tam taban yoksa kategori filtresi (ör. yay) kullanılıp arama hatasız açılıyor.
- 🎯 **Sorguya yalnızca tanınan modlar ekleniyor;** eşleşmeyen modlar atlanır, arama her zaman geçerli kalır.
### 🇬🇧 English
#### 🐛 Fixes
- 🔎 **"Search in Trade" from build items now actually works.** Build item bases were a category ("Bow", "Body Armour") which trade rejected as invalid. It now falls back to a category filter (e.g. bow) when there's no valid exact base, so the search opens without errors.
- 🎯 **Only recognized mods are added to the query;** unmatched mods are skipped so the search stays valid.

## 0.18.1
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🔗 **Trade açılışı düzeltildi** ("search is no longer valid") — artık her zaman güncel aktif lig ile açılıyor.
- 🔢 **Trade filtre değerleri eşyayla uyuşuyor** — eşyanın gerçek (alt) rolled değerleri girilir.
- 🔩 **Soket sayısı filtresi gerçekten uygulanıyor** (rünün statı yerine eşyanın soket sayısı).
- 🖼️ **Tepsi/pencere ikonu görünüyor** (boş kare düzeltildi).
### 🇬🇧 English
#### 🐛 Fixes
- 🔗 **Trade open fixed** ("search is no longer valid") — now always uses the current active league.
- 🔢 **Trade filter values match the item** — the item's real (low) rolled values are used.
- 🔩 **Socket-count filter is actually applied** (item's socket count instead of the rune's stat).
- 🖼️ **Tray/window icon shows up** (blank square fixed).

## 0.18.0
### 🇹🇷 Türkçe
#### ✨ Yenilikler
- 🔔 **Sistem tepsisi.** PoBe sağ-alt tepside simge gösterir (sağ tık: Göster/Gizle, Çıkış). Pencereyi kapatmak (X) ayara göre tepsiye küçültür.
- 🚪 **Tepsiden "Çıkış" tam kapatır** (arka planda süreç kalmaz); çift örnek engellenir.
- 🎮 **PoE 2 açılınca otomatik göster** (opsiyonel) + **Windows ile başlat** seçeneği.
#### ⚡ İyileştirmeler
- 🧹 **Build ekranı ferahlatıldı;** "Craft'la"/"Trade'de Ara" butonları başlıkla çakışmıyor.
- 🔩 **Rün/soket: stat yerine soket sayısı** filtrelenir.
### 🇬🇧 English
#### ✨ New
- 🔔 **System tray.** PoBe shows a tray icon (right-click: Show/Hide, Exit). Closing the window (X) minimizes to tray per setting.
- 🚪 **"Exit" from the tray fully quits** (no leftover process); a second launch is prevented.
- 🎮 **Show automatically when PoE 2 launches** (optional) + **Launch with Windows** option.
#### ⚡ Improvements
- 🧹 **Roomier build screen;** "Craft"/"Trade" buttons no longer overlap the header.
- 🔩 **Runes/sockets: filter by socket count** instead of the rune's stat.

## 0.17.9
### 🇹🇷 Türkçe
#### ⚡ İyileştirmeler
- 🔩 **Rün/soket statları fiyat sorgusundan ayrıldı** — ayrı "Rünler / Soketler" grubu; varsayılan aranmaz.
- 🔎 **Build eşyalarını trade'de arama** — taban + öne çıkan modlarla makul (gevşek) arama.
### 🇬🇧 English
#### ⚡ Improvements
- 🔩 **Rune/socket stats split out of the price query** — separate "Runes / Sockets" group; not searched by default.
- 🔎 **Search build items in trade** — a reasonable (loose) search by base + top mods.

## 0.17.8
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- ☁️ **Trade penceresi Cloudflare doğrulama döngüsü düzeltildi** — gerçek tarayıcı kimliği kullanılır, kalıcı oturum (tekrar sorulmaz).
- 🌐 **Tarayıcıda açma seçeneği** — Ayarlar → "Trade'de Aç — nerede"; takılırsa "Tarayıcıda Aç" butonu çıkar.
- 🎟️ **Steam ile giriş** — Steam OpenID giriş akışı tamamlanabilir.
### 🇬🇧 English
#### 🐛 Fixes
- ☁️ **Trade window Cloudflare loop fixed** — uses a real browser identity, persistent session (no repeated checks).
- 🌐 **Open-in-browser option** — Settings → "Open in Trade — where"; an "Open in Browser" button appears if it gets stuck.
- 🎟️ **Sign in with Steam** — the Steam OpenID login flow can complete.

## 0.17.7
### 🇹🇷 Türkçe
#### ⚡ İyileştirmeler
- 🏷️ **Temiz filtre etiketleri + çift değer kutusu** — "Adds A to B" modlarında alt/üst için iki ayrı kutu.
- 💎 **Mobalytics gem silah seti** gösteriliyor (ör. Ice Shot = Set 1, Freezing Mark = Set 2).
- 🪟 **Program-içi trade penceresi sağlamlaştırıldı** (kalıcı oturum, "Yenile"/"Tarayıcıda Aç").
### 🇬🇧 English
#### ⚡ Improvements
- 🏷️ **Clean filter labels + dual value boxes** — two boxes (low/high) for "Adds A to B" mods.
- 💎 **Mobalytics gem weapon set** is shown (e.g. Ice Shot = Set 1, Freezing Mark = Set 2).
- 🪟 **In-app trade window hardened** (persistent session, "Reload"/"Open in Browser").

## 0.17.6
### 🇹🇷 Türkçe
#### 🐛 Düzeltmeler
- 🎯 **"Advanced Mod Descriptions" açıkken tüm statlar eşleşiyor** — değerin yanına gömülü aralık ("16(13-19)") artık temizleniyor.
### 🇬🇧 English
#### 🐛 Fixes
- 🎯 **All stats match with "Advanced Mod Descriptions" on** — the embedded range next to the value ("16(13-19)") is now stripped.

## 0.17.5
### 🇹🇷 Türkçe
#### ⚡ İyileştirmeler
- ✅ **Tüm statlar fiyat sorgusunda eşleşiyor** (yerel silah hasar rolları dahil); eski stat tablosu önbelleği otomatik tazelenir.
- 🎛️ **Overlay seçimleri trade'e yansıyor** — yalnız işaretli statlar + girdiğin min değerler.
- 🪟 **Trade program içinde açılıyor** (kapatılabilir + geri butonu; yalnız pathofexile.com).
### 🇬🇧 English
#### ⚡ Improvements
- ✅ **All stats match in the price query** (including local weapon damage rolls); a stale stat-table cache auto-refreshes.
- 🎛️ **Overlay selections carry over to trade** — only ticked stats + the min values you entered.
- 🪟 **Trade opens inside the app** (closable + back button; pathofexile.com only).

## 0.17.4
### Hata düzeltmeleri
- **KRİTİK: Ctrl+C ile kopyalama artık her yerde çalışıyor.** PoBe açıkken bilgisayarda hiçbir yerde (ve oyunda) Ctrl+C ile kopyalanamıyordu — uygulama, fiyat kısayolu yanlışlıkla Ctrl+C'ye atanmışsa onu sistem genelinde ele geçiriyordu. Artık Ctrl+C (ve Ctrl+V/Ctrl+X) hiçbir koşulda global kısayol olarak bağlanmıyor; böyle bir ayar varsa otomatik olarak güvenli varsayılana (fiyat = Ctrl+D, tehlike = Ctrl+E) düzeltilir. Bu yüzden oyunda eşya kopyalama → değer okuma akışı da düzeldi.
- **Gem'lerin silah setine ait olup olmadığı dürüstçe belirtiliyor.** Bir build gem'leri silah setine göre ayırmıyorsa (kaynak veride set bilgisi yoksa), gem bölümünde boş bırakmak yerine "Bu build'de gem'ler silah setine göre ayrılmamış" notu gösterilir.
- **Teşhis günlüğü.** Her fiyat/tehlike kısayolu basışında `pobe-pricelog.txt` (uygulama veri klasörü) dosyasına ön plandaki pencere, pano içeriği ve eşya tanıma sonucu yazılır — sorun yaşarsan paylaşabilirsin.

## 0.17.3
### Hata düzeltmeleri
- **Oyunda değer okuma çalışıyor (odak koruması ayrıldı).** Fiyat/tehlike kısayolu (Ctrl+D/Ctrl+E) artık her zaman panoyu okuyup paneli gösterir — kısayolu bilerek bastığın için ön plan kontrolü beklemez. Odak koruması yalnızca otomatik kopyalama (oyuna sentetik Ctrl+C gönderme) için geçerlidir; Ctrl+C'ye hâlâ tepki verilmez.
- **Silah ve yan el artık görünüyor (Mobalytics).** Bazı Mobalytics build'lerinde silah/ok kılıfı oyun görünümünde hiç görünmüyordu; silahların iki silah seti (set 1/set 2) altında saklandığı yapı doğru çözülüyor — ana el, yan el ve set-2 (swap) silahları tam kartla render edilir.
- **Set 1 / Set 2 rozetleri eşyalarda.** Çift silah seti kullanan build'lerde her silah "Set 1"/"Set 2" rozetiyle etiketlenir (ör. yay+ok kılıfı = Set 1, talisman = Set 2). Build tek setse rozet gösterilmez. (Gem set verisi yalnızca build sağlamışsa gösterilir; çoğu build sağlamaz.)
- **Teşhis günlüğü.** Her fiyat/tehlike kısayolu basışında `pobe-pricelog.txt` dosyasına (uygulama veri klasörü) bir satır yazılır: zaman, ön plandaki pencere başlığı, pano metni uzunluğu ve ilk 80 karakter, eşya tanıma sonucu. Sorun yaşarsan bu dosyayı paylaşabilirsin.

## 0.17.2
### Hata düzeltmeleri
- **Fiyat/tehlike kısayolu yalnızca oyun ön plandayken çalışır.** Tahmini değer paneli artık SADECE atadığın fiyat kısayoluyla (varsayılan Ctrl+D) ve yalnız ön plandaki pencere "Path of Exile 2" iken açılır. Başka bir uygulamadayken (ör. tarayıcı) Ctrl+C ya da kısayol hiçbir şey yapmaz — pano dinlenmez, panel açılmaz.
- **Gerçek eşya artık doğru tanınıyor.** Bazı durumlarda gerçek bir eşya kopyalanmasına rağmen "Panoda geçerli eşya yok" diyordu; pano metnindeki gizli karakterler temizlenip eşya tanıma esnetildi — stat yakalama uçtan uca çalışıyor.
- **Eşyadan Craft'a doğru taban geliyor.** Bir eşyada "Craft'la"ya basınca sol tarafta yanlış (önceki oturumdan kalan) bir taban çıkabiliyordu; artık tıklanan eşyanın doğru tabanı yüklenir (Helmet → Helmet tabanı).
- **Statlar ve adlar her zaman İngilizce.** Karşılaştırma ve Craft panellerinde stat/mod metni ve item/taban/gem adları artık İngilizce kalır ("+19 to maximum Life", "+8 to Dexterity"); yalnızca çevre etiketler Türkçe.
- **Silah, yan el ve eksik eşyalar görünüyor.** Mobalytics build'lerinde silah/ok kılıfı bazen hiç gösterilmiyordu; tüm gear slotları (Silah 1/2, yan el/ok kılıfı dahil) artık render edilir ve Set 1/Set 2 rozetleriyle etiketlenir.
- **Liste görünümü düzenlendi.** Build "Liste" görünümü artık okunur, hizalı satırlar halinde (slot → eşya → modlar), seçili aşamanın eşyalarıyla.

## 0.17.1
### Hata düzeltmeleri
- **İşaretlenebilir ilerleme artık kalıcı.** Build görünümündeki tikler (item/stat/gem/support/pasif) kapat-aç'ta korunuyor — 0.17.0'daki sandbox değişikliğinden sonra bir IPC serileştirme hatası tikleri sessizce düşürüyordu; düzeltildi.
- **Silah seti (Set 1/2) artık gem ve eşyalarda da gösteriliyor.** Pasif ağaçtaki Set 1/2 ayrımına ek olarak; silahlar ve silaha soketli gem'ler "Set 1"/"Set 2" rozetiyle etiketlenir ve üstteki "Silah Seti" filtresiyle süzülür (build 2 silah seti kullanıyorsa).
- **Pasif ağaçta tıkla-işaretle.** Ağaçtaki bir node'a tıklayarak "elde ettim" (yeşil halka) işaretleyebilirsin; işaret kapat-aç'ta kalır.
- **Eşyadan Craft'a — taban bulma güçlendirildi.** Unique/genel-sınıf eşyalar için taban artık item-class'tan tahmin edilir (ör. "Body Armours" → uygun bir gövde tabanı); tahminse "tahmini taban — düzelt" notu çıkar ve taban kutusundan değiştirebilirsin.
- **Build'deki tüm eşyalar görünüyor.** Silah-seti-2 (swap) silahları, flask, jewel ve charm'lar artık tam kart olarak (mod + ikon + işaretleme + Craft) gösteriliyor — eskiden sadece isim olarak görünüp gözden kaçıyordu.
- **Tam stat yakalama (Advanced Mod Descriptions).** Oyunda "Advanced Mod Descriptions" açıkken kopyalanan eşya metnindeki `{ ... Modifier ... }` açıklama satırları artık mod havuzunu kirletmiyor; crafted/fractured türü bu satırlardan da doğru algılanıyor, böylece değerleme tüm statları kullanıyor.

## 0.17.0
### Güvenlik & kalite
- **Klasik dişli ayar ikonu.** Başlık çubuğundaki ayar ikonu (eskiden güneş/parlaklık gibi görünüyordu) net, tanınır bir **dişli (cog)** ile değiştirildi; yanında "Ayarlar" etiketi.
- **Otomatik kopyalama varsayılan KAPALI + odak koruması.** Tek-tuş oto-kopyala artık varsayılan kapalıdır; açsanız bile Ctrl+C **yalnızca ön plandaki pencere "Path of Exile 2" iken** oyuna gönderilir — başka bir uygulama odaktayken hiçbir tuş gönderilmez (yalnız mevcut pano okunur). Davranış Ayarlar ve README'de açıkça yazıldı.
- **Electron güvenlik sıkılaştırması.** Tüm pencerelerde `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. Renderer'a Node verilmez; tüm yetkili işler main process'te, contextBridge + IPC köprüsüyle yapılır.
- **Dış bağlantı beyaz listesi.** Tarayıcıda/e-posta istemcisinde yalnızca `https:` (+ `mailto:`) ve gerçekten kullanılan güvenilir alan adları açılır; bilinmeyen protokol/alan adları reddedilir. Sayfa-içi dışa navigasyon da engellenir.
- **Electron ve bağımlılıklar güncellendi.** Electron 31 → 42, Vite 5 → 7, electron-vite 2 → 5, electron-builder 24 → 26 ve diğerleri; `npm audit` artık **0 güvenlik açığı** bildiriyor.
- **Tip denetimi temizlendi.** `npm run typecheck` artık hatasız geçiyor (window.api tipi, kullanılmayan değişkenler ve diğer uyarılar giderildi).

## 0.16.0
### Build araçları
- **İşaretlenebilir ilerleme (kalıcı).** Build görünümünde elde ettiklerini tek tek işaretleyebilirsin: her ekipman slotu, o eşyadaki her stat/mod, her gem ve support gem, ve kayda değer pasif node'lar. İşaretler build başına kaydedilir; kapanıp açınca kalır. Üstte ilerleme çubuğu (yüzde).
- **Quest ödülleri ayrı ve belirgin.** Leveling sekmesinde, build'in becerilerini oymak için hangi Uncut Skill/Support/Spirit Gem'i hangi seviyede/bölgede alacağın öne çıkan bir kartta gösterilir (işaretlenebilir).
- **Silah seti (Set 1 / Set 2) ayrımı.** Build'de silah seti ayrımı varsa, pasif ağaçta "Set 1 / Set 2 / Tümü" geçişiyle hangi pasiflerin hangi sete ait olduğunu görürsün (yoksa gösterilmez).
- **Eşyadan Craft Simülatörü'ne geçiş.** Build'deki her eşyada "Craft'la" düğmesi: tıklayınca Craft Simülatörü açılır; eşyanın saf tabanı solda, istenen modlar sağda Hedef Eşya'da yüklenir ve craft koçu hedefe doğru yardım eder.
- **Build kalıcılığı pekiştirildi.** İçe aktarılan build, seçili variant ve aşama programı kapatıp açınca da korunur.

### Fiyat / değer
- **Eşya statları artık tam yakalanıyor.** Değerleme, eşyanın TÜM mod havuzlarını (implicit, explicit, crafted, fractured, rune, enchant) okur ve doğru trade stat filtrelerini kurar; eşlenemeyen modlar dürüstçe "doğrulanmadı" işaretlenir (ve loglanır).
- **Değer = EN YAKIN eşya (ortalama değil).** Artık dönen ilanların ortalaması/medyanı yerine, senin eşyana EN BENZER ilan(lar) bulunur (benzerlik = eşleşen stat sayısı + değerlerin yakınlığı) ve değer ona göre biçilir: "en yakın eşya: ≈X". Yöntem dürüstçe açıklanır ("en benzer N ilana göre").
- **Overlay'den stat ekle/çıkar — canlı değer.** Fiyat overlay'inde (ve Craft Simülatörü'nde) her stat filtresinin yanında aç/kapa ve min değer kutusu var; statı ekleyip çıkardıkça veya min'i değiştirdikçe sorgu otomatik yeniden çalışır ve değer anında güncellenir (kibar rate-limit kuyruğu korunur).

## 0.15.1
- **Yazı tipi Helvetica + italik kaldırıldı.** Arayüzün gövde yazısı artık Helvetica (ornate başlıklar serif kalır); her yerdeki italik metin normale çevrildi.
- **Yazı tipi & boyutu ayarı artık gerçekten çalışıyor.** Ayarlar → "Arayüz — Yazı tipi & boyut": Helvetica / Sistem / Serif seç + boyut kaydırıcısı; değişiklik anında uygulanır ve kapanıp açılınca korunur (tüm arayüz ölçeklenir).
- **Tek tuş fiyat/tehlike kontrolü (varsayılan açık).** Fiyat (Ctrl+D) ve tehlike (Ctrl+E) kısayoluna basınca program önce oyuna Ctrl+C gönderir, panoyu okur ve paneli gösterir — tek tuş yeter. Awakened PoE / Exiled Exchange ile aynı yöntem; Ayarlar'dan kapatıp kendin Ctrl+C yapabilirsin (dürüst ToS notu eklendi).
- **Daha tam eşya bilgisi çekme.** Ctrl+C metninden quality, item level, soket/rune, requirements (inline dahil), corrupted/fractured/synthesised, enchant ve fiyat notu ayrı ayrı çıkarılıyor; trade stat-id eşleşmesi implicit/explicit ayrımına duyarlı hale getirildi.
- **Belirgin Ayarlar düğmesi.** Başlık çubuğundaki dişli ikonu büyütüldü, kontrastı artırıldı ve yanına "Ayarlar" etiketi eklendi.
- **Uygulama içinden geri bildirim.** Ana sayfada ve Ayarlar → Hakkında'da "Geri Bildirim / Öneri" — yaz, "E-posta gönder"e bas, varsayılan e-posta uygulaman hazır taslakla açılır; Discord kullanıcı adını tek tıkla kopyala.

## 0.15.0
- **Lisans / aktivasyon kaldırıldı — program artık herkese açık ve ücretsiz.** Açılışta hiçbir kapı/etkinleştirme yok; doğrudan ana sayfaya girilir. Mevcut kullanıcılar sorunsuz açmaya devam eder.
- **Proje açık kaynak oldu (GPL-3.0).** Kaynak kod herkese açık; LICENSE dosyası eklendi.
- Tüm özellikler korundu: otomatik güncelleme, ana sayfa, iletişim, veritabanı, build araçları ve overlay'ler.

## 0.14.4
### Ana Sayfa & "Neler Değişti" (0.14.3'ten)
- **Ana Sayfa:** görselli, estetik açılış ekranı — her ana bölüm için büyük kategori kartı (ikon + açıklama); kart tıklayınca o bölüme gider. Varsayılan açılış görünümü oldu.
- **"Neler Değişti" ekranı:** güncelleme sonrası ilk açılışta o sürümün notları gösterilir; Ayarlar → İletişim/Hakkında'dan tekrar açılır.

### Düzeltmeler & İyileştirmeler
- **Build artık sıfırlanmıyor:** İçe aktarılan build (PoB kodu / Mobalytics / Maxroll / .build) ve seçili variant; sekme değiştirsen, hatta programı kapatıp açsan bile korunur (kalıcı snapshot).
- **Build görünümü büyütüldü:** ekipman kartları, mod metni, gem isimleri ve ikonları daha büyük ve ferah — okunur ve net.
- **Build'e özel leveling / görev listesi:** İçe aktarılan build için, aşamalardan ve yazar notlarından üretilen işaretlenebilir bir görev kontrol listesi (Leveling sekmesinde); ilerleme kaydedilir.
- **Türkçe sızıntısı giderildi:** İngilizce kalması gereken oyun terimleri (stat/affix/mod metni, item/gem/skill/pasif/currency adları) artık Türkçe cümlenin içinde de İngilizce orijinal kalıyor — ör. "+20 to maximum Life". Yalnız çevreleyen açıklama Türkçe.
- **Ayarlar → Siteyi Aç düzeldi:** web sitesi (https://pathofberkay.netlify.app), e-posta ve Discord bağlantıları artık doğru açılıyor.

## 0.14.2
- **Variant isimleri düzeldi:** Mobalytics build'lerinde gerçek aşama başlıkları gösteriliyor (ör. "lvl 1-14" … "lvl 60+"), "Variant 1/2/3" yerine.
- **Variant geçişi 3 paneli birden günceller:** aşama değişince yetenekler, ekipman ve pasif ağaç hepsi o aşamaya göre yenilenir.
- **.build içe aktarma tam:** gerçek oyun .build formatı (passives/inventory_slots) tanınıyor — ekipman, yetenek, pasif, yükseliş eksiksiz gelir.
- **Pasif eşleşmesi düzeldi:** bazı build'lerde 0 çıkan ağaç eşleşmesi giderildi (tüm ağaç setleri birleştirildi).
- İçe aktarma kutusu yardım metni güncellendi; veri olmayan build'lerde net "PoB kodu/veri yok" kartı.

## 0.14.1
- **Web sitesi linki:** İletişim / Hakkında bölümüne (Ayarlar + onboarding + sohbet botu) web sitesi linki eklendi → https://pathofberkay.netlify.app
- Otomatik güncelleme GitHub Releases üzerinden (ibarslan-45/pobe-releases).

## 0.14.0
- **Otomatik güncelleme:** açılışta yeni sürüm kontrolü + "neler değişti" bildirimi; tek tıkla güncelle (NSIS). Portable sürüm siteden güncellenir.
- Ayarlar'da "Güncellemeleri kontrol et" + mevcut sürüm + son kontrol zamanı.

## 0.13.1
- **Çok dilli (TR/EN) kurulum:** NSIS dil seçici (varsayılan Türkçe); seçilen dil uygulamada ilk açılışta kullanılır.
- **Uygulama-içi İletişim / Hakkında:** Discord `panars` + e-posta; Ayarlar + onboarding + sohbet botu.

## 0.13.0
- Aşama-aşama build görünümü (gem/item ikonları + progresif pasif ağaç).
- Mobalytics yapısal build import düzeltmesi (creator/profile build'ler).
- `.build` dosyası içe aktarma (sürükle-bırak).
- Tüm 8 ana özellik + cihaza-bağlı lisans.
