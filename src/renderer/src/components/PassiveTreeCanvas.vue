<script setup lang="ts">
/**
 * PassiveTreeCanvas.vue — interaktif görsel pasif ağaç (PoE 2).
 * Canvas 2D + zoom/pan + viewport culling + ikon cache + hit-test + arama vurgusu
 * + sınıf-merkez. Veri: src/data/passive-tree.json (kompakt). Tooltip metni
 * passives.json (EN/TR) -> passivesById prop'undan. devicePixelRatio'ya duyarlı.
 *
 * PoE 2 SINIF KURALI: classStarts yalnız 8 PoE 2 sınıfı içerir (build aşamasında
 * filtrelendi); PoE 1 başlangıç-node adları gösterilmez.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import treeData from '../../../data/passive-tree.json'

interface PassiveLite {
  id: string
  en: string
  tr: string
  node_type: string
  stats_en: string[]
  stats_tr: string[]
  count: number
}
const props = defineProps<{
  passivesById: Record<string, PassiveLite>
  isTr: boolean
  /** Build vurgulama: bu GGG node id'leri "ayrılmış" gösterilir, diğerleri soluk. */
  allocated?: number[]
  /** Aşama-progresif: bu node'lar "bu aşamada YENİ eklendi" → amber vurgu (allocated alt-kümesi). */
  highlight?: number[]
  /** #3: "elde ettim" işaretli node'lar → yeşil halka (allocated içinden tıklanarak işaretlenir). */
  done?: number[]
  /** Tıkla-işaretle açık mı (allocated bir node'a tıklayınca toggle-node emit edilir). */
  markable?: boolean
}>()
const emit = defineEmits<{ (e: 'toggle-node', id: number): void }>()
const { t } = useI18n()

// Build vurgu seti (verilince ayrılmış node'lar teal vurgulanır)
const allocSet = computed<Set<number>>(() => new Set(props.allocated ?? []))
// "Bu aşamada yeni eklenen" node'lar (amber halka ile öne çıkar)
const hlSet = computed<Set<number>>(() => new Set(props.highlight ?? []))
// #3: "elde ettim" işaretli node'lar (yeşil halka)
const doneSet = computed<Set<number>>(() => new Set(props.done ?? []))

// --- veri yapıları ---
type CNode = [number, number, number, number, string | null, string | null]
interface ClassStart { en: string; tr: string; img: string; skill: number; x: number; y: number }
interface AscInfo { id: string; en: string; tr: string; classEn: string; classTr: string; cx: number; cy: number }
const TREE = treeData as unknown as {
  bounds: [number, number, number, number]
  classStarts: ClassStart[]
  ascInfo: AscInfo[]
  nodes: CNode[]
  edges: [number, number][]
  labels: Record<string, { en: string; tr: string }>
  ascTip: Record<string, { en: string; tr: string; se: string[]; st: string[] }>
}
const nodeMap = new Map<number, CNode>()
for (const n of TREE.nodes) nodeMap.set(n[0], n)

// tipe göre dünya-yarıçapı, dolgu rengi ve ÇERÇEVE (halka) rengi.
// index: 0 small,1 notable,2 keystone,3 jewel,4 mastery,5 classStart,6 ascStart
const TYPE_R = [52, 84, 122, 70, 74, 116, 104]
const TYPE_FILL = ['#3a3324', '#2c2e36', '#3a3018', '#1d3330', '#2e2640', '#3a2c18', '#3a2c18']
// keystone altın, notable mavi-gri, small sade; jewel teal, mastery mor, start altın
const FRAME_COLOR = ['#6f5d3a', '#8a93a8', '#e7b478', '#3f8d80', '#a585c8', '#e7b478', '#d8a45a']

