// changelog.ts — CHANGELOG.md (markdown) → sürüm bölümleri + hafif markdown render.
// SAF + test edilebilir (ağsız). ?raw import App/WhatsNew'de yapılır (tsx testi saf parser'ı kullanır).
// "Neler değişti" ekranı + güncelleme sonrası bildirim bunu kullanır.

export interface ChangeEntry {
  version: string // "0.14.3"
  body: string // o sürümün markdown gövdesi (başlık hariç)
}

// "v0.14.3" / "0.14.3 — başlık" → "0.14.3" (ilk semver parçası)
function cleanHeading(h: string): string {
  const m = h.match(/v?(\d+\.\d+\.\d+)/)
  return m ? m[1] : h.trim().replace(/^v/i, '')
}

/** CHANGELOG.md → sürüm girdileri. `## <sürüm>` başlıklarına böler (en üstteki en yeni). */
export function parseChangelogMd(md: string): ChangeEntry[] {
  if (!md || typeof md !== 'string') return []
  const lines = md.split(/\r?\n/)
  const out: ChangeEntry[] = []
  let cur: { version: string; body: string[] } | null = null
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/) // "## 0.14.3" (### alt-başlık değil)
    if (h && !line.startsWith('###')) {
      if (cur) out.push({ version: cur.version, body: cur.body.join('\n').trim() })
      cur = { version: cleanHeading(h[1]), body: [] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  if (cur) out.push({ version: cur.version, body: cur.body.join('\n').trim() })
  return out
}

/** Belirli sürümün markdown gövdesi (yoksa ''). v-prefix toleranslı. */
export function notesForVersionMd(md: string, version: string): string {
  const v = (version || '').replace(/^v/i, '').trim()
  return parseChangelogMd(md).find((e) => e.version === v)?.body ?? ''
}

// --- hafif markdown → güvenli HTML (başlık, kalın, italik, liste, satır). Emoji passthrough. ---
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
/** Hafif markdown gövdesini HTML'e çevirir (v-html için; yalnız kendi ürettiğimiz changelog). */
export function renderMarkdownLite(md: string): string {
  const lines = (md || '').split(/\r?\n/)
  const html: string[] = []
  let inList = false
  const closeList = (): void => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^###\s+(.+)$/))) {
      closeList()
      html.push(`<h4>${inline(m[1])}</h4>`)
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      closeList()
      html.push(`<h3>${inline(m[1])}</h3>`)
    } else if ((m = line.match(/^[-*]\s+(.+)$/))) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inline(m[1])}</li>`)
    } else {
      closeList()
      html.push(`<p>${inline(line)}</p>`)
    }
  }
  closeList()
  return html.join('\n')
}
