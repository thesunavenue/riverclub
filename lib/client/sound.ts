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

/** A short noise burst through a filter: the building block for taps, clicks and claps. */
function burst(
  a: AudioContext,
  out: AudioNode,
  buf: AudioBuffer,
  at: number,
  o: { type: BiquadFilterType; freq: number; q: number; vol: number; len: number },
) {
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.freq;
  f.Q.value = o.q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.vol, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.len);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + o.len + 0.02);
}

/** A thud with a falling pitch (fingertips or a chip stack landing on a padded table). */
function thud(a: AudioContext, at: number, from: number, to: number, len: number, vol: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + len + 0.02);
}

/** Check: two light taps on the table, "tap tap". */
export function playKnock() {
  const a = audio();
  if (!a || !running(a)) return;
  const t = a.currentTime + 0.01;
  const n = noiseBuffer(a, 0.05);
  [0, 0.12].forEach((d, i) => {
    const v = i ? 0.75 : 1;
    burst(a, a.destination, n, t + d, { type: "bandpass", freq: 1900, q: 1.2, vol: 0.5 * v, len: 0.03 });
    burst(a, a.destination, n, t + d, { type: "lowpass", freq: 600, q: 0.7, vol: 0.6 * v, len: 0.05 });
    thud(a, t + d, 260, 110, 0.07, 0.35 * v);
  });
}

/**
 * Pushing chips into the pot: the stack slides over the felt, then the chips clack.
 * "call" is a light push; "raise" a bigger, heavier stack; "allin" the whole lot.
 */
export function playChips(kind: "call" | "raise" | "allin" = "call") {
  const a = audio();
  if (!a || !running(a)) return;
  const heavy = kind !== "call";
  const t = a.currentTime + 0.01;
  const slide = kind === "allin" ? 0.32 : heavy ? 0.24 : 0.14;

  // Slide over felt: soft low noise that swells and stops.
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, slide + 0.05);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = heavy ? 900 : 1500;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(heavy ? 0.28 : 0.16, t + slide * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + slide);
  src.connect(lp).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + slide + 0.05);

  // The stack lands, then chips clack against each other.
  const land = t + slide - 0.02;
  if (heavy) thud(a, land, 190, 80, 0.12, kind === "allin" ? 0.55 : 0.4);
  const n = noiseBuffer(a, 0.03);
  const clicks = kind === "allin" ? 9 : heavy ? 6 : 3;
  let at = land;
  for (let i = 0; i < clicks; i++) {
    const vol = (1 - i / (clicks + 2)) * (0.75 + Math.random() * 0.25);
    const freq = (heavy ? 3000 : 3800) + Math.random() * 1400;
    // Clay chips: a dry click plus a tiny ring.
    burst(a, a.destination, n, at, { type: "bandpass", freq, q: 3, vol: vol * 1.2, len: 0.025 });
    tone(freq * 0.8, at, 0.035, vol * (heavy ? 0.09 : 0.11), "triangle");
    at += 0.025 + Math.random() * (heavy ? 0.035 : 0.045);
  }
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
 * Applause for the winner (on the winner's own device only): a small group of friends
 * clapping, each person at their own steady pace and with their own hand sound,
 * in a small room. ~2.4 s, fading out as people stop one by one.
 */
export function playApplause() {
  withAudio((a) => {
    const t0 = a.currentTime + 0.03;
    const out = a.createGain();
    out.gain.value = 1.3;
    // A touch of room: a short feedback echo, low-passed.
    const delay = a.createDelay(0.2);
    delay.delayTime.value = 0.045;
    const fb = a.createGain();
    fb.gain.value = 0.25;
    const damp = a.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2500;
    out.connect(a.destination);
    out.connect(delay).connect(damp).connect(fb).connect(delay);
    fb.connect(a.destination);

    const n = noiseBuffer(a, 0.06);
    const people = 7;
    for (let p = 0; p < people; p++) {
      const rate = 3.6 + Math.random() * 1.6; // claps per second
      const pitch = 900 + Math.random() * 1300; // cupped hands are lower, flat hands brighter
      const loud = 0.35 + Math.random() * 0.3;
      const stop = 1.4 + Math.random() * 1.0; // when this person stops
      let at = t0 + Math.random() * 0.25;
      while (at < t0 + stop) {
        const fade = Math.min(1, (t0 + stop - at) / 0.6);
        const v = loud * fade * (0.85 + Math.random() * 0.3);
        // A real clap: a sharp crack plus a quick body, slightly smeared.
        burst(a, out, n, at, { type: "bandpass", freq: pitch, q: 1.6, vol: v, len: 0.04 });
        burst(a, out, n, at + 0.004, { type: "highpass", freq: 2200, q: 0.7, vol: v * 0.45, len: 0.02 });
        at += (1 / rate) * (0.9 + Math.random() * 0.2);
      }
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
