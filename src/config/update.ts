// Otomatik güncelleme yapılandırması (ADIM C) — GitHub Releases provider.
// Feed, package.json build.publish (github: ibarslan-45/path-of-berkay) ile BUILD zamanı
// app-update.yml'ye gömülür. electron-updater bunu kullanır → runtime'da OVERRIDE ETMEYİZ.
//   Yayın akışı: sürümü yükselt → tag vX.Y.Z push → GitHub Actions kaynaktan derler +
//   latest.yml + .exe + .blockmap + portable + SHA-256'yı AYNI repo'nun Releases'ine yükler.
// changelogUrl = opsiyonel "sürüm → maddeler" JSON'u. Boşsa latest.yml releaseNotes kullanılır.
//   (GitHub release açıklaması da electron-updater tarafından releaseNotes olarak okunabilir.)
export const UPDATE = {
  // Opsiyonel: host'ta changelog.json varsa tam URL'si (ör. raw GitHub).
  // Boşsa GitHub release notları / latest.yml releaseNotes gösterilir.
  changelogUrl: ''
} as const

export type UpdateConfig = typeof UPDATE
