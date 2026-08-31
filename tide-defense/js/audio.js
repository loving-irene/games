/*
 * 音效：WebAudio 程序化合成，无外部资源
 * 简单音效 + 低沉海浪环境声
 */
(function () {
  'use strict';

  function AudioFX() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ambient = null;   // 海浪环境声节点
  }

  AudioFX.prototype.ensure = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
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
    filter.type = opt.type || 'lowpass';
    filter.frequency.setValueAtTime(opt.from || 3000, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to || 200), t0 + dur);
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(opt.vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur);
  };

  /* ---------- 游戏音效 ---------- */

  AudioFX.prototype.shoot = function () {
    this.tone({ freq: 880, end: 260, type: 'square', dur: 0.06, vol: 0.045 });
  };

  AudioFX.prototype.hit = function () {
    this.tone({ freq: 420, end: 180, type: 'triangle', dur: 0.05, vol: 0.08 });
  };

  AudioFX.prototype.enemyDie = function () {
    this.noise({ dur: 0.22, vol: 0.22, from: 2200, to: 140 });
  };

  AudioFX.prototype.hurt = function () {
    this.noise({ dur: 0.28, vol: 0.34, from: 1400, to: 90 });
    this.tone({ freq: 180, end: 60, type: 'sawtooth', dur: 0.24, vol: 0.24 });
  };

  // 低血量红色脉冲警报（每周期一声）
  AudioFX.prototype.alarmBlip = function () {
    this.tone({ freq: 660, end: 660, type: 'square', dur: 0.12, vol: 0.1 });
    this.tone({ freq: 494, end: 494, type: 'square', dur: 0.12, vol: 0.1, delay: 0.14 });
  };

  AudioFX.prototype.select = function () {
    this.tone({ freq: 760, end: 980, type: 'square', dur: 0.08, vol: 0.12 });
  };

  // 拾取道具：上行琶音
  AudioFX.prototype.powerup = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) {
      self.tone({ freq: f, end: f, type: 'square', dur: 0.09, vol: 0.12, delay: i * 0.07 });
    });
  };

  AudioFX.prototype.gameover = function () {
    var self = this;
    [392, 330, 262, 175].forEach(function (f, i) {
      self.tone({ freq: f, end: f * 0.92, type: 'triangle', dur: 0.4, vol: 0.2, delay: i * 0.3 });
    });
  };

  /* ---------- 海浪环境声：循环噪声 + 低通 ---------- */

  AudioFX.prototype.startAmbient = function () {
    if (this.muted || !this.ensure() || this.ambient) return;
    var dur = 3;
    var len = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    var g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.09, this.ctx.currentTime + 1.5);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(0);
    this.ambient = { src: src, gain: g };
  };

  AudioFX.prototype.stopAmbient = function () {
    if (!this.ambient) return;
    var a = this.ambient;
    this.ambient = null;
    try {
      a.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8);
      a.src.stop(this.ctx.currentTime + 0.9);
    } catch (e) { /* 忽略 */ }
  };

  window.sfx = new AudioFX();
})();
