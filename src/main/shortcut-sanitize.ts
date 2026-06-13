// shortcut-sanitize.ts — global kısayol accel doğrulama (saf, test edilebilir).
//
// 0.17.4 KÖK NEDEN: kayıtlı priceCheck.shortcut "CommandOrControl+C" idi → uygulama açılışta Ctrl+C'yi
// GLOBAL bağlıyor → sistem/oyun KOPYALAMASI engelleniyor (sentetik ^c bile yutuluyor). Ctrl+C (ve diğer
// kopya/yapıştır/kes) ASLA global bağlanmamalı; verilirse güvenli fallback'e düşülür.

// OS/uygulama-kritik kombinasyonlar — global olarak ELE GEÇİRİLMEMELİ (kopyalama/yapıştırma serbest kalsın).
export const FORBIDDEN_ACCELS = new Set(['ctrl+c', 'ctrl+v', 'ctrl+x'])

/** Bir accel'i normalize et: küçük harf, boşluksuz, Command/Control/Cmd/⌘ → ctrl. */
export function normAccel(accel: string): string {
  return (accel || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/commandorcontrol|command|control|cmd|⌘/g, 'ctrl')
}

/** accel yasaklı (Ctrl+C vb.) ise veya boşsa fallback döner; aksi halde accel'i aynen döner. */
export function sanitizeShortcut(accel: string | undefined, fallback: string): string {
  const a = (accel || '').trim()
  if (!a) return fallback
  return FORBIDDEN_ACCELS.has(normAccel(a)) ? fallback : a
}

/** Bir accel global bağlanabilir mi (yasaklı değil + boş değil)? */
export function isBindableShortcut(accel: string | undefined): boolean {
  const a = (accel || '').trim()
  return !!a && !FORBIDDEN_ACCELS.has(normAccel(a))
}
