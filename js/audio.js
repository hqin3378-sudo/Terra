// 分层空间声景：全部由 Web Audio 程序化合成，无音频文件。
// 三层混合随尺度变化 —— 近处恒星风主导，远处宇宙微波背景嗡鸣浮现，
// 中段（星团/旋臂）可听见脉冲星的节律点击。
const lerp = (a, b, t) => a + (b - a) * t;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this._scale = 0.3;
    this._boostKind = null;
    this._boostAmt = 0;
  }

  _build() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // 第一层：CMB 低频嗡鸣（双振荡器微失谐产生拍频）
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    lp.connect(this.droneGain);
    this.droneGain.connect(this.master);
    [[52, 'sine', 0.5], [52.35, 'sine', 0.5], [104.1, 'triangle', 0.1]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start();
    });

    // 第二层：恒星风宽带噪声（带通滤波，频率随尺度移动）
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 900;
    this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // 第三层：脉冲星节律点击（约 1.4 Hz）
    this.pulsarGain = ctx.createGain();
    this.pulsarGain.gain.value = 0;
    this.pulsarGain.connect(this.master);
    this._pulsarTimer = setInterval(() => this._click(), 714);
  }

  _click() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 880 + Math.random() * 440;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(hp).connect(g).connect(this.pulsarGain);
    o.start(t);
    o.stop(t + 0.09);
  }

  // t: 0 = 行星表面, 1 = 深空
  setScale(t) {
    this._scale = t;
    this._apply();
  }

  // 接近音频特征奇点时的增益叠加（沃尔夫-拉叶星星风 / 脉冲星）
  setPoiBoost(kind, amount) {
    this._boostKind = kind;
    this._boostAmt = amount;
    this._apply();
  }

  _apply() {
    if (!this.ctx || !this.enabled) return;
    const t = this._scale;
    const now = this.ctx.currentTime;
    let wind = lerp(0.20, 0.015, t);
    const bell = Math.exp(-((t - 0.55) ** 2) / (2 * 0.18 ** 2));
    let pulsar = bell * 0.22;
    if (this._boostKind === 'wind') wind += this._boostAmt * 0.3;
    if (this._boostKind === 'pulsar') pulsar += this._boostAmt * 0.4;
    this.droneGain.gain.setTargetAtTime(lerp(0.04, 0.30, t), now, 0.5);
    this.windGain.gain.setTargetAtTime(wind, now, 0.5);
    this.windFilter.frequency.setTargetAtTime(lerp(2600, 140, t), now, 0.5);
    this.pulsarGain.gain.setTargetAtTime(pulsar, now, 0.5);
  }

  toggle() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, now, 0.6);
    if (this.enabled) this._apply();
    return this.enabled;
  }
}
