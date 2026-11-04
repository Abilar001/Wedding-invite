/* ==========================================================================
   Kishin & Jessica — Wedding Invitation
   All interactive behaviour. No external dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     CONFIG — fill these in to make RSVP delivery one tap.
     messengerUsername: your Messenger username (m.me/<username>).
     rsvpEmail: optional e-mail address for RSVP replies.
     ---------------------------------------------------------------------- */
  var CONFIG = {
    messengerUsername: '',     // e.g. 'kishin.pelipil' — enables one-tap Messenger sending as a fallback
    rsvpEmail: '',             // optional address for the "Send by email" fallback button
    rsvpEndpoint: '/api/rsvp'  // SMTP backend (see server/index.js)
  };

  var WEDDING_DATE_ISO = '2026-12-08T14:00:00+08:00';
  var RSVP_DEADLINE_ISO = '2026-11-25T23:59:59+08:00';
  var RSVP_STORAGE_KEY = 'kj-wedding-rsvp-2026';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function prefersReducedMotion() { return motionQuery.matches; }

  function on(el, type, fn, opts) {
    if (el) el.addEventListener(type, fn, opts);
  }

  function announce(message) {
    var region = $('#announcer');
    if (region) region.textContent = message;
  }

  /* ======================================================================
     1. LOADER
     ====================================================================== */
  (function loader() {
    var el = $('#loader');
    if (!el) return;

    var hide = function () {
      el.classList.add('is-done');
      window.setTimeout(function () {
        el.setAttribute('hidden', '');
      }, 900);
    };

    if (document.readyState === 'complete') {
      window.setTimeout(hide, 350);
    } else {
      on(window, 'load', function () { window.setTimeout(hide, 350); });
      // Safety net so a slow font/image never traps the visitor on the loader.
      window.setTimeout(hide, 4000);
    }
  }());

  /* ======================================================================
     2. AMBIENT PETALS & GOLD DUST
     ====================================================================== */
  (function petals() {
    var layer = $('#petals');
    if (!layer || prefersReducedMotion()) return;

    var count = window.innerWidth < 720 ? 9 : 15;
    for (var i = 0; i < count; i++) {
      var petal = document.createElement('span');
      petal.className = 'petal' + (i % 3 === 0 ? ' petal--gold' : '');
      petal.style.left = (Math.random() * 100).toFixed(2) + '%';
      petal.style.animationDuration = (11 + Math.random() * 12).toFixed(1) + 's';
      petal.style.animationDelay = (-Math.random() * 18).toFixed(1) + 's';
      var size = 9 + Math.random() * 10;
      petal.style.width = size.toFixed(1) + 'px';
      petal.style.height = (size * 0.82).toFixed(1) + 'px';
      petal.style.opacity = (0.25 + Math.random() * 0.4).toFixed(2);
      layer.appendChild(petal);
    }
  }());

  (function dust() {
    var canvas = $('#dust');
    if (!canvas || prefersReducedMotion()) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dots = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0;
    var height = 0;
    var rafId = null;
    var running = true;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var target = width < 720 ? 26 : 46;
      dots = [];
      for (var i = 0; i < target; i++) {
        dots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.6 + Math.random() * 1.7,
          speed: 0.08 + Math.random() * 0.28,
          drift: (Math.random() - 0.5) * 0.18,
          alpha: 0.15 + Math.random() * 0.45
        });
      }
    }

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.y -= d.speed;
        d.x += d.drift;
        if (d.y < -6) { d.y = height + 6; d.x = Math.random() * width; }
        if (d.x < -6) d.x = width + 6;
        if (d.x > width + 6) d.x = -6;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(214, 184, 120, ' + d.alpha + ')';
        ctx.fill();
      }
      rafId = window.requestAnimationFrame(frame);
    }

    resize();
    frame();

    on(window, 'resize', resize);
    on(document, 'visibilitychange', function () {
      if (document.hidden) {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
      } else if (!running) {
        running = true;
        frame();
      }
    });
  }());

  /* ======================================================================
     3. LANDING / ENVELOPE
     ====================================================================== */
  (function landing() {
    var landingEl = $('#landing');
    var envelope = $('#envelopeBtn');
    var openBtn = $('#openInvitation');
    var skipBtn = $('#skipIntro');
    if (!landingEl) return;

    var opened = false;

    function finish() {
      landingEl.classList.add('is-leaving');
      document.body.classList.remove('is-locked');
      window.setTimeout(function () {
        landingEl.setAttribute('hidden', '');
        landingEl.setAttribute('aria-hidden', 'true');
      }, 1200);
      announce('Invitation opened. Use the navigation to explore.');
    }

    function openInvitation() {
      if (opened) return;
      opened = true;

      // Music is allowed to start after this explicit user gesture.
      if (window.WeddingMusic) {
        var started = window.WeddingMusic.play();
        if (started) {
          setMusicUI(true);
          announce('Background music started.');
        }
      }

      if (prefersReducedMotion() || !envelope) {
        if (envelope) envelope.classList.add('is-opening', 'is-open');
        finish();
        return;
      }

      envelope.classList.add('is-opening');
      window.setTimeout(function () { envelope.classList.add('is-open'); }, 520);
      window.setTimeout(function () { envelope.classList.add('is-finished'); }, 1650);
      window.setTimeout(finish, 2050);
    }

    on(openBtn, 'click', openInvitation);
    on(envelope, 'click', openInvitation);
    on(envelope, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        openInvitation();
      }
    });

    on(skipBtn, 'click', function () {
      if (opened) return;
      opened = true;
      landingEl.classList.add('is-leaving');
      document.body.classList.remove('is-locked');
      window.setTimeout(function () {
        landingEl.setAttribute('hidden', '');
        landingEl.setAttribute('aria-hidden', 'true');
      }, 400);
      announce('Skipped intro.');
    });
  }());

  /* ======================================================================
     4. MUSIC CONTROLS
     ====================================================================== */
  var musicUI = {};

  function setMusicUI(isPlaying) {
    var toggle = $('#musicToggle');
    var eq = $('#musicEq');
    var label = $('#musicLabel');
    if (toggle) {
      toggle.classList.toggle('is-playing', !!isPlaying);
      toggle.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      toggle.setAttribute('aria-label', isPlaying ? 'Pause background music' : 'Play background music');
    }
    if (eq) eq.classList.toggle('is-on', !!isPlaying);
    if (label) label.textContent = isPlaying ? 'Music on' : 'Music off';
    musicUI.playing = !!isPlaying;
  }

  (function music() {
    var engine = window.WeddingMusic;
    var toggle = $('#musicToggle');
    var muteBtn = $('#musicMute');
    if (!engine || !toggle) return;

    if (!engine.isSupported || !engine.isSupported()) {
      var fab = $('#musicFab');
      if (fab) fab.setAttribute('hidden', '');
      return;
    }

    on(toggle, 'click', function () {
      if (engine.playing) {
        engine.pause();
        setMusicUI(false);
        announce('Background music paused.');
      } else {
        engine.play();
        setMusicUI(true);
        announce('Background music playing.');
      }
    });

    on(muteBtn, 'click', function () {
      var nextMuted = !engine.muted;
      engine.setMuted(nextMuted);
      muteBtn.classList.toggle('is-muted', nextMuted);
      muteBtn.setAttribute('aria-pressed', nextMuted ? 'true' : 'false');
      muteBtn.setAttribute('aria-label', nextMuted ? 'Unmute music' : 'Mute music');
      announce(nextMuted ? 'Music muted.' : 'Music unmuted.');
    });
  }());

  /* ======================================================================
     5. NAVIGATION
     ====================================================================== */
  (function navigation() {
    var nav = $('#nav');
    var toggle = $('#navToggle');
    var links = $('#navLinks');
    if (!nav) return;

    function closeMenu() {
      nav.classList.remove('is-open');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      }
    }

    on(toggle, 'click', function () {
      var willOpen = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', willOpen);
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', willOpen ? 'Close menu' : 'Open menu');
    });

    $$('a[data-nav]').forEach(function (link) {
      on(link, 'click', function (e) {
        var id = link.getAttribute('href');
        if (!id || id.charAt(0) !== '#') return;
        var target = document.getElementById(id.slice(1));
        if (!target) return;

        e.preventDefault();
        closeMenu();
        target.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start'
        });
        if (history.replaceState) history.replaceState(null, '', id);
      });
    });

    on(document, 'click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(e.target)) return;
      closeMenu();
    });

    on(document, 'keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    on(window, 'resize', function () {
      if (window.innerWidth > 860) closeMenu();
    });

    // Sticky styling + scroll-to-top visibility
    var toTop = $('#toTop');
    var lastState = null;
    function onScroll() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var stuck = y > 40;
      if (stuck !== lastState) {
        nav.classList.toggle('is-stuck', stuck);
        lastState = stuck;
      }
      if (toTop) toTop.classList.toggle('is-visible', y > 480);
    }
    on(window, 'scroll', onScroll, { passive: true });
    onScroll();

    on(toTop, 'click', function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      var brand = $('.nav__brand');
      if (brand) brand.focus({ preventScroll: true });
    });

    // Active section highlighting
    var sections = $$('[data-section]');
    var navMap = {};
    $$('#navLinks a[data-nav]').forEach(function (a) {
      navMap[a.getAttribute('href').slice(1)] = a;
    });

    function setActive(id) {
      Object.keys(navMap).forEach(function (key) {
        navMap[key].classList.toggle('is-active', key === id);
      });
    }

    if ('IntersectionObserver' in window && sections.length) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

      sections.forEach(function (s) { observer.observe(s); });
    }
  }());

  /* ======================================================================
     6. SCROLL REVEALS
     ====================================================================== */
  (function reveals() {
    var items = $$('.reveal');
    items.forEach(function (el) {
      var delay = el.getAttribute('data-delay');
      if (delay) el.style.setProperty('--d', delay);
    });
    if (!items.length) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      var tl = $('.timeline');
      if (tl) tl.classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    items.forEach(function (el) { observer.observe(el); });

    // Draw the timeline connector once the section is near.
    var timeline = $('.timeline');
    if (timeline && 'IntersectionObserver' in window) {
      var tlObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            timeline.classList.add('is-visible');
            tlObserver.disconnect();
          }
        });
      }, { threshold: 0.2 });
      tlObserver.observe(timeline);
    }
  }());

  /* ======================================================================
     7. PARALLAX
     ====================================================================== */
  (function parallax() {
    if (prefersReducedMotion()) return;
    var layers = $$('[data-parallax]');
    if (!layers.length) return;

    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      layers.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0;
        var delta = (rect.top + rect.height / 2) - vh / 2;
        el.style.transform = 'translate3d(0,' + (delta * speed).toFixed(2) + 'px,0)';
      });
    }

    function request() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    on(window, 'scroll', request, { passive: true });
    on(window, 'resize', request);
    update();
  }());

  /* ======================================================================
     8. COUNTDOWN (Asia/Manila)
     ====================================================================== */
  (function countdown() {
    var days = $('#cd-days');
    var hours = $('#cd-hours');
    var minutes = $('#cd-minutes');
    var seconds = $('#cd-seconds');
    var msg = $('#countdownMsg');
    if (!days) return;

    var target = new Date(WEDDING_DATE_ISO).getTime();

    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }

    function tick() {
      var now = Date.now();
      var diff = target - now;

      if (diff <= 0) {
        days.textContent = '00';
        hours.textContent = '00';
        minutes.textContent = '00';
        seconds.textContent = '00';
        if (msg) msg.hidden = false;
        window.clearInterval(timer);
        return;
      }

      var totalSeconds = Math.floor(diff / 1000);
      var d = Math.floor(totalSeconds / 86400);
      var h = Math.floor((totalSeconds % 86400) / 3600);
      var m = Math.floor((totalSeconds % 3600) / 60);
      var s = totalSeconds % 60;

      days.textContent = pad(d);
      hours.textContent = pad(h);
      minutes.textContent = pad(m);
      seconds.textContent = pad(s);
    }

    var timer = window.setInterval(tick, 1000);
    tick();
  }());

  /* ======================================================================
     9. GALLERY + LIGHTBOX
     ====================================================================== */
  (function gallery() {
    var track = $('#galleryTrack');
    if (!track) return;

    var items = $$('.gallery__item', track);
    var dotsWrap = $('#galleryDots');
    var prevBtn = $('#galleryPrev');
    var nextBtn = $('#galleryNext');
    var lightbox = $('#lightbox');
    var lightboxImg = $('#lightboxImg');
    var lightboxCaption = $('#lightboxCaption');
    var current = 0;
    var lastFocus = null;

    function cardStep() {
      if (!items.length) return 300;
      var style = window.getComputedStyle(track);
      var gap = parseFloat(style.columnGap || style.gap) || 16;
      return items[0].getBoundingClientRect().width + gap;
    }

    function maxScroll() {
      return track.scrollWidth - track.clientWidth - 2;
    }

    function updateControls() {
      var index = Math.round(track.scrollLeft / cardStep());
      index = Math.max(0, Math.min(index, items.length - 1));

      if (dotsWrap) {
        $$('button', dotsWrap).forEach(function (dot, i) {
          dot.classList.toggle('is-active', i === index);
        });
      }

      var atStart = track.scrollLeft <= 4;
      var atEnd = track.scrollLeft >= maxScroll() - 2;
      if (prevBtn) {
        prevBtn.disabled = atStart;
        prevBtn.style.opacity = atStart ? '0.35' : '1';
      }
      if (nextBtn) {
        nextBtn.disabled = atEnd;
        nextBtn.style.opacity = atEnd ? '0.35' : '1';
      }
    }

    function scrollToIndex(index) {
      var bounded = Math.max(0, Math.min(index, items.length - 1));
      track.scrollTo({
        left: bounded * cardStep(),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    }

    // Dots
    if (dotsWrap) {
      items.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.tabIndex = -1;
        dot.setAttribute('aria-label', 'Go to photo ' + (i + 1));
        on(dot, 'click', function () { scrollToIndex(i); });
        dotsWrap.appendChild(dot);
      });
    }

    on(prevBtn, 'click', function () {
      scrollToIndex(Math.round(track.scrollLeft / cardStep()) - 1);
    });
    on(nextBtn, 'click', function () {
      scrollToIndex(Math.round(track.scrollLeft / cardStep()) + 1);
    });

    on(track, 'scroll', function () {
      window.requestAnimationFrame(updateControls);
    }, { passive: true });
    on(window, 'resize', updateControls);
    updateControls();

    // Lightbox
    function renderLightbox(index) {
      var item = items[index];
      if (!item) return;
      var img = $('img', item);
      var caption = $('figcaption', item);
      current = index;
      if (lightboxImg) {
        lightboxImg.src = img.getAttribute('src');
        lightboxImg.alt = img.getAttribute('alt') || '';
      }
      if (lightboxCaption) lightboxCaption.textContent = caption ? caption.textContent : '';
    }

    function openLightbox(index) {
      if (!lightbox) return;
      lastFocus = document.activeElement;
      renderLightbox(index);
      lightbox.hidden = false;
      window.requestAnimationFrame(function () { lightbox.classList.add('is-open'); });
      document.body.classList.add('is-locked');
      var close = $('#lightboxClose');
      if (close) close.focus();
      announce('Photo viewer opened. Use arrow keys to browse, Escape to close.');
    }

    function closeLightbox() {
      if (!lightbox || lightbox.hidden) return;
      lightbox.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      var reset = function () {
        if (!lightbox.classList.contains('is-open')) lightbox.hidden = true;
      };
      if (prefersReducedMotion()) reset();
      else window.setTimeout(reset, 380);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function stepLightbox(direction) {
      renderLightbox((current + direction + items.length) % items.length);
    }

    $$('.gallery__btn').forEach(function (btn, index) {
      on(btn, 'click', function () { openLightbox(index); });
    });

    on($('#lightboxClose'), 'click', closeLightbox);
    on($('#lightboxPrev'), 'click', function () { stepLightbox(-1); });
    on($('#lightboxNext'), 'click', function () { stepLightbox(1); });
    on(lightbox, 'click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    on(document, 'keydown', function (e) {
      if (!lightbox || lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') stepLightbox(1);
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
    });
  }());

  /* ======================================================================
     10. RSVP
     ====================================================================== */
  (function rsvp() {
    var form = $('#rsvpForm');
    if (!form) return;

    var nameInput = $('#guestName');
    var nameField = nameInput ? nameInput.closest('.field') : null;
    var nameError = $('#guestNameError');
    var emailInput = $('#guestEmail');
    var emailField = emailInput ? emailInput.closest('.field') : null;
    var emailError = $('#guestEmailError');
    var honeypot = $('#guestFax');
    var submitBtn = $('#rsvpSubmit');
    var fineprint = $('#rsvpFineprint');
    var attendanceError = $('#attendanceError');
    var countWrap = $('#guestCountWrap');
    var countSelect = $('#guestCount');
    var messageInput = $('#rsvpMessage');
    var status = $('#rsvpStatus');
    var result = $('#rsvpResult');
    var resultTitle = $('#rsvpResultTitle');
    var resultText = $('#rsvpResultText');
    var preview = $('#rsvpPreview');
    var messengerLink = $('#rsvpMessenger');
    var mailLink = $('#rsvpMail');
    var copyBtn = $('#rsvpCopy');
    var copyLabel = $('#rsvpCopyLabel');
    var editBtn = $('#rsvpEdit');
    var radios = $$('input[name="attendance"]', form);

    var lastMessage = '';

    // Restore a previous draft / response on this device.
    try {
      var saved = window.localStorage.getItem(RSVP_STORAGE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        if (data && data.name && nameInput) nameInput.value = data.name;
        if (data && data.email && emailInput) emailInput.value = data.email;
        if (data && data.message && messageInput) messageInput.value = data.message;
        if (data && data.guests && countSelect) countSelect.value = String(data.guests);
        if (data && data.attendance) {
          var radio = $('#attendance' + (data.attendance === 'accept' ? 'Accept' : 'Decline'));
          if (radio) radio.checked = true;
        }
      }
    } catch (err) { /* storage unavailable — ignore */ }

    function selectedAttendance() {
      for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) return radios[i].value;
      }
      return '';
    }

    function syncGuestCount() {
      if (!countWrap) return;
      var accept = selectedAttendance() === 'accept';
      countWrap.hidden = !accept;
      if (!accept && countSelect) countSelect.value = '1';
    }

    radios.forEach(function (radio) {
      on(radio, 'change', function () {
        syncGuestCount();
        if (attendanceError) attendanceError.hidden = true;
      });
    });
    syncGuestCount();

    function clearErrors() {
      if (nameError) nameError.hidden = true;
      if (emailError) emailError.hidden = true;
      if (attendanceError) attendanceError.hidden = true;
      if (status) { status.hidden = true; status.textContent = ''; }
      if (nameField) nameField.classList.remove('has-error');
      if (emailField) emailField.classList.remove('has-error');
    }

    function buildMessage(info) {
      var lines = [];
      lines.push('RSVP — Kishin & Jessica, December 08, 2026');
      lines.push('Name: ' + info.name);
      lines.push('Attendance: ' + (info.attendance === 'accept' ? 'Joyfully Accept' : 'Regretfully Decline'));
      if (info.attendance === 'accept') {
        lines.push('Guests: ' + info.guests);
      }
      if (info.message) lines.push('Message: ' + info.message);
      lines.push('(Sent ' + new Date().toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric'
      }) + ')');
      return lines.join('\n');
    }

    function showResult(info, text, options) {
      var opts = options || {};
      var sent = !!opts.sent;
      lastMessage = text;

      if (resultTitle) {
        resultTitle.textContent = info.attendance === 'accept'
          ? 'Thank you, ' + info.name.split(' ')[0] + '!'
          : 'Thank you for letting us know, ' + info.name.split(' ')[0] + '.';
      }

      if (resultText) {
        if (sent) {
          resultText.textContent = info.attendance === 'accept'
            ? 'Your reservation has been sent to Kishin & Jessica. A confirmation email is on its way to ' + info.email + '.'
            : 'Your reply has been sent to Kishin & Jessica. A confirmation email is on its way to ' + info.email + '.';
          if (opts.confirmationSent === false) {
            resultText.textContent += ' The confirmation email could not be delivered, but the couple received your RSVP.';
          }
        } else {
          resultText.textContent = (opts.note ? opts.note + ' ' : '') + (info.attendance === 'accept'
            ? 'Please send your response below so it reaches the couple.'
            : 'Please send your response below so the couple receives it.');
        }
      }

      if (preview) {
        preview.hidden = sent;
        if (!sent) preview.textContent = text;
      }

      if (messengerLink) {
        messengerLink.hidden = sent;
        if (!sent && CONFIG.messengerUsername) {
          messengerLink.href = 'https://m.me/' + encodeURIComponent(CONFIG.messengerUsername) +
            '?text=' + encodeURIComponent(text);
          messengerLink.target = '_blank';
          messengerLink.removeAttribute('aria-disabled');
        } else {
          messengerLink.href = 'https://www.messenger.com/';
          messengerLink.target = '_blank';
        }
      }

      if (mailLink) {
        if (sent) {
          mailLink.hidden = true;
        } else if (CONFIG.rsvpEmail) {
          mailLink.href = 'mailto:' + CONFIG.rsvpEmail +
            '?subject=' + encodeURIComponent('RSVP — ' + info.name + ' (December 08, 2026)') +
            '&body=' + encodeURIComponent(text);
          mailLink.hidden = false;
        } else {
          mailLink.hidden = true;
        }
      }

      if (copyLabel) copyLabel.textContent = 'Copy details';
      if (copyBtn) copyBtn.hidden = sent;
      if (fineprint) {
        fineprint.textContent = sent
          ? 'You can update your response before November 25, 2026 by choosing "Edit response" and sending the form again.'
          : 'Nothing is sent automatically. Tap Messenger or copy the details and send them to the couple so your response is received.';
      }

      form.hidden = true;
      result.hidden = false;
      result.focus({ preventScroll: true });
      result.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
      announce(sent ? 'Your RSVP has been sent.' : 'Your RSVP is ready to send.');
    }

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

    function setSubmitting(busy) {
      if (!submitBtn) return;
      if (busy) {
        submitBtn.dataset.label = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      } else {
        submitBtn.disabled = false;
        if (submitBtn.dataset.label) submitBtn.innerHTML = submitBtn.dataset.label;
      }
    }

    function showFormError(message) {
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
      status.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }

    // POSTs the RSVP to the SMTP backend. The manual send panel is only shown
    // when the server is genuinely unreachable — never as a fake success.
    function sendToServer(info, text) {
      if (!CONFIG.rsvpEndpoint || typeof window.fetch !== 'function') {
        showResult(info, text, { sent: false });
        return;
      }

      setSubmitting(true);
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller
        ? window.setTimeout(function () { controller.abort(); }, 25000)
        : null;

      window.fetch(CONFIG.rsvpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: info.name,
          email: info.email,
          attendance: info.attendance,
          guests: info.guests,
          message: info.message,
          guestFax: honeypot ? honeypot.value : ''
        }),
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          return response.json()
            .catch(function () { return {}; })
            .then(function (body) { return { response: response, body: body }; });
        })
        .then(function (result) {
          var body = result.body || {};
          if (result.response.ok && body.ok) {
            showResult(info, text, {
              sent: true,
              confirmationSent: body.confirmationSent !== false
            });
            return;
          }
          if (result.response.status >= 400 && result.response.status < 500) {
            showFormError(body.error || 'Please check your details and try again.');
            return;
          }
          showResult(info, text, {
            sent: false,
            note: body.error || 'We could not reach the RSVP server.'
          });
        })
        .catch(function () {
          showResult(info, text, {
            sent: false,
            note: 'We could not reach the RSVP server. Please check your connection and try again.'
          });
        })
        .then(function () {
          if (timer) window.clearTimeout(timer);
          setSubmitting(false);
        });
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      clearErrors();

      var name = nameInput ? nameInput.value.trim() : '';
      var email = emailInput ? emailInput.value.trim() : '';
      var attendance = selectedAttendance();

      if (name.length < 2) {
        if (nameError) nameError.hidden = false;
        if (nameField) nameField.classList.add('has-error');
        if (nameInput) nameInput.focus();
        return;
      }

      if (!EMAIL_RE.test(email)) {
        if (emailError) emailError.hidden = false;
        if (emailField) emailField.classList.add('has-error');
        if (emailInput) emailInput.focus();
        return;
      }

      if (!attendance) {
        if (attendanceError) attendanceError.hidden = false;
        var firstRadio = radios[0];
        if (firstRadio) firstRadio.focus();
        return;
      }

      var info = {
        name: name,
        email: email,
        attendance: attendance,
        guests: attendance === 'accept' ? parseInt(countSelect ? countSelect.value : '1', 10) || 1 : 0,
        message: messageInput ? messageInput.value.trim() : ''
      };

      var text = buildMessage(info);

      try {
        window.localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify({
          name: info.name,
          email: info.email,
          attendance: info.attendance,
          guests: info.guests,
          message: info.message,
          savedAt: new Date().toISOString()
        }));
      } catch (err) { /* private mode — the response can still be sent manually */ }

      sendToServer(info, text);
    });

    on(copyBtn, 'click', function () {
      var done = function () {
        if (copyLabel) copyLabel.textContent = 'Copied';
        announce('RSVP details copied to your clipboard.');
        window.setTimeout(function () {
          if (copyLabel) copyLabel.textContent = 'Copy details';
        }, 2600);
      };

      var fail = function () {
        if (copyLabel) copyLabel.textContent = 'Press Ctrl+C';
        announce('Copy was blocked by the browser. Select the details above and copy them manually.');
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lastMessage).then(done).catch(function () {
          legacyCopy(lastMessage) ? done() : fail();
        });
      } else {
        legacyCopy(lastMessage) ? done() : fail();
      }
    });

    function legacyCopy(text) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(area);
      return ok;
    }

    on(editBtn, 'click', function () {
      result.hidden = true;
      form.hidden = false;
      if (nameInput) {
        nameInput.focus();
        nameInput.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      }
    });
  }());

  /* ======================================================================
     11. RSVP DEADLINE HINT (optional, non-blocking)
     ====================================================================== */
  (function deadline() {
    var deadline = new Date(RSVP_DEADLINE_ISO).getTime();
    if (Date.now() > deadline) {
      var note = $('.rsvp__deadline');
      if (note) {
        note.innerHTML = 'The online reply window has closed, but you are always welcome to reach us through Facebook or Messenger.';
      }
    }
  }());
}());
