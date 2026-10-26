/**
 * Turns voice recipes into Web Audio nodes on any BaseAudioContext, the live AudioContext or an OfflineAudioContext
 * for tests and renders, through one master bus:
 *
 *   voices -> 20 Hz high-pass -> glue compressor -> limiter -> soft clip at -1.5 dBFS -> destination
 *   voice sends -> generated room reverb -> back into the glue compressor
 *
 * Web Audio's compressors add their own makeup gain; the trims after them take it back out, so a quiet sound plays
 * at its recipe level. The soft clip is the last guard: whatever reaches it leaves at or under its ceiling.
 */

import { createRng } from './rng'
import {
  layerEnd,
  voiceLength,
  type Curve,
  type FilterSpec,
  type Layer,
  type NoiseColor,
  type Point,
  type TextureId,
  type VoiceRecipe,
} from './recipe'
import { generateNoise, generateTexture, TEXTURE_SPECS } from './textures'
import { VoiceLimiter, type VoiceLimits } from './voices'

/** The soft clip's ceiling: 0.841, -1.5 dBFS. */
export const CEILING = 10 ** (-1.5 / 20)

/**
 * The master bus. The glue compressor only works on dense moments (a burst, a black hole's pop on top of other
 * hits); its 12 ms attack lets each transient through first. The limiter holds peaks near -2.5 dBFS and the soft
 * clip catches what its attack lets past. `makeupDb` is the gain each compressor adds by itself, measured in
 * Chromium 151 with a -40 dBFS sine (scripts/test-sounds.mjs checks the bus stays at unity); the trims take it out.
 */
export const MASTER = {
  highpass: 20,
  glue: { threshold: -10, knee: 8, ratio: 2, attack: 0.012, release: 0.3, makeupDb: 1.826 },
  limiter: { threshold: -2.5, knee: 0, ratio: 20, attack: 0.0015, release: 0.12, makeupDb: 1.425 },
  reverbSeconds: 2.4,
} as const

export interface Engine {
  readonly ctx: BaseAudioContext
  /** The last node before the destination, for a meter. */
  readonly output: AudioNode
  /** Plays `voice` from `voice.offset` seconds after `when` (context time). False when the voice cap dropped it. */
  play(voice: VoiceRecipe, when: number): boolean
  /** Voices sounding at context time `time`. */
  activeCount(time: number): number
  /** Fades every voice out from `when`. */
  stopAll(when: number): void
  /** Makes every texture now, a few per call, so the first hit never waits on one. Returns true when all are made. */
  warm(budget?: number): boolean
  /** Gain reduction right now, in dB (0 or negative): the glue compressor and the limiter. */
  reduction(): { readonly glue: number; readonly limiter: number }
  dispose(): void
}

export interface EngineOptions {
  readonly limits?: VoiceLimits
  readonly destination?: AudioNode
  /** BAIT warms only the textures its six cues use. */
  readonly warmTextures?: readonly TextureId[]
}

/** A soft clip for a shaper fed at half level: linear to 70% of the ceiling, then a tanh knee that never passes it. */
export function softClipCurve(ceiling = CEILING, size = 8192): Float32Array {
  const curve = new Float32Array(size)
  const knee = ceiling * 0.7
  const span = ceiling - knee
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    const a = Math.abs(x) * 2
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span)
    curve[i] = Math.sign(x) * Math.min(ceiling, y)
  }
  return curve
}

function driveCurve(size = 2048): Float32Array {
  const curve = new Float32Array(size)
  const k = 3
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

/** Eight levels: a 3-bit crush. */
function crushCurve(size = 2048): Float32Array {
  const curve = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    curve[i] = Math.round(x * 4) / 4
  }
  return curve
}

