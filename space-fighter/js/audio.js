/*
 * 音效：WebAudio 程序化合成，无外部资源
 */
(function () {
  'use strict';

  function AudioFX() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  AudioFX.prototype.ensure = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      // 音乐专用输出链（独立于音效，音量独立控制）
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.musicGain.connect(this.master);
      // 预生成白噪声缓冲，供音乐鼓组高频复用
      var len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  };

  AudioFX.prototype.tone = function (opt) {
    if (this.muted || !this.ensure()) return;
    var t0 = this.ctx.currentTime + (opt.delay || 0);
    var osc = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    osc.type = opt.type || 'square';
    osc.frequency.setValueAtTime(opt.freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.end || opt.freq), t0 + (opt.dur || 0.1));
    g.gain.setValueAtTime(opt.vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (opt.dur || 0.1));
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + (opt.dur || 0.1) + 0.02);
  };

  AudioFX.prototype.noise = function (opt) {
    if (this.muted || !this.ensure()) return;
    var dur = opt.dur || 0.3;
    var t0 = this.ctx.currentTime;
    var len = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    var filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(opt.from || 3000, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to || 200), t0 + dur);
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(opt.vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur);
  };

  AudioFX.prototype.shoot = function () {
    this.tone({ freq: 920, end: 240, type: 'square', dur: 0.07, vol: 0.06 });
  };

  AudioFX.prototype.enemyShoot = function () {
    this.tone({ freq: 320, end: 140, type: 'sawtooth', dur: 0.09, vol: 0.05 });
  };

  AudioFX.prototype.explodeSmall = function () {
    this.noise({ dur: 0.22, vol: 0.28, from: 2600, to: 160 });
  };

  AudioFX.prototype.explodeBig = function () {
    this.noise({ dur: 0.7, vol: 0.5, from: 3200, to: 60 });
    this.tone({ freq: 130, end: 36, type: 'sawtooth', dur: 0.55, vol: 0.3 });
  };

  AudioFX.prototype.hit = function () {
    this.noise({ dur: 0.16, vol: 0.3, from: 1800, to: 120 });
    this.tone({ freq: 220, end: 70, type: 'sawtooth', dur: 0.18, vol: 0.22 });
  };

  AudioFX.prototype.shieldBreak = function () {
    this.tone({ freq: 700, end: 90, type: 'triangle', dur: 0.3, vol: 0.25 });
  };

  AudioFX.prototype.powerup = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) {
      self.tone({ freq: f, type: 'square', dur: 0.09, vol: 0.12, delay: i * 0.07 });
    });
  };

  AudioFX.prototype.bomb = function () {
    this.noise({ dur: 1.1, vol: 0.55, from: 4000, to: 40 });
    this.tone({ freq: 90, end: 30, type: 'sawtooth', dur: 0.9, vol: 0.35 });
  };

  AudioFX.prototype.alarm = function () {
    var self = this;
    [0, 0.28, 0.56].forEach(function (d) {
      self.tone({ freq: 660, end: 660, type: 'square', dur: 0.16, vol: 0.14, delay: d });
      self.tone({ freq: 494, end: 494, type: 'square', dur: 0.16, vol: 0.14, delay: d + 0.14 });
    });
  };

  AudioFX.prototype.select = function () {
    this.tone({ freq: 760, end: 980, type: 'square', dur: 0.08, vol: 0.12 });
  };

  /* ===================== 背景音乐：程序化循环（A 小调，lookahead 调度器） ===================== */

  var MUSIC = {
    bpm: { normal: 132, boss: 152 },
    bass: { // 16 步中每 2 步一个音
      normal: [45, 45, 48, 50, 45, 45, 43, 40],
      boss:   [45, 45, 46, 47, 45, 45, 41, 43]
    },
    arp: { // 每步一个音
      normal: [69, 72, 76, 72, 67, 71, 74, 71, 69, 72, 76, 72, 76, 79, 76, 72],
      boss:   [81, 84, 88, 84, 81, 84, 88, 91, 88, 84, 81, 84, 88, 84, 91, 88]
    }
  };

  function ntf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // 定时播放一个音符到 musicGain（用于精确调度）
  AudioFX.prototype._vosc = function (freq, t, dur, type, vol) {
    var osc = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  };

  AudioFX.prototype._mKick = function (t) {
    var osc = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + 0.16);
  };

  AudioFX.prototype._mHat = function (t) {
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    var hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(this.musicGain);
    src.start(t); src.stop(t + 0.06);
  };

  AudioFX.prototype._mSnare = function (t) {
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    var bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp); bp.connect(g); g.connect(this.musicGain);
    src.start(t); src.stop(t + 0.2);
  };

  AudioFX.prototype.startMusic = function (mode) {
    if (!this.ensure()) return;
    var want = mode || 'normal';
    if (this._musicTimer) {
      this._musicMode = want; // 已在播放：仅切换模式
      return;
    }
    this._musicMode = want;
    this._musicStep = 0;
    this._musicNext = this.ctx.currentTime + 0.06;
    var self = this;
    this._musicTimer = setInterval(function () { self._scheduleMusic(); }, 25);
  };

  AudioFX.prototype.stopMusic = function () {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    this._musicMode = null;
  };

  AudioFX.prototype.setMusicMode = function (mode) {
    if (this._musicTimer) this._musicMode = mode;
  };

  // lookahead 调度：25ms 轮询，提前 0.12s 排入 WebAudio 时间轴
  AudioFX.prototype._scheduleMusic = function () {
    if (!this.ctx || !this._musicTimer) return;
    if (this.muted) { this._musicNext = this.ctx.currentTime + 0.06; return; } // 静音时保持时钟同步
    var bpm = MUSIC.bpm[this._musicMode] || 132;
    var stepDur = 60 / bpm / 4;
    while (this._musicNext < this.ctx.currentTime + 0.12) {
      var s = this._musicStep % 16;
      var t = this._musicNext;
      // 贝斯：每 2 步
      if (s % 2 === 0) {
        this._vosc(ntf(MUSIC.bass[this._musicMode][(s / 2) % 8]), t, stepDur * 1.8, 'sawtooth', 0.16);
      }
      // 琶音：每步
      this._vosc(ntf(MUSIC.arp[this._musicMode][s]), t, stepDur * 0.9, 'square', 0.05);
      // 鼓组
      if (s % 4 === 0) this._mKick(t);
      if (this._musicMode === 'boss' ? s % 2 === 1 : s % 4 === 2) this._mHat(t);
      if (s === 8) this._mSnare(t);
      this._musicNext += stepDur;
      this._musicStep++;
    }
  };

  /* ===================== 扩展音效 ===================== */

  // 波次开始
  AudioFX.prototype.waveStart = function () {
    var self = this;
    [440, 554, 659].forEach(function (f, i) {
      self.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.12, delay: i * 0.09 });
    });
  };

  // 治疗包（H）
  AudioFX.prototype.heal = function () {
    var self = this;
    [523, 659, 784].forEach(function (f, i) {
      self.tone({ freq: f, type: 'sine', dur: 0.12, vol: 0.14, delay: i * 0.06 });
    });
  };

  // 护盾包（S）
  AudioFX.prototype.shieldOn = function () {
    this.tone({ freq: 300, end: 900, type: 'sine', dur: 0.25, vol: 0.15 });
    this.tone({ freq: 450, end: 1350, type: 'triangle', dur: 0.25, vol: 0.1 });
  };

  // 炸弹包（B）
  AudioFX.prototype.bombPick = function () {
    this.tone({ freq: 200, end: 500, type: 'square', dur: 0.12, vol: 0.12 });
    this.tone({ freq: 400, end: 1000, type: 'square', dur: 0.14, vol: 0.1, delay: 0.1 });
  };

  // 阶段内升级（1-5 级）
  AudioFX.prototype.levelup = function () {
    var self = this;
    [659, 784, 988].forEach(function (f, i) {
      self.tone({ freq: f, type: 'square', dur: 0.09, vol: 0.12, delay: i * 0.06 });
    });
  };

  // 进化（阶段提升）：华丽琶音 + 上滑尾音
  AudioFX.prototype.evolve = function () {
    var self = this;
    [523, 659, 784, 1047, 1319].forEach(function (f, i) {
      self.tone({ freq: f, type: 'square', dur: 0.11, vol: 0.13, delay: i * 0.07 });
    });
    this.tone({ freq: 660, end: 1760, type: 'sawtooth', dur: 0.5, vol: 0.1, delay: 0.4 });
  };

  // Boss 击败：胜利琶音
  AudioFX.prototype.bossDefeated = function () {
    var self = this;
    [784, 988, 1175, 1568].forEach(function (f, i) {
      self.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.15, delay: i * 0.11 });
    });
    this.tone({ freq: 1568, type: 'triangle', dur: 0.5, vol: 0.14, delay: 0.48 });
  };

  // 玩家死亡：下行音
  AudioFX.prototype.playerDie = function () {
    var self = this;
    [440, 349, 262, 175].forEach(function (f, i) {
      self.tone({ freq: f, type: 'sawtooth', dur: 0.22, vol: 0.18, delay: i * 0.18 });
    });
  };

  // 游戏结束：低沉下行
  AudioFX.prototype.gameoverJingle = function () {
    var self = this;
    [392, 330, 262, 196].forEach(function (f, i) {
      self.tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.16, delay: i * 0.26 });
    });
  };

  window.AudioFX = AudioFX;
  window.sfx = new AudioFX();
})();
