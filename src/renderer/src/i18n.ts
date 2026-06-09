import { createI18n } from 'vue-i18n'
import en from '../../i18n/en.json'
import tr from '../../i18n/tr.json'

// Arayuz metinleri src/i18n altindaki JSON dosyalarindan gelir.
// Baslangic dili Turkce; eksik anahtar olursa Ingilizceye duser.
export const i18n = createI18n({
  legacy: false,
  locale: 'tr',
  fallbackLocale: 'en',
  messages: { en, tr }
})
