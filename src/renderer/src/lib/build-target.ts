// build-target.ts — takip edilen build'in TEK kaynağı (Bug #1 kalıcılık).
//
// Ana uygulama (BuildView + GameBuildView + CraftSimulator + LevelingView) aynı renderer olduğu
// için bu module-level reaktif state ortaktır → SEKME değişince (BuildView v-if ile unmount olsa
// bile) build + seçili variant KORUNUR. Ayrıca tam snapshot userData'ya yazılır → program kapanıp
// açılınca da (reconstruction/.build dahil, PoB KODU olmasa bile) geri yüklenir.
//
// Overlay (#price/#danger) ayrı renderer → ensureBuild() ile kendi kopyasını yükler.
import { ref } from 'vue'
import { importPob, type PobBuild, type PobItem } from './pob'
import type { CraftSeedItem } from './build-craft-seed'

/** Build'in nereden geldiği — kalıcı snapshot'ta saklanır. */
export type ImportedFrom = 'pob' | 'maxroll' | 'mobalytics' | 'dotbuild' | null

/** Build görünümüyle birlikte taşınan yardımcı bilgiler (notlar/atıf/sınıf). */
export interface BuildMeta {
  importedFrom: ImportedFrom
  code: string // ham PoB kodu ('' → reconstruction/.build)
  info: { className: string; ascendClassName: string; level: number } | null
  notes: string
  authorName: string
  authorUrl: string
  sourceUrl: string
  sourceSite: string
}
function emptyMeta(): BuildMeta {
  return { importedFrom: null, code: '', info: null, notes: '', authorName: '', authorUrl: '', sourceUrl: '', sourceSite: '' }
}

const buildRef = ref<PobBuild | null>(null)
/** Reaktif: takip edilen RAW build (BuildView ↔ GameBuildView ↔ CraftSimulator ↔ LevelingView paylaşır). */
export const trackedBuild = buildRef
/** Paylaşılan/kalıcı seçili aşama (variant) indexi — list & game görünümü ORTAK kullanır. */
export const trackedStage = ref(0)
/**
 * Kullanıcı aşamayı/variant'ı ELLE seçti mi? (#6) true ise karakter-seviyesi otomatik takibi (syncStageToLevel)
 * seçimi EZMEZ → sekme değişimi / seviye değişimi sonrası seçili variant KORUNUR. Kalıcı (snapshot meta).
 * Yeni build içe aktarınca false (varsayılan: seviyeye göre otomatik takip).
 */
export const stagePinned = ref(false)
/** Build meta (importedFrom/info/notes/atıf). */
export const trackedMeta = ref<BuildMeta>(emptyMeta())
/** Karşılaştırma için seçili slot adı (BuildView'da eşyaya tıklayınca da set edilir). */
export const selectedSlot = ref<string>('')

// --- Part 5: "Craft'la" tohumu (build eşyası → Craft Simülatörü) ---
// GameBuildView/BuildView bir eşya için requestCraft() çağırır → App mode'u Craft'a geçirir →
// CraftSimulator mount/aktif olunca consumeCraftSeed() ile tohumu okur (SOL=taban, SAĞ=hedef modlar).
export const craftSeedItem = ref<CraftSeedItem | null>(null)
export function requestCraft(item: CraftSeedItem): void {
  craftSeedItem.value = item
}
/** Bekleyen craft tohumunu al + temizle (yalnız bir kez uygulansın). */
export function consumeCraftSeed(): CraftSeedItem | null {
  const v = craftSeedItem.value
  craftSeedItem.value = null
  return v
}

let inited = false
let restored = false

/** Bu oturumda bellekte zaten bir build var mı (BuildView remount'ta yeniden init etmesin). */
export function hasSession(): boolean {
  return restored && !!buildRef.value
}

function clearSlotIfGone(b: PobBuild | null): void {
  if (b && selectedSlot.value && !b.slots[selectedSlot.value]) selectedSlot.value = ''
}

/**
 * Bir build'i takip et + KALICI yap. raw + meta + aşama hem bellekte tutulur hem userData'ya yazılır.
 * BuildView her başarılı içe aktarmada (PoB kodu / Mobalytics / Maxroll / .build) bunu çağırır.
 */
export function commitBuild(raw: PobBuild, meta: BuildMeta, stage: number): void {
  inited = true
  restored = true
  buildRef.value = raw
  trackedMeta.value = meta
  trackedStage.value = stage
  stagePinned.value = false // yeni build → seviyeye göre otomatik takip (kullanıcı henüz elle seçmedi)
  clearSlotIfGone(raw)
  try {
    // meta düz (plain) klon olmalı — reactive proxy contextBridge'den geçmez (sandbox/contextIsolation).
    window.api?.build?.setFull?.({ code: meta.code || '', built: JSON.stringify(raw), meta: JSON.parse(JSON.stringify({ ...meta, stage, stagePinned: false })) })
  } catch {
    /* serialize/persist hatası build'i bozmasın */
  }
}

/** Snapshot meta'yı (aşama + pin durumu dahil) kalıcı yaz. */
function persistFull(stage: number): void {
  if (!buildRef.value) return
  try {
    window.api?.build?.setFull?.({
      code: trackedMeta.value.code || '',
      built: JSON.stringify(buildRef.value),
      meta: JSON.parse(JSON.stringify({ ...trackedMeta.value, stage, stagePinned: stagePinned.value }))
    })
  } catch {
    /* yoksay */
  }
}

/** Seçili aşamayı değiştir + kalıcı yaz (variant da restart sonrası korunur). Pin durumunu KORUR
 *  (otomatik seviye senkronu bunu kullanır → pin'i bozmaz). */
