/**
 * The voice cap, as pure bookkeeping. Overtime can land fifteen hits a second; without a cap their tails pile into a
 * wash. Effects and short ticks are capped apart, tier 3 effects have their own small cap, the same sound starting in
 * the same instant is softened or dropped, and a new voice in a busy group comes in a little lower.
 */

import type { VoiceGroup } from './recipe'

export interface VoiceLimits {
  /** Effect voices at once. */
  readonly fx: number
  /** Switch, tick and chime voices at once. */
  readonly tick: number
  /** Tier 3 voices (priority 3 and up) at once. */
  readonly big: number
  /** Voices of one sound that may start within `stackWindow` seconds of each other. */
  readonly stack: number
  readonly stackWindow: number
}

export const VOICE_LIMITS: VoiceLimits = { fx: 8, tick: 8, big: 2, stack: 2, stackWindow: 0.05 }

export interface VoiceSlot {
  readonly id: number
  readonly name: string
  readonly group: VoiceGroup
  readonly priority: number
  /** Context time the voice starts and ends. */
  readonly start: number
  readonly end: number
}

export type VoiceRequest = Omit<VoiceSlot, 'id'>

export interface Admission {
  /** 0 when the voice was dropped. */
  readonly id: number
  readonly accept: boolean
  /** Voices to fade out at once to make room. */
  readonly steal: readonly number[]
  /** Gain for the new voice: below 1 when its group is busy or the same sound just started. */
  readonly gain: number
}

const REJECT: Admission = { id: 0, accept: false, steal: [], gain: 0 }

/** Each voice already sounding in the group lowers a new one: 1 / sqrt(1 + 0.15 n), so 7 others is about -3 dB. */
export const densityGain = (busy: number): number => 1 / Math.sqrt(1 + 0.15 * Math.max(0, busy))

/** The voice to steal: the lowest priority at or under `priority`, the oldest first. Null when every voice outranks it. */
export function pickVictim(slots: readonly VoiceSlot[], priority: number): VoiceSlot | null {
  let best: VoiceSlot | null = null
  for (const slot of slots) {
    if (slot.priority > priority) continue
    if (!best || slot.priority < best.priority || (slot.priority === best.priority && slot.start < best.start)) best = slot
  }
  return best
}

export class VoiceLimiter {
  private slots: VoiceSlot[] = []
  private serial = 0

  constructor(readonly limits: VoiceLimits = VOICE_LIMITS) {}

  /** Voices still sounding at `now`. */
  active(now: number): readonly VoiceSlot[] {
    this.prune(now)
    return this.slots
  }

  /** Decides whether a voice may start at `now`, which voices it replaces, and at what gain. */
  admit(request: VoiceRequest, now: number = request.start): Admission {
    this.prune(now)
    let gain = 1
    const twins = this.slots.filter((s) => s.name === request.name && Math.abs(request.start - s.start) < this.limits.stackWindow)
    if (twins.length >= this.limits.stack) return REJECT
    if (twins.length > 0) gain *= 0.6

    const steal: number[] = []
    const cap = request.group === 'fx' ? this.limits.fx : this.limits.tick
    const group = this.slots.filter((s) => s.group === request.group)
    if (group.length >= cap) {
      const victim = pickVictim(group, request.priority)
      if (!victim) return REJECT
      steal.push(victim.id)
    }
    if (request.priority >= 3) {
      const big = this.slots.filter((s) => s.priority >= 3 && !steal.includes(s.id))
      if (big.length >= this.limits.big) {
        const victim = pickVictim(big, request.priority)
        if (!victim) return REJECT
        steal.push(victim.id)
      }
    }
    if (steal.length > 0) this.slots = this.slots.filter((s) => !steal.includes(s.id))
    gain *= densityGain(this.slots.filter((s) => s.group === request.group).length)
    const id = ++this.serial
    this.slots.push({ ...request, id })
    return { id, accept: true, steal, gain }
  }

  release(id: number): void {
    this.slots = this.slots.filter((s) => s.id !== id)
  }

  clear(): void {
    this.slots = []
  }

  private prune(now: number): void {
    if (this.slots.some((s) => s.end <= now)) this.slots = this.slots.filter((s) => s.end > now)
  }
}
