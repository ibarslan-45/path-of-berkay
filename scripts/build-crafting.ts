/**
 * build-crafting.ts
 * ----------------------------------------------------------------------------
 * CRAFTING / ÜRETİM kategorisi -> src/data/crafting.json.
 *
 * ALT-TİPLER (tek "Crafting" sekmesinde alt-filtre):
 *   flow      : adım adım üretim akışları + strateji + orb rolleri.
 *   bench     : bench/mekanik (Salvage, Disenchant, Reforge/Exchange, Genesis,
 *               Gold, Catalyst-quality).
 *   recipe    : SADECE PoE2 0.5'te DOĞRULANMIŞ recipe'ler (salvage+disenchant).
 *   reference : başvuru tabloları (crafting Omen'leri, Catalyst'ler) — etki
 *               metni currency.json'dan `related` ile gelir (TEKRAR YOK).
 *
 * STATUS alanı:
 *   ok                 : içerik dolu (a=RePoE / b=PoE2 0.5 güvenli bilgi).
 *   needs-verification : (c) İSKELET kayıt. İçerik bilinçli BOŞ; kullanıcı derin
 *                        araştırmayla dolduracak. UI "Doğrulama bekleniyor" gösterir.
 *                        UYDURMA YOK: emin olunmayan sistem/sayı buraya bırakıldı.
 *
 * VERİ KAYNAĞI (proje talimatları): GGG statik verisinde akış/recipe yapısal yok. İçerik
 * RePoE currency etki metinleri + keywords + PoE2 0.5 web doğrulamasından
 * TÜRETİLDİ. Kesin sayısal eşikler (Greater/Perfect mod seviyesi) bilinçli
 * GENEL bırakıldı; tam değerler İSKELET kayıtlarda.
 *
 * MATERYAL TEKRARI YOK: orb/essence/omen/catalyst/liquid Currency'de. Burada
 * NASIL kullanıldıkları; materyaller `related` ile Currency id'lerine bağlanır.
 *
 * ÇEVİRİ: eşleşme anahtarı EN. Tüm TR tr-crafting-glossary.json. needs-translation
 * hedef 0 (İSKELET boş alanları hariç — onlar bilinçli boş, sayılmaz).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const GAME_VERSION = '0.5.0'
const LEAGUE = 'The Runes of Aldur'

type TrStatus = 'exists' | 'proposed' | 'needs-translation'
type Subtype = 'flow' | 'bench' | 'recipe' | 'reference'
type Status = 'ok' | 'needs-verification'

const M = 'Metadata/Items/Currency/'
// Currency id sabitleri (related -> Currency kategorisine referans).
const C = {
  TRANSMUTE: M + 'CurrencyUpgradeToMagic',
  AUGMENT: M + 'CurrencyAddModToMagic',
  REGAL: M + 'CurrencyUpgradeMagicToRare',
  EXALT: M + 'CurrencyAddModToRare',
  GREATER_EXALT: M + 'CurrencyAddModToRare2',
  PERFECT_EXALT: M + 'CurrencyAddModToRare3',
  CHAOS: M + 'CurrencyRerollRare',
  ALCH: M + 'CurrencyUpgradeToRare',
  DIVINE: M + 'CurrencyModValues',
  ANNUL: M + 'CurrencyRemoveMod',
  VAAL: M + 'CurrencyCorrupt',
  CHANCE: M + 'CurrencyUpgradeRandomly',
  FRACTURE: M + 'CurrencyFractureRare',
  MIRROR: M + 'CurrencyDuplicate',
  ARMOURER: M + 'CurrencyArmourQuality',
  WHETSTONE: M + 'CurrencyWeaponQuality',
  ARCANIST: M + 'CurrencyMagicQuality',
  ARTIFICER_ORB: M + 'CurrencyAddEquipmentSocket',
  ARTIFICER_SHARD: M + 'CurrencyAddEquipmentSocketShard',
  TRANSMUTE_SHARD: M + 'CurrencyUpgradeToMagicShard',
  REGAL_SHARD: M + 'CurrencyUpgradeMagicToRareShard',
  LIQUID: M + 'DistilledEmotion5',
  ESSENCE: M + 'CurrencyEssenceLife',
  GREATER_ESSENCE: M + 'CurrencyGreaterEssenceLife',
  PERFECT_ESSENCE: M + 'CurrencyPerfectEssenceLife',
  // side-target omen'leri (flow related için)
  OMEN_DEXTRAL_EXALT: M + 'OmenOnExaltAddSuffixes',
  OMEN_SINISTRAL_EXALT: M + 'OmenOnExaltAddPrefixes',
  OMEN_GREATER_EXALT: M + 'OmenOnExaltAddTwoMods',
  OMEN_DEXTRAL_ANNUL: M + 'OmenOnAnnulRemoveSuffixes',
  OMEN_SINISTRAL_ANNUL: M + 'OmenOnAnnulRemovePrefixes',
  OMEN_CHANCE: M + 'OmenOnChanceNotDestroy'
} as const

// 22 crafting Omen'i (reference tablosu). Etki metni currency'den.
const CRAFTING_OMENS = [
  'OmenOnExaltAddPrefixes', 'OmenOnExaltAddSuffixes', 'OmenOnExaltAddTwoMods',
  'OmenOnExaltAddExistingModType', 'OmenOnExaltConsumeQuality',
  'OmenOnAnnulRemovePrefixes', 'OmenOnAnnulRemoveSuffixes', 'OmenOnAnnulRemoveTwoMods',
  'OmenOnChaosPrefix', 'OmenOnChaosSuffix', 'OmenOnChaosLowestLevelMod',
  'OmenOnRegalPrefix', 'OmenOnRegalSuffix', 'OmenOnRegalAddExistingModType',
  'OmenOnAlchemyMaximumPrefixes', 'OmenOnAlchemyMaximumSuffixes',
  'OmenOnPerfectEssencePrefix', 'OmenOnPerfectEssenceSuffix',
  'OmenOnChanceNotDestroy', 'OmenOnDivineSanctify',
  'OmenOnAbyssAddPrefixes', 'OmenOnAbyssAddSuffixes'
].map((s) => M + s)

// 12 temel Catalyst (reference tablosu). Etki metni currency'den.
const CATALYSTS = [
  'CurrencyJewelleryQualityAttribute', 'CurrencyJewelleryQualityDefences',
  'CurrencyJewelleryQualityChaos', 'CurrencyJewelleryQualityLightning',
  'CurrencyJewelleryQualityLife', 'CurrencyJewelleryQualityMana',
  'CurrencyJewelleryQualityAttack', 'CurrencyJewelleryQualityCaster',
  'CurrencyJewelleryQualitySpeed', 'CurrencyJewelleryQualityCold',
  'CurrencyJewelleryQualityPhysical', 'CurrencyJewelleryQualityFire'
].map((s) => M + s)

// İkon: ilgili currency asset yolunu yeniden kullan (yeni ikon yok).
const A = 'assets/currency/'
const ICO = {
  REGAL: A + 'CurrencyUpgradeMagicToRare.png',
  ALCH: A + 'CurrencyUpgradeToRare.png',
  AUGMENT: A + 'CurrencyAddModToMagic.png',
  WHETSTONE: A + 'CurrencyWeaponQuality.png',
  ARMOURER: A + 'CurrencyArmourQuality.png',
  ARCANIST: A + 'CurrencyWeaponMagicQuality.png',
  OMEN: A + 'VoodooOmens3Yellow.png',
  LIQUID: A + 'DistilledEnvy.png',
  CHAOS: A + 'CurrencyRerollRare.png',
  TRANSMUTE_SHARD: A + 'CurrencyUpgradeToMagicShard.png',
  REGAL_SHARD: A + 'CurrencyUpgradeMagicToRareShard.png',
  ARTIFICER_SHARD: A + 'CurrencyAddEquipmentSocketShard.png',
  COIN: A + 'CurrencyCoin.png',
  ANNUL: A + 'AnnullOrb.png',
  VAAL: A + 'CurrencyVaal.png',
  CHANCE: A + 'CurrencyUpgradeToUnique.png',
  DIVINE: A + 'CurrencyModValues.png',
  FRACTURE: A + 'FracturingOrb.png',
  EXALT: A + 'CurrencyAddModToRare.png',
  ESSENCE: A + 'LifeEssence.png',
  GREATER_ESSENCE: A + 'GreaterLifeEssence.png',
  CATALYST: A + 'BreachCatalystFire.png'
} as const

interface CraftFact {
  id: string
  en: string
  subtype: Subtype
  desc_en: string
  steps_en: string[]
  related: string[]
  icon: string | null
  source: string
  status?: Status // varsayılan 'ok'
}

interface TrEntry {
  tr?: string
  status?: TrStatus
  desc?: string
  steps?: string[]
}
type TrGlossary = Record<string, TrEntry>

interface CraftRecord {
  id: string
  en: string
  tr: string
  tr_status: TrStatus
  subtype: Subtype
  status: Status
  desc_en: string
  desc_tr: string
  steps_en: string[]
  steps_tr: string[]
  related: string[]
  icon: string | null
  category: 'crafting'
  source: string
  game_version: string
  league: string
  last_updated: string
}

const REPOE = 'repoe-fork(currency+keywords)'
const MIXED = 'repoe-fork+poe2-0.5-doğrulı'
const KNOWN = 'poe2-0.5-doğrulı(web)'
const PENDING = 'İSKELET — doğrulama bekliyor (kullanıcı dolduracak)'

// --- FACTS --------------------------------------------------------------------
const FACTS: CraftFact[] = [
  // ============ FLOW ============
  {
    id: 'flow-basic',
    en: 'Basic Rare Item Crafting',
    subtype: 'flow',
    desc_en:
      'The standard path to build a Rare item from a white (Normal) base. You climb rarity step by step — Normal to Magic to Rare — then add and refine modifiers.',
    steps_en: [
      'Start with a white (Normal) base item of the type and item level you want.',
      'Use an Orb of Transmutation to make it Magic (1 modifier).',
      'Use an Orb of Augmentation to add the second Magic modifier.',
      'Use a Regal Orb to turn the Magic item into a Rare item, adding one more modifier.',
      'Use Exalted Orbs to fill the remaining modifier slots (up to six on most gear).',
      'If the result is poor, a Chaos Orb removes one modifier and adds a new one to fix a single bad roll.'
    ],
    related: [C.TRANSMUTE, C.AUGMENT, C.REGAL, C.EXALT, C.CHAOS],
    icon: ICO.REGAL,
    source: REPOE + ' · currency etki metinleri'
  },
  {
    id: 'flow-alchemy',
    en: 'Quick Rare with Orb of Alchemy',
    subtype: 'flow',
    desc_en:
      'A faster route that skips the Magic stage. Best when you just need a serviceable Rare quickly, for example to roll a Waystone or a levelling item.',
    steps_en: [
      'Start with a white (Normal) base item.',
      'Use an Orb of Alchemy to upgrade it straight to a Rare item with a full starting set of modifiers.',
      'Use Exalted Orbs to add any remaining modifiers.',
      'Use a Divine Orb to re-roll the numeric values of the modifiers if they rolled low.'
    ],
    related: [C.ALCH, C.EXALT, C.DIVINE],
    icon: ICO.ALCH,
    source: REPOE + ' · currency etki metinleri'
  },
  {
    id: 'flow-magic-base',
    en: 'Magic-Base (Alt-Regal) Method',
    subtype: 'flow',
    desc_en:
      'A targeted method to land a specific modifier before committing to Rare. You roll the Magic item until it carries the one modifier you really want, then lock it in with a Regal Orb.',
    steps_en: [
      'Transmute a white base to Magic, then read its modifier.',
      'Repeat Transmutation (and Augmentation) until the Magic item has the single modifier you are aiming for.',
      'Use a Regal Orb to promote it to Rare while keeping that modifier.',
      'Continue with Exalted Orbs to complete the item around your chosen base modifier.'
    ],
    related: [C.TRANSMUTE, C.AUGMENT, C.REGAL, C.EXALT],
    icon: ICO.AUGMENT,
    source: REPOE + ' · currency etki metinleri · maxroll yöntem mantığı'
  },
  {
    id: 'flow-essence-slam',
    en: 'Essence Slam (Guaranteed Modifier)',
    subtype: 'flow',
    desc_en:
      'Essences upgrade an item while guaranteeing one specific modifier, which makes them the most reliable way to anchor a build-defining stat. Greater and Perfect Essences guarantee stronger versions; Perfect Essences act on a Rare item, removing one modifier and adding the guaranteed one.',
    steps_en: [
      'Choose the Essence whose guaranteed modifier matches the stat your build needs.',
      'Apply a normal or Greater Essence to a Magic (or Normal) item to make it Rare with that modifier guaranteed.',
      'On an already-Rare item, use a Perfect Essence to remove one modifier and add its guaranteed, high-tier modifier.',
      'Finish the remaining slots with Exalted Orbs around the anchored modifier.'
    ],
    related: [C.ESSENCE, C.GREATER_ESSENCE, C.PERFECT_ESSENCE, C.EXALT],
    icon: ICO.ESSENCE,
    source: REPOE + ' · essence etki metinleri · ' + KNOWN
  },
  {
    id: 'flow-greater-perfect',
    en: 'Greater & Perfect Currency Tiers',
    subtype: 'flow',
    desc_en:
      'Many orbs come in normal, Greater and Perfect tiers. Higher tiers guarantee a higher minimum modifier level, so the modifiers they add or create cannot roll as the weakest versions. Use them once your base item level is high enough to benefit. (Exact minimum-level thresholds: see the verification-pending reference.)',
    steps_en: [
      'Confirm your base item level is high enough that stronger modifier tiers can appear.',
      'Use a Greater orb (Transmutation, Regal, Exalted, Chaos...) to enforce a higher minimum modifier level than the normal orb.',
      'Use a Perfect orb for the highest minimum level, reserved for top-end and pinnacle crafts.'
    ],
    related: [C.GREATER_EXALT, C.PERFECT_EXALT],
    icon: ICO.EXALT,
    source: KNOWN + ' · kesin eşikler İSKELET kaydında'
  },
  {
    id: 'flow-annul',
    en: 'Removing a Modifier (Orb of Annulment)',
    subtype: 'flow',
    desc_en:
      'An Orb of Annulment removes one random modifier from an item. It is the key tool for deleting a single unwanted modifier from an otherwise good Rare, and it pairs with Omens to control which side is removed.',
    steps_en: [
      'Make sure the item has a modifier you are willing to risk, since the removal is random.',
      'Use an Orb of Annulment to remove one random modifier.',
      'To target a side, activate an Omen of Sinistral/Dextral Annulment first so only a prefix/suffix can be removed.',
      'After freeing a slot, add a better modifier with an Exalted Orb.'
    ],
    related: [C.ANNUL, C.OMEN_SINISTRAL_ANNUL, C.OMEN_DEXTRAL_ANNUL, C.EXALT],
    icon: ICO.ANNUL,
    source: REPOE + ' · currency etki metinleri · ' + KNOWN
  },
  {
    id: 'flow-divine',
    en: 'Perfecting Values (Divine Orb)',
    subtype: 'flow',
    desc_en:
      'A Divine Orb re-rolls the numeric values of the modifiers already on an item, without changing which modifiers they are. Use it as the final polish once an item has exactly the modifiers you want but some values rolled low.',
    steps_en: [
      'Finish the item so every modifier on it is one you want to keep.',
      'Use a Divine Orb to randomise the numeric values within each modifier’s range.',
      'Repeat until the important values are high enough; each use is independent.'
    ],
    related: [C.DIVINE],
    icon: ICO.DIVINE,
    source: REPOE + ' · currency etki metinleri'
  },
  {
    id: 'flow-fracture',
    en: 'Locking a Modifier (Fracturing Orb)',
    subtype: 'flow',
    desc_en:
      'A Fracturing Orb permanently locks one random existing modifier on a Rare item so it can never be removed or changed. Fracturing a modifier you want protects it while you re-roll the rest, and underpins deterministic "isolation" crafting.',
    steps_en: [
      'Build a Rare item that already holds the modifier you want to protect.',
      'Use a Fracturing Orb; one random modifier becomes fractured (locked) permanently.',
      'Because the fractured modifier is safe, you can now Annul or Chaos the others more freely.'
    ],
    related: [C.FRACTURE, C.ANNUL, C.CHAOS],
    icon: ICO.FRACTURE,
    source: REPOE + ' · currency etki metinleri · ' + KNOWN
  },
  {
    id: 'flow-isolation',
    en: 'Isolation Crafting (Fracture + Targeted Annul)',
    subtype: 'flow',
    desc_en:
      'A deterministic technique that combines fracturing with side-targeted Annulment. By locking the good modifiers and then removing only from the side that holds the bad one, you can delete a single specific modifier with certainty.',
    steps_en: [
      'Fracture the good modifier(s) so they are locked and safe.',
      'Make sure the only remaining removable modifier on the targeted side is the bad one.',
      'Activate the matching Sinistral/Dextral Annulment Omen, then use an Orb of Annulment.',
      'Only the bad modifier is legal to remove, so it is deleted deterministically.'
    ],
    related: [C.FRACTURE, C.ANNUL, C.OMEN_SINISTRAL_ANNUL, C.OMEN_DEXTRAL_ANNUL],
    icon: ICO.FRACTURE,
    source: KNOWN + ' · strateji; kesin koşullar İSKELET'
  },
  {
    id: 'flow-chance',
    en: 'Gambling Uniques (Orb of Chance)',
    subtype: 'flow',
    desc_en:
      'An Orb of Chance unpredictably either upgrades a Normal item to a Unique or destroys it. It is a gamble used to fish for specific Unique items from a chosen base type.',
    steps_en: [
      'Pick the Normal base type that corresponds to the Unique you are hoping for.',
      'Use an Orb of Chance; the item either becomes a random Unique of that base or is destroyed.',
      'Activate an Omen of Chance first so the item is not destroyed on failure.'
    ],
    related: [C.CHANCE, C.OMEN_CHANCE],
    icon: ICO.CHANCE,
    source: REPOE + ' · currency etki metinleri · ' + KNOWN
  },
  {
    id: 'flow-vaal',
    en: 'Corrupting with Vaal Orbs',
    subtype: 'flow',
    desc_en:
      'A Vaal Orb modifies an item unpredictably and Corrupts it. Corruption is irreversible and the item can no longer be changed by normal currency, so it is always the final step — a high-risk, high-reward gamble for an extra outcome.',
    steps_en: [
      'Only corrupt an item you are willing to lose or leave exactly as it is.',
      'Use a Vaal Orb; the outcome may add an implicit, change values, leave it unchanged, or brick it.',
      'After corruption the item is final and cannot be crafted on with normal currency.'
    ],
    related: [C.VAAL],
    icon: ICO.VAAL,
    source: REPOE + ' · currency etki metinleri'
  },
  {
    id: 'flow-quality',
    en: 'Raising Quality Before Crafting',
    subtype: 'flow',
    desc_en:
      'Quality grants small bonuses scaled by item type (more physical damage on martial weapons, more defences on armour). Raise it to the default maximum of 20% before or after rolling modifiers.',
    steps_en: [
      'Pick the right quality currency for the base: Blacksmith’s Whetstone for martial weapons, Arcanist’s Etcher for caster weapons, Armourer’s Scrap for armour.',
      'Apply it repeatedly until the item reaches 20% quality.',
      'Quality on a white base is cheapest, so quality first when planning a fresh craft.'
    ],
    related: [C.WHETSTONE, C.ARCANIST, C.ARMOURER],
    icon: ICO.WHETSTONE,
    source: REPOE + ' · keywords:Quality · currency etki metinleri'
  },
  {
    id: 'flow-omen-meta',
    en: 'Meta-Crafting with Omens',
    subtype: 'flow',
    desc_en:
      'Omens are consumable items that change how your very next currency use behaves, enabling exclusive meta-crafting outcomes. Activate an Omen in your inventory, then use the matching orb. See the Crafting Omens reference for the full list.',
    steps_en: [
      'Place the Omen in your inventory and set it active; it is consumed when the next matching orb is used.',
      'Side-targeting: a Dextral Omen forces a suffix; a Sinistral one forces a prefix.',
      'Quantity: an Omen of Greater Exaltation makes the next Exalted Orb add two modifiers at once.',
      'Use Omens to steer outcomes you normally cannot control, such as which side an Exalted Orb adds to.'
    ],
    related: [C.EXALT, C.OMEN_DEXTRAL_EXALT, C.OMEN_SINISTRAL_EXALT, C.OMEN_GREATER_EXALT],
    icon: ICO.OMEN,
    source: REPOE + ' · keywords:Omen · currency omen etki metinleri'
  },
  {
    id: 'flow-liquid-instill',
    en: 'Instilling Amulets with Liquid Emotions',
    subtype: 'flow',
    desc_en:
      'Liquid Emotions are Delirium-exclusive currency. They let you instil an amulet with a Notable Passive Skill taken from the Passive Tree (the equivalent of an anoint). Instilling a Notable you already allocated grants no extra benefit.',
    steps_en: [
      'Collect Liquid Emotions from the Delirium mechanic; different emotions and amounts map to different Notables.',
      'Apply the required Liquid Emotion combination to an amulet to instil the chosen Notable Passive Skill.',
      'Pick a Notable you have not already allocated on the tree so the bonus is not wasted.'
    ],
    related: [C.LIQUID],
    icon: ICO.LIQUID,
    source: REPOE + ' · keywords:DistilledEmotion'
  },
  {
    id: 'flow-crafted-cap',
    en: 'The Single Crafted-Modifier Rule (0.5)',
    subtype: 'flow',
    desc_en:
      'In 0.5 an item can hold only one crafted modifier at a time. Essences, Runic Alloys and similar guaranteed-modifier methods all compete for that single crafted slot, so the old technique of stacking several guaranteed modifiers on one item no longer works. Plan which single guaranteed modifier matters most.',
    steps_en: [
      'Decide the one guaranteed (crafted) modifier the item most needs.',
      'Apply that method (for example an Essence) — it occupies the single crafted slot.',
      'Fill the rest of the item with normal random modifiers (Exalted Orbs), since a second crafted modifier is not allowed.'
    ],
    related: [C.ESSENCE, C.EXALT],
    icon: ICO.ESSENCE,
    source: KNOWN + ' · 0.5 meta-kural'
  },

  // ============ BENCH ============
  {
    id: 'bench-salvage',
    en: 'Salvage Bench',
    subtype: 'bench',
    desc_en:
      'A bench unlocked early in Act One (the "Finding the Forge" quest) that breaks gear down into crafting currency instead of selling it. It recovers quality as shards and frees socketed runes.',
    steps_en: [
      'Place the Salvage Bench in your hideout or use the one in town.',
      'Salvage a quality item to recover quality currency shards of the matching type.',
      'Salvage an item with Rune Sockets to gain Artificer’s Shards (and to recover certain socketables).'
    ],
    related: [C.ARMOURER, C.WHETSTONE, C.ARCANIST, C.ARTIFICER_SHARD, C.ARTIFICER_ORB],
    icon: ICO.ARMOURER,
    source: MIXED
  },
  {
    id: 'bench-disenchant',
    en: 'Disenchanting',
    subtype: 'bench',
    desc_en:
      'A service offered by the caster vendors at the Encampments (such as Una, Zarka and Servi). It converts unwanted Magic and Rare items into currency shards rather than gold.',
    steps_en: [
      'Bring Magic or Rare items you do not want to a caster vendor.',
      'Disenchant a Magic item to receive Transmutation Shards.',
      'Disenchant a Rare item to receive Regal Shards.',
      'Combine ten shards of a type to form the matching orb (Orb of Transmutation or Regal Orb).'
    ],
    related: [C.TRANSMUTE_SHARD, C.TRANSMUTE, C.REGAL_SHARD, C.REGAL],
    icon: ICO.TRANSMUTE_SHARD,
    source: MIXED
  },
  {
    id: 'bench-reforge',
    en: 'Reforging & Currency Exchange (3-to-1)',
    subtype: 'bench',
    desc_en:
      'A conversion system that combines several of the same lower item into one of a higher tier. Shards combine into orbs, and lesser currencies step up into greater ones, turning surplus drops into something more useful.',
    steps_en: [
      'Gather a stack of the same lower-tier item (for example ten shards, or three lesser runes).',
      'Combine ten matching shards into their orb, or step three of a lesser currency up into the next tier.',
      'Use the conversion to turn drops you do not need into the currency you do.'
    ],
    related: [C.TRANSMUTE_SHARD, C.REGAL_SHARD, C.ARTIFICER_SHARD],
    icon: ICO.CHAOS,
    source: KNOWN + ' · 3-to-1 genel; tam rune-birleşim tarifleri İSKELET'
  },
  {
    id: 'bench-genesis-tree',
    en: 'Genesis Tree (Breach Crafting)',
    subtype: 'bench',
    desc_en:
      'A crafting system tied to the Breach mechanic. It is fed by materials dropped inside Breaches (Wombgifts and Hive Blood) and is used to craft jewellery (rings, amulets, belts) and currency with controlled properties by allocating nodes on a small tree. In 0.5 it is also the sole source of Catalysts, which no longer drop from monsters. (The full node list is verification-pending.)',
    steps_en: [
      'Collect Wombgifts and Hive Blood by killing monsters inside Breach encounters.',
      'Spend them on the Genesis Tree to allocate nodes that control what is crafted.',
      'Birth jewellery with guaranteed properties, or produce currency and Catalysts.'
    ],
    related: [C.CHAOS],
    icon: null,
    source: KNOWN + ' · genel doğru; tam node/dal listesi İSKELET'
  },
  {
    id: 'bench-quality-catalyst',
    en: 'Applying Quality with Catalysts',
    subtype: 'bench',
    desc_en:
      'Catalysts add quality to rings, amulets and jewels, and that quality boosts a specific category of modifier rather than giving a flat bonus. Each Catalyst type enhances one modifier tag, so matching the Catalyst to the item’s key modifiers increases their values. In 0.5 Catalysts come from the Genesis Tree. See the Catalysts reference for the full list.',
    steps_en: [
      'Identify the dominant modifier type on your ring, amulet or jewel.',
      'Apply the matching Catalyst repeatedly to raise quality, which scales that modifier type.',
      'Applying a different Catalyst type replaces the previous quality type.'
    ],
    related: [C.MIRROR],
    icon: ICO.CATALYST,
    source: REPOE + ' · catalyst etki metinleri · ' + KNOWN
  },
  {
    id: 'bench-gold',
    en: 'Selling & Respec for Gold',
    subtype: 'bench',
    desc_en:
      'PoE2 uses Gold as a town currency. You earn Gold by selling unwanted items to NPC vendors, and you spend it to respec (refund) allocated Passive Skill points so you can adjust your build.',
    steps_en: [
      'Sell surplus items to any town vendor to receive Gold.',
      'Open the Passive Tree and refund individual allocated points by paying Gold; the cost rises with character level.',
      'Use Gold-funded respecs to retune a build without starting a new character.'
    ],
    related: [],
    icon: ICO.COIN,
    source: KNOWN + ' (gold ekonomisi)'
  },

  // ============ REFERENCE ============
  {
    id: 'reference-omens',
    en: 'Crafting Omens Reference',
    subtype: 'reference',
    desc_en:
      'Omens are consumables that modify how the next matching currency behaves. The list below shows the crafting Omens; each entry’s effect text comes from the item itself. Pair a side Omen (Sinistral = prefix, Dextral = suffix) with the orb it names.',
    steps_en: [],
    related: CRAFTING_OMENS,
    icon: ICO.OMEN,
    source: REPOE + ' · omen etki metinleri'
  },
  {
    id: 'reference-catalysts',
    en: 'Catalysts Reference',
    subtype: 'reference',
    desc_en:
      'Catalysts add quality to jewellery (and jewels) that enhances one specific modifier type. The list below shows each Catalyst and the modifier category it boosts. Match the Catalyst to your item’s key modifiers.',
    steps_en: [],
    related: CATALYSTS,
    icon: ICO.CATALYST,
    source: REPOE + ' · catalyst etki metinleri'
  },

  // ============ RECIPE (PoE2 0.5 doğrulı) ============
  {
    id: 'recipe-salvage-armour',
    en: 'Salvage: Quality Armour to Armourer’s Scrap',
    subtype: 'recipe',
    desc_en: 'Salvaging a piece of armour that has quality returns Armourer’s Scrap.',
    steps_en: ['Input: an armour piece with quality.', 'Output: Armourer’s Scrap (scaled to the quality salvaged).'],
    related: [C.ARMOURER],
    icon: ICO.ARMOURER,
    source: MIXED
  },
  {
    id: 'recipe-salvage-martial',
    en: 'Salvage: Quality Martial Weapon to Blacksmith’s Whetstone',
    subtype: 'recipe',
    desc_en: 'Salvaging a martial weapon that has quality returns Blacksmith’s Whetstone.',
    steps_en: ['Input: a martial weapon with quality.', 'Output: Blacksmith’s Whetstone.'],
    related: [C.WHETSTONE],
    icon: ICO.WHETSTONE,
    source: MIXED
  },
  {
    id: 'recipe-salvage-caster',
    en: 'Salvage: Quality Caster Weapon to Arcanist’s Etcher',
    subtype: 'recipe',
    desc_en: 'Salvaging a caster weapon that has quality returns Arcanist’s Etcher.',
    steps_en: ['Input: a caster weapon with quality.', 'Output: Arcanist’s Etcher.'],
    related: [C.ARCANIST],
    icon: ICO.ARCANIST,
    source: MIXED
  },
  {
    id: 'recipe-salvage-rune',
    en: 'Salvage: Rune-Socketed Gear to Artificer’s Shard',
    subtype: 'recipe',
    desc_en:
      'Salvaging an item that has Rune Sockets returns Artificer’s Shards. Ten Artificer’s Shards combine into an Artificer’s Orb, which adds a Rune Socket to an item.',
    steps_en: [
      'Input: an item with one or more Rune Sockets.',
      'Output: Artificer’s Shard(s).',
      'Ten Artificer’s Shards = one Artificer’s Orb.'
    ],
    related: [C.ARTIFICER_SHARD, C.ARTIFICER_ORB],
    icon: ICO.ARTIFICER_SHARD,
    source: MIXED
  },
  {
    id: 'recipe-disenchant-magic',
    en: 'Disenchant: Magic Item to Transmutation Shard',
    subtype: 'recipe',
    desc_en:
      'Disenchanting a Magic item at a caster vendor returns Transmutation Shards. Ten shards combine into an Orb of Transmutation.',
    steps_en: ['Input: an unwanted Magic item.', 'Output: Transmutation Shard(s).', 'Ten shards = one Orb of Transmutation.'],
    related: [C.TRANSMUTE_SHARD, C.TRANSMUTE],
    icon: ICO.TRANSMUTE_SHARD,
    source: MIXED
  },
  {
    id: 'recipe-disenchant-rare',
    en: 'Disenchant: Rare Item to Regal Shard',
    subtype: 'recipe',
    desc_en:
      'Disenchanting a Rare item at a caster vendor returns Regal Shards. Ten shards combine into a Regal Orb.',
    steps_en: ['Input: an unwanted Rare item.', 'Output: Regal Shard(s).', 'Ten shards = one Regal Orb.'],
    related: [C.REGAL_SHARD, C.REGAL],
    icon: ICO.REGAL_SHARD,
    source: MIXED
  },

  // ============ İSKELET (c) — doğrulama bekliyor, içerik bilinçli BOŞ ============
  {
    id: 'skeleton-runeforging',
    en: 'Runeforging & Verisium (Runes of Aldur)',
    subtype: 'bench',
    desc_en: '',
    steps_en: [],
    related: [],
    icon: null,
    status: 'needs-verification',
    source: PENDING + ' · 0.5 lig crafting katmanı (Verisium, Runic Ward, Runic Alloy, rune-birleşim)'
  },
  {
    id: 'skeleton-desecration',
    en: 'Desecration & Abyssal Bones',
    subtype: 'bench',
    desc_en: '',
    steps_en: [],
    related: [],
    icon: null,
    status: 'needs-verification',
    source: PENDING + ' · Abyss bone craft + Well of Souls reveal + Lich pool'
  },
  {
    id: 'skeleton-genesis-nodes',
    en: 'Genesis Tree — Full Node List',
    subtype: 'reference',
    desc_en: '',
    steps_en: [],
    related: [],
    icon: null,
    status: 'needs-verification',
    source: PENDING + ' · Genesis Tree tam node/dal listesi ([[bench-genesis-tree]] genelini tamamlar)'
  },
  {
    id: 'skeleton-tier-thresholds',
    en: 'Greater/Perfect Tier Thresholds',
    subtype: 'reference',
    desc_en: '',
    steps_en: [],
    related: [],
    icon: null,
    status: 'needs-verification',
    source: PENDING + ' · Greater/Perfect kesin minimum mod seviyesi eşikleri ([[flow-greater-perfect]] kesin sayıları)'
  }
]

// --- ana ----------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const glossaryPath = join(__dirname, 'tr-crafting-glossary.json')
const outDir = join(projectRoot, 'src', 'data')
const outPath = join(outDir, 'crafting.json')

function main(): void {
  const glossary: TrGlossary = existsSync(glossaryPath)
    ? (JSON.parse(readFileSync(glossaryPath, 'utf-8')) as TrGlossary)
    : {}

  let missing = 0
  const records: CraftRecord[] = FACTS.map((f) => {
    const g = glossary[f.id] ?? {}
    const status: Status = f.status ?? 'ok'
    const skeleton = status === 'needs-verification'

    const tr = g.tr ?? f.en
    const tr_status: TrStatus = g.tr ? g.status ?? 'proposed' : 'needs-translation'
    if (!g.tr) missing++

    // İSKELET kayıtlarda içerik bilinçli boş -> eksik sayma.
    const desc_tr = g.desc ?? ''
    if (!skeleton && f.desc_en && !desc_tr) missing++

    const steps_tr = f.steps_en.length ? g.steps ?? [] : []
    if (!skeleton && f.steps_en.length && steps_tr.length !== f.steps_en.length) missing++

    return {
      id: f.id,
      en: f.en,
      tr,
      tr_status,
      subtype: f.subtype,
      status,
      desc_en: f.desc_en,
      desc_tr,
      steps_en: f.steps_en,
      steps_tr,
      related: f.related,
      icon: f.icon,
      category: 'crafting',
      source: f.source,
      game_version: GAME_VERSION,
      league: LEAGUE,
      last_updated: new Date().toISOString().slice(0, 10)
    }
  })

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8')

  const byType = records.reduce<Record<string, number>>((a, r) => {
    a[r.subtype] = (a[r.subtype] ?? 0) + 1
    return a
  }, {})
  const skel = records.filter((r) => r.status === 'needs-verification').length
  console.log(`yazıldı: ${outPath}`)
  console.log(`  ${records.length} kayıt`, byType)
  console.log(`  İSKELET (needs-verification): ${skel}`)
  console.log(`  eksik TR alanı (İSKELET hariç): ${missing}`)
}

main()
