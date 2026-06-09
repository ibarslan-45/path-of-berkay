/* Currency açıklama ELLE TAM-CÜMLE çevirisi üretici (tek seferlik authoring aracı).
 * Opus tarafından CÜMLE-SEVİYESİ (kelime-kelime DEĞİL) doğal TR kuralları.
 * Çıktı: currency-desc.tr.json (desc_en -> doğal TR). build:currency yalnız OKUR.
 * Terim sözlüğü proje talimatları: Damage=Hasar, Resistance=Direnç, Armour=Zırh,
 * Energy Shield=Enerji Kalkanı, Life=Can, Mana=Mana, Spirit=Ruh, Chaos=Kaos,
 * Amulet=Kolye, Charm=Tılsım. Currency/özel adlar (Orb, Exalted, Resonator...) EN.
 */
const fs = require('fs');
const path = require('path');
const cur = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'currency.json'), 'utf8'));
// Yüzde formatını Türkçeleştir: "15%" -> "%15", "(15-25)%" -> "%(15-25)". İdempotent.
function tr2pct(s) {
  return s.replace(/\(([^)]*?)\)%/g, '%($1)').replace(/(\d+(?:[.,]\d+)?)%/g, '%$1');
}

// --- ekipman yuvası adları ---
const SLOT = {
  'Body Armour': 'Gövde Zırhı', 'Helmet': 'Miğfer', 'Boots': 'Bot', 'Gloves': 'Eldiven',
  'Shield': 'Kalkan', 'Weapon': 'Silah', 'Martial Weapon': 'Savaş Silahı',
  'Caster Weapon': 'Büyücü Silahı', 'Ranged Weapon': 'Menzilli Silah', 'Bow': 'Yay',
  'Crossbow': 'Arbalet', 'Spear': 'Mızrak', 'Mace': 'Topuz', 'One Hand Mace': 'Tek El Topuz',
  'Two Hand Mace': 'Çift El Topuz', 'Equipment': 'Ekipman', 'Armour': 'Zırh',
  // term-vari (EN bırak): Wand, Staff, Sceptre, Quarterstaff, Buckler, Focus, Talisman
  'Wand': 'Wand', 'Staff': 'Staff', 'Sceptre': 'Sceptre', 'Quarterstaff': 'Quarterstaff',
  'Buckler': 'Buckler', 'Focus': 'Focus', 'Talisman': 'Talisman'
};
// "in a Helmet" / "in a pair of Boots" / "in a Shield, a Buckler or a Sceptre" -> TR
function slotPhrase(s) {
  let t = s.replace(/\bany\b/gi, 'herhangi bir');
  t = t.replace(/(?:a )?pair of /gi, 'bir çift ');
  // çok kelimeli yuvaları önce çevir
  for (const k of Object.keys(SLOT).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp('\\b' + k + '\\b', 'g'), SLOT[k]);
  }
  t = t.replace(/\bor\b/gi, 'veya').replace(/\band\b/gi, 'veya');
  t = t.replace(/\ba \b/gi, '').replace(/\ban \b/gi, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

// --- stat cümlecik çevirisi (idol/rune "Slot: etki" satırları) ---
function statClause(s) {
  let t = ' ' + s + ' ';
  const R = [
    // --- "of X" stat bağlamı (idol "of" leftover'ı) ---
    [/Level of all (\w+) Skills/gi, 'tüm $1 Becerilerinin Seviyesi'], [/to Level of all/gi, 'Seviyesine'],
    [/(\d+%) of maximum Life/gi, 'azami Canın $1’i'], [/(\d+%) of maximum Energy Shield/gi, 'azami Enerji Kalkanının $1’i'],
    [/(\d+%) of maximum Mana/gi, 'azami Mananın $1’i'], [/(\d+%) of maximum Runic Ward/gi, 'azami Runic Ward’un $1’i'],
    [/(\d+%) of (?:this Weapon's )?maximum damage/gi, 'azami hasarın $1’i'], [/(\d+%) of Physical Damage/gi, 'Fiziksel Hasarın $1’i'],
    [/(\d+%) of Evasion Rating/gi, 'Kaçınma Derecesinin $1’i'], [/(\d+%) of total Strength Requirements/gi, 'toplam Güç Gereksiniminin $1’i'],
    [/(\d+%) of Damage/gi, 'Hasarın $1’i'], [/of Life Lost from Hits in the past (\d+) seconds/gi, 'son $1 saniyede Vuruşlardan kaybedilen Canın'],
    [/of Life Lost/gi, 'kaybedilen Canın'], [/of Armour also applies to Chaos Damage/gi, 'oranında Zırh, Kaos Hasarına da uygulanır'],
    [/of Requirements to/gi, 'oranında Gereksinimi şuna dönüştür:'],
    // --- "+N to X" / "per N X" / "up to a maximum" (idol önce) ---
    [/\+(\d+) to maximum Life/gi, 'azami Cana +$1'], [/\+(\d+) to maximum Mana/gi, 'azami Mana’ya +$1'],
    [/\+(\d+) to maximum Energy Shield/gi, 'azami Enerji Kalkanına +$1'], [/\+(\d+) to maximum Runic Ward/gi, 'azami Runic Ward’a +$1'],
    [/\+(\d+) to Stun Threshold/gi, 'Sersemletme Eşiğine +$1'], [/\+(\d+) to Accuracy Rating/gi, 'İsabet Derecesine +$1'],
    [/\+(\d+) to Deflection Rating/gi, 'Sektirme Derecesine +$1'], [/\+(\d+%) to all Elemental Resistances/gi, 'tüm Elemental Dirençlere +$1'],
    [/\+(\d+%) to Fire Resistance/gi, 'Ateş Direncine +$1'], [/\+(\d+%) to Cold Resistance/gi, 'Soğuk Direncine +$1'],
    [/\+(\d+%) to Lightning Resistance/gi, 'Yıldırım Direncine +$1'], [/\+(\d+%) to Chaos Resistance/gi, 'Kaos Direncine +$1'],
    [/\+(\d+) to (Armour|Evasion|Spirit|Strength|Dexterity|Intelligence)\b/gi, (m, n, w) => (SLOT[w] || { Spirit: 'Ruh', Strength: 'Güç', Dexterity: 'Çeviklik', Intelligence: 'Zekâ' }[w] || w) + '’e +' + n],
    [/\+(\d+) to Level of all Spell Skills/gi, 'tüm Büyü Becerilerinin Seviyesine +$1'],
    [/\+(\d+) to Stun Threshold per 10 maximum Runic Ward/gi, 'her 10 azami Runic Ward için Sersemletme Eşiğine +$1'],
    [/\+(\d+) to Deflection Rating per 10 maximum Runic Ward/gi, 'her 10 azami Runic Ward için Sektirme Derecesine +$1'],
    [/per (\d+) maximum Runic Ward/gi, 'her $1 azami Runic Ward için'],
    [/Spell damage Penetrates (\d+%) of enemy Elemental Resistances/gi, 'Büyü hasarı düşman Elemental Dirençlerinin $1’ini Deler'],
    [/Penetrates (\d+%) of enemy Elemental Resistances/gi, 'düşman Elemental Dirençlerinin $1’ini Deler'],
    [/up to a maximum of (\d+%)/gi, 'en fazla $1’e kadar'],
    [/per (\d+) (Spirit|Strength|Idol|Persistent Minion|Item Energy Shield|Armour|Rune Socketed in Equipped Items)/gi, (m, n, w) => 'her ' + n + ' ' + ({ Spirit: 'Ruh', Strength: 'Güç', Idol: 'Idol', 'Persistent Minion': 'Kalıcı Uşak', 'Item Energy Shield': 'Eşya Enerji Kalkanı', Armour: 'Zırh' }[w] || w) + ' için'],
    [/per Idol socketed in your Equipment/gi, 'Ekipmanında soketli her Idol için'],
    [/Other Modifiers to Movement Speed except for Sprinting do not apply/gi, 'Sprint dışında Hareket Hızına dair diğer özellikler uygulanmaz'],
    [/Remove a Damaging Ailment when you use a Command Skill/gi, 'Bir Komut Becerisi kullandığında bir Hasar Veren Rahatsızlığı kaldır'],
    [/Recover (\d+%) of maximum Life over (\d+) Seconds when you use a Command Skill/gi, 'Bir Komut Becerisi kullandığında $2 saniyede azami Canının $1’ini Yenile'],
    [/Recover (\d+%) of maximum Life for each Endurance Charge consumed/gi, 'Tüketilen her Dayanıklılık Şarjı için azami Canının $1’ini Yenile'],
    [/Causes (\d+%) increased Stun Buildup/gi, '$1 artan Sersemletme Birikimine sebep olur'],
    [/Causes Bleeding on Hit/gi, 'Vuruşta Kanama’ya sebep olur'],
    // sık idol/rune öbekleri
    [/Prevent \+(\d+%) of (?:Hasarın \d+’i|Damage) from Deflected Hits if you've Deflected no Hits Recently/gi, 'Yakın zamanda hiç Vuruş Sektirmediysen, Sektirilen Vuruşlardan gelen Hasarın +$1’ini önle'],
    [/Prevent \+(\d+%) of (?:Hasarın \d+’i|Damage) from Deflected Hits/gi, 'Sektirilen Vuruşlardan gelen Hasarın +$1’ini önle'],
    [/if you've been Stunned Recently/gi, 'yakın zamanda Sersemletildiysen'],
    [/if you've Deflected no Hits Recently/gi, 'yakın zamanda hiç Vuruş Sektirmediysen'],
    [/if you've Blocked with a raised Shield Recently/gi, 'yakın zamanda kalkık bir Kalkanla Blokladıysan'],
    [/if you haven't Dodge Rolled Recently/gi, 'yakın zamanda Dodge Roll yapmadıysan'],
    [/if you've Dodge Rolled Recently/gi, 'yakın zamanda Dodge Roll yaptıysan'],
    [/if you've Killed Recently/gi, 'yakın zamanda Öldürdüysen'],
    [/Your speed is Unaffected by Slows while Sprinting/gi, 'Sprint yaparken Hızın Yavaşlatmalardan etkilenmez'],
    [/Enemies you Critically Hit get (\d+%) reduced Life Regeneration Rate for (\d+) seconds/gi, 'Kritik Vurduğun düşmanların Can Yenilenme Hızı $2 saniye boyunca $1 azalır'],
    [/Enemies have no Critical Damage Bonus for (\d+) seconds after you Blind them/gi, 'Onları Kör ettikten sonra $1 saniye boyunca düşmanların Kritik Hasar Bonusu olmaz'],
    [/Enemies which are on Full Life cannot Evade your Hits/gi, 'Tam Candaki düşmanlar Vuruşlarından kaçamaz'],
    [/Enemies that are on Full Life cannot Evade your Hits/gi, 'Tam Candaki düşmanlar Vuruşlarından kaçamaz'],
    [/Targets that are Blinded, Maimed, and Bleeding cannot Evade your Hits/gi, 'Kör, Sakat ve Kanayan hedefler Vuruşlarından kaçamaz'],
    [/When you stop Sprinting, gain Guard equal to (\d+%) of maximum Life per second spent Sprinting/gi, 'Sprint yapmayı bıraktığında, Sprint yaparak geçirilen her saniye için azami Canının $1’i kadar Guard kazan'],
    [/taken as a Damage of a random Element/gi, 'rastgele bir Elementin Hasarı olarak alınır'],
    [/taken as a Hasar of a random Element/gi, 'rastgele bir Elementin Hasarı olarak alınır'],
    [/Hits against you have no Critical Damage Bonus while on Consecrated Ground/gi, 'Kutsanmış Zeminde sana yapılan Vuruşların Kritik Hasar Bonusu olmaz'],
    [/Gain (\d+) Endurance Charge on reaching Low Life, only once every (\d+) seconds/gi, 'Düşük Cana ulaşınca $1 Dayanıklılık Şarjı kazan; her $2 saniyede yalnızca bir kez'],
    [/Sacrifice (\d+%) of maximum Life to gain that much Guard when you Dodge Roll/gi, 'Dodge Roll yaptığında, azami Canının $1’ini feda ederek o kadar Guard kazan'],
    [/Recoup (\d+%) of Damage taken by your Offerings as Life/gi, 'Offering’lerinin aldığı Hasarın $1’ini Can olarak Geri Kazan'],
    [/Thorns Damage is Lucky against targets with Fully Broken Armour/gi, 'Diken Hasarı, Zırhı Tamamen Kırılmış hedeflere karşı Şanslıdır'],
    [/Spell Damage Penetrates/gi, 'Büyü Hasarı Penetre eder:'],
    [/Minions take (\d+%) of Physical Damage as Lightning Damage/gi, 'Uşaklar Fiziksel Hasarın $1’ini Yıldırım Hasarı olarak alır'],
    [/Minions gain (\d+%) of their Physical Damage as Extra Lightning Damage/gi, 'Uşaklar Fiziksel Hasarlarının $1’ini Ekstra Yıldırım Hasarı olarak kazanır'],
    [/Minions in your Presence have Onslaught while you are on Low Runic Ward/gi, 'Düşük Runic Ward’dayken Mevcudiyetindeki Uşaklarda Onslaught olur'],
    [/(\d+%) reduced effect of Shock on you/gi, 'üzerindeki Shock etkisi $1 azalır'],
    [/effect of Socketed Runes/gi, 'Soketli Rünlerin etkisi'],
    [/effect of Arcane Surge on you/gi, 'üzerindeki Arcane Surge etkisi'],
    [/Increases and Reductions to ([^]+?) also apply to ([^]+?)(?=\s*$|\s*\/)/gi, '$1 Artış ve Azalışları $2’e de uygulanır'],
    [/Attacks with this Weapon have (\d+%) chance to inflict Exposure/gi, 'bu Silahla yapılan Saldırıların $1 Exposure uygulama şansı vardır'],
    [/Attacks with this weapon have Added Cold Damage equal to (\d+%) to (\d+%) of maximum Mana/gi, 'bu silahla yapılan Saldırılar, azami Mananın $1 ila $2’i kadar eklenmiş Soğuk Hasarına sahiptir'],
    [/Curse Enemies with Enfeeble on Block/gi, 'Blokta düşmanları Enfeeble ile Lanetle'],
    [/Hits with this weapon have (\d+) to (\d+) Added Physical Damage per (\d+%) Block Chance/gi, 'bu silahla yapılan Vuruşlar, her $3 Blok Şansı için $1 ila $2 eklenmiş Fiziksel Hasara sahiptir'],
    [/(\d+%) of Damage taken from Hits bypasses Energy Shield if Energy Shield is below half/gi, 'Enerji Kalkanı yarının altındaysa, Vuruşlardan alınan Hasarın $1’i Enerji Kalkanını atlar'],
    [/(\d+%) of Damage from Hits is taken from your Damageable Companion's Life before you/gi, 'Vuruşlardan gelen Hasarın $1’i, senden önce Hasar Alabilen Yoldaşının Canından alınır'],
    [/while on full Energy Shield/gi, 'Enerji Kalkanın tamken'],
    [/while on Full Energy Shield/gi, 'Enerji Kalkanın tamken'],
    [/(\d+%) increased Elemental Damage with Attacks/gi, 'Saldırılarla $1 artan Elemental Hasar'],
    [/(\d+%) chance to Poison on Hit with this weapon/gi, 'bu silahla Vuruşta $1 Zehirleme şansı'],
    [/Attacks spend (\d+%) of your maximum Runic Ward if possible to gain that much added Physical damage/gi, 'Saldırılar, mümkünse azami Runic Ward’unun $1’ini harcayarak o kadar eklenmiş Fiziksel hasar kazanır'],
    [/Gain maximum Runic Ward equal to (\d+%) of this Weapon's maximum damage/gi, 'Bu Silahın azami hasarının $1’i kadar azami Runic Ward kazan'],
    [/(\d+) Guard for ([\d.]+) seconds per Combo expended when using Skills/gi, 'Beceri kullanırken harcanan her Combo için $2 saniye boyunca $1 Guard'],
    [/Recover maximum Runic Ward'un (\d+%)’i when one of your Reviving Minions is Killed/gi, 'Diriltici Uşaklarından biri Öldürüldüğünde azami Runic Ward’unun $1’ini Yenile'],
    [/spent Sprinting/gi, 'Sprint yaparak geçirilen'],
    [/increased/gi, 'artan'], [/reduced/gi, 'azalan'], [/\bmore\b/gi, 'daha fazla'],
    [/\bless\b/gi, 'daha az'], [/\bfewer\b/gi, 'daha az'], [/maximum/gi, 'azami'],
    [/minimum/gi, 'asgari'], [/Movement Speed/gi, 'Hareket Hızı'], [/Attack Speed/gi, 'Saldırı Hızı'],
    [/Cast Speed/gi, 'Büyü Hızı'], [/Skill Speed/gi, 'Beceri Hızı'], [/Spell Damage/gi, 'Büyü Hasarı'],
    [/Physical Damage/gi, 'Fiziksel Hasar'], [/Fire Damage/gi, 'Ateş Hasarı'],
    [/Cold Damage/gi, 'Soğuk Hasarı'], [/Lightning Damage/gi, 'Yıldırım Hasarı'],
    [/Chaos Damage/gi, 'Kaos Hasarı'], [/Elemental Damage/gi, 'Elemental Hasar'],
    [/Fire Resistance/gi, 'Ateş Direnci'], [/Cold Resistance/gi, 'Soğuk Direnci'],
    [/Lightning Resistance/gi, 'Yıldırım Direnci'], [/Chaos Resistance/gi, 'Kaos Direnci'],
    [/all Elemental Resistances/gi, 'tüm Elemental Dirençler'], [/Elemental Resistances/gi, 'Elemental Dirençler'],
    [/Energy Shield Recharge Rate/gi, 'Enerji Kalkanı Şarj Hızı'], [/Energy Shield Recharge/gi, 'Enerji Kalkanı Şarjı'],
    [/maximum Energy Shield/gi, 'azami Enerji Kalkanı'], [/Energy Shield/gi, 'Enerji Kalkanı'],
    [/Mana Regeneration Rate/gi, 'Mana Yenilenme Hızı'], [/Life Regeneration Rate/gi, 'Can Yenilenme Hızı'],
    [/Mana Cost Efficiency/gi, 'Mana Maliyeti Verimi'], [/Life Cost Efficiency/gi, 'Can Maliyeti Verimi'],
    [/maximum Life/gi, 'azami Can'], [/maximum Mana/gi, 'azami Mana'], [/maximum Runic Ward/gi, 'azami Runic Ward'],
    [/Runic Ward Regeneration Rate/gi, 'Runic Ward Yenilenme Hızı'], [/Runic Ward/gi, 'Runic Ward'],
    [/Stun Threshold/gi, 'Sersemletme Eşiği'], [/Stun Buildup/gi, 'Sersemletme Birikimi'],
    [/Accuracy Rating/gi, 'İsabet Derecesi'], [/Deflection Rating/gi, 'Sektirme Derecesi'],
    [/Evasion Rating/gi, 'Kaçınma Derecesi'], [/Critical Hit Chance/gi, 'Kritik Vuruş Şansı'],
    [/Critical Damage Bonus/gi, 'Kritik Hasar Bonusu'], [/Block chance/gi, 'Blok şansı'],
    [/Block Chance/gi, 'Blok Şansı'], [/Physical Thorns damage/gi, 'Fiziksel Diken hasarı'],
    [/Lightning Thorns damage/gi, 'Yıldırım Diken hasarı'], [/Thorns Damage/gi, 'Diken Hasarı'],
    [/Spell Skills/gi, 'Büyü Becerileri'], [/Command Skill/gi, 'Komut Becerisi'],
    [/Endurance Charge/gi, 'Dayanıklılık Şarjı'], [/from Flasks/gi, 'Şişelerden'],
    [/per enemy killed/gi, 'öldürülen düşman başına'], [/per second/gi, 'saniyede'],
    [/Leeches/gi, 'emer'], [/Leech/gi, 'emer'], [/Regenerate/gi, 'Yenile'],
    [/Adds (\d[^]*?) to (\d[^]*?) ((?:Fire|Cold|Lightning|Physical|Chaos) (?:Damage|Hasarı))/gi, '$3 olarak $1 ila $2 ekler'],
    [/Gain (\d+%) of Damage as Extra ([^]*?)$/gi, 'Hasarın $1’ini Ekstra $2 olarak kazan'],
    [/Convert (\d+%) of Requirements to (Strength|Dexterity|Intelligence)/gi, 'Gereksinimlerin $1’ini $2’e dönüştür'],
    [/Gain (\d+) Mana per/gi, '$1 Mana kazan'], [/Gain (\d+) Life per/gi, '$1 Can kazan'],
    [/while on Low Life/gi, 'Düşük Canda iken'], [/while on Low Runic Ward/gi, 'Düşük Runic Ward’dayken'],
    [/while Sprinting/gi, 'Sprint yaparken'], [/when on Low Life/gi, 'Düşük Canda iken'],
    [/Strength/g, 'Güç'], [/Dexterity/g, 'Çeviklik'], [/Intelligence/g, 'Zekâ'],
    [/Spirit/g, 'Ruh'], [/Armour, Evasion and Energy Shield/gi, 'Zırh, Kaçınma ve Enerji Kalkanı'],
    [/Armour and Evasion/gi, 'Zırh ve Kaçınma'], [/\bArmour\b/g, 'Zırh'], [/\bEvasion\b/g, 'Kaçınma'],
    [/Physical Damage as Mana/gi, 'Fiziksel Hasarın'], [/Physical Damage as Life/gi, 'Fiziksel Hasarın'],
    [/as Mana/gi, 'kadarını Mana olarak'], [/as Life/gi, 'kadarını Can olarak'],
    [/\bDamage\b/g, 'Hasar'], [/\bLife\b/g, 'Can'], [/\bMana\b/g, 'Mana'], [/\bResistance\b/g, 'Direnç'],
    [/\bAttacks\b/g, 'Saldırılar'], [/\bAttack\b/g, 'Saldırı'], [/with this weapon/gi, 'bu silahla'],
    [/with this Weapon/gi, 'bu Silahla'], [/chance to Poison on Hit/gi, 'Vuruşta Zehirleme şansı'],
    [/Causes/gi, 'Sebep olur'], [/increased/gi, 'artan']
  ];
  for (const [re, rep] of R) t = t.replace(re, rep);
  return t.trim();
}
// "Slot: stat ⏎ Slot: stat" bloğu
function idolBlock(en) {
  return en.split('\n').map((line) => {
    const ix = line.indexOf(': ');
    if (ix < 0) return statClause(line);
    const slot = line.slice(0, ix);
    const rest = line.slice(ix + 2);
    const slotTr = SLOT[slot] ?? slotPhrase(slot);
    return slotTr + ': ' + rest.split(' / ').map(statClause).join(' / ');
  }).join('\n');
}

// --- resonator stat etiketi ("More Chaos" / "No Lightning" / "Fewer Attack") ---
const FOSSIL = {
  Chaos: 'Kaos', Lightning: 'Yıldırım', Fire: 'Ateş', Cold: 'Soğuk', Physical: 'Fiziksel',
  Caster: 'Büyücü', Attack: 'Saldırı', Critical: 'Kritik', Attribute: 'Nitelik', Defence: 'Savunma',
  Life: 'Can', Mana: 'Mana', Speed: 'Hız', Elemental: 'Elemental', Minion: 'Uşak', Aura: 'Aura', Curse: 'Lanet'
};
function fossilTag(s) {
  // "More Chaos modifiers" -> "daha çok Kaos özelliği", "No Lightning modifiers" -> "Yıldırım özelliği vermez"
  s = s.replace(/More ([\w ,]+?) modifiers/g, (m, g) => 'daha çok ' + fossilWords(g) + ' özelliği');
  s = s.replace(/Fewer ([\w ,]+?) modifiers/g, (m, g) => 'daha az ' + fossilWords(g) + ' özelliği');
  s = s.replace(/No ([\w ,]+?) [Mm]odifiers/g, (m, g) => fossilWords(g) + ' özelliği vermez');
  s = s.replace(/Corrupted Has a Corrupted implicit modifier/gi, 'Bozulmuş; Bozulmuş bir implicit özelliği vardır');
  s = s.replace(/Has a Corrupt Essence modifier/gi, 'Bir Corrupt Essence özelliği vardır');
  s = s.replace(/Has an Abyssal socket/gi, 'Bir Abyssal yuvası vardır');
  s = s.replace(/Makes a random modifier type much more likely and prevents another random modifier type\. Effects revealed once resonator is fully socketed\./gi, 'Rastgele bir özellik türünü çok daha olası kılar ve başka rastgele bir özellik türünü engeller. Etkiler, resonator tamamen soketlendiğinde açığa çıkar.');
  s = s.replace(/Creates a split copy\. Cannot be used to split Influenced, Enchanted, Fractured, or Synthesised items\./gi, 'Bölünmüş bir kopya oluşturur. Influenced, Enchanted, Fractured veya Synthesised eşyaları bölmek için kullanılamaz.');
  s = s.replace(/Numeric modifier values are lucky High Level modifiers are more common/gi, 'Sayısal özellik değerleri şanslıdır; Yüksek Seviyeli özellikler daha yaygındır');
  return s;
}
function fossilWords(g) {
  return g.split(/,| or | and /).map((w) => FOSSIL[w.trim()] ?? w.trim()).join('/').replace('Physical Ailment', 'Fiziksel Rahatsızlık').replace('Chaos Ailment', 'Kaos Rahatsızlık');
}

// Karmaşık idol/rune stat blokları — ELLE tam-cümle (desc_en birebir anahtar).
const IDOL_HAND = {
  "Body Armour: Prevent +5% of Damage from Deflected Hits if you've Deflected no Hits Recently\nBoots: Gain Onslaught for 4 seconds when your Marks Activate\nHelmet: Enemies which are on Full Life cannot Evade your Hits":
    "Gövde Zırhı: Yakın zamanda hiç Vuruş Sektirmediysen, Sektirilen Vuruşlardan gelen Hasarın +%5'ini engelle\nBot: Mark'ların Etkinleştiğinde 4 saniye boyunca Onslaught kazan\nMiğfer: Tam Candaki düşmanlar Vuruşlarından kaçamaz",
  "Body Armour: +3 to Spirit per Idol socketed in your Equipment\nBoots: 1% increased Movement Speed while Sprinting per Persistent Minion\nGloves: Companions gain Onslaught for 4 seconds on Hitting your Marked targets":
    "Gövde Zırhı: Ekipmanında soketli her Idol için Ruh'a +3\nBot: Sprint yaparken, her Kalıcı Uşak için %1 artan Hareket Hızı\nEldiven: Mark'lanmış hedeflerine Vurduğunda Companion'lar 4 saniye boyunca Onslaught kazanır",
  "Body Armour: You Recoup 50% of Damage taken by your Offerings as Life\nBoots: Sacrifice 10% of maximum Life to gain that much Guard when you Dodge Roll\nGloves: One of your Persistent Minions revives when an Offering expires":
    "Gövde Zırhı: Offering'lerinin aldığı Hasarın %50'sini Can olarak Geri Kazanırsın\nBot: Dodge Roll yaptığında, azami Canının %10'unu feda ederek o kadar Guard kazan\nEldiven: Bir Offering sona erdiğinde Kalıcı Uşaklarından biri dirilir",
  "Body Armour: Thorns Damage is Lucky against targets with Fully Broken Armour\nGloves: Regenerate 5% of maximum Life per Second if you have used a Command Skill Recently\nHelmet: Targets that are Blinded, Maimed, and Bleeding cannot Evade your Hits":
    "Gövde Zırhı: Diken Hasarı, Zırhı Tamamen Kırılmış hedeflere karşı Şanslıdır\nEldiven: Yakın zamanda bir Komut Becerisi kullandıysan, saniyede azami Canının %5'ini Yenile\nMiğfer: Kör, Sakat ve Kanayan hedefler Vuruşlarından kaçamaz",
  "Body Armour: 15% of Chaos Damage from Hits taken as a Damage of a random Element\nBoots: 50% increased Runic Ward Regeneration Rate while Sprinting\nGloves: Gain 1% of Damage as Extra Damage of a random Element per Rune Socketed in Equipped Items":
    "Gövde Zırhı: Vuruşlardan gelen Kaos Hasarının %15'i, rastgele bir Elementin Hasarı olarak alınır\nBot: Sprint yaparken %50 artan Runic Ward Yenilenme Hızı\nEldiven: Kuşanılan Eşyalarda Soketli her Rune için, Hasarın %1'ini rastgele bir Elementin Ekstra Hasarı olarak kazan",
  "Boots: When you stop Sprinting, gain Guard equal to 4% of maximum Life per second spent Sprinting, up to a maximum of 20%, for 4 seconds\nGloves: Banners also grant 2% of Life Regenerated per second to affected targets\nHelmet: Gain 1 Endurance Charge on reaching Low Life, only once every 2 seconds":
    "Bot: Sprint yapmayı bıraktığında, Sprint yaparak geçirilen her saniye için azami Canının %4'ü kadar (en fazla %20'ye kadar) Guard'ı 4 saniye boyunca kazan\nEldiven: Banner'lar ayrıca etkilenen hedeflere saniyede %2 Can Yenilenmesi sağlar\nMiğfer: Düşük Cana ulaşınca 1 Dayanıklılık Şarjı kazan; her 2 saniyede yalnızca bir kez",
  "Body Armour: Gain Maximum Energy Shield equal to 50% of total Strength Requirements of Equipped Armour Items\nBoots: Hits against you have no Critical Damage Bonus while on Consecrated Ground\nHelmet: +1 to maximum Life per 8 Armour on Equipped Helmet":
    "Gövde Zırhı: Kuşanılan Zırh Eşyalarının toplam Güç Gereksiniminin %50'si kadar Azami Enerji Kalkanı kazan\nBot: Kutsanmış Zeminde sana yapılan Vuruşların Kritik Hasar Bonusu olmaz\nMiğfer: Kuşanılan Miğferdeki her 8 Zırh için azami Cana +1",
  "Boots: Increases and Reductions to Movement Speed also apply to Energy Shield Recharge Rate\nGloves: Energy Shield Recharge starts after spending a total of 2000 Mana, no more than once every 2 seconds\nHelmet: +1 to maximum Mana per 2 Item Energy Shield on Equipped Helmet":
    "Bot: Hareket Hızına yapılan Artış ve Azalışlar, Enerji Kalkanı Şarj Hızına da uygulanır\nEldiven: Enerji Kalkanı Şarjı, toplam 2000 Mana harcandıktan sonra başlar; her 2 saniyede en fazla bir kez\nMiğfer: Kuşanılan Miğferdeki her 2 Eşya Enerji Kalkanı için azami Mana'ya +1",
  "Gloves: +1 to Armour per Strength": "Eldiven: her Güç için Zırha +1",
  "Helmet: 5% of Damage from Hits is taken from your Damageable Companion's Life before you / 100% increased Global Evasion Rating when on Low Life":
    "Miğfer: Vuruşlardan gelen Hasarın %5'i, senden önce Hasar Alabilen Companion'ının Canından alınır / Düşük Canda iken %100 artan Global Kaçınma Derecesi",
  "Body Armour: 25% of Damage taken from Hits bypasses Energy Shield if Energy Shield is below half":
    "Gövde Zırhı: Enerji Kalkanı yarının altındaysa, Vuruşlardan alınan Hasarın %25'i Enerji Kalkanını atlar",
  "Body Armour: +75% of Armour also applies to Chaos Damage while on full Energy Shield\nGloves: Your Energy Shield Recharge starts when your Minions are Reformed\nHelmet: A random Skill that requires Glory generates 50% of its maximum Glory when your Marks Activate":
    "Gövde Zırhı: Enerji Kalkanın tamken, Zırhının +%75'i Kaos Hasarına da uygulanır\nEldiven: Uşakların Yeniden Oluştuğunda Enerji Kalkanı Şarjın başlar\nMiğfer: Mark'ların Etkinleştiğinde, Glory gerektiren rastgele bir Beceri azami Glory'sinin %50'sini üretir",
  "Body Armour: Prevent +3% of Damage from Deflected Hits\nGloves: Critical Hit chance is Lucky against Parried enemies\nHelmet: +1 to Accuracy Rating per 1 Item Evasion Rating on Equipped Helmet":
    "Gövde Zırhı: Sektirilen Vuruşlardan gelen Hasarın +%3'ünü engelle\nEldiven: Kritik Vuruş şansı, Parry edilmiş düşmanlara karşı Şanslıdır\nMiğfer: Kuşanılan Miğferdeki her 1 Eşya Kaçınma Derecesi için İsabet Derecesine +1",
  "Sceptre: Recover 3% of maximum Runic Ward when one of your Reviving Minions is Killed":
    "Sceptre: Diriltici Uşaklarından biri Öldürüldüğünde azami Runic Ward'unun %3'ünü Yenile"
};

// ================= ANA ÇEVİRİ =================
function translate(en) {
  const e = en.trim();
  if (IDOL_HAND[e]) return IDOL_HAND[e];

  // 1) AUGMENT SOCKET
  let m = e.match(/^Place into an empty Augment Socket in (.+?) to apply its effect to that item\. Once socketed it cannot be retrieved (but can be replaced by other Augment items|or replaced)\.$/);
  if (m) {
    const tail = m[2].startsWith('but')
      ? 'Soketlendikten sonra geri alınamaz, ancak başka Geliştirme eşyalarıyla değiştirilebilir.'
      : 'Soketlendikten sonra geri alınamaz veya değiştirilemez.';
    return `Etkisini o eşyaya uygulamak için ${slotPhrase(m[1])} üzerindeki boş bir Geliştirme Yuvasına yerleştir. ${tail}`;
  }
  m = e.match(/^Place into an Augment Socket containing any tiered Rune to upgrade that Rune\.$/);
  if (m) return 'O Rune’u yükseltmek için, kademeli herhangi bir Rune içeren bir Geliştirme Yuvasına yerleştir.';
  m = e.match(/^Place into an empty Augment Socket in a Rare Weapon to apply its effect to that item\. Transforms modifiers upon socketing, further added modifiers will not be transformed\. Once socketed it cannot be retrieved or replaced\.$/);
  if (m) return 'Etkisini o eşyaya uygulamak için bir Nadir Silahın boş bir Geliştirme Yuvasına yerleştir. Soketlerken özellikleri dönüştürür; sonradan eklenen özellikler dönüştürülmez. Soketlendikten sonra geri alınamaz veya değiştirilemez.';
  m = e.match(/^Place into an empty Augment Socket in any non-Corrupted Kalguuran or Ezomyte Unique to destroy that Unique and create a new Rune\.$/);
  if (m) return 'O Eşsizi yok edip yeni bir Rune oluşturmak için, Bozulmamış herhangi bir Kalguuran veya Ezomyte Eşsizinin boş bir Geliştirme Yuvasına yerleştir.';

  // 2) RESONATOR / FOSSIL
  m = e.match(/^(.+?)\nPlace in a Resonator to influence item crafting\.$/s);
  if (m) return `${fossilTag(m[1].replace(/\n/g, ' ').trim())}.\nEşya üretimini etkilemek için bir Resonator içine yerleştir.`;

  // 3) OMEN: While active ... your next X
  m = e.match(/^While this item is active in your inventory (.+?)\nRight click this item in your inventory to set it to be active\. This item is consumed when triggered\.( Only one Omen can be triggered from combat in each instance\.)?$/s);
  if (m) {
    const tail = m[2] ? ' Her örnekte savaştan yalnızca bir Omen tetiklenebilir.' : '';
    return `Bu eşya envanterinde aktifken ${omenBody(m[1].trim())}\nAktif hâle getirmek için envanterinde bu eşyaya sağ tıkla. Tetiklendiğinde tükenir.${tail}`;
  }

  // 4) BIOME LOGBOK
  m = e.match(/^While this item is active in your inventory your next Logbook (guarantees an? (\w+) encounter in the revealed Biome|adds special modifiers to revealed Grand Expedition areas)\n.+$/s);
  if (m) {
    const body = m[2]
      ? `bir sonraki Logbook’un, açığa çıkan Biome’da bir ${m[2]} karşılaşmasını garanti eder.`
      : 'bir sonraki Logbook’un, açığa çıkan Grand Expedition alanlarına özel özellikler ekler.';
    return `Bu eşya envanterinde aktifken ${body}\nAktif hâle getirmek için envanterinde bu eşyaya sağ tıkla. Tetiklendiğinde tükenir.`;
  }

  // 5) KIRAC
  m = e.match(/^Reroll all of Kirac's Atlas Missions, (.+?)\.?\nRight click this item while viewing Kirac's Atlas Missions to use it\.$/s);
  if (m) return `Kirac’ın tüm Atlas Görevlerini yeniden çevirir, ${kirac(m[1])}.\nKullanmak için Kirac’ın Atlas Görevlerini görüntülerken bu eşyaya sağ tıkla.`;

  // 6) EXARCH / EATER implicit
  m = e.match(/^Adds an? (Lesser|Greater|Grand|Exceptional)? ?(Searing Exarch|Eater of Worlds) implicit modifier to a Body Armour, Boots, Gloves or Helmet\. This replaces any existing implicit modifiers other than (Eater of Worlds|Searing Exarch) implicit modifiers\.\nRight click this item then left click a normal, magic or rare item to apply it\. Cannot be used on Shaper, Elder or Elderslayer influenced items\.$/s);
  if (m) {
    const tier = ({ Lesser: 'Düşük', Greater: 'Yüksek', Grand: 'Görkemli', Exceptional: 'Olağanüstü' })[m[1]] || '';
    return `Bir Gövde Zırhı, Bot, Eldiven veya Miğfere ${tier ? tier + ' ' : ''}bir ${m[2]} implicit özelliği ekler. Bu, ${m[3]} implicit özellikleri dışındaki mevcut implicit özelliklerin yerini alır.\nUygulamak için bu eşyaya sağ, ardından normal, sihirli veya nadir bir eşyaya sol tıkla. Shaper, Elder veya Elderslayer etkili eşyalarda kullanılamaz.`;
  }

  // 7) IDOL / RUNE stat blokları (Slot: stat ... ; "Shield or Buckler:" bileşik dahil)
  const firstSlot = e.split('\n')[0].split(': ')[0];
  if (/: /.test(e) && /\b(Body Armour|Armour|Boots|Gloves|Helmet|Weapon|Wand|Staff|Sceptre|Shield|Buckler|Talisman|Quarterstaff|Spear|Bow|Mace|Focus)\b/.test(firstSlot) && !/Right click|Place in|Combine|Sacrifice|Can be used/.test(e)) {
    return idolBlock(e);
  }

  // 8) SPLINTER combine (opsiyonel sıfat: "Crescent Splinters", "Splinters")
  m = e.match(/^Combine (\d+) ([\w ]*?[Ss]plinters?) to create (.+?)\.$/);
  if (m) return `${m[1]} ${m[2]} birleştirerek ${m[3]} oluştur.`;

  // 9) SACRIFICE altar
  m = e.match(/^Sacrifice this item on the Altar of Sacrifice along with (.+?) to transform it\.$/);
  if (m) {
    const w = m[1].replace(/^any /i, 'herhangi bir ').replace(/ or /g, ' veya ');
    return `Dönüştürmek için bu eşyayı, ${w} ile birlikte Kurban Sunağında kurban et.`;
  }
  // tek-cümle one-off'lar
  if (/^Cross Navali's palm with silver to receive a prophecy\.$/.test(e))
    return 'Bir kehanet almak için Navali’nin avucuna gümüş bırak.';
  if (/^Replaces up to 2 modifiers on a Corrupted Vaal Unique Replaces other Uniques with a Corrupted Unique of the same Item Class/.test(e))
    return 'Bozulmuş bir Vaal Eşsizindeki en fazla 2 özelliğin yerini alır; diğer Eşsizlerin yerine ise aynı Eşya Sınıfından Bozulmuş bir Eşsiz koyar.\nUygulamak için bu eşyaya sağ, ardından eşsiz bir eşyaya sol tıkla.';

  // 10) QUALITY enhance ring/amulet/jewel
  m = e.match(/^Adds quality that enhances (\w+) modifiers on (a ring or amulet|a jewel) Replaces other quality types\nRight click this item then left click (a ring or amulet|a jewel) to apply it\.$/s);
  if (m) {
    const tgt = m[2] === 'a jewel' ? 'bir Jewel' : 'bir Yüzük veya Kolye';
    const mod = (FOSSIL[m[1]] ?? m[1]);
    return `Bir Yüzük veya Kolye üzerindeki ${mod} özelliklerini güçlendiren kalite ekler; diğer kalite türlerinin yerini alır.\nUygulamak için bu eşyaya sağ, ardından ${tgt}’ye sol tıkla.`.replace('Bir Yüzük veya Kolye', m[2] === 'a jewel' ? 'Bir Jewel' : 'Bir Yüzük veya Kolye');
  }

  // 11) Genel "Right click ... left click ... to apply it" crafting orb'ları + tek-satırlık
  return craftingLine(e);
}

// OMEN gövde çevirisi
function omenBody(s) {
  let t = s;
  // Logbook (Expedition) kalıpları
  t = t.replace(/your next Logbook adds special modifiers to revealed Grand Expedition areas/i, 'bir sonraki Logbook’un, açığa çıkan Grand Expedition alanlarına özel özellikler ekler');
  t = t.replace(/your next Logbook guarantees an? (\w+) encounter in the revealed Biome/i, 'bir sonraki Logbook’u, açığa çıkan Biome’da bir $1 karşılaşması garanti eder');
  t = t.replace(/the next time you reveal Desecrated modifiers you can reroll the options once/i, 'Desecrated özellikleri bir sonraki açığa çıkardığında seçenekleri bir kez yeniden çevirebilirsin');
  if (t !== s) { if (!/[.!?]$/.test(t)) t += '.'; return t; }
  // önce "will/recover your/prevent" bütün-cümle kalıpları (^will strip'ten ÖNCE)
  t = t.replace(/^will prevent (\d+%) of Experience loss when you die/i, 'öldüğünde Deneyim kaybının $1’ini önler');
  t = t.replace(/^will (fully )?recover your flask and charm charges when you reach Low Life/i, 'Düşük Cana ulaştığında şişe ve tılsım şarjlarını tamamen yeniler');
  t = t.replace(/^fully recover your Life, Mana and Energy Shield when you reach Low Life/i, 'Düşük Cana ulaştığında Can, Mana ve Enerji Kalkanını tamamen yeniler');
  if (t === s) {
    t = t.replace(/^your next /i, 'bir sonraki ');
    t = t.replace(/^the next /i, 'tıkladığın bir sonraki ');
    t = t.replace(/^will /i, '');
  }
  // sık kalıplar
  const R = [
    [/Exalted Orb will add only suffix modifiers/i, 'Exalted Orb yalnızca sonek özellikleri ekler'],
    [/Exalted Orb will add only prefix modifiers/i, 'Exalted Orb yalnızca önek özellikleri ekler'],
    [/Exalted Orb will add two random modifiers/i, 'Exalted Orb iki rastgele özellik ekler'],
    [/Exalted Orb will add a Modifier of the same type as an existing Modifier on the Item/i, 'Exalted Orb, eşyadaki mevcut bir özellikle aynı türden bir özellik ekler'],
    [/Regal Orb will add only suffix modifiers/i, 'Regal Orb yalnızca sonek özellikleri ekler'],
    [/Regal Orb will add only prefix modifiers/i, 'Regal Orb yalnızca önek özellikleri ekler'],
    [/Regal Orb will add a Modifier of the same type as an existing Modifier on the Item/i, 'Regal Orb, eşyadaki mevcut bir özellikle aynı türden bir özellik ekler'],
    [/Orb of Annulment will remove only suffix modifiers/i, 'Orb of Annulment yalnızca sonek özellikleri kaldırır'],
    [/Orb of Annulment will remove only prefix modifiers/i, 'Orb of Annulment yalnızca önek özellikleri kaldırır'],
    [/Orb of Annulment will remove two modifiers/i, 'Orb of Annulment iki özellik kaldırır'],
    [/Orb of Annulment will remove only Desecrated modifiers/i, 'Orb of Annulment yalnızca Desecrated özellikleri kaldırır'],
    [/Orb of Alchemy will result in the maximum number of suffix modifiers/i, 'Orb of Alchemy azami sayıda sonek özelliği verir'],
    [/Orb of Alchemy will result in the maximum number of prefix modifiers/i, 'Orb of Alchemy azami sayıda önek özelliği verir'],
    [/Chaos Orb will remove only suffix modifiers/i, 'Chaos Orb yalnızca sonek özellikleri kaldırır'],
    [/Chaos Orb will remove only prefix modifiers/i, 'Chaos Orb yalnızca önek özellikleri kaldırır'],
    [/Chaos Orb will remove the lowest level modifier/i, 'Chaos Orb en düşük seviyeli özelliği kaldırır'],
    [/Perfect or Corrupted Essence will remove only Suffix modifiers/i, 'Perfect veya Corrupted Essence yalnızca sonek özellikleri kaldırır'],
    [/Perfect or Corrupted Essence will remove only Prefix modifiers/i, 'Perfect veya Corrupted Essence yalnızca önek özellikleri kaldırır'],
    [/Desecration attempt will add only suffix modifiers/i, 'Desecration denemesi yalnızca sonek özellikleri ekler'],
    [/Desecration attempt will add only prefix modifiers/i, 'Desecration denemesi yalnızca önek özellikleri ekler'],
    [/Orb of Chance will not destroy the Item/i, 'Orb of Chance eşyayı yok etmez'],
    [/Orb of Chance will upgrade the Item to a random Unique of the same Item Class/i, 'Orb of Chance eşyayı, aynı Eşya Sınıfından rastgele bir Eşsize yükseltir'],
    [/Vaal Orb will always result in change/i, 'Vaal Orb her zaman değişimle sonuçlanır'],
    [/Divine Orb used on a Rare item will Sanctify it/i, 'Nadir bir eşyada kullanılan Divine Orb onu Sanctify eder'],
    [/Divine Orb will only reroll Implicit Modifiers/i, 'Divine Orb yalnızca Implicit özellikleri yeniden çevirir'],
    [/Weapon or Jewellery Desecration attempt will guarantee a random (\w+) modifier/i, 'Silah veya Takı Desecration denemesi rastgele bir $1 özelliği garanti eder'],
    [/Chaos Orb will replace all Modifiers on a Waystone with Modifiers that do not grant (.+)/i, 'Chaos Orb, bir Waystone’daki tüm özellikleri $1 vermeyen özelliklerle değiştirir'],
    [/Exalted Orb will consume all Catalyst Quality to increase the chance of the corresponding type of Modifier/i, 'Exalted Orb, ilgili türde özellik şansını artırmak için tüm Catalyst Kalitesini tüketir'],
    [/Desecration attempt will replace all modifiers on the item creating an item with up to 6 Unrevealed modifiers and Corrupting the item/i, 'Desecration denemesi eşyadaki tüm özellikleri değiştirir; 6’ya kadar Açığa Çıkmamış özelliği olan bir eşya yaratır ve eşyayı Bozar'],
    [/Shrine you click on will grant an additional Effect/i, 'tıkladığın Shrine ek bir Etki verir'],
    [/Strongbox you click on will be reopenable/i, 'tıkladığın Strongbox yeniden açılabilir olur'],
    [/Rogue Exile you encounter will summon an ally/i, 'karşılaştığın Rogue Exile bir müttefik çağırır'],
    [/Possessed monster you kill will release its Azmeri Spirit/i, 'öldürdüğün Possessed yaratık Azmeri Ruhunu serbest bırakır'],
    [/sold item's Gold value will be incorrectly assessed by the Vendor/i, 'sattığın eşyanın Altın değeri Satıcı tarafından yanlış değerlendirilir'],
    [/Gamble purchase will have a 50% chance of costing no Gold and not consuming this Omen/i, 'Gamble alımının %50 ihtimalle Altın maliyeti olmaz ve bu Omen tükenmez'],
    [/Cacatalyst/i, 'Catalyst']
  ];
  for (const [re, rep] of R) t = t.replace(re, rep);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function kirac(s) {
  const R = [
    [/including at least one Blighted Map/i, 'en az bir Blighted Harita içerecek şekilde'],
    [/including at least one Breachstone/i, 'en az bir Breachstone içerecek şekilde'],
    [/including at least one Unique map/i, 'en az bir Eşsiz harita içerecek şekilde'],
    [/including at least one Shaper Guardian, Elder Guardian, or Elderslayer Map/i, 'en az bir Shaper Guardian, Elder Guardian veya Elderslayer Haritası içerecek şekilde'],
    [/adding additional mission options/i, 'ek görev seçenekleri ekleyerek'],
    [/adding layers of Delirium to all non-Unique Maps/i, 'tüm Eşsiz-olmayan Haritalara Delirium katmanları ekleyerek'],
    [/granting missions with rewarding implicit modifiers/i, 'ödüllendirici implicit özellikli görevler vererek'],
    [/using uncompleted Maps where possible/i, 'mümkün olduğunda tamamlanmamış Haritalar kullanarak'],
    [/corrupting all non-Unique Maps/i, 'tüm Eşsiz-olmayan Haritaları bozarak']
  ];
  let t = s;
  for (const [re, rep] of R) t = t.replace(re, rep);
  return t;
}

// Genel crafting / tek-satır çeviri (büyük bir kalıp tablosu)
function craftingLine(e) {
  const MAP = {
    'This item is no longer usable.': 'Bu eşya artık kullanılamaz.',
    'A discarded Avian feather with an unknown purpose': 'Amacı bilinmeyen, atılmış bir kuş tüyü.',
    'Can be used at the Verisium Anvil to forge a new Unique item.': 'Yeni bir Eşsiz eşya dövmek için Verisium Anvil’da kullanılabilir.',
    'Can be used at the Verisium Anvil to transform Unique items.': 'Eşsiz eşyaları dönüştürmek için Verisium Anvil’da kullanılabilir.',
    'Can be used at the Verisium Anvil to transform Equipment.': 'Ekipmanı dönüştürmek için Verisium Anvil’da kullanılabilir.',
    'Used to open Bronze Caches within the Trials': 'Denemelerdeki Bronz Zulaları açmak için kullanılır.',
    'Destroys an item, applying its influence to another of the same item class The second item is reforged as a rare item with both influence types and new modifiers\nRight click this item, then left click the item you wish to take the influence from, then left click an item of the same item class you wish to apply it to.':
      'Bir eşyayı yok eder ve etkisini aynı eşya sınıfından bir başkasına aktarır; ikinci eşya, her iki etki türünü ve yeni özellikleri taşıyan nadir bir eşya olarak yeniden dövülür.\nBu eşyaya sağ tıkla, ardından etkisini almak istediğin eşyaya sol tıkla, sonra etkiyi uygulamak istediğin aynı eşya sınıfından bir eşyaya sol tıkla.',
    "Right click on this item then left click on a Voidstone to apply the itemised Sextant Modifier to the Voidstone.": 'Bu eşyaya sağ, ardından bir Voidstone’a sol tıklayarak eşyalaştırılmış Sextant özelliğini Voidstone’a uygula.',
    'Stores a Sextant Modifier in an item\nRight click on this item then left click on a Voidstone to itemise an applied Sextant Modifier.': 'Bir eşyada bir Sextant özelliği saklar.\nBu eşyaya sağ, ardından bir Voidstone’a sol tıklayarak uygulanmış bir Sextant özelliğini eşyalaştır.',
    'Can be used at the Horticrafting bench in your hideout.': 'Sığınağındaki Horticrafting tezgâhında kullanılabilir.',
    "A stack of 10 shards becomes an Artificer's Orb.": '10 parçalık bir yığın bir Artificer’s Orb olur.',
    'A stack of 10 shards becomes an Orb of Chance.': '10 parçalık bir yığın bir Orb of Chance olur.',
    'Grants an Event Point.': 'Bir Event Point verir.',
    'Creates a portal to town\nRight click on this item to use it.': 'Kasabaya bir portal açar.\nKullanmak için bu eşyaya sağ tıkla.',
    'Grants a passive skill refund point\nRight click on this item to use it.': 'Bir pasif beceri iade puanı verir.\nKullanmak için bu eşyaya sağ tıkla.',
    'Grants an atlas passive skill refund point\nRight click on this item to use it.': 'Bir atlas pasif beceri iade puanı verir.\nKullanmak için bu eşyaya sağ tıkla.'
  };
  if (MAP[e]) return MAP[e];

  // shard/fragment: "A stack of N shards/fragments becomes X" (nokta opsiyonel)
  let sm = e.match(/^A stack of (\d+) (?:shards|fragments) becomes (?:an? )?(.+?)\.?$/);
  if (sm) return `${sm[1]} parçalık bir yığın bir ${sm[2]} olur.`;

  // NET: "Effective against Beasts of (levels N to M|levels N and above|all levels). Activate ..."
  let nm = e.match(/^Effective against Beasts of (levels \d+ to \d+|levels \d+ and above|all levels)\. Activate to use this type of Net when capturing Beasts\.$/);
  if (nm) {
    const lvl = nm[1].replace(/^levels (\d+) to (\d+)$/, '$1 ila $2 seviyelerindeki').replace(/^levels (\d+) and above$/, '$1 ve üzeri seviyelerdeki').replace(/^all levels$/, 'tüm seviyelerdeki');
    return `${lvl} Canavarlara karşı etkilidir. Canavar yakalarken bu tür Ağı kullanmak için etkinleştir.`;
  }
  // "Can be used on Beast corpses of all levels. Activate ..."
  if (/^Can be used on Beast corpses of all levels\. Activate to use this type of Net when capturing Beasts\.$/.test(e))
    return 'Tüm seviyelerdeki Canavar cesetlerinde kullanılabilir. Canavar yakalarken bu tür Ağı kullanmak için etkinleştir.';

  // Ritual vessel
  if (/^Stores the monsters slain for the first time from a completed Ritual Altar for future use/.test(e))
    return 'Tamamlanmış bir Ritual Sunağında ilk kez öldürülen yaratıkları ileride kullanmak üzere saklar.\nBu eşyaya sağ, ardından bir Ritual Sunağına sol tıklayarak tamamlanmış Ritual’deki yaratıkları bu eşyada sakla. Blood-Filled Vessel ile açılmış bir haritadaki Ritual’de kullanılamaz.';
  // Rogue Harbour
  if (/^Creates a portal to the Rogue Harbour from a Town or Hideout/.test(e))
    return 'Bir Kasaba veya Sığınaktan Rogue Harbour’a bir portal açar. Rogue Harbour’daki hizmetler için Currency olarak kullanılır.\nKullanmak için bir Kasaba veya Sığınaktayken bu eşyaya sağ tıkla.';
  // §245 Influenced upgrade (Awakener's Orb benzeri)
  if (/^Removes one Influenced Modifier from an item with at least two Influenced Modifiers and upgrades another/.test(e))
    return 'En az iki Influenced özelliği olan bir eşyadan bir Influenced özelliği kaldırır ve başka bir Influenced özelliği yükseltir. En yüksek kademedeki bir özelliği yükseltmek onu Elevated özelliğe dönüştürür. Bir Elevated özelliği yükseltmeye çalışmak değerlerini yeniden çevirir. Gövde Zırhı, Bot, Eldiven ve Miğferlerde kullanılabilir.\nUygulamak için bu eşyaya sağ, ardından en az iki Influenced özelliği olan bir eşyaya sol tıkla.';
  // §244 strength raise/lower
  if (/^Unpredictably raise the strength of one Searing Exarch or Eater of Worlds modifier/.test(e))
    return 'Bir eşyadaki Searing Exarch veya Eater of Worlds özelliklerinden birinin gücünü öngörülemez şekilde yükseltir ve bir diğerininkini düşürür. Gücü düşürülen Düşük özellikler kaldırılır.\nUygulamak için bu eşyaya sağ, ardından eşsiz-olmayan bir eşyaya sol tıkla. Yalnızca hem Searing Exarch hem de Eater of Worlds implicit özelliği olan eşyalarda kullanılabilir. Bir özelliğin yükselme veya düşme şansı, göreceli gücüne bağlıdır.';

  // EXARCH/EATER "If dominant" (reroll/add/remove prefix/suffix)
  let xm = e.match(/^If The Searing Exarch is dominant, (reroll prefix modifiers|add a prefix modifier|remove a prefix modifier)\. If The Eater of Worlds is dominant, (reroll suffix modifiers|add a suffix modifier|remove a suffix modifier)\.\nRight click this item then left click (?:on )?a (?:rare|magic or rare) item with The Searing Exarch or The Eater of Worlds dominance to apply it\.( Rare items can have up to six random modifiers\.)?$/s);
  if (xm) {
    const act = { 'reroll prefix modifiers': 'önek özellikleri yeniden çevir', 'add a prefix modifier': 'bir önek özelliği ekle', 'remove a prefix modifier': 'bir önek özelliği kaldır' }[xm[1]];
    const act2 = { 'reroll suffix modifiers': 'sonek özellikleri yeniden çevir', 'add a suffix modifier': 'bir sonek özelliği ekle', 'remove a suffix modifier': 'bir sonek özelliği kaldır' }[xm[2]];
    const tail = xm[3] ? ' Nadir eşyalar altıya kadar rastgele özelliğe sahip olabilir.' : '';
    return `The Searing Exarch baskınsa ${act}. The Eater of Worlds baskınsa ${act2}.\nUygulamak için bu eşyaya sağ, ardından The Searing Exarch veya The Eater of Worlds baskınlığına sahip bir eşyaya sol tıkla.${tail}`;
  }

  // FLASK enchant
  let fm = e.match(/^Adds an enchantment to a utility flask that will (.+?)\. Replaces any existing enchantment\.\nRight click this item then left click a flask to apply it\.$/s);
  if (fm) {
    const body = { 'improve it but prevent it from gaining charges during its effect': 'onu geliştiren ama etkisi sırasında şarj kazanmasını önleyen', 'cause it to be used when certain conditions are met': 'belirli koşullar sağlandığında kullanılmasını sağlayan' }[fm[1]] || fm[1];
    return `Bir utility şişeye, ${body} bir büyü ekler. Mevcut herhangi bir büyünün yerini alır.\nUygulamak için bu eşyaya sağ, ardından bir şişeye sol tıkla.`;
  }

  // ESSENCE: "Removes a random modif(i)er and [Aa]ugments a <TGT> with a new <KIND> modifier" + kuyruklar
  let em = e.match(/^Removes a random modif(?:i)?er and [Aa]ugments (a Rare item|a Rare Time-Lost Jewel|a Rare Basic Jewel|a Magic item) with a new (guaranteed Crafted|guaranteed|random) modifier(.*)$/s);
  if (em) {
    const tgt = { 'a Rare item': 'Nadir bir eşyadan', 'a Rare Time-Lost Jewel': 'Nadir bir Time-Lost Jewel’dan', 'a Rare Basic Jewel': 'Nadir bir Basit Jewel’dan', 'a Magic item': 'Sihirli bir eşyadan' }[em[1]];
    const kind = { 'guaranteed Crafted': 'garantili Crafted', 'guaranteed': 'garantili', 'random': 'rastgele' }[em[2]];
    let tail = em[3].replace(/\n/g, ' ');
    tail = tail.replace(/\s*Can be used at The Withered Willow to Instil Amulets with a Notable Passive Skill\./i, ' The Withered Willow’da Kolyelere bir Notable Pasif Beceri işlemek için kullanılabilir.');
    tail = tail.replace(/\s*Right click this item then left click (?:on )?(.+?) to apply it\./i, (m, g) => ` Uygulamak için bu eşyaya sağ, ardından ${applyTarget(g)} sol tıkla.`);
    return `${tgt} rastgele bir özellik kaldırır ve yeni, ${kind} bir özellik ekler.${tail}`;
  }

  // "Improves the quality of a X" (basit, "exceeding" YOK)
  let qm = e.match(/^Improves the quality of (a |an )?(.+?)\n/);
  if (qm && !/exceeding/.test(e)) {
    const tgtMap = { 'wand, staff or sceptre': 'bir wand, staff veya sceptre', 'armour': 'bir zırh', 'an armour': 'bir zırh', 'martial weapon': 'bir savaş silahı', 'map': 'bir harita', 'a map': 'bir harita' };
    const what = tgtMap[qm[2]] ?? ('bir ' + qm[2]);
    let t2 = `${what.charAt(0).toUpperCase() + what.slice(1)}’in kalitesini artırır.\n`;
    let instr = e.slice(e.indexOf('\n') + 1);
    instr = instr.replace(/Right click this item then left click (?:on )?(.+?) to apply it\.?/i, (m, g) => `Uygulamak için bu eşyaya sağ, ardından ${applyTarget(g)} sol tıkla.`);
    return t2 + instr.trim();
  }

  // "Adds an Augment Socket to X"
  let am2 = e.match(/^Adds an Augment Socket to (.+?)\n/);
  if (am2) {
    let instr = e.slice(e.indexOf('\n') + 1).replace(/Right click this item then left click (?:on )?(.+?) to apply it\.?/i, (m, g) => `Uygulamak için bu eşyaya sağ, ardından ${applyTarget(g)} sol tıkla.`);
    return `${slotPhrase(am2[1])}’e bir Geliştirme Yuvası ekler.\n${instr.trim()}`;
  }

  // "Adds quality that enhances <multi> modifiers on a ring or amulet/jewel"
  let qe = e.match(/^Adds quality that enhances (.+?) modifiers on (a ring or amulet|a jewel) Replaces other quality types\nRight click this item then left click (a ring or amulet|a jewel) to apply it\.$/s);
  if (qe) {
    const tgt = qe[2] === 'a jewel' ? 'bir Jewel' : 'bir Yüzük veya Kolye';
    const mod = qe[1].replace(/Armour, Evasion and Energy Shield/i, 'Zırh, Kaçınma ve Enerji Kalkanı').replace(/Attribute/i, 'Nitelik').replace(/Attack/i, 'Saldırı').replace(/Caster/i, 'Büyücü').replace(/Speed/i, 'Hız').replace(/Chaos/i, 'Kaos').replace(/Lightning/i, 'Yıldırım').replace(/Cold/i, 'Soğuk').replace(/Fire/i, 'Ateş').replace(/Physical/i, 'Fiziksel').replace(/Life/i, 'Can').replace(/Mana/i, 'Mana');
    return `${tgt} üzerindeki ${mod} özelliklerini güçlendiren kalite ekler; diğer kalite türlerinin yerini alır.\nUygulamak için bu eşyaya sağ, ardından ${tgt}’ye sol tıkla.`;
  }

  // "Change the colour of a socket on a Skill Gem"
  let cm = e.match(/^Change the colour of a socket on a Skill Gem\n/);
  if (cm) return 'Bir Beceri Taşındaki bir yuvanın rengini değiştirir.\nUygulamak için bu eşyaya sağ, ardından bir beceri taşına sol tıkla.';

  // İki bölüm: <aksiyon> ⏎ <talimat>. Çoğu "Right click this item then left click X to apply it."
  let t = e;
  const RULES = [
    [/^Upgrades a normal item to a rare item with up to four linked sockets/i, 'Normal bir eşyayı, dört bağlı yuvaya kadar olan nadir bir eşyaya yükseltir'],
    [/^Upgrades a normal item to a rare item/i, 'Normal bir eşyayı nadir bir eşyaya yükseltir'],
    [/^Upgrades a Normal item to a Magic item with 1 modifier/i, 'Normal bir eşyayı 1 özellikli Sihirli bir eşyaya yükseltir'],
    [/^Upgrades a Magic item to a Rare item, adding 1 modifier/i, 'Sihirli bir eşyayı Nadir bir eşyaya yükseltir ve 1 özellik ekler'],
    [/^Upgrades a Normal or Magic item to a Rare item with 4 random modifiers/i, 'Normal veya Sihirli bir eşyayı 4 rastgele özellikli Nadir bir eşyaya yükseltir'],
    [/^Upgrades a breach unique item or breachstone to a more powerful version/i, 'Bir breach eşsiz eşyasını veya breachstone’u daha güçlü bir sürüme yükseltir'],
    [/^Upgrades (The .+?) to a more powerful version/i, '$1’i daha güçlü bir sürüme yükseltir'],
    [/^Upgrades a Magic item to a Rare item, adding a guaranteed modifier/i, 'Sihirli bir eşyayı Nadir bir eşyaya yükseltir ve garantili bir özellik ekler'],
    [/^Upgrades a Corruption Enchantment on a Rare (Weapon or Quiver|Armour) and removes a random Modifier/i, 'Nadir bir $1 üzerindeki Corruption Enchantment’ı yükseltir ve rastgele bir Özellik kaldırır'],
    [/^Augments a Rare item with a new random modifier/i, 'Nadir bir eşyaya yeni rastgele bir özellik ekler'],
    [/^Augments a Magic item with a new random modifier/i, 'Sihirli bir eşyaya yeni rastgele bir özellik ekler'],
    [/^Removes a random modifier from an item/i, 'Bir eşyadan rastgele bir özellik kaldırır'],
    [/^Removes all modifiers from an item/i, 'Bir eşyadaki tüm özellikleri kaldırır'],
    [/^Upgrades the Skills on an item to Level 20/i, 'Bir eşyadaki Becerileri Seviye 20’ye yükseltir'],
    [/^Upgrades a Kalguuran Skill Gem to level (\d+)/i, 'Bir Kalguuran Beceri Taşını seviye $1’e yükseltir'],
    [/^Upgrades a Corruption Enchantment on a Rare (Amulet, Ring or Belt|Jewel) and removes a random Modifier/i, 'Nadir bir $1 üzerindeki Corruption Enchantment’ı yükseltir ve rastgele bir Özellik kaldırır'],
    [/^Adds or replaces an enchantment on a (body armour|weapon)\. This may reforge the (?:body armour|weapon)'s sockets\./i, (mm, w) => `Bir ${w === 'weapon' ? 'silah' : 'gövde zırhı'} üzerindeki bir büyüyü ekler veya değiştirir. Bu, ${w === 'weapon' ? 'silahın' : 'gövde zırhının'} yuvalarını yeniden dövebilir.`],
    [/^Identifies an item/i, 'Bir eşyayı tanımlar'],
    [/^Desecrates a Rare Amulet, Ring or Belt with a chance for otherworldly modifiers/i, 'Nadir bir Kolye, Yüzük veya Kemeri, öteki-dünya özellikleri şansıyla Desecrate eder'],
    [/^Desecrates a Rare Amulet, Ring or Belt/i, 'Nadir bir Kolye, Yüzük veya Kemeri Desecrate eder'],
    [/^Desecrates a Rare Weapon or Quiver/i, 'Nadir bir Silah veya Sadağı Desecrate eder'],
    [/^Desecrates a Rare Armour/i, 'Nadir bir Zırhı Desecrate eder'],
    [/^Desecrates a Rare Jewel/i, 'Nadir bir Jewel’ı Desecrate eder'],
    [/^Desecrates a Rare Waystone/i, 'Nadir bir Waystone’u Desecrate eder'],
    [/^Adds or rerolls a modifier on a Voidstone/i, 'Bir Voidstone üzerindeki bir özelliği ekler veya yeniden çevirir'],
    [/^Modifies a Tablet unpredictably and Corrupts it/i, 'Bir Tablet’i öngörülemez şekilde değiştirir ve Bozar'],
    [/^Modifies a Corrupted Equipment or Jewel item unpredictably or destroys it/i, 'Bozulmuş bir Ekipman veya Jewel eşyasını öngörülemez şekilde değiştirir ya da yok eder'],
    [/^Modifies a Corrupted Skill Gem unpredictably or destroys it/i, 'Bozulmuş bir Beceri Taşını öngörülemez şekilde değiştirir ya da yok eder'],
    [/^Modifies a Soul Core unpredictably, with a chance to destroy it/i, 'Bir Soul Core’u öngörülemez şekilde değiştirir; yok etme şansı vardır'],
    [/^Modifies an item unpredictably and Corrupts it/i, 'Bir eşyayı öngörülemez şekilde değiştirir ve Bozar'],
    [/^Reforges a unique equipment as another of the same item class/i, 'Bir eşsiz ekipmanı, aynı eşya sınıfından bir başkası olarak yeniden döver'],
    [/^Reforges a map item as another of a higher tier/i, 'Bir harita eşyasını daha yüksek kademeli bir başkası olarak yeniden döver'],
    [/^Reforges a map item as another of the same tier/i, 'Bir harita eşyasını aynı kademeden bir başkası olarak yeniden döver'],
    [/^Reforges the links between sockets on an item/i, 'Bir eşyadaki yuvalar arasındaki bağlantıları yeniden döver'],
    [/^Randomises the numeric values of the implicit modifiers of an item/i, 'Bir eşyanın implicit özelliklerinin sayısal değerlerini rastgeleleştirir'],
    [/^Randomises the numeric values of modifiers on an item/i, 'Bir eşyadaki özelliklerin sayısal değerlerini rastgeleleştirir'],
    [/^Randomises the numeric values of base defences on an armour/i, 'Bir zırhın temel savunmalarının sayısal değerlerini rastgeleleştirir'],
    [/^Randomises the quality of a corrupted armour/i, 'Bozulmuş bir zırhın kalitesini rastgeleleştirir'],
    [/^Randomises the quality of a corrupted weapon/i, 'Bozulmuş bir silahın kalitesini rastgeleleştirir'],
    [/^Fracture a random modifier on a rare item with at least 4 modifiers, locking it in place\./i, 'En az 4 özelliği olan nadir bir eşyadaki rastgele bir özelliği Fracture eder ve yerine kilitler.'],
    [/^Creates a split copy\. Cannot be used to split Influenced, Enchanted, Fractured, or Synthesised items\./i, 'Bölünmüş bir kopya oluşturur. Influenced, Enchanted, Fractured veya Synthesised eşyaları bölmek için kullanılamaz.'],
    [/^Creates a Mirrored copy of an item/i, 'Bir eşyanın Mirror’lanmış bir kopyasını oluşturur'],
    [/^Transforms all Cold and Lightning Resistance modifiers on an item to equivalent Fire Resistance modifiers/i, 'Bir eşyadaki tüm Soğuk ve Yıldırım Direnci özelliklerini eşdeğer Ateş Direnci özelliklerine dönüştürür'],
    [/^Transforms all Fire and Lightning Resistance modifiers on an item to equivalent Cold Resistance modifiers/i, 'Bir eşyadaki tüm Ateş ve Yıldırım Direnci özelliklerini eşdeğer Soğuk Direnci özelliklerine dönüştürür'],
    [/^Transforms all Fire and Cold Resistance modifiers on an item to equivalent Lightning Resistance modifiers/i, 'Bir eşyadaki tüm Ateş ve Soğuk Direnci özelliklerini eşdeğer Yıldırım Direnci özelliklerine dönüştürür'],
    [/^Transforms all Fire, Cold and Lightning Resistance modifiers on an item to equivalent Chaos resistance modifiers/i, 'Bir eşyadaki tüm Ateş, Soğuk ve Yıldırım Direnci özelliklerini eşdeğer Kaos Direnci özelliklerine dönüştürür'],
    [/^Adds (Crusader|Hunter|Redeemer|Warlord) influence and a new \1 modifier to a rare item/i, 'Nadir bir eşyaya $1 etkisi ve yeni bir $1 özelliği ekler'],
    [/^Reforges a magic item with new random modifiers/i, 'Sihirli bir eşyayı yeni rastgele özelliklerle yeniden döver'],
    [/^Reforges a rare item with new random modifiers/i, 'Nadir bir eşyayı yeni rastgele özelliklerle yeniden döver'],
    [/^\+(\d+) to Level of all (\w+) Skills/i, 'tüm $2 Becerilerinin Seviyesine +$1'],
    [/^Allows an item to foresee the result of the next Currency item used on it Modifying the item in any way removes the ability to foresee/i, 'Bir eşyanın, üzerinde kullanılacak bir sonraki Currency eşyasının sonucunu önceden görmesini sağlar; eşyayı herhangi bir şekilde değiştirmek bu öngörü yeteneğini kaldırır'],
    [/^Destroys an Anointed Item to recover one of the Oils that was used to apply that Anointment/i, 'Anoint edilmiş bir Eşyayı yok ederek o Anoint için kullanılan Yağlardan birini geri kazandırır'],
    [/^Sets a Skill Gem to have (\d) Support Gem Sockets/i, 'Bir Beceri Taşını $1 Destek Taşı Yuvasına sahip olacak şekilde ayarlar'],
    [/^Adds stored experience to a gem, up to its maximum level/i, 'Bir taşa, azami seviyesine kadar depolanmış deneyim ekler'],
    [/^Change the type of quality of a skill gem with quality to another random quality/i, 'Kaliteli bir beceri taşının kalite türünü rastgele başka bir kaliteye değiştirir'],
    [/^Change the type of quality of a support gem with quality to another random quality/i, 'Kaliteli bir destek taşının kalite türünü rastgele başka bir kaliteye değiştirir'],
    [/^Stores a Beast in an item/i, 'Bir Canavarı bir eşyada saklar'],
    [/^Downgrades a map on the Atlas/i, 'Atlas’taki bir haritayı düşürür'],
    [/^Improves the quality of a Strongbox/i, 'Bir Strongbox’ın kalitesini artırır'],
    [/^Greatly improves the quality and rewards of a Strongbox and strengthens its defenders/i, 'Bir Strongbox’ın kalitesini ve ödüllerini büyük ölçüde artırır ve savunucularını güçlendirir'],
    [/^Opens an unopened Strongbox allowing it to be opened an additional time/i, 'Açılmamış bir Strongbox’ı açarak bir kez daha açılmasına izin verir'],
    [/^Effective against Beasts of levels (\d+) and above\. Activate to use this type of Net when capturing Beasts\./i, '$1 ve üzeri seviyelerdeki Canavarlara karşı etkilidir. Canavar yakalarken bu tür Ağı kullanmak için etkinleştir.'],
    [/^Unpredictably either upgrades a Normal item to Unique rarity or destroys it/i, 'Normal bir eşyayı öngörülemez şekilde ya Eşsiz nadirliğe yükseltir ya da yok eder'],
    [/^Unpredictably either upgrades a corrupted item to unique rarity or destroys it/i, 'Bozulmuş bir eşyayı öngörülemez şekilde ya eşsiz nadirliğe yükseltir ya da yok eder'],
    [/^Unpredictably either reforges a corrupted rare item with new random modifiers or removes all of its modifiers/i, 'Bozulmuş nadir bir eşyayı öngörülemez şekilde ya yeni rastgele özelliklerle yeniden döver ya da tüm özelliklerini kaldırır'],
    [/^Unpredictably reforges the colour of sockets on a corrupted item/i, 'Bozulmuş bir eşyadaki yuvaların rengini öngörülemez şekilde yeniden döver'],
    [/^Unpredictably raises or lowers the tier of each modifier on a corrupted rare item/i, 'Bozulmuş nadir bir eşyadaki her özelliğin kademesini öngörülemez şekilde yükseltir veya düşürür'],
    [/^Unpredictably adds or removes a modifier on a corrupted rare item/i, 'Bozulmuş nadir bir eşyada öngörülemez şekilde bir özellik ekler veya kaldırır'],
    [/^Unpredictably adds or removes a link to the largest group of linked sockets on a corrupted item/i, 'Bozulmuş bir eşyadaki en büyük bağlı-yuva grubuna öngörülemez şekilde bir bağlantı ekler veya kaldırır'],
    [/^Improves the quality of a wand, staff or sceptre, exceeding maximum quality by up to 10% with a chance of Corrupting it/i, 'Bir wand, staff veya sceptre’ın kalitesini, azami kaliteyi %10’a kadar aşacak şekilde artırır; Bozma şansı vardır'],
    [/^Improves the quality of an Armour, exceeding maximum quality by up to 10% with a chance of Corrupting it/i, 'Bir Zırhın kalitesini, azami kaliteyi %10’a kadar aşacak şekilde artırır; Bozma şansı vardır'],
    [/^Improves the quality of a Martial Weapon, exceeding maximum quality by up to 10% with a chance of Corrupting it/i, 'Bir Savaş Silahının kalitesini, azami kaliteyi %10’a kadar aşacak şekilde artırır; Bozma şansı vardır'],
    [/^Improves the quality of a ring or amulet, exceeding maximum quality by up to 10% with a chance of Corrupting it/i, 'Bir Yüzük veya Kolyenin kalitesini, azami kaliteyi %10’a kadar aşacak şekilde artırır; Bozma şansı vardır'],
    [/^Adds quality that enhances (\w+) modifiers on a ring or amulet Replaces other quality types/i, (mm, g) => `Bir Yüzük veya Kolye üzerindeki ${FOSSIL[g] ?? g} özelliklerini güçlendiren kalite ekler; diğer kalite türlerinin yerini alır`],
    [/^Adds quality that enhances (\w+) modifiers on a jewel Replaces other quality types/i, (mm, g) => `Bir Jewel üzerindeki ${FOSSIL[g] ?? g} özelliklerini güçlendiren kalite ekler; diğer kalite türlerinin yerini alır`]
  ];
  for (const [re, rep] of RULES) { if (re.test(t.split('\n')[0])) { t = t.replace(re, rep); break; } }

  // talimat satırını çevir (fiil esnek: apply/corrupt/open/upgrade/use/destroy/downgrade)
  const VERB = { apply: 'Uygulamak', corrupt: 'Bozmak', open: 'Açmak', upgrade: 'Yükseltmek', use: 'Kullanmak', destroy: 'Yok etmek', downgrade: 'Düşürmek', reshape: 'Yeniden şekillendirmek' };
  t = t.replace(/Right click this item,? then left click (?:on )?(.+?) to (apply|corrupt|open|upgrade|use|destroy|downgrade|reshape) it\./gi,
    (m, g, v) => `${VERB[v]} için bu eşyaya sağ, ardından ${applyTarget(g)} sol tıkla.`);
  t = t.replace(/Corrupted items cannot be modified again\./gi, 'Bozulmuş eşyalar bir daha değiştirilemez.');
  t = t.replace(/Right click this item then left click on the item you wish to modify\./gi, 'Bu eşyaya sağ, ardından değiştirmek istediğin eşyaya sol tıkla.');
  t = t.replace(/Right click on this item then left click on a Beast in your Menagerie to itemise the Beast\./i, 'Bu eşyaya sağ, ardından Menagerie’ndeki bir Canavara sol tıklayarak Canavarı eşyalaştır.');
  t = t.replace(/Right click this item while viewing Kirac's Atlas Missions to use it\./i, 'Kullanmak için Kirac’ın Atlas Görevlerini görüntülerken bu eşyaya sağ tıkla.');
  t = t.replace(/Right click on this item to use it\./i, 'Kullanmak için bu eşyaya sağ tıkla.');
  // kalan sık kuyruklar
  t = t.replace(/Rare items can have up to six random modifiers\./gi, 'Nadir eşyalar altıya kadar rastgele özelliğe sahip olabilir.');
  t = t.replace(/Magic items can have up to two random modifiers\./gi, 'Sihirli eşyalar ikiye kadar rastgele özelliğe sahip olabilir.');
  t = t.replace(/Current modifiers are retained and a new one is added\./gi, 'Mevcut özellikler korunur ve yeni bir tane eklenir.');
  t = t.replace(/Current modifiers are not retained\./gi, 'Mevcut özellikler korunmaz.');
  t = t.replace(/Cannot be used on Fractured items\./gi, 'Fractured eşyalarda kullanılamaz.');
  t = t.replace(/Cannot apply to Maps\./gi, 'Haritalara uygulanamaz.');
  t = t.replace(/The maximum quality is 20%\./gi, 'Azami kalite %20’dir.');
  t = t.replace(/The maximum random quality is 29%\./gi, 'Azami rastgele kalite %29’dur.');
  t = t.replace(/Has greater effect on lower rarity Strongboxes\./gi, 'Daha düşük nadirlikteki Strongbox’larda daha büyük etkisi vardır.');
  t = t.replace(/May only be used once per Strongbox\./gi, 'Her Strongbox’ta yalnızca bir kez kullanılabilir.');
  t = t.replace(/Can only be used on items at or above maximum quality\./gi, 'Yalnızca azami kalitede veya üzerindeki eşyalarda kullanılabilir.');
  t = t.replace(/Can only apply to Skill Gems with fewer than (\d) Support Gem Sockets\./gi, 'Yalnızca $1’den az Destek Taşı Yuvası olan Beceri Taşlarına uygulanabilir.');
  t = t.replace(/The item's quality increases the chances of obtaining more links\./gi, 'Eşyanın kalitesi, daha fazla bağlantı elde etme şansını artırır.');
  t = t.replace(/You can then earn the Shaper's Orb again to reshape another map afterwards\./gi, 'Ardından başka bir haritayı yeniden şekillendirmek için Shaper’s Orb’u tekrar kazanabilirsin.');
  t = t.replace(/Cannot be used to split Influenced, Enchanted, Fractured, or Synthesised items\./gi, 'Influenced, Enchanted, Fractured veya Synthesised eşyaları bölmek için kullanılamaz.');
  t = t.replace(/Mirrored copies cannot be modified\./gi, 'Mirror’lanmış kopyalar değiştirilemez.');
  return t;
}
function applyTarget(g) {
  const M = {
    'a rare item': 'nadir bir eşyaya', 'a magic item': 'sihirli bir eşyaya', 'a normal item': 'normal bir eşyaya',
    'a normal or magic item': 'normal veya sihirli bir eşyaya', 'a magic or rare item': 'sihirli veya nadir bir eşyaya',
    'a Rare item': 'Nadir bir eşyaya', 'an item': 'bir eşyaya', 'another item': 'başka bir eşyaya',
    'a ring or amulet': 'bir Yüzük veya Kolyeye', 'a jewel': 'bir Jewel’a', 'a gem': 'bir taşa',
    'a skill gem': 'bir beceri taşına', 'a support gem': 'bir destek taşına', 'a Skill Gem': 'bir Beceri Taşına',
    'a map': 'bir haritaya', 'an armour': 'bir zırha', 'a Voidstone': 'bir Voidstone’a',
    'a Tablet': 'bir Tablet’e', 'a corrupted item': 'bozulmuş bir eşyaya', 'a corrupted gem': 'bozulmuş bir taşa',
    'a soul core': 'bir soul core’a', 'a unique item': 'eşsiz bir eşyaya', 'a Rare Time-Lost Jewel': 'Nadir bir Time-Lost Jewel’a',
    'a Rare Jewel': 'Nadir bir Jewel’a', 'a flask': 'bir şişeye', 'a Strongbox': 'bir Strongbox’a',
    'a wand, staff or sceptre': 'bir wand, staff veya sceptre’a', 'a martial weapon': 'bir savaş silahına',
    'a corrupted armour': 'bozulmuş bir zırha', 'a corrupted weapon': 'bozulmuş bir silaha',
    'a corrupted rare item': 'bozulmuş nadir bir eşyaya', 'a socketed item': 'soketli bir eşyaya',
    'a corrupted socketed item': 'bozulmuş soketli bir eşyaya', 'an unidentified item': 'tanımlanmamış bir eşyaya',
    'a high-level rare item with no influence': 'etkisi olmayan yüksek seviyeli nadir bir eşyaya',
    'an Anointed item': 'Anoint edilmiş bir eşyaya', 'an equipable non-unique item': 'kuşanılabilir eşsiz-olmayan bir eşyaya',
    'an item with at least two Influenced Modifiers': 'en az iki Influenced özelliği olan bir eşyaya',
    'a non-unique item': 'eşsiz-olmayan bir eşyaya', 'an applicable breach unique item': 'uygun bir breach eşsiz eşyasına',
    'a Strongbox': 'bir Strongbox’a', 'a Beast': 'bir Canavara', 'a ring or amulet': 'bir Yüzük veya Kolyeye',
    'a shaped map on the atlas': 'atlas’taki şekillendirilmiş bir haritaya', 'a Rare Time-Lost Jewel to apply it': 'Nadir bir Time-Lost Jewel’a'
  };
  if (M[g]) return M[g];
  let am = g.match(/^an applicable (.+?) unique item$/i);
  if (am) return `uygun bir ${am[1]} eşsiz eşyasına`;
  return g + '’ye';
}

// ===== üret =====
const bySrc = {};
const seen = new Set();
let done = 0;
for (const r of cur) {
  if (!r.desc_en || !r.desc_en.trim()) continue;
  if (seen.has(r.desc_en)) continue;
  seen.add(r.desc_en);
  try {
    const tr = translate(r.desc_en);
    if (tr && tr.trim()) { bySrc[r.desc_en] = tr2pct(tr); done++; }
  } catch (e) { /* atla */ }
}
const outPath = path.join(__dirname, 'currency-desc.tr.json');
// mevcut _comment'i koru
let header = { _comment: 'Currency aciklama ELLE TAM-CUMLE cevirileri (Opus, cumle-seviyesi). Anahtar: tam desc_en. Build yalniz okur, rebuild EZMEZ. Elle duzenlenebilir.' };
fs.writeFileSync(outPath, JSON.stringify({ ...header, ...bySrc }, null, 1) + '\n', 'utf8');
console.log('üretilen benzersiz desc çevirisi:', done, '->', outPath);
