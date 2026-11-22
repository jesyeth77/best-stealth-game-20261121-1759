// Procedural sound for NIGHTSHIFT: every effect is a tiny WebAudio synth,
// no audio files. A soft ambient drone runs under play; footsteps, the alert
// sting, pickups and the vault chime are short oscillator/noise envelopes.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let drone = null;

  function audioCtx() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    return ctx;
  }

  // One oscillator blip with an attack/decay envelope.
  function beep({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, gain = 0.12, delay = 0 }) {
    if (muted) return;
    const ac = audioCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // One burst of filtered noise with a decay envelope.
  function hiss({ dur = 0.08, gain = 0.1, filterFreq = 1800, delay = 0 }) {
    if (muted) return;
    const ac = audioCtx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const amp = ac.createGain();
    amp.gain.value = gain;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(ac.destination);
    source.start(t0);
  }

  return {
    unlock() {
      const ac = audioCtx();
      if (ac && ac.state === 'suspended') void ac.resume();
    },
    toggleMute() {
      muted = !muted;
      if (muted) this.stopDrone();
      return muted;
    },
    isMuted() {
      return muted;
    },
    startDrone() {
      if (muted || drone) return;
      const ac = audioCtx();
      if (!ac) return;
      const low = ac.createOscillator();
      const low2 = ac.createOscillator();
      const amp = ac.createGain();
      low.type = 'sine';
      low2.type = 'sine';
      low.frequency.value = 55;
      low2.frequency.value = 55.7;
      amp.gain.value = 0.035;
      low.connect(amp);
      low2.connect(amp);
      amp.connect(ac.destination);
      low.start();
      low2.start();
      drone = { low, low2, amp };
    },
    stopDrone() {
      if (!drone) return;
      try {
        drone.low.stop();
        drone.low2.stop();
      } catch {
        // Already stopped.
      }
      drone = null;
    },
    step(sneaking) {
      hiss({ dur: 0.05, gain: sneaking ? 0.03 : 0.07, filterFreq: sneaking ? 500 : 900 });
    },
    coin() {
      beep({ freq: 1900, freqEnd: 2400, type: 'triangle', dur: 0.09, gain: 0.08 });
      hiss({ dur: 0.06, gain: 0.12, filterFreq: 3200, delay: 0.02 });
    },
    pickup() {
      beep({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.1 });
      beep({ freq: 990, type: 'triangle', dur: 0.14, gain: 0.1, delay: 0.08 });
    },
    keycard() {
      beep({ freq: 523, type: 'triangle', dur: 0.12, gain: 0.1 });
      beep({ freq: 659, type: 'triangle', dur: 0.12, gain: 0.1, delay: 0.1 });
      beep({ freq: 784, type: 'triangle', dur: 0.2, gain: 0.1, delay: 0.2 });
    },
    alert() {
      beep({ freq: 220, freqEnd: 440, type: 'sawtooth', dur: 0.35, gain: 0.09 });
      beep({ freq: 233, freqEnd: 466, type: 'sawtooth', dur: 0.35, gain: 0.09, delay: 0.05 });
    },
    caught() {
      beep({ freq: 330, freqEnd: 55, type: 'sawtooth', dur: 0.6, gain: 0.12 });
      hiss({ dur: 0.25, gain: 0.12, filterFreq: 300 });
    },
    levelClear() {
      [523, 659, 784, 1047].forEach((freq, i) =>
        beep({ freq, type: 'triangle', dur: 0.18, gain: 0.1, delay: i * 0.11 }),
      );
    },
    locked() {
      beep({ freq: 160, type: 'square', dur: 0.09, gain: 0.06 });
      beep({ freq: 120, type: 'square', dur: 0.12, gain: 0.06, delay: 0.1 });
    },
    // Short UI blip for menu confirms.
    blip() {
      beep({ freq: 880, type: 'triangle', dur: 0.07, gain: 0.07 });
    },
  };
}
