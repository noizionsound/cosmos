// ─────────────────────────────────────────────────────────────────────────────
//  WorldOne — Desert / Kalevala
//  Весь игровой код первого мира. Рендеринг, физика, аудио — всё здесь.
//  Добавить новый мир = скопировать файл, сменить config + методы draw.
// ─────────────────────────────────────────────────────────────────────────────

import { WorldBase } from './WorldBase.js';

// ─── Auto-discovery: read fires manifest synchronously ───────────────────────
//  fetch() is async — by the time config is read (synchronous loadWorld call),
//  the promise hasn't resolved yet and only the fallback file would be used.
//  XHR with async=false reads the file before any code accesses _firesFiles.
const _FIRES_FALLBACK = ['./sources/audio/fires/fire_1_lullaby.opus'];
const _firesFiles = (() => {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', './sources/audio/fires/manifest.json', false); // sync
    xhr.send(null);
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      if (Array.isArray(data) && data.length) {
        console.log(`[COSMOS] fires manifest — ${data.length} file(s)`);
        return data;
      }
    }
  } catch (e) { /* manifest missing or malformed */ }
  console.log('[COSMOS] fires manifest not found — using fallback');
  return _FIRES_FALLBACK;
})();

// ─── Lore texts (shown near rune marks) ──────────────────────────────────────
const LORE_TEXTS = [
  'the stone remembers',
  '43°12′N · field recording · basalt wind',
  'kalevala · runo IV',
  'where the world was first divided',
  'ᚠ · beginning · ᚢ · water · ᚦ · force',
  'sound travels further at night',
  'the echo has no origin',
  'rune: the path of water under stone',
  'origin myth · cycle III',
  'ᛟ · inheritance · home · property',
  'the instrument was the stone itself',
  'fragment · uncatalogued · 2024',
  'north · 280m · limestone outcrop',
  'ᚺ · hail · disruption · change',
  'the recording was lost in transit',
  'measure the silence between strikes',
  '60°N · midsummer · no shadow',
  'seismic event · depth 4.2 km · no felt report',
  'the body is a field recorder',
  'ᛁ · ice · stillness · the held breath',
  'P-wave arrives first · S-wave carries the memory',
  'anthropology of listening · unfinished',
  'bedrock contact at 38 metres · granite',
];

// ─── Sphere palettes — stone biome, no gold ──────────────────────────────────
const BUBBLE_PALETTES = [
  // I — desert sandstone / ochre terrain
  { b0:'88,70,50',  b1:'40,30,18',  b2:'12,8,4',
    df:'195,188,175', dm:'112,106,96',
    rng:'185,172,155', inn:'110,100,85',
    halo:'118,108,92', num_n:'222,215,205', num_f:'148,138,122' },
  // II — kalevala slate / cold mist
  { b0:'50,66,78',  b1:'24,34,46',  b2:'7,11,18',
    df:'182,192,205', dm:'105,115,128',
    rng:'168,182,198', inn:'100,115,135',
    halo:'98,115,135', num_n:'208,218,228', num_f:'128,145,162' },
  // III — ritual moss / lichen stone
  { b0:'44,62,44',  b1:'20,34,20',  b2:'6,12,6',
    df:'182,196,178', dm:'106,122,102',
    rng:'158,178,152', inn:'95,118,90',
    halo:'92,122,88',  num_n:'210,222,205', num_f:'132,155,125' },
];

export class WorldOne extends WorldBase {

  // ─── Config ────────────────────────────────────────────────────────────────
  get config() {
    return {
      width:         4200,
      height:        3000,
      ambient:       './sources/audio/ambient/first_level_loop_1.ogg',
      groundTexture: './sources/photo/stone_texture.jpg',

      bubbles: [
        { id: 1, name: 'echo_of_desert',   wx: 300,  wy: 300,  r: 72, num: 'I',   ph: 0.0,
          // desert_pre: dry direct approach sound — no spatial processing
          approach:      './sources/audio/bubbles/desert_pre.opus',
          inside:        './sources/video/desert.mp4',
          insideType:    'video',
          interiorVideo: './sources/video/desert.mp4',
          interiorMode:  'fullscreen',
          // ghost: plays quietly after first visit — loop at low level
          ghost:         './sources/audio/bubbles/ghost_desert_1.opus' },
        { id: 2, name: 'echo_of_kalevala', wx: 3900, wy: 300,  r: 72, num: 'II',  ph: 2.09,
          // kalevala_pre: direct approach — no room reverb (same as desert)
          approach:      './sources/audio/bubbles/kalevala_pre.opus',
          inside:        './sources/audio/bubbles/kalevala_bouble_2.opus',
          insideType:    'audio',
          interiorVideo: './sources/video/kalevala_texture.mp4',
          interiorMode:  'floor',
          // ghost: lingers after first visit
          ghost:         './sources/audio/bubbles/kalevala_ghost_2.opus' },
        { id: 3, name: 'digital_echo', wx: 2100, wy: 2700, r: 72, num: 'III', ph: 4.19,
          approach:      './sources/audio/bubbles/delay_pre.opus',
          inside:        './sources/audio/bubbles/delay_in.opus',
          insideType:    'audio',
          interiorMode:  'genesis',
          ghost:         './sources/audio/bubbles/delay_ghost_stereo.opus' },
      ],

      research: _firesFiles,
      nResearchPts: 28,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  onLoad(engine) {
    super.onLoad(engine);       // creates _bubbleSpatials, _researchPts (elements only)
    // Randomise bonfire positions every load — avoids memorisation of the map
    const cfg     = this.config;
    const bubbles = cfg.bubbles;
    // Player starts at world center — keep fires away from there too
    const startX = cfg.width  / 2;
    const startY = cfg.height / 2;
    const placed = [];   // track already-placed fire positions for min-distance check
    this._researchPts.forEach(pt => {
      let wx, wy, tries = 0;
      do {
        wx = 350 + Math.random() * (cfg.width  - 700);
        wy = 350 + Math.random() * (cfg.height - 700);
        tries++;
      } while (tries < 40 && (
        bubbles.some(b  => Math.hypot(wx - b.wx,  wy - b.wy)  < 500) ||
        Math.hypot(wx - startX, wy - startY) < 700 ||
        placed.some(p   => Math.hypot(wx - p.wx,  wy - p.wy)  < 380)
      ));
      pt.wx = wx;
      pt.wy = wy;
      placed.push({ wx, wy });
    });
    this._initState(engine);
  }

  onStart(engine) {
    super.onStart(engine);      // boots audio, creates spatial sources, starts ambient
    this._initAcousticEcho(engine.audio);
    // Delay fires created AFTER intro dismissed — avoids audio bleed during intro
    // (see _introActive dismiss handler in update())
  }

  // ─── Game state init ───────────────────────────────────────────────────────
  _initState(engine) {
    const { renderer: R } = engine;
    const cfg = this.config;

    // ── Player ──
    this.P = {
      x: R.WW / 2, y: R.WH / 2,
      w: 46, h: 60, speed: 1.5 * (R.CW / 960),
      vx: 0, vy: 0, walk: 0,
      moving: false, facing: 1,
    };

    // Snap camera to player start
    R.cam.x = Math.max(0, Math.min(R.WW - R.CW, this.P.x - R.CW / 2));
    R.cam.y = Math.max(0, Math.min(R.WH - R.CH, this.P.y - R.CH / 2));

    // ── Bubble runtime state ──
    this.bubbles = cfg.bubbles.map(b => ({ ...b }));

    // ── World objects (stones, slabs, ruins) ──
    this._worldObjs = [];
    for (let i = 0; i < 260; i++) {
      const x  = 160 + this._sr(i*7+0) * (R.WW - 320);
      const y  = 160 + this._sr(i*7+1) * (R.WH - 320);
      const ok = this.bubbles.every(b => Math.hypot(x - b.wx, y - b.wy) > 240);
      const nearCentre = Math.hypot(x - R.WW/2, y - R.WH/2) < 180;
      if (ok && !nearCentre) this._worldObjs.push({
        x, y,
        t:   this._sr(i*7+2),
        sc:  0.55 + this._sr(i*7+3) * 0.95,
        rot: this._sr(i*7+4) * Math.PI * 2,
        op:  0.55 + this._sr(i*7+5) * 0.40,
      });
    }

    // ── Lore events (float text near rune marks) ──
    this._loreEvents = this._worldObjs
      .filter(o => o.t >= 0.53 && o.t < 0.68)
      .slice(0, LORE_TEXTS.length)
      .map((o, i) => ({
        wx: o.x, wy: o.y,
        text: LORE_TEXTS[i],
        state: 'idle', alpha: 0, timer: 0,
      }));

    // ── Particles (atmospheric dust) ──
    this._particles = Array.from({ length: 55 }, () => ({
      x:       Math.random() * R.CW,
      y:       Math.random() * R.CH,
      vx:      (Math.random() - 0.5) * 0.18,
      vy:      -(0.08 + Math.random() * 0.22),
      r:       0.8 + Math.random() * 2.2,
      op:      0.08 + Math.random() * 0.22,
      flicker: Math.random() * Math.PI * 2,
    }));

    // ── Bubble entry state ──
    this._enteredBubble     = null;
    this._lastEnteredBubble = null;
    this._bubbleZoom        = 0;
    this._bubbleFlash       = 0;
    this._bubbleIrisR       = 0;

    // ── Ghost audio: reverbed fragment that lingers after exiting bubble ──
    this._ghost       = null;   // { el, gainNode, AC, endTime, fading }
    this._wasInBubble = false;

    // ── Persistent ghosts: quiet loop per bubble, starts after first visit ──
    this._persistentGhosts = {};  // bubbleId → { el, gainNode, AC, running }

    // ── Delay-world bonfires: special fires inside bubble III with granular delay ──
    // Positions in world-space near bubble III (wx=2100, wy=2700)
    const _dSeed = (n) => { const x = Math.sin(n * 431.3 + 17.7) * 9301.2; return x - Math.floor(x); };
    this._delayFirePts = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + _dSeed(i) * 0.8;
      const dist  = 180 + _dSeed(i + 10) * 380;
      return {
        wx:      2100 + Math.cos(angle) * dist,
        wy:      2700 + Math.sin(angle) * dist,
        el:      null,   // audio element — set up in _initDelayFires
        src:     null,   // DirectSource
        chain:   null,   // granular delay chain nodes
        _phase:  _dSeed(i + 20) * Math.PI * 2,  // unique phase for visual flicker
      };
    });

    // ── Visited + culmination ──
    this._visitedBubbles  = new Set();
    this._culminationAlpha = 0;
    this._culminationTimer = -1;

    // ── Intro screen ──
    this._introActive = true;
    this._exitMode    = false;


    // ── Player trail & footprints ──
    this._playerTrail = [];
    this._footprints  = [];
    this._footSide    = 1;
    this._printTimer  = 0;

    // ── Wind ──
    this._windVx    = 0;
    this._windVy    = 0;
    this._windTimer = 0;
    this._windNext  = 280 + Math.random() * 400;

    // ── Idle breath ──
    this._breathPhase = 0;

    // ── Pause menu ──
    this._paused    = false;
    this._pauseSel  = 0;

    // ── Ground texture ──
    this._stoneImg    = new Image();
    this._stonePat    = null;
    this._stoneImg.src = cfg.groundTexture;
    // fallback extension
    this._stoneImg.onerror = () => {
      const alt = new Image();
      alt.src = cfg.groundTexture.replace('.jpg', '.png');
      alt.onload = () => {
        this._stoneImg = alt;
        this._stonePat = null;
        _fillAcousticMap(alt);
      };
    };

    // ── Acoustic map — sample stone texture into 64×64 brightness grid ──
    // Dark pixels → stone cavity → more echo; bright pixels → open surface → less echo.
    // The grid tiles over world space with a 512px period (matches texture repeat).
    this._acousticData   = null;   // Uint8ClampedArray from getImageData
    this._acousticFactor = 0;      // smoothed 0..1 — current zone echo depth
    this._acousticEcho   = null;   // { send, out, AC } — created in onStart

    const _fillAcousticMap = (img) => {
      try {
        const c  = document.createElement('canvas');
        c.width  = 64; c.height = 64;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, 64, 64);
        this._acousticData = cx.getImageData(0, 0, 64, 64).data;
        console.log('[AcousticMap] texture sampled →', this._acousticData.length / 4, 'px');
      } catch (e) {
        console.warn('[AcousticMap] sample failed:', e.message);
      }
    };
    if (this._stoneImg.complete && this._stoneImg.naturalWidth > 0) {
      _fillAcousticMap(this._stoneImg);
    } else {
      this._stoneImg.addEventListener('load', () => _fillAcousticMap(this._stoneImg), { once: true });
    }

