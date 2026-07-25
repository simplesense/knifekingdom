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
  function beep(freq, dur, type = 'sine', vol = 0.18, slideTo = null) {
    if (save.muted) return;
    const a = ac(); if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }
  const SFX = {
    throw:  () => beep(620, 0.12, 'triangle', 0.15, 220),
    hit:    () => { beep(180, 0.18, 'sawtooth', 0.22, 60); beep(900, 0.08, 'square', 0.1); },
    coin:   () => beep(1320, 0.1, 'square', 0.12, 1760),
    death:  () => beep(140, 0.5, 'sawtooth', 0.25, 40),
    win:    () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'square', 0.18), i * 110)); },
    lose:   () => { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sawtooth', 0.2), i * 130)); },
    alarm:  () => beep(880, 0.18, 'square', 0.2, 1320),
  };

  // ---------- Game State ----------
  const VIEW = { w: 0, h: 0 };          // canvas pixel size
  const WORLD = { w: 1280, h: 720 };    // logical world size
  const player = { x: 0, y: 0, r: 16, speed: 4.2, alive: true, aim: 0 };
  let innocents = [];
  let sheriff = null;
  let knives = [];           // thrown knives (player + sheriff bullets abstracted)
  let particles = [];
  let floaters = [];         // floating +coin text
  let crates = [];
  let roundTime = 30;
  let roundActive = false;
  let paused = false;
  let coinsThisRound = 0;
  let killsThisRound = 0;
  let knifeCooldown = 0;
  const COOLDOWN_MAX = 26;   // frames-ish
  let shake = 0;
  let lastTs = 0;
  let rafId = null;
  let mapCfg = MAPS.arena;

  // ---------- Input ----------
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'p' && screens.game.classList.contains('active')) togglePause();
    if (k === 'm') toggleMute();
    if (k === ' ') { e.preventDefault(); if (roundActive && !paused) throwKnife(); }
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
  // touch
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0]; const rect = canvas.getBoundingClientRect();
    mouse.x = (t.clientX - rect.left) / rect.width * VIEW.w;
    mouse.y = (t.clientY - rect.top) / rect.height * VIEW.h;
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0]; const rect = canvas.getBoundingClientRect();
    mouse.x = (t.clientX - rect.left) / rect.width * VIEW.w;
    mouse.y = (t.clientY - rect.top) / rect.height * VIEW.h;
    if (roundActive && !paused) throwKnife();
  }, { passive: false });

  // ---------- Sizing ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    VIEW.w = window.innerWidth;
    VIEW.h = window.innerHeight;
    canvas.width = VIEW.w * dpr;
    canvas.height = VIEW.h * dpr;
    canvas.style.width = VIEW.w + 'px';
    canvas.style.height = VIEW.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  // world->screen transform keeps world centered + scaled to fit
  function worldTransform() {
    const scale = Math.min(VIEW.w / WORLD.w, VIEW.h / WORLD.h);
    const ox = (VIEW.w - WORLD.w * scale) / 2;
    const oy = (VIEW.h - WORLD.h * scale) / 2;
    return { scale, ox, oy };
  }
  function toScreen(wx, wy) {
    const t = worldTransform();
    return { x: wx * t.scale + t.ox, y: wy * t.scale + t.oy };
  }
  function screenToWorld(sx, sy) {
    const t = worldTransform();
    return { x: (sx - t.ox) / t.scale, y: (sy - t.oy) / t.scale };
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
    mapCfg = MAPS[save.equippedMap] || MAPS.arena;
    roundsWonThisSession = save.wins; // not used
    player.x = WORLD.w / 2; player.y = WORLD.h / 2; player.alive = true; player.aim = 0;
    knives = []; particles = []; floaters = [];
    roundTime = 30; coinsThisRound = 0; killsThisRound = 0; knifeCooldown = 0; shake = 0;
    buildCrates(mapCfg.crates);

    // innocents + 1 sheriff
    const count = 7 + Math.min(6, Math.floor(save.wins / 2)); // scales difficulty
    const pts = spawnPositions(count + 1);
    innocents = [];
    for (let i = 0; i < count; i++) {
      innocents.push({
        x: pts[i].x, y: pts[i].y, r: 14, alive: true,
        vx: 0, vy: 0, panic: 0, wander: rand(0, Math.PI * 2), wt: rand(40, 110),
      });
    }
    const sp = pts[count];
    sheriff = { x: sp.x, y: sp.y, r: 16, alive: true, dir: rand(0, Math.PI*2), turn: rand(30,90), alert: 0, shootCd: 0 };

    roundActive = true; paused = false;
    $('roundBanner').classList.remove('hidden');
    setTimeout(() => $('roundBanner').classList.add('hidden'), 1700);
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

  // ---------- Update ----------
  function update() {
    if (!roundActive || paused) return;

    // --- player movement ---
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (dx || dy) { const m = Math.hypot(dx, dy); dx /= m; dy /= m; }
    const nx = clamp(player.x + dx * player.speed, 20, WORLD.w - 20);
    const ny = clamp(player.y + dy * player.speed, 20, WORLD.h - 20);
    if (!hitsCrate(nx, player.y, player.r)) player.x = nx;
    if (!hitsCrate(player.x, ny, player.r)) player.y = ny;
    // aim
    const w = screenToWorld(mouse.x, mouse.y);
    player.aim = angleTo(player, w);

    if (knifeCooldown > 0) knifeCooldown--;

    // --- innocents AI: wander, flee from sheriff sight, avoid crates ---
    for (const inn of innocents) {
      if (!inn.alive) continue;
      // flee if sheriff near & looking
      const ds = dist(inn, sheriff);
      let targetAng = inn.wander;
      if (ds < 220 && sheriff.alert > 0.3) {
        inn.panic = 1;
        targetAng = angleTo(sheriff, inn); // run away
      } else { inn.panic = Math.max(0, inn.panic - 0.02); }
      inn.wt--;
      if (inn.wt <= 0) { inn.wander = rand(0, Math.PI*2); inn.wt = rand(40, 110); }
      const sp = inn.panic > 0.5 ? 2.6 : 1.5;
      let mvx = Math.cos(targetAng) * sp, mvy = Math.sin(targetAng) * sp;
      const ix = clamp(inn.x + mvx, 16, WORLD.w - 16);
      const iy = clamp(inn.y + mvy, 16, WORLD.h - 16);
      if (!hitsCrate(ix, inn.y, inn.r)) inn.x = ix;
      if (!hitsCrate(inn.x, iy, inn.r)) inn.y = iy;
    }

    // --- sheriff AI: patrol, scan, detect player in cone, shoot ---
    sheriff.turn--;
    if (sheriff.turn <= 0) { sheriff.dir += rand(-1.2, 1.2); sheriff.turn = rand(40, 110); }
    // drift slowly forward
    const sx = clamp(sheriff.x + Math.cos(sheriff.dir) * 1.4, 20, WORLD.w - 20);
    const sy = clamp(sheriff.y + Math.sin(sheriff.dir) * 1.4, 20, WORLD.h - 20);
    if (!hitsCrate(sx, sheriff.y, sheriff.r)) sheriff.x = sx;
    if (!hitsCrate(sheriff.x, sy, sheriff.r)) sheriff.y = sy;
    // detection
    const dToPlayer = dist(sheriff, player);
    const angToP = angleTo(sheriff, player);
    let diff = Math.abs(((angToP - sheriff.dir + Math.PI*3) % (Math.PI*2)) - Math.PI);
    const inCone = dToPlayer < 360 && diff < 0.5 && !lineBlocked(sheriff.x, sheriff.y, player.x, player.y);
    if (inCone) {
      sheriff.alert = Math.min(1, sheriff.alert + 0.06);
      sheriff.dir = angToP; // lock on
      if (sheriff.shootCd <= 0 && dToPlayer < 460) {
        // fire! (abstract as instant hit check next frames; we give 0.4s before kill)
        sheriff.shootCd = 24;
        spawnParticles(player.x, player.y, '#ffd54a', 14, 3);
        SFX.alarm();
        shake = 14;
        setTimeout(() => {
          if (roundActive && !paused && sheriff.alert > 0.6 && dist(sheriff, player) < 470 && !lineBlocked(sheriff.x, sheriff.y, player.x, player.y) && player.alive) {
            player.alive = false; endRound(false, 'The Sheriff caught your glow.');
          }
        }, 380);
      }
    } else {
      sheriff.alert = Math.max(0, sheriff.alert - 0.02);
    }
    if (sheriff.shootCd > 0) sheriff.shootCd--;

    // --- knives ---
    for (let i = knives.length - 1; i >= 0; i--) {
      const k = knives[i];
      k.x += k.vx; k.y += k.vy; k.life--;
      // trail particles
      if (Math.random() < 0.5) spawnParticles(k.x, k.y, k.trail, 1, 0.4);
      let dead = k.life <= 0;
      if (k.x < -20 || k.x > WORLD.w + 20 || k.y < -20 || k.y > WORLD.h + 20) dead = true;
      // hit crates
      if (!dead) for (const c of crates) if (circleRectHit(k.x, k.y, k.r, c.x, c.y, c.w, c.h)) { spawnParticles(k.x, k.y, k.trail, 6, 2); dead = true; break; }
      // hit innocents (player knives)
      if (!dead && k.from === 'player') {
        for (const inn of innocents) {
          if (inn.alive && dist(k, inn) < inn.r + k.r) {
            inn.alive = false;
            spawnParticles(inn.x, inn.y, '#ff2e88', 22, 4);
            SFX.hit(); shake = Math.max(shake, 8);
            // coins
            const reward = 5;
            coinsThisRound += reward; save.coins += reward; killsThisRound++;
            floatText(inn.x, inn.y - 10, '+' + reward, '#ffd54a');
            SFX.coin();
            dead = true; break;
          }
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
    if (remaining === 0) { endRound(true); }
    else if (roundTime <= 0) { endRound(false, 'Time ran out. The innocents survived.'); }
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

    const S = (wx, wy) => ({ x: wx * t.scale + t.ox, y: wy * t.scale + t.oy });
    const sc = t.scale;

    // sheriff vision cone
    if (sheriff) {
      const a = S(sheriff.x, sheriff.y);
      const coneLen = 360 * sc, half = 0.5;
      ctx.save();
      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, coneLen);
      grad.addColorStop(0, sheriff.alert > 0.5 ? 'rgba(255,80,80,0.34)' : 'rgba(255,213,74,0.20)');
      grad.addColorStop(1, 'rgba(255,213,74,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.arc(a.x, a.y, coneLen, sheriff.dir - half, sheriff.dir + half);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // crates
    for (const c of crates) {
      const p = S(c.x, c.y);
      ctx.fillStyle = 'rgba(60,30,90,0.9)';
      ctx.strokeStyle = 'rgba(177,75,255,0.7)';
      ctx.lineWidth = 2;
      const ww = c.w * sc, hh = c.h * sc;
      ctx.fillRect(p.x, p.y, ww, hh);
      ctx.strokeRect(p.x, p.y, ww, hh);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x+ww, p.y+hh);
      ctx.moveTo(p.x+ww, p.y); ctx.lineTo(p.x, p.y+hh); ctx.stroke();
    }

    // innocents
    for (const inn of innocents) {
      if (!inn.alive) continue;
      const p = S(inn.x, inn.y);
      ctx.fillStyle = '#8be0ff';
      ctx.strokeStyle = '#21e6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, inn.r * sc, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // little head dot
      ctx.fillStyle = '#cbf6ff';
      ctx.beginPath(); ctx.arc(p.x, p.y - inn.r*sc*0.4, inn.r*sc*0.35, 0, Math.PI*2); ctx.fill();
    }

    // sheriff
    if (sheriff) {
      const p = S(sheriff.x, sheriff.y);
      ctx.fillStyle = '#ffd54a';
      ctx.strokeStyle = '#fff0a8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, sheriff.r * sc, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // star
      ctx.fillStyle = '#3a2a00'; drawStar(p.x, p.y, 5, sheriff.r*sc*0.6, sheriff.r*sc*0.28);
      if (sheriff.alert > 0.5) {
        ctx.fillStyle = '#ff3b3b'; ctx.font = `${Math.round(16*sc*1.4)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('!', p.x, p.y - sheriff.r*sc - 6);
      }
    }

    // knives
    for (const k of knives) {
      const p = S(k.x, k.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(k.vy, k.vx));
      ctx.shadowColor = k.trail; ctx.shadowBlur = 12 * sc;
      ctx.fillStyle = k.color;
      const L = 18 * sc, Wd = 6 * sc;
      ctx.beginPath();
      ctx.moveTo(L*0.7, 0); ctx.lineTo(-L*0.3, -Wd/2); ctx.lineTo(-L*0.5, 0); ctx.lineTo(-L*0.3, Wd/2); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // player (murderer) — only if alive
    if (player.alive) {
      const p = S(player.x, player.y);
      const k = KNIVES[save.equippedKnife] || KNIVES.crimson;
      // glow
      ctx.shadowColor = k.trail; ctx.shadowBlur = 18 * sc;
      ctx.fillStyle = '#1a1024';
      ctx.strokeStyle = k.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, player.r * sc, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // knife in hand pointing at aim
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(player.aim);
      ctx.fillStyle = k.color; ctx.shadowColor = k.trail; ctx.shadowBlur = 10*sc;
      ctx.beginPath(); ctx.moveTo(player.r*sc*0.9, 0); ctx.lineTo(player.r*sc*0.2, -3*sc); ctx.lineTo(player.r*sc*0.2, 3*sc); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // particles
    for (const pt of particles) {
      const p = S(pt.x, pt.y);
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, pt.size * sc, 0, Math.PI*2); ctx.fill();
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

  // ---------- HUD ----------
  function updateHUD(remainingOverride) {
    const remaining = remainingOverride != null ? remainingOverride : innocents.filter(i => i.alive).length;
    $('hudInnocents').textContent = remaining;
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
      sub.textContent = `All innocents silenced. Win bonus +${bonus}.`;
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

  // ---------- Wire up buttons ----------
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

  // ---------- Init ----------
  resize();
  refreshMenuStats();
  $('btnMute').textContent = save.muted ? '🔇' : '🔊';
  show('menu');
  rafId = requestAnimationFrame(loop);

})();
