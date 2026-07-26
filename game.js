/* ============================================================
   KNIFE KINGDOM — top-down MM2-style browser game
   Pure vanilla JS + Canvas. No dependencies.
   ============================================================ */
(() => {
  'use strict';

  // ---------- Persistence ----------
  const SAVE_KEY = 'knifeKingdom.save.v1';
  const defaultSave = {
    coins: 0,
    wins: 0,
    best: 0,
    ownedKnives: ['crimson'],
    equippedKnife: 'crimson',
    ownedMaps: ['arena'],
    equippedMap: 'arena',
    muted: false,
  };
  let save = loadSave();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...defaultSave };
      const p = JSON.parse(raw);
      return { ...defaultSave, ...p };
    } catch (e) { return { ...defaultSave }; }
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  // ---------- Catalog ----------
  const KNIVES = {
    crimson:  { name: 'Crimson',   price: 0,    desc: 'Classic red. The starter drip.',              color: '#ff2e88', trail: '#ff8ab8' },
    void:     { name: 'Void',      price: 150,  desc: 'A blade swallowed by darkness.',              color: '#5a3fff', trail: '#b14bff' },
    neon:     { name: 'Neon',      price: 300,  desc: 'Buzzes with electric cyan.',                  color: '#21e6ff', trail: '#9bf6ff' },
    gold:     { name: 'Golden',    price: 600,  desc: 'For the rich murderers.',                     color: '#ffd54a', trail: '#fff0a8' },
    galaxy:   { name: 'Galaxy',    price: 1200, desc: 'Swirls of pink & violet cosmos.',             color: '#ff7ae0', trail: '#b14bff' },
    diamond:  { name: 'Diamond',   price: 2400, desc: 'Bling that blinds the Sheriff.',              color: '#7afcff', trail: '#ffffff' },
    lava:     { name: 'Lava',      price: 1800, desc: 'Molten orange that never cools.',             color: '#ff7a18', trail: '#ffd24a' },
    emerald:  { name: 'Emerald',   price: 900,  desc: 'Jade green, razor sharp.',                    color: '#46ff8c', trail: '#b6ffd0' },
  };

  const MAPS = {
    arena:  { name: 'Neon Arena', price: 0,    desc: 'Open floor. Easy cover layout.',    bg: '#0c0520', grid: 'rgba(177,75,255,0.10)', crates: 7 },
    plaza:  { name: 'Crate Plaza', price: 400,  desc: 'Maze of crates. Sneaky.',           bg: '#06121e', grid: 'rgba(33,230,255,0.10)', crates: 13 },
    void:   { name: 'Void Vault',  price: 1000, desc: 'Dark vault, tight sightlines.',     bg: '#140616', grid: 'rgba(255,46,136,0.10)', crates: 10 },
    sunset: { name: 'Sunset Yard',  price: 2000, desc: 'Warm arena, lots of running room.', bg: '#1a0a18', grid: 'rgba(255,122,24,0.12)', crates: 9 },
  };

  // Outfit palettes for innocent crowd variety — index selected by innocent.variant
  const INNOCENT_OUTFITS = [
    { body: '#9fe7ff', coat: '#1f5f86', skin: '#ffd9b8', hair: '#6b4a2a' }, // cyan civilian
    { body: '#d9b8ff', coat: '#5a3a8a', skin: '#e8b894', hair: '#2a1638' }, // purple civilian (ponytail)
    { body: '#ffe6a8', coat: '#8a6a1e', skin: '#ffd9b8', hair: '#3a2a1a' }, // gold civilian (flat cap)
    { body: '#b8ffcf', coat: '#1f6b46', skin: '#e8b894', hair: '#4a3a2a' }, // green civilian (bandana)
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const screens = { menu: $('menu'), game: $('game'), shop: $('shop'), maps: $('maps'), how: $('how') };
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  function show(screen) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screen].classList.add('active');
  }

  // ---------- Audio (synth, no files) ----------
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return audioCtx;
  }
  // Small helper: shared oscillator voice with a real attack + exponential decay envelope
  // (not just a flat decay from full volume) — punchier than a single ramp. `at` lets
  // callers schedule several notes against one shared AudioContext clock instead of
  // setTimeout, so multi-note cues (win/lose) stay tight.
  function tone(a, o) {
    if (!a || save.muted) return;
    const { freq, dur, type = 'sine', vol = 0.18, slideTo = null, attack = 0.004, at = null, detune = 0 } = o;
    const t0 = at != null ? at : a.currentTime;
    const atk = Math.min(attack, dur * 0.5) || 0.002;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    if (detune) osc.detune.setValueAtTime(detune, t0);
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  // One shared white-noise buffer (generated once, ~0.5s, reused via random-offset
  // slices) so impact/noise cues never allocate a fresh sample array per call.
  let _noiseBuf = null;
  function noiseBuf(a) {
    if (_noiseBuf) return _noiseBuf;
    const len = Math.floor(a.sampleRate * 0.5);
    _noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return _noiseBuf;
  }
  // Filtered noise burst (thwacks, crackle, rumble) with its own gain envelope and an
  // optional filter-frequency sweep for character (e.g. a falling thud).
  function noiseBurst(a, o) {
    if (!a || save.muted) return;
    const { dur = 0.08, vol = 0.15, filterType = 'bandpass', freqStart = 1500, freqEnd = null, q = 1, at = null } = o;
    const t0 = at != null ? at : a.currentTime;
    const buf = noiseBuf(a);
    const src = a.createBufferSource();
    src.buffer = buf;
    const filt = a.createBiquadFilter();
    filt.type = filterType;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd != null && freqEnd !== freqStart) filt.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(a.destination);
    const off = Math.random() * Math.max(0.01, buf.duration - dur - 0.02);
    src.start(t0, off, dur + 0.02);
  }
  const SFX = {
    // knife leaving the hand: quick pitch-falling triangle "fwip" + a hiss of air
    throw: () => {
      const a = ac(); if (!a || save.muted) return;
      tone(a, { freq: 980, slideTo: 300, dur: 0.1, type: 'triangle', vol: 0.15, attack: 0.002 });
      noiseBurst(a, { dur: 0.06, vol: 0.05, filterType: 'highpass', freqStart: 4200, freqEnd: 1800, q: 0.6 });
    },
    // blade landing: filtered noise "thwack" + a sawtooth thump that drops in pitch + a tiny click
    hit: () => {
      const a = ac(); if (!a || save.muted) return;
      noiseBurst(a, { dur: 0.05, vol: 0.22, filterType: 'bandpass', freqStart: 1900, freqEnd: 450, q: 1.3 });
      tone(a, { freq: 170, slideTo: 48, dur: 0.14, type: 'sawtooth', vol: 0.2, attack: 0.001 });
      tone(a, { freq: 1500, dur: 0.035, type: 'square', vol: 0.06, attack: 0.001 });
    },
    // coin pickup: two-note bright "ding-ding" shimmer, deliberately cheap (disco spams this ~30x/1.2s)
    coin: () => {
      const a = ac(); if (!a || save.muted) return;
      const now = a.currentTime;
      tone(a, { freq: 1180, slideTo: 1760, dur: 0.08, type: 'square', vol: 0.12, attack: 0.002, at: now });
      tone(a, { freq: 1760, dur: 0.07, type: 'sine', vol: 0.09, attack: 0.002, at: now + 0.045 });
    },
    // a life ends: descending sawtooth + sub-bass sine + a low noise rumble tail
    death: () => {
      const a = ac(); if (!a || save.muted) return;
      tone(a, { freq: 190, slideTo: 34, dur: 0.42, type: 'sawtooth', vol: 0.24, attack: 0.006 });
      tone(a, { freq: 58, dur: 0.4, type: 'sine', vol: 0.2, attack: 0.015 });
      noiseBurst(a, { dur: 0.14, vol: 0.16, filterType: 'lowpass', freqStart: 1200, freqEnd: 180, q: 0.7 });
    },
    // victory fanfare: 5-note arpeggio, each note doubled an octave down for warmth,
    // scheduled against the audio clock (not setTimeout) so it stays tight
    win: () => {
      const a = ac(); if (!a || save.muted) return;
      const now = a.currentTime;
      [523.25, 659.25, 784.0, 1046.5, 1318.5].forEach((f, i) => {
        const t = now + i * 0.1;
        tone(a, { freq: f, dur: 0.26, type: 'square', vol: 0.15, attack: 0.004, at: t });
        tone(a, { freq: f / 2, dur: 0.26, type: 'triangle', vol: 0.08, attack: 0.004, at: t });
      });
    },
    // defeat dirge: descending notes with a hair of detune for grit, closed with a soft low rumble
    lose: () => {
      const a = ac(); if (!a || save.muted) return;
      const now = a.currentTime;
      [392.0, 329.6, 261.6, 196.0, 146.8].forEach((f, i) => {
        const t = now + i * 0.14;
        tone(a, { freq: f, dur: 0.3, type: 'sawtooth', vol: 0.15, attack: 0.008, at: t });
        tone(a, { freq: f * 0.995, dur: 0.3, type: 'sine', vol: 0.08, attack: 0.008, at: t });
      });
      noiseBurst(a, { dur: 0.3, vol: 0.07, filterType: 'lowpass', freqStart: 300, freqEnd: 70, q: 0.5, at: now + 0.56 });
    },
    // sheriff spots you: rising square zap + a faster sawtooth overtone + a spark of noise
    alarm: () => {
      const a = ac(); if (!a || save.muted) return;
      const now = a.currentTime;
      tone(a, { freq: 820, slideTo: 1500, dur: 0.15, type: 'square', vol: 0.18, attack: 0.001, at: now });
      tone(a, { freq: 1500, slideTo: 2100, dur: 0.08, type: 'sawtooth', vol: 0.07, attack: 0.001, at: now + 0.02 });
      noiseBurst(a, { dur: 0.05, vol: 0.06, filterType: 'highpass', freqStart: 3000, freqEnd: 5000, q: 0.5, at: now });
    },
    // low sub-thump + rumble on the bigger milestone explosions (see explode())
    boom: () => {
      const a = ac(); if (!a || save.muted) return;
      tone(a, { freq: 110, slideTo: 32, dur: 0.28, type: 'sine', vol: 0.2, attack: 0.002 });
      noiseBurst(a, { dur: 0.2, vol: 0.15, filterType: 'lowpass', freqStart: 900, freqEnd: 140, q: 0.6 });
    },
  };

  // ---------- Game State ----------
  const VIEW = { w: 0, h: 0 };          // canvas pixel size
  const WORLD = { w: 1280, h: 720 };    // logical world size
  const player = { x: 0, y: 0, r: 16, speed: 4.2, alive: true, aim: 0, role: 'murderer' };
  let innocents = [];
  let sheriff = null;
  let murderer = null;       // in sheriff mode the AI murderer
  let knives = [];           // thrown knives (player + sheriff bullets abstracted)
  let particles = [];
  let floaters = [];         // floating +coin text
  let crates = [];
  let roundTime = 30;
  let roundActive = false;
  let paused = false;
  let bannerTimer = 0;       // countdown (ms) for the start banner; 0 = hidden
  let coinsThisRound = 0;
  let killsThisRound = 0;
  let knifeCooldown = 0;
  const COOLDOWN_MAX = 26;   // frames-ish
  let shake = 0;
  let lastTs = 0;
  let rafId = null;
  let mapCfg = MAPS.arena;
  let currentMode = 'murderer';
  // difficulty / progression
  function levelForWins(w) { return 1 + Math.floor(w / 3); }   // +1 level every 3 wins
  function diffParams() {
    const L = levelForWins(save.wins);
    const extra = L - 1;
    return {
      level: L,
      innocentBonus: Math.min(8, 2 + extra),     // extra innocents
      aiSpeedMul: 1 + Math.min(0.5, extra * 0.07), // faster AI
      time: Math.max(16, 30 - extra * 2),          // shorter timer
      crateBonus: Math.min(10, extra),             // more cover
      tilt: Math.min(0.42, 0.12 + extra * 0.05),   // steeper camera tilt
      explodeScale: 1 + extra * 0.18,              // bigger explosions
    };
  }
  let diff = diffParams();
  // easter eggs
  let discoMode = false;
  let rainbowKnife = false;
  let typedBuffer = '';
  let konamiIdx = 0;
  const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
  // 3D / camera / effects
  let camTilt = 0.30;     // vertical foreshorten (vy *= (1-tilt)) -- more pronounced 3D floor
  let camSway = 0;        // gentle camera sway phase
  let blood = { level: 0, slides: [] }; // sheriff-kill gore overlay (level decays; slides drip)
  let shockwaves = [];    // expanding explosion rings
  let killsMilestone = 0; // murderer kills since last explosion tier bump (every 5)
  // touch / mobile
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const joy = { active: false, dx: 0, dy: 0, id: null, baseX: 0, baseY: 0 };
  let firing = false;

  // ---------- Input ----------
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'p' && screens.game.classList.contains('active')) togglePause();
    if (k === 'm') toggleMute();
    if (k === ' ') { e.preventDefault(); if (roundActive && !paused) throwKnife(); }
    if (e.shiftKey && k === 'd') triggerDisco();
    // ---- easter eggs ----
    // Konami code
    konamiIdx = (k === KONAMI[konamiIdx]) ? konamiIdx + 1 : (k === KONAMI[0] ? 1 : 0);
    if (konamiIdx === KONAMI.length) { konamiIdx = 0; triggerRainbow(); }
    // typed word: nutella -> grants golden knife
    if (/^[a-z]$/.test(k)) {
      typedBuffer = (typedBuffer + k).slice(-12);
      if (typedBuffer.endsWith('nutella')) { typedBuffer = ''; triggerNutella(); }
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * VIEW.w;
    const my = (e.clientY - rect.top) / rect.height * VIEW.h;
    mouse.x = mx; mouse.y = my;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouse.down = true; if (roundActive && !paused) throwKnife(); } });
  canvas.addEventListener('mouseup', () => { mouse.down = false; });
  // ---------- Mobile / touch controls ----------
  if (isTouch) document.body.classList.add('touch');
  const joyEl = $('joystick'), knobEl = $('joyKnob'), fireEl = $('fireBtn');

  function joyStart(x, y, id) {
    joy.active = true; joy.id = id; joy.baseX = x; joy.baseY = y;
    joy.dx = 0; joy.dy = 0;
    if (knobEl) knobEl.style.transform = 'translate(0px,0px)';
    // show touch hint briefly
    const hint = document.querySelector('.touch-hint'); if (hint) setTimeout(() => hint.classList.add('hidden'), 2600);
  }
  function joyMove(x, y) {
    if (!joy.active) return;
    let dx = x - joy.baseX, dy = y - joy.baseY;
    const max = 46, len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    joy.dx = dx / max; joy.dy = dy / max;
    if (knobEl) knobEl.style.transform = `translate(${dx}px,${dy}px)`;
  }
  function joyEnd() {
    joy.active = false; joy.dx = 0; joy.dy = 0; joy.id = null;
    if (knobEl) knobEl.style.transform = 'translate(0px,0px)';
  }

  if (joyEl) {
    joyEl.addEventListener('touchstart', (e) => {
      e.preventDefault(); const t = e.changedTouches[0];
      const r = joyEl.getBoundingClientRect();
      joyStart(r.left + r.width/2, r.top + r.height/2, t.identifier);
    }, { passive: false });
    joyEl.addEventListener('touchmove', (e) => {
      e.preventDefault(); const t = [...e.changedTouches].find(c => c.identifier === joy.id); if (t) joyMove(t.clientX, t.clientY);
    }, { passive: false });
    joyEl.addEventListener('touchend', (e) => { e.preventDefault(); const t = [...e.changedTouches].find(c => c.identifier === joy.id); if (t) joyEnd(); }, { passive: false });
    joyEl.addEventListener('touchcancel', () => joyEnd(), { passive: false });
  }
  if (fireEl) {
    fireEl.addEventListener('touchstart', (e) => { e.preventDefault(); firing = true; if (roundActive && !paused) throwKnife(); }, { passive: false });
    fireEl.addEventListener('touchend', (e) => { e.preventDefault(); firing = false; }, { passive: false });
    fireEl.addEventListener('touchcancel', () => { firing = false; }, { passive: false });
  }
  // Right-half tap: aim at the point relative to player (who is screen-centered on touch) and throw.
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
    // ignore touches on the left ~45% (joystick zone) — but joystick handles its own; only act on right side
    if (sx < rect.width * 0.45) {
      // left side: treat as an extra move-toward point? Keep simple: ignore (joystick covers it)
      return;
    }
    mouse.x = sx / rect.width * VIEW.w; mouse.y = sy / rect.height * VIEW.h;
    if (roundActive && !paused) throwKnife();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0]; const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left, sy = t.clientY - rect.top;
    if (sx >= rect.width * 0.45) { mouse.x = sx / rect.width * VIEW.w; mouse.y = sy / rect.height * VIEW.h; }
  }, { passive: false });

  // Start-banner: tap/click anywhere to skip it immediately (so mobile users don't wait)
  const bannerEl = $('roundBanner');
  if (bannerEl) {
    const skipBanner = (e) => { if (bannerTimer > 0) { e.preventDefault(); bannerTimer = 0; bannerEl.classList.add('hidden'); } };
    bannerEl.addEventListener('touchstart', skipBanner, { passive: false });
    bannerEl.addEventListener('mousedown', skipBanner);
  }

  // ---------- Sizing ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // On iOS Safari, window.innerHeight is the LARGE viewport (behind the toolbar) and
    // crops the bottom. Prefer the true visible area from window.visualViewport when
    // available (NOTE: window.visualViewport is the live instance; the bare global
    // `VisualViewport` is just the interface/constructor and has no width/height).
    const vv = window.visualViewport || null;
    VIEW.w = (vv && vv.width) ? vv.width : (window.innerWidth || document.documentElement.clientWidth);
    VIEW.h = (vv && vv.height) ? vv.height : (window.innerHeight || document.documentElement.clientHeight);
    canvas.width = VIEW.w * dpr;
    canvas.height = VIEW.h * dpr;
    canvas.style.width = VIEW.w + 'px';
    canvas.style.height = VIEW.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  // Re-sync when iOS shows/hides its browser chrome (visualViewport change).
  // Guard BOTH existence AND addEventListener being callable: some engines expose
  // a window.visualViewport object that is NOT a full EventTarget, so calling
  // addEventListener would throw and kill the whole game init.
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', resize);
    window.visualViewport.addEventListener('scroll', resize);
  }

  // world->screen transform. On touch we use a moderate follow-zoom (clamped) so the
  // arena stays readable but a follow camera keeps the player in view; on desktop we
  // fit the whole arena. MOBILE_ZOOM is tunable (was 2.0 -> too zoomed; 1.5 is balanced).
  const MOBILE_ZOOM = 1.5;
  function worldTransform() {
    const baseScale = Math.min(VIEW.w / WORLD.w, VIEW.h / WORLD.h);
    const scale = isTouch ? baseScale * MOBILE_ZOOM : baseScale;
    let ox, oy;
    if (isTouch && player) {
      // follow camera centered on player, clamped within world bounds
      const camX = WORLD.w * scale / 2 - player.x * scale;
      const camY = WORLD.h * (1 - camTilt) * scale / 2 - player.y * (1 - camTilt) * scale;
      const minOx = VIEW.w - WORLD.w * scale, maxOx = 0;
      const minOy = VIEW.h - WORLD.h * (1 - camTilt) * scale, maxOy = 0;
      ox = Math.min(maxOx, Math.max(minOx, camX));
      oy = Math.min(maxOy, Math.max(minOy, camY));
    } else {
      ox = (VIEW.w - WORLD.w * scale) / 2;
      oy = (VIEW.h - WORLD.h * scale) / 2;
    }
    return { scale, ox, oy };
  }
  // Pseudo-3D: tilt the world (vertical foreshorten) + gentle camera sway,
  // and project a world point with a "height" lift (for floating bodies / knives).
  function project(wx, wy, h = 0) {
    const t = worldTransform();
    const tilt = camTilt;
    // camera "angle": gentle horizontal parallax based on player's aim (over-the-shoulder feel)
    const look = (player.aim || 0);
    const camX = Math.sin(look) * 22 + Math.sin(camSway) * 10;
    const camY = -Math.cos(look) * 10; // look up/down shifts vertical
    return {
      x: wx * t.scale + t.ox + camX * t.scale,
      y: (wy * (1 - tilt) - h) * t.scale + t.oy + camY * t.scale,
      scale: t.scale, tilt,
    };
  }
  function drawShadow(ctx, x, y, r) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.9, r * (1 - camTilt) * 0.9, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  function toScreen(wx, wy) {
    const p = project(wx, wy, 0);
    return { x: p.x, y: p.y };
  }
  // Exact inverse of project() (ground plane, h=0) so mouse/touch aim lines up
  // with what's drawn — accounts for tilt + camera parallax.
  function screenToWorld(sx, sy) {
    const t = worldTransform();
    const tilt = camTilt;
    const look = (player.aim || 0);
    const camX = Math.sin(look) * 22 + Math.sin(camSway) * 10;
    const camY = -Math.cos(look) * 10;
    return {
      x: (sx - t.ox - camX * t.scale) / t.scale,
      y: (sy - t.oy - camY * t.scale) / (t.scale * (1 - tilt)),
    };
  }

  // ---------- Helpers ----------
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    return Math.hypot(cx - nx, cy - ny) < cr;
  }
  function lineBlocked(ax, ay, bx, by) {
    for (const c of crates) {
      if (circleRectHit((ax+bx)/2, (ay+by)/2, 4, c.x, c.y, c.w, c.h)) return true;
      // sample a few points along the line
    }
    // more thorough: sample segment
    const steps = 14;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      for (const c of crates) if (circleRectHit(px, py, 3, c.x, c.y, c.w, c.h)) return true;
    }
    return false;
  }

  // ---------- Round setup ----------
  function buildCrates(n) {
    crates = [];
    let tries = 0;
    while (crates.length < n && tries < 400) {
      tries++;
      const w = rand(50, 110), h = rand(50, 110);
      const x = rand(60, WORLD.w - 60 - w);
      const y = rand(60, WORLD.h - 60 - h);
      // keep away from center spawn
      if (Math.hypot(x + w/2 - WORLD.w/2, y + h/2 - WORLD.h/2) < 140) continue;
      let ok = true;
      for (const c of crates) if (!(x > c.x + c.w + 18 || x + w + 18 < c.x || y > c.y + c.h + 18 || y + h + 18 < c.y)) { ok = false; break; }
      if (ok) crates.push({ x, y, w, h });
    }
  }

  function spawnPositions(n) {
    const pts = [];
    let tries = 0;
    while (pts.length < n && tries < 600) {
      tries++;
      const x = rand(50, WORLD.w - 50), y = rand(50, WORLD.h - 50);
      if (dist({x,y}, {x: WORLD.w/2, y: WORLD.h/2}) < 90) continue;
      let ok = true;
      for (const c of crates) if (circleRectHit(x, y, 18, c.x, c.y, c.w, c.h)) { ok = false; break; }
      for (const p of pts) if (dist({x,y}, p) < 70) { ok = false; break; }
      if (ok) pts.push({ x, y });
    }
    while (pts.length < n) pts.push({ x: rand(60, WORLD.w-60), y: rand(60, WORLD.h-60) });
    return pts;
  }

  function startRound() {
    diff = diffParams();
    camTilt = diff.tilt;
    camSway = 0;
    blood = { level: 0, slides: [] };
    shockwaves = [];
    killsMilestone = 0;
    mapCfg = MAPS[save.equippedMap] || MAPS.arena;
    player.role = currentMode;
    player.x = WORLD.w / 2; player.y = WORLD.h / 2; player.alive = true; player.aim = 0;
    knives = []; particles = []; floaters = [];
    roundTime = diff.time; coinsThisRound = 0; killsThisRound = 0; knifeCooldown = 0; shake = 0;
    buildCrates(mapCfg.crates + diff.crateBonus);

    const count = 7 + Math.min(6, Math.floor(save.wins / 2)) + diff.innocentBonus; // scales difficulty
    const pts = spawnPositions(count + 1);
    innocents = [];
    for (let i = 0; i < count; i++) {
      innocents.push({
        x: pts[i].x, y: pts[i].y, r: 14, alive: true,
        vx: 0, vy: 0, panic: 0, wander: rand(0, Math.PI * 2), wt: rand(40, 110),
        variant: i % 4, facing: 0,
      });
    }
    sheriff = null; murderer = null;
    if (currentMode === 'murderer') {
      const sp = pts[count];
      sheriff = { x: sp.x, y: sp.y, r: 16, alive: true, dir: rand(0, Math.PI*2), turn: rand(30,90), alert: 0, shootCd: 0, speedMul: diff.aiSpeedMul };
    } else {
      const mp = pts[count];
      murderer = { x: mp.x, y: mp.y, r: 16, alive: true, dir: rand(0, Math.PI*2), turn: rand(40,100), recharge: 0, wander: rand(0,Math.PI*2), wt: rand(40,90), speedMul: diff.aiSpeedMul };
    }

    roundActive = true; paused = false;
    // role banner
    const banner = $('roundBanner');
    const role = banner.querySelector('.banner-role');
    const title = banner.querySelector('.banner-title');
    const sub = banner.querySelector('.banner-sub');
    title.classList.remove('sheriff','rainbow');
    if (currentMode === 'murderer') {
      role.textContent = 'YOU ARE THE'; title.textContent = 'MURDERER';
      sub.textContent = 'Eliminate all innocents. Avoid the Sheriff\'s sight.';
    } else {
      role.textContent = 'YOU ARE THE'; title.textContent = 'SHERIFF';
      title.classList.add('sheriff');
      sub.textContent = 'Shoot the Murderer (red cone). Protect the innocents!';
    }
    const blvl = banner.querySelector('.banner-level');
    if (blvl) blvl.textContent = `⚡ LEVEL ${diff.level}  ·  ${diff.innocentBonus} extra targets  ·  AI ×${diff.aiSpeedMul.toFixed(2)}  ·  ${diff.time}s`;
    banner.classList.remove('hidden');
    bannerTimer = 900;  // auto-dismiss quickly; tap/click skips immediately
    updateHUD();
    resize();
  }

  // ---------- Knife throw ----------
  function throwKnife() {
    if (knifeCooldown > 0 || !player.alive) return;
    const w = screenToWorld(mouse.x, mouse.y);
    const ang = angleTo(player, w);
    const k = KNIVES[save.equippedKnife] || KNIVES.crimson;
    knives.push({ x: player.x, y: player.y, vx: Math.cos(ang) * 12, vy: Math.sin(ang) * 12, r: 7, life: 90, color: k.color, trail: k.trail, from: 'player' });
    knifeCooldown = COOLDOWN_MAX;
    SFX.throw();
    // muzzle particles
    spawnParticles(player.x, player.y, k.trail, 4, 1.5);
  }

  // ---------- Particles & floaters ----------
  function spawnParticles(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.5, speed);
      particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: rand(20, 40), max: 40, color, size: rand(2, 5) });
    }
  }
  function floatText(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 50 });
  }
  // Explosion shrapnel: mixes elongated "spark" streaks with round particles.
  // Kept separate from spawnParticles() so its plain-circle callers — muzzle
  // flash, sheriff alert flash, knife-trail dust — are untouched/unaffected.
  // Adds `type` ('spark'|'circle') and `stretch` on top of the base particle
  // shape {x,y,vx,vy,life,max,color,size}; the generic update() loop only
  // reads x/y/vx/vy/life, so the extra fields ride along for free.
  function spawnBlastParticles(x, y, color, hotColor, n, speed, sparkRatio) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const isSpark = Math.random() < sparkRatio;
      const sp = isSpark ? rand(speed * 0.9, speed * 1.8) : rand(0.5, speed);
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(isSpark ? 14 : 22, isSpark ? 30 : 44), max: 44,
        color: Math.random() < 0.35 ? hotColor : color,
        size: isSpark ? rand(1.5, 3) : rand(2, 5.5),
        type: isSpark ? 'spark' : 'circle',
        stretch: isSpark ? rand(2.6, 4.5) : 1,
      });
    }
  }
  // Progressive explosions: every 5 murderer kills, the blast gets bigger & bloodier.
  function explode(x, y, color) {
    const tier = Math.floor(killsMilestone / 5);   // 0,1,2...
    const scale = diff.explodeScale * (1 + tier * 0.45);
    const baseR = 26 * scale;
    const hot = shade(color, 0.6); // near-white hot version of the kill color

    // hot core flash: one oversized short-lived particle, rendered as an
    // additive radial bloom (white core -> kill color -> transparent) that
    // grows and fades — the "brighter/hotter" impact punch.
    particles.push({
      x, y, vx: 0, vy: 0,
      life: 10 + tier * 3, max: 10 + tier * 3,
      color, size: (16 + tier * 7) * scale, type: 'flash',
    });

    // mixed circular + spark shrapnel: outer colored burst, inner hot/white burst
    spawnBlastParticles(x, y, color, hot, 14 + tier * 8, 3.2 + tier * 1.4, 0.55);
    spawnBlastParticles(x, y, hot, '#ffffff', 8 + tier * 5, 4.4 + tier * 1.7, 0.75);

    // expanding shockwave ring(s): hot inner ring first, colored ring(s) after;
    // higher tiers add extra delayed rings for a more chaotic multi-pulse feel
    const rings = 1 + Math.min(2, tier);
    for (let i = 0; i < rings; i++) {
      shockwaves.push({
        x, y, h: 14, r: baseR * (0.35 + i * 0.5),
        speed: (3.4 + tier * 0.9) * (i * 0.35 + 1),
        life: 24 + tier * 8, max: 24 + tier * 8,
        width: 3 + tier * 1.6, color: i === 0 ? hot : color,
      });
    }
    shake = Math.max(shake, 8 + tier * 4);
    if (tier > 0) SFX.boom();   // extra low thump on milestone (bigger) explosions only
  }
  function triggerBlood() {
    // sheriff just killed the murderer — cover the screen in blood + brain matter
    blood.level = 0.95;
    blood.slide = 0;
    blood.blobs = [];
    blood.slides = [];
    const cols = ['#7a0000', '#9b0010', '#b00018', '#5e0000'];
    for (let i = 0; i < 26; i++) {
      blood.blobs.push({ x: Math.random(), y: Math.random()*0.7, r: 8 + Math.random()*34, c: cols[(Math.random()*cols.length)|0] });
    }
    for (let i = 0; i < 14; i++) {
      blood.slides.push({ x: Math.random(), y0: Math.random()*0.6, len: 0.2 + Math.random()*0.5 });
    }
    SFX.death();
  }

  // ---------- Update ----------
  function update() {
    if (!roundActive || paused) return;

    // camera + effect timers
    camSway += 0.02;
    if (blood.level > 0) { blood.level = Math.max(0, blood.level - 0.012); blood.slide += 2.2; }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const w = shockwaves[i]; w.r += w.speed; w.life--; if (w.life <= 0) shockwaves.splice(i, 1);
    }
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    // mobile joystick contributes too
    if (joy.active) { dx += joy.dx; dy += joy.dy; }
    if (dx || dy) { const m = Math.hypot(dx, dy); dx /= m; dy /= m; }
    const nx = clamp(player.x + dx * player.speed, 20, WORLD.w - 20);
    const ny = clamp(player.y + dy * player.speed, 20, WORLD.h - 20);
    if (!hitsCrate(nx, player.y, player.r)) player.x = nx;
    if (!hitsCrate(player.x, ny, player.r)) player.y = ny;
    // aim
    if (isTouch && (joy.active && (joy.dx || joy.dy))) {
      // on touch with joystick pushed, aim where you're heading (auto-aim forward)
      player.aim = Math.atan2(dy, dx);
    } else if (!isTouch) {
      const w = screenToWorld(mouse.x, mouse.y);
      player.aim = angleTo(player, w);
    } else if (firing) {
      // hold fire on touch: keep throwing straight ahead (player.aim unchanged)
    }
    // auto-fire while the fire button is held
    if (firing && knifeCooldown <= 0 && player.alive) throwKnife();

    if (knifeCooldown > 0) knifeCooldown--;

    const threat = currentMode === 'murderer' ? sheriff : murderer;

    // --- innocents AI: wander, flee from the threat's sight, avoid crates ---
    for (const inn of innocents) {
      if (!inn.alive) continue;
      const ds = threat ? dist(inn, threat) : 9999;
      const alerted = threat && threat.alert > 0.3;
      let targetAng = inn.wander;
      if (ds < 220 && alerted) {
        inn.panic = 1;
        targetAng = angleTo(threat, inn); // run away
      } else { inn.panic = Math.max(0, inn.panic - 0.02); }
      inn.facing = targetAng; // face the direction actually being moved (flee angle or wander angle)
      inn.wt--;
      if (inn.wt <= 0) { inn.wander = rand(0, Math.PI*2); inn.wt = rand(40, 110); }
      const sp = (inn.panic > 0.5 ? 2.6 : 1.5) * (threat ? threat.speedMul || 1 : 1);
      let mvx = Math.cos(targetAng) * sp, mvy = Math.sin(targetAng) * sp;
      const ix = clamp(inn.x + mvx, 16, WORLD.w - 16);
      const iy = clamp(inn.y + mvy, 16, WORLD.h - 16);
      if (!hitsCrate(ix, inn.y, inn.r)) inn.x = ix;
      if (!hitsCrate(inn.x, iy, inn.r)) inn.y = iy;
    }

    // --- sheriff AI (murderer mode): patrol, scan, detect player in cone, shoot ---
    if (sheriff && sheriff.alive) {
      sheriff.turn--;
      if (sheriff.turn <= 0) { sheriff.dir += rand(-1.2, 1.2); sheriff.turn = rand(40, 110); }
      const sx = clamp(sheriff.x + Math.cos(sheriff.dir) * 1.4 * sheriff.speedMul, 20, WORLD.w - 20);
      const sy = clamp(sheriff.y + Math.sin(sheriff.dir) * 1.4 * sheriff.speedMul, 20, WORLD.h - 20);
      if (!hitsCrate(sx, sheriff.y, sheriff.r)) sheriff.x = sx;
      if (!hitsCrate(sheriff.x, sy, sheriff.r)) sheriff.y = sy;
      const dToPlayer = dist(sheriff, player);
      const angToP = angleTo(sheriff, player);
      let diff = Math.abs(((angToP - sheriff.dir + Math.PI*3) % (Math.PI*2)) - Math.PI);
      const inCone = dToPlayer < 360 && diff < 0.5 && !lineBlocked(sheriff.x, sheriff.y, player.x, player.y);
      if (inCone) {
        sheriff.alert = Math.min(1, sheriff.alert + 0.06);
        sheriff.dir = angToP;
        if (sheriff.shootCd <= 0 && dToPlayer < 460) {
          sheriff.shootCd = 24;
          spawnParticles(player.x, player.y, '#ffd54a', 14, 3);
          SFX.alarm(); shake = 14;
          const sh = sheriff, pl = player;
          setTimeout(() => {
            if (roundActive && !paused && sh && sh === sheriff && sh.alert > 0.6 && dist(sh, pl) < 470 && !lineBlocked(sh.x, sh.y, pl.x, pl.y) && pl.alive) {
              pl.alive = false; endRound(false, 'The Sheriff caught your glow.');
            }
          }, 380);
        }
      } else { sheriff.alert = Math.max(0, sheriff.alert - 0.02); }
      if (sheriff.shootCd > 0) sheriff.shootCd--;
    }

    // --- murderer AI (sheriff mode): hunt innocents, snipe sheriff when safe ---
    if (murderer && murderer.alive) {
      murderer.turn--;
      if (murderer.turn <= 0) { murderer.dir += rand(-1.0, 1.0); murderer.turn = rand(40, 100); }
      // chase nearest innocent, or flee from sheriff cone
      let target = null, best = 1e9;
      for (const inn of innocents) { if (!inn.alive) continue; const d = dist(murderer, inn); if (d < best) { best = d; target = inn; } }
      let goalAng = murderer.wander;
      const dm = dist(murderer, player);
      const angM = angleTo(player, murderer);
      let mdiff = Math.abs(((angM - player.aim + Math.PI*3) % (Math.PI*2)) - Math.PI);
      const inSheriffCone = dm < 360 && mdiff < 0.45;
      if (inSheriffCone) { murderer.panic = 1; goalAng = angM; }
      else { murderer.panic = Math.max(0, murderer.panic - 0.03); if (target) goalAng = angleTo(murderer, target); }
      murderer.wt--;
      if (murderer.wt <= 0) { murderer.wander = rand(0, Math.PI*2); murderer.wt = rand(40, 90); }
      const msp = (murderer.panic > 0.5 ? 3.0 : 2.4) * murderer.speedMul;
      const mx = clamp(murderer.x + Math.cos(goalAng)*msp, 18, WORLD.w-18);
      const my = clamp(murderer.y + Math.sin(goalAng)*msp, 18, WORLD.h-18);
      if (!hitsCrate(mx, murderer.y, murderer.r)) murderer.x = mx;
      if (!hitsCrate(murderer.x, my, murderer.r)) murderer.y = my;
      // throw knives at nearest innocent when off cooldown
      if (murderer.recharge > 0) murderer.recharge--;
      else if (target) {
        const ka = angleTo(murderer, target);
        knives.push({ x: murderer.x, y: murderer.y, vx: Math.cos(ka)*9, vy: Math.sin(ka)*9, r: 7, life: 80, color: '#ff2e88', trail: '#ff8ab8', from: 'murderer' });
        murderer.recharge = 40;
      }
    }

    // --- knives ---
    for (let i = knives.length - 1; i >= 0; i--) {
      const k = knives[i];
      k.x += k.vx; k.y += k.vy; k.life--;
      if (Math.random() < 0.5) spawnParticles(k.x, k.y, k.trail, 1, 0.4);
      let dead = k.life <= 0;
      if (k.x < -20 || k.x > WORLD.w + 20 || k.y < -20 || k.y > WORLD.h + 20) dead = true;
      if (!dead) for (const c of crates) if (circleRectHit(k.x, k.y, k.r, c.x, c.y, c.w, c.h)) { spawnParticles(k.x, k.y, k.trail, 6, 2); dead = true; break; }
      // player knives
      if (!dead && k.from === 'player') {
        for (const inn of innocents) {
          if (inn.alive && dist(k, inn) < inn.r + k.r) {
            inn.alive = false; spawnParticles(inn.x, inn.y, '#ff2e88', 22, 4);
            SFX.hit(); shake = Math.max(shake, 8);
            coinsThisRound += 5; save.coins += 5; killsThisRound++;
            floatText(inn.x, inn.y - 10, '+5', '#ffd54a'); SFX.coin();
            killsMilestone++; explode(inn.x, inn.y, '#ff2e88');
            dead = true; break;
          }
        }
        // sheriff mode: player knife hits the murderer
        if (!dead && currentMode === 'sheriff' && murderer && murderer.alive && dist(k, murderer) < murderer.r + k.r) {
          murderer.alive = false;
          spawnParticles(murderer.x, murderer.y, '#ffd54a', 26, 4);
          SFX.hit(); shake = Math.max(shake, 10);
          coinsThisRound += 25; save.coins += 25; killsThisRound++;
          floatText(murderer.x, murderer.y - 10, '+25', '#ffd54a'); SFX.coin();
          explode(murderer.x, murderer.y, '#ffd54a');
          triggerBlood();
          dead = true;
        }
      }
      // murderer knives (sheriff mode): hit innocents, or hit the player sheriff
      if (!dead && k.from === 'murderer') {
        for (const inn of innocents) {
          if (inn.alive && dist(k, inn) < inn.r + k.r) {
            inn.alive = false; spawnParticles(inn.x, inn.y, '#ff2e88', 18, 4);
            SFX.hit(); killsMilestone++; explode(inn.x, inn.y, '#ff2e88');
            dead = true; break;
          }
        }
        if (!dead && currentMode === 'sheriff' && player.alive && dist(k, player) < player.r + k.r) {
          player.alive = false; spawnParticles(player.x, player.y, '#ff2e88', 24, 4);
          SFX.death(); shake = 14;
          setTimeout(() => { if (roundActive && !paused) endRound(false, 'The Murderer got you!'); }, 250);
          dead = true;
        }
      }
      if (dead) knives.splice(i, 1);
    }

    // --- particles ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.y -= 0.7; f.life--;
      if (f.life <= 0) floaters.splice(i, 1);
    }

    if (shake > 0) shake *= 0.85, shake = Math.max(0, shake - 0.2);

    // --- timer & win/lose ---
    roundTime -= 1 / 60;
    const remaining = innocents.filter(i => i.alive).length;
    updateHUD(remaining);
    if (currentMode === 'murderer') {
      if (remaining === 0) endRound(true);
      else if (roundTime <= 0) endRound(false, 'Time ran out. The innocents survived.');
    } else {
      if (murderer && !murderer.alive) endRound(true);
      else if (remaining === 0) endRound(false, 'The Murderer killed everyone. Too late!');
      else if (roundTime <= 0) endRound(false, 'Time up — the Murderer escaped!');
    }
  }

  function hitsCrate(x, y, r) {
    for (const c of crates) if (circleRectHit(x, y, r, c.x, c.y, c.w, c.h)) return true;
    return false;
  }

  // ---------- Render ----------
  function render() {
    const t = worldTransform();
    ctx.save();
    // background
    ctx.fillStyle = mapCfg.bg;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    // shake
    if (shake > 0.3) { ctx.translate(rand(-shake, shake), rand(-shake, shake)); }

    // world clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(t.ox, t.oy, WORLD.w * t.scale, WORLD.h * t.scale);
    ctx.clip();

    // grid
    ctx.strokeStyle = mapCfg.grid; ctx.lineWidth = 1;
    const gs = 64 * t.scale;
    for (let x = t.ox; x < t.ox + WORLD.w * t.scale; x += gs) { ctx.beginPath(); ctx.moveTo(x, t.oy); ctx.lineTo(x, t.oy + WORLD.h * t.scale); ctx.stroke(); }
    for (let y = t.oy; y < t.oy + WORLD.h * t.scale; y += gs) { ctx.beginPath(); ctx.moveTo(t.ox, y); ctx.lineTo(t.ox + WORLD.w * t.scale, y); ctx.stroke(); }

    const S = (wx, wy, h = 0) => project(wx, wy, h);
    const sc = t.scale;
    // collision-clarity helper: draw a floor hit-radius ring (faint) for any entity
    const ringAt = (e, col) => {
      const p = S(e.x, e.y);
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, e.r*sc, e.r*sc*(1-camTilt), 0, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    };

    // vision cone: AI sheriff (murderer mode) OR player sheriff (sheriff mode)
    const coneOwner = (currentMode === 'murderer') ? sheriff : (player.alive ? player : null);
    const coneAlert = (currentMode === 'murderer') ? (sheriff ? sheriff.alert : 0) : 0;
    const coneDir = (currentMode === 'murderer') ? (sheriff ? sheriff.dir : 0) : player.aim;
    if (coneOwner) {
      const a = S(coneOwner.x, coneOwner.y);
      const coneLen = 360 * sc, half = 0.5;
      ctx.save();
      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, coneLen);
      grad.addColorStop(0, coneAlert > 0.5 ? 'rgba(255,80,80,0.34)' : 'rgba(255,213,74,0.20)');
      grad.addColorStop(1, 'rgba(255,213,74,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.arc(a.x, a.y, coneLen, coneDir - half, coneDir + half);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // buildings (detailed 3D structures; collision = their footprint)
    const mapAccent = MAP_ACCENT[mapCfg.name] || '#b14bff';
    for (const c of crates) {
      const g = S(c.x + c.w/2, c.y + c.h/2);
      const ww = c.w * sc, hh = c.h * sc;
      const lift = 18 * sc;
      // stable per-building seed from the crate's world rect (fixed for the whole round,
      // built once in buildCrates()) so each building keeps the same rooftop/material/
      // window pattern every single frame instead of re-rolling and flickering.
      const seed = c.x * 0.1013 + c.y * 0.0721 + c.w * 0.319 + c.h * 0.577;
      drawShadow(ctx, g.x, g.y, Math.max(ww, hh) * 0.5);
      drawBuilding(g.x, g.y, ww, hh, lift, shade(mapAccent, -0.72), mapAccent, seed);
      // collision footprint ring (clarity): outline the blocking area on the floor
      ctx.save();
      ctx.globalAlpha = 0.25; ctx.strokeStyle = 'rgba(255,80,120,0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(g.x - ww/2, g.y - hh/2, ww, hh);
      ctx.restore();
    }

    // collision clarity: faint floor rings showing each entity's hit radius
    const ringAt2 = (e, col) => { const p = S(e.x, e.y); ctx.strokeStyle = col || 'rgba(33,230,255,0.8)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, e.r*sc, e.r*sc*(1-camTilt), 0, 0, Math.PI*2); ctx.stroke(); };

    // innocents (civilians) — detailed figures
    for (const inn of innocents) {
      if (!inn.alive) continue;
      const g = S(inn.x, inn.y);
      drawShadow(ctx, g.x, g.y, inn.r * sc);
      ringAt(inn, 'rgba(33,230,255,0.6)');
      const outfit = INNOCENT_OUTFITS[(inn.variant || 0) % INNOCENT_OUTFITS.length];
      drawFigure(g.x, g.y, inn.r*sc, 26*sc, { ...outfit, variant: inn.variant || 0, facing: inn.facing || 0, panic: inn.panic });
    }

    // sheriff (AI, murderer mode) — cowboy hat + star badge
    if (sheriff) {
      const g = S(sheriff.x, sheriff.y);
      drawShadow(ctx, g.x, g.y, sheriff.r * sc);
      ringAt(sheriff, 'rgba(255,213,74,0.85)');
      drawFigure(g.x, g.y, sheriff.r*sc, 30*sc, { body: '#ffe08a', coat: '#7a5a1e', skin: '#ffd9b8', hat: 'sheriff', badge: true, glow: 'rgba(255,213,74,0.5)', facing: sheriff.dir });
      if (sheriff.alert > 0.5) {
        ctx.fillStyle = '#ff3b3b'; ctx.font = `${Math.round(20*sc)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('!', g.x, g.y - 44*sc);
      }
    }

    // murderer (AI, sheriff mode) — hooded figure with glowing eyes
    if (murderer && murderer.alive) {
      const g = S(murderer.x, murderer.y);
      drawShadow(ctx, g.x, g.y, murderer.r * sc);
      ringAt(murderer, 'rgba(255,46,136,0.85)');
      drawFigure(g.x, g.y, murderer.r*sc, 30*sc, { body: '#2a1638', coat: '#170d22', skin: '#caa', hat: 'hood', glow: '#ff2e88', facing: murderer.dir });
    }

    // knives (lifted slightly for 3D feel) — spinning blade + comet-style motion trail
    for (const k of knives) {
      const p = S(k.x, k.y, 14);
      const ang = Math.atan2(k.vy, k.vx);
      const spd = Math.hypot(k.vx, k.vy);
      ctx.save();
      ctx.translate(p.x, p.y);

      // motion trail: tapered glow streak + brighter hot core, back along velocity.
      // Cheap (two strokes, no stored history) but reads as a proper knife "swoosh".
      const trailLen = Math.min(52, spd * 3.4) * sc;
      if (trailLen > 3) {
        const tx = -Math.cos(ang) * trailLen, ty = -Math.sin(ang) * trailLen;
        const tg = ctx.createLinearGradient(0, 0, tx, ty);
        tg.addColorStop(0, k.trail);
        tg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = tg; ctx.lineWidth = 3.4 * sc; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1 * sc;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx * 0.55, ty * 0.55); ctx.stroke();
        ctx.restore();
      }

      // blade spins rapidly in flight (visual flourish only — k.r/hit-testing untouched)
      ctx.rotate(ang + k.life * 0.55);
      drawKnifeBlade(ctx, 20 * sc, 6.6 * sc, k.color, k.trail, {
        glow: 12 * sc, sparkle: true, glintAlpha: 0.5 + 0.5 * Math.abs(Math.sin(k.life * 0.5)),
      });
      ctx.restore();
    }

    // player — detailed figure according to role (with shadow, collision ring, lifted)
    if (player.alive) {
      const g = S(player.x, player.y);
      drawShadow(ctx, g.x, g.y, player.r * sc);
      ringAt(player, currentMode === 'sheriff' ? 'rgba(255,213,74,0.9)' : 'rgba(255,46,136,0.9)');
      const k = KNIVES[save.equippedKnife] || KNIVES.crimson;
      const knifeColor = rainbowKnife ? rainbowColor() : k.color;
      const knifeTrail = rainbowKnife ? rainbowColor() : k.trail;
      if (currentMode === 'sheriff') {
        drawFigure(g.x, g.y, player.r*sc, 30*sc, { body: '#ffe08a', coat: '#7a5a1e', skin: '#ffd9b8', hat: 'sheriff', badge: true, glow: 'rgba(255,213,74,0.5)', facing: player.aim });
      } else {
        drawFigure(g.x, g.y, player.r*sc, 30*sc, { body: '#2a1638', coat: '#170d22', skin: '#caa', hat: 'hood', glow: knifeColor, facing: player.aim });
      }
      // held knife in aim direction — shares drawKnifeBlade with the flying knife
      // so the weapon reads as the same object in-hand and mid-throw
      ctx.save(); ctx.translate(g.x, g.y - 30*sc*0.9); ctx.rotate(player.aim);
      drawKnifeBlade(ctx, 24 * sc, 7.6 * sc, knifeColor, knifeTrail, {
        glow: 13 * sc, sparkle: true, glintAlpha: 0.5 + 0.5 * Math.sin(performance.now() / 260),
      });
      ctx.restore();
    }

    // shockwaves (expanding rings): double stroke (soft outer glow + crisp inner
    // ring) that shifts from white-hot to the ring's color as it expands, then fades.
    for (const w of shockwaves) {
      const p = S(w.x, w.y);
      const t2 = Math.max(0, w.life / w.max);      // 1 -> 0 as it fades
      const grow = 1 - t2;                          // 0 -> 1 as it expands
      const ry = w.r * sc * (1 - camTilt);          // foreshortened to match the floor
      const ringColor = grow < 0.35 ? shade(w.color, (0.35 - grow) * 1.6) : w.color;
      ctx.save();
      ctx.translate(p.x, p.y - w.h * sc);
      ctx.globalAlpha = t2 * 0.32;
      ctx.strokeStyle = ringColor; ctx.lineWidth = w.width * sc * 2.2;
      ctx.beginPath(); ctx.ellipse(0, 0, w.r * sc, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = t2 * 0.85;
      ctx.lineWidth = Math.max(1, w.width * sc * 0.8);
      ctx.beginPath(); ctx.ellipse(0, 0, w.r * sc * 0.94, ry * 0.94, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // blood / brain-matter screen overlay (sheriff kill) — drawn in screen space, slides down
    if (blood.level > 0.01) {
      const W = VIEW.w, H = VIEW.h;
      ctx.save();
      ctx.globalAlpha = Math.min(0.92, blood.level);
      // base splatter wash
      ctx.fillStyle = 'rgba(120,0,0,1)';
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(140,0,0,0.95)');
      grad.addColorStop(0.5, 'rgba(90,0,0,0.75)');
      grad.addColorStop(1, 'rgba(60,0,0,0.55)');
      ctx.fillStyle = grad;
      // top splatter band that descends
      const drop = (1 - blood.level) * H * 0.6 + blood.slide;
      ctx.fillRect(0, 0, W, Math.min(H, drop + 40));
      // splatter blobs
      ctx.globalAlpha = Math.min(1, blood.level);
      for (const s of blood.blobs) {
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x * W, (s.y - (1-blood.level)) * H * 0.8 + blood.slide, s.r * (W/900), 0, Math.PI*2); ctx.fill();
      }
      // brain-matter streaks sliding down
      ctx.strokeStyle = 'rgba(200,170,150,0.9)'; ctx.lineWidth = 6;
      for (const s of blood.slides) {
        ctx.beginPath(); ctx.moveTo(s.x * W, s.y0 * H + blood.slide);
        ctx.lineTo(s.x * W + Math.sin(s.y0*20)*8, s.y0 * H + blood.slide + s.len * H);
        ctx.stroke();
      }
      ctx.restore();
    }

    // disco overlay
    if (discoMode) {
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = rainbowColor();
      ctx.fillRect(t.ox, t.oy, WORLD.w * t.scale, WORLD.h * t.scale);
      ctx.globalAlpha = 1;
    }

    // particles: plain circles (defaults / most existing spawnParticles callers),
    // elongated "spark" streaks, and additive "flash" blooms (kill explosions).
    for (const pt of particles) {
      const p = S(pt.x, pt.y);
      const alpha = Math.max(0, pt.life / pt.max);
      if (pt.type === 'flash') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.9;
        const rr = pt.size * sc * (1.4 - alpha * 0.6);
        const grad2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, rr));
        grad2.addColorStop(0, '#ffffff');
        grad2.addColorStop(0.4, pt.color);
        grad2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad2;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, rr), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (pt.type === 'spark') {
        ctx.save();
        ctx.globalAlpha = alpha;
        const ang = Math.atan2(pt.vy, pt.vx);
        const len = pt.size * sc * (pt.stretch || 3);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = Math.max(1, pt.size * sc * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, pt.size * sc, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // floaters
    ctx.textAlign = 'center';
    for (const f of floaters) {
      const p = S(f.x, f.y);
      ctx.globalAlpha = Math.max(0, f.life / 50);
      ctx.fillStyle = f.color; ctx.font = `bold ${Math.round(18*sc)}px sans-serif`;
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore(); // world clip
    ctx.restore(); // shake
  }

  function drawStar(cx, cy, spikes, outer, inner) {
    let rot = -Math.PI/2; const step = Math.PI / spikes;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(rot)*outer, cy + Math.sin(rot)*outer);
    for (let i = 0; i < spikes; i++) {
      rot += step; ctx.lineTo(cx + Math.cos(rot)*inner, cy + Math.sin(rot)*inner);
      rot += step; ctx.lineTo(cx + Math.cos(rot)*outer, cy + Math.sin(rot)*outer);
    }
    ctx.closePath(); ctx.fill();
  }

  // Shared knife-blade renderer: draws a detailed dagger pointing along +x in
  // whatever transform the caller has already set up (translate+rotate). Used
  // for BOTH the held knife and flying knives so they read as the same weapon.
  // L/Wd are on-screen length/width (already multiplied by the world scale).
  // opts: { glow: shadowBlur px, sparkle: bool, glintAlpha: 0..1 }
  function drawKnifeBlade(ctx, L, Wd, color, glowColor, opts) {
    opts = opts || {};
    const tipX = L * 0.62, heelX = -L * 0.18, gripEnd = -L * 0.5;
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = opts.glow != null ? opts.glow : 10;

    // blade silhouette (curved dagger edge, not a flat triangle)
    ctx.beginPath();
    ctx.moveTo(tipX, 0);
    ctx.quadraticCurveTo(L * 0.18, -Wd * 0.58, heelX, -Wd * 0.46);
    ctx.lineTo(heelX, Wd * 0.46);
    ctx.quadraticCurveTo(L * 0.18, Wd * 0.58, tipX, 0);
    ctx.closePath();
    const bg = ctx.createLinearGradient(heelX, -Wd / 2, tipX, Wd / 2);
    bg.addColorStop(0, shade(color, -0.25));
    bg.addColorStop(0.55, color);
    bg.addColorStop(1, '#ffffff');
    ctx.fillStyle = bg;
    ctx.fill();

    // bright spine highlight along the top edge
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(0.5, Wd * 0.09);
    ctx.beginPath();
    ctx.moveTo(heelX * 0.6, -Wd * 0.14);
    ctx.lineTo(tipX * 0.82, -Wd * 0.04);
    ctx.stroke();

    // crossguard
    ctx.fillStyle = shade(color, -0.55);
    ctx.fillRect(heelX - Wd * 0.06, -Wd * 0.78, Wd * 0.22, Wd * 1.56);

    // wrapped handle
    ctx.fillStyle = '#1c1420';
    const gripLen = (heelX - Wd * 0.06) - gripEnd;
    ctx.fillRect(gripEnd, -Wd * 0.34, gripLen, Wd * 0.68);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(0.5, Wd * 0.05);
    for (let i = 1; i <= 2; i++) {
      const gx = gripEnd + gripLen * (i / 3);
      ctx.beginPath(); ctx.moveTo(gx, -Wd * 0.34); ctx.lineTo(gx, Wd * 0.34); ctx.stroke();
    }

    // pommel glint
    ctx.fillStyle = glowColor;
    ctx.beginPath(); ctx.arc(gripEnd, 0, Wd * 0.16, 0, Math.PI * 2); ctx.fill();

    // sparkle: small twinkling highlight on the blade face
    if (opts.sparkle) {
      ctx.globalAlpha = opts.glintAlpha != null ? opts.glintAlpha : 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(tipX * 0.32, -Wd * 0.1, Wd * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---- Advanced 3D character illustrations ----
  // Draws a "paper-doll" figure standing with height, facing dir, lifted by h.
  // opts: { body, coat, skin, hair, hat:'sheriff'|'hood'|undefined, badge, glow, facing, variant, panic }
  function drawFigure(x, y, rPx, hPx, opts) {
    const s = opts || {};
    const body = s.body || '#8be0ff';
    const coat = s.coat || '#3a2a66';
    const skin = s.skin || '#ffd9b8';
    const hair = s.hair || '#6b4a2a';
    const facing = (s.facing != null) ? s.facing : 0;
    const variant = s.variant || 0;
    const panic = s.panic || 0;
    const isSheriff = s.hat === 'sheriff';
    const isHood = s.hat === 'hood';
    const isInnocent = !isSheriff && !isHood;

    // -- facing decomposition: mirror L/R, blend front(camera)<->back(away) --
    // After ctx.scale(mirror,1) below, local +x ALWAYS ends up on the side the
    // character is horizontally facing — so "front" details (lean, badge, blade
    // hand) go at local +x, "back" details (ponytail, hood point) at local -x.
    const mirror = Math.cos(facing) < 0 ? -1 : 1;
    const frontAmt = clamp((Math.sin(facing) + 1) / 2, 0, 1);   // 1 = toward camera, 0 = facing away
    const lean = Math.abs(Math.cos(facing)) * rPx * 0.16;        // forward lean into facing dir
    const tuck = (1 - frontAmt) * rPx * 0.10;                    // head tucks slightly when facing away

    // cheap idle bob — phase seeded by screen pos so figures don't sync up
    const bob = Math.sin(camSway * 2.4 + x * 0.037 + y * 0.051) * rPx * 0.05;
    const jit = panic > 0.05 ? Math.sin(camSway * 9 + x * 0.09) * rPx * 0.05 * panic : 0;

    const buildMul = isInnocent ? (0.92 + (variant % 3) * 0.07) : 1;
    const H = hPx * buildMul;
    const strideW = rPx * (0.42 + (panic > 0.5 ? 0.1 : 0));
    const strideY = H * 0.55;
    const chestX = lean * 0.7;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(mirror, 1);

    // ================= LEGS + BOOTS =================
    ctx.strokeStyle = shade(coat, -0.2);
    ctx.lineWidth = Math.max(2, rPx * 0.44);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-strideW + lean * 0.3, 0);
    ctx.lineTo(-strideW * 1.05, strideY + jit);
    ctx.moveTo(strideW - lean * 0.3, 0);
    ctx.lineTo(strideW * 1.05, strideY - jit);
    ctx.stroke();
    ctx.fillStyle = shade(coat, -0.45);
    ctx.beginPath(); ctx.ellipse(-strideW * 1.05, strideY + jit, rPx * 0.26, rPx * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(strideW * 1.05, strideY - jit, rPx * 0.26, rPx * 0.15, 0, 0, Math.PI * 2); ctx.fill();

    // ================= CLOAK (murderer) / TORSO+COAT (sheriff & innocent) =================
    if (isHood) {
      const hemY = H * 0.6, hemW = rPx * 1.3;
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.moveTo(-rPx * 0.55 + lean, -H * 0.15);
      ctx.quadraticCurveTo(lean * 0.4, -H * 1.05, rPx * 0.55 + lean, -H * 0.15);
      ctx.quadraticCurveTo(hemW * 0.8, hemY * 0.45, hemW, hemY);
      const teeth = 6;
      for (let i = 0; i <= teeth; i++) {
        const tx = hemW - (i / teeth) * hemW * 2;
        const ty = hemY + (i % 2 === 0 ? 0 : -rPx * 0.2);
        ctx.lineTo(tx, ty);
      }
      ctx.quadraticCurveTo(-hemW * 0.8, hemY * 0.45, -rPx * 0.55 + lean, -H * 0.15);
      ctx.closePath(); ctx.fill();
      // shoulder highlight seam
      ctx.strokeStyle = shade(coat, 0.15); ctx.lineWidth = Math.max(1, rPx * 0.08); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(-rPx * 0.5 + lean, -H * 0.2); ctx.quadraticCurveTo(lean * 0.4, -H * 1.0, rPx * 0.5 + lean, -H * 0.2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // torso body-color dome
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-rPx * 0.95, 0);
      ctx.quadraticCurveTo(lean, -H * 1.1, rPx * 0.95, 0);
      ctx.closePath(); ctx.fill();
      // rim light on the front-facing shoulder
      ctx.strokeStyle = shade(body, 0.3); ctx.lineWidth = 1.4; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(rPx * 0.15, -H * 0.9); ctx.quadraticCurveTo(rPx * 0.9, -H * 0.5, rPx * 0.9, -rPx * 0.1); ctx.stroke();
      ctx.globalAlpha = 1;
      // coat overlay
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.moveTo(-rPx * 0.95, 0); ctx.lineTo(lean, -H * 0.2); ctx.lineTo(rPx * 0.95, 0);
      ctx.lineTo(rPx * 0.7, H * 0.5); ctx.lineTo(-rPx * 0.7, H * 0.5); ctx.closePath(); ctx.fill();
      // belt
      ctx.strokeStyle = shade(coat, -0.5); ctx.lineWidth = Math.max(1, rPx * 0.1);
      ctx.beginPath(); ctx.moveTo(-rPx * 0.72, H * 0.18); ctx.lineTo(rPx * 0.72, H * 0.18); ctx.stroke();
      // stubby arms (raised when panicking / fleeing)
      ctx.strokeStyle = coat; ctx.lineWidth = Math.max(2, rPx * 0.3); ctx.lineCap = 'round';
      const armLift = panic > 0.4 ? -rPx * 0.55 : rPx * 0.15;
      ctx.beginPath();
      ctx.moveTo(-rPx * 0.85, -H * 0.15); ctx.lineTo(-rPx * 1.05, armLift);
      ctx.moveTo(rPx * 0.85, -H * 0.15); ctx.lineTo(rPx * 1.05, armLift);
      ctx.stroke();
    }

    // ================= HEAD =================
    const hx = lean, hy = -H * 1.15 + bob + tuck;
    if (!isHood) {
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, rPx * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    if (isSheriff) {
      // wide brim: dark underside + lighter top disc (a thin dark rim shows through)
      ctx.fillStyle = shade('#5a3a12', -0.2);
      ctx.beginPath(); ctx.ellipse(hx, hy - rPx * 0.26, rPx * 1.05, rPx * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5420';
      ctx.beginPath(); ctx.ellipse(hx, hy - rPx * 0.32, rPx * 0.95, rPx * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      // crown
      ctx.fillStyle = '#6a4a1a';
      ctx.fillRect(hx - rPx * 0.4, hy - rPx * 0.88, rPx * 0.8, rPx * 0.56);
      ctx.beginPath(); ctx.arc(hx, hy - rPx * 0.88, rPx * 0.4, Math.PI, 0); ctx.fill();
      // hat band + pinch dent
      ctx.strokeStyle = '#3a2400'; ctx.lineWidth = Math.max(1, rPx * 0.1);
      ctx.beginPath(); ctx.moveTo(hx - rPx * 0.4, hy - rPx * 0.36); ctx.lineTo(hx + rPx * 0.4, hy - rPx * 0.36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx, hy - rPx * 0.9); ctx.lineTo(hx, hy - rPx * 0.6); ctx.stroke();
      // mustache (fades a touch when facing away)
      ctx.strokeStyle = '#4a3320'; ctx.lineWidth = Math.max(1.4, rPx * 0.14); ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5 + frontAmt * 0.5;
      ctx.beginPath();
      ctx.moveTo(hx - rPx * 0.24, hy + rPx * 0.16); ctx.quadraticCurveTo(hx, hy + rPx * 0.26, hx + rPx * 0.24, hy + rPx * 0.16);
      ctx.stroke(); ctx.globalAlpha = 1;
    } else if (isHood) {
      // hood shell dome
      ctx.fillStyle = shade(coat, -0.3);
      ctx.beginPath(); ctx.arc(hx, hy - rPx * 0.08, rPx * 0.8, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx, hy + rPx * 0.05, rPx * 0.62, rPx * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // face void
      ctx.fillStyle = '#0a0410';
      ctx.beginPath(); ctx.ellipse(hx, hy + rPx * 0.08, rPx * 0.42, rPx * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      // pulsing glow eyes
      const pulse = 1 + Math.sin(camSway * 4 + x * 0.02) * 0.18;
      const glowCol = s.glow || '#ff2e88';
      ctx.fillStyle = glowCol;
      ctx.shadowColor = glowCol; ctx.shadowBlur = rPx * 0.9;
      const eyeDx = rPx * 0.2;
      ctx.beginPath();
      ctx.arc(hx - eyeDx, hy + rPx * 0.02, rPx * 0.09 * pulse, 0, Math.PI * 2);
      ctx.arc(hx + eyeDx, hy + rPx * 0.02, rPx * 0.09 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // civilian hair, styled by variant for crowd variety
      ctx.fillStyle = hair;
      const v = variant % 4;
      if (v === 1) {
        // ponytail
        ctx.beginPath(); ctx.arc(hx, hy - rPx * 0.3, rPx * 0.58, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx - rPx * 0.55, hy + rPx * 0.05, rPx * 0.14, rPx * 0.32, 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (v === 2) {
        // flat cap
        ctx.beginPath(); ctx.ellipse(hx, hy - rPx * 0.4, rPx * 0.62, rPx * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx, hy - rPx * 0.5, rPx * 0.38, rPx * 0.2, 0, Math.PI, 0); ctx.fill();
      } else if (v === 3) {
        // bandana
        ctx.beginPath(); ctx.arc(hx, hy - rPx * 0.28, rPx * 0.58, Math.PI, 0); ctx.fill();
        ctx.fillStyle = shade(hair, 0.45);
        ctx.fillRect(hx - rPx * 0.58, hy - rPx * 0.16, rPx * 1.16, rPx * 0.14);
      } else {
        // short hair
        ctx.beginPath(); ctx.arc(hx, hy - rPx * 0.3, rPx * 0.6, Math.PI, 0); ctx.fill();
      }
      // eyes (dim a touch when facing away from camera)
      ctx.globalAlpha = 0.4 + frontAmt * 0.6;
      ctx.fillStyle = '#1a1218';
      ctx.beginPath();
      ctx.arc(hx - rPx * 0.18, hy + rPx * 0.03, rPx * 0.07, 0, Math.PI * 2);
      ctx.arc(hx + rPx * 0.18, hy + rPx * 0.03, rPx * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // panic tell: a little sweat glint
      if (panic > 0.6) {
        ctx.fillStyle = '#9be7ff'; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(hx + rPx * 0.4, hy - rPx * 0.05, rPx * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // chest badge (sheriff)
    if (s.badge) {
      ctx.save();
      ctx.shadowColor = s.glow || 'rgba(255,213,74,0.6)'; ctx.shadowBlur = rPx * 0.5;
      ctx.fillStyle = '#ffd54a'; drawStar(chestX, -H * 0.55, 5, rPx * 0.4, rPx * 0.18);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(chestX, -H * 0.55, rPx * 0.42, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // holstered blade hint (murderer) — small dagger at the off hip, opposite throwing hand
    if (isHood) {
      ctx.save();
      ctx.translate(-rPx * 0.7, H * 0.08);
      ctx.rotate(-0.5);
      const bladeCol = s.glow || '#ff2e88';
      ctx.fillStyle = bladeCol;
      ctx.shadowColor = bladeCol; ctx.shadowBlur = rPx * 0.5;
      ctx.beginPath();
      ctx.moveTo(rPx * 0.5, 0); ctx.lineTo(-rPx * 0.15, -rPx * 0.12); ctx.lineTo(-rPx * 0.3, 0); ctx.lineTo(-rPx * 0.15, rPx * 0.12);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    ctx.restore();
  }

  // ---- Building variety: per-map neon accent + alt materials, used by drawBuilding ----
  const MAP_ACCENT = {
    'Neon Arena':  '#b14bff',
    'Crate Plaza': '#21e6ff',
    'Void Vault':  '#ff2e88',
    'Sunset Yard': '#ff7a18',
  };
  const BUILDING_ALTS = [
    { face: '#132a3a', edge: 'rgba(33,230,255,0.85)' },  // steel-blue / cyan
    { face: '#2a0f22', edge: 'rgba(255,46,136,0.85)' },  // brick-maroon / pink
    { face: '#132a1c', edge: 'rgba(70,255,140,0.85)' },  // industrial green
    { face: '#2a1a0a', edge: 'rgba(255,213,74,0.85)' },  // rust-amber / gold
  ];
  // Cheap, allocation-free deterministic pseudo-random in [0,1) from a seed + channel
  // index (classic GLSL-style sin hash) — no closures, no Math.random(), no arrays.
  function bhash(seed, i) {
    const v = Math.sin(seed * 12.9898 + i * 78.233 + i * i * 0.0193) * 43758.5453;
    return v - Math.floor(v);
  }

  // 3D building: extruded box with a shaded front/side/top, plus per-building rooftop
  // greebles (antenna / AC unit / water tank / dish), side detailing (pipes / fire
  // escape), an optional ground-floor awning, neon signage, and a lit/unlit window
  // pattern — all driven by `seed`, a stable number derived from the crate's world
  // x/y/w/h so a given building always renders the same way from frame to frame.
  function drawBuilding(gx, gy, ww, hh, lift, faceColor, lineColor, seed) {
    seed = seed || 0;
    const x = gx - ww / 2, y = gy - hh / 2;
    const pxScale = lift / 18; // decorative-pixel scale that tracks world->screen zoom

    const r0 = bhash(seed, 0), r1 = bhash(seed, 1), r2 = bhash(seed, 2), r3 = bhash(seed, 3),
          r4 = bhash(seed, 4), r5 = bhash(seed, 5), r6 = bhash(seed, 6), r7 = bhash(seed, 7),
          r8 = bhash(seed, 8), r9 = bhash(seed, 9), r10 = bhash(seed, 10), r11 = bhash(seed, 11),
          r12 = bhash(seed, 12);

    // ---- material: mostly the caller's (map-tinted) color, sometimes a punchy neon alt ----
    let mFace = faceColor, mEdge = lineColor;
    if (r0 >= 0.42) {
      const alt = BUILDING_ALTS[Math.min(BUILDING_ALTS.length - 1, ((r0 - 0.42) / 0.58 * BUILDING_ALTS.length) | 0)];
      mFace = alt.face; mEdge = alt.edge;
    }
    mFace = shade(mFace, (r4 - 0.5) * 0.18); // subtle per-building tint jitter for texture
    const mTop = shade(mFace, 0.25);
    const mSide = shade(mFace, -0.35);

    // ---- height variety (visual only; collision footprint is the caller's crate rect) ----
    const bLift = lift * (0.8 + r1 * 0.6);
    const dep = bLift * 0.9;

    // ---- front face ----
    ctx.fillStyle = mFace;
    ctx.fillRect(x, y - bLift, ww, hh);

    // ---- side face (right), for depth ----
    ctx.fillStyle = mSide;
    ctx.beginPath();
    ctx.moveTo(x + ww, y - bLift); ctx.lineTo(x + ww + dep * 0.5, y - bLift - dep * 0.5);
    ctx.lineTo(x + ww + dep * 0.5, y + hh - bLift - dep * 0.5); ctx.lineTo(x + ww, y + hh - bLift);
    ctx.closePath(); ctx.fill();

    // ---- side greeble: pipes or a fire-escape, only if there's room ----
    if (dep > 8 * pxScale && hh > 40) {
      if (r5 < 0.28) {
        ctx.strokeStyle = shade(mSide, -0.2); ctx.lineWidth = Math.max(1.2, dep * 0.09);
        const pn = 1 + (r6 > 0.5 ? 1 : 0);
        for (let i = 0; i < pn; i++) {
          const px = x + ww + dep * (0.18 + i * 0.24);
          ctx.beginPath();
          ctx.moveTo(px, y - bLift - dep * 0.35); ctx.lineTo(px, y + hh - bLift - dep * 0.3);
          ctx.stroke();
        }
      } else if (r5 < 0.5 && hh > 60) {
        ctx.strokeStyle = 'rgba(8,5,12,0.6)'; ctx.lineWidth = Math.max(1, dep * 0.05);
        for (let i = 0; i < 3; i++) {
          const py = y - bLift + hh * (0.18 + i * 0.26 + r6 * 0.04);
          ctx.beginPath();
          ctx.moveTo(x + ww, py); ctx.lineTo(x + ww + dep * 0.4, py - dep * 0.16);
          ctx.stroke();
        }
      }
    }

    // ---- top face (roof); flat, or a stepped second tier for a skyline silhouette ----
    ctx.fillStyle = mTop;
    ctx.beginPath();
    ctx.moveTo(x, y - bLift); ctx.lineTo(x + dep * 0.5, y - bLift - dep * 0.5);
    ctx.lineTo(x + ww + dep * 0.5, y - bLift - dep * 0.5); ctx.lineTo(x + ww, y - bLift);
    ctx.closePath(); ctx.fill();

    const stepped = r2 > 0.55 && ww > 46 && hh > 46;
    if (stepped) {
      const tw = ww * (0.4 + r3 * 0.2), tLift = (10 + r3 * 12) * pxScale, tDep = tLift * 0.9;
      const tx = x + (ww - tw) * (0.3 + r6 * 0.4);
      const ty = y - bLift - dep * 0.22;
      ctx.fillStyle = shade(mFace, -0.05);
      ctx.fillRect(tx, ty - tLift, tw, tLift);
      ctx.fillStyle = mSide;
      ctx.beginPath();
      ctx.moveTo(tx + tw, ty - tLift); ctx.lineTo(tx + tw + tDep * 0.5, ty - tLift - tDep * 0.5);
      ctx.lineTo(tx + tw + tDep * 0.5, ty - tDep * 0.5); ctx.lineTo(tx + tw, ty);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(mTop, 0.08);
      ctx.beginPath();
      ctx.moveTo(tx, ty - tLift); ctx.lineTo(tx + tDep * 0.5, ty - tLift - tDep * 0.5);
      ctx.lineTo(tx + tw + tDep * 0.5, ty - tLift - tDep * 0.5); ctx.lineTo(tx + tw, ty - tLift);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = mEdge; ctx.lineWidth = 1.3;
      ctx.strokeRect(tx, ty - tLift, tw, tLift);
    }

    // ---- roof prop: antenna / AC unit / water tank / dish (skip on tiny buildings) ----
    const roofY = y - bLift - dep * (stepped ? 0.5 : 0.22) - (stepped ? (10 + r3 * 12) * pxScale : 0);
    const roofX = x + ww * (0.28 + r8 * 0.44);
    if (r7 < 0.2 && ww > 30) {
      // antenna with a slowly blinking tip light
      const h1 = (16 + r0 * 10) * pxScale;
      ctx.strokeStyle = 'rgba(200,200,210,0.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(roofX, roofY); ctx.lineTo(roofX, roofY - h1); ctx.stroke();
      const blink = Math.sin(camSway * 3 + seed) > 0.3;
      ctx.fillStyle = blink ? '#ff3b5c' : 'rgba(255,59,92,0.25)';
      ctx.beginPath(); ctx.arc(roofX, roofY - h1, 2.2 * pxScale, 0, Math.PI * 2); ctx.fill();
    } else if (r7 < 0.4 && ww > 40 && hh > 30) {
      // AC / vent unit
      const uw = (12 + r0 * 8) * pxScale, uh = (8 + r1 * 5) * pxScale;
      ctx.fillStyle = '#33323e'; ctx.fillRect(roofX - uw / 2, roofY - uh, uw, uh);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { const gy2 = roofY - uh + (uh / 3) * i; ctx.beginPath(); ctx.moveTo(roofX - uw / 2 + 2, gy2); ctx.lineTo(roofX + uw / 2 - 2, gy2); ctx.stroke(); }
    } else if (r7 < 0.55 && ww > 50 && hh > 40) {
      // rooftop water tank
      const tR = (9 + r0 * 5) * pxScale, tH = (12 + r1 * 6) * pxScale;
      ctx.fillStyle = '#4a3626'; ctx.fillRect(roofX - tR, roofY - tH, tR * 2, tH);
      ctx.beginPath(); ctx.ellipse(roofX, roofY - tH, tR, tR * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(roofX - tR, roofY); ctx.lineTo(roofX - tR - 4 * pxScale, roofY + 7 * pxScale);
      ctx.moveTo(roofX + tR, roofY); ctx.lineTo(roofX + tR + 4 * pxScale, roofY + 7 * pxScale);
      ctx.stroke();
    } else if (r7 < 0.7 && ww > 36) {
      // satellite dish
      ctx.fillStyle = '#cfd6dc';
      ctx.beginPath(); ctx.ellipse(roofX, roofY - 4 * pxScale, 7 * pxScale, 5 * pxScale, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a929a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(roofX, roofY - 4 * pxScale); ctx.lineTo(roofX, roofY + 4 * pxScale); ctx.stroke();
    }
    // (else: bare flat roof — not every building needs a prop)

    // ---- ground-floor awning (storefront canopy) ----
    if (r9 < 0.3 && ww > 50) {
      const awY = y - bLift + hh * (0.62 + r10 * 0.15);
      const awW = ww * (0.5 + r10 * 0.3);
      const awX = x + (ww - awW) * (0.2 + r6 * 0.4);
      const awH = 9 * pxScale;
      ctx.fillStyle = mEdge; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(awX, awY); ctx.lineTo(awX + awW, awY);
      ctx.lineTo(awX + awW - 5 * pxScale, awY + awH); ctx.lineTo(awX + 5 * pxScale, awY + awH);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- windows: grid with a lived-in lit/unlit pattern, stable per building ----
    const cols = Math.max(1, Math.floor(ww / 26)), rows = Math.max(1, Math.floor(hh / 30));
    const cw = (ww - 16) / cols, ch = (hh - 16) / rows;
    let ci = 0;
    for (let wx0 = 0; wx0 < cols; wx0++) {
      for (let wy0 = 0; wy0 < rows; wy0++) {
        const wx = x + 8 + wx0 * cw, wy = y - bLift + 8 + wy0 * ch;
        const wRoll = bhash(seed, 20 + ci); ci++;
        if (wRoll > 0.94) ctx.fillStyle = mEdge;                          // rare accent window
        else if (wRoll > 0.55) ctx.fillStyle = 'rgba(255,224,140,0.55)';  // warm lit window
        else ctx.fillStyle = 'rgba(20,26,40,0.55)';                       // dark unlit window
        ctx.fillRect(wx, wy, cw - 6, ch - 6);
      }
    }

    // ---- neon signage bar on the front face ----
    if (r11 < 0.4 && ww > 44) {
      const signY = y - bLift + hh * (0.16 + r12 * 0.18);
      const signW = ww * (0.4 + r12 * 0.3);
      const signX = x + (ww - signW) / 2;
      ctx.save();
      ctx.shadowColor = mEdge; ctx.shadowBlur = 10 * pxScale;
      ctx.fillStyle = mEdge; ctx.globalAlpha = 0.8 + Math.sin(camSway * 2 + seed) * 0.15;
      ctx.fillRect(signX, signY, signW, 6 * pxScale);
      ctx.restore();
    }

    // ---- outline ----
    ctx.strokeStyle = mEdge; ctx.lineWidth = 2;
    ctx.strokeRect(x, y - bLift, ww, hh);
    ctx.beginPath();
    ctx.moveTo(x, y - bLift); ctx.lineTo(x + dep * 0.5, y - bLift - dep * 0.5);
    ctx.lineTo(x + ww + dep * 0.5, y - bLift - dep * 0.5); ctx.lineTo(x + ww, y - bLift);
    ctx.stroke();
  }
  // darken/lighten a hex color by amt (-1..1)
  function shade(hex, amt) {
    const c = hex.replace('#',''); const n = parseInt(c.length===3 ? c.split('').map(x=>x+x).join(''):c, 16);
    let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    r=clamp(Math.round(r+(amt<0?r:255-r)*amt),0,255); g=clamp(Math.round(g+(amt<0?g:255-g)*amt),0,255); b=clamp(Math.round(b+(amt<0?b:255-b)*amt),0,255);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- HUD ----------
  function updateHUD(remainingOverride) {
    const remaining = remainingOverride != null ? remainingOverride : innocents.filter(i => i.alive).length;
    $('hudInnocents').textContent = remaining;
    const lvl = $('hudLevel'); if (lvl) lvl.textContent = 'LVL ' + diff.level;
    const extra = $('hudExtra');
    if (currentMode === 'sheriff') {
      // count of murderers still alive
      const mAlive = (murderer && murderer.alive) ? 1 : 0;
      extra.textContent = '🔪 Murderer: ' + mAlive;
    } else {
      extra.textContent = '';
    }
    $('hudCoins').textContent = save.coins;
    const timer = $('hudTimer');
    timer.textContent = Math.max(0, roundTime).toFixed(1);
    timer.classList.toggle('warn', roundTime <= 8);
    const cd = $('hudCool');
    if (!player.alive) { cd.textContent = '☠ DOWN'; }
    else if (knifeCooldown > 0) { cd.textContent = '🔪 ' + (knifeCooldown/COOLDOWN_MAX * 100).toFixed(0) + '%'; }
    else { cd.textContent = '🔪 READY'; }
  }

  // ---------- Loop ----------
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    const dt = lastTs ? (ts - lastTs) : 16; lastTs = ts;
    // start-banner auto-dismiss (tap/click also skips it — see banner listener)
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) { bannerTimer = 0; const b = $('roundBanner'); if (b) b.classList.add('hidden'); }
    }
    update();
    render();
  }

  // ---------- Round end ----------
  let roundsWonThisSession = 0;
  function endRound(won, reason) {
    if (!roundActive) return;
    roundActive = false;
    const overlay = $('resultOverlay');
    const title = $('resultTitle');
    const sub = $('resultSub');
    const rc = $('resultCoins');
    let earned = coinsThisRound;
    if (won) {
      const bonus = 40 + Math.min(80, save.wins * 5);
      earned += bonus;
      save.coins += bonus;
      save.wins += 1;
      title.textContent = 'VICTORY';
      title.style.color = 'var(--neon-green)';
      title.style.textShadow = '0 0 18px var(--neon-green)';
      sub.textContent = currentMode === 'sheriff'
        ? `Murderer caught! Innocents safe. Win bonus +${bonus}.`
        : `All innocents silenced. Win bonus +${bonus}.`;
      if (killsThisRound > save.best) save.best = killsThisRound;
      SFX.win();
      spawnParticles(player.x, player.y, '#46ff8c', 40, 5);
    } else {
      title.textContent = 'CAUGHT';
      title.style.color = 'var(--neon-pink)';
      title.style.textShadow = '0 0 18px var(--neon-pink)';
      sub.textContent = reason || 'The Sheriff ended your reign.';
      SFX.lose();
    }
    rc.textContent = earned;
    persist();
    refreshMenuStats();
    setTimeout(() => overlay.classList.remove('hidden'), 900);
  }

  // ---------- Pause / Mute ----------
  function togglePause() {
    if (!screens.game.classList.contains('active')) return;
    if (!roundActive) return;
    paused = !paused;
    $('pauseOverlay').classList.toggle('hidden', !paused);
  }
  function toggleMute() {
    save.muted = !save.muted; persist();
    $('btnMute').textContent = save.muted ? '🔇' : '🔊';
  }

  // ---------- Shop / Maps UI ----------
  function buildShop() {
    const grid = $('shopGrid'); grid.innerHTML = '';
    $('shopCoinCount').textContent = save.coins;
    for (const id in KNIVES) {
      const k = KNIVES[id];
      const owned = save.ownedKnives.includes(id);
      const equipped = save.equippedKnife === id;
      const card = document.createElement('div');
      card.className = 'card' + (equipped ? ' selected' : '') + (owned ? '' : ' locked');
      card.innerHTML = `
        <div class="card-name" style="color:${k.color}">${k.name}</div>
        <div class="card-desc">${k.desc}</div>
        <div class="card-swatch" style="background:linear-gradient(135deg, ${k.color}, ${k.trail})"><div class="knife-mini" style="background:${k.color};box-shadow:0 0 14px ${k.trail}"></div></div>
        ${owned
          ? `<div class="owned">${equipped ? '✓ EQUIPPED' : 'OWNED'}</div><button class="btn card-btn" data-eq-knife="${id}">${equipped ? 'Equipped' : 'Equip'}</button>`
          : `<div class="price">🪙 ${k.price}</div><button class="btn btn-primary card-btn" data-buy-knife="${id}">Buy</button>`}
      `;
      grid.appendChild(card);
    }
    grid.querySelectorAll('[data-buy-knife]').forEach(b => b.onclick = () => buyKnife(b.dataset.buyKnife));
    grid.querySelectorAll('[data-eq-knife]').forEach(b => b.onclick = () => equipKnife(b.dataset.eqKnife));
  }
  function buyKnife(id) {
    const k = KNIVES[id];
    if (save.ownedKnives.includes(id)) return;
    if (save.coins < k.price) { flashNo(); return; }
    save.coins -= k.price; save.ownedKnives.push(id); save.equippedKnife = id;
    persist(); SFX.coin(); buildShop(); refreshMenuStats();
  }
  function equipKnife(id) {
    if (!save.ownedKnives.includes(id)) return;
    save.equippedKnife = id; persist(); buildShop();
  }

  function buildMaps() {
    const grid = $('mapsGrid'); grid.innerHTML = '';
    $('mapsCoinCount').textContent = save.coins;
    for (const id in MAPS) {
      const m = MAPS[id];
      const owned = save.ownedMaps.includes(id);
      const equipped = save.equippedMap === id;
      const card = document.createElement('div');
      card.className = 'card' + (equipped ? ' selected' : '') + (owned ? '' : ' locked');
      card.innerHTML = `
        <div class="card-name">${m.name}</div>
        <div class="card-desc">${m.desc}</div>
        <div class="card-swatch" style="background:${m.bg}"></div>
        ${owned
          ? `<div class="owned">${equipped ? '✓ SELECTED' : 'OWNED'}</div><button class="btn card-btn" data-eq-map="${id}">${equipped ? 'Selected' : 'Select'}</button>`
          : `<div class="price">🪙 ${m.price}</div><button class="btn btn-primary card-btn" data-buy-map="${id}">Buy</button>`}
      `;
      grid.appendChild(card);
    }
    grid.querySelectorAll('[data-buy-map]').forEach(b => b.onclick = () => buyMap(b.dataset.buyMap));
    grid.querySelectorAll('[data-eq-map]').forEach(b => b.onclick = () => equipMap(b.dataset.eqMap));
  }
  function buyMap(id) {
    const m = MAPS[id];
    if (save.ownedMaps.includes(id)) return;
    if (save.coins < m.price) { flashNo(); return; }
    save.coins -= m.price; save.ownedMaps.push(id); save.equippedMap = id;
    persist(); SFX.coin(); buildMaps(); refreshMenuStats();
  }
  function equipMap(id) {
    if (!save.ownedMaps.includes(id)) return;
    save.equippedMap = id; persist(); buildMaps();
  }
  function flashNo() {
    // quick red flash on coin counter (no external lib)
    const el = screens.shop.classList.contains('active') ? $('shopCoinCount') : $('mapsCoinCount');
    el.parentElement.style.transition = 'none'; el.parentElement.style.boxShadow = '0 0 18px #ff3b3b';
    setTimeout(() => { el.parentElement.style.transition = 'box-shadow .4s'; el.parentElement.style.boxShadow = ''; }, 60);
  }

  function refreshMenuStats() {
    $('menuCoinCount').textContent = save.coins;
    $('menuWins').textContent = save.wins;
    $('menuBest').textContent = save.best;
  }

  // ---------- Easter eggs ----------
  function rainbowColor() {
    const h = (performance.now ? performance.now() : Date.now()) / 12 % 360;
    return `hsl(${h.toFixed(0)},100%,60%)`;
  }
  function eggToast(msg) {
    const el = $('eggToast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }
  function triggerRainbow() {
    rainbowKnife = true;
    eggToast('🌈 RAINBOW KNIFE UNLOCKED! (type "nutella" too?)');
    SFX.win();
  }
  function triggerNutella() {
    if (!save.ownedKnives.includes('gold')) {
      save.ownedKnives.push('gold'); save.equippedKnife = 'gold';
    } else { save.equippedKnife = 'gold'; }
    persist(); refreshMenuStats();
    eggToast('🍫 NUTELLA MODE! Golden knife equipped 💜');
    SFX.coin();
  }
  function triggerDisco() {
    discoMode = !discoMode;
    eggToast(discoMode ? '🪩 DISCO MODE ON!' : '🪩 Disco off.');
    if (discoMode) { for (let i=0;i<30;i++) setTimeout(()=>SFX.coin(), i*40); }
  }
  function logoConfetti() {
    const logo = $('logo');
    if (!logo) return;
    const rect = logo.getBoundingClientRect();
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('div');
      c.style.cssText = `position:fixed;left:${rect.left + rect.width/2}px;top:${rect.top + rect.height/2}px;width:8px;height:8px;border-radius:2px;background:hsl(${(i*37)%360},100%,60%);z-index:99;pointer-events:none;transition:transform .9s ease-out, opacity .9s;`;
      document.body.appendChild(c);
      requestAnimationFrame(() => {
        const ang = Math.random()*Math.PI*2, d = 80 + Math.random()*180;
        c.style.transform = `translate(${Math.cos(ang)*d}px, ${Math.sin(ang)*d + 80}px) rotate(${Math.random()*720}deg)`;
        c.style.opacity = '0';
      });
      setTimeout(() => c.remove(), 950);
    }
    SFX.win();
  }

  // ---------- Wire up buttons ----------
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.onclick = () => {
      currentMode = b.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x === b));
      const tag = $('menuTagline');
      if (currentMode === 'sheriff') tag.textContent = 'You are the Sheriff. Find and shoot the Murderer. Protect the innocents!';
      else tag.textContent = 'You are the Murderer. Silence the innocents. Dodge the Sheriff.';
    };
  });
  $('btnPlay').onclick = () => { show('game'); ac(); startRound(); };
  $('btnShop').onclick = () => { buildShop(); show('shop'); };
  $('btnMaps').onclick = () => { buildMaps(); show('maps'); };
  $('btnHow').onclick = () => { show('how'); };
  $('btnShopBack').onclick = () => { refreshMenuStats(); show('menu'); };
  $('btnMapsBack').onclick = () => { refreshMenuStats(); show('menu'); };
  $('btnHowBack').onclick = () => show('menu');
  $('btnMute').onclick = toggleMute;
  $('btnPause').onclick = togglePause;
  $('btnResume').onclick = togglePause;
  $('btnQuit').onclick = () => { roundActive = false; paused = false; $('pauseOverlay').classList.add('hidden'); refreshMenuStats(); show('menu'); };
  $('btnAgain').onclick = () => { $('resultOverlay').classList.add('hidden'); startRound(); };
  $('btnMenu').onclick = () => { $('resultOverlay').classList.add('hidden'); refreshMenuStats(); show('menu'); };
  $('logo').onclick = logoConfetti;

  // ---------- Init ----------
  resize();
  refreshMenuStats();
  $('btnMute').textContent = save.muted ? '🔇' : '🔊';
  show('menu');
  rafId = requestAnimationFrame(loop);

})();
