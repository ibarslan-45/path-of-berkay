import { createApp } from 'vue'
import App from './App.vue'
import OverlayTracker from './components/OverlayTracker.vue'
import PriceOverlay from './components/PriceOverlay.vue'
import DangerOverlay from './components/DangerOverlay.vue'
import { i18n } from './i18n'
import '../styles/tokens.css'

// hash yönlendirme: #overlay → leveling tracker · #price → fiyat paneli ·
//   #danger → tehlike kontrolü paneli · diğer → tüm uygulama
const hash = window.location.hash
const root =
  hash === '#overlay'
    ? OverlayTracker
    : hash === '#price'
      ? PriceOverlay
      : hash === '#danger'
        ? DangerOverlay
        : App
createApp(root).use(i18n).mount('#app')
