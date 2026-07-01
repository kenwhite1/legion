// Крошечные синтезированные звуки через WebAudio: без файлов, работает офлайн.
// Создаётся лениво при первом воспроизведении (webview Telegram требует жеста).
let ctx: AudioContext | null = null
let muted = localStorage.getItem('lgMuted') === '1'

export function isSoundOn(): boolean { return !muted }
export function setSoundOn(on: boolean): void {
  muted = !on
  localStorage.setItem('lgMuted', muted ? '1' : '0')
}

function audioCtx(): AudioContext | null {
  if (muted) return null
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = ctx ?? new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function blip(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.12): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g); g.connect(c.destination)
  o.start(at); o.stop(at + dur + 0.02)
}

// короткий шумовой всплеск: перекат кубиков или марш армии
function noise(c: AudioContext, at: number, dur = 0.13, peak = 0.06, hp = 1400): void {
  const n = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.setValueAtTime(peak, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  const f = c.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = hp
  src.connect(f); f.connect(g); g.connect(c.destination)
  src.start(at); src.stop(at + dur)
}

export type Sfx = 'tap' | 'place' | 'dice' | 'hit' | 'capture' | 'lose_land' | 'win' | 'lose' | 'turn'

export function playSfx(name: Sfx): void {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  switch (name) {
    case 'tap': blip(c, 660, t, 0.06, 'sine', 0.05); break
    case 'place': blip(c, 300, t, 0.09, 'triangle', 0.07); noise(c, t, 0.06, 0.03, 800); break
    case 'dice': noise(c, t, 0.16, 0.05, 900); noise(c, t + 0.08, 0.12, 0.04, 1100); break
    case 'hit': blip(c, 180, t, 0.14, 'sawtooth', 0.06); break
    case 'capture': [392, 523.25, 659.25].forEach((f, i) => blip(c, f, t + i * 0.06, 0.18, 'triangle', 0.08)); break
    case 'lose_land': blip(c, 220, t, 0.18, 'sawtooth', 0.06); blip(c, 160, t + 0.09, 0.2, 'sawtooth', 0.06); break
    case 'turn': blip(c, 720, t, 0.1, 'sine', 0.06); break
    case 'win': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(c, f, t + i * 0.1, 0.28, 'triangle', 0.1)); break
    case 'lose': [392, 330, 262].forEach((f, i) => blip(c, f, t + i * 0.13, 0.26, 'sine', 0.08)); break
  }
}
