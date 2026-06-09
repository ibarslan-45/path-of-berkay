// Uygulama-içi iletişim bilgileri — TEK kaynak (ADIM D).
// Burayı düzenle; Ayarlar/onboarding/sohbet botu otomatik bu değerleri gösterir.
// Sürüm BURADA tutulmaz (package.json + app.getVersion() → IPC ile gelir).
export const CONTACT = {
  discord: 'panars',
  email: 'pathofberkay@gmail.com',
  site: 'https://pathofberkay.netlify.app' // boşsa gösterilmez
} as const

export type Contact = typeof CONTACT
