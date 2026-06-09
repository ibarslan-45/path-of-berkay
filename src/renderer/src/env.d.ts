/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

// `window.api` tipi src/preload/index.d.ts içindeki WindowControlsAPI ile tanımlıdır
// (tüm IPC köprüleri: leveling/build/price/settings/...). Burada DAR bir tip tekrar
// tanımlanmaz — yoksa tam tiple çakışıp `window.api.X` hatalarına yol açar.