/** A small hall made in code: 12 ms predelay, a few early reflections, then noise that darkens as it decays. */
function reverbImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate
  const length = Math.round(seconds * sr)
  const ir = ctx.createBuffer(2, length, sr)
  const rng = createRng(0x7e7e_2026)
  let energy = 0
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    let lp = 0
    const predelay = Math.round(0.012 * sr)
    for (let i = predelay; i < length; i++) {
      const t = i / sr
      const k = 0.12 + 0.78 * Math.exp(-t / 0.3)
      lp += k * (rng.next() * 2 - 1 - lp)
      data[i] = lp * Math.exp((-6.9 * t) / seconds)
    }
    for (let r = 0; r < 6; r++) {
      const at = Math.round(rng.range(0.013, 0.06) * sr)
      data[at] = (data[at] as number) + rng.range(0.25, 0.55) * rng.sign()
    }
    for (let i = 0; i < length; i++) energy += (data[i] as number) ** 2
  }
  // Unit energy over both channels: a send of 1 comes back about as loud as the dry sound.
  const k = energy > 0 ? 1 / Math.sqrt(energy) : 0
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) data[i] = (data[i] as number) * k
  }
  return ir
}

const MIN_GAIN = 1e-4

/**
 * Filter coefficients once per 128-sample block: with all four parameters a-rate, a moving one makes Chromium work
 * them out for every sample. Where an older Safari has no automationRate, this does nothing and returns false.
 */
export function blockRate(filter: BiquadFilterNode): boolean {
  let all = true
  for (const param of [filter.frequency, filter.detune, filter.Q, filter.gain]) {
    if ('automationRate' in param) param.automationRate = 'k-rate'
    else all = false
  }
  return all
}

/** Schedules a curve on an AudioParam from `t0`, times `scale`. Exponential ramps fall back to linear around 0. */
export function scheduleCurve(param: AudioParam, curve: Curve, t0: number, scale = 1, lo = -Infinity, hi = Infinity): void {
  const fit = (v: number) => Math.min(hi, Math.max(lo, v))
  if (typeof curve === 'number') {
    param.setValueAtTime(fit(curve * scale), t0)
    return
  }
  const first = curve[0]
  if (!first) return
  let prev = fit(first[1] * scale)
  let prevTime = t0 + Math.max(0, first[0])
  param.setValueAtTime(prev, prevTime)
  for (let i = 1; i < curve.length; i++) {
    const [t, v, ramp] = curve[i] as Point
    const time = Math.max(prevTime, t0 + t)
    let target = fit(v * scale)
    if (time <= prevTime) {
      param.setValueAtTime(target, time)
    } else if (ramp === 'lin' || prev <= 0) {
      param.linearRampToValueAtTime(target, time)
    } else {
      if (target <= 0) target = Math.max(MIN_GAIN * Math.abs(scale), 1e-7)
      param.exponentialRampToValueAtTime(target, time)
    }
    prev = target
    prevTime = time
  }
}

interface RenderRecord {
  readonly sources: AudioScheduledSourceNode[]
  readonly nodes: AudioNode[]
  last: AudioScheduledSourceNode | null
  lastStop: number
}

interface VoiceRecord {
  readonly out: GainNode
  readonly sources: AudioScheduledSourceNode[]
  readonly nodes: AudioNode[]
  readonly end: number
}

