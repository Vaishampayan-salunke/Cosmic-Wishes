// All sound is synthesised with the Web Audio API — no audio files to download.
const PENTA = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25, 739.99];

export class AudioFX {
  constructor() {
    this.ctx = null; this.master = null; this.ambient = false; this.timer = null;
    let saved = null; try { saved = localStorage.getItem('cw_sound'); } catch { /* ignore */ }
    this.enabled = saved !== 'off';
    this.unlocked = false;
    this.onChange = null;
  }
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
    return true;
  }
  // must be called from a user gesture
  async unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch { /* ignore */ } }
    this.unlocked = true;
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0, t, 0.4);
    if (this.enabled && this.unlocked) this.startAmbient(); else this.stopAmbient();
    this.onChange && this.onChange(this.enabled);
  }
  async setEnabled(v) {
    this.enabled = v; try { localStorage.setItem('cw_sound', v ? 'on' : 'off'); } catch { /* ignore */ }
    if (v) await this.unlock(); else this.apply();
  }
  startAmbient() {
    if (this.ambient || !this.ctx) return; this.ambient = true;
    const c = this.ctx, t = c.currentTime;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 760; lp.Q.value = 0.4;
    const pad = c.createGain(); pad.gain.value = 0.0; pad.gain.setTargetAtTime(0.16, t, 3);
    lp.connect(pad); pad.connect(this.master);
    this.padNodes = [];
    [[110, 'sine'], [164.81, 'sine'], [220, 'triangle'], [277.18, 'sine'], [329.63, 'triangle']].forEach(([f, type], i) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = (i - 2) * 4;
      const g = c.createGain(); g.gain.value = 0.2;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + i * 0.019;
      const lg = c.createGain(); lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(lp); o.start(); lfo.start(); this.padNodes.push(o, lfo);
    });
    // faint "space wind"
    const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const n = c.createBufferSource(); n.buffer = buf; n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.05;
    n.connect(nf); nf.connect(ng); ng.connect(this.master); n.start(); this.padNodes.push(n);
    this.padGain = pad;
    const sparkle = () => {
      if (!this.ambient) return;
      this.bell(PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.3 ? 2 : 1), 0.045, 3.2);
      this.timer = setTimeout(sparkle, 5000 + Math.random() * 8000);
    };
    this.timer = setTimeout(sparkle, 3000);
  }
  stopAmbient() {
    if (!this.ambient) return; this.ambient = false; clearTimeout(this.timer);
    const c = this.ctx, nodes = this.padNodes || [];
    if (this.padGain) this.padGain.gain.setTargetAtTime(0, c.currentTime, 0.4);
    setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch { /* ignore */ } }); }, 1800);
    this.padNodes = [];
  }
  bell(freq, vol = 0.12, dur = 2.2, when = 0) {
    if (!this.ctx || !this.enabled || !this.unlocked) return;
    const c = this.ctx, t = c.currentTime + when;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    [[1, 'sine', 1], [2.01, 'sine', 0.35], [3.98, 'triangle', 0.12]].forEach(([m, type, a]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq * m;
      const og = c.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
    });
  }
  chime() { [523.25, 659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.bell(f, 0.13, 2.6, i * 0.11)); }
  twinkle() { this.bell(1174.66, 0.1, 1.4); this.bell(1567.98, 0.06, 1.2, 0.09); }
  catchSound() { this.bell(880, 0.12, 1.6); this.bell(1318.5, 0.1, 1.6, 0.1); }
  soft() { this.bell(659.25, 0.07, 1.1); }
  whoosh() {
    if (!this.ctx || !this.enabled || !this.unlocked) return;
    const c = this.ctx, t = c.currentTime, dur = 1.9;
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.85);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  }
}
