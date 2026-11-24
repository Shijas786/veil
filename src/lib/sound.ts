/** All sound is synthesised with the Web Audio API: no audio files, works offline. */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = localStorage.getItem('veil.sound') !== 'off'
let pad: { stop: () => void } | null = null

function audio(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export const soundOn = () => enabled
export function setSound(on: boolean) {
  enabled = on
  localStorage.setItem('veil.sound', on ? 'on' : 'off')
  if (!on) {
    pad?.stop()
    pad = null
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slide?: number } = {}) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + (opts.at ?? 0)
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = opts.type ?? 'sine'
  o.frequency.setValueAtTime(freq, t)
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise(dur: number, from: number, to: number, gain = 0.1, at = 0) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + at
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource()
  s.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.4
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t)
}

export const sfx = {
  tap: () => tone(620, 0.07, { type: 'triangle', gain: 0.06, slide: 440 }),
  hover: () => tone(1200, 0.03, { gain: 0.015 }),
  select: () => {
    tone(523, 0.09, { type: 'triangle', gain: 0.07 })
    tone(784, 0.14, { type: 'triangle', gain: 0.06, at: 0.06 })
  },
  scan: () => {
    noise(1.6, 300, 2600, 0.05)
    tone(180, 1.6, { gain: 0.04, slide: 360 })
  },
  /** One per identifier being sealed on-device. */
  seal: (i = 0) => {
    tone(150 - i * 4, 0.16, { type: 'square', gain: 0.045, slide: 70 })
    noise(0.08, 2400, 900, 0.035)
  },
  airlock: () => {
    noise(1.1, 200, 4200, 0.09)
    tone(90, 0.9, { type: 'sawtooth', gain: 0.035, slide: 45 })
    tone(660, 0.5, { gain: 0.03, at: 0.75, slide: 990 })
  },
  packet: (i = 0) => tone(880 + i * 60, 0.06, { gain: 0.03 }),
  done: () => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, { gain: 0.07, at: i * 0.09 }))
    tone(261.6, 1.2, { gain: 0.05 })
  },
  warn: () => {
    tone(330, 0.18, { type: 'triangle', gain: 0.07 })
    tone(247, 0.3, { type: 'triangle', gain: 0.07, at: 0.16 })
  },
  reveal: (i = 0) => tone(440 * Math.pow(2, (i % 8) / 12), 0.12, { type: 'triangle', gain: 0.03 }),
}

/** A quiet two-note pad while models are working. */
export function startPad() {
  const c = audio()
  if (!c || !master || pad) return
  const g = c.createGain()
  g.gain.value = 0.0001
  g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.2)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 700
  const lfo = c.createOscillator()
  const lg = c.createGain()
  lfo.frequency.value = 0.18
  lg.gain.value = 260
  lfo.connect(lg).connect(f.frequency)
  const oscs = [110, 164.81, 220.6].map((fr) => {
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = fr
    o.connect(f)
    o.start()
    return o
  })
  f.connect(g).connect(master)
  lfo.start()
  pad = {
    stop: () => {
      g.gain.cancelScheduledValues(c.currentTime)
      g.gain.setValueAtTime(g.gain.value, c.currentTime)
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8)
      setTimeout(() => [...oscs, lfo].forEach((o) => o.stop()), 900)
    },
  }
}
export function stopPad() {
  pad?.stop()
  pad = null
}
