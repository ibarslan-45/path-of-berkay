/**
 * patch-glossaries.cjs — yarım kalan İngilizce çevirileri düzeltmek için
 * mods/uniques/atlas glossary'lerine eksik bağlaç/edat/kalıp + isim çevirileri
 * ekler. Mevcut anahtarlar EZİLMEZ (elle düzenlenebilir kalır); yalnız NAMED
 * override'lar/voice-line adları force-set edilir. auto:false mantığı: bu
 * eklenenler düz string map girdileridir, sonradan elle düzenlenebilir.
 *
 * Çalıştırma: node scripts/patch-glossaries.cjs
 * Sonra: npm run build:mods && build:passives && build:atlas && build:uniques
 */
const fs = require('fs');
const path = require('path');
const D = __dirname;
const read = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const write = (f, o) => fs.writeFileSync(path.join(D, f), JSON.stringify(o, null, 2) + '\n', 'utf8');

// yalnız eksikse ekle (mevcut elle çeviriyi koru)
function addMissing(target, additions) {
  let n = 0;
  for (const [k, v] of Object.entries(additions)) {
    if (!(k in target)) { target[k] = v; n++; }
  }
  return n;
}
// force (named override / voice-line): her zaman yaz
function force(target, additions) {
  let n = 0;
  for (const [k, v] of Object.entries(additions)) { target[k] = v; n++; }
  return n;
}

// ---- ortak fonksiyon kelimeleri (mods + passives + atlas paylaşır) ----
const FN_WORDS = {
  with: 'ile', while: 'iken', when: 'olduğunda', your: 'senin', you: 'sen',
  have: '', has: '', against: 'karşı', effect: 'etkisi', amount: 'miktarı',
  also: 'ayrıca', if: 'eğer', for: 'için', each: 'her', from: '', no: 'yok',
  type: 'türü', before: 'önce', being: 'olma', same: 'aynı', different: 'farklı',
  command: 'Komut', taking: 'alırken', started: 'başlamışsan', collected: 'topladıysan',
  holding: 'tutarken', missing: 'eksik', considered: 'sayılır', unreserved: 'rezervesiz',
  removed: 'kaldırılan', count: 'sayısı', than: '', which: '', been: '', near: 'yakın',
  nearby: 'yakındaki', this: 'bu', their: 'onların', them: 'onlara', they: 'onlar',
  the: '', into: '', onto: '', used: 'kullanılan', past: 'son', last: 'son',
  seconds: 'saniye', second: 'saniye', as: 'olarak', equal: 'eşit', during: 'sırasında',
  any: 'herhangi', explode: 'patlar', dealing: 'vererek', killed: 'öldürülen',
  kill: 'öldür', destroyed: 'yok edilir', penetrate: 'deler', inflict: 'uygular',
  taken: 'alınan', target: 'hedef', targets: 'hedefler', limit: 'Sınır', hidden: 'Gizli',
  augment: 'Geliştirme', bonus: 'Bonusu', socket: 'Yuva', sockets: 'Yuvalar',
  recently: 'son zamanlarda', sprinting: 'Sprint yaparken', whenever: 'her seferinde',
  buffs: "Buff'lar", warcries: 'Savaş Çığlıkları', low: 'Düşük', full: 'Tam',
  immobilised: 'Hareketsiz', broken: 'Kırılmış', fully: 'Tamamen', threshold: 'Eşik',
  instead: 'yerine', below: 'altında', above: 'üstünde', contributes: 'katkı sağlar',
  applies: 'uygular', become: 'olur', becomes: 'olur', magnitude: 'Şiddeti',
  modifiers: "Modifier'lar", modifier: 'Modifier', though: 'gibi', was: '', were: '',
  reload: 'şarjör doldurma', dealt: 'verdiğin', would: '', stack: 'yığın',
  stacks: 'yığın', otherwise: 'aksi halde', based: 'göre', current: 'mevcut',
  player: 'oyuncu', total: 'Toplam', extra: 'Ekstra', additional: 'ek',
  // ---- 2. tur eklenenler ----
  and: 've', "you've": '', a: '', by: 'tarafından', leech: 'Emme',
  overflow: 'taşar', aggravated: 'Şiddetlendirilmiş', excess: 'Fazla',
  applied: 'uygulanır', anymore: 'artık', scare: 'korkut', wake: 'uyan',
  shaded: 'gölgeli', places: 'yerler', things: 'şeyler', compartments: 'bölmeler',
  relays: 'aktarıcılar', leader: 'lider', face: 'yüzleş', demons: 'iblisler',
  recover: 'Yenile',
  // ---- 3. tur: kalan bare edatlar (kalıplar tutmazsa fallback) ----
  on: '', standing: 'durarak', equipped: 'kuşanılan', ground: 'Zemin',
  consuming: 'tüketince', pinning: 'sabitleme', those: 'o', aggravate: 'şiddetlendir',
  // ---- 4. tur: kopula + kalan fiil/sıfatlar ----
  are: '', is: '', were: '', yours: 'seninki', times: 'kez', twice: 'iki kez',
  happen: 'gerçekleşir', happens: 'gerçekleşir', granted: 'verilir', consumed: 'tüketilen',
  reflected: 'yansıtılır', culled: 'infaz edilir', blind: 'Kör', zero: 'sıfır',
  hitting: 'Vuran', unlucky: 'Şanssız', repeat: 'Tekrarlanır', repeatable: 'Tekrarlanabilir',
  back: 'geri', lost: 'kaybedilir', gained: 'kazanılan', copy: 'Kopyala', next: 'sonraki',
  way: 'şekilde', deeds: 'işler', radius: 'yarıçap', conquered: 'Fethedilmiş', granted2: ''
};