// --- ikon cache (assets/passives/*.png) ---
const iconModules = import.meta.glob('../../assets/passives/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const iconUrlMap: Record<string, string> = {}
for (const p in iconModules) {
  const base = (p.split('/').pop() as string).replace(/\.png$/i, '')
  iconUrlMap[base.toLowerCase()] = iconModules[p]
}
const imgCache = new Map<string, HTMLImageElement>()
function getIcon(base: string | null): HTMLImageElement | null {
  if (!base) return null
  const key = base.toLowerCase()
  const url = iconUrlMap[key]
  if (!url) return null
  let img = imgCache.get(key)
  if (!img) {
    img = new Image()
    img.src = url
    img.onload = () => requestDraw()
    imgCache.set(key, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

// sınıf portreleri (assets/classes/<class>.png)
const classModules = import.meta.glob('../../assets/classes/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const classUrlMap: Record<string, string> = {}
for (const p in classModules) {
  const base = (p.split('/').pop() as string).replace(/\.png$/i, '')
  classUrlMap[base.toLowerCase()] = classModules[p]
}
const portraitCache = new Map<string, HTMLImageElement>()
function getPortrait(img: string): HTMLImageElement | null {
  const url = classUrlMap[img.toLowerCase()]
  if (!url) return null
  let im = portraitCache.get(img)
  if (!im) {
    im = new Image()
    im.src = url
    im.onload = () => requestDraw()
    portraitCache.set(img, im)
  }
  return im.complete && im.naturalWidth > 0 ? im : null
}
// start skill -> tek temsilci classStart (paylaşılan konumda 1 portre)
const startBySkill = new Map<number, ClassStart>()
for (const cs of TREE.classStarts) if (!startBySkill.has(cs.skill)) startBySkill.set(cs.skill, cs)

// --- kamera ---
const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let cssW = 1000
let cssH = 700
let dpr = 1
const cam = { cx: 0, cy: 0, scale: 0.02 }
let fitScale = 0.02

function worldToScreen(wx: number, wy: number): [number, number] {
  return [(wx - cam.cx) * cam.scale + cssW / 2, (wy - cam.cy) * cam.scale + cssH / 2]
}
function screenToWorld(sx: number, sy: number): [number, number] {
  return [(sx - cssW / 2) / cam.scale + cam.cx, (sy - cssH / 2) / cam.scale + cam.cy]
}
function computeFit(): void {
  const [minX, minY, maxX, maxY] = TREE.bounds
  const w = maxX - minX
  const h = maxY - minY
  fitScale = Math.min(cssW / w, cssH / h) * 0.92
}
function resetView(): void {
  const [minX, minY, maxX, maxY] = TREE.bounds
  cam.cx = (minX + maxX) / 2
  cam.cy = (minY + maxY) / 2
  cam.scale = fitScale
  selectedClass.value = ''
  selectedAsc.value = ''
  requestDraw()
}

// --- arama vurgusu ---
const search = ref('')
const matched = computed<Set<number>>(() => {
  const q = search.value.trim().toLocaleLowerCase('en')
  const set = new Set<number>()
  if (!q) return set
  for (const n of TREE.nodes) {
    const skill = n[0]
    const pid = n[5]
    let hay = ''
    if (pid && props.passivesById[pid]) {
      const p = props.passivesById[pid]
      hay = (p.en + ' ' + p.tr + ' ' + p.stats_en.join(' ') + ' ' + p.stats_tr.join(' ')).toLowerCase()
    } else if (TREE.ascTip[String(skill)]) {
      const a = TREE.ascTip[String(skill)]
      hay = (a.en + ' ' + a.tr + ' ' + a.se.join(' ') + ' ' + a.st.join(' ')).toLowerCase()
    } else {
      const l = TREE.labels[String(skill)]
      if (l) hay = (l.en + ' ' + l.tr).toLowerCase()
    }
    if (hay.includes(q)) set.add(skill)
  }
  return set
})
watch(matched, () => requestDraw())
watch(() => props.isTr, () => requestDraw())
watch(allocSet, () => { fitToAllocated(); requestDraw() })
watch(hlSet, () => requestDraw())
watch(doneSet, () => requestDraw())

/** Kamerayı ayrılmış node'ların etrafına sığdır (build önizleme). */
function fitToAllocated(): void {
  const set = allocSet.value
  if (!set.size) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of TREE.nodes) {
    if (!set.has(n[0])) continue
    if (n[1] < minX) minX = n[1]
    if (n[1] > maxX) maxX = n[1]
    if (n[2] < minY) minY = n[2]
    if (n[2] > maxY) maxY = n[2]
  }
  if (minX === Infinity) return
  const w = Math.max(maxX - minX, 800)
  const h = Math.max(maxY - minY, 800)
  cam.cx = (minX + maxX) / 2
  cam.cy = (minY + maxY) / 2
  cam.scale = Math.min(0.6, Math.max(fitScale * 0.5, Math.min(cssW / (w * 1.35), cssH / (h * 1.35))))
}

// --- sınıf seçimi (8 PoE 2 sınıfı) ---
const selectedClass = ref('')
const selectedAsc = ref('')
function onSelectClass(): void {
  selectedAsc.value = ''
  const cs = TREE.classStarts.find((c) => c.en === selectedClass.value)
  if (!cs) {
    requestDraw()
    return
  }
  cam.cx = cs.x
  cam.cy = cs.y
  cam.scale = Math.min(0.18, Math.max(0.14, fitScale * 6))
  requestDraw()
}
function classLabel(c: { en: string; tr: string }): string {
  return props.isTr ? c.tr : c.en
}
// seçili sınıfın yükselişleri (yoksa hepsi)
const ascOptions = computed<AscInfo[]>(() => {
  const cls = selectedClass.value
  return cls ? TREE.ascInfo.filter((a) => a.classEn === cls) : TREE.ascInfo
})
function onSelectAsc(): void {
  const a = TREE.ascInfo.find((x) => x.id === selectedAsc.value)
  if (!a) { requestDraw(); return }
  cam.cx = a.cx
  cam.cy = a.cy
  cam.scale = 0.16
  requestDraw()
}
function ascLabel(a: AscInfo): string {
  return (props.isTr ? a.classTr + ' — ' + a.tr : a.classEn + ' — ' + a.en)
}

// --- hover / tooltip ---
interface VisN { skill: number; sx: number; sy: number; sr: number }
let visible: VisN[] = []
const hover = ref<number | null>(null)
const tip = ref<{ x: number; y: number; name: string; type: string; stats: string[] } | null>(null)

function typeLabel(code: number): string {
  const tr = props.isTr
  switch (code) {
    case 2: return tr ? 'Kilittaşı' : 'Keystone'
    case 1: return tr ? 'Önemli' : 'Notable'
    case 3: return tr ? 'Mücevher Yuvası' : 'Jewel Socket'
    case 4: return tr ? 'Ustalık' : 'Mastery'
    case 5: return tr ? 'Sınıf Başlangıcı' : 'Class Start'
    case 6: return tr ? 'Yükseliş' : 'Ascendancy'
    default: return tr ? 'Küçük' : 'Small'
  }
}
function buildTip(skill: number, sx: number, sy: number): void {
  const n = nodeMap.get(skill)
  if (!n) { tip.value = null; return }
  const pid = n[5]
  let name = ''
  let stats: string[] = []
  if (pid && props.passivesById[pid]) {
    const p = props.passivesById[pid]
    name = props.isTr ? p.tr || p.en : p.en || p.tr
    stats = props.isTr ? (p.stats_tr.length ? p.stats_tr : p.stats_en) : p.stats_en
  } else if (TREE.ascTip[String(skill)]) {
    const a = TREE.ascTip[String(skill)]
    name = props.isTr ? a.tr || a.en : a.en || a.tr
    stats = props.isTr ? (a.st.length ? a.st : a.se) : a.se
  } else {
    const l = TREE.labels[String(skill)]
    name = l ? (props.isTr ? l.tr : l.en) : '(node)'
  }
  tip.value = { x: sx, y: sy, name, type: typeLabel(n[3]), stats }
}

// --- çizim (render-on-demand + rAF) ---
let drawQueued = false
function requestDraw(): void {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(draw)
}
function draw(): void {
  drawQueued = false
  if (!ctx) return
  const c = ctx
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, cssW, cssH)

  const hasQ = matched.value.size > 0
  const mset = matched.value
  const aset = allocSet.value
  const hset = hlSet.value
  const dset = doneSet.value
  const allocActive = aset.size > 0

  // görünür dünya dikdörtgeni (kenar payı)
  const [wMinX, wMinY] = screenToWorld(-80, -80)
  const [wMaxX, wMaxY] = screenToWorld(cssW + 80, cssH + 80)

  // --- edge'ler ---
  c.lineWidth = Math.max(0.6, 7 * cam.scale)
  for (const [a, b] of TREE.edges) {
    const na = nodeMap.get(a)
    const nb = nodeMap.get(b)
    if (!na || !nb) continue
    // bbox cull
    if ((na[1] < wMinX && nb[1] < wMinX) || (na[1] > wMaxX && nb[1] > wMaxX) ||
        (na[2] < wMinY && nb[2] < wMinY) || (na[2] > wMaxY && nb[2] > wMaxY)) continue
    const [ax, ay] = worldToScreen(na[1], na[2])
    const [bx, by] = worldToScreen(nb[1], nb[2])
    const lit = allocActive ? aset.has(a) && aset.has(b) : hasQ && mset.has(a) && mset.has(b)
    c.strokeStyle = allocActive
      ? (lit ? 'rgba(95,208,191,0.7)' : 'rgba(70,90,86,0.13)')
      : lit ? 'rgba(231,180,120,0.55)' : hasQ ? 'rgba(80,65,40,0.18)' : 'rgba(90,74,46,0.42)'
    c.beginPath()
    c.moveTo(ax, ay)
    c.lineTo(bx, by)
    c.stroke()
  }

  // --- sınıf illüstrasyonları (start node'un dibinde) — node'ların ALTINA çiz ---
  // Dairesel maskeli tam-gövde görseller; köşeleri ŞEFFAF -> çerçeve yok.
  // Seçili sınıf vurgulu (tam opak + yumuşak altın hâle); öntanımlı/diğerleri soluk.
  const selSkill = selectedClass.value
    ? TREE.classStarts.find((c) => c.en === selectedClass.value)?.skill ?? -1
    : -1
  for (const cs of startBySkill.values()) {
    if (cs.x < wMinX || cs.x > wMaxX || cs.y < wMinY || cs.y > wMaxY) continue
    const isSel = cs.skill === selSkill
    // seçili sınıf bu start'ı paylaşıyorsa onun görselini kullan (Huntress/Sorceress)
    const useImg = selectedClass.value
      ? (TREE.classStarts.find((c) => c.en === selectedClass.value && c.skill === cs.skill)?.img ?? cs.img)
      : cs.img
    const por = getPortrait(useImg)
    if (!por) continue
    const sr = (TYPE_R[5] ?? 116) * cam.scale
    if (sr < 7) continue // çok uzakta illüstrasyon çizme
    const [sx, sy] = worldToScreen(cs.x, cs.y)
    const pw = sr * (isSel ? 6.4 : 3.6)
    const ph = pw * (por.naturalHeight / por.naturalWidth || 1)
    const px = sx - pw / 2
    const py = sy + sr * 0.25 // node'un dibine, hafif alt-hizalı (node üstte kalır)
    // seçili görselin arkasına yumuşak altın hâle (vurgulama)
    if (isSel) {
      const gy = py + ph * 0.5
      const grd = c.createRadialGradient(sx, gy, sr * 0.5, sx, gy, pw * 0.5)
      grd.addColorStop(0, 'rgba(231,180,120,0.22)')
      grd.addColorStop(1, 'rgba(231,180,120,0)')
      c.globalAlpha = 1
      c.fillStyle = grd
      c.beginPath()
      c.arc(sx, gy, pw * 0.5, 0, Math.PI * 2)
      c.fill()
    }
    // alfa: seçim yokken hafif soluk; seçiliyken tam; seçili değilken çok soluk
    c.globalAlpha = selectedClass.value ? (isSel ? 0.96 : 0.14) : 0.42
    c.drawImage(por, px, py, pw, ph)
  }
  c.globalAlpha = 1

  // --- node'lar: YUVARLAK çerçeve + içinde ikon (daireye kırpılı) ---
  visible = []
  for (const n of TREE.nodes) {
    const wx = n[1]
    const wy = n[2]
    if (wx < wMinX || wx > wMaxX || wy < wMinY || wy > wMaxY) continue
    const code = n[3]
    const wr = TYPE_R[code] ?? 52
    const sr = wr * cam.scale
    const [sx, sy] = worldToScreen(wx, wy)
    visible.push({ skill: n[0], sx, sy, sr: Math.max(sr, 6) })

    const isHover = hover.value === n[0]
    const isAlloc = allocActive && aset.has(n[0])
    const isNew = isAlloc && hset.has(n[0]) // bu aşamada yeni eklenen → amber
    const isMatch = !allocActive && hasQ && mset.has(n[0])
    const dim = allocActive ? !isAlloc : hasQ && !isMatch
    c.globalAlpha = dim ? 0.14 : 1

    const r = Math.max(sr, 2)
    // dolgu (taban daire)
    c.beginPath()
    c.arc(sx, sy, r, 0, Math.PI * 2)
    c.fillStyle = TYPE_FILL[code] ?? '#3a3324'
    c.fill()
    // ikon — daireye kırpılı
    const img = sr >= 6 ? getIcon(n[4]) : null
    if (img) {
      c.save()
      c.beginPath()
      c.arc(sx, sy, r - Math.max(1, r * 0.12), 0, Math.PI * 2)
      c.clip()
      const d = r * 2
      c.drawImage(img, sx - r, sy - r, d, d)
      c.restore()
    }
    // çerçeve halkası (tipe göre renk)
    c.beginPath()
    c.arc(sx, sy, r, 0, Math.PI * 2)
    c.lineWidth = Math.max(1, r * (code >= 2 && code <= 6 ? 0.14 : 0.1))
    c.strokeStyle = isHover ? '#ffffff' : isNew ? '#ffcf6a' : isAlloc ? '#7fe6d4' : isMatch ? '#ffe7c0' : (FRAME_COLOR[code] ?? '#6f5d3a')
    c.stroke()
    // ayrılmış/eşleşme/hover dış parıltı halkası (yeni eklenen = amber, daha kalın)
    if (isAlloc || isMatch || isHover) {
      c.globalAlpha = 1
      c.beginPath()
      c.arc(sx, sy, r + Math.max(2, r * (isNew ? 0.35 : 0.25)), 0, Math.PI * 2)
      c.lineWidth = isHover ? 2.5 : isNew ? 3 : 2
      c.strokeStyle = isHover ? '#ffffff' : isNew ? '#ffcf6a' : isAlloc ? '#5fd0bf' : '#e7b478'
      c.stroke()
    }
    // #3: "elde ettim" işaretli node → belirgin YEŞİL halka
    if (isAlloc && dset.has(n[0])) {
      c.globalAlpha = 1
      c.beginPath()
      c.arc(sx, sy, r + Math.max(3, r * 0.42), 0, Math.PI * 2)
      c.lineWidth = 3
      c.strokeStyle = '#6fdf5a'
      c.stroke()
    }
  }
  c.globalAlpha = 1
}

// --- etkileşim ---
let dragging = false
let lastX = 0
let lastY = 0
let downX = 0
let downY = 0
function onMouseDown(e: MouseEvent): void {
  dragging = true
  lastX = downX = e.clientX
  lastY = downY = e.clientY
}
function onMouseMove(e: MouseEvent): void {
  const rect = canvas.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  if (dragging) {
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    cam.cx -= dx / cam.scale
    cam.cy -= dy / cam.scale
    lastX = e.clientX
    lastY = e.clientY
    requestDraw()
    return
  }
  // hit-test (görünür node'lar, en yakın)
  let best: VisN | null = null
  let bestD = Infinity
  for (const v of visible) {
    const d = (v.sx - mx) ** 2 + (v.sy - my) ** 2
    if (d <= v.sr * v.sr && d < bestD) { best = v; bestD = d }
  }
  if (best) {
    if (hover.value !== best.skill) { hover.value = best.skill; requestDraw() }
    buildTip(best.skill, best.sx, best.sy)
  } else if (hover.value !== null) {
    hover.value = null
    tip.value = null
    requestDraw()
  }
}
function onMouseUp(e: MouseEvent): void {
  dragging = false
  // #3: küçük hareket (sürükleme değil) + ayrılmış bir node üzerindeyse "elde ettim" toggle
  if (!props.markable) return
  const dist = Math.hypot(e.clientX - downX, e.clientY - downY)
  if (dist < 5 && hover.value != null && allocSet.value.has(hover.value)) {
    emit('toggle-node', hover.value)
  }
}
function onMouseLeave(): void { dragging = false; hover.value = null; tip.value = null; requestDraw() }
function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const rect = canvas.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const [wx, wy] = screenToWorld(mx, my)
  const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
  cam.scale = Math.min(0.6, Math.max(fitScale * 0.5, cam.scale * factor))
  // imlecin altındaki dünya noktası sabit kalsın
  cam.cx = wx - (mx - cssW / 2) / cam.scale
  cam.cy = wy - (my - cssH / 2) / cam.scale
  requestDraw()
}

// --- boyut / yaşam döngüsü ---
let ro: ResizeObserver | null = null
function resize(): void {
  if (!wrap.value || !canvas.value) return
  cssW = wrap.value.clientWidth || 1000
  cssH = wrap.value.clientHeight || 700
  dpr = window.devicePixelRatio || 1
  canvas.value.width = Math.round(cssW * dpr)
  canvas.value.height = Math.round(cssH * dpr)
  canvas.value.style.width = cssW + 'px'
  canvas.value.style.height = cssH + 'px'
  computeFit()
  requestDraw()
}
onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  resize()
  if (allocSet.value.size) fitToAllocated()
  else resetView()
  ro = new ResizeObserver(() => resize())
  ro.observe(wrap.value!)
})
onBeforeUnmount(() => { if (ro) ro.disconnect() })
</script>