    // ── Resonance network — bonfires "wake up" as more are visited ──
    // Each visited research point adds to a global resonance wet that scales
    // the acoustic map echo, making the world sound progressively more alive.
    this._visitedBonfires = new Set();   // Set of visited research pt indices
    this._resonanceWet    = 0;           // 0..1 accumulated resonance level

    // ── Listener orientation — smooth player heading for binaural rotation ──
    // Lerped from P.vx/P.vy so the "head turn" is gradual, not instant.
    // Default facing: south (0,1) — arbitrary, gives clear starting panning.
    this._orientVx = 0;
    this._orientVy = 1;
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  update(t, input, renderer, audio) {
    const { P, bubbles } = this;
    const { CW, CH, WW, WH } = renderer;

    // ── Intro / exit screen ──
    if (this._introActive) {
      // Kill ALL audio bleed: fires + bubble approach/inside + delay fires
      if (this._researchPts) {
        for (const pt of this._researchPts) {
          if (!pt.src) continue;
          try {
            if (pt.src.setDryWet) pt.src.setDryWet(0, 0);
            else if (pt.src.el)   pt.src.el.volume = 0;
          } catch(_) {}
        }
      }
      if (this._bubbleSpatials) {
        for (const entry of Object.values(this._bubbleSpatials)) {
          try {
            if (entry.approachSrc?.setVolume) entry.approachSrc.setVolume(0);
            if (entry.insideSrc?.setVolume)   entry.insideSrc.setVolume(0);
          } catch(_) {}
        }
      }
      // Delay fires are created after intro dismiss — no muting needed here
      if (input.anyJustPressed()) {
        if (this._exitMode) {
          // Full reload — game restarts from scratch
          window.location.reload();
        } else {
          this._introActive = false;
          // Now safe to init delay fires — no intro bleed risk
          this._initDelayFires(audio);
        }
      }
      return;
    }

    // ── Movement ──
    const { vx: mx, vy: my } = input.movement();
    P.moving = (mx !== 0 || my !== 0);
    if (mx !== 0) P.facing = mx > 0 ? 1 : -1;
    if (P.moving) P.walk += 0.08;

    P.vx += (mx * P.speed - P.vx) * 0.20;
    P.vy += (my * P.speed - P.vy) * 0.20;
    P.x = Math.max(P.w/2, Math.min(WW - P.w/2, P.x + P.vx));
    P.y = Math.max(P.h/2, Math.min(WH - P.h/2, P.y + P.vy));

    // ── Stone collision (upright stones + pillars) ──
    for (const o of this._worldObjs) {
      if (o.t >= 0.18 && !(o.t >= 0.74 && o.t < 0.83)) continue;
      const cr = 9 * o.sc;
      const dx = P.x - o.x, dy = P.y - o.y;
      const d  = Math.hypot(dx, dy);
      const minD = cr + P.w * 0.32;
      if (d < minD && d > 0.1) { const push = (minD - d) / d; P.x += dx * push; P.y += dy * push; }
    }

    // ── Camera ──
    renderer.followTarget(P.x, P.y);

    // ── Bubble Enter / Exit ──
    if (input.justPressed('Enter')) {
      if (this._enteredBubble) {
        const eb = this._enteredBubble;
        P.x = eb.wx + eb.r + P.w * 2;
        P.y = eb.wy;
        P.vx = 0; P.vy = 0;
        this._enteredBubble = null;
        // DO NOT reset _bubbleZoom to 0 — let it lerp naturally so outside sounds
        // fade back in smoothly (≈1 s) instead of snapping to full volume instantly.
        this._bubbleIrisR = 0;
        renderer.cam.x = Math.max(0, Math.min(WW - CW, P.x - CW / 2));
        renderer.cam.y = Math.max(0, Math.min(WH - CH, P.y - CH / 2));
        // Show project description on the side
      } else {
        for (const b of bubbles) {
          if (Math.hypot(P.x - b.wx, P.y - b.wy) < b.r + P.w * 0.8) {
            // Restart sounds from beginning on entry
            const entry = this._bubbleSpatials[b.id];
            if (entry) {
              if (entry.insideSrc)   entry.insideSrc.restart();
              if (entry.approachSrc) entry.approachSrc.restart();
            }
            this._enteredBubble     = b;
            this._lastEnteredBubble = b;
            this._bubbleFlash       = 1.0;
            renderer.shakeMag       = 7;
            const firstVisit = !this._visitedBubbles.has(b.id);
            this._visitedBubbles.add(b.id);
            if (firstVisit && b.ghost) this._startPersistentGhost(b, audio);
            if (this._visitedBubbles.size === 3 && this._culminationTimer < 0)
              this._culminationTimer = 0;
            break;
          }
        }
      }
    }
    if (input.justPressed('Escape')) {
      if (this._enteredBubble) {
        const eb = this._enteredBubble;
        P.x = eb.wx + eb.r + P.w * 2;
        P.y = eb.wy;
        P.vx = 0; P.vy = 0;
        this._enteredBubble = null;
        // DO NOT reset _bubbleZoom — same as Enter exit path, let audio fade naturally
        this._bubbleIrisR = 0;
        renderer.cam.x = Math.max(0, Math.min(WW - CW, P.x - CW / 2));
        renderer.cam.y = Math.max(0, Math.min(WH - CH, P.y - CH / 2));
      } else {
        this._paused = !this._paused;
        this._pauseSel = 0;
      }
    }

    // ── Pause menu navigation ──
    if (this._paused) {
      if (input.justPressed('ArrowUp')   || input.justPressed('KeyW')) this._pauseSel = Math.max(0, this._pauseSel - 1);
      if (input.justPressed('ArrowDown') || input.justPressed('KeyS')) this._pauseSel = Math.min(1, this._pauseSel + 1);
      if (input.justPressed('Enter')) {
        if (this._pauseSel === 0) {
          this._paused = false;
        } else {
          // EXIT — kill all audio, show intro screen, any key → full reload
          this._killAllAudio(audio);
          this._paused      = false;
          this._exitMode    = true;
          this._introActive = true;
        }
      }
      return; // freeze world while paused
    }

    // ── Detect bubble exit → start ghost ──
    const _nowIn = !!this._enteredBubble;
    if (this._wasInBubble && !_nowIn && this._lastEnteredBubble) {
      this._startGhost(audio);
    }
    this._wasInBubble = _nowIn;

    // ── Audio ──
    this._updateAudio(audio);

    // ── Bubble zoom + iris ──
    const zTarget = this._enteredBubble ? 1 : 0;
    const zLerp   = zTarget > this._bubbleZoom ? 0.10 : 0.055;
    this._bubbleZoom += (zTarget - this._bubbleZoom) * zLerp;
    if (this._bubbleZoom < 0.002) this._bubbleZoom = 0;

    if (this._enteredBubble) {
      const maxR = Math.hypot(CW, CH) * 0.6;
      this._bubbleIrisR = Math.min(maxR, this._bubbleIrisR + (maxR - this._bubbleIrisR) * 0.08 + 4);
    } else {
      this._bubbleIrisR *= 0.88;
      if (this._bubbleIrisR < 1) this._bubbleIrisR = 0;
    }

    // ── Footprints ──
    if (P.moving && !this._enteredBubble) {
      if (++this._printTimer >= 10) {
        this._printTimer = 0;
        this._footSide  *= -1;
        const perpX = -P.vy * 0.18, perpY = P.vx * 0.18;
        this._footprints.push({
          wx:  P.x + this._footSide * perpX,
          wy:  P.y + 14 + this._footSide * perpY,
          age: 0,
          ang: Math.atan2(P.vy, P.vx),
        });
        if (this._footprints.length > 36) this._footprints.shift();
      }
    }
    for (const fp of this._footprints) fp.age++;

    // ── Lore state machine ──
    for (const le of this._loreEvents) {
      const d = Math.hypot(P.x - le.wx, P.y - le.wy);
      if (le.state === 'idle' && d < 68) { le.state = 'fadein'; le.timer = 0; }
      if (le.state === 'fadein') {
        le.alpha = Math.min(1, le.alpha + 0.022);
        if (++le.timer > 22) le.state = 'hold';
      }
      if (le.state === 'hold') {
        if (++le.timer > 200 || d > 130) { le.state = 'fadeout'; le.timer = 0; }
      }
      if (le.state === 'fadeout') {
        le.alpha = Math.max(0, le.alpha - 0.016);
        if (le.alpha === 0) le.state = 'idle';
      }
    }

    // ── Wind gusts ──
    if (++this._windTimer >= this._windNext) {
      const ang = Math.random() * Math.PI * 2;
      this._windVx = Math.cos(ang) * (0.25 + Math.random() * 0.35);
      this._windVy = Math.sin(ang) * (0.25 + Math.random() * 0.35);
      this._windTimer = 0;
      this._windNext  = 300 + Math.random() * 500;
      setTimeout(() => { this._windVx *= 0.1; this._windVy *= 0.1; }, 1200 + Math.random() * 800);
    }
    this._windVx *= 0.994;
    this._windVy *= 0.994;

    // ── Player trail ──
    if (P.moving && !this._enteredBubble) {
      this._playerTrail.push({ wx: P.x, wy: P.y, age: 0 });
      if (this._playerTrail.length > 18) this._playerTrail.shift();
    }
    for (const tr of this._playerTrail) tr.age++;

    // ── Culmination ──
    if (this._culminationTimer >= 0) {
      this._culminationTimer++;
      this._culminationAlpha = Math.min(1, this._culminationAlpha + 0.004);
    }


    // ── Idle breath ──
    this._breathPhase += P.moving ? 0 : 0.018;

    // ── Particles ──
    for (const p of this._particles) {
      p.x += p.vx + Math.sin(t * 0.008 + p.flicker) * 0.08 + this._windVx;
      p.y += p.vy + this._windVy;
      p.flicker += 0.012;
      if (p.y < -4)   { p.y = CH + 4; p.x = Math.random() * CW; }
      if (p.y > CH+4) { p.y = -4;     p.x = Math.random() * CW; }
      if (p.x < -4)   p.x = CW + 4;
      if (p.x > CW+4) p.x = -4;
    }

    // ── Flash decay ──
    if (this._bubbleFlash > 0.005) this._bubbleFlash *= 0.80; else this._bubbleFlash = 0;
  }

