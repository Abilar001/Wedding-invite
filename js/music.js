/* ==========================================================================
   Background music — "Two Hearts" (original piano arrangement)
   Generated live with the Web Audio API so the site ships without any
   copyrighted audio file. Loops continuously with smooth fades.
   ========================================================================== */
(function (window) {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var BPM = 72;
  var STEP = (60 / BPM) / 2; // eighth note

  // I – V – vi – IV in D major, voiced for a soft piano feel.
  var PROGRESSION = [
    { bass: 38, notes: [50, 57, 62, 66] }, // D
    { bass: 45, notes: [45, 52, 57, 61] }, // A
    { bass: 47, notes: [47, 54, 59, 62] }, // Bm
    { bass: 43, notes: [43, 50, 55, 59] }  // G
  ];
  var PATTERN = [0, 1, 2, 3, 2, 1, 2, 3];

  function midiToHz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function makeImpulse(ctx, seconds, decay) {
    var rate = ctx.sampleRate;
    var length = Math.floor(rate * seconds);
    var buffer = ctx.createBuffer(2, length, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buffer.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  function Engine() {
    this.ctx = null;
    this.fade = null;
    this.out = null;
    this.convolver = null;
    this.timer = null;
    this.nextNoteTime = 0;
    this.step = 0;
    this.playing = false;
    this.muted = false;
    this.ready = false;
  }

  Engine.prototype.isSupported = function () {
    return !!AC;
  };

  Engine.prototype._init = function () {
    if (this.ctx) return true;
    if (!AC) return false;

    try {
      this.ctx = new AC();
    } catch (err) {
      return false;
    }

    var ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.4;
    this.out.connect(ctx.destination);

    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.fade.connect(this.out);

    if (ctx.createConvolver) {
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = makeImpulse(ctx, 2.4, 2.6);
      var wet = ctx.createGain();
      wet.gain.value = 0.26;
      this.convolver.connect(wet);
      wet.connect(this.out);
    }

    this.ready = true;
    return true;
  };

  Engine.prototype._voice = function (midi, time, velocity) {
    var ctx = this.ctx;
    var freq = midiToHz(midi);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(velocity, time + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + 2.6);
    gain.connect(this.fade);
    if (this.convolver) gain.connect(this.convolver);

    var main = ctx.createOscillator();
    main.type = 'triangle';
    main.frequency.value = freq;

    var upper = ctx.createOscillator();
    upper.type = 'sine';
    upper.frequency.value = freq * 2.002;

    var upperGain = ctx.createGain();
    upperGain.gain.value = 0.24;

    main.connect(gain);
    upper.connect(upperGain);
    upperGain.connect(gain);

    var stopAt = time + 2.8;
    main.start(time);
    upper.start(time);
    main.stop(stopAt);
    upper.stop(stopAt);
  };

  Engine.prototype._step = function (index, time) {
    var chord = PROGRESSION[Math.floor(index / 8) % PROGRESSION.length];
    var beat = index % 8;
    var midi = chord.notes[PATTERN[beat]];

    this._voice(midi, time, beat === 0 ? 0.16 : 0.105);
    if (beat === 0 || beat === 4) this._voice(chord.bass, time, 0.14);
    if (beat === 4) this._voice(midi + 12, time, 0.075);
  };

  Engine.prototype._tick = function () {
    if (!this.ctx) return;
    var horizon = this.ctx.currentTime + 0.5;
    while (this.nextNoteTime < horizon) {
      this._step(this.step, this.nextNoteTime);
      this.nextNoteTime += STEP;
      this.step++;
    }
  };

  Engine.prototype.play = function () {
    if (!this._init()) return false;
    var ctx = this.ctx;

    var start = function () {
      this.playing = true;
      this.nextNoteTime = ctx.currentTime + 0.08;

      var now = ctx.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(this.muted ? 0 : 0.4, now);
      this.fade.gain.cancelScheduledValues(now);
      this.fade.gain.setValueAtTime(Math.max(this.fade.gain.value, 0.0001), now);
      this.fade.gain.linearRampToValueAtTime(1, now + 2.4);

      if (this.timer) window.clearInterval(this.timer);
      this.timer = window.setInterval(this._tick.bind(this), 120);
      this._tick();
    }.bind(this);

    if (ctx.state === 'suspended') {
      var resumed = ctx.resume();
      if (resumed && typeof resumed.then === 'function') {
        resumed.then(start).catch(function () { /* autoplay still blocked */ });
      } else {
        start();
      }
    } else {
      start();
    }
    return true;
  };

  Engine.prototype.pause = function () {
    if (!this.ctx || !this.playing) return;
    var ctx = this.ctx;
    var now = ctx.currentTime;

    this.playing = false;
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setValueAtTime(this.fade.gain.value, now);
    this.fade.gain.linearRampToValueAtTime(0.0001, now + 0.9);

    window.setTimeout(function () {
      if (this.playing) return;
      if (this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
      if (ctx.state === 'running') ctx.suspend();
    }.bind(this), 1000);
  };

  Engine.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (!this.out) return;
    var now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(this.muted ? 0 : 0.4, now + 0.35);
  };

  window.WeddingMusic = new Engine();
}(window));