export function setStage(stage: number): void {
  trackedStage.value = stage
  persistFull(stage)
}

/** Kullanıcı aşamayı ELLE seçti (#6): pin'le → seviye otomatik takibi artık ezmez; kalıcı. */
export function pinStage(stage: number): void {
  stagePinned.value = true
  trackedStage.value = stage
  persistFull(stage)
}

/** Build'i temizle (bellek + kalıcı). */
export function clearBuild(): void {
  buildRef.value = null
  trackedMeta.value = emptyMeta()
  trackedStage.value = 0
  stagePinned.value = false
  selectedSlot.value = ''
  restored = true
  window.api?.build?.set('') // setFull yerine: kod boşalt + snapshot temizle
}

/**
 * Kalıcı snapshot'tan build + meta + aşamayı geri yükle (BuildView mount / overlay).
 * built (reconstruction JSON) varsa onu kullan; yoksa ham PoB kodunu importPob ile çöz.
 * Bir kez çalışır; sonraki çağrılar bellekteki state'i döner.
 */
export async function ensureBuild(): Promise<PobBuild | null> {
  if (inited) return buildRef.value
  inited = true
  const full = (await window.api?.build?.getFull?.().catch(() => null)) ?? null
  if (full) {
    const meta = (full.meta && typeof full.meta === 'object' ? full.meta : {}) as Partial<BuildMeta> & { stage?: number; stagePinned?: boolean }
    try {
      if (full.built) {
        buildRef.value = JSON.parse(full.built) as PobBuild
      } else if (full.code) {
        buildRef.value = importPob(full.code)
      }
    } catch {
      buildRef.value = null
    }
    if (buildRef.value) {
      trackedMeta.value = {
        ...emptyMeta(),
        ...meta,
        code: full.code || meta.code || ''
      }
      trackedStage.value = typeof meta.stage === 'number' ? meta.stage : 0
      stagePinned.value = meta.stagePinned === true // kullanıcı önceden variant pinlediyse koru
    }
  } else {
    // eski sürüm uyumu: yalnız ham kod varsa
    const code = (await window.api?.build?.get()) ?? ''
    if (code) {
      try {
        buildRef.value = importPob(code)
        trackedMeta.value = { ...emptyMeta(), importedFrom: 'pob', code }
      } catch {
        buildRef.value = null
      }
    }
  }
  restored = true
  // başka pencerede (oyun-içi/Build) kod değişince yansıt
  window.api?.build?.onChanged((c: string) => {
    if (!c) {
      // temizlendi
      if (trackedMeta.value.code) {
        buildRef.value = null
        trackedMeta.value = emptyMeta()
        trackedStage.value = 0
        stagePinned.value = false
      }
      return
    }
    if (c === trackedMeta.value.code) return
    try {
      buildRef.value = importPob(c)
      trackedMeta.value = { ...emptyMeta(), importedFrom: 'pob', code: c }
      trackedStage.value = 0
      stagePinned.value = false
    } catch {
      /* yoksay */
    }
    clearSlotIfGone(buildRef.value)
  })
  return buildRef.value
}

export function currentBuild(): PobBuild | null {
  return buildRef.value
}

/** Geriye uyum: yalnız raw paylaş (kalıcılık yok). Yeni kod commitBuild kullanmalı. */
export function setReconstructedBuild(b: PobBuild | null): void {
  inited = true
  restored = true
  buildRef.value = b
  clearSlotIfGone(b)
}

/** Bir slot'taki eşya (yoksa null). */
export function slotItem(build: PobBuild, slot: string): PobItem | null {
  const id = build.slots[slot]
  if (!id) return null
  return build.items.find((i) => i.id === id) ?? null
}

const NON_GEAR = /flask|jewel|socket|swap/i
/** İçinde eşya olan EKİPMAN slot'ları (flask/jewel/socket/swap hariç). */
export function gearSlots(build: PobBuild): Array<{ slot: string; item: PobItem }> {
  const out: Array<{ slot: string; item: PobItem }> = []
  for (const slot of Object.keys(build.slots)) {
    if (NON_GEAR.test(slot)) continue
    const item = slotItem(build, slot)
    if (item) out.push({ slot, item })
  }
  return out
}

// item_class / base → büyük olasılıkla uyan slot (overlay otomatik seçimi için)
const CLASS_SLOT: Array<[RegExp, string]> = [
  [/body armour|garb|plate|vest|robe/i, 'Body Armour'],
  [/helmet|crown|mask|helm|hood/i, 'Helmet'],
  [/glove|gauntlet|mitt/i, 'Gloves'],
  [/boot|greave|sandal/i, 'Boots'],
  [/belt|sash|girdle/i, 'Belt'],
  [/amulet|necklace/i, 'Amulet'],
  [/ring|loop|coil|knuckle/i, 'Ring 1'],
  [/quiver/i, 'Quiver'],
  [/shield|buckler/i, 'Weapon 2'],
  [/wand|staff|sceptre|bow|crossbow|sword|axe|mace|dagger|claw|spear|flail|focus/i, 'Weapon 1']
]
/** Aday eşyanın item-class/taban metnine göre en olası gear slot'u (yoksa ''). */
export function guessSlot(build: PobBuild, itemClassOrBase: string): string {
  const s = itemClassOrBase || ''
  for (const [re, slot] of CLASS_SLOT) {
    if (re.test(s) && build.slots[slot]) return slot
  }
  const gs = gearSlots(build)
  return gs.length ? gs[0].slot : ''
}