// ---- ortak doğal phrase'ler (uzun-önce; motor sıralar) ----
const FN_PHRASES = {
  'with Warcries': 'Savaş Çığlıklarıyla',
  'with Spells': 'Büyülerle',
  'with Attacks': 'Saldırılarla',
  'with this Weapon': 'bu Silahla',
  'while on Low Life': 'Düşük Canda iken',
  'while on Low Mana': 'Düşük Manada iken',
  'while you are missing Runic Ward': "Runic Ward'un eksikken",
  'while Sprinting': 'Sprint yaparken',
  'against Marked Enemies': 'İşaretli Düşmanlara karşı',
  'against Immobilised Enemies': 'Hareketsiz Düşmanlara karşı',
  'effect of Arcane Surge on you': 'üzerindeki Arcane Surge etkisi',
  'effect of Archon Buffs on you': 'üzerindeki Archon Buff etkisi',
  'effect of Fully Broken Armour': 'Tamamen Kırılmış Zırh etkisi',
  'Effect of your Mark Skills': 'Mark Yeteneklerinin Etkisi',
  'Magnitude of Ailments you inflict': 'uyguladığın Rahatsızlıkların Şiddeti',
  'Magnitude of Bleeding you inflict': 'uyguladığın Kanamanın Şiddeti',
  'Magnitude of Poison you inflict': 'uyguladığın Zehrin Şiddeti',
  'on you': 'üzerinde',
  'you inflict': 'uyguladığın',
  'you kill': 'öldürdüğün',
  'from Hits': 'Vuruşlardan',
  'for each': 'her bir',
  'in the last': 'son',
  'in the past': 'son',
  'during any Flask Effect': 'herhangi bir Şişe Etkisi sırasında',
  // ---- 2. tur ----
  'on them': 'onlarda',
  'based on': 'şuna göre',
  'on Full Life': 'Tam Canda',
  'while on Full Life': 'Tam Canda iken',
  'is Aggravated': 'Şiddetlendirilir',
  'can Overflow maximum Life': 'maksimum Canı aşabilir',
  'before being Hit by': 'şunun tarafından Vurulmadan önce:',
  'Excess Life Recovery Leech is applied to Energy Shield':
    'Fazla Can Yenileme Emmesi Enerji Kalkanına uygulanır',
  // ---- 3. tur: "on X" edat kalıpları (İngilizce kaynak; çeviriden önce çalışır) ----
  'on Enemies': 'Düşmanlarda',
  'on Targets': 'hedeflerde',
  'on Killing Enemies': 'Düşman öldürünce',
  'on Killing': 'öldürünce',
  'on Melee Hit': 'Yakın Dövüş Vuruşunda',
  'on Critical Hit': 'Kritik Vuruşta',
  'on Full Energy Shield': 'Tam Enerji Kalkanı varken',
  'on Low Energy Shield': 'Düşük Enerji Kalkanında',
  'on Full Mana': 'Tam Manada',
  'on Frozen Ground': 'Donmuş Zeminde',
  'on Chilled Ground': 'Üşümüş Zeminde',
  'on Burning Ground': 'Yanan Zeminde',
  'on Equipped Armour': 'Kuşanılan Zırhta',
  'on Equipped Shield': 'Kuşanılan Kalkanda',
  'on Consuming': 'tüketince',
  'on Pinning an Enemy': 'bir Düşmanı sabitleyince',
  'on Melee Kill': 'Yakın Dövüşte öldürünce'
};

