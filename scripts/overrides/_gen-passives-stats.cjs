/* Passives stat satırı ELLE TAM-CÜMLE çeviri üretici (tek seferlik authoring).
 * Opus, cümle-seviyesi doğal TR. Çıktı: passives-stats.tr.json (stat_en -> TR).
 * build-passives.ts yalnız OKUR. proje talimatları terimleri korunur.
 */
const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'passives.json'), 'utf8'));

const ELEM = { Fire: 'Ateş', Cold: 'Soğuk', Lightning: 'Yıldırım', Chaos: 'Kaos', Physical: 'Fiziksel', Elemental: 'Elemental' };
const SKILLGRP = { Companion: 'Companion', Minion: 'Uşak', Herald: 'Herald', Meta: 'Meta', Mark: 'Mark', Banner: 'Banner', Command: 'Komut' };

// karmaşık / tek-seferlik satırlar
const HAND = {
  'Fire Spells Convert 100% of Fire Damage to Chaos Damage': 'Ateş Büyüleri, Ateş Hasarının %100\'ünü Kaos Hasarına dönüştürür',
  'Dodge Roll cannot Avoid Damage': 'Dodge Roll, Hasardan kaçınamaz',
  'If you would gain a Charge, Allies in your Presence gain that Charge instead': 'Bir Şarj kazanacak olursan, onun yerine Mevcudiyetindeki Müttefikler o Şarjı kazanır',
  "Unarmed Attacks that would use an Equipped Quarterstaff's damage have:": 'Kuşanılmış bir Quarterstaff\'ın hasarını kullanacak Silahsız Saldırılar şunlara sahiptir:',
  'Cannot use Charms': 'Tılsım kullanamazsın',
  'Regenerate 1 Rage per second per 4 Rage spent Recently': 'Yakın zamanda harcanan her 4 Öfke için saniyede 1 Öfke Yenile',
  'Invocation Skills cannot gain Energy while Triggering Spells': 'Invocation Becerileri, Büyü Tetiklerken Enerji kazanamaz',
  'Energy Shield does not Recharge': 'Enerji Kalkanı Şarj olmaz',
  'You cannot Recover Energy Shield from Regeneration': 'Yenilenmeden Enerji Kalkanı Geri Kazanamazsın',
  'You cannot Recover Energy Shield to above Armour': 'Zırhın üzerine çıkacak şekilde Enerji Kalkanı Geri Kazanamazsın',
  'Cannot Recover Life other than from Leech': 'Emme dışında Can Geri Kazanamazsın',
  'Life Leech effects are not removed when Unreserved Life is Filled': 'Rezerve Edilmemiş Can Dolduğunda Can Emme etkileri kaldırılmaz',
  'Gain Elemental Archon after spending 100% of your Maximum Mana': 'Azami Mananın %100\'ünü harcadıktan sonra Elemental Archon kazan',
  'Grants 2 additional Skill Slots': '2 ek Beceri Yuvası verir',
  'Banner Buffs linger on you for 2 seconds after you leave the Area': 'Alandan ayrıldıktan sonra Banner Buff\'ları üzerinde 2 saniye daha kalır',
  'Defend with 120% of Armour while not on Low Energy Shield': 'Düşük Enerji Kalkanında değilken Zırhının %120\'siyle savun',
  'Raise Shield inflicts Parried for 2 seconds on Hit': 'Raise Shield, Vuruşta 2 saniyeliğine Parried uygular',
  '15% increased Mana Cost Efficiency': '%15 artan Mana Maliyeti Verimi',
  'Cannot be Critically Hit while Parrying': 'Parry yaparken Kritik Vurulamazsın',
  '7% chance to Avoid Death from Hits': 'Vuruşlardan gelen Ölümden kaçınma %7 şansı',
  "+15 maximum Rage if you've used a Skill that Requires Glory in the past 20 seconds": 'Son 20 saniyede Glory Gerektiren bir Beceri kullandıysan +15 azami Öfke',
  'Damaging Ailments Cannot Be inflicted on you while you already have one': 'Zaten bir tane varken üzerine Hasar Veren Rahatsızlık uygulanamaz',
  'Remove a Curse after Channelling for 2 seconds': '2 saniye Kanalize ettikten sonra bir Laneti kaldır',
  'Your Hits cannot be Evaded by Heavy Stunned Enemies': 'Vuruşların, Ağır Sersemletilmiş Düşmanlar tarafından kaçınılamaz',
  'Hazards have 15% chance to rearm after they are triggered': 'Tehlikeler tetiklendikten sonra %15 ihtimalle yeniden kurulur',
  'Hazards have 5% chance to rearm after they are triggered': 'Tehlikeler tetiklendikten sonra %5 ihtimalle yeniden kurulur',
  '15% chance for Remnants you create to grant their effects twice': 'Oluşturduğun Remnant\'ların etkilerini iki kez verme %15 şansı',
  '25% chance for Trigger skills to refund half of Energy Spent': 'Tetik becerilerinin Harcanan Enerjinin yarısını iade etme %25 şansı',
  'Archon Buffs also grant 50% increased Critical Damage Bonus': 'Archon Buff\'ları ayrıca %50 artan Kritik Hasar Bonusu verir',
  'Archon Buffs also grant 30% increased Critical Hit Chance': 'Archon Buff\'ları ayrıca %30 artan Kritik Vuruş Şansı verir',
  'Archon Buffs also grant +20% to all Elemental Resistances': 'Archon Buff\'ları ayrıca tüm Elemental Dirençlere +%20 verir',
  'Archon Buffs also grant 10% increased Movement Speed': 'Archon Buff\'ları ayrıca %10 artan Hareket Hızı verir',
  'Enemies you Curse cannot Recharge Energy Shield': 'Lanetlediğin Düşmanlar Enerji Kalkanı Şarj edemez',
  '30% chance to Poison on Hit against Enemies that are not Poisoned': 'Zehirlenmemiş Düşmanlara karşı Vuruşta Zehirleme %30 şansı',
  '2% chance that if you would gain Power Charges, you instead gain up to': 'Power Şarjı kazanacak olursan, onun yerine en fazla şu kadar kazanma %2 şansı:',
  '2% chance that if you would gain Frenzy Charges, you instead gain up to your maximum number of Frenzy Charges': 'Frenzy Şarjı kazanacak olursan, onun yerine azami sayıda Frenzy Şarjı kazanma %2 şansı',
  '2% chance that if you would gain Endurance Charges, you instead gain up to maximum Endurance Charges': 'Dayanıklılık Şarjı kazanacak olursan, onun yerine azami Dayanıklılık Şarjı kazanma %2 şansı',
  '4% chance that if you would gain Rage on Hit, you instead gain up to your maximum Rage': 'Vuruşta Öfke kazanacak olursan, onun yerine azami Öfke kazanma %4 şansı',
  'The next Attack you use within 4 seconds after Heavy Stunning a Rare or Unique Enemy is Ancestrally Boosted': 'Nadir veya Eşsiz bir Düşmanı Ağır Sersemlettikten sonraki 4 saniye içinde kullandığın bir sonraki Saldırı Ancestrally Boosted olur',
  'The next Fire Spell you cast yourself after using a Warcry is Ancestrally Boosted': 'Bir Savaş Çığlığı kullandıktan sonra kendin söylediğin bir sonraki Ateş Büyüsü Ancestrally Boosted olur',
  'Enemies you inflict Bleeding on cannot Regenerate Life': 'Kanama uyguladığın Düşmanlar Can Yenileyemez',
  'Enemies you Fully Armour Break cannot Regenerate Life': 'Zırhını Tamamen Kırdığın Düşmanlar Can Yenileyemez',
  'Gain Armour equal to 150% of total Strength Requirements of Equipped Boots, Gloves and Helmet': 'Kuşanılan Bot, Eldiven ve Miğferin toplam Güç Gereksiniminin %150\'si kadar Zırh kazan',
  'Hits that Heavy Stun Enemies have Culling Strike': 'Düşmanları Ağır Sersemleten Vuruşlar Culling Strike\'a sahiptir',
  'Life Flasks applied to you grant Guard for 4 seconds equal to 8% of the Life Recovery per Second they apply': 'Sana uygulanan Can Şişeleri, saniyede uyguladıkları Can Yenilemesinin %8\'i kadar Guard\'ı 4 saniye boyunca verir',
  'Defend with 150% of Armour against Hits from Enemies that are further than 6m away': '6m\'den uzaktaki Düşmanlardan gelen Vuruşlara karşı Zırhının %150\'siyle savun',
  'Banners also grant +25% to all Elemental Resistances affected targets': 'Banner\'lar ayrıca etkilenen hedeflere tüm Elemental Dirençlere +%25 verir',
  '25% chance that when Volatility on you explodes, you regain an equivalent amount of Volatility': 'Üzerindeki Volatility patladığında, eşdeğer miktarda Volatility geri kazanma %25 şansı',
  'Recover 1% of maximum Life per Glory consumed': 'Tüketilen her Glory için azami Canının %1\'ini Yenile',
  '30% increased Mana Cost Efficiency of Attacks during any Mana Flask Effect': 'Herhangi bir Mana Şişesi Etkisi sırasında Saldırıların %30 artan Mana Maliyeti Verimi',
  'Allies in your Presence have 30% increased Glory generation': 'Mevcudiyetindeki Müttefiklerin %30 artan Glory üretimi olur',
  'Enemies are Maimed for 4 seconds after becoming Unpinned': 'Düşmanlar Unpinned olduktan sonra 4 saniye boyunca Maim edilir',
  'Your Aura Buffs do not affect Allies': 'Aura Buff\'ların Müttefikleri etkilemez',
  'Grant Elemental Archon to your Minions for 5 seconds when they Revive': 'Uşakların Dirildiğinde onlara 5 saniyeliğine Elemental Archon ver',
  '15% chance to not destroy Corpses when Consuming Corpses': 'Cesetleri Tüketirken Cesetleri yok etmeme %15 şansı',
  '5% chance to not destroy Corpses when Consuming Corpses': 'Cesetleri Tüketirken Cesetleri yok etmeme %5 şansı',
  'Quarterstaff Skills that consume Power Charges count as consuming an additional Power Charge': 'Power Şarjı tüketen Quarterstaff Becerileri, ek bir Power Şarjı tüketmiş sayılır',
  'Volatile Power also grants 1% increased Critical Hit chance per Volatility exploded': 'Volatile Power ayrıca patlayan her Volatility için %1 artan Kritik Vuruş şansı verir',
  'Pinned Enemies cannot deal Critical Hits': 'Pinned Düşmanlar Kritik Vuruş yapamaz',
  'Enemies you Mark cannot deal Critical Hits': 'Mark\'ladığın Düşmanlar Kritik Vuruş yapamaz',
  'Your Hits cannot be Evaded by Pinned Enemies': 'Vuruşların, Pinned Düşmanlar tarafından kaçınılamaz',
  'When a Banner expires, recover 15% of the Glory required for that Banner': 'Bir Banner sona erdiğinde, o Banner için gereken Glory\'nin %15\'ini geri kazan',
  'Grenades have 15% chance to activate a second time': 'Grenade\'ler %15 ihtimalle ikinci kez etkinleşir',
  "Your Heavy Stun buildup empties 50% faster if you've successfully Parried Recently": 'Yakın zamanda başarıyla Parry yaptıysan, Ağır Sersemletme birikimin %50 daha hızlı boşalır',
  'Bolts fired by Crossbow Attacks have 30% chance to not': 'Arbalet Saldırılarıyla atılan Bolt\'ların %30 ihtimalle şunu yapmama şansı:',
  'Arcane Surge grants more Life Regeneration Rate instead of Mana Regeneration Rate': 'Arcane Surge, Mana Yenilenme Hızı yerine daha fazla Can Yenilenme Hızı verir',
  'Gain Arcane Surge when you Shapeshift to Human form after': 'Şu sonrasında İnsan formuna Shapeshift yaptığında Arcane Surge kazan:',
  'Skills have 10% chance to not remove Charges but still count as consuming them': 'Becerilerin, Şarjları kaldırmama %10 şansı vardır ama yine de onları tüketmiş sayılır',
  'Skills have 10% chance to not remove Elemental Infusions but still count as consuming them': 'Becerilerin, Elemental Infusion\'ları kaldırmama %10 şansı vardır ama yine de onları tüketmiş sayılır',
  'Skills have 5% chance to not remove Elemental Infusions but still count as consuming them': 'Becerilerin, Elemental Infusion\'ları kaldırmama %5 şansı vardır ama yine de onları tüketmiş sayılır',
  'Skills have a 15% chance to not consume Glory': 'Becerilerin Glory tüketmeme %15 şansı vardır',
  'Consuming Glory grants you 3% increased Attack damage per Glory consumed for 6 seconds, up to 60%': 'Glory Tüketmek, tüketilen her Glory için 6 saniye boyunca %3 artan Saldırı hasarı verir (en fazla %60)',
  'Inherent Rage loss starts 1 second later': 'İçsel Öfke kaybı 1 saniye daha geç başlar',
  'Equipment and Skill Gems have 4% reduced Attribute Requirements': 'Ekipman ve Beceri Taşlarının %4 azalan Nitelik Gereksinimi olur',
  '15% increased Magnitude of Poison you inflict': 'Uyguladığın Zehrin %15 artan Şiddeti',
  'Non-Minion Skills have 50% less Reservation Efficiency': 'Uşak-olmayan Becerilerin %50 daha az Rezervasyon Verimi',
  'Every 10 Rage also grants 12% increased Physical Damage': 'Her 10 Öfke ayrıca %12 artan Fiziksel Hasar verir',
  '20% reduced Spirit Reservation Efficiency of Skills': 'Becerilerin %20 azalan Ruh Rezervasyon Verimi'
};

