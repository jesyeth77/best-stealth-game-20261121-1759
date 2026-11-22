// Procedural sound: every effect is a tiny WebAudio synth, no audio files.
// A soft ambient drone runs under play; footsteps, alert stings, pickups and
// the vault chime are all short oscillator/noise envelopes.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let drone = null;

  function ensure() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    return ctx;
  }

  function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, gain = 0.12, delay = 0 }) {
    if (muted) return;
    const ac = ensure();
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

  function noiseBurst({ dur = 0.08, gain = 0.1, filterFreq = 1800, delay = 0 }) {
    if (muted) return;
    const ac = ensure();
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
      const ac = ensure();
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
      const ac = ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const osc2 = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = 'sine';
      osc2.type = 'sine';
      osc.frequency.value = 55;
      osc2.frequency.value = 55.7;
      amp.gain.value = 0.035;
      osc.connect(amp);
      osc2.connect(amp);
      amp.connect(ac.destination);
      osc.start();
      osc2.start();
      drone = { osc, osc2, amp };
    },
    stopDrone() {
      if (!drone) return;
      try {
        drone.osc.stop();
        drone.osc2.stop();
      } catch {
        // Already stopped.
      }
      drone = null;
    },
    step(sneaking) {
      noiseBurst({ dur: 0.05, gain: sneaking ? 0.03 : 0.07, filterFreq: sneaking ? 500 : 900 });
    },
    // Short UI blip for menu confirms.
    blip() {
      tone({ freq: 880, type: 'triangle', dur: 0.07, gain: 0.07 });
    },
    coin() {
      tone({ freq: 1900, freqEnd: 2400, type: 'triangle', dur: 0.09, gain: 0.08 });
      noiseBurst({ dur: 0.06, gain: 0.12, filterFreq: 3200, delay: 0.02 });
    },
    pickup() {
      tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.1 });
      tone({ freq: 990, type: 'triangle', dur: 0.14, gain: 0.1, delay: 0.08 });
    },
    keycard() {
      tone({ freq: 523, type: 'triangle', dur: 0.12, gain: 0.1 });
      tone({ freq: 659, type: 'triangle', dur: 0.12, gain: 0.1, delay: 0.1 });
      tone({ freq: 784, type: 'triangle', dur: 0.2, gain: 0.1, delay: 0.2 });
    },
    alert() {
      tone({ freq: 220, freqEnd: 440, type: 'sawtooth', dur: 0.35, gain: 0.09 });
      tone({ freq: 233, freqEnd: 466, type: 'sawtooth', dur: 0.35, gain: 0.09, delay: 0.05 });
    },
    caught() {
      tone({ freq: 330, freqEnd: 55, type: 'sawtooth', dur: 0.6, gain: 0.12 });
      noiseBurst({ dur: 0.25, gain: 0.12, filterFreq: 300 });
    },
    levelClear() {
      [523, 659, 784, 1047].forEach((freq, i) =>
        tone({ freq, type: 'triangle', dur: 0.18, gain: 0.1, delay: i * 0.11 }),
      );
    },
    locked() {
      tone({ freq: 160, type: 'square', dur: 0.09, gain: 0.06 });
      tone({ freq: 120, type: 'square', dur: 0.12, gain: 0.06, delay: 0.1 });
    },
  };
}
