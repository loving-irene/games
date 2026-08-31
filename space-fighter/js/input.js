/*
 * 输入管理：键盘 + PS5 手柄 (DualSense) + 触屏
 * DualSense 标准映射:
 *   buttons: 0=✕ 1=◯ 2=□ 3=△ 4=L1 5=R1 6=L2 7=R2 8=SHARE 9=OPTIONS
 *            12-15=D-pad(上下左右) 16=PS 17=触摸板
 *   axes: 0/1=左摇杆  2/3=右摇杆
 */
(function () {
  'use strict';

  var DEADZONE = 0.18;

  function Input(canvas) {
    this.canvas = canvas;
    this.keys = new Set();

    this.padIndex = -1;
    this.padConnected = false;
    this.padName = '';

    // 每帧聚合状态
    this.moveX = 0;
    this.moveY = 0;
    this.fire = false;

    // 边沿触发（每帧消费一次）
    this._bombEdge = false;
    this._pauseEdge = false;
    this._confirmEdge = false;

    // 手柄按键上一帧状态
    this._prev = {};

    // 触屏
    this.touchActive = false;
    this.touchX = 0;
    this.touchY = 0;

    this.onPadChange = null; // 回调 (connected, name)

    this._bindKeyboard();
    this._bindTouch();
    this._bindGamepadEvents();
  }

  Input.prototype._bindKeyboard = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(k) >= 0) {
        e.preventDefault();
      }
      if (!self.keys.has(k)) {
        if (k === 'KeyK') self._bombEdge = true;
        if (k === 'Escape' || k === 'KeyP') self._pauseEdge = true;
        if (k === 'Space' || k === 'Enter') self._confirmEdge = true;
        if (k === 'ArrowUp' || k === 'KeyW') self._upEdge = true;
        if (k === 'ArrowDown' || k === 'KeyS') self._downEdge = true;
      }
      self.keys.add(k);
    });
    window.addEventListener('keyup', function (e) {
      self.keys.delete(e.code);
    });
  };

  Input.prototype._bindTouch = function () {
    var self = this;
    var el = this.canvas;

    function toLogical(clientX, clientY) {
      var rect = el.getBoundingClientRect();
      var scale = Math.min(rect.width / 540, rect.height / 960);
      var offX = (rect.width - 540 * scale) / 2;
      var offY = (rect.height - 960 * scale) / 2;
      return {
        x: (clientX - rect.left - offX) / scale,
        y: (clientY - rect.top - offY) / scale
      };
    }

    el.addEventListener('pointerdown', function (e) {
      var p = toLogical(e.clientX, e.clientY);
      self.touchActive = true;
      self.touchX = p.x;
      self.touchY = p.y;
      self._confirmEdge = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', function (e) {
      if (!self.touchActive) return;
      var p = toLogical(e.clientX, e.clientY);
      self.touchX = p.x;
      self.touchY = p.y;
    });
    function endTouch() { self.touchActive = false; }
    el.addEventListener('pointerup', endTouch);
    el.addEventListener('pointercancel', endTouch);
  };

  Input.prototype._bindGamepadEvents = function () {
    var self = this;
    window.addEventListener('gamepadconnected', function (e) {
      self.padIndex = e.gamepad.index;
      self.padConnected = true;
      self.padName = e.gamepad.id.replace(/\(.*\)/, '').trim() || '手柄';
      if (self.onPadChange) self.onPadChange(true, self.padName);
    });
    window.addEventListener('gamepaddisconnected', function (e) {
      if (e.gamepad.index === self.padIndex) {
        self.padIndex = -1;
        self.padConnected = false;
        if (self.onPadChange) self.onPadChange(false, '');
      }
    });
  };

  function axis(v) {
    return Math.abs(v) > DEADZONE ? v : 0;
  }

  // 每帧调用：聚合所有输入源
  Input.prototype.poll = function () {
    var mx = 0, my = 0, fire = false;
    var i, b;

    // 键盘
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) mx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) my -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) my += 1;
    if (this.keys.has('Space') || this.keys.has('KeyJ')) fire = true;

    // 手柄
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!gp) {
      // 兜底扫描（部分浏览器需要手动扫描）
      for (i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) { gp = pads[i]; this.padIndex = i; this.padConnected = true; break; }
      }
    }
    if (gp && gp.connected) {
      var ax = axis(gp.axes[0] || 0), ay = axis(gp.axes[1] || 0);
      if (ax) mx += ax;
      if (ay) my += ay;

      b = gp.buttons || [];
      // D-pad 数字方向
      if (b[14] && b[14].pressed) mx -= 1;
      if (b[15] && b[15].pressed) mx += 1;
      if (b[12] && b[12].pressed) my -= 1;
      if (b[13] && b[13].pressed) my += 1;

      // ✕ / R2 / R1 射击
      var cross = b[0] && b[0].pressed;
      var r2 = b[7] && b[7].value > 0.4;
      var r1 = b[5] && b[5].pressed;
      if (cross || r2 || r1) fire = true;

      var pressed = function (idx) { return !!(b[idx] && b[idx].pressed); };

      // ◯ / L1 炸弹（边沿）
      if ((pressed(1) || pressed(4)) && !this._prev.bomb) this._bombEdge = true;
      // OPTIONS 暂停（边沿）
      if (pressed(9) && !this._prev.pause) this._pauseEdge = true;
      // ✕ 确认（边沿，仅菜单用）
      if (pressed(0) && !this._prev.confirm) this._confirmEdge = true;
      // D-pad 上 / 下：菜单导航（边沿）
      if (pressed(12) && !this._prev.dpadUp) this._upEdge = true;
      if (pressed(13) && !this._prev.dpadDown) this._downEdge = true;
      // 左摇杆上 / 下：菜单导航（边沿）
      if (ay < -0.5 && !this._prev.stickUp) this._upEdge = true;
      if (ay > 0.5 && !this._prev.stickDown) this._downEdge = true;

      this._prev.bomb = pressed(1) || pressed(4);
      this._prev.pause = pressed(9);
      this._prev.confirm = pressed(0);
      this._prev.dpadUp = pressed(12);
      this._prev.dpadDown = pressed(13);
      this._prev.stickUp = ay < -0.5;
      this._prev.stickDown = ay > 0.5;
    }

    // 触屏：触摸即开火
    if (this.touchActive) fire = true;

    this.moveX = Math.max(-1, Math.min(1, mx));
    this.moveY = Math.max(-1, Math.min(1, my));
    this.fire = fire;
  };

  Input.prototype.consumeBomb = function () { var v = this._bombEdge; this._bombEdge = false; return v; };
  Input.prototype.consumePause = function () { var v = this._pauseEdge; this._pauseEdge = false; return v; };
  Input.prototype.consumeConfirm = function () { var v = this._confirmEdge; this._confirmEdge = false; return v; };

  // PS5 手柄震动（Chrome / Edge 支持 vibrationActuator）
  Input.prototype.vibrate = function (duration, strong, weak) {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = this.padIndex >= 0 ? pads[this.padIndex] : null;
    var act = gp && gp.vibrationActuator;
    if (act && act.playEffect) {
      try {
        act.playEffect('dual-rumble', {
          startDelay: 0,
          duration: duration || 120,
          strongMagnitude: strong == null ? 1 : strong,
          weakMagnitude: weak == null ? 0.6 : weak
        });
      } catch (e) { /* 忽略不支持的浏览器 */ }
    }
  };

  window.Input = Input;
})();