<template>
  <div class="pv-tree">
    <div class="pv-toolbar">
      <input v-model="search" class="search pv-search" type="text" :placeholder="t('passiveTreeSearch')" />
      <label class="pv-class">
        <span class="pv-class-lbl">{{ t('passiveTreeClass') }}</span>
        <select v-model="selectedClass" class="class-filter" @change="onSelectClass">
          <option value="">{{ t('passiveTreeAllClasses') }}</option>
          <option v-for="c in TREE.classStarts" :key="c.en" :value="c.en">{{ classLabel(c) }}</option>
        </select>
      </label>
      <label class="pv-class">
        <span class="pv-class-lbl">{{ t('passiveTreeAsc') }}</span>
        <select v-model="selectedAsc" class="class-filter" @change="onSelectAsc">
          <option value="">{{ t('passiveTreeAscPick') }}</option>
          <option v-for="a in ascOptions" :key="a.id" :value="a.id">{{ ascLabel(a) }}</option>
        </select>
      </label>
      <button class="pv-reset" @click="resetView">{{ t('passiveTreeReset') }}</button>
      <span class="pv-hint">{{ t('passiveTreeHint') }}</span>
    </div>
    <div ref="wrap" class="pv-canvas-wrap">
      <canvas
        ref="canvas"
        class="pv-canvas"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseLeave"
        @wheel="onWheel"
      ></canvas>
      <!-- hover tooltip (oyun temalı) -->
      <div
        v-if="tip"
        class="pv-tip"
        :style="{ left: Math.min(tip.x + 18, cssW - 280) + 'px', top: Math.min(tip.y + 12, cssH - 60) + 'px' }"
      >
        <div class="pv-tip-name">{{ tip.name }}</div>
        <div class="pv-tip-type">{{ tip.type }}</div>
        <ul v-if="tip.stats.length" class="pv-tip-stats">
          <li v-for="(s, i) in tip.stats" :key="i">{{ s }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.pv-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: var(--bg-panel-hi);
  border-bottom: 1px solid var(--frame-brown);
}
.pv-search {
  width: 260px;
  flex: none;
}
.pv-class {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pv-class-lbl {
  font-size: var(--fs-small);
  color: var(--text-muted);
}
.pv-reset {
  font-family: var(--font-serif);
  font-size: var(--fs-small);
  color: var(--text-default);
  background: var(--bg-panel);
  border: 1px solid var(--frame-brown);
  padding: 4px 10px;
  cursor: pointer;
}
.pv-reset:hover {
  border-color: var(--gold-line);
  color: var(--gold-title);
}
.pv-hint {
  font-size: var(--fs-small);
  color: var(--text-muted);
  margin-left: auto;
}
.pv-canvas-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(120, 92, 44, 0.08) 0%, rgba(0, 0, 0, 0) 60%),
    var(--bg-app);
}
.pv-canvas {
  display: block;
  cursor: grab;
}
.pv-canvas:active {
  cursor: grabbing;
}
/* hover tooltip: oyun temalı koyu taş + altın kenar */
.pv-tip {
  position: absolute;
  z-index: 5;
  max-width: 270px;
  pointer-events: none;
  background: var(--bg-tooltip);
  border: 1px solid var(--metal-edge);
  box-shadow: var(--shadow);
  padding: 7px 10px;
}
.pv-tip-name {
  font-size: var(--fs-body);
  color: var(--gold-title);
  font-variant: small-caps;
  letter-spacing: 0.03em;
}
.pv-tip-type {
  font-size: var(--fs-small);
  color: var(--text-muted);
  margin-bottom: 3px;
}
.pv-tip-stats {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
.pv-tip-stats li {
  font-size: var(--fs-small);
  color: var(--text-default);
  line-height: 1.35;
}
</style>
