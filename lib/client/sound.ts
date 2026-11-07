"use client";
/**
 * Table sounds made on the fly with the Web Audio API (no audio files to download),
 * plus spoken action words ("Call", "Raise"…) with the device's built-in speech voice.
 * Browsers only allow audio after a user gesture, so `unlockAudio()` runs on the first tap.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockAudio() {
  const a = audio();
  if (a && a.state !== "running") void a.resume().catch(() => {});
}

/** True if sound can play now; otherwise asks the browser to resume for the next sound. */
function running(a: AudioContext): boolean {
  if (a.state !== "running") void a.resume().catch(() => {});
  return a.state === "running";
}

/**
 * Run `fn` when audio can play. iOS Safari suspends or "interrupts" the audio context
 * (after speech, a call, or a while idle); resuming works again once the page was tapped.
 */
function withAudio(fn: (a: AudioContext) => void) {
  const a = audio();
  if (!a) return;
  if (a.state === "running") return fn(a);
  a.resume()
    .then(() => a.state === "running" && fn(a))
    .catch(() => {});
}

function noiseBuffer(a: AudioContext, seconds: number): AudioBuffer {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Card sliding across felt: a short filtered noise sweep. */
export function playSwish(delay = 0) {
  const a = audio();
  if (!a || !running(a)) return;
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, 0.18);
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(5000, t);
  bp.frequency.exponentialRampToValueAtTime(1400, t + 0.16);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + 0.2);
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const a = audio()!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Chips clicking together. */
export function playChips() {
  const a = audio();
  if (!a || !running(a)) return;
  const t = a.currentTime;
  tone(3200, t, 0.05, 0.12, "triangle");
  tone(2600, t + 0.045, 0.05, 0.1, "triangle");
  tone(3600, t + 0.09, 0.04, 0.07, "triangle");
}

/** Soft knock for a check. */
export function playKnock() {
  const a = audio();
  if (!a || !running(a)) return;
  const t = a.currentTime;
  tone(180, t, 0.08, 0.3, "sine");
  tone(170, t + 0.11, 0.08, 0.25, "sine");
}

/** Gentle two-note ping: it's your turn. */
export function playYourTurn() {
  const a = audio();
  if (!a || !running(a)) return;
  const t = a.currentTime;
  tone(880, t, 0.18, 0.12);
  tone(1320, t + 0.12, 0.25, 0.1);
}

/** Short beep for the last seconds of your turn; the final two are higher. */
export function playBeep(urgent = false) {
  const a = audio();
  if (!a || !running(a)) return;
  const t = a.currentTime;
  tone(urgent ? 1560 : 1180, t, 0.09, 0.16, "square");
  if (urgent) tone(1560, t + 0.13, 0.09, 0.16, "square");
}

/** Small rising chime for winning a pot. */
export function playWin() {
  withAudio((a) => {
    const t = a.currentTime;
    [660, 830, 990, 1320].forEach((f, i) => tone(f, t + i * 0.08, 0.3, 0.12));
  });
}

/**
 * Applause for the winner (played on the winner's own device only): a crowd of claps
 * (short bursts of band-passed noise at random times) over a soft cheering bed, ~2.6 s.
 */
export function playApplause() {
  withAudio((a) => {
    const t0 = a.currentTime + 0.03;
    const dur = 2.6;
    const out = a.createGain();
    out.gain.value = 0.9;
    out.connect(a.destination);

    // Crowd bed: filtered noise that swells and fades.
    const bed = a.createBufferSource();
    bed.buffer = noiseBuffer(a, dur + 0.2);
    const bedF = a.createBiquadFilter();
    bedF.type = "bandpass";
    bedF.frequency.value = 1400;
    bedF.Q.value = 0.6;
    const bedG = a.createGain();
    bedG.gain.setValueAtTime(0.0001, t0);
    bedG.gain.exponentialRampToValueAtTime(0.12, t0 + 0.25);
    bedG.gain.setValueAtTime(0.12, t0 + dur * 0.55);
    bedG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    bed.connect(bedF).connect(bedG).connect(out);
    bed.start(t0);
    bed.stop(t0 + dur + 0.1);

    // Claps: dense at first, thinning out.
    const clap = noiseBuffer(a, 0.05);
    for (let i = 0; i < 160; i++) {
      const at = t0 + dur * Math.pow(Math.random(), 1.4);
      const src = a.createBufferSource();
      src.buffer = clap;
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 800 + Math.random() * 1800;
      bp.Q.value = 1.4;
      const g = a.createGain();
      const fade = 1 - (at - t0) / dur;
      const vol = (0.35 + Math.random() * 0.5) * (0.25 + 0.75 * fade);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
      src.connect(bp).connect(g).connect(out);
      src.start(at);
      src.stop(at + 0.06);
    }
  });
}

/** Say a short word, e.g. "Raise". Uses the device's voice; silently does nothing if unsupported. */
export function say(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 1.1;
    u.volume = 0.9;
    window.speechSynthesis.cancel(); // keep up with fast tables: newest word wins
    window.speechSynthesis.speak(u);
  } catch {}
}
