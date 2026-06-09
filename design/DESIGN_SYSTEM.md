# PoE 2 Overlay — Tasarım Sistemi (DESIGN_SYSTEM.md)

> Hedef: program "sanki GGG'nin PoE 2 için yaptığı bir oyun içi menü" gibi görünsün —
> koyu fantazi, parşömen-altın detaylar. Bu dosya kanonik kaynaktır; arayüz buna GÖRE kurulur.
> Tüm renkler `src/renderer/styles/tokens.css` içinde CSS değişkeni olarak yaşar.

## Renk Token'ları (tam hex — item-filter resmî değerleri)

### Rarity / item renkleri
| Token | Hex | CSS değişkeni |
|---|---|---|
| Normal | `#C8C8C8` | `--rarity-normal` |
| Magic | `#8888FF` | `--rarity-magic` |
| Rare | `#FFFF77` | `--rarity-rare` |
| Unique | `#AF6025` | `--rarity-unique` |
| Gem | `#1BA29B` | `--rarity-gem` |
| Currency | `#AA9E82` | `--rarity-currency` |

### Altın / süsleme
| Token | Hex | CSS değişkeni |
|---|---|---|
| Başlık altını | `#E7B478` | `--gold-title` |
| Süsleme altını | `#C8AA6E` | `--gold-ornament` |

### Element renkleri
| Token | Hex | CSS değişkeni |
|---|---|---|
| Ateş | `#960000` | `--elem-fire` |
| Soğuk | `#366492` | `--elem-cold` |
| Şimşek | `#FFD700` | `--elem-lightning` |
| Kaos | `#D02090` | `--elem-chaos` |

### Yüzeyler / metin
| Token | Hex | CSS değişkeni |
|---|---|---|
| Arka plan (sıcak siyah) | `#0D0D0D` | `--bg-black` |
| Koyu parşömen | `#1E1A14` | `--bg-parchment` |
| Çerçeve kahve | `#504128` | `--frame-brown` |
| Varsayılan metin | `#C8C8C8` | `--text-default` |
| Soluk metin | `#7F7F7F` | `--text-muted` |

### Gem öznitelik (attribute) — ikon placeholder tonu
Gem `color` alanı: `r` = Güç (kırmızı), `g` = Çeviklik (yeşil), `b` = Zekâ (mavi), `w` = beyaz/genel.
| Öznitelik | CSS değişkeni | Değer |
|---|---|---|
| Güç (str) | `--attr-str` | `#960000` (ateş kırmızısı) |
| Çeviklik (dex) | `--attr-dex` | `#5A8A3C` |
| Zekâ (int) | `--attr-int` | `#366492` (soğuk mavisi) |
| Genel (w) | `--attr-none` | `#504128` (çerçeve kahvesi) |

## Tipografi
- **Serif zorunlu.** Font yığını: `'Fontin'` (kullanıcıda varsa) → `'EB Garamond'` (Google Fonts) → `Georgia` → `serif`.
- Başlıklar: `font-variant: small-caps` + `letter-spacing: 0.04em`.
- YASAK fontlar: Inter, Roboto, Arial, Open Sans, system-ui (yapay zeka yapımı hissi verir).
- Ölçek: başlık 22–28px (`--fs-title`), gövde 14–15px (`--fs-body`), küçük 12px (`--fs-small`).

## Kurallar
- **Köşeler keskin:** 0–2px. Pill / rounded-full YASAK. (`--radius: 1px`)
- **Kenarlık:** `1px solid var(--frame-brown)`; hover'da `var(--gold-ornament)`.
- **Arka plan:** düz sıcak siyah `#0D0D0D`. Glassmorphism / blur YASAK. Mor/neon gradyan YASAK. Emoji YASAK.
- **Gölge:** tek ve yumuşak — `0 2px 6px rgba(0,0,0,0.6)` (`--shadow`).
- **Yerleşim:** panel/satır asimetrik, oyun envanteri hissi. Ortalanmış generic kart YASAK.

## Arayüz Düzeni
- **Sol sütun:** aranabilir gem listesi. Her satır: gem ikonu (yoksa rengine göre placeholder kutu) + adı (Gem teal ile vurgulu).
- **Sağ sütun:** seçilen gem için oyun içi item tooltip'i gibi detay paneli:
  - Üstte ikon + ad (Gem teal `#1BA29B`).
  - Altında tür + etiketler.
  - Ayraç çizgisi (`#504128`).
  - Açıklama: hem `desc_en` hem `desc_tr`; aktif dile göre biri üstte/vurgulu, diğeri altta/soluk.
- **EN/TR dil düğmesi** üstte; ad, tür, etiket ve açıklamanın tümünü etkiler.
