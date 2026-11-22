// Bayang Pasar Malam — all sound is synthesised with WebAudio, no audio files:
// soft footsteps, the guard's heavier steps when close, a coin clink, the alarm
// sting, a caught buzz and a win jingle. Nothing plays until the first gesture,
// so the autoplay policy is never fought. Mute with M.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let cricketTimer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      startCrickets();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!context || muted) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!context || muted) return;
    const t0 = context.currentTime;
    const len = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  function startCrickets() {
    // A quiet night: a short high chirp every couple of seconds.
    const chirp = () => {
      if (!muted) tone(4200 + Math.random() * 600, 0.05, 'sine', 0.015);
      cricketTimer = window.setTimeout(chirp, 1800 + Math.random() * 2400);
    };
    cricketTimer = window.setTimeout(chirp, 1200);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    footstep(sneaking) {
      if (!ensure()) return;
      noiseBurst(sneaking ? 0.05 : 0.07, sneaking ? 0.05 : 0.12, sneaking ? 500 : 900);
    },
    guardStep(distance) {
      if (!ensure()) return;
      const vol = Math.max(0.02, 0.16 * (1 - distance / 320));
      noiseBurst(0.09, vol, 420);
    },
    coinThrow() {
      tone(1800, 0.08, 'sine', 0.1, 0, 900);
    },
    coinLand() {
      tone(2400, 0.05, 'triangle', 0.14);
      tone(3100, 0.07, 'triangle', 0.1, 0.06);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.16);
      tone(880, 0.09, 'sine', 0.16, 0.08);
      tone(1320, 0.14, 'sine', 0.14, 0.16);
    },
    alarm() {
      tone(392, 0.16, 'square', 0.12);
      tone(311, 0.22, 'square', 0.12, 0.14);
    },
    caught() {
      tone(220, 0.5, 'sawtooth', 0.14, 0, 110);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.12));
    },
    dispose() {
      if (cricketTimer !== null) window.clearTimeout(cricketTimer);
      if (context) context.close().catch(() => {});
    },
  };
}
