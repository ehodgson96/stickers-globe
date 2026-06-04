export function createAudio() {
  let ctx = null;
  let enabled = false;
  let ambientGain = null;
  let ambientCreated = false;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    ctx.resume();
    return ctx;
  }

  function createAmbient() {
    if (ambientCreated) return;
    ambientCreated = true;
    const c = getCtx();

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    ambientGain = c.createGain();
    ambientGain.gain.value = 0;

    const osc1 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;

    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55.5;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(c.destination);

    osc1.start();
    osc2.start();
  }

  function playTone(freq, duration, gainPeak, type = 'sine') {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0;

    osc.connect(gain);
    gain.connect(c.destination);

    const now = c.currentTime;
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  let beamOsc = null;
  let beamLfo = null;
  let beamGainNode = null;

  return {
    startBeam() {
      if (!enabled || beamOsc) return;
      const c = getCtx();
      const now = c.currentTime;

      beamGainNode = c.createGain();
      beamGainNode.gain.setValueAtTime(0, now);
      beamGainNode.gain.linearRampToValueAtTime(0.03, now + 0.1);
      beamGainNode.connect(c.destination);

      beamOsc = c.createOscillator();
      beamOsc.type = 'sawtooth';
      beamOsc.frequency.value = 180;
      beamOsc.connect(beamGainNode);
      beamOsc.start(now);

      // LFO to wobble the pitch slightly
      beamLfo = c.createOscillator();
      beamLfo.type = 'sine';
      beamLfo.frequency.value = 6;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 12;
      beamLfo.connect(lfoGain);
      lfoGain.connect(beamOsc.frequency);
      beamLfo.start(now);
    },

    stopBeam() {
      if (!beamOsc) return;
      const c = getCtx();
      const now = c.currentTime;
      beamGainNode.gain.linearRampToValueAtTime(0, now + 0.08);
      beamOsc.stop(now + 0.1);
      beamLfo.stop(now + 0.1);
      beamOsc = null;
      beamLfo = null;
      beamGainNode = null;
    },

    toggle() {
      createAmbient();
      const c = getCtx();
      enabled = !enabled;
      const now = c.currentTime;
      if (enabled) {
        ambientGain.gain.linearRampToValueAtTime(0.022, now + 0.8);
      } else {
        ambientGain.gain.linearRampToValueAtTime(0, now + 0.8);
      }
      return enabled;
    },

    playSelect() {
      if (!enabled) return;
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sine';
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(c.destination);

      const now = c.currentTime;
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.linearRampToValueAtTime(440, now + 0.25);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.3);
    },

    playSecret() {
      if (!enabled) return;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          playTone(freq, 0.18, 0.2, 'sine');
        }, i * 100);
      });
    },

    playAbduct() {
      if (!enabled) return;
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sawtooth';
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(c.destination);

      const now = c.currentTime;
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.7);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

      osc.start(now);
      osc.stop(now + 0.75);
    },

    playGameOver() {
      if (!enabled) return;
      const notes = [440, 349, 293, 220];
      notes.forEach((freq, i) => {
        setTimeout(() => {
          playTone(freq, 0.4, 0.2, 'sine');
        }, i * 150);
      });
    },

    isEnabled() {
      return enabled;
    }
  };
}
