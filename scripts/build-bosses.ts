/**
 * build-bosses.ts
 * ----------------------------------------------------------------------------
 * ENDGAME / PINNACLE BOSS'lar kategorisi -> src/data/bosses.json  (Faz 2).
 *
 * KAPSAM: Sadece endgame/pinnacle boss'lar. Kampanya boss'ları areas.json'da;
 * burada TEKRARLANMAZ. Citadel uber-boss'ları (Doryani/Jamanra/Geonor) ayrı
 * kayıt değildir — Arbiter erişim metnine gömülüdür (kampanya adlarını
 * tekrar etmemek için).
 *
 * Çalıştırma:  npm run build:bosses
 *
 * VERİ KAYNAĞI (proje talimatları kararı): GGG resmî statik verisinde boss "lore"
 * metni yok. İçerik PoE2 0.5.0 "Return of the Ancients" bilgisinden derlendi
 * ve web ile (Maxroll PoE2 pinnacle-bosses + 0.5 patch özetleri) çapraz
 * doğrulandı. UYDURMA YOK: emin olunmayan mekanik/erişim alanları BOŞ bırakıldı
 * ('' ). source alanı her kaydın güven düzeyini taşır.
 *
 * ÇEVİRİ (proje talimatları kuralı 1-2): eşleşme anahtarı EN. Tüm Türkçe metin
 * tr-bosses-glossary.json'da; id ile eşlenir. Oyunun resmî Türkçesi YOK ->
 * boss adları 'proposed' (betimleyici). EN kaynak boşsa TR de boş kalır
 * (needs-translation üretmez): hedef needs-translation = 0.
 *
 * İKON: produce-boss-icons.cjs extracted atlas/area asset'lerinden
 * assets/bosses/<id>.png (+ <id>-banner.png) üretir. Yoksa null. Boss'a özel
 * madalyon yoksa bağlı mekaniğin atlas ikonu fallback olur (mechanics deseni).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'
type BossType = 'pinnacle' | 'endgame' | 'gate'

/** Elle derlenen boss olgusu (EN). Emin olunmayan alan '' bırakılır. */
interface BossFact {
  id: string
  en: string
  boss_type: BossType
  /** Bağlı league/atlas mekaniği id'leri (mechanics.json ile aynı id'ler). */
  related: string[]
  /** Nasıl erişilir (kendi cümlelerimizle, kısa). */
  access_en: string
  /** Ana mekanik/dikkat notu — emin değilsek '' (UYDURMA YOK). */
  mechanics_en: string
  /** Güven/kaynak damgası: confirmed = web ile doğrulandı; high-level =
   *  varlığı kesin, ayrıntı genel; uncertain = ayrıntı boş bırakıldı. */
  source: string
  /** İkon override: boss'a özel madalyon yoksa mevcut worldmap madalyonunu
   *  elle eşle (ör. geonor-doryani -> worldmapcontentdoryani.png). Yoksa
   *  build, <id>.png'yi otomatik arar; o da yoksa null. */
  icon?: string
}

/** TR glossary biçimi (tr-bosses-glossary.json). id -> alanlar. */
interface TrEntry {
  tr?: string
  status?: TrStatus
  access?: string
  mechanics?: string
}
type TrGlossary = Record<string, TrEntry>

interface BossRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  boss_type: BossType
  related: string[]
  access_en: string
  access_tr: string
  mechanics_en: string
  mechanics_tr: string
  icon: string | null
  banner: string | null
  category: 'boss'
  source: string
  game_version: string
  league: string
  last_updated: string
}

