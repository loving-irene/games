/*
 * 输入管理：键盘 + 手柄（含 PS5 DualSense 适配）+ 触屏
 *
 * 手柄标准映射（mapping === 'standard'，Xbox / 被系统正确识别的手柄）:
 *   buttons: 0=✕(A) 9=OPTIONS(Start) 14/15=D-pad左右 16=PS 17=触摸板
 *   axes:    0/1=左摇杆
 *
 * PS5 DualSense 原始映射（mapping === ''，部分浏览器 / 驱动下出现）:
 *   buttons: 0=□ 1=✕ 2=◯ 3=△ 9=OPTIONS 12=PS键 13=触摸板点击
 *   axes:    0/1=左摇杆  9=D-pad帽状开关（值*7 取整：0上 2右 4下 6左）
 *
 * 本作只需左右移动 + 确认 + 暂停（射击全自动）
 */
(function () {
  'use strict';

  var DEADZONE = 0.18;

  // 是否为索尼系手柄的原始（非标准）映射
  function isSonyRaw(gp) {
    if (!gp || gp.mapping === 'standard') return false;
    return /054c|0ce6|0e5f|dualsense|dualshock|wireless controller/i.test(gp.id);
  }

  // 读取 D-pad 帽状开关方向：-1=中位，0=上 1=右上 2=右 3=右下 4=下 5=左下 6=左 7=左上
  function hatDir(gp) {
    var v = gp.axes[9];
    if (v == null || v < -0.5 || v > 1.5) return -1;
    return Math.round(v * 7) % 8;
  }

  function Input(canvas) {
    this.canvas = canvas;
    this.keys = new Set();

    this.padIndex = -1;
    this.padConnected = false;
    this.padName = '';
    this._padAnnounced = false;

    // 每帧聚合状态
    this.moveX = 0;

    // 触屏（逻辑坐标 960x540）
    this.touchActive = false;
    this.touchX = 0;
    this.touchY = 0;

    // 边沿触发（每帧消费一次）
    this._pauseEdge = false;
    this._confirmEdge = false;
    this._prev = {};

    this.onPadChange = null; // 回调 (connected, name)

    this._bindKeyboard();
    this._bindTouch();
    this._bindGamepadEvents();
  }

  Input.prototype._bindKeyboard = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = e.code;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(k) >= 0) {
        e.preventDefault();
      }
      if (!self.keys.has(k)) {
        if (k === 'Escape' || k === 'KeyP') self._pauseEdge = true;
        if (k === 'Space' || k === 'Enter') self._confirmEdge = true;
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
      var scale = Math.min(rect.width / 960, rect.height / 540);
      var offX = (rect.width - 960 * scale) / 2;
      var offY = (rect.height - 540 * scale) / 2;
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
      self._padAnnounced = true;
      if (self.onPadChange) self.onPadChange(true, self.padName);
    });
    window.addEventListener('gamepaddisconnected', function (e) {
      if (e.gamepad.index === self.padIndex) {
        self.padIndex = -1;
        self.padConnected = false;
        self._padAnnounced = false;
        if (self.onPadChange) self.onPadChange(false, '');
      }
    });
  };

  function axis(v) {
    return Math.abs(v) > DEADZONE ? v : 0;
  }

  // 每帧调用：聚合所有输入源
  Input.prototype.poll = function () {
    var mx = 0;
    var i;

    // 键盘
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) mx += 1;

    // 手柄
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!gp) {
      // 兜底扫描（页面加载前已连接 / 部分浏览器需要手动扫描）
      for (i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) {
          gp = pads[i];
          this.padIndex = i;
          this.padConnected = true;
          if (!this._padAnnounced) { // 补发连接通知
            this.padName = gp.id.replace(/\(.*\)/, '').trim() || '手柄';
            this._padAnnounced = true;
            if (this.onPadChange) this.onPadChange(true, this.padName);
          }
          break;
        }
      }
    }

    if (gp && gp.connected) {
      var b = gp.buttons || [];
      var pressed = function (idx) { return !!(b[idx] && b[idx].pressed); };

      // 左摇杆（三种映射都在 axes[0]）
      var ax = axis(gp.axes[0] || 0);
      if (ax) mx += ax;

      var confirmNow = false, pauseNow = false;

      if (gp.mapping === 'standard') {
        // 标准映射：D-pad 在按钮 14/15
        if (pressed(14)) mx -= 1;
        if (pressed(15)) mx += 1;
        confirmNow = pressed(0) || pressed(16) || pressed(17); // ✕ / PS键 / 触摸板
        pauseNow = pressed(9);                                 // OPTIONS / Start
      } else if (isSonyRaw(gp)) {
        // PS5 DualSense 原始映射：✕=1，十字键在 axes[9] 帽状开关
        var hat = hatDir(gp);
        if (hat === 6 || hat === 5 || hat === 7) mx -= 1; // 左 / 左下 / 左上
        if (hat === 2 || hat === 1 || hat === 3) mx += 1; // 右 / 右上 / 右下
        confirmNow = pressed(1) || pressed(13) || pressed(12); // ✕ / 触摸板 / PS键
        pauseNow = pressed(9);                                 // OPTIONS
      } else {
        // 其他未知手柄：尽力兼容常见布局
        if (pressed(14)) mx -= 1;
        if (pressed(15)) mx += 1;
        confirmNow = pressed(0) || pressed(1); // A 或 ✕
        pauseNow = pressed(9);                 // Start / OPTIONS
      }

      if (pauseNow && !this._prev.pause) this._pauseEdge = true;
      if (confirmNow && !this._prev.confirm) this._confirmEdge = true;
      this._prev.pause = pauseNow;
      this._prev.confirm = confirmNow;
    }

    this.moveX = Math.max(-1, Math.min(1, mx));
  };

  Input.prototype.consumePause = function () { var v = this._pauseEdge; this._pauseEdge = false; return v; };
  Input.prototype.consumeConfirm = function () { var v = this._confirmEdge; this._confirmEdge = false; return v; };

  // 手柄震动（PS5 / Xbox 在 Chrome / Edge 支持 vibrationActuator）
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
