/* ==========================================================================
   Background music — "When God Made You" (piano karaoke instrumental)
   Played through the official YouTube IFrame player, which is the only way to
   use a YouTube track on a website without ripping its audio. The player sits
   in a 1px-clipped card so guests never see the embed; the iframe keeps its
   real 200x113 size inside, which is what keeps playback healthy.

   If the browser refuses to start audio without a gesture, the card is shown
   long enough for one tap and hides itself again once the song is playing.

   The script is loaded on the first press, not on page load, so the
   invitation makes no third-party request until a guest asks for music.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var VIDEO_ID = 'hWCzG6unIUw';
  var API_SRC = 'https://www.youtube.com/iframe_api';
  var EMBED_HOST = 'https://www.youtube-nocookie.com';

  function Engine() {
    this.player = null;
    this.ready = false;
    this.playing = false;
    this.muted = false;
    this.requested = false;
    this.guard = null;
    this.onChange = null;
  }

  Engine.prototype.isSupported = function () {
    return typeof document !== 'undefined';
  };

  Engine.prototype._emit = function () {
    if (typeof this.onChange === 'function') this.onChange(this.playing);
  };

  /* The card exists only once the player does, so a failed embed never leaves
     an empty hole in the layout. It stays clipped unless playback needs a tap. */
  Engine.prototype._mount = function () {
    var panel = document.getElementById('musicPlayer');
    if (panel) {
      panel.removeAttribute('hidden');
      panel.removeAttribute('aria-hidden');
    }
  };

  Engine.prototype._show = function () {
    var panel = document.getElementById('musicPlayer');
    if (panel) panel.classList.add('is-visible');
  };

  Engine.prototype._hide = function () {
    var panel = document.getElementById('musicPlayer');
    if (panel) panel.classList.remove('is-visible');
  };

  Engine.prototype._loadApi = function (done) {
    if (window.YT && window.YT.Player) {
      done();
      return;
    }

    if (!window.__kjYtQueue) {
      window.__kjYtQueue = [];
      window.onYouTubeIframeAPIReady = function () {
        var queue = window.__kjYtQueue || [];
        window.__kjYtQueue = null;
        for (var i = 0; i < queue.length; i++) queue[i]();
      };
    }
    window.__kjYtQueue.push(done);

    if (!document.getElementById('yt-iframe-api')) {
      var script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  };

  Engine.prototype._create = function () {
    var self = this;
    if (this.player) return;
    if (!window.YT || !window.YT.Player) return;
    if (!document.getElementById('ytAudio')) return;

    this._mount();

    this.player = new window.YT.Player('ytAudio', {
      host: EMBED_HOST,
      videoId: VIDEO_ID,
      playerVars: {
        autoplay: this.requested ? 1 : 0,
        controls: 1,
        disablekb: 1,
        modestbranding: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
        playsinline: 1,
        rel: 0,
        loop: 1,
        playlist: VIDEO_ID
      },
      events: {
        onReady: function (event) {
          self.ready = true;
          if (self.muted) event.target.mute();
          if (self.requested) event.target.playVideo();
        },
        onStateChange: function (event) {
          var states = window.YT.PlayerState || {};
          self.playing = event.data === states.PLAYING;
          if (self.playing) {
            window.clearTimeout(self.guard);
            self.guard = null;
            self._hide();
          }
          self._emit();
        }
      }
    });
  };

  Engine.prototype.play = function () {
    var self = this;
    this.requested = true;

    /* Autoplay may be blocked because the iframe is created asynchronously,
       after the click has expired. Give it a moment, then surface the card so
       the guest can start the song with one tap instead of silence. */
    window.clearTimeout(this.guard);
    this.guard = window.setTimeout(function () {
      self.guard = null;
      if (!self.playing) self._show();
    }, 2600);

    if (this.ready && this.player) {
      if (this.muted && this.player.mute) this.player.mute();
      this.player.playVideo();
      return true;
    }

    this._loadApi(function () { self._create(); });
    return true;
  };

  Engine.prototype.pause = function () {
    this.requested = false;
    this.playing = false;
    window.clearTimeout(this.guard);
    this.guard = null;
    if (this.player && this.ready) this.player.pauseVideo();
    this._emit();
  };

  Engine.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (!this.player || !this.ready) return;
    if (this.muted) this.player.mute();
    else this.player.unMute();
  };

  window.WeddingMusic = new Engine();
}(window, document));
