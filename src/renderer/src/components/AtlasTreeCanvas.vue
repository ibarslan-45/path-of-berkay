<script setup lang="ts">
/**
 * AtlasTreeCanvas.vue — interaktif görsel ATLAS pasif ağacı (PoE 2).
 * PassiveTreeCanvas çekirdeğinden türetildi: Canvas 2D + zoom/pan + viewport
 * culling + ikon cache + hit-test + arama vurgusu. Kampanya ağacına özel
 * (sınıf portresi / ascendancy navigasyonu) KISIMLAR YOK — atlas ağacının kendi
 * merkezine fit olur. Veri: src/data/atlas-tree.json (kompakt). Tooltip metni
 * atlas.json (EN/TR) -> atlasById prop'undan. devicePixelRatio'ya duyarlı.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import treeData from '../../../data/atlas-tree.json'

interface AtlasLite {
  id: string
  en: string
  tr: string
  node_type: string | null
  stats_en: string[]
  stats_tr: string[]
}
const props = defineProps<{
  atlasById: Record<string, AtlasLite>
  isTr: boolean
}>()
const { t } = useI18n()

// --- veri yapıları ---
type CNode = [number, number, number, number, string | null, string | null]
const TREE = treeData as unknown as {
  bounds: [number, number, number, number]
  roots: number[]
  nodes: CNode[]
  edges: [number, number][]
  labels: Record<string, { en: string; tr: string }>
}
const nodeMap = new Map<number, CNode>()
for (const n of TREE.nodes) nodeMap.set(n[0], n)

// typeCode: 0 small,1 notable,2 keystone,3 jewel,5 root
const TYPE_R = [52, 84, 122, 70, 74, 116, 104]
const TYPE_FILL = ['#3a3324', '#2c2e36', '#3a3018', '#1d3330', '#2e2640', '#3a2c18', '#3a2c18']
const FRAME_COLOR = ['#6f5d3a', '#8a93a8', '#e7b478', '#3f8d80', '#a585c8', '#d8a45a', '#d8a45a']

// --- ikon cache (assets/atlas/*.png) ---
const iconModules = import.meta.glob('../../assets/atlas/*.png', {
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
    if (pid && props.atlasById[pid]) {
      const p = props.atlasById[pid]
      hay = (p.en + ' ' + p.tr + ' ' + p.stats_en.join(' ') + ' ' + p.stats_tr.join(' ')).toLowerCase()
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
    case 5: return tr ? 'Başlangıç' : 'Root'
    default: return tr ? 'Küçük' : 'Small'
  }
}
function buildTip(skill: number, sx: number, sy: number): void {
  const n = nodeMap.get(skill)
  if (!n) { tip.value = null; return }
  const pid = n[5]
  let name = ''
  let stats: string[] = []
  if (pid && props.atlasById[pid]) {
    const p = props.atlasById[pid]
    name = props.isTr ? p.tr || p.en : p.en || p.tr
    stats = props.isTr ? (p.stats_tr.length ? p.stats_tr : p.stats_en) : p.stats_en
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

  const [wMinX, wMinY] = screenToWorld(-80, -80)
  const [wMaxX, wMaxY] = screenToWorld(cssW + 80, cssH + 80)

  // --- edge'ler ---
  c.lineWidth = Math.max(0.6, 7 * cam.scale)
  for (const [a, b] of TREE.edges) {
    const na = nodeMap.get(a)
    const nb = nodeMap.get(b)
    if (!na || !nb) continue
    if ((na[1] < wMinX && nb[1] < wMinX) || (na[1] > wMaxX && nb[1] > wMaxX) ||
        (na[2] < wMinY && nb[2] < wMinY) || (na[2] > wMaxY && nb[2] > wMaxY)) continue
    const [ax, ay] = worldToScreen(na[1], na[2])
    const [bx, by] = worldToScreen(nb[1], nb[2])
    const lit = hasQ && mset.has(a) && mset.has(b)
    c.strokeStyle = lit ? 'rgba(231,180,120,0.55)' : hasQ ? 'rgba(80,65,40,0.18)' : 'rgba(90,74,46,0.42)'
    c.beginPath()
    c.moveTo(ax, ay)
    c.lineTo(bx, by)
    c.stroke()
  }

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
    const isMatch = hasQ && mset.has(n[0])
    const dim = hasQ && !isMatch
    c.globalAlpha = dim ? 0.16 : 1

    const r = Math.max(sr, 2)
    c.beginPath()
    c.arc(sx, sy, r, 0, Math.PI * 2)
    c.fillStyle = TYPE_FILL[code] ?? '#3a3324'
    c.fill()
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
    c.beginPath()
    c.arc(sx, sy, r, 0, Math.PI * 2)
    c.lineWidth = Math.max(1, r * (code >= 2 ? 0.14 : 0.1))
    c.strokeStyle = isHover ? '#ffffff' : isMatch ? '#ffe7c0' : (FRAME_COLOR[code] ?? '#6f5d3a')
    c.stroke()
    if (isMatch || isHover) {
      c.globalAlpha = 1
      c.beginPath()
      c.arc(sx, sy, r + Math.max(2, r * 0.25), 0, Math.PI * 2)
      c.lineWidth = isHover ? 2.5 : 2
      c.strokeStyle = isHover ? '#ffffff' : '#e7b478'
      c.stroke()
    }
  }
  c.globalAlpha = 1
}

// --- etkileşim ---
let dragging = false
let lastX = 0
let lastY = 0
function onMouseDown(e: MouseEvent): void {
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
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
function onMouseUp(): void { dragging = false }
function onMouseLeave(): void { dragging = false; hover.value = null; tip.value = null; requestDraw() }
function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const rect = canvas.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const [wx, wy] = screenToWorld(mx, my)
  const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
  cam.scale = Math.min(0.6, Math.max(fitScale * 0.5, cam.scale * factor))
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
  resetView()
  ro = new ResizeObserver(() => resize())
  ro.observe(wrap.value!)
})
onBeforeUnmount(() => { if (ro) ro.disconnect() })
</script>

<template>
  <div class="pv-tree">
    <div class="pv-toolbar">
      <input v-model="search" class="search pv-search" type="text" :placeholder="t('passiveTreeSearch')" />
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
