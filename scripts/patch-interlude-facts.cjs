/**
 * patch-interlude-facts.cjs — Interlude 2 (Çalınan Barya) ve Interlude 3
 * (Doryani'nin Tedbiri) bölgelerinin olgularını maxroll-area-facts.json'a ekler.
 * Kaynak: PoE205CW.docx (Maxroll). Cümleler KOPYA DEĞİL — olgulardan Opus özgün
 * TR+EN. Mevcut anahtarlar EZİLMEZ (yalnız eksikler eklenir). Sonra: build:areas.
 */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'maxroll-area-facts.json');
const facts = JSON.parse(fs.readFileSync(P, 'utf8'));

const add = {
  'The Khari Bazaar': {
    has_waypoint: true,
    npcs: ['The Hooded One', 'Sekhema Asala', 'Zarka', 'Risu'],
    steps_en: [
      'The hub town of Interlude 2, offering a Waypoint, stash, Healing Well and four NPCs.',
      "Speak with the Hooded One and Sekhema Asala to learn about her sacred mission.",
      'Stock up, then take any exit to begin at the Khari Crossing.'
    ],
    steps_tr: [
      '2. Ara Bölüm\'ün merkez kasabası; Yol Taşı, sandık, Şifa Kuyusu ve dört NPC sunar.',
      'Hooded One ve Sekhema Asala ile konuşarak onun kutsal görevini öğren.',
      'İhtiyaçlarını tamamla, sonra herhangi bir çıkıştan Khari Geçidi\'ne yönel.'
    ]
  },
  'The Khari Crossing': {
    has_waypoint: false,
    boss_en: ['Akthi, the Final Sting', 'Anundr, the Sandworm'],
    boss_tr: ['Akthi, Son İğne', 'Anundr, Kum Solucanı'],
    quest_en: 'Recruit the Maraketh; Clearing the Way',
    quest_tr: "Maraketh'i Saf'a Kat; Yolu Açmak",
    reward_en: '2 Weapon Set Passive Skill Points (optional)',
    reward_tr: '2 Silah Seti Pasif Beceri Puanı (opsiyonel)',
    poi: ['Molten Shrine', 'Travelling Merchant'],
    steps_en: [
      "Head north to the Molten Shrine secret: clear the Skullmaw Stairway and consume the Molten One's Gift for +5% maximum Life.",
      'Find the checkpointed arena and defeat the duo Akthi, the Final Sting and Anundr, the Sandworm.',
      'Return to town and speak to Risu for 2 Weapon Set Passive Skill Points.',
      'Grab the Waypoints in the connected Pools of Khatal and Galai Gates to save backtracking later.'
    ],
    steps_tr: [
      "Kuzeye gidip Erimiş Mabet sırrına ulaş: Skullmaw Merdiveni'ni temizle ve Molten One's Gift'i kullanarak +%5 azami Can kazan.",
      'Kontrol noktalı arenayı bul ve ikili Akthi (Son İğne) ile Anundr\'u (Kum Solucanı) alt et.',
      'Kasabaya dönüp Risu ile konuşarak 2 Silah Seti Pasif Beceri Puanı al.',
      "Sonradan tekrar dolaşmamak için bağlı Khatal Havuzları ve Galai Kapıları'nın Yol Taşlarını al."
    ]
  },
  'Pools of Khatal': {
    has_waypoint: true,
    boss_en: [], boss_tr: [],
    quest_en: 'Recruit the Maraketh',
    quest_tr: "Maraketh'i Saf'a Kat",
    steps_en: ['A ruined, barren stretch with no bosses or points of interest — simply press on to the Sel Khari Sanctuary.'],
    steps_tr: ['Boss\'u ve ilgi noktası olmayan, harap ve çorak bir geçit — doğruca Sel Khari Tapınağı\'na ilerle.']
  },
  'Sel Khari Sanctuary ': {
    has_waypoint: true,
    boss_en: ['Elzarah, the Cobra Lord'],
    boss_tr: ['Elzarah, Kobra Lordu'],
    quest_en: 'Recruit the Maraketh',
    quest_tr: "Maraketh'i Saf'a Kat",
    reward_en: 'Two of: Rare Ring, Rare Amulet, Rare Jewel (Two Wishes, optional)',
    reward_tr: 'Şunlardan ikisi: Nadir Yüzük, Nadir Amulet, Nadir Jewel (Two Wishes, opsiyonel)',
    poi: ['Two Wishes'],
    steps_en: [
      'The sanctuary has been overrun by the Serpent Clan; hunt down their leader Elzarah, the Cobra Lord (physical/fire/chaos).',
      "Optionally find Yoon's and Rangeen's Barya and place them on the opposing altars to wish for two of three rare rewards.",
      'After Elzarah falls, speak to Sekhema Asala and move on to the Galai Gates.'
    ],
    steps_tr: [
      'Tapınak Yılan Klanı tarafından istila edilmiş; liderleri Elzarah\'ı (Kobra Lordu — fiziksel/ateş/kaos) avla.',
      "İstersen Yoon's ve Rangeen's Barya'yı bulup karşılıklı sunaklara koy ve üç nadir ödülden ikisini dile.",
      'Elzarah düşünce Sekhema Asala ile konuş ve Galai Kapıları\'na geç.'
    ]
  },
  'The Galai Gates': {
    has_waypoint: true,
    boss_en: ['Vornas, the Fell Flame'],
    boss_tr: ['Vornas, Habis Alev'],
    quest_en: 'Recruit the Maraketh',
    quest_tr: "Maraketh'i Saf'a Kat",
    steps_en: [
      'These gates open toward the long-lost fifth river; search for the entrance to Qimah.',
      'The way is guarded by Vornas, the Fell Flame (physical/lightning) — defeat it and enter Qimah.'
    ],
    steps_tr: [
      'Bu kapılar çoktan kaybolmuş beşinci nehre açılır; Qimah\'a giden girişi ara.',
      'Yol, Vornas (Habis Alev — fiziksel/yıldırım) tarafından korunur; onu alt edip Qimah\'a gir.'
    ]
  },
  'Qimah': {
    has_waypoint: true,
    boss_en: [], boss_tr: [],
    quest_en: 'Recruit the Maraketh',
    quest_tr: "Maraketh'i Saf'a Kat",
    poi: ["Orbala's Pillar"],
    steps_en: [
      'Once a Maraketh home, Qimah is now consumed by corruption; find the ceremony site, speak to Jado and head to the Qimah Reservoir.',
      "Visit Orbala's Pillar to choose a swappable permanent buff (movement speed, attributes, resistances and more); return anytime to change it.",
      'The zone is very dense — consider farming experience and gear here before the challenging Reservoir boss.'
    ],
    steps_tr: [
      'Bir zamanlar Maraketh yurdu olan Qimah artık yozlaşmayla dolu; tören alanını bul, Jado ile konuş ve Qimah Sarnıcı\'na yönel.',
      "Orbala's Pillar'ı ziyaret ederek değiştirilebilir kalıcı bir güçlendirme seç (hareket hızı, nitelikler, dirençler ve daha fazlası); istediğin zaman dönüp değiştir.",
      'Bölge çok yoğun — zorlu Sarnıç boss\'undan önce burada tecrübe ve teçhizat farm etmeyi düşün.'
    ]
  },
  'Qimah Reservoir': {
    has_waypoint: true,
    boss_en: ['Azmadi, the Faridun Prince'],
    boss_tr: ['Azmadi, Faridun Prensi'],
    quest_en: 'Recruit the Maraketh',
    quest_tr: "Maraketh'i Saf'a Kat",
    poi: ['Sacred Wells'],
    steps_en: [
      'The final zone of Interlude 2; find and defeat Azmadi, the Faridun Prince to disrupt his ritual.',
      'Azmadi chains long combos — either burst him as a glass cannon, or patiently dodge-roll until a damage window opens.',
      'Optionally fill the two Sacred Wells with Vials of Sacred Water (from local monsters) for a random currency item.',
      'After the kill, interact with the Grand Barya, speak to Jado and Sekhema Asala, then see the Hooded One in town to reach the final interlude.'
    ],
    steps_tr: [
      '2. Ara Bölüm\'ün son bölgesi; Azmadi\'yi (Faridun Prensi) bulup alt ederek ayinini boz.',
      'Azmadi uzun komboları zincirler — ya cam-top build ile hızlıca erit ya da bir hasar penceresi açılana dek sabırla dodge-roll yap.',
      'İstersen iki Kutsal Kuyu\'yu, bölgedeki yaratıklardan düşen Kutsal Su Şişeleriyle doldurarak rastgele bir materyal kazan.',
      'Öldürdükten sonra Grand Barya ile etkileş, Jado ve Sekhema Asala ile konuş, sonra kasabada Hooded One ile son ara bölüme geç.'
    ]
  },
  'The Glade': {
    has_waypoint: true,
    npcs: ['The Hooded One', 'Doryani', 'Delwyn', 'Hilda'],
    steps_en: [
      'The hub town of Interlude 3, with a Waypoint, stash, Healing Well and four NPCs.',
      'Speak to the Hooded One, Doryani, Hilda and Delwyn to learn about the Ancient Vaal Descendants.',
      'Take the exit to the Ashen Forest.'
    ],
    steps_tr: [
      '3. Ara Bölüm\'ün merkez kasabası; Yol Taşı, sandık, Şifa Kuyusu ve dört NPC içerir.',
      'Hooded One, Doryani, Hilda ve Delwyn ile konuşarak Antik Vaal Torunları hakkında bilgi edin.',
      'Kül Ormanı\'na (Ashen Forest) çıkıştan ilerle.'
    ]
  },
  'Ashen Forest': {
    has_waypoint: true,
    boss_en: [], boss_tr: [],
    quest_en: 'Recruit the Vaal',
    quest_tr: "Vaal'ı Saf'a Kat",
    reward_en: 'Uncut Skill Gem (Level 14, from the Ancient Monument)',
    reward_tr: 'Kesilmemiş Beceri Taşı (Sv. 14, Ancient Monument\'ten)',
    poi: ['Ancient Monument'],
    steps_en: [
      'A former Azmeri hunting ground now overrun by fungal zombies, wasps and spiders; find the way to the Kriar Village.',
      'Optionally interact with the Ancient Monument for an Uncut Skill Gem (Level 14).'
    ],
    steps_tr: [
      'Eskiden Azmeri av sahası olan, şimdi mantar zombiler, eşekarıları ve örümceklerle dolu bir orman; Kriar Köyü\'ne giden yolu bul.',
      'İstersen Ancient Monument ile etkileşerek bir Kesilmemiş Beceri Taşı (Sv. 14) al.'
    ]
  },
  'Kriar Village': {
    has_waypoint: true,
    boss_en: ['Lythara, the Wayward Spear'],
    boss_tr: ['Lythara, Serseri Mızrak'],
    quest_en: 'Recruit the Vaal',
    quest_tr: "Vaal'ı Saf'a Kat",
    reward_en: '+40 to Maximum Spirit and an Uncut Spirit Gem (Level 14, Gemcrust Skull)',
    reward_tr: '+40 Azami Ruh ve Kesilmemiş Ruh Taşı (Sv. 14, Gemcrust Skull)',
    poi: ['Roving Wisps'],
    steps_en: [
      "A narrow linear zone; as in Act 1's Hunting Grounds, chase the early Azmeri wisp into a rare for extra loot.",
      'Make any upgrades, then face Lythara, the Wayward Spear (all elements + chaos) — a damage check who grows stronger as wisps empower her.',
      'After Lythara, consume the Gemcrust Skull for +40 maximum Spirit and an Uncut Spirit Gem (Level 14), then head to the Glacial Tarn.'
    ],
    steps_tr: [
      "Dar, doğrusal bir bölge; Act 1'deki Hunting Grounds gibi, başlangıçtaki Azmeri wisp'i bir nadire sürerek ekstra ganimet için güçlendir.",
      'Yükseltmelerini yap, sonra Lythara (Serseri Mızrak — tüm element + kaos) ile yüzleş; bir hasar kontrolüdür ve wisp\'ler onu güçlendirdikçe zorlaşır.',
      'Lythara\'dan sonra Gemcrust Skull\'u kullanarak +40 azami Ruh ve bir Kesilmemiş Ruh Taşı (Sv. 14) kazan, sonra Glacial Tarn\'a yönel.'
    ]
  },
  'Glacial Tarn': {
    has_waypoint: true,
    boss_en: ['Rakkar, the Frozen Talon'],
    boss_tr: ['Rakkar, Donmuş Pençe'],
    quest_en: 'Recruit the Vaal',
    quest_tr: "Vaal'ı Saf'a Kat",
    steps_en: [
      'At the foot of the Kriar Peaks; find the Howling Caves, defeat the Yeti inside, then return here to continue the ascent.',
      'Rakkar, the Frozen Talon (physical/cold) guards the path to the Kriar Peaks — defeat it and press on.'
    ],
    steps_tr: [
      'Kriar Zirveleri\'nin eteğinde; Howling Caves\'i bul, içindeki Yeti\'yi yen, sonra buraya dönerek tırmanışa devam et.',
      'Rakkar (Donmuş Pençe — fiziksel/soğuk), Kriar Zirveleri\'ne giden yolu korur; onu alt edip ilerle.'
    ]
  },
  'Howling Caves': {
    has_waypoint: true,
    boss_en: ['The Abominable Yeti'],
    boss_tr: ['İğrenç Yeti'],
    quest_en: 'Howling Winds',
    quest_tr: 'Uluyan Rüzgârlar',
    reward_en: '2 Weapon Set Passive Skill Points (optional)',
    reward_tr: '2 Silah Seti Pasif Beceri Puanı (opsiyonel)',
    steps_en: [
      "An icy indoor cavern of brine maidens, frost wraiths and wolves; seek out the Abominable Yeti (physical/cold), akin to Act 3's Mighty Silverfist.",
      'Use timely dodge rolls to avoid lethal hits; after the kill, loot the Icy Tusks and see Hilda in town for 2 Weapon Set Passive Skill Points.'
    ],
    steps_tr: [
      "Brine maiden, frost wraith ve kurtlarla dolu buzlu bir iç mağara; Act 3'teki Mighty Silverfist'e benzeyen İğrenç Yeti'yi (fiziksel/soğuk) bul.",
      'Ölümcül vuruşlardan kaçınmak için zamanında dodge-roll kullan; öldürünce Icy Tusks\'ı al ve kasabada Hilda ile konuşarak 2 Silah Seti Pasif Beceri Puanı kazan.'
    ]
  },
  'Kriar Peaks': {
    has_waypoint: true,
    boss_en: [], boss_tr: [],
    npcs: ['Elder Madox'],
    quest_en: 'Recruit the Vaal',
    quest_tr: "Vaal'ı Saf'a Kat",
    reward_en: 'One free Unique item (from Elder Madox)',
    reward_tr: 'Ücretsiz bir Eşsiz eşya (Elder Madox\'tan)',
    steps_en: [
      'A narrow linear climb with no boss; ascend to the summit and take the platform down into the Etched Ravine.',
      'Along the way, find Elder Madox gazing off the mountainside; speak to him for one free Unique item (check trade values if unsure which to pick).'
    ],
    steps_tr: [
      'Boss\'u olmayan dar, doğrusal bir tırmanış; zirveye çık ve platformla Etched Ravine\'e in.',
      'Yol boyunca dağ yamacından uzağa bakan Elder Madox\'u bul; onunla konuşarak ücretsiz bir Eşsiz eşya al (hangisini seçeceğinden emin değilsen takas değerlerine bak).'
    ]
  },
  'Etched Ravine': {
    has_waypoint: true,
    boss_en: ['Stormgore, the Guardian'],
    boss_tr: ['Stormgore, Muhafız'],
    quest_en: 'Recruit the Vaal',
    quest_tr: "Vaal'ı Saf'a Kat",
    steps_en: [
      'A linear gorge carved into the mountain by the Architect of Expansion; find the entrance to the Cuachic Vault.',
      "It is guarded by Stormgore, the Guardian (physical/lightning), akin to Act 3's Blackjaw — dodge-roll his slams and lightning, then enter the Vault."
    ],
    steps_tr: [
      'Architect of Expansion tarafından dağa oyulmuş doğrusal bir vadi; Cuachic Vault\'a giden girişi bul.',
      "Giriş, Act 3'teki Blackjaw'a benzeyen Stormgore (Muhafız — fiziksel/yıldırım) tarafından korunur; yer vuruşlarından ve yıldırımlarından dodge-roll ile kaçıp Vault'a gir."
    ]
  },
  'The Cuachic Vault': {
    has_waypoint: true,
    boss_en: ['Zelina, Blood Priestess', 'Zolin, Blood Priest'],
    boss_tr: ['Zelina, Kan Rahibesi', 'Zolin, Kan Rahibi'],
    quest_en: 'Recruit the Vaal',
    quest_tr: "Vaal'ı Saf'a Kat",
    steps_en: [
      'Home of the Ancient Vaal Descendants; deliver your message to Zolin, Blood Priest and Zelina, Blood Priestess.',
      'They reject it, so settle it in battle — the two (physical/cold) are relatively manageable compared to earlier bosses.',
      'Afterwards summon and speak to Doryani, then return to Act 4: Kingsmarch and see the Hooded One for 2 Weapon Set Passive Skill Points before travelling to Oriath.'
    ],
    steps_tr: [
      'Antik Vaal Torunları\'nın yurdu; mesajını Zolin (Kan Rahibi) ve Zelina\'ya (Kan Rahibesi) ilet.',
      'Mesajı reddederler; bu yüzden işi dövüşle çöz — ikisi (fiziksel/soğuk) önceki boss\'lara kıyasla görece kolaydır.',
      'Sonra Doryani\'yi çağırıp konuş, ardından Act 4: Kingsmarch\'a dönüp Oriath\'a gitmeden önce Hooded One ile konuşarak 2 Silah Seti Pasif Beceri Puanı al.'
    ]
  }
};

let added = 0;
for (const [k, v] of Object.entries(add)) {
  if (!(k in facts)) { facts[k] = v; added++; }
  else console.log('  zaten var (atlandı):', k);
}
fs.writeFileSync(P, JSON.stringify(facts, null, 1) + '\n', 'utf8');
console.log(`Interlude 2/3 olgusu eklendi: ${added}/${Object.keys(add).length}`);
