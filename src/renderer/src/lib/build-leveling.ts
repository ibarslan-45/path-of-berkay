// build-leveling.ts — İçe aktarılmış build için leveling/görev KONTROL LİSTESİ üretir (Bug #3).
//
// İki kaynak:
//  (1) Build'in kendi aşamaları (skillSets): her aşama için karakter-seviyesi eşiği + o aşamada
//      kullanılan aktif beceriler + (pob-quest ile) gereken Uncut Skill/Support/Spirit Gem seviyeleri.
//  (2) Yazar notları (PoB <Notes> / Maxroll / Mobalytics): leveling'le ilgili satırlar (Act/level/
//      passive/quest/gem anahtar kelimeleri) ayıklanır.
//
// DÜRÜSTLÜK: act↔seviye eşlemesi YAKLAŞIK (pob-quest). Veri yoksa boş plan (UI kibar not gösterir).
// TR SIZINTISI YOK (Bug #4): beceri/gem/stat adları ve not metni İNGİLİZCE ORİJİNAL kalır; yalnız
//   UI'daki çevreleyen etiketler TR'dir. Bu modül metni ÇEVİRMEZ.
import type { PobBuild } from './pob'
import { buildQuestSuggestion } from './pob-quest'

export interface LevelStep {
  id: string // ilerleme kalıcılığı için kararlı anahtar (build içeriğinden türetilir)
  kind: 'stage' | 'note'
  title: string
  level: { lo: number; hi: number } | null
  act: number | null
  skills: string[] // aktif beceri adları (EN orijinal)
  uncut: string[] // ör. "Uncut Skill Gem (Level 3)" (EN orijinal)
  text?: string // note adımı için ham satır (EN orijinal)
}

export interface LevelingPlan {
  stages: LevelStep[]
  notes: LevelStep[]
  hasData: boolean
}

// kararlı kısa hash (djb2) — id'ler restart sonrası aynı kalsın (ilerleme korunur)
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function uncutLines(sug: ReturnType<typeof buildQuestSuggestion>): string[] {
  const out: string[] = []
  if (sug.skill) out.push(`Uncut Skill Gem (Level ${sug.skill.gemLevel})`)
  if (sug.support) out.push(`Uncut Support Gem (Level ${sug.support.gemLevel})`)
  if (sug.spirit) out.push(`Uncut Spirit Gem (Level ${sug.spirit.gemLevel})`)
  return out
}

// Yazar notlarında leveling adımı gibi görünen satırlar (EN anahtar kelime). Markdown/ham ikisi de.
// NOT: sondaki \b YOK — `take\s+`/`grab\s+` gibi boşlukla biten alternatifleri bozardı
// (ör. `Take "..."` → boşluktan sonra tırnak gelince word-boundary oluşmaz). Heuristik; aşırı
// eşleşme zararsız.
const LEVELING_RE =
  /\b(act\s*\d|lvl\.?\s*\d|level\s*\d|passive\s+point|skill\s+point|respec|ascend|labyrinth|trial|campaign|quest|cruel|merciless|waypoint|take\s+|grab\s+|swap\s+to|until\s+(?:lvl|level))/i

/** Build (+ opsiyonel notlar) → leveling/görev kontrol listesi. */
export function buildLevelingChecklist(build: PobBuild | null, notesText?: string): LevelingPlan {
  const stages: LevelStep[] = []
  const seedBase = build ? `${build.className}|${build.ascendClassName}` : ''
  if (build) {
    build.skillSets.forEach((ss, i) => {
      // raw PobSkillSet → {title, gems} (groups düzleştir; buildQuestSuggestion QuestGem bekler)
      const gems = ss.groups.flatMap((g) => g.gems)
      const sug = buildQuestSuggestion({ title: ss.title, gems })
      const title = (ss.title || '').trim() || `Stage ${i + 1}`
      stages.push({
        id: 'st_' + hash(seedBase + '|' + title + '|' + i),
        kind: 'stage',
        title,
        level: sug.level,
        act: sug.act,
        skills: sug.activeSkills.map((s) => s.en).filter(Boolean),
        uncut: uncutLines(sug)
      })
    })
  }

  const notes: LevelStep[] = []
  if (notesText) {
    const seen = new Set<string>()
    const lines = notesText.split(/\r?\n/)
    for (const raw of lines) {
      // markdown liste/başlık işaretlerini soy, ama metin EN kalır
      const line = raw.replace(/^\s*(?:[-*+#>]\s*|\d+[.)]\s*)/, '').trim()
      if (line.length < 4 || line.length > 240) continue
      if (!LEVELING_RE.test(line)) continue
      const id = 'nt_' + hash(seedBase + '|' + line)
      if (seen.has(id)) continue
      seen.add(id)
      notes.push({ id, kind: 'note', title: line, level: null, act: null, skills: [], uncut: [], text: line })
      if (notes.length >= 60) break // aşırı uzun notları sınırla
    }
  }

  return { stages, notes, hasData: stages.length > 0 || notes.length > 0 }
}