  // ── Audio update (spatial volumes + positions) ─────────────────────────────
  _updateAudio(audio) {
    const { P } = this;
    const bZ    = this._bubbleZoom;

    // ── Persistent ghost mute/unmute ──────────────────────────────────────────
    this._updatePersistentGhosts(audio);

    // ── Ambient stereo rotation ───────────────────────────────────────────────
    // Very slow tracking so the pan feels like a gradual world-shift, not a head snap.
    // Lerp 0.015 ≈ ~1s to reach new direction; decay 0.995 ≈ ~4s to settle back to centre.
    const mvSpeed = Math.hypot(P.vx, P.vy);
    if (mvSpeed > 0.04) {
      this._orientVx += (P.vx - this._orientVx) * 0.015;
      this._orientVy += (P.vy - this._orientVy) * 0.015;
    } else {
      this._orientVx *= 0.995;
      this._orientVy *= 0.995;
    }
    if (this._acousticEcho?.stereoPan) {
      // maxPan=0.6 → gentle swing; pan lerp 0.03 ≈ ~500ms tail — slow, atmospheric
      const targetPan = audio.calcAmbientPan(this._orientVx, this._orientVy, 0.6);
      const sp = this._acousticEcho.stereoPan;
      sp.pan.value += (targetPan - sp.pan.value) * 0.03;
    }

    // ── Ghost: kill on re-entry, clean up when expired ──
    if (this._ghost) {
      const ghost = this._ghost;
      if (this._enteredBubble && !ghost.fading) {
        ghost.fading = true;
        if (ghost.gainNode) {
          const gAC = ghost.AC;
          ghost.gainNode.gain.cancelScheduledValues(gAC.currentTime);
          ghost.gainNode.gain.setValueAtTime(ghost.gainNode.gain.value, gAC.currentTime);
          ghost.gainNode.gain.linearRampToValueAtTime(0, gAC.currentTime + 0.3);
        } else {
          // fallback path — no Web Audio gain node, fade via el.volume
          ghost.el.volume = 0;
        }
        setTimeout(() => {
          try { ghost.el.pause(); ghost.el.src = ''; } catch(_) {}
          if (this._ghost === ghost) this._ghost = null;
        }, 500);
      } else if (!ghost.fading && ghost.AC.currentTime >= ghost.endTime) {
        try { ghost.el.pause(); ghost.el.src = ''; } catch(_) {}
        this._ghost = null;
      }
    }
    const actB  = this._enteredBubble || this._lastEnteredBubble;
    const actId = actB ? actB.id : 0;

    // setVolume handles Resonance (_resGain), HRTF (gain), and fallback (el.volume)
    const sv = (src, vol) => {
      if (!src) return;
      src.setVolume(Math.max(0, Math.min(1, vol)));
    };

    // ── Volume multipliers from mixer sliders ──
    const _v = window._COSMOS_VOL || {};
    const fVol = _v.fires   ?? 0.85;   // fires (bonfires) multiplier
    const bVol = _v.bubbles ?? 0.85;   // bubbles multiplier

    // ── Bubble 1 approach ──
    const b1  = this.bubbles[0];
    const b1e = this._bubbleSpatials[1];
    if (b1e && b1e.approachSrc) {
      const d  = Math.hypot(b1.wx - P.x, b1.wy - P.y);
      const f  = Math.max(0, 1 - d / 900);
      audio.updatePosition(b1e.approachSrc, b1.wx - P.x, b1.wy - P.y);
      // 9.0 multiplier: signal enters Resonance at max gain from ~600px out.
      // Resonance applies its own distance rolloff (~×0.22 at 4.5m) on top.
      sv(b1e.approachSrc, Math.min(1, f * f * 9.0) * (1 - bZ) * bVol);
    }
    // ── Bubble 1 inside ──
    if (b1e && b1e.insideSrc) {
      audio.updatePosition(b1e.insideSrc, b1.wx - P.x, b1.wy - P.y);
      sv(b1e.insideSrc, actId === 1 ? bZ * 0.92 * bVol : 0);
    }

    // ── Bubble 2 approach ──
    const b2  = this.bubbles[1];
    const b2e = this._bubbleSpatials[2];
    if (b2e && b2e.approachSrc) {
      const d  = Math.hypot(b2.wx - P.x, b2.wy - P.y);
      const f  = Math.max(0, 1 - d / 900);
      audio.updatePosition(b2e.approachSrc, b2.wx - P.x, b2.wy - P.y);
      sv(b2e.approachSrc, Math.min(1, f * f * 9.0) * (1 - bZ) * bVol);
    }
    // ── Bubble 2 inside ──
    if (b2e && b2e.insideSrc) {
      audio.updatePosition(b2e.insideSrc, b2.wx - P.x, b2.wy - P.y);
      sv(b2e.insideSrc, actId === 2 ? bZ * 0.92 * bVol : 0);
    }

    // ── Bubble 3 approach ──
    const b3  = this.bubbles[2];
    const b3e = this._bubbleSpatials[3];
    if (b3e && b3e.approachSrc) {
      const d  = Math.hypot(b3.wx - P.x, b3.wy - P.y);
      const f  = Math.max(0, 1 - d / 900);
      audio.updatePosition(b3e.approachSrc, b3.wx - P.x, b3.wy - P.y);
      sv(b3e.approachSrc, Math.min(1, f * f * 9.0) * (1 - bZ) * bVol);
    }
    // ── Bubble 3 inside ──
    if (b3e && b3e.insideSrc) {
      audio.updatePosition(b3e.insideSrc, b3.wx - P.x, b3.wy - P.y);
      sv(b3e.insideSrc, actId === 3 ? bZ * 0.92 * bVol : 0);
    }

    // ── Research points — spatial audio + Doppler ──
    this._researchPts.forEach(pt => {
      const dx   = pt.wx - P.x, dy = pt.wy - P.y;
      const d    = Math.hypot(dx, dy);

      // ── Doppler: light pitch shift based on radial velocity ──────────────────
      // virtualSoS = 70 px/frame → ±4% at max speed ≈ ±0.5 semitone — subtle
      if (d > 1) {
        const approach = (P.vx * dx + P.vy * dy) / d;
        const target   = Math.max(0.75, Math.min(1.33, 1.0 + approach / 70));
        pt._doppler    = pt._doppler !== undefined
          ? pt._doppler + (target - pt._doppler) * 0.06
          : 1.0;
        pt.el.playbackRate = pt._doppler;
      }

      if (!pt.src) return;
      const f = Math.max(0, 1 - d / 400);
      audio.updatePosition(pt.src, dx, dy);

      // ── Wet / dry blend: direct signal when close, reverb when far ───────────
      // closeness = 1 at d=0, 0 at d=250 → dry dominant near bonfire
      // wetness   = inverse              → Resonance room dominant at distance
      // 5.0 multiplier: 2× boost for audibility vs earlier captureStream design
      const baseVol   = Math.min(1, f * f * 3.3) * (1 - bZ) * fVol;
      const closeness = Math.max(0, 1 - d / 250);
      if (pt.src.setDryWet) {
        pt.src.setDryWet(baseVol * closeness, baseVol * (1 - closeness));
      } else {
        sv(pt.src, baseVol);
      }

      // Distance-based air absorption (wet filter): bright close, muffled far
      // cutoff = 3500 / (1 + d/120) → 3500Hz at d=0, ~640Hz at d=400
      if (pt.src.filter) {
        pt.src.filter.frequency.value = Math.max(280, 3500 / (1 + d / 120));
      }
    });

    // ── Delay-world bonfires — only active when inside bubble III ──
    const inDelay = this._enteredBubble?.id === 3;
    if (this._delayFirePts) {
      for (const pt of this._delayFirePts) {
        if (!pt.el || !pt.inputGain) continue;
        const dx = pt.wx - P.x, dy = pt.wy - P.y;
        const d  = Math.hypot(dx, dy);
        const f  = Math.max(0, 1 - d / 520);
        const target = inDelay ? Math.min(1, f * f * 2.5) * bVol : 0;
        // Smooth gain transitions
        pt.inputGain.gain.value += (target - pt.inputGain.gain.value) * 0.04;
        if (pt.chain) pt.chain.gain.value = pt.inputGain.gain.value > 0.001 ? 1 : 0;
      }
    }

    // ── Ambient duck when inside bubble ──
    // If acoustic echo chain is active (mainGain exists), control via Web Audio gain.
    // Otherwise control via el.volume directly (acoustic echo fallback).
    if (this._ambEl) {
      const wVol   = _v.world ?? 0.55;
      // Inside bubble → full silence; outside → 0.36 (half of previous 0.72)
      const target = this._enteredBubble ? 0 : 1.2 * wVol;
      if (this._acousticEcho?.mainGain) {
        const g = this._acousticEcho.mainGain;
        g.gain.value += (target - g.gain.value) * 0.04;
      } else {
        this._ambEl.volume += (target - this._ambEl.volume) * 0.04;
      }
    }

  }

  // ─── Acoustic map: texture-based cavity echo on the ambient track ─────────
  //
  //  Graph:  ambEl → captureStream → src → send → delay → lp → fb ─┐
  //                                                                  ↓
  //                                           delay ← fb ← (loop back)
  //                                             ↓
  //                                            out → masterG
  //
  //  send.gain and out.gain are driven every frame by _acousticFactor,
  //  which is smoothed from _getAcousticFactor(px, py).
  //  The whole chain fades to 0 inside bubbles (dry interior stays dry).

  // ─── Granular delay chain — used on delay-world bonfires ──────────────────
  // Simulates grain scatter using N parallel LFO-modulated delay taps with
  // feedback. No ScriptProcessor needed — pure Web Audio graph.
  //
  //  input → [for each tap]:
  //            delay(t_i + LFO) → feedback → delay (loop)
  //            delay → tapGain → panner → output
  //
  _createGranularDelayChain(AC, masterG, inputNode, seed) {
    const s = (n) => { const x = Math.sin((seed + n) * 431.3 + 17.7) * 9301.2; return x - Math.floor(x); };
    const NUM = 7;
    const out = AC.createGain();
    out.gain.value = 1;
    out.connect(masterG);

    // Waveform types for LFOs — variety per tap
    const lfoShapes = ['sine', 'triangle', 'sawtooth', 'square', 'sine', 'triangle', 'sawtooth'];

    for (let i = 0; i < NUM; i++) {
      // Wide range of delay times: 25ms → 1.1s (creates very different echoes)
      const baseDelay = 0.025 + s(i) * 1.05;

      const delay = AC.createDelay(2.5);
      delay.delayTime.value = baseDelay;

      // Varied feedback: some short tight loops, some long washy repeats
      const fb = AC.createGain();
      fb.gain.value = 0.22 + s(i + 20) * 0.52;   // 22–74%

      // Per-tap tone shaping — some bright, some muffled
      const toneFilter = AC.createBiquadFilter();
      toneFilter.type = (s(i + 60) > 0.6) ? 'highpass' : 'lowpass';
      toneFilter.frequency.value = 180 + s(i + 61) * 3800;  // 180Hz–4kHz
      toneFilter.Q.value = 0.3 + s(i + 62) * 1.8;

      const tapG = AC.createGain();
      tapG.gain.value = 0;

      const pan = AC.createStereoPanner();
      // Non-uniform panning — some extreme, some centre
      pan.pan.value = (s(i + 70) * 2 - 1) * (0.4 + s(i + 71) * 0.6);

      // Time LFO — grain scatter (very different rates per tap)
      const lfo = AC.createOscillator();
      lfo.type = lfoShapes[i];
      lfo.frequency.value = 0.05 + s(i + 30) * 6.0;   // 0.05–6 Hz — very varied
      const lfoA = AC.createGain();
      lfoA.gain.value = 0.004 + s(i + 40) * 0.065;    // ±4–69ms time scatter
      lfo.connect(lfoA);
      lfoA.connect(delay.delayTime);
      lfo.start(0);

      // Amplitude tremolo — some slow breath, some fast chatter
      const trem = AC.createOscillator();
      trem.type = lfoShapes[(i + 2) % 7];
      trem.frequency.value = 0.4 + s(i + 50) * 18;    // 0.4–18.4 Hz
      const tremA = AC.createGain();
      tremA.gain.value = 0.08 + s(i + 51) * 0.30;     // 8–38% tremolo depth
      trem.connect(tremA);
      tremA.connect(tapG.gain);
      trem.start(0);

      inputNode.connect(delay);
      delay.connect(toneFilter);
      toneFilter.connect(fb);
      fb.connect(delay);            // feedback loop
      toneFilter.connect(tapG);
      tapG.connect(pan);
      pan.connect(out);
    }

    return out;
  }

  // ─── Init delay-world bonfires (bubble III special fires) ─────────────────
  _initDelayFires(audio) {
    if (!audio.AC || !audio.masterG) return;
    const AC      = audio.AC;
    const masterG = audio.masterG;
    const BOOST   = audio.BOOST;
    const files   = _firesFiles;

    this._delayFirePts.forEach((pt, i) => {
      const el  = new Audio();
      el.src    = files[i % files.length];
      el.loop   = true;
      el.play().catch(() => {});

      try {
        const src       = AC.createMediaElementSource(el);
        const inputGain = AC.createGain();
        inputGain.gain.value = 0;  // silent until inside bubble III
        src.connect(inputGain);
        const chain = this._createGranularDelayChain(AC, masterG, inputGain, i * 137);
        chain.gain.value = 0;
        pt.el        = el;
        pt.chain     = chain;
        pt.inputGain = inputGain;
        console.log(`[DelayFire ${i}] ready`);
      } catch(e) {
        console.warn(`[DelayFire ${i}] error:`, e.message);
        pt.el = el;
      }
    });
  }

  _initAcousticEcho(audio) {
    if (!audio.AC || !this._ambEl) return;
    const AC = audio.AC;
    try {
      // createMediaElementSource is stable and doesn't lose the stream on tab blur.
      // captureStream was replaced because its MediaStream can lose audio tracks
      // when the browser deprioritizes the tab, causing ambient cut-outs.
      const mediaSrc  = AC.createMediaElementSource(this._ambEl);
      const wvol      = window._COSMOS_VOL?.world ?? 0.55;
      const mainGain  = AC.createGain();       mainGain.gain.value  = wvol * 1.2;
      const stereoPan = AC.createStereoPanner(); stereoPan.pan.value = 0;

      mediaSrc.connect(mainGain);
      mainGain.connect(stereoPan);
      stereoPan.connect(audio.masterG);

      // Stop setAmbient's rAF loop — mainGain replaces el.volume control from here on.
      // el.volume stays at 1.0 (no captureStream BOOST trick needed).
      this._ambEl._ambTick = false;

      this._acousticEcho = { mainGain, stereoPan, AC };
      console.log('[AcousticEcho] ready — createMediaElementSource + stereoPan');
    } catch(e) {
      console.warn('[AcousticEcho] init failed, el.volume fallback active:', e.message);
      // setAmbient's rAF loop continues controlling el.volume as fallback
    }
  }

