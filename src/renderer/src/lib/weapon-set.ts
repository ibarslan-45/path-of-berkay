// weapon-set.ts — silah seti (weapon set 1/2) türetme yardımcıları (saf, test edilebilir).
//
// PoB: silah slotları "Weapon 1"/"Weapon 2" (set 1) ve "Weapon 1 Swap"/"Weapon 2 Swap" (set 2).
// Gem socket grupları da soketlendikleri slot adını taşır (group.slot) → silaha soketli gem'in seti
// o slottan türetilir. Silah-dışı slotlar (Body/Helmet…) iki sette de paylaşılır → set'e bağlı DEĞİL.
import type { PobBuild } from './pob'

/** Bir slot adından silah seti (yalnız silah slotları). "… Swap" → 2; diğer silah → 1; silah değilse null. */
export function slotWeaponSet(slot: string | null | undefined): 1 | 2 | null {
  if (!slot) return null
  if (!/weapon|offhand|off hand|shield|quiver/i.test(slot)) return null // silah-dışı = paylaşılan
  return /\bswap\b/i.test(slot) ? 2 : 1
}

/** Build gerçekten 2 silah seti kullanıyor mu? (Swap slot/grup VEYA pasif set1/set2 verisi varsa) */
export function buildHasWeaponSets(build: PobBuild | null): boolean {
  if (!build) return false
  const slotSwap = Object.keys(build.slots ?? {}).some((s) => /\bswap\b/i.test(s))
  const stageSwap = (build.stageSlots ?? []).some((m) => Object.keys(m).some((s) => /\bswap\b/i.test(s)))
  const groupSwap = (build.skillSets ?? []).some((ss) => ss.groups.some((g) => /\bswap\b/i.test(g.slot ?? '')))
  const passiveSets = (build.specs ?? []).some((s) => (s.set1Nodes?.length ?? 0) > 0 || (s.set2Nodes?.length ?? 0) > 0)
  return slotSwap || stageSwap || groupSwap || passiveSets
}