// --- FACTS: PoE2 0.5 endgame/pinnacle boss'ları -------------------------------
// Tümü "pinnacle" sınıfı (PoE2'nin resmî pinnacle boss seti). Citadel uber
// boss'ları Arbiter erişimine gömülü; ayrı endgame kaydı YOK.
const FACTS: BossFact[] = [
  {
    id: 'xesht',
    en: 'Xesht, We That Are One',
    boss_type: 'pinnacle',
    related: ['breach'],
    access_en:
      "The pinnacle boss of Breach. Breach monsters and Clasped Hands drop Breach Splinters; combine enough of them into a Breachstone, then use it at the Realmgate to enter Xesht's domain and face it at the end.",
    mechanics_en:
      'A Breach-themed fight against a towering, many-handed entity. It covers large parts of the arena with area attacks, so keep moving and watch the ground.',
    source: 'compiled-0.5 · web-confirmed (maxroll) · mechanics high-level'
  },
  {
    id: 'olroth',
    en: 'Olroth, Origin of the Fall',
    boss_type: 'pinnacle',
    related: ['expedition'],
    access_en:
      "An Expedition pinnacle-tier boss. Run high-level Expedition Logbooks and progress the mechanic until you can open the encounter. Note: in 0.5 'Return of the Ancients' Olroth is no longer the FINAL pinnacle of Expedition — defeating it in the 'Grand Expedition' quest drops a Shattered Triskelion that opens the way to a new, unnamed Expedition pinnacle. Olroth remains fully farmable.",
    mechanics_en:
      'Two phases: when its HP hits 0 in phase 1 the Triskelion Flame revives it at ~70% HP, so its effective health is roughly doubled. Attacks include Sword Slam (knocks you into the air and leaves freezing ice ground), a returning Boomerang Sword Throw that explodes on the way back (the flying sword Hinders you), a charge with a wide arc cut, Starfall (spiralling icy beams from above) and Frigid Flurry. The deadliest source is the rotating galaxy-shaped Triskelion Flame disc that splits the arena with a central beam and tracking lasers; in phase 2 it drops ice spikes, and at higher Runic Splinter counts Runic Gateway portals spawn skeleton adds. Damage is mostly Cold + Physical with high freeze danger — cap Cold resistance and bring a Thawing/Silver Charm.',
    source: 'compass 0e78a36b · mekanik [DOĞRULANDI] · 0.5 statü: artık mekaniğin nihai pinnacle\'ı değil (ara/geçiş)'
  },
  {
    id: 'king-in-the-mists',
    en: 'The King in the Mists',
    boss_type: 'gate',
    related: ['ritual'],
    access_en:
      "In 0.5 'Return of the Ancients' the King is no longer Ritual's pinnacle — it was reworked into a gateway boss. Open the fight in the Wildwood by banking Tribute at Ritual altars; defeating it yields 'The Head of the King' and unlocks the 'Rite of the Nameless' progression that leads to Ritual's new pinnacle, The Bodach. The King is still farmable (it can drop Mageblood at Difficulty IV).",
    mechanics_en:
      'Three stages. After losing about 75% of its HP it teleports you into a Wisp Labyrinth (a timed pass/fail — follow the glowing white wisps back), then fully heals into a treant form for the later phases. Attacks: Vine Slam (raises its staff and crushes the area), Thorngrip (a cone of purple Chaos thorns), and basic Chaos projectiles that apply Wither; in the treant phase a triple projectile, slow Explosive Spores (purple ground) and a Blood/Rat Tornado that chases you (the most dangerous). Three platforms surround a central altar and standing on one stacks Portent Vapors (you take more damage). Ritual of Meditation (red = stop moving) and Ritual of Dance (purple = keep moving) curses punish the wrong action with a root and stun. Damage is mostly Chaos.',
    source: 'compass 0e78a36b/d481c64c · mekanik [DOĞRULANDI] · 0.5 statü: artık pinnacle değil, Bodach\'a açan geçit bossu'
  },
  {
    id: 'omniphobia',
    en: 'Omniphobia, Fear Manifest',
    boss_type: 'endgame',
    related: ['delirium'],
    access_en:
      'A Simulacrum boss of the Delirium endgame — NOT a pinnacle (Delirium\'s pinnacle is now Tangmazu, the Raven Trickster). Build a Simulacrum from Simulacrum Splinters and survive the waves; Omniphobia can appear from Wave 3 onward and also in Delirium fog maps. It has no loot table of its own and shares the common Simulacrum pool.',
    mechanics_en:
      'No formal phases (a wave boss); at 50% HP it gains a Vomit AoE. A heavy Physical single-target bruiser (some damage converted to Chaos) with slow, telegraphed attacks: a big axe swing, Double/Triple Slam (consecutive ground smashes with spike AoE), Leap Slam (jumps onto you when you open distance) and Wave Slash (a long-range axe projectile that Bleeds). Its slams can be dodge-rolled through with i-frames just before they land; punish in the gaps. On death in a map it drops a stack of Simulacrum Splinters.',
    source: 'compass 0e78a36b/d481c64c · mekanik [DOĞRULANDI] · 0.5 statü: Simulacrum endgame bossu (pinnacle değil)'
  },
  {
    id: 'kosis',
    en: 'Kosis, The Revered Queen',
    boss_type: 'endgame',
    related: ['delirium'],
    access_en:
      'The more dangerous of the two Simulacrum bosses (Delirium endgame) — NOT a pinnacle (Tangmazu is Delirium\'s new pinnacle). Build a Simulacrum from Splinters and clear the waves; Kosis can spawn from Wave 5 onward with rising chance. Waves containing a Delirium boss are the only source of Simulacrum-exclusive uniques such as Voices, Split Personality and Megalomaniac.',
    mechanics_en:
      'No formal phases, but its Energy Shield creates interrupt windows. Demon Beam is the deadliest move: it gains 15% of its life as ES and sweeps a wide dark/ice beam that leaves a Death Zone growing for ~10 seconds. It also scatters ice orbs that it teleports to and slam-detonates into spike waves, has a teleport melee against distant targets, and fire/lightning flurry combos; its melee applies Corrupting Blood. Draining its ES while it channels the beam briefly stuns it and ends the beam early. Stay close to avoid triggering its strongest teleport/slam attacks and watch for chaining Death Zones. Mixed Cold/Lightning/Fire with freeze and chill risk.',
    source: 'compass 0e78a36b/d481c64c · mekanik [DOĞRULANDI] · 0.5 statü: Simulacrum endgame bossu (pinnacle değil)'
  },
  {
    id: 'zarokh',
    en: 'Zarokh, the Temporal',
    boss_type: 'pinnacle',
    related: ['sanctum'],
    access_en:
      'The pinnacle boss at the end of the Trial of the Sekhemas. Survive all four floors of the Trial with your Honour intact to reach Zarokh on the final floor.',
    mechanics_en:
      'A time-themed fight: it can rewind the encounter and summon echoes of itself, and the arena is swept by a sandstorm. Positioning and steady damage matter more than bursting it down.',
    source: 'compiled-0.5 · web-confirmed (maxroll/game8) · mechanics high-level'
  },
  {
    id: 'trialmaster',
    en: 'The Trialmaster',
    boss_type: 'pinnacle',
    related: ['ultimatum'],
    access_en:
      "The pinnacle boss of the Trial of Chaos — still its apex in 0.5, since this mechanic was not reworked like the Atlas bosses. Access at level 75+: complete the 10 rooms of an Inscribed Ultimatum and collect 3 Fates (Cowardly, Deadly and Victorious, from Uxmal, Bahlak and Chetza) to open the door. Clear the rooms — choosing one Affliction before each — and the first kill grants your final Ascendancy points.",
    mechanics_en:
      'Switches between two forms based on behaviour (not a fixed HP threshold): Spear Form (melee) and Caster Form (ranged bullet-hell). Its signature is Time Stop — it freezes time and places 3 Sunders (Spear Form) or 3 Blood Orbs (Caster Form) that fire when time resumes. Other attacks: frenzied spear swings with blood projectiles, a Spear Throw that leaves a slowly expanding physical degen field, fast triple elemental orbs (Fire/Cold/Lightning), bouncing Blood Orbs that multiply off walls, and a Heart tether that slows you and stuns/explodes if you leave its area. The arena is SMALL, so positioning and dodge-roll timing are critical — hug the edges to place degen fields against the walls. Trial Tribulation modifiers and Atlas passives do NOT scale this fight. Chaos resistance helps.',
    source: 'compass 0e78a36b · mekanik [DOĞRULANDI] · 0.5 statü: hâlâ Trial of Chaos pinnacle\'ı'
  },
  {
    id: 'arbiter-of-ash',
    en: 'The Arbiter of Ash',
    boss_type: 'gate',
    related: ['fortress'],
    access_en:
      'In 0.5 the Arbiter of Ash is no longer the Atlas apex — it was reworked into a Fortress quest/gateway boss, and the new APEX is The Arbiter of Divinity. Defeat the three powerful Citadel bosses on the Atlas (e.g. Geonor & Doryani in the Enigma Chambers) to collect three Crisis Fragments, then place them at the Burning Monolith to open the way to the Arbiter of Ash.',
    mechanics_en:
      'A fire- and ash-themed encounter. The arena grows more dangerous with fire as the fight goes on, so sustained damage and constant ground awareness are key.',
    source: 'compass d481c64c · 0.5 statü: REWORKED — apex değil, Fortress geçit bossu (yeni apex: Arbiter of Divinity) [DOĞRULANDI]'
  },
  // === 0.5 YENİ PINNACLE'LAR (compass d481c64c) ============================
  {
    id: 'arbiter-of-divinity',
    en: 'The Arbiter of Divinity',
    boss_type: 'pinnacle',
    related: ['fortress'],
    access_en:
      "0.5's new APEX pinnacle boss (Fortress / Origins of Divinity), which replaced the Arbiter of Ash as the Atlas endgame's hardest target — this should be treated as the toughest goal in the game. Reach the Origins of Divinity at the core of the Fortress endgame to challenge it; an Uber version fights at Area Level 83.",
    mechanics_en:
      'Two main phases: it rains divine energy from the air and the ground, heals and speeds up at around 40% HP, and spawns "Aspects of Divinity" reflections of itself. Sustained damage and constant ground awareness are key.',
    source: 'compass d481c64c · 0.5 yeni APEX [DOĞRULANDI] · mekanik tek-cümle özet'
  },
  {
    id: 'bodach',
    en: 'The Bodach',
    boss_type: 'pinnacle',
    related: ['ritual'],
    access_en:
      "Ritual's new pinnacle boss in 0.5 — it is the source of The King in the Mists' power. Collect effigy pieces across five maps of Rituals, place the effigies, and complete the 'Rite of the Nameless' (the final map re-fights all map bosses you have beaten so far) to enter The Bodach's domain.",
    mechanics_en:
      'A two-phase fight. In phase 1 the Bodach hides its body in shadow and attacks using only its HEAD; when its first health bar empties the arena fills with damaging darkness and you must follow GREEN orbs (Draiocht provides light) to a safe spot to transition. In phase 2 the full body is revealed and keeps some attacks. Main attacks: Arm Bash (slams its arm down three times), a ranged Ground Scratch that claws flame backward, Side Swipe, Ground Shrapnel (buries its head and scatters shrapnel), marked Fireball Drops, a Shadow Beam from its mouth, and a Rain of Fireballs. The key mechanic is the darkness/light maze on the phase transition — follow the green orbs to avoid the dark damage.',
    source: 'compass d481c64c · yeni Ritual pinnacle [DOĞRULANDI: Fextralife/Games.gg]'
  },
  {
    id: 'tangmazu',
    en: 'Tangmazu, The Raven Trickster',
    boss_type: 'pinnacle',
    related: ['delirium'],
    access_en:
      "Delirium's new pinnacle boss in 0.5 and the target for the 'Voices' unique jewel. It replaces Omniphobia and Kosis as the mechanic's apex; progress the reworked Delirium endgame to open the encounter.",
    mechanics_en:
      'Three phases with transitions at about 75% and 50% HP. It teleports between mirrors and fires statue beams from the corners with a Fractured Beam; defeating it can drop the "Voices" jewel.',
    source: 'compass d481c64c · yeni Delirium pinnacle [DOĞRULANDI]'
  },
  {
    id: 'vessel-of-kulemak',
    en: 'Vessel of Kulemak',
    boss_type: 'pinnacle',
    related: ['abyss'],
    access_en:
      "The Abyss pinnacle boss (added in 0.3, reworked into the 'Abyssal Power' questline in 0.5). Obtain a Kulemak's Invitation — dropped by the Abyss gate bosses Tasgul and Vandroth — and 'Jump In' at the Well of Souls to reach it.",
    mechanics_en:
      'During the fight you can steal the Lich powers to empower the boss up to about three times; defeating it can drop the Grip of Kulemak ring.',
    source: 'compass d481c64c · Abyss pinnacle (0.3→0.5 questline) [DOĞRULANDI]'
  },
  {
    id: 'atziri-red-queen',
    en: 'Atziri, the Red Queen',
    boss_type: 'pinnacle',
    related: ['vaal'],
    access_en:
      "The Vaal Temple pinnacle (added in 0.4, brought into the core mechanic in 0.5 as a permanent endgame target). Reach it through the Royal Access Chamber at the end of the Vaal Temple; it can drop Atziri's Rule (a Mirror of Refraction).",
    mechanics_en: '',
    source: 'compass d481c64c · Vaal Temple pinnacle (0.4→0.5 core) [DOĞRULANDI] · dövüş mekaniği kaynakta yok (boş)'
  },
  // === 0.5 ARA / GEÇİT BOSS'LARI (compass d481c64c, DOĞRULANDI) ============
  {
    id: 'tul-esh',
    en: 'Tul & Esh',
    boss_type: 'gate',
    related: ['breach'],
    access_en:
      'A Breach gate fight in the Sky/Hive Fortress. Defeating the pair grants an access key to the Breach pinnacle, Xesht.',
    mechanics_en:
      'A dual fight: Tul deals cold and freeze, Esh deals lightning. Handle both damage types at once.',
    source: 'compass d481c64c · Breach ara boss (ikili) [DOĞRULANDI]'
  },
  {
    id: 'vruun',
    en: 'Vruun, Marshal of Xesht',
    boss_type: 'gate',
    related: ['breach'],
    access_en:
      'A rare elite that appears in a Stabilised Breach. It drops a Wombgift and lets you gain a Lineage Support.',
    mechanics_en: '',
    source: 'compass d481c64c · Breach ara/nadir boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'queen-in-the-mists',
    en: 'The Queen in the Mists',
    boss_type: 'gate',
    related: ['ritual'],
    access_en:
      "An OPTIONAL Ritual side boss added in 0.5 (NOT the pinnacle — that is The Bodach). It appears in Rituals after allocating the 'Mysterious Rites' node on the Atlas tree and can drop three new corrupted Idols. Note: distinct from both the King and the Bodach.",
    mechanics_en: '',
    source: 'compass d481c64c · Ritual opsiyonel yan boss (pinnacle DEĞİL) [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'medved',
    en: 'Medved',
    boss_type: 'gate',
    related: ['expedition'],
    access_en:
      "An Expedition (Ocean) story boss: an ancient Kalguuran warrior that awakens in the tomb on Gwennen's island. Defeating it drops a directable Logbook.",
    mechanics_en: '',
    source: 'compass d481c64c · Expedition ara/story boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'uhtred',
    en: 'Uhtred, the Star-Drinker',
    boss_type: 'gate',
    related: ['expedition'],
    access_en:
      'A deep-ocean Expedition story boss. Defeating it is said to drop a giant Verisium meteor into the ocean, opening a new eldritch endgame biome. The "Star-Drinker" title and its exact role are single-source (community ocean guides) and not yet confirmed by primary wikis — treat as unverified.',
    mechanics_en: '',
    source: 'compass d481c64c · [TEK KAYNAK — confidence: single-source] · adı/rolü birincil kaynakta doğrulanmadı'
  },
  {
    id: 'phyx',
    en: 'Phyx, Sentinel of the Spark',
    boss_type: 'gate',
    related: ['fortress'],
    access_en:
      'A Fortress gate boss in the Patriarch Hall. It drops the Origin Spark (used for the Origin Core) and is fought with a T15 Waystone under limited attempts.',
    mechanics_en: '',
    source: 'compass d481c64c · Fortress ara boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'phya',
    en: 'Phya, Sentinel of the Cradle',
    boss_type: 'gate',
    related: ['fortress'],
    access_en:
      'A Fortress gate boss in the Matriarch Hall. It drops the Origin Cradle (used for the Origin Core) and is fought with a T15 Waystone under limited attempts.',
    mechanics_en: '',
    source: 'compass d481c64c · Fortress ara boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'geonor-doryani',
    en: 'Geonor (Western Enigma) & Doryani (Eastern Enigma)',
    boss_type: 'gate',
    related: ['fortress'],
    access_en:
      'Fortress gate bosses found in the Enigma Chambers. Defeating them drops a Crisis fragment and opens the way to the Arbiter of Ash.',
    mechanics_en:
      'Stronger, endgame versions of the campaign bosses Geonor and Doryani.',
    source: 'compass d481c64c · Fortress ara/quest boss (kampanya boss\'ları reused) [DOĞRULANDI]'
  },
  {
    id: 'tasgul',
    en: 'Tasgul, Swallower of Light',
    boss_type: 'gate',
    related: ['abyss'],
    access_en:
      "An Abyss gate boss in the Lightless Void (added in 0.3, present in 0.5). Defeating it drops a Kulemak's Invitation, used to reach the Vessel of Kulemak.",
    mechanics_en: '',
    source: 'compass d481c64c · Abyss ara boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'vandroth',
    en: 'Vandroth, Blackblooded Enslaver',
    boss_type: 'gate',
    related: ['abyss'],
    access_en:
      "An Abyss gate boss in the Dark Domain (added in 0.3, present in 0.5). Defeating it drops a Kulemak's Invitation, used to reach the Vessel of Kulemak.",
    mechanics_en: '',
    source: 'compass d481c64c · Abyss ara boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  },
  {
    id: 'architect-xipocado',
    en: 'The Architect (Xipocado)',
    boss_type: 'gate',
    related: ['vaal'],
    access_en:
      'A Vaal Temple gate boss (added in 0.4, present in 0.5). Defeating it in the Temple opens special reward rooms, including the Royal Access Chamber that leads to Atziri.',
    mechanics_en: '',
    source: 'compass d481c64c · Vaal Temple ara boss [DOĞRULANDI] · dövüş mekaniği kaynakta yok'
  }
]

// --- ana ----------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-bosses-glossary.json')
const outDir = join(projectRoot, 'src', 'data')
const outPath = join(outDir, 'bosses.json')
const iconRelPrefix = 'assets/bosses/'
const iconDir = join(projectRoot, 'src', 'renderer', 'assets', 'bosses')

function main(): void {
  const glossary: TrGlossary = existsSync(glossaryPath)
    ? (JSON.parse(readFileSync(glossaryPath, 'utf-8')) as TrGlossary)
    : {}

  let missing = 0
  let fullCount = 0
  let blankMechCount = 0

  const records: BossRecord[] = FACTS.map((f) => {
    const g = glossary[f.id] ?? {}

    // Ad (proper noun): TR yoksa EN'e düş, status needs-translation.
    const tr = g.tr ?? f.en
    const tr_status: TrStatus = g.tr ? g.status ?? 'proposed' : 'needs-translation'
    if (!g.tr) missing++

    // access: EN doluysa TR de beklenir.
    const access_tr = g.access ?? ''
    if (f.access_en && !access_tr) missing++

    // mechanics: EN boşsa TR de boş kalır (eksik sayılmaz — UYDURMA YOK).
    const mechanics_tr = f.mechanics_en ? g.mechanics ?? '' : ''
    if (f.mechanics_en && !mechanics_tr) missing++
    if (!f.mechanics_en) blankMechCount++
    if (f.mechanics_en && f.access_en) fullCount++

    // İkon + banner: produce-boss-icons.cjs üretir, yoksa null.
    // f.icon override edilmişse (mevcut worldmap madalyonu) onu kullan.
    const iconFile = f.icon ?? `${f.id}.png`
    const bannerFile = `${f.id}-banner.png`
    const hasIcon = existsSync(join(iconDir, iconFile))
    const hasBanner = existsSync(join(iconDir, bannerFile))

    return {
      id: f.id,
      en: f.en,
      tr,
      tr_status,
      boss_type: f.boss_type,
      related: f.related,
      access_en: f.access_en,
      access_tr,
      mechanics_en: f.mechanics_en,
      mechanics_tr,
      icon: hasIcon ? iconRelPrefix + iconFile : null,
      banner: hasBanner ? iconRelPrefix + bannerFile : null,
      category: 'boss',
      source: f.source,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: new Date().toISOString().slice(0, 10)
    }
  })

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8')

  const withIcon = records.filter((r) => r.icon).length
  const byType = records.reduce<Record<string, number>>((m, r) => {
    m[r.boss_type] = (m[r.boss_type] ?? 0) + 1
    return m
  }, {})
  console.log(`yazıldı: ${outPath}`)
  console.log(
    `  ${records.length} boss · pinnacle:${byType.pinnacle ?? 0} gate:${byType.gate ?? 0} endgame:${byType.endgame ?? 0}`
  )
  console.log(`  mekanik dolu: ${fullCount} | mekanik boş (emin değil): ${blankMechCount}`)
  console.log(`  ikon eşleşen: ${withIcon}/${records.length}`)
  console.log(`  eksik TR alanı (needs-translation kaynağı): ${missing}`)
}

main()