  // Returns 0..1 echo depth for world position (wx, wy).
  // Samples the stone texture brightness at tiled world coordinates.
  // Dark texels → deeper cavity → higher factor.
  _getAcousticFactor(wx, wy) {
    if (!this._acousticData) return 0.12;  // neutral default if texture not yet loaded
    const tile = 512;   // world-px period matching CSS texture repeat
    const tx   = ((wx % tile) + tile) % tile;
    const ty   = ((wy % tile) + tile) % tile;
    const px   = Math.min(63, Math.floor(tx / tile * 64));
    const py   = Math.min(63, Math.floor(ty / tile * 64));
    const idx  = (py * 64 + px) * 4;
    const brightness = (this._acousticData[idx] + this._acousticData[idx+1] + this._acousticData[idx+2]) / 765;
    // Map: dark (0) → 0.72, bright (1) → 0.05
    return 0.05 + (1 - brightness) * 0.67;
  }

  // ─── Kill all audio instantly (called on EXIT) ────────────────────────────
  // querySelectorAll misses new Audio() elements (not in DOM).
  // We must stop _mediaEls (WorldBase list) + dynamic ghost elements manually.
  _killAllAudio(audio) {
    // 1. All managed media elements (ambient, bubble approach/inside, fires, videos)
    if (this._mediaEls) {
      for (const el of this._mediaEls) {
        try { el.pause(); el.src = ''; } catch(_) {}
      }
    }
    // 2. Ambient element (also in _mediaEls but belt+suspenders)
    if (this._ambEl) {
      try { this._ambEl.pause(); this._ambEl.src = ''; } catch(_) {}
    }
    // 3. One-shot ghost element
    if (this._ghost) {
      try { this._ghost.el.pause(); this._ghost.el.src = '';
            if (this._ghost.el.parentNode) this._ghost.el.remove(); } catch(_) {}
      this._ghost = null;
    }
    // 4. Persistent ghost elements
    if (this._persistentGhosts) {
      for (const id in this._persistentGhosts) {
        const pg = this._persistentGhosts[id];
        try { pg.el.pause(); pg.el.src = '';
              if (pg.el.parentNode) pg.el.remove(); } catch(_) {}
      }
      this._persistentGhosts = {};
    }
    // 5. Delay-world bonfire elements
    if (this._delayFirePts) {
      for (const pt of this._delayFirePts) {
        if (pt.el) try { pt.el.pause(); pt.el.src = ''; } catch(_) {}
      }
    }
    // 6. Close AudioContext — kills all Web Audio graph processing
    if (audio && audio.AC) {
      try { audio.AC.close(); } catch(_) {}
    }
  }

  // ─── Ghost audio: reverbed fragment that lingers after leaving a bubble ────
  _startGhost(audio) {
    const AC      = audio.AC;
    const masterG = audio.masterG;
    if (!AC || !masterG) return;

    const b = this._lastEnteredBubble;
    const ghostSrc = b && (b.ghost || b.inside);
    if (!ghostSrc) return;

    // Tear down previous ghost if any
    if (this._ghost) {
      try { this._ghost.el.pause(); this._ghost.el.src = ''; } catch(_) {}
      this._ghost = null;
    }

    const ghostEl = new Audio();
    ghostEl.src  = ghostSrc;
    ghostEl.loop = true;
    // Must be in DOM for reliable playback in Chrome after createMediaElementSource
    document.body.appendChild(ghostEl);

    try {
      const mediaSrc = AC.createMediaElementSource(ghostEl);
      const gainNode = AC.createGain();
      // Desert ghost (bubble I) is much louder — prominent memory fragment
      const peakVol  = b?.id === 1 ? 0.55 : 0.32;
      const fadeIn   = 3.5;
      const hold     = 4.0;
      const fadeOut  = 30.0;
      const now      = AC.currentTime;

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(peakVol, now + fadeIn);
      gainNode.gain.setValueAtTime(peakVol, now + fadeIn + hold);
      gainNode.gain.linearRampToValueAtTime(0, now + fadeIn + hold + fadeOut);

      mediaSrc.connect(gainNode);
      gainNode.connect(masterG);
      ghostEl.play().catch(() => {});

      // Random start position for "memory fragment" feel (after brief buffer)
      setTimeout(() => {
        if (ghostEl.duration > 10)
          ghostEl.currentTime = Math.random() * Math.min(ghostEl.duration * 0.65, 50);
      }, 300);

      this._ghost = { el: ghostEl, gainNode, AC, endTime: now + fadeIn + hold + fadeOut, fading: false };
    } catch(e) {
      console.warn('[Ghost] error:', e.message);
      // Still register the ghost so _updateGhost / bubble-entry code can silence it
      ghostEl.volume = 0.18;
      ghostEl.play().catch(() => {});
      const fallbackEnd = AC.currentTime + 37.5; // fadeIn+hold+fadeOut
      this._ghost = { el: ghostEl, gainNode: null, AC, endTime: fallbackEnd, fading: false };
    }
  }

  // ─── Persistent ghost: quiet looping ghost tied to bubble visit ──────────
  // Starts after first entry into a bubble that has a `ghost` file.
  // Fades in slowly, then loops forever at peakVol — a "memory layer".
  // Muted with slight lowpass. Fades out when entering ANY bubble (re-fades in on exit).
  _startPersistentGhost(b, audio) {
    if (!b.ghost) return;
    const AC      = audio.AC;
    const masterG = audio.masterG;
    if (!AC || !masterG) return;
    if (this._persistentGhosts[b.id]) return; // already running

    const el  = new Audio();
    el.src    = b.ghost;
    el.loop   = true;
    // Must be in DOM for reliable Chrome playback after createMediaElementSource
    document.body.appendChild(el);

    try {
      const mediaSrc = AC.createMediaElementSource(el);

      const lp = AC.createBiquadFilter();
      lp.type            = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value         = 0.5;

      const gainNode = AC.createGain();
      const peakVol  = 0.26;   // persistent memory layer — audible but under transient
      const fadeIn   = 8.0;

      gainNode.gain.setValueAtTime(0, AC.currentTime);
      gainNode.gain.linearRampToValueAtTime(peakVol, AC.currentTime + fadeIn);

      mediaSrc.connect(lp);
      lp.connect(gainNode);
      gainNode.connect(masterG);
      el.play().catch(() => {});

      this._persistentGhosts[b.id] = { el, gainNode, AC, peakVol, muted: false };
      console.log(`[PersistentGhost] started for bubble ${b.name || b.id}`);
    } catch(e) {
      console.warn('[PersistentGhost] error:', e.message);
      el.volume = 0.12;
      el.play().catch(() => {});
      this._persistentGhosts[b.id] = { el, gainNode: null, AC, peakVol: 0.26, muted: false };
    }
  }

  // Called from _updateAudio each frame — mute ghosts while inside a bubble
  _updatePersistentGhosts(audio) {
    const inside = !!this._enteredBubble;
    for (const id in this._persistentGhosts) {
      const pg = this._persistentGhosts[id];
      // Fallback path (no Web Audio graph) — control via el.volume directly
      if (!pg.gainNode) {
        if (pg.el) pg.el.volume = inside ? 0 : pg.peakVol;
        continue;
      }
      const now     = pg.AC.currentTime;
      const current = pg.gainNode.gain.value;

      if (inside && !pg.muted) {
        // Fade out quickly when entering bubble
        pg.gainNode.gain.cancelScheduledValues(now);
        pg.gainNode.gain.setValueAtTime(current, now);
        pg.gainNode.gain.linearRampToValueAtTime(0, now + 1.5);
        pg.muted = true;
      } else if (!inside && pg.muted) {
        // Fade back in on exit
        pg.gainNode.gain.cancelScheduledValues(now);
        pg.gainNode.gain.setValueAtTime(current, now);
        pg.gainNode.gain.linearRampToValueAtTime(pg.peakVol, now + 5.0);
        pg.muted = false;
      }
    }
  }

  // Synthetic reverb impulse response — warm, non-metallic
  // Technique: exponential white noise → double low-pass → stereo decorrelation → normalize
  // Double LP removes harsh high-frequency spikes that cause the metallic timbre.
  // Pre-delay before the tail begins creates perceived space (room size impression).
  // L/R offset decorrelates channels → wider, more natural stereo image.
  _makeReverbIR(AC, durationSec = 7.0, decay = 1.8) {
    const rate = AC.sampleRate;
    const len  = Math.floor(rate * durationSec);
    const buf  = AC.createBuffer(2, len, rate);
    const pre  = Math.floor(rate * 0.018); // 18ms pre-delay

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);

