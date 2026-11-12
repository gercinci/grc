// Basit sentez motor sesi ve korna (WebAudio). İlk kullanıcı etkileşiminden sonra başlar.
export function createAudio() {
  let ctx = null, osc, osc2, gain, filter, horn, hornGain;
  let muted = false;
  return {
    start() {
      if (ctx) { ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        osc = ctx.createOscillator(); osc.type = 'sawtooth';
        osc2 = ctx.createOscillator(); osc2.type = 'square';
        filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
        gain = ctx.createGain(); gain.gain.value = 0;
        osc.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        horn = ctx.createOscillator(); horn.type = 'square'; horn.frequency.value = 415;
        hornGain = ctx.createGain(); hornGain.gain.value = 0;
        horn.connect(hornGain); hornGain.connect(ctx.destination);
        osc.start(); osc2.start(); horn.start();
      } catch { ctx = null; }
    },
    // rpm01: 0..1, load: gaz; active: araçta mı
    engine(active, rpm01, load, electric) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const f = electric ? 180 + rpm01 * 900 : 38 + rpm01 * 150;
      osc.frequency.setTargetAtTime(f, t, 0.05);
      osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      filter.frequency.setTargetAtTime(electric ? 1200 : 250 + rpm01 * 900 + load * 500, t, 0.08);
      const vol = !active || muted ? 0 : electric ? 0.012 + rpm01 * 0.02 : 0.035 + load * 0.035 + rpm01 * 0.02;
      gain.gain.setTargetAtTime(vol, t, 0.08);
    },
    horn(on) { if (ctx) hornGain.gain.setTargetAtTime(on && !muted ? 0.06 : 0, ctx.currentTime, 0.01); },
    setMuted(v) { muted = v; },
    get muted() { return muted; },
    suspend() { ctx?.suspend(); },
  };
}