export function createEngine(ctx: BaseAudioContext, options: EngineOptions = {}): Engine {
  const sr = ctx.sampleRate
  const nyquist = sr / 2 - 50
  const limiter = new VoiceLimiter(options.limits)
  const records = new Map<number, VoiceRecord>()
  const destination = options.destination ?? ctx.destination

  // Master bus.
  const input = ctx.createGain()
  const rumble = ctx.createBiquadFilter()
  blockRate(rumble)
  rumble.type = 'highpass'
  rumble.frequency.value = MASTER.highpass
  rumble.Q.value = 0.6
  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = MASTER.glue.threshold
  glue.knee.value = MASTER.glue.knee
  glue.ratio.value = MASTER.glue.ratio
  glue.attack.value = MASTER.glue.attack
  glue.release.value = MASTER.glue.release
  const glueTrim = ctx.createGain()
  glueTrim.gain.value = 10 ** (-MASTER.glue.makeupDb / 20)
  const peak = ctx.createDynamicsCompressor()
  peak.threshold.value = MASTER.limiter.threshold
  peak.knee.value = MASTER.limiter.knee
  peak.ratio.value = MASTER.limiter.ratio
  peak.attack.value = MASTER.limiter.attack
  peak.release.value = MASTER.limiter.release
  // A fresh compressor starts gain-reduced and recovers at its release rate (measured in Chromium 151: the limiter
  // was 15 dB down at the first sample, 7 dB at 20 ms). A 1 ms release for the first 30 ms settles both at once, so
  // the first hit after unlock plays at full level.
  const born = ctx.currentTime
  for (const [node, release] of [
    [glue, MASTER.glue.release],
    [peak, MASTER.limiter.release],
  ] as const) {
    node.release.setValueAtTime(0.001, born)
    node.release.setValueAtTime(release, born + 0.03)
  }
  const peakTrim = ctx.createGain()
  peakTrim.gain.value = 10 ** (-MASTER.limiter.makeupDb / 20)
  const clipIn = ctx.createGain()
  clipIn.gain.value = 0.5
  const clipper = ctx.createWaveShaper()
  clipper.curve = softClipCurve() as Float32Array<ArrayBuffer>
  // No oversampling: it would add 4 ms to every sound, and the clip only shapes what the limiter lets past.
  clipper.oversample = 'none'
  const output = ctx.createGain()
  input.connect(rumble).connect(glue).connect(glueTrim).connect(peak).connect(peakTrim).connect(clipIn).connect(clipper).connect(output)
  output.connect(destination)

  const reverbIn = ctx.createGain()
  const convolver = ctx.createConvolver()
  convolver.normalize = false
  convolver.buffer = reverbImpulse(ctx, MASTER.reverbSeconds)
  reverbIn.connect(convolver).connect(input)

  const shapes = { drive: driveCurve(), crush: crushCurve() }
  const noiseBuffers = new Map<NoiseColor, AudioBuffer>()
  const textureBuffers = new Map<string, AudioBuffer>()

  const toBuffer = (data: Float32Array[]): AudioBuffer => {
    const buffer = ctx.createBuffer(data.length, (data[0] as Float32Array).length, sr)
    data.forEach((channel, i) => buffer.getChannelData(i).set(channel))
    return buffer
  }
  const noise = (color: NoiseColor): AudioBuffer => {
    let buffer = noiseBuffers.get(color)
    if (!buffer) {
      buffer = toBuffer(generateNoise(color, sr))
      noiseBuffers.set(color, buffer)
    }
    return buffer
  }
  const texture = (id: TextureId, variant: number): AudioBuffer => {
    const v = ((variant % TEXTURE_SPECS[id].variants) + TEXTURE_SPECS[id].variants) % TEXTURE_SPECS[id].variants
    const key = `${id}:${v}`
    let buffer = textureBuffers.get(key)
    if (!buffer) {
      buffer = toBuffer(generateTexture(id, v, sr))
      textureBuffers.set(key, buffer)
    }
    return buffer
  }
  const pending: (() => void)[] = []
  for (const color of ['white', 'pink', 'brown'] as const) pending.push(() => void noise(color))
  for (const id of options.warmTextures ?? Object.keys(TEXTURE_SPECS) as TextureId[]) {
    for (let v = 0; v < TEXTURE_SPECS[id].variants; v++) pending.push(() => void texture(id, v))
  }

  const filterNode = (spec: FilterSpec, t0: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter()
    f.type = spec.type
    // At block rate, the block holding t0 reads the frequency at its first sample, before the curve starts: begin on
    // the curve's first value, or that block filters at the 350 Hz default ('wrong' measured 7 dB off at 1 kHz).
    if (blockRate(f)) {
      const first = typeof spec.freq === 'number' ? spec.freq : (spec.freq[0]?.[1] ?? f.frequency.value)
      f.frequency.value = Math.min(nyquist, Math.max(10, first))
    }
    scheduleCurve(f.frequency, spec.freq, t0, 1, 10, nyquist)
    f.Q.value = spec.q ?? (spec.type === 'lowpass' || spec.type === 'highpass' ? 0.707 : 1)
    if (spec.gain !== undefined) f.gain.value = spec.gain
    return f
  }

  const panNode = (): StereoPannerNode | GainNode =>
    typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain()

  const renderLayer = (layer: Layer, t0: number, dest: AudioNode, record: RenderRecord) => {
    const start = t0 + layer.at
    const end = t0 + layerEnd(layer)
    const stopAt = end + 0.03
    const keep = <T extends AudioNode>(node: T): T => {
      record.nodes.push(node)
      return node
    }
    const keepSource = <T extends AudioScheduledSourceNode>(node: T): T => {
      record.sources.push(node)
      record.nodes.push(node)
      if (stopAt > record.lastStop) {
        record.lastStop = stopAt
        record.last = node
      }
      return node
    }

    let source: AudioNode
    if (layer.kind === 'tone') {
      const osc = keepSource(ctx.createOscillator())
      osc.type = layer.wave
      scheduleCurve(osc.frequency, layer.freq, start, 1, 1, nyquist)
      if (layer.vibrato) {
        const lfo = keepSource(ctx.createOscillator())
        lfo.frequency.value = layer.vibrato.rate
        const depth = keep(ctx.createGain())
        scheduleCurve(depth.gain, layer.vibrato.cents, start)
        lfo.connect(depth).connect(osc.detune)
        lfo.start(start)
        lfo.stop(stopAt)
      }
      if (layer.fm) {
        const mod = keepSource(ctx.createOscillator())
        mod.type = layer.fm.wave ?? 'sine'
        scheduleCurve(mod.frequency, layer.fm.freq, start, 1, 0.1, nyquist)
        const depth = keep(ctx.createGain())
        scheduleCurve(depth.gain, layer.fm.depth, start)
        mod.connect(depth).connect(osc.frequency)
        mod.start(start)
        mod.stop(stopAt)
      }
      osc.start(start)
      osc.stop(stopAt)
      source = osc
    } else {
      const src = keepSource(ctx.createBufferSource())
      if (layer.kind === 'noise') {
        src.buffer = noise(layer.color)
        src.loop = true
        src.start(start, Math.max(0, Math.min(0.999, layer.offset)) * src.buffer.duration)
      } else {
        src.buffer = texture(layer.texture, layer.variant)
        src.playbackRate.value = Math.max(0.05, layer.rate)
        src.start(start, Math.max(0, Math.min(src.buffer.duration - 0.001, layer.offset)))
      }
      src.stop(stopAt)
      source = src
    }

    let node: AudioNode = source
    if (layer.shape) {
      const shaper = keep(ctx.createWaveShaper())
      shaper.curve = shapes[layer.shape] as Float32Array<ArrayBuffer>
      shaper.oversample = '2x'
      node = node.connect(shaper)
    }
    for (const spec of layer.filters ?? []) node = node.connect(keep(filterNode(spec, start)))
    if (layer.tremolo) {
      const trem = keep(ctx.createGain())
      const half = Math.max(0, Math.min(1, layer.tremolo.depth)) / 2
      trem.gain.value = 1 - half
      const lfo = keepSource(ctx.createOscillator())
      lfo.type = layer.tremolo.wave ?? 'sine'
      lfo.frequency.value = layer.tremolo.rate
      const depth = keep(ctx.createGain())
      depth.gain.value = half
      lfo.connect(depth).connect(trem.gain)
      lfo.start(start)
      lfo.stop(stopAt)
      node = node.connect(trem)
    }
    const amp = keep(ctx.createGain())
    amp.gain.value = 0
    scheduleCurve(amp.gain, layer.env, start, layer.gain)
    amp.gain.setValueAtTime(0, end + 0.001)
    node = node.connect(amp)
    if (layer.pan !== undefined || layer.autopan) {
      const panner = keep(panNode())
      if ('pan' in panner) {
        scheduleCurve(panner.pan, layer.pan ?? 0, start, 1, -1, 1)
        if (layer.autopan) {
          const lfo = keepSource(ctx.createOscillator())
          scheduleCurve(lfo.frequency, layer.autopan.rate, start, 1, 0.01, 50)
          const depth = keep(ctx.createGain())
          depth.gain.value = layer.autopan.depth
          lfo.connect(depth).connect(panner.pan)
          lfo.start(start)
          lfo.stop(stopAt)
        }
      }
      node = node.connect(panner)
    }
    node.connect(dest)
  }

  const fade = (id: number, when: number) => {
    const record = records.get(id)
    if (!record) return
    records.delete(id)
    try {
      record.out.gain.cancelScheduledValues(when)
      record.out.gain.setValueAtTime(record.out.gain.value, when)
      record.out.gain.setTargetAtTime(0, when, 0.012)
    } catch {
      // A param that cannot take the fade still stops below.
    }
    for (const source of record.sources) {
      try {
        source.stop(when + 0.09)
      } catch {
        // Older Safari throws on a second stop(); the first one still ends it.
      }
    }
  }

  return {
    ctx,
    output,

    play(voice, when) {
      const start = when + Math.max(0, voice.offset)
      const length = voiceLength(voice)
      if (length <= 0 || voice.layers.length === 0) return false
      const admission = limiter.admit(
        { name: voice.name, group: voice.group, priority: voice.priority, start, end: start + length + 0.05 },
        when
      )
      for (const id of admission.steal) fade(id, when)
      if (!admission.accept) return false

      const record: RenderRecord = { sources: [], nodes: [], last: null, lastStop: -Infinity }
      const vIn = ctx.createGain()
      record.nodes.push(vIn)
      let node: AudioNode = vIn
      const voicing = voice.voicing
      if (voicing?.lowshelf) {
        const f = ctx.createBiquadFilter()
        blockRate(f)
        f.type = 'lowshelf'
        f.frequency.value = voicing.lowshelf.freq
        f.gain.value = voicing.lowshelf.gain
        record.nodes.push(f)
        node = node.connect(f)
      }
      if (voicing?.highshelf) {
        const f = ctx.createBiquadFilter()
        blockRate(f)
        f.type = 'highshelf'
        f.frequency.value = voicing.highshelf.freq
        f.gain.value = voicing.highshelf.gain
        record.nodes.push(f)
        node = node.connect(f)
      }
      if (voicing?.lowpass) {
        const f = ctx.createBiquadFilter()
        blockRate(f)
        f.type = 'lowpass'
        f.frequency.value = voicing.lowpass.freq
        f.Q.value = voicing.lowpass.q
        record.nodes.push(f)
        node = node.connect(f)
      }
      const out = ctx.createGain()
      out.gain.value = voice.gain * admission.gain
      record.nodes.push(out)
      const panner = panNode()
      if ('pan' in panner) panner.pan.value = Math.max(-1, Math.min(1, voice.pan))
      record.nodes.push(panner)
      node.connect(out).connect(panner).connect(input)
      if (voice.send > 0) {
        const send = ctx.createGain()
        send.gain.value = voice.send
        record.nodes.push(send)
        panner.connect(send).connect(reverbIn)
      }
      for (const layer of voice.layers) renderLayer(layer, start, vIn, record)

      // The source that stops last tidies the voice's nodes away.
      const end = start + length + 0.05
      if (record.last) {
        record.last.onended = () => {
          for (const n of record.nodes) {
            try {
              n.disconnect()
            } catch {
              // Already disconnected.
            }
          }
          records.delete(admission.id)
          limiter.release(admission.id)
        }
      }
      records.set(admission.id, { out, sources: record.sources, nodes: record.nodes, end })
      return true
    },

    activeCount(time) {
      return limiter.active(time).length
    },

    stopAll(when) {
      for (const id of [...records.keys()]) fade(id, when)
      limiter.clear()
    },

    reduction() {
      return { glue: glue.reduction, limiter: peak.reduction }
    },

    warm(budget = 4) {
      for (let i = 0; i < budget && pending.length > 0; i++) pending.shift()?.()
      return pending.length === 0
    },

    dispose() {
      for (const id of [...records.keys()]) fade(id, 0)
      try {
        output.disconnect()
        reverbIn.disconnect()
        convolver.disconnect()
      } catch {
        // Nothing left to disconnect.
      }
    },
  }
}