// mods PATTERNS: kelime-sırası için tam-satır doğal çeviri (phrase'ten öncelikli)
const MODS_PATTERNS = {
  '#% increased effect of Arcane Surge on you': 'üzerindeki Arcane Surge etkisi #% artar',
  '#% increased effect of Archon Buffs on you': 'üzerindeki Archon Buff etkisi #% artar',
  '#% increased effect of Fully Broken Armour': 'Tamamen Kırılmış Zırh etkisi #% artar',
  '#% increased Effect of your Mark Skills': 'Mark Yeteneklerinin Etkisi #% artar',
  '#% increased Magnitude of Ailments you inflict': 'uyguladığın Rahatsızlıkların Şiddeti #% artar',
  '#% increased Magnitude of Bleeding you inflict': 'uyguladığın Kanamanın Şiddeti #% artar',
  '#% increased Magnitude of Poison you inflict': 'uyguladığın Zehrin Şiddeti #% artar',
  '#% increased Damage with Warcries': 'Savaş Çığlıklarıyla #% artan Hasar',
  '#% increased Critical Hit Chance against Marked Enemies':
    'İşaretli Düşmanlara karşı #% artan Kritik Vuruş Şansı',
  '#% increased Attack Damage while on Low Life': 'Düşük Canda iken #% artan Saldırı Hasarı',
  '#% increased Movement Speed while Sprinting': 'Sprint yaparken #% artan Hareket Hızı',
  '#% more Attack damage while on Low Mana': 'Düşük Manada iken #% daha fazla Saldırı Hasarı',
  '#% less damage taken while on Low Life': 'Düşük Canda iken #% daha az alınan Hasar'
};

// ===================== MODS =====================
{
  const g = read('tr-mods-glossary.json');
  g.words ??= {}; g.phrases ??= {}; g.patterns ??= {};
  const w = addMissing(g.words, FN_WORDS);
  const p = addMissing(g.phrases, FN_PHRASES);
  const pt = addMissing(g.patterns, MODS_PATTERNS);
  write('tr-mods-glossary.json', g);
  console.log(`mods: +${w} kelime, +${p} phrase, +${pt} pattern`);
}

