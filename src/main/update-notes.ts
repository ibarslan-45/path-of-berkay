// update-notes.ts — güncelleme "neler değişti" notlarını çeşitli kaynaklardan normalize eder.
// SAF + test edilebilir (ağsız). Kaynaklar:
//   (1) host'ta changelog.json (esnek şema: map { "0.14.0": [...] } VEYA dizi [{version,notes}]).
//   (2) electron-updater info.releaseNotes (string HTML | { version, note }[] | null).
// Uydurma YOK: bulunamayan sürüm → boş dizi (UI "not yok" gösterir).

export interface ChangelogEntry {
  version: string
  date?: string
  notes: string[]
}

// "v0.14.0" / "0.14.0 " → "0.14.0"
function cleanVersion(v: string): string {
  return (v || '').trim().replace(/^v/i, '')
}

// HTML/metin → düz satır maddeleri (basit; <li>/satır-sonu böler, etiket temizler)
function htmlToLines(html: string): string[] {
  return html
    .replace(/<\/(li|p|div|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•\-*\s]+/, '').trim())
    .filter(Boolean)
}

/** changelog.json (map veya dizi) → normalize edilmiş, sürüme göre azalan sıralı entry listesi. */
export function parseChangelog(data: unknown): ChangelogEntry[] {
  const out: ChangelogEntry[] = []
  if (!data || typeof data !== 'object') return out
  if (Array.isArray(data)) {
    for (const e of data) {
      if (!e || typeof e !== 'object') continue
      const o = e as Record<string, unknown>
      const version = cleanVersion(String(o.version ?? ''))
      if (!version) continue
      const notes = Array.isArray(o.notes) ? o.notes.map((n) => String(n)).filter(Boolean) : typeof o.notes === 'string' ? htmlToLines(o.notes) : []
      out.push({ version, date: typeof o.date === 'string' ? o.date : undefined, notes })
    }
  } else {
    // map: { "0.14.0": ["..."] | "html" | {notes,date} }
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const version = cleanVersion(k)
      if (!version) continue
      let notes: string[] = []
      let date: string | undefined
      if (Array.isArray(v)) notes = v.map((n) => String(n)).filter(Boolean)
      else if (typeof v === 'string') notes = htmlToLines(v)
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        notes = Array.isArray(o.notes) ? o.notes.map((n) => String(n)).filter(Boolean) : typeof o.notes === 'string' ? htmlToLines(o.notes) : []
        if (typeof o.date === 'string') date = o.date
      }
      out.push({ version, date, notes })
    }
  }
  return out.sort((a, b) => compareVersions(b.version, a.version))
}

/** Belirli bir sürümün notları (changelog'dan); yoksa boş dizi. */
export function notesForVersion(data: unknown, version: string): string[] {
  const v = cleanVersion(version)
  const entry = parseChangelog(data).find((e) => e.version === v)
  return entry?.notes ?? []
}

/** electron-updater releaseNotes alanını düz satır listesine çevirir. */
export function normalizeUpdaterNotes(rn: unknown): string[] {
  if (!rn) return []
  if (typeof rn === 'string') return htmlToLines(rn)
  if (Array.isArray(rn)) {
    const out: string[] = []
    for (const e of rn) {
      if (typeof e === 'string') out.push(...htmlToLines(e))
      else if (e && typeof e === 'object') {
        const note = (e as { note?: unknown }).note
        if (typeof note === 'string') out.push(...htmlToLines(note))
      }
    }
    return out
  }
  return []
}

/** semver-benzeri karşılaştırma: a>b → +1, a<b → -1, eşit → 0 (sayısal parçalar; pre-release yok sayılır). */
export function compareVersions(a: string, b: string): number {
  const pa = cleanVersion(a).split('.').map((x) => parseInt(x, 10) || 0)
  const pb = cleanVersion(b).split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** b sürümü a'dan YENİ mi (yeni güncelleme var mı). */
export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}