      // Step 1 — exponentially decaying white noise (after pre-delay)
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }

      // Step 2 — two-pass low-pass filter (α=0.40) → removes metallic HF texture
      const a = 0.40;
      let prev = 0;
      for (let i = 0; i < len; i++) { d[i] = prev = prev + a * (d[i] - prev); }
      prev = 0;
      for (let i = 0; i < len; i++) { d[i] = prev = prev + a * (d[i] - prev); }

      // Step 3 — stereo decorrelation: right channel offset by 7ms
      if (ch === 1) {
        const off  = Math.floor(rate * 0.007);
        const copy = new Float32Array(d);
        for (let i = off; i < len; i++) d[i] = copy[i - off];
        for (let i = 0; i < off; i++)   d[i] = 0;
      }

      // Step 4 — normalize to unit peak
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
      if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
    }
    return buf;
  }

  // ─── DRAW (inside shake transform) ────────────────────────────────────────
  draw(t, renderer, ctx, audio) {
    const { CW, CH, WW, WH, cam } = renderer;
    const { P } = this;

    // Create stone pattern on first draw
    if (!this._stonePat && this._stoneImg.naturalWidth > 0) {
      this._stonePat = ctx.createPattern(this._stoneImg, 'repeat');
    }

    // 1 — Ground texture
    if (this._stonePat) {
      const iw = this._stoneImg.naturalWidth, ih = this._stoneImg.naturalHeight;
      const ox = -(cam.x % iw), oy = -(cam.y % ih);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = this._stonePat;
      ctx.fillRect(0, 0, CW + iw, CH + ih);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, CW, CH);
    } else {
      ctx.fillStyle = '#0c0a08';
      ctx.fillRect(0, 0, CW, CH);
    }

    // 1b — Mineral sparkle (world-space fixed flecks)
    if (this._stoneImg.naturalWidth > 0) {
      for (let i = 0; i < 60; i++) {
        const wx = this._sr(i*4+200) * WW, wy = this._sr(i*4+201) * WH;
        const sx = wx - cam.x, sy = wy - cam.y;
        if (sx < -4 || sx > CW+4 || sy < -4 || sy > CH+4) continue;
        const flick = 0.35 + 0.65 * Math.abs(Math.sin(t*0.022 + i*1.3));
        const op    = this._sr(i*4+202) * 0.09 * flick;
        ctx.fillStyle = `rgba(220,210,180,${op})`;
        ctx.beginPath(); ctx.arc(sx, sy, 0.8 + this._sr(i*4+203)*1.2, 0, Math.PI*2); ctx.fill();
      }
    }

    // 2a — Zone atmosphere (soft colour pools)
    this.bubbles.forEach(b => {
      const sx = b.wx - cam.x, sy = b.wy - cam.y;
      const r  = 420;
      if (sx + r < 0 || sx - r > CW || sy + r < 0 || sy - r > CH) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.020 + b.ph);
      const cols = ['rgba(90,65,30,', 'rgba(28,48,80,', 'rgba(38,68,42,'];
      const a  = 0.09 + pulse * 0.05;
      const g  = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0,   cols[b.id-1] + a + ')');
      g.addColorStop(0.6, cols[b.id-1] + (a*0.35) + ')');
      g.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CW, CH);
    });

    // 2b — Rotating noise
    renderer.drawNoise();

    // 3 — Player trail
    this._drawPlayerTrail(ctx, renderer);

    // 3b — Footprints (on ground, under world objects)
    this._drawFootprints(ctx, renderer);

    // 4 — World objects
    this._drawWorldObjects(ctx, renderer, t);

    // 4b — Lore texts
    this._drawLoreTexts(ctx, renderer);

    // 4b2 — Research bonfires
    this._drawResearchBonfires(ctx, renderer, t);

    // 4c — Bubble bleed (interior texture bleeds on approach)
    this._drawBubbleBleed(ctx, renderer);

    // 5 — Bubbles
    this.bubbles.forEach(b => this._drawBubble(ctx, renderer, b, t));

    // 6 — Player
    this._drawPlayer(ctx, renderer, t);

    // 7 — Dust particles
    this._drawParticles(ctx, t);

    // 8 — Vignette
    renderer.drawVignette();

    // 9 — World-edge fog
    renderer.drawWorldEdgeFog(P.x, P.y);

    // 10 — Off-screen bubble indicators
    if (this._bubbleZoom < 0.1) this._drawBubbleIndicators(ctx, renderer);

    // 11 — Entry flash
    if (this._bubbleFlash > 0.005) {
      ctx.fillStyle = `rgba(195,205,208,${this._bubbleFlash * 0.45})`;
      ctx.fillRect(0, 0, CW, CH);
    }

    // 12 — Iris wipe (radial cut-in from bubble position)
    if (this._bubbleIrisR > 1 && this._bubbleZoom < 0.92) {
      const eb  = this._enteredBubble || this._lastEnteredBubble;
      const iox = eb ? (eb.wx - cam.x) : CW/2;
      const ioy = eb ? (eb.wy - cam.y) : CH/2;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.beginPath();
      ctx.rect(0, 0, CW, CH);
      ctx.arc(iox, ioy, this._bubbleIrisR, 0, Math.PI*2, true);
      ctx.fill('evenodd');
      ctx.restore();
    }

    // 13 — Bubble interior
    if (this._bubbleZoom > 0.01) this._drawBubbleInterior(ctx, renderer, t);

    // 14 — Culmination (all 3 visited)
    // culmination text removed per user request

    // 15 — Intro overlay
    if (this._introActive) this._drawIntro(ctx, renderer);
  }

  // ─── DRAW HUD (outside shake) ──────────────────────────────────────────────
  drawHUD(t, renderer, ctx) {
    const { CW, CH } = renderer;
    const { P } = this;

    // ── Pause menu ──
    if (this._paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, CW, CH);

      const items = ['RESUME', 'EXIT'];
      const menuW = 220, itemH = 44;
      const menuH = items.length * itemH + 60;
      const mx = (CW - menuW) / 2, my = (CH - menuH) / 2;

      // Background pill
      ctx.fillStyle = 'rgba(12,10,8,0.96)';
      ctx.strokeStyle = 'rgba(220,218,210,0.18)';
      ctx.lineWidth = 1;
      this._roundRect(ctx, mx - 20, my - 20, menuW + 40, menuH + 40, 4);
      ctx.fill(); ctx.stroke();

      // Title
      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.letterSpacing = '0.30em';
      ctx.fillStyle = 'rgba(220,218,210,0.28)';
      ctx.textAlign = 'center';
      ctx.fillText('P A U S E D', CW / 2, my + 14);

      // Items
      items.forEach((label, i) => {
        const iy = my + 50 + i * itemH;
        const isSel = i === this._pauseSel;

        if (isSel) {
          ctx.fillStyle = 'rgba(220,218,210,0.08)';
          this._roundRect(ctx, mx, iy - 14, menuW, itemH - 8, 3);
          ctx.fill();
        }

        ctx.font = `bold ${isSel ? 13 : 11}px "Courier New", monospace`;
        ctx.fillStyle = isSel
          ? (label === 'EXIT' ? 'rgba(240,120,100,0.95)' : 'rgba(220,218,210,0.95)')
          : 'rgba(220,218,210,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText(label, CW / 2, iy + 4);

        if (isSel) {
          ctx.fillStyle = 'rgba(220,218,210,0.30)';
          ctx.font = '9px "Courier New", monospace';
          ctx.fillText('▶', mx + 16, iy + 4);
        }
      });

      ctx.font = '8px "Courier New", monospace';
      ctx.fillStyle = 'rgba(220,218,210,0.18)';
      ctx.fillText('↑ ↓  navigate  ·  ENTER  confirm', CW / 2, my + menuH + 16);
      ctx.restore();
      return;
    }

    if (this._bubbleZoom >= 0.5) return;

    // Minimap
    this._drawMinimap(ctx, renderer);

    // HUD — title only (no guide)
    ctx.save();
    ctx.font      = `300 11px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.textAlign = 'left';
    ctx.fillText('cosmos', 18, CH - 16);

    ctx.restore();
  }

  // ─── Draw helpers ──────────────────────────────────────────────────────────

  _drawPlayerTrail(ctx, renderer) {
    const { cam, CW, CH } = renderer;
    for (let i = 0; i < this._playerTrail.length; i++) {
      const tr = this._playerTrail[i];
      const sx = tr.wx - cam.x, sy = tr.wy - cam.y;
      if (sx < -30 || sx > CW+30 || sy < -30 || sy > CH+30) continue;
      const life = (1 - tr.age / 28) * (i / this._playerTrail.length);
      if (life <= 0) continue;
      const rr = 6 + i * 0.5;
      ctx.save();
      ctx.globalAlpha = life * 0.18;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
      g.addColorStop(0, 'rgba(210,195,155,1)');
      g.addColorStop(1, 'rgba(210,195,155,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  _drawFootprints(ctx, renderer) {
    const { cam, CW, CH } = renderer;
    for (const fp of this._footprints) {
      const sx = fp.wx - cam.x, sy = fp.wy - cam.y;
      if (sx < -16 || sx > CW+16 || sy < -16 || sy > CH+16) continue;
      const life = Math.max(0, 1 - fp.age / 180);
      ctx.save();
      ctx.globalAlpha = life * 0.28;
      ctx.translate(sx, sy);
      ctx.rotate(fp.ang + Math.PI/2);
      ctx.fillStyle = 'rgba(0,0,0,0.90)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.8, 4.5, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawWorldObjects(ctx, renderer, t) {
    const { cam, CW, CH } = renderer;
    const { P } = this;
    const C_DARK  = 'rgba(55,46,33,0.95)';
    const C_MID   = 'rgba(88,74,54,0.90)';
    const C_LIGHT = 'rgba(140,118,85,0.55)';

    for (const o of this._worldObjs) {
      const sx = o.x - cam.x, sy = o.y - cam.y;
      if (sx < -160 || sx > CW+160 || sy < -160 || sy > CH+160) continue;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(o.rot);
      ctx.globalAlpha = o.op;
      const s = o.sc;

      if (o.t < 0.18) {
        // upright standing stone
        const h = 28*s, w = 12*s;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(2*s, h*0.92, w*0.9, 3.5*s, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = C_DARK; ctx.strokeStyle = C_MID; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-w/2, h*0.9);
        ctx.lineTo(-w*0.55, -h*0.2);
        ctx.quadraticCurveTo(-w*0.1, -h, w*0.15, -h*0.95);
        ctx.quadraticCurveTo(w*0.65, -h*0.5, w/2, h*0.9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C_LIGHT; ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-w*0.10, h*0.8); ctx.lineTo(-w*0.18, -h*0.15); ctx.stroke();

      } else if (o.t < 0.36) {
        // flat slab
        const w = 38*s, h = 16*s;
        ctx.fillStyle = C_DARK; ctx.strokeStyle = C_MID; ctx.lineWidth = 0.7;
        ctx.fillRect(-w/2, -h/2, w, h); ctx.strokeRect(-w/2, -h/2, w, h);
        ctx.strokeStyle = 'rgba(10,8,5,0.65)'; ctx.lineWidth = 0.45;
        ctx.beginPath(); ctx.moveTo(-w*0.15, -h*0.2); ctx.lineTo(w*0.28, h*0.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w*0.05, -h*0.40); ctx.lineTo(w*0.12, h*0.25); ctx.stroke();
        ctx.strokeStyle = C_LIGHT; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(-w/2, -h/2); ctx.lineTo(w/2, -h/2); ctx.stroke();

      } else if (o.t < 0.53) {
        // rock cluster
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.ellipse(2*s, 9*s, 18*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
        [[0,0,9*s],[8*s,-2*s,6*s],[-7*s,2*s,7*s],[3*s,5*s,4*s]].forEach(([rx,ry,rr]) => {
          ctx.fillStyle = C_DARK; ctx.strokeStyle = C_MID; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        });

      } else if (o.t < 0.68) {
        // ground rune / carved symbol
        const runeD = Math.hypot(P.x - o.x, P.y - o.y);
        if (runeD < 130) {
          const gf  = Math.max(0, (130 - runeD) / 130);
          const rg2 = ctx.createRadialGradient(0,0,0, 0,0,28*s);
          rg2.addColorStop(0, `rgba(190,165,95,${gf*0.42})`);
          rg2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = rg2;
          ctx.beginPath(); ctx.arc(0,0,28*s,0,Math.PI*2); ctx.fill();
        }
        const rA = runeD < 130 ? o.op + (1-o.op)*Math.max(0,(130-runeD)/130)*0.55 : o.op;
        ctx.strokeStyle = `rgba(90,78,58,${rA * 0.65})`;
        ctx.lineWidth   = 0.9 * s;
        const rs = 9 * s;
        ctx.beginPath(); ctx.arc(0,0,rs,0,Math.PI*2); ctx.stroke();
        for (let a = 0; a < 4; a++) {
          const ang = (a/4)*Math.PI*2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang)*rs*0.38, Math.sin(ang)*rs*0.38);
          ctx.lineTo(Math.cos(ang)*rs,      Math.sin(ang)*rs);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(75,64,46,${rA * 0.6})`;
        ctx.beginPath(); ctx.arc(0,0,rs*0.18,0,Math.PI*2); ctx.fill();

      } else if (o.t < 0.83) {
        // broken pillar
        const w = 9*s, h = 38*s;
        const topY = -h + this._sr(o.rot*31)*8*s;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(3*s, h*0.28, w*0.8, 2.5*s, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = C_DARK; ctx.strokeStyle = C_MID; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-w/2, h*0.28);
        ctx.lineTo(-w/2, topY + 5*s*this._sr(o.op*7));
        ctx.lineTo(0,    topY - 4*s);
        ctx.lineTo(w/2,  topY + 3*s*this._sr(o.rot*13));
        ctx.lineTo(w/2,  h*0.28);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C_LIGHT; ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.moveTo(-w*0.12, h*0.20); ctx.lineTo(-w*0.18, topY+4*s); ctx.stroke();

      } else {
        // scattered pebble field
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.ellipse(0, 8*s, 22*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
        for (let k = 0; k < 7; k++) {
          const px = (this._sr(k*5+o.t*100)*30 - 15)*s;
          const py = (this._sr(k*5+1+o.t*100)*18 - 9)*s;
          const pr = (1.5 + this._sr(k*5+2+o.t*100)*3.5)*s;
          ctx.fillStyle = C_DARK; ctx.strokeStyle = C_MID; ctx.lineWidth = 0.45;
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  _drawLoreTexts(ctx, renderer) {
    const { cam, CW, CH } = renderer;
    for (const le of this._loreEvents) {
      if (le.alpha < 0.005) continue;
      const sx = le.wx - cam.x, sy = le.wy - cam.y;
      if (sx < -220 || sx > CW+220 || sy < -40 || sy > CH+40) continue;
      ctx.save();
      ctx.globalAlpha = le.alpha * 0.22;
      const tg = ctx.createRadialGradient(sx, sy-22, 0, sx, sy-22, 55);
      tg.addColorStop(0, 'rgba(165,175,170,1)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(sx-55, sy-55, 110, 50);
      ctx.globalAlpha = le.alpha * 0.72;
      ctx.font = `400 10px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillStyle = 'rgba(185,192,188,1)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(le.text, sx, sy - 20);
      ctx.restore();
    }
  }

  _drawBubbleBleed(ctx, renderer) {
    const { cam, CW, CH } = renderer;
    const { P } = this;
    const BLEED_DIST = 520;

    this.bubbles.forEach(b => {
      const sx   = b.wx - cam.x, sy = b.wy - cam.y;
      const dist = Math.hypot(P.x - b.wx, P.y - b.wy);
      if (dist > BLEED_DIST) return;

      const prox       = 1 - dist / BLEED_DIST;
      const bleedAlpha = prox * prox * prox * 0.52;
      const bleedR     = b.r + prox * 220;

      ctx.save();
      ctx.beginPath(); ctx.arc(sx, sy, bleedR, 0, Math.PI*2); ctx.clip();

      const bleedVideo = (el) => {
        const vw = el.videoWidth || 320, vh = el.videoHeight || 240;
        const scale = (bleedR * 2) / Math.min(vw, vh);
        const dw = vw * scale, dh = vh * scale;
        ctx.globalAlpha = bleedAlpha;
        ctx.drawImage(el, sx - dw/2, sy - dh/2, dw, dh);
      };

      const b1e = this._bubbleSpatials[b.id];
      if (b.id === 1) {
        const el = b1e && b1e.insideEl;
        if (el && el.readyState >= 2) bleedVideo(el);
        else {
          const g = ctx.createRadialGradient(sx,sy,0, sx,sy,bleedR);
          g.addColorStop(0,   `rgba(190,155,95,${bleedAlpha*1.2})`);
          g.addColorStop(0.6, `rgba(140,90,30,${bleedAlpha*0.6})`);
          g.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(sx-bleedR, sy-bleedR, bleedR*2, bleedR*2);
        }
      } else if (b.id === 2) {
        const b2e2 = this._bubbleSpatials[2];
        const el = b2e2 && (b2e2.videoEl || b2e2.approachEl);
        if (el && el.readyState >= 2) bleedVideo(el);
        else {
          const g = ctx.createRadialGradient(sx,sy,0, sx,sy,bleedR);
          g.addColorStop(0,   `rgba(50,70,130,${bleedAlpha*1.2})`);
          g.addColorStop(0.6, `rgba(20,30,80,${bleedAlpha*0.6})`);
          g.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(sx-bleedR, sy-bleedR, bleedR*2, bleedR*2);
        }
      } else if (b.id === 3) {
        const g = ctx.createRadialGradient(sx,sy,0, sx,sy,bleedR);
        g.addColorStop(0,    `rgba(44,70,38,${bleedAlpha*1.1})`);
        g.addColorStop(0.4,  `rgba(20,42,18,${bleedAlpha*0.8})`);
        g.addColorStop(0.75, `rgba(8,18,6,${bleedAlpha*0.4})`);
        g.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g; ctx.fillRect(sx-bleedR, sy-bleedR, bleedR*2, bleedR*2);
      }

      // feather edge
      ctx.globalAlpha = 1;
      const edge = ctx.createRadialGradient(sx,sy,bleedR*0.55, sx,sy,bleedR);
      edge.addColorStop(0, 'rgba(0,0,0,0)');
      edge.addColorStop(1, `rgba(0,0,0,${bleedAlpha*1.6})`);
      ctx.fillStyle = edge; ctx.fillRect(sx-bleedR, sy-bleedR, bleedR*2, bleedR*2);
      ctx.restore();
    });
  }

  _drawBubble(ctx, renderer, b, t) {
    const { cam, CW, CH } = renderer;
    const { P } = this;
    const sx = b.wx - cam.x, sy = b.wy - cam.y;
    if (sx < -b.r*4 || sx > CW+b.r*4 || sy < -b.r*4 || sy > CH+b.r*4) return;

    const dist     = Math.hypot(P.x - b.wx, P.y - b.wy);
    const near     = dist < b.r + P.w * 0.75;
    const nearFact = Math.max(0, 1 - dist / (b.r * 5));
    const pulse    = 1 + (Math.sin(t*0.031 + b.ph)*0.022 + Math.sin(t*0.019 + b.ph*1.6)*0.011)
                       * (1 + nearFact * 1.4);
    const r   = b.r * pulse;
    const pal = BUBBLE_PALETTES[b.id - 1];

    const SANS = `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;

    // ── Flat fill + clipped video ──
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.clip();

    // flat base colour
    ctx.fillStyle = near ? `rgba(${pal.b0},0.72)` : `rgba(${pal.b1},0.42)`;
    ctx.fillRect(sx-r, sy-r, r*2, r*2);

    // video thumbnail (clipped)
    const entry  = this._bubbleSpatials[b.id];
    const vidEl  = b.id === 1 ? (entry && entry.insideEl)
                 : b.id === 2 ? (entry && (entry.videoEl || entry.approachEl)) : null;
    if (vidEl && vidEl.readyState >= 2) {
      const vw = vidEl.videoWidth || 1, vh = vidEl.videoHeight || 1;
      const scale = (r * 2) / Math.min(vw, vh);
      ctx.globalAlpha = near ? 0.55 : 0.28;
      ctx.drawImage(vidEl, sx - vw*scale/2, sy - vh*scale/2, vw*scale, vh*scale);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ── Ring + label (no clip) ──
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
    ctx.strokeStyle = near ? `rgba(255,255,255,0.55)` : `rgba(255,255,255,0.18)`;
    ctx.lineWidth   = 1;
    ctx.stroke();

    // name label
    const label = (b.name || b.num).toLowerCase();
    ctx.font         = `300 12px ${SANS}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = near ? `rgba(255,255,255,0.80)` : `rgba(255,255,255,0.30)`;
    ctx.fillText(label, sx, sy);

    // entry hint
    if (near) {
      ctx.font      = `400 9px ${SANS}`;
      ctx.fillStyle = `rgba(255,255,255,0.38)`;
      ctx.fillText('enter', sx, sy + r + 13);
    }
    ctx.restore();
  }

  _drawPlayer(ctx, renderer, t) {
    const { cam } = renderer;
    const { P }   = this;
    const cx = P.x - cam.x;
    const cy = P.y - cam.y;
    const breath = P.moving ? 0 : Math.sin(this._breathPhase) * 1.4;
    const bob    = P.moving ? Math.sin(P.walk) * 2.6 : breath;
    const lean   = P.moving ? P.vx * 0.04 : 0;
    const s      = P.h;
    const lw     = Math.max(1.4, s * 0.030);

    // Floor shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + P.h*0.50, P.w*(0.30 + Math.abs(bob)*0.005), P.h*0.062, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
    ctx.restore();

    // Glow ring
    ctx.save();
    ctx.translate(cx, cy + bob);
    const glowR = P.w * 0.85;
    const glowA = P.moving ? 0.14 : (0.055 + Math.sin(t*0.038)*0.025);
    const grd   = ctx.createRadialGradient(0,0,0, 0,0,glowR);
    grd.addColorStop(0,   `rgba(235,230,210,${glowA})`);
    grd.addColorStop(0.5, `rgba(200,190,160,${glowA*0.35})`);
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0,0,glowR,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // Character
    const C_FILL   = 'rgba(242,238,228,0.97)';
    const C_DARK   = 'rgba(18,14,10,0.93)';
    const C_SHADE  = 'rgba(55,48,38,0.85)';
    const C_DETAIL = 'rgba(30,26,18,0.50)';
    const legR = Math.sin(P.walk) * 0.22 * s;
    const legL = -legR;
    const armR = -Math.sin(P.walk) * 0.14 * s;
    const armL = -armR;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.rotate(lean);
    ctx.scale(P.facing, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Backpack
    const bpW = s*0.22, bpH = s*0.42, bpX = -s*0.145 - bpW + s*0.04, bpY = -s*0.32;
    ctx.fillStyle = C_SHADE; ctx.strokeStyle = C_DARK; ctx.lineWidth = lw;
    this._rr(ctx, bpX, bpY, bpW, bpH, s*0.045); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C_DARK;
    this._rr(ctx, bpX+s*0.01, bpY-s*0.025, bpW-s*0.02, s*0.075, s*0.02); ctx.fill();
    this._rr(ctx, bpX+s*0.03, bpY+bpH*0.54, bpW-s*0.06, bpH*0.28, s*0.022);
    ctx.fill(); ctx.strokeStyle = C_SHADE; ctx.lineWidth = lw*0.4; ctx.stroke();
    ctx.strokeStyle = C_DETAIL; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(bpX+bpW*0.7, bpY+s*0.04); ctx.quadraticCurveTo(s*0.0, bpY+s*0.08, s*0.10, -s*0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bpX+bpW*0.8, bpY+s*0.18); ctx.quadraticCurveTo(s*0.02, bpY+s*0.22, s*0.08, -s*0.12); ctx.stroke();

    // Legs
    const leg = (hx, sw) => {
      const kx = hx+sw*0.55, ky = s*0.12, fx = hx+sw, fy = s*0.46;
      ctx.strokeStyle = C_DARK; ctx.lineWidth = lw*1.45;
      ctx.beginPath(); ctx.moveTo(hx, s*0.03); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = C_DARK; ctx.beginPath(); ctx.arc(kx, ky, lw*0.9, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = C_DARK; ctx.lineWidth = lw*1.8;
      ctx.beginPath(); ctx.moveTo(fx-s*0.01, fy); ctx.lineTo(fx+s*0.11, fy); ctx.stroke();
    };
    leg(s*0.07, legR); leg(-s*0.07, legL);

    // Torso
    ctx.fillStyle = C_FILL; ctx.strokeStyle = C_DARK; ctx.lineWidth = lw;
    this._rr(ctx, -s*0.145, -s*0.37, s*0.29, s*0.44, s*0.055); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C_DETAIL; ctx.lineWidth = lw*0.45;
    [-0.29,-0.18,-0.07].forEach(yf => {
      ctx.beginPath(); ctx.moveTo(-s*0.10, s*yf); ctx.lineTo(s*0.10, s*yf); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(0,-s*0.36); ctx.lineTo(0, s*0.04); ctx.stroke();

    // Arms
    const arm = (shX, sw) => {
      const ex = shX+sw*0.7, ey = -s*0.10, hx = shX+sw, hy = s*0.10;
      ctx.strokeStyle = C_DARK; ctx.lineWidth = lw*1.25;
      ctx.beginPath(); ctx.moveTo(shX,-s*0.28); ctx.lineTo(ex,ey); ctx.lineTo(hx,hy); ctx.stroke();
      ctx.fillStyle = C_FILL; ctx.strokeStyle = C_DARK; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(hx, hy, lw*1.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    };
    arm(-s*0.145, armL); arm(s*0.145, armR*0.45);

    // Neck
    ctx.fillStyle = C_FILL; ctx.strokeStyle = C_DARK; ctx.lineWidth = lw;
    this._rr(ctx, -s*0.055, -s*0.40, s*0.11, s*0.07, s*0.02); ctx.fill(); ctx.stroke();

    // Head
    ctx.fillStyle = C_FILL; ctx.strokeStyle = C_DARK; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(0,-s*0.52, s*0.155, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    // Hair
    ctx.strokeStyle = C_DARK; ctx.lineWidth = lw*1.1;
    ctx.beginPath(); ctx.moveTo(-s*0.10,-s*0.62); ctx.quadraticCurveTo(-s*0.02,-s*0.70, s*0.04,-s*0.66); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s*0.05,-s*0.66); ctx.quadraticCurveTo(s*0.04,-s*0.72, s*0.10,-s*0.65); ctx.stroke();

    // Face
    ctx.fillStyle = C_DARK;
    ctx.beginPath(); ctx.arc(s*0.055,-s*0.525, s*0.026, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = C_DARK; ctx.lineWidth = lw*0.6;
    ctx.beginPath(); ctx.moveTo(s*0.085,-s*0.50); ctx.lineTo(s*0.100,-s*0.475); ctx.stroke();

    ctx.restore();
  }

  // Rounded rect path helper
  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  // ─── Research point bonfires ──────────────────────────────────────────────
  _drawResearchBonfires(ctx, renderer, t) {
    const { cam, CW, CH } = renderer;
    const { P } = this;
    this._researchPts.forEach(pt => {
      const sx = pt.wx - cam.x, sy = pt.wy - cam.y;
      if (sx < -60 || sx > CW + 60 || sy < -60 || sy > CH + 60) return;
      const dist   = Math.hypot(P.x - pt.wx, P.y - pt.wy);
      const active = dist < 260;
      const near   = dist < 500;
      this._drawBonfire(ctx, sx, sy, active, t);
      if (near) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - dist / 500) * 0.95;
        ctx.font = `500 12px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
        ctx.fillStyle = active ? 'rgba(255,255,255,1)' : 'rgba(220,225,220,0.90)';
        ctx.textAlign = 'center';
        ctx.fillText('◉ REC', sx, sy - 38);
        ctx.restore();
      }
    });
  }

  _drawBonfire(ctx, sx, sy, active, t) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(2.8, 2.8);

    // t is frame count (~60fps). tf ≈ seconds
    const tf = t * 0.017;
    const f1 = Math.sin(tf * 4.1)  * 0.18 + Math.sin(tf * 7.3)  * 0.09;
    const f2 = Math.sin(tf * 5.7)  * 0.14 + Math.sin(tf * 3.1)  * 0.11;
    const f3 = Math.sin(tf * 6.2)  * 0.12 + Math.sin(tf * 9.8)  * 0.07;
    const flicker = active ? 1 + f1 : 0.45;

    // ── Ground glow — flat, no gradient (gradients kill framerate) ───────────
    if (active) {
      ctx.globalAlpha = 0.09 * flicker;
      ctx.fillStyle   = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 5, 30 + f1 * 5, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Ground shadow ──────────────────────────────────────────────────────────
    ctx.globalAlpha = 0.38;
    ctx.fillStyle   = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    ctx.ellipse(1, 8, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Base stones ────────────────────────────────────────────────────────────
    ctx.globalAlpha = 0.95;
    ctx.lineWidth   = 1.2;
    for (let i = 0; i < 3; i++) {
      const a  = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const bx = Math.cos(a) * 6.5;
      const by = Math.sin(a) * 4 + 5;
      ctx.fillStyle   = 'rgba(14,12,8,0.98)';
      ctx.strokeStyle = 'rgba(200,192,175,0.85)';
      ctx.beginPath();
      ctx.ellipse(bx, by, 5.5, 3.8, a * 0.3, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // ── Crossed logs ───────────────────────────────────────────────────────────
    ctx.lineCap = 'round';
    [Math.PI / 5, -Math.PI / 5].forEach(angle => {
      ctx.save(); ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(14,12,8,0.98)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(9, -2); ctx.stroke();
      ctx.strokeStyle = 'rgba(185,178,160,0.75)'; ctx.lineWidth = 1.3;
      ctx.stroke(); ctx.restore();
    });

    if (!active) {
      // Dormant: small white ember
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(220,220,220,0.8)';
      ctx.beginPath(); ctx.ellipse(0, 2, 2.5, 1.2, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore(); return;
    }

    // ── Flame layers — black & white ──────────────────────────────────────────
    const fh = 11 * flicker;
    const flameLayers = [
      { w: 6.5, sway: f1 * 2.8, h: fh,        col: 'rgba(60,60,60,0.60)'   },
      { w: 4.5, sway: f2 * 2.0, h: fh * 0.88, col: 'rgba(140,140,140,0.70)' },
      { w: 2.5, sway: f3 * 1.4, h: fh * 0.72, col: 'rgba(255,255,255,0.88)' },
    ];

    // Outer black silhouette
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.96)';
    ctx.beginPath();
    ctx.moveTo(-7, 2);
    ctx.bezierCurveTo(-6 + f1*2, -fh*0.4, -5 + f2*1.5, -fh*0.85, f1*1.5, -fh - 2);
    ctx.bezierCurveTo(5 + f2*1.5, -fh*0.85, 6 + f1*2, -fh*0.4, 7, 2);
    ctx.fill();

    // Grey→white inner tongues
    flameLayers.forEach(({ w, sway, h, col }) => {
      ctx.globalAlpha = 0.85 * flicker;
      ctx.fillStyle   = col;
      ctx.beginPath();
      ctx.moveTo(-w * 0.6, 1);
      ctx.bezierCurveTo(-w * 0.5 + sway * 0.6, -h * 0.4,
                        -w * 0.3 + sway * 0.9,  -h * 0.85,
                         sway,                   -h);
      ctx.bezierCurveTo( w * 0.3 + sway * 0.9,  -h * 0.85,
                         w * 0.5 + sway * 0.6,  -h * 0.4,
                         w * 0.6,                1);
      ctx.fill();
    });

    // ── Sparks — white only ────────────────────────────────────────────────────
    for (let s = 0; s < 10; s++) {
      const phase = s / 10;
      const age   = ((tf * 0.8 + phase * 1.3) % 1.0);
      if (age > 0.85) continue;
      const life  = 1 - age / 0.85;
      const spx   = Math.sin(phase * Math.PI * 6.2 + tf * 3.1) * 4 * (1 - age * 0.5);
      const spy   = -age * (fh + 10) - 2;
      const sr    = life * 1.4;
      const grey  = Math.round(255 * (1 - age * 0.6));
      ctx.globalAlpha = life * 0.90;
      ctx.fillStyle   = `rgba(${grey},${grey},${grey},1)`;
      ctx.beginPath(); ctx.arc(spx, spy, sr, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  _drawParticles(ctx, t) {
    for (const p of this._particles) {
      const shimmer = 0.7 + 0.3 * Math.sin(p.flicker * 1.4);
      ctx.save();
      ctx.globalAlpha = p.op * shimmer;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*2.2);
      g.addColorStop(0, 'rgba(220,205,165,1)');
      g.addColorStop(1, 'rgba(220,205,165,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r*2.2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  _drawBubbleIndicators(ctx, renderer) {
    const { cam, CW, CH } = renderer;
    const { P } = this;
    const pad = 34;

    this.bubbles.forEach(b => {
      const sx = b.wx - cam.x, sy = b.wy - cam.y;
      if (sx > -b.r && sx < CW+b.r && sy > -b.r && sy < CH+b.r) return;

      const dx = sx - CW/2, dy = sy - CH/2;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const nx = dx/len, ny = dy/len;

      let tMax = Infinity;
      if (nx > 0) tMax = Math.min(tMax, (CW - pad - CW/2) / nx);
      else if (nx < 0) tMax = Math.min(tMax, (pad - CW/2) / nx);
      if (ny > 0) tMax = Math.min(tMax, (CH - pad - CH/2) / ny);
      else if (ny < 0) tMax = Math.min(tMax, (pad - CH/2) / ny);
      const ix = CW/2 + nx*tMax, iy = CH/2 + ny*tMax;

      const wdist = Math.hypot(P.x - b.wx, P.y - b.wy);
      const op    = Math.max(0.15, Math.min(0.68, 800 / wdist));

      ctx.save();
      ctx.translate(ix, iy);
      ctx.globalAlpha = op;

      const glow = ctx.createRadialGradient(0,0,0, 0,0,18);
      glow.addColorStop(0, 'rgba(175,185,185,0.18)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill();

      ctx.rotate(Math.atan2(ny, nx));
      ctx.strokeStyle = 'rgba(188,195,192,0.90)';
      ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-7,-5.5); ctx.lineTo(3,0); ctx.lineTo(-7,5.5); ctx.stroke();

      ctx.rotate(-Math.atan2(ny, nx));
      ctx.font = `400 9px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillStyle = 'rgba(188,195,192,0.88)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.num, 0, -13);
      ctx.restore();
    });
  }

  // ─── Genesis texture: world-space text landscape ────────────────────────────
  // Fragments are placed at fixed world coordinates (4200×3000).
  // The camera follows the player so walking reveals different myth fragments.
  // Dense coverage: ~200 fragments across the world.
  _drawGenesis(ctx, renderer, t, bZ) {
    const { CW, CH, cam } = renderer;

    if (!this._genesisFragments) {
      const raw = [
        // ── Kalevala (Finnish/Karelian) ──
        'Ильматар', 'в первозданных водах', 'утка снесла яйцо',
        'из яйца родился мир', 'нижняя — земля', 'верхняя — небо',
        'желток — солнце', 'белок — луна', 'Вяйнямёйнен',
        'ilmatar', 'väinämöinen', 'louhi', 'sampo', 'kalevala',
        'kantele', 'pohjola', 'vipunen', 'aino', 'kullervo',
        // ── Gilgamesh (Akkadian / Sumerian) ──
        'Гильгамеш', 'бессмертие', 'Утнапиштим', 'на краю мира',
        'трава на дне', 'великий потоп', 'Энкиду', 'кедровый лес',
        'gilgamesh', 'enkidu', 'ishtar', 'anu', 'enlil', 'ea',
        'uruk', 'humbaba', 'siduri', 'urshanabi', 'dilmun',
        // ── Farsi / Persian (Shahnameh, Avesta) ──
        'آب', 'آتش', 'خاک', 'باد',
        'آفرینش', 'زندگی', 'مرگ', 'جاودانگی',
        'اهورا مزدا', 'اهریمن', 'رستم', 'سیمرغ', 'زال',
        'زرتشت', 'اوستا', 'یزدان', 'دیو', 'فرّه',
        // ── Dreamtime (Australian) ──
        'Радужный Змей', 'ползёт по земле', 'русла рек',
        'Время Сновидений', 'предки здесь', 'каждый холм — история',
        'Байаме', 'songline', 'dreaming', 'country', 'altjira',
        'tjukurpa', 'mimi', 'wandjina', 'yolŋu', 'arnhem',
        // ── Northern (Nenets / Evenki / Komi / Saami) ──
        'гагара нырнула', 'достала землю со дна', 'Нум послал птиц',
        'Экшэри', 'первозданный океан', 'шаман Дох', 'мировая ось',
        'земля пьёт воду', 'гагара', 'ворон', 'горностай',
        'Ен и Омöль', 'ялмаль', 'нганасаны', 'луохти',
        // ── English — myth / creation ──
        'before the world was made', 'the waters had no name',
        'the duck laid seven eggs', 'lower half became the earth',
        'the hero sought the plant of life', 'he found it at the bottom',
        'the serpent took it from him', 'he returned empty-handed',
        'the ancestors are still here', 'every hill has a story',
        'the flood came without warning', 'two survivors on the mountain',
        'she floated on the primordial sea', 'the egg broke open',
        'the sky pressed down on the earth', 'a bird brought mud from below',
        'the shaman dove to the bottom', 'the loon retrieved the soil',
        'the fire was stolen from the sun', 'the raven carried it in its beak',
        'the cedar forest was dark and vast', 'they cut down the tallest tree',
        'death is the fate of all mortals', 'when the gods made mankind',
        'the land was singing long before us', 'country knows your name',
        'the rainbow serpent made the rivers', 'the dreaming never ended',
        'origin', 'flood', 'egg', 'dust', 'breath', 'water', 'fire',
        'void', 'first light', 'before time', 'in the beginning',
        'the world was dark', 'nothing moved', 'then a sound',
        // ── Runes / Symbols ──
        'ᛟ', 'ᚢ', 'ᛗ', 'ᚠ', 'ᚱ', 'ᛁ', 'ᛞ', 'ᚨ', 'ᚾ', 'ᛃ',
        '∞', '◈', '⊗', '☽', '☀', '⊕',
        // ── CJK ──
        '水', '火', '土', '風', '空', '天', '地', '龍', '鳥',
        // ── Glitch ──
        '01001110', '11110000', '▓▒░', '////', '_ _ _',
        'error', 'null', 'overflow', 'signal', 'noise',
      ];

      // World dimensions (must match config)
      const WW = 4200, WH = 3000;
      const seed = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

      // Tile the raw texts across the world — repeat to fill ~200 fragments
      const fragments = [];
      let fi = 0;
      while (fragments.length < 210) {
        const text  = raw[fi % raw.length];
        const i     = fi;
        // quadratic size distribution: many small, a few huge
        const sz    = 10 + seed(i * 17) * seed(i * 29) * 90;
        fragments.push({
          text,
          wx:    80  + seed(i * 3)    * (WW - 160),   // world X
          wy:    80  + seed(i * 3 + 1) * (WH - 160),  // world Y
          rot:   (seed(i * 5) - 0.5) * 1.0,
          vrot:  (seed(i * 11) - 0.5) * 0.0005,       // slow drift rotation
          phase: seed(i * 13) * Math.PI * 2,
          size:  sz,
          layer: Math.floor(seed(i * 19) * 3),        // 0=dim 1=mid 2=bright
        });
        fi++;
      }
      this._genesisFragments = fragments;
      this._genT = 0;
    }

    this._genT = (this._genT || 0) + 0.016;
    // slow autonomous rotation only — no positional drift
    for (const f of this._genesisFragments) {
      f.rot += f.vrot;
    }

    ctx.save();
    ctx.globalAlpha = bZ;

    // Full black background
    ctx.fillStyle = 'rgb(0,0,2)';
    ctx.fillRect(0, 0, CW, CH);

    // Glitch scanlines (screen-space, always visible)
    const gs = Math.floor(this._genT * 1.1) % 91;
    for (let g = 0; g < 4; g++) {
      const gy  = ((gs * 41 + g * 109) % 100) / 100 * CH;
      const gh  = 1 + (gs * 7 + g) % 2;
      const gal = 0.08 + ((gs * 17 + g * 31) % 60) / 400;
      ctx.save();
      ctx.globalAlpha = gal * bZ;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(0, gy, CW, gh);
      ctx.restore();
    }

    // World-space text fragments — transform with camera
    const alphaByLayer  = [0.22, 0.52, 0.92];
    const colourByLayer = [
      'rgba(180,185,210,',  // far  — cool muted white
      'rgba(255,242,220,',  // mid  — warm cream
      'rgba(255,255,255,',  // near — pure white
    ];

    // Only draw fragments visible on screen + margin
    const margin = 120;
    for (const f of this._genesisFragments) {
      const sx = f.wx - cam.x;
      const sy = f.wy - cam.y;
      if (sx < -margin || sx > CW + margin || sy < -margin || sy > CH + margin) continue;

      const pulse = 0.5 + 0.5 * Math.sin(this._genT * 0.4 + f.phase);
      const alpha = (alphaByLayer[f.layer] * (0.55 + 0.45 * pulse)) * bZ;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(f.rot);
      ctx.globalAlpha = alpha;
      ctx.font = f.size > 32
        ? `300 ${f.size}px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`
        : `400 ${f.size}px 'Courier New',monospace`;
      ctx.fillStyle    = colourByLayer[f.layer] + '1)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }

    // Vignette — darkens edges, player stays readable in centre
    const vig = ctx.createRadialGradient(CW/2, CH/2, CH * 0.08, CW/2, CH/2, CH * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${bZ * 0.80})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle   = vig;
    ctx.fillRect(0, 0, CW, CH);

    ctx.restore();
  }

  // ─── Intro screen ─────────────────────────────────────────────────────────
  _drawIntro(ctx, renderer) {
    const { CW, CH } = renderer;
    const SANS = `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
    const cx   = CW / 2;

    ctx.save();
    ctx.fillStyle = 'rgb(0,0,0)';
    ctx.fillRect(0, 0, CW, CH);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const W = 'rgba(255,255,255,0.62)';
    ctx.font = `300 11px ${SANS}`;

    // All lines — same font, same colour, same weight
    const rows = [
      ['',      'cosmos',        true],   // [label, key, center]
      ['',      '',              false],  // spacer
      ['move',        'W A S D', false],
      ['enter world', 'Enter',   false],
      ['exit world',  'Esc',     false],
      ['pause',       'Esc  (on map)', false],
      ['',      '',              false],  // spacer
      ['',      'click or press any key', true],
    ];

    let y = CH / 2 - 64;
    for (const [label, key, center] of rows) {
      if (!label && !key) { y += 14; continue; }
      ctx.fillStyle = W;
      if (center) {
        ctx.textAlign = 'center';
        ctx.fillText(key, cx, y);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(label, cx - 14, y);
        ctx.textAlign = 'left';
        ctx.fillText(key, cx + 14, y);
      }
      y += 20;
    }

    ctx.restore();
  }

  _drawBubbleInterior(ctx, renderer, t) {
    const { CW, CH, cam } = renderer;
    const { P } = this;
    const bZ  = this._bubbleZoom;
    const bId = (this._enteredBubble || this._lastEnteredBubble)
              ? (this._enteredBubble || this._lastEnteredBubble).id : 1;

    ctx.save();

    if (bId === 2) {
      // ── Bubble II: kalevala video as walkable floor ──
      ctx.fillStyle = `rgba(0,0,0,${0.92 * bZ})`;
      ctx.fillRect(0, 0, CW, CH);

      const b2e = this._bubbleSpatials[2];
      const el  = b2e && (b2e.videoEl || b2e.approachEl); // videoEl when approach is audio
      if (el && el.readyState >= 2) {
        const b2  = this.bubbles[1];
        const sc  = 1.20;
        const dw  = CW * sc, dh = CH * sc;
        const ox  = -((P.x - b2.wx) * 0.055);
        const oy  = -((P.y - b2.wy) * 0.055);
        const cox = Math.max(-(dw-CW)/2, Math.min((dw-CW)/2, ox));
        const coy = Math.max(-(dh-CH)/2, Math.min((dh-CH)/2, oy));
        ctx.globalAlpha = bZ;
        ctx.drawImage(el, -(dw-CW)/2 + cox, -(dh-CH)/2 + coy, dw, dh);
        ctx.fillStyle = 'rgba(8,5,3,0.30)'; ctx.fillRect(0,0,CW,CH);
      }

      // Footprints + player on video floor
      ctx.globalAlpha = bZ; this._drawFootprints(ctx, renderer);
      ctx.globalAlpha = bZ; this._drawPlayer(ctx, renderer, t);
      ctx.globalAlpha = 1;

      const vig2 = ctx.createRadialGradient(CW/2, CH*1.1, 0, CW/2, CH*1.1, CH*0.9);
      vig2.addColorStop(0, 'rgba(0,0,0,0)');
      vig2.addColorStop(1, `rgba(0,0,0,${bZ * 0.82})`);
      ctx.fillStyle = vig2; ctx.fillRect(0,0,CW,CH);

    } else {
      // ── Bubbles I and III: dark background ──
      ctx.fillStyle = `rgba(0,0,0,${0.92 * bZ})`;
      ctx.fillRect(0, 0, CW, CH);

      if (bId === 1) {
        // ── Bubble I: desert video ──
        const b1e = this._bubbleSpatials[1];
        const el  = b1e && b1e.insideEl;
        // Keep-alive: Chrome may pause offscreen video elements — restart silently if needed
        if (el && el.paused && !el._playPending) {
          el._playPending = true;
          el.play().then(() => { el._playPending = false; }).catch(() => { el._playPending = false; });
        }
        if (el && el.readyState >= 2) {
          const vw = el.videoWidth || 16, vh = el.videoHeight || 9;
          const aspect = vw / vh;
          // Fill screen edge-to-edge (cover), not 90% — avoids dark border + looks cinematic
          let dw, dh;
          if (CW / CH > aspect) { dw = CW; dh = CW / aspect; }
          else                  { dh = CH; dw = CH * aspect; }
          ctx.globalAlpha = bZ;
          ctx.drawImage(el, CW/2-dw/2, CH/2-dh/2, dw, dh);
        }

      } else if (bId === 3) {
        // ── Bubble III: genesis — world-space text, player walks through it ──
        this._drawGenesis(ctx, renderer, t, bZ);
        // Delay-world bonfires
        this._drawDelayFires(ctx, renderer, t, bZ);
        ctx.globalAlpha = bZ;
        this._drawFootprints(ctx, renderer);
        this._drawPlayer(ctx, renderer, t);
        ctx.globalAlpha = 1;
      }
    }

    // World name — large, top-center
    const worldName = (this._enteredBubble || this._lastEnteredBubble)?.name || '';
    if (worldName) {
      const SANS = `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.globalAlpha = bZ * 0.55;
      ctx.font         = `200 84px ${SANS}`;
      ctx.fillStyle    = 'rgba(255,255,255,1)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(worldName.replace(/_/g, ' '), CW / 2, 18);
      ctx.textBaseline = 'middle';
    }

    // exit hint
    ctx.globalAlpha = bZ * 0.25;
    ctx.font = `300 10px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.textAlign = 'center';
    ctx.fillText('esc', CW/2, CH - 18);
    ctx.restore();
  }

  // ─── Delay-world bonfires (world-space, drawn inside bubble III) ────────────
  _drawDelayFires(ctx, renderer, t, bZ) {
    if (!this._delayFirePts || bZ < 0.01) return;
    const { cam, CW, CH } = renderer;
    const { P } = this;
    const margin = 180;

    for (const pt of this._delayFirePts) {
      const sx = pt.wx - cam.x;
      const sy = pt.wy - cam.y;
      // Cull off-screen
      if (sx < -margin || sx > CW + margin || sy < -margin || sy > CH + margin) continue;

      const dist   = Math.hypot(P.x - pt.wx, P.y - pt.wy);
      const active = dist < 320;
      // Use phase offset so each fire flickers independently
      this._drawBonfire(ctx, sx, sy, active, t + Math.floor(pt._phase * 120));
    }
  }

  _drawCulmination(ctx, renderer, t) {
    const { CW, CH } = renderer;
    ctx.save();
    ctx.fillStyle = `rgba(148,162,168,${this._culminationAlpha * 0.05})`;
    ctx.fillRect(0, 0, CW, CH);
    ctx.textAlign = 'center';

    const cfa1 = Math.min(1, (this._culminationTimer -  80) / 120) * this._culminationAlpha;
    if (cfa1 > 0) {
      ctx.globalAlpha = cfa1 * 0.68;
      ctx.font = `300 14px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillText('the circle is complete', CW/2, CH/2 - 24);
    }
    const cfa2 = Math.min(1, (this._culminationTimer - 220) / 120) * this._culminationAlpha;
    if (cfa2 > 0) {
      ctx.globalAlpha = cfa2 * 0.46;
      ctx.font = `400 10px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillStyle = 'rgba(172,180,178,1)';
      ctx.fillText('all portals visited', CW/2, CH/2 - 4);
    }
    const cfa3 = Math.min(1, (this._culminationTimer - 370) / 180) * this._culminationAlpha;
    if (cfa3 > 0) {
      ctx.globalAlpha = cfa3 * 0.30;
      ctx.font = `400 9px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillStyle = 'rgba(155,162,160,1)';
      ctx.fillText('the echo persists', CW/2, CH/2 + 16);
    }
    ctx.restore();
  }

  _drawMinimap(ctx, renderer) {
    const { CW, CH, WW, WH, cam } = renderer;
    const { P } = this;
    const mw = 220, mh = Math.round(220 * WH / WW);
    const mx = 18, my = CH - mh - 48;
    const sx = mw / WW, sy2 = mh / WH;

    ctx.save();

    // Background + border
    ctx.fillStyle   = 'rgba(0,0,0,0.62)';
    ctx.fillRect(mx - 1, my - 1, mw + 2, mh + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(mx, my, mw, mh);

    // Viewport rect
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(mx + cam.x*sx, my + cam.y*sy2, CW*sx, CH*sy2);

    // Bubbles
    const mmPal = ['210,190,160','170,200,222','165,210,158'];
    this.bubbles.forEach(b => {
      const bx      = mx + b.wx*sx, by = my + b.wy*sy2;
      const visited = this._visitedBubbles.has(b.id);
      const mc      = mmPal[b.id - 1];
      const dotR    = visited ? 6 : 4;
      ctx.beginPath(); ctx.arc(bx, by, dotR, 0, Math.PI*2);
      ctx.fillStyle = visited ? `rgba(${mc},0.92)` : `rgba(${mc},0.40)`;
      ctx.fill();
      if (visited) {
        ctx.strokeStyle = `rgba(${mc},0.80)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.font = `500 9px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = visited ? `rgba(255,255,255,0.90)` : `rgba(${mc},0.55)`;
      ctx.fillText(b.num, bx, by - 11);
    });

    // Research points
    this._researchPts.forEach(pt => {
      const rx   = mx + pt.wx*sx, ry = my + pt.wy*sy2;
      const dist = Math.hypot(pt.wx - P.x, pt.wy - P.y);
      const near   = dist < 400;
      const active = dist < 150;
      const r = active ? 4.5 : near ? 3.2 : 2.0;
      if (active) {
        const halo = ctx.createRadialGradient(rx, ry, 0, rx, ry, r*3);
        halo.addColorStop(0, 'rgba(140,255,180,0.55)');
        halo.addColorStop(1, 'rgba(140,255,180,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(rx, ry, r*3, 0, Math.PI*2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI*2);
      ctx.fillStyle = active ? 'rgba(160,255,190,1)' : near ? 'rgba(130,215,165,0.80)' : 'rgba(100,170,130,0.55)';
      ctx.fill();
    });

    // Player dot
    ctx.beginPath(); ctx.arc(mx + P.x*sx, my + P.y*sy2, 4, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
    // Player pulse ring
    ctx.beginPath(); ctx.arc(mx + P.x*sx, my + P.y*sy2, 7, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();

    // Label
    ctx.font = `500 8px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('КАРТА', mx + 4, my + mh + 5);

    ctx.restore();
  }

  // ── Rounded rect path helper ────────────────────────────────────────────────
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}