// ===================== UNIQUES =====================
{
  const g = read('tr-uniques-glossary.json');
  g.modWords ??= {}; g.modPhrases ??= {}; g.modOverrides ??= {};
  const w = addMissing(g.modWords, FN_WORDS);
  const p = addMissing(g.modPhrases, FN_PHRASES);
  // kullanıcı örnekleri + karmaşık koşullu satırlar (tam satır override)
  const o = force(g.modOverrides, {
    'Skills have +1 to Limit': 'Yeteneklerin +1 Sınırı vardır',
    'Can have 3 additional Instilled Modifiers': "3 ek Instilled Modifier'a sahip olabilir",
    'You have no Critical Damage Bonus': 'Kritik Hasar Bonusun yoktur',
    'Has 2 Augment Sockets (Hidden)': '2 Geliştirme Yuvası vardır (Gizli)',
    'You are considered on Low Life while at 75% of maximum Life or below instead':
      "Bunun yerine, maksimum Canının %75'inde veya altındayken Düşük Can'da sayılırsın",
    'This item gains bonuses from Socketed Items as though it was a Body Armour':
      'Bu eşya, Soketlenmiş Eşyalardan bir Gövde Zırhıymış gibi bonuslar kazanır',
    '(50-100)% increased effect of Socketed Augment Items':
      '(50-100)% Soketlenmiş Geliştirme Eşyalarının etkisi artar',
    'Recover (20-30)% Missing Life before being Hit by Enemy':
      "Bir Düşman tarafından Vurulmadan önce eksik Canının (20-30)%'ini Yenile",
    'Excess Life Recovery Leech is applied to Energy Shield':
      'Fazla Can Yenileme Emmesi Enerji Kalkanına uygulanır',
    // (Hidden) parantezi build'de korunur -> tam satır override şart
    'Has 4 Augment Sockets (Hidden)': '4 Gizli Geliştirme Yuvası vardır',
    'Has 6 Augment Sockets (Hidden)': '6 Gizli Geliştirme Yuvası vardır',
    "Minions' Resistances are equal to yours": 'Uşakların Dirençleri seninkilere eşittir',
    'You are Blind': 'Körsün',
    'On-Kill Effects happen twice': 'Öldürme Etkileri iki kez gerçekleşir',
    'Magnitudes of Curses you inflict are zero': 'Uyguladığın Lanetlerin Şiddeti sıfırdır',
    'Curses you inflict are reflected back to you': 'Uyguladığın Lanetler sana geri yansıtılır',
    'Enemies are Culled on Block': 'Düşmanlar Blokta infaz edilir',
    'Heavy Stuns Enemies that are on Full Life': 'Tam Candaki Düşmanları Ağır Sersemletir',
    'Damage of Enemies Hitting you is Unlucky while you are on Low Life':
      'Düşük Canda iken sana Vuran Düşmanların Hasarı Şanssızdır',
    'Repeatable Attacks with this Bow Repeat +2 times if no enemies are in your Presence':
      'Mevcudiyetinde Düşman yoksa bu Yay ile Tekrarlanabilir Saldırılar +2 kez Tekrarlanır',
    '50% of Charges consumed by used Charms are granted to your Life Flasks':
      'Kullanılan Tılsımlarca tüketilen Şarjların %50\'si Can Şişelerine verilir',
    '50% of Charges consumed by used Life Flasks are granted to your Charms':
      'Kullanılan Can Şişelerince tüketilen Şarjların %50\'si Tılsımlara verilir',
    'Deal 4% increased Damage with Hits to Rare or Unique Enemies for each second they\'ve ever been in your Presence, up to a maximum of 200%':
      'Mevcudiyetinde bulundukları her saniye için Nadir veya Eşsiz Düşmanlara Vuruşlarla %4 artan Hasar verir, en fazla %200\'e kadar'
  });
  write('tr-uniques-glossary.json', g);
  console.log(`uniques: +${w} kelime, +${p} phrase, ${o} override (named)`);
}

// ===================== ATLAS (voice-line / node adları) =====================
{
  const g = read('tr-atlas-glossary.json');
  g.names ??= {};
  const o = force(g.names, {
    'Balance of Power': 'Güç Dengesi',
    'Are you sure you want to do that?': 'Bunu yapmak istediğine emin misin?',
    'Bring Me Your Leader': 'Bana Liderinizi Getirin',
    "Cataclysm's Wake": 'Felaketin Ardı',
    'Come on! Face me!': 'Hadi! Yüzleş benimle!',
    'Here for the Same Reason': 'Aynı Sebeple Buradayız',
    'Hidden Compartments': 'Gizli Bölmeler',
    'Hidden Scars': 'Gizli Yaralar',
    'Hidden Things in Shaded Places': 'Gölgeli Yerlerdeki Gizli Şeyler',
    "Is that the best you've got?!": 'Elinden gelen bu mu?!',
    'Is this about me... or you?': 'Mesele ben miyim... yoksa sen mi?',
    'Power Relays': 'Güç Aktarıcıları',
    'These demons are all your own...': 'Bu iblislerin hepsi senin eserin...',
    "You can't just wake up from this one.": 'Bundan öylece uyanamazsın.',
    "You can't scare me anymore!": 'Beni artık korkutamazsın!'
  });
  write('tr-atlas-glossary.json', g);
  console.log(`atlas: ${o} node adı (voice-line/çevrilebilir)`);
}
console.log('PATCH tamam.');