function el(s) { return ELEM[s] || s; }
function skill(s) { return (SKILLGRP[s] || s) + ' Becerileri'; }
// Yüzde formatını Türkçeleştir: "15%" -> "%15", "(15-25)%" -> "%(15-25)". Yan etkisiz/idempotent.
function tr2pct(s) {
  return s.replace(/\(([^)]*?)\)%/g, '%($1)').replace(/(\d+(?:[.,]\d+)?)%/g, '%$1');
}

function translate(en) {
  if (HAND[en]) return HAND[en];
  let m;

  if ((m = en.match(/^Damage Penetrates (\d+%) (Fire|Cold|Lightning|Chaos) Resistance$/)))
    return `Hasar, ${el(m[2])} Direncinin ${m[1]}'ini Deler`;
  if ((m = en.match(/^Damage Penetrates (\d+%) Elemental Resistances$/)))
    return `Hasar, Elemental Dirençlerin ${m[1]}'ini Deler`;
  if ((m = en.match(/^Damage Penetrates (\d+%) (?:of Enemy )?Elemental Resistances while Shapeshifted$/)))
    return `Shapeshift hâlindeyken Hasar, düşman Elemental Dirençlerinin ${m[1]}'ini Deler`;
  if ((m = en.match(/^Damage Penetrates (\d+%) of Enemy Elemental Resistances$/)))
    return `Hasar, düşman Elemental Dirençlerinin ${m[1]}'ini Deler`;
  if ((m = en.match(/^Damage Penetrates (\d+%) Lightning Resistance if on Low Mana$/)))
    return `Düşük Manadaysan Hasar, Yıldırım Direncinin ${m[1]}'ini Deler`;
  if ((m = en.match(/^Damage Penetrates (\d+%) Elemental Resistances for each time you've used a Skill that Requires Glory in the past 6 seconds$/)))
    return `Son 6 saniyede Glory Gerektiren bir Beceri kullandığın her sefer için Hasar, Elemental Dirençlerin ${m[1]}'ini Deler`;
  if ((m = en.match(/^Attack Damage Penetrates (\d+%) of Enemy Elemental Resistances$/)))
    return `Saldırı Hasarı, düşman Elemental Dirençlerinin ${m[1]}'ini Deler`;

  if ((m = en.match(/^(\d+%) (increased|reduced|less|more) (Spirit )?Reservation Efficiency of (\w+) Skills$/))) {
    const dir = { increased: 'artan', reduced: 'azalan', less: 'daha az', more: 'daha fazla' }[m[2]];
    return `${m[4] === 'non-Companion' ? 'Companion-olmayan' : (SKILLGRP[m[4]] || m[4])} Becerilerinin ${m[1]} ${m[3] ? 'Ruh ' : ''}${dir} Rezervasyon Verimi`;
  }
  if ((m = en.match(/^(\d+%) (increased|reduced|less|more) Reservation Efficiency of (non-Companion|Companion|Minion|Herald|Meta) Skills$/))) {
    const dir = { increased: 'artan', reduced: 'azalan', less: 'daha az', more: 'daha fazla' }[m[2]];
    const grp = m[3] === 'non-Companion' ? 'Companion-olmayan' : (SKILLGRP[m[3]] || m[3]);
    return `${grp} Becerilerinin ${m[1]} ${dir} Rezervasyon Verimi`;
  }
  if ((m = en.match(/^(\d+%) (increased|reduced) Reservation Efficiency of (\w+) Skills$/))) {
    const dir = m[2] === 'increased' ? 'artan' : 'azalan';
    return `${SKILLGRP[m[3]] || m[3]} Becerilerinin ${m[1]} ${dir} Rezervasyon Verimi`;
  }
  if ((m = en.match(/^Meta Skills have (\d+%) increased Reservation Efficiency$/)))
    return `Meta Becerilerin ${m[1]} artan Rezervasyon Verimi`;

  if ((m = en.match(/^(\d+%) increased Mana Cost Efficiency$/))) return `${m[1]} artan Mana Maliyeti Verimi`;
  if ((m = en.match(/^(\d+%) increased Mana Cost Efficiency while on Low Mana$/))) return `Düşük Manadayken ${m[1]} artan Mana Maliyeti Verimi`;
  if ((m = en.match(/^(\d+%) increased Mana Cost Efficiency of Command Skills$/))) return `Komut Becerilerinin ${m[1]} artan Mana Maliyeti Verimi`;
  if ((m = en.match(/^(\d+%) increased Mana Cost Efficiency of Marks$/))) return `Mark'ların ${m[1]} artan Mana Maliyeti Verimi`;
  if ((m = en.match(/^(\d+%) increased Cost Efficiency$/))) return `${m[1]} artan Maliyet Verimi`;
  if ((m = en.match(/^(\d+%) increased Cost Efficiency of Attacks$/))) return `Saldırıların ${m[1]} artan Maliyet Verimi`;

  if ((m = en.match(/^(\d+%) (increased|less) Knockback Distance(?: for Blocked Hits)?$/))) {
    const dir = m[2] === 'increased' ? 'artan' : 'daha az';
    return `${en.includes('Blocked Hits') ? 'Bloklanan Vuruşlar için ' : ''}${m[1]} ${dir} Geri Tepme Mesafesi`;
  }
  if ((m = en.match(/^(\d+%) increased Parried Debuff (Magnitude|Duration)$/)))
    return `${m[1]} artan Parry Debuff ${m[2] === 'Magnitude' ? 'Şiddeti' : 'Süresi'}`;
  if ((m = en.match(/^(\d+%) increased speed of Recoup Effects$/))) return `Recoup Etkilerinin ${m[1]} artan hızı`;
  if ((m = en.match(/^(\d+%) increased Glory generation(?: for Banner Skills)?$/)))
    return `${en.includes('Banner') ? 'Banner Becerilerinin ' : ''}${m[1]} artan Glory üretimi`;

  if ((m = en.match(/^(\d+%) increased Damage with Hits against Enemies that are on (Low|Full) Life$/)))
    return `${m[2] === 'Low' ? 'Düşük' : 'Tam'} Candaki Düşmanlara karşı ${m[1]} artan Vuruşlarla Hasar`;
  if ((m = en.match(/^(\d+%) increased (Critical Hit Chance|Critical Damage Bonus|Stun Buildup) against Enemies that are on (Low|Full) Life$/))) {
    const stat = { 'Critical Hit Chance': 'Kritik Vuruş Şansı', 'Critical Damage Bonus': 'Kritik Hasar Bonusu', 'Stun Buildup': 'Sersemletme Birikimi' }[m[2]];
    return `${m[3] === 'Low' ? 'Düşük' : 'Tam'} Candaki Düşmanlara karşı ${m[1]} artan ${stat}`;
  }
  if ((m = en.match(/^Damage with Hits is Lucky against Enemies that are on Low Life$/)))
    return 'Düşük Candaki Düşmanlara karşı Vuruşlarla Hasar Şanslıdır';
  if ((m = en.match(/^(\d+%) increased Critical (Hit Chance|Damage Bonus) against Enemies that (have (entered|exited) your Presence Recently|are affected)$/))) {
    const stat = m[2] === 'Hit Chance' ? 'Kritik Vuruş Şansı' : 'Kritik Hasar Bonusu';
    const cond = m[3].includes('entered') ? 'yakın zamanda Mevcudiyetine giren' : m[3].includes('exited') ? 'yakın zamanda Mevcudiyetinden çıkan' : 'etkilenmiş';
    return `${cond} Düşmanlara karşı ${m[1]} artan ${stat}`;
  }
  if ((m = en.match(/^(\d+%) increased Critical Hit Chance after (\d+) (metres|metres)$/)))
    return `${m[2]} metreden sonra ${m[1]} artan Kritik Vuruş Şansı`;

  if ((m = en.match(/^Every (Rage|five Rage|ten Rage) also grants(?: you)? (\d+%) increased (.+)$/))) {
    const per = m[1] === 'Rage' ? 'Her Öfke' : m[1] === 'five Rage' ? 'Her beş Öfke' : 'Her on Öfke';
    const stat = m[3].replace('Minion Attack Speed', 'Uşak Saldırı Hızı').replace('Minion Damage', 'Uşak Hasarı').replace('Physical Damage', 'Fiziksel Hasar').replace('Fire Damage', 'Ateş Hasarı').replace('Spell Damage', 'Büyü Hasarı').replace('Evasion Rating', 'Kaçınma Derecesi').replace('Stun Threshold', 'Sersemletme Eşiği').replace('Armour', 'Zırh');
    return `${per} ayrıca ${m[2]} artan ${stat} verir`;
  }
  if ((m = en.match(/^(\d+%) increased Magnitude of Poison you inflict on targets that are not Poisoned$/)))
    return `Zehirlenmemiş hedeflere uyguladığın Zehrin ${m[1]} artan Şiddeti`;
  if ((m = en.match(/^Prevent \+(\d+%) of Damage from Deflected (Hits|Critical Hits)$/)))
    return `Sektirilen ${m[2] === 'Critical Hits' ? 'Kritik Vuruşlardan' : 'Vuruşlardan'} gelen Hasarın +${m[1]}'ini engelle`;
  if ((m = en.match(/^Successfully Parrying a (Melee|Projectile) Hit grants (\d+%) increased Damage to your next (Ranged|Melee) Attack$/)))
    return `Bir ${m[1] === 'Melee' ? 'Yakın Dövüş' : 'Mermi'} Vuruşunu başarıyla Parry etmek, bir sonraki ${m[3] === 'Ranged' ? 'Menzilli' : 'Yakın Dövüş'} Saldırına ${m[2]} artan Hasar verir`;
  if ((m = en.match(/^(\d+%) chance for (Flasks|Charms) you use to not consume Charges$/)))
    return `Kullandığın ${m[2] === 'Flasks' ? 'Şişelerin' : 'Tılsımların'} Şarj tüketmeme ${m[1]} şansı`;
  if ((m = en.match(/^(\d+%) increased Spell Damage with Spells that cost Life$/)))
    return `Can harcayan Büyülerle ${m[1]} artan Büyü Hasarı`;
  if ((m = en.match(/^Minions Recoup (\d+%) of Damage taken as Life$/)))
    return `Uşaklar, aldıkları Hasarın ${m[1]}'ini Can olarak Geri Kazanır`;
  if ((m = en.match(/^Recoup (\d+%) of damage taken by your Totems as Life$/)))
    return `Totemlerinin aldığı hasarın ${m[1]}'ini Can olarak Geri Kazan`;
  if ((m = en.match(/^(\d+%) of Damage taken from Deflected Hits Recouped as Life$/)))
    return `Sektirilen Vuruşlardan alınan Hasarın ${m[1]}'i Can olarak Geri Kazanılır`;
  if ((m = en.match(/^(\d+%) increased Attack Speed while not on Low Mana$/)))
    return `Düşük Manada değilken ${m[1]} artan Saldırı Hızı`;
  if ((m = en.match(/^(\d+%) increased Mana Regeneration Rate while not on Low Mana$/)))
    return `Düşük Manada değilken ${m[1]} artan Mana Yenilenme Hızı`;
  if ((m = en.match(/^(\d+%) (faster start of Energy Shield Recharge|increased Stun Buildup against Enemies that are on Low Life)$/))) {
    if (m[2].startsWith('faster')) return `Tam Canda değilken ${m[1]} daha hızlı Enerji Kalkanı Şarjı başlangıcı`;
  }
  if (en === '20% faster start of Energy Shield Recharge when not on Full Life') return 'Tam Canda değilken %20 daha hızlı Enerji Kalkanı Şarjı başlangıcı';
  if ((m = en.match(/^(\d+%) increased Attack Speed if you've successfully Parried Recently$/)))
    return `Yakın zamanda başarıyla Parry yaptıysan ${m[1]} artan Saldırı Hızı`;
  if ((m = en.match(/^(\d+%) increased Movement Speed if you've successfully Parried Recently$/)))
    return `Yakın zamanda başarıyla Parry yaptıysan ${m[1]} artan Hareket Hızı`;
  if ((m = en.match(/^(Deflected Hits) cannot inflict (Maim|Bleeding) on you$/)))
    return `Sektirilen Vuruşlar üzerine ${m[2] === 'Maim' ? 'Maim' : 'Kanama'} uygulayamaz`;
  if ((m = en.match(/^Skills gain 1 Glory every 2 seconds for each Rare or Unique monster in your Presence$/)))
    return 'Mevcudiyetindeki her Nadir veya Eşsiz yaratık için Beceriler 2 saniyede 1 Glory kazanır';
  if ((m = en.match(/^(\d+%) chance to Poison on Hit against Enemies that are not Poisoned$/)))
    return `Zehirlenmemiş Düşmanlara karşı Vuruşta Zehirleme ${m[1]} şansı`;

  return en; // çözülemezse İngilizce kalır (sayıyı raporlarız)
}

// Self-contained: kuralı olan (translate(en) !== en) TÜM benzersiz stat satırını yaz.
// Bu set, karışık kalan satırlarla örtüşür; kuralsız (kompozisyonelin doğru çevirdiği)
// satırlar es geçilir.
const seen = new Set();
const final = {};
let done = 0;
for (const r of d) {
  if (!r.stats_en) continue;
  for (const en of r.stats_en) {
    if (!en || seen.has(en)) continue;
    seen.add(en);
    const tr = translate(en);
    if (tr && tr !== en) { final[en] = tr2pct(tr); done++; }
  }
}
const header = { _comment: 'Passives stat satiri ELLE TAM-CUMLE cevirileri (Opus, cumle-seviyesi). Anahtar: tam stat_en. Build yalniz okur, rebuild EZMEZ. Elle duzenlenebilir.' };
fs.writeFileSync(path.join(__dirname, 'passives-stats.tr.json'), JSON.stringify({ ...header, ...final }, null, 1) + '\n', 'utf8');
console.log('yazılan stat satırı (kuralı olan):', done);
