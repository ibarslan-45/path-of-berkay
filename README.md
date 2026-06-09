# Path of Berkay (PoBe)

Path of Exile 2 için iki dilli (Türkçe / İngilizce) masaüstü veritabanı ve yardımcı uygulaması.
Electron + Vue 3 + TypeScript ile yazılmıştır.

Oyunun resmî bir Türkçe çevirisi yok; bu uygulama eşya, beceri taşı, pasif ağaç ve mekanik
açıklamalarını Türkçe bir katmanla sunar. Eşleştirme ve arama her zaman İngilizce orijinal adlar
üzerinden yapılır, böylece oyun içindeki adlarla birebir uyumlu kalır.

## Özellikler

- **Veritabanı:** beceri taşları, currency, eşya tabanları, eşsizler, modlar, bölgeler, yükselişler,
  pasif düğümler, Atlas, mekanikler ve boss'lar — hepsi TR/EN.
- **Pasif ağaç görünümü:** etkileşimli, sınıf başlangıçlarıyla.
- **Craft simülatörü:** tamamen yerel, eğitsel mod havuzu simülasyonu (gerçek currency harcanmaz).
- **Build içe aktarma:** Path of Building (PoE2) export kodu, Maxroll ve Mobalytics build linkleri.
- **Oyun-içi görünüm:** ekipman, beceri taşı soket grupları ve pasif ağaç, aşama-aşama (variant'a göre).
- **.build dışa/içe aktarma:** oyunun Build Planner formatıyla uyumlu.
- **Build'e özel loot filter** üreteci (resmî filter diliyle).
- **Fiyat / değer kontrolü:** clipboard ile (kendi Ctrl+C'niz) resmî trade üzerinden benzer ilan araması.
- **Endgame tehlike kontrolü:** waystone mod'larını build defansınıza göre değerlendirir.
- **Leveling takibi:** `Client.txt` log'undan ilerleme + build'e özel görev/aşama listesi.
- **Otomatik güncelleme**, onboarding turu, yardım/sohbet botu ve ana sayfa.

Uygulama, oyunla yalnızca meşru yollarla etkileşir: log dosyası okuma, clipboard okuma ve resmî
API'ye kullanıcı isteğiyle tek sorgu. Bellek okuma, process injection veya girdi otomasyonu yoktur.
Overlay'lerin oyunun üstünde görünmesi için oyunun **Windowed Fullscreen / Borderless** modu gerekir.

### Tek-tuş otomatik kopyalama (varsayılan KAPALI)

Fiyat (Ctrl+D) ve tehlike (Ctrl+E) kısayolları varsayılan olarak yalnızca **panoyu okur** — eşyaya
gelip **kendiniz Ctrl+C** yaparsınız, sonra kısayola basarsınız. Ayarlar'dan "Tek tuş (otomatik
kopyala)" açılırsa, kısayola basınca program oyuna Ctrl+C gönderir, kısa bekler ve panoyu okur (tek
tuş yeter — Awakened PoE / Exiled Exchange ile aynı yöntem). **Açıkken bile tuş yalnızca ön plandaki
pencere "Path of Exile 2" iken gönderilir;** başka bir uygulama odaktayken hiçbir tuş gönderilmez
(yalnızca mevcut pano okunur). Bu özellik girdi simülasyonu içerdiğinden klasik "yalnız pano
okuma"dan bir adım ileridir ve kendi sorumluluğunuzdadır; istemiyorsanız kapalı bırakın.

## İndirme

Hazır kurulum ve portable sürümler için:

**https://github.com/ibarslan-45/path-of-berkay/releases/latest**

- `PathOfBerkay-Setup-X.Y.Z.exe` — Windows kurulum (NSIS), otomatik güncelleme destekli.
- `PathOfBerkay-X.Y.Z-portable.exe` — kurulum gerektirmeyen tek dosya (güncellemeyi siteden indirin).

## Kaynaktan derleme

Gereksinim: Node.js 20.19+ veya 22.12+ ve npm.

```bash
npm install      # bağımlılıkları kur
npm run build    # main + preload + renderer derle
npm run dev      # geliştirme modunda çalıştır
npm run dist     # Windows kurulum + portable .exe üret (release/ klasörüne)
```

`npm run dist`, `release/` altında kurulum (.exe), portable (.exe), `latest.yml` ve blockmap üretir.

## Doğrulanabilir build (verifiable build)

Yabancı birinin indirdiği `.exe`'ye güvenebilmesi için **her release, kaynak koddan GitHub'ın
kendi sunucularında üretilir** — kimsenin makinesinde elle paketlenip yüklenmez.

- Bir sürüm etiketi (`vX.Y.Z`) push edilince [`.github/workflows/release.yml`](.github/workflows/release.yml)
  çalışır: `npm ci → npm run build → electron-builder` adımlarını **windows-latest** üzerinde yürütür.
- Workflow her `.exe` ve `latest.yml` için **SHA-256** toplamlarını hesaplar ve `SHA256SUMS.txt`
  olarak release'e ekler; ayrıca kullanılan **kaynak commit SHA'sını** (`BUILD_INFO.txt` + release notu)
  ve çalıştırma loglarının bağlantısını yayınlar.
- Release ilk olarak **pre-release** işaretlenir; test edildikten sonra "latest" yapılır.

**Kendiniz doğrulayın:** release'teki commit'i çekip aynı şekilde derleyin ve SHA-256'ları karşılaştırın:

```bash
git clone https://github.com/ibarslan-45/path-of-berkay
cd path-of-berkay
git checkout <release-notundaki-commit-SHA>
npm ci
npm run dist
# Windows PowerShell:
Get-FileHash -Algorithm SHA256 release\PathOfBerkay-Setup-*.exe
# çıkan değeri release'teki SHA256SUMS.txt ile karşılaştırın
```

Toplamlar eşleşiyorsa, indirdiğiniz dosya tam olarak bu repodaki kaynaktan üretilmiştir.
(Not: kurulum derleyiciye/ortama göre küçük farklar olabileceğinden, en güçlü doğrulama
GitHub Actions çalıştırma loglarını ve yayınlanan SHA-256'ları incelemektir.)

## Teşekkürler ve atıf

Bu uygulama, açık veri kaynaklarından beslenmektedir:

- **[RePoE (PoE2 fork)](https://repoe-fork.github.io/poe2/)** — statik oyun verisi (taşlar, eşyalar, modlar).
- **[PoEDB / poe2db.tw](https://poe2db.tw/)** — eşsiz eşya ve ek veri doğrulaması.
- **[Grinding Gear Games](https://www.pathofexile.com/)** — Path of Exile 2'nin yaratıcısı.

Türkçe metin katmanı bu projeye aittir; oyun verisi ve adları yukarıdaki kaynaklardan türetilmiştir.

## Yasal uyarı

Bu proje Grinding Gear Games ile **ilişkili değildir** ve onlar tarafından desteklenmemektedir.
Path of Exile 2'ye ait tüm oyun verileri, adları ve görsel varlıkları **Grinding Gear Games'e aittir**
ve izinsiz yeniden kullanılmamalıdır. Bu uygulama yalnızca topluluk amaçlı, ücretsiz bir yardımcıdır.

## Lisans

[GPL-3.0](LICENSE) — özgürce kullanabilir, inceleyebilir, değiştirebilir ve dağıtabilirsiniz;
türev çalışmaların da aynı lisansla paylaşılması gerekir.
