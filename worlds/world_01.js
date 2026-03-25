// ─────────────────────────────────────────────────────────────────────────────
//  WorldOne — Desert / Kalevala
//  Весь игровой код первого мира. Рендеринг, физика, аудио — всё здесь.
//  Добавить новый мир = скопировать файл, сменить config + методы draw.
// ─────────────────────────────────────────────────────────────────────────────

import { WorldBase } from './WorldBase.js';

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
      ambient:       './sources/audio/first_level_loop_1.ogg',
      groundTexture: './sources/photo/stone_texture.jpg',

      bubbles: [
        { id: 1, wx: 300,  wy: 300,  r: 62, num: 'I',   ph: 0.0,
          approach:      './sources/audio/bouble_1_loop_1.ogg',
          inside:        './sources/video/desert.mp4',
          insideType:    'video',
          interiorVideo: './sources/video/desert.mp4',
          interiorMode:  'fullscreen' },
        { id: 2, wx: 3900, wy: 300,  r: 62, num: 'II',  ph: 2.09,
          approach:      './sources/video/kalevala_texture.mp4',
          inside:        './sources/audio/kalevala_21_03_26.ogg',
          insideType:    'audio',
          interiorVideo: './sources/video/kalevala_texture.mp4',
          interiorMode:  'floor' },
        { id: 3, wx: 2100, wy: 2700, r: 62, num: 'III', ph: 4.19,
          // No audio defined yet — add when ready:
          // approach:  './sources/audio/bubble3_approach.ogg',
          // inside:    './sources/audio/bubble3_inside.ogg',
          // insideType: 'audio',
        },
      ],

      research: [
        './sources/audio/research/okant_CYL_0456.ogg',
        './sources/audio/research/chants_bathhurst.mp3',
        './sources/audio/research/korobori.ogg',
        './sources/audio/research/bjornsang_CYL_0390.ogg',
        './sources/audio/research/familjefadern_CYL_0327.ogg',
      ],
      nResearchPts: 14,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  onLoad(engine) {
    super.onLoad(engine);       // creates _bubbleSpatials, _researchPts (elements only)
    this._initState(engine);
  }

  onStart(engine) {
    super.onStart(engine);      // boots audio, creates spatial sources, starts ambient
  }

  // ─── Game state init ───────────────────────────────────────────────────────
  _initState(engine) {
    const { renderer: R } = engine;
    const cfg = this.config;

    // ── Player ──
    this.P = {
      x: R.WW / 2, y: R.WH / 2,
      w: 46, h: 60, speed: 1.5,
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

    // ── Visited + culmination ──
    this._visitedBubbles  = new Set();
    this._culminationAlpha = 0;
    this._culminationTimer = -1;

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

    // ── Ground texture ──
    this._stoneImg    = new Image();
    this._stonePat    = null;
    this._stoneImg.src = cfg.groundTexture;
    // fallback extension
    this._stoneImg.onerror = () => {
      const alt = new Image();
      alt.src = cfg.groundTexture.replace('.jpg', '.png');
      alt.onload = () => { this._stoneImg = alt; this._stonePat = null; };
    };
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────
  update(t, input, renderer, audio) {
    const { P, bubbles } = this;
    const { CW, CH, WW, WH } = renderer;

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
        this._enteredBubble = null;
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
            this._visitedBubbles.add(b.id);
            if (this._visitedBubbles.size === 3 && this._culminationTimer < 0)
              this._culminationTimer = 0;
            break;
          }
        }
      }
    }
    if (input.justPressed('Escape')) this._enteredBubble = null;

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
    const actB  = this._enteredBubble || this._lastEnteredBubble;
    const actId = actB ? actB.id : 0;

    const sv = (src, vol) => {
      if (!src) return;
      if (src.gain) src.gain.gain.value = Math.max(0, Math.min(1, vol));
      else if (src.el) src.el.volume = Math.max(0, Math.min(1, vol * 0.9));
    };

    // ── Bubble 1 approach ──
    const b1  = this.bubbles[0];
    const b1e = this._bubbleSpatials[1];
    if (b1e && b1e.approachSrc) {
      const d  = Math.hypot(b1.wx - P.x, b1.wy - P.y);
      const f  = Math.max(0, 1 - d / 1400);
      audio.updatePosition(b1e.approachSrc, b1.wx - P.x, b1.wy - P.y);
      sv(b1e.approachSrc, Math.min(1, f*f*0.92) * (1 - bZ));
    }
    // ── Bubble 1 inside ──
    if (b1e && b1e.insideSrc) {
      audio.updatePosition(b1e.insideSrc, b1.wx - P.x, b1.wy - P.y);
      sv(b1e.insideSrc, actId === 1 ? bZ * 0.92 : 0);
    }

    // ── Bubble 2 approach ──
    const b2  = this.bubbles[1];
    const b2e = this._bubbleSpatials[2];
    if (b2e && b2e.approachSrc) {
      const d  = Math.hypot(b2.wx - P.x, b2.wy - P.y);
      const f  = Math.max(0, 1 - d / 1400);
      audio.updatePosition(b2e.approachSrc, b2.wx - P.x, b2.wy - P.y);
      sv(b2e.approachSrc, Math.min(1, f*f*0.92) * (1 - bZ));
    }
    // ── Bubble 2 inside ──
    if (b2e && b2e.insideSrc) {
      audio.updatePosition(b2e.insideSrc, b2.wx - P.x, b2.wy - P.y);
      sv(b2e.insideSrc, actId === 2 ? bZ * 0.92 : 0);
    }

    // ── Research points ──
    this._researchPts.forEach(pt => {
      if (!pt.src) return;
      const dx = pt.wx - P.x, dy = pt.wy - P.y;
      const d  = Math.hypot(dx, dy);
      const f  = Math.max(0, 1 - d / 400);
      audio.updatePosition(pt.src, dx, dy);
      sv(pt.src, f * f * 0.80 * (1 - bZ));
    });

    // ── Ambient duck when inside bubble ──
    if (this._ambEl) {
      const target = this._enteredBubble ? 0.18 : 0.72;
      this._ambEl.volume += (target - this._ambEl.volume) * 0.04;
    }
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
    if (this._culminationAlpha > 0.01 && this._bubbleZoom < 0.1) {
      this._drawCulmination(ctx, renderer, t);
    }
  }

  // ─── DRAW HUD (outside shake) ──────────────────────────────────────────────
  drawHUD(t, renderer, ctx) {
    const { CW, CH } = renderer;
    const { P } = this;

    if (this._bubbleZoom >= 0.5) return;

    // Minimap
    this._drawMinimap(ctx, renderer);

    // Coordinates + controls
    ctx.save();
    ctx.font = `10px Menlo, 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(158,165,162,0.20)';
    ctx.textAlign = 'left';
    ctx.fillText('C O S M O S', 18, CH - 16);
    const fx = (P.x / renderer.WW).toFixed(3), fy = (P.y / renderer.WH).toFixed(3);
    ctx.fillText(`${fx} · ${fy}`, 18, CH - 30);
    ctx.textAlign = 'right';
    ctx.fillText('W A S D  /  ← ↑ ↓ →', CW - 18, CH - 16);

    // Nearest bubble distance
    let nearest = null, minD = Infinity;
    for (const b of this.bubbles) {
      const d = Math.hypot(P.x - b.wx, P.y - b.wy);
      if (d < minD) { minD = d; nearest = b; }
    }
    if (nearest && minD < 900) {
      ctx.fillStyle = `rgba(175,182,178,${Math.min(0.32, (900-minD)/900*0.32)})`;
      ctx.fillText(`${nearest.num}  ${Math.round(minD)}m`, CW - 18, CH - 30);
    }
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
      ctx.font = `10px Menlo, 'Courier New', monospace`;
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
        const el = b1e && b1e.approachEl;
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

    // ── Clipped interior ──
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.clip();

    // ① Stone base
    const base = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    base.addColorStop(0,    `rgba(${pal.b0},${near ? 0.78 : 0.50})`);
    base.addColorStop(0.62, `rgba(${pal.b1},${near ? 0.86 : 0.60})`);
    base.addColorStop(1,    `rgba(${pal.b2},${near ? 0.96 : 0.75})`);
    ctx.fillStyle = base; ctx.fillRect(sx-r, sy-r, r*2, r*2);

    // ② Video frame
    const entry  = this._bubbleSpatials[b.id];
    const vidEl  = b.id === 1 ? (entry && entry.insideEl)
                 : b.id === 2 ? (entry && entry.approachEl) : null;
    if (vidEl && vidEl.readyState >= 2) {
      const vw = vidEl.videoWidth || 1, vh = vidEl.videoHeight || 1;
      const scale = (r * 2) / Math.min(vw, vh);
      ctx.globalAlpha = near ? 0.70 : 0.45;
      ctx.drawImage(vidEl, sx - vw*scale/2, sy - vh*scale/2, vw*scale, vh*scale);
      ctx.globalAlpha = 1;
    }

    // ③ Mineral patches
    for (let k = 0; k < 7; k++) {
      const ox = (this._sr(b.id*41+k*9)   - 0.5) * r * 1.3;
      const oy = (this._sr(b.id*41+k*9+1) - 0.5) * r * 1.3;
      const pr = (0.06 + this._sr(b.id*41+k*9+2) * 0.16) * r;
      const pa = (0.03 + this._sr(b.id*41+k*9+3) * 0.07) * (near ? 1.6 : 0.9);
      ctx.fillStyle = `rgba(${pal.dm},${pa})`;
      ctx.beginPath(); ctx.arc(sx+ox, sy+oy, pr, 0, Math.PI*2); ctx.fill();
    }

    // ④ Diffuse light
    const diff = ctx.createRadialGradient(sx-r*0.28, sy-r*0.34, 0, sx, sy, r*1.05);
    diff.addColorStop(0,    `rgba(${pal.df},${near ? 0.58 : 0.30})`);
    diff.addColorStop(0.55, `rgba(${pal.dm},${near ? 0.18 : 0.08})`);
    diff.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = diff; ctx.fillRect(sx-r, sy-r, r*2, r*2);

    // ⑤ Specular
    const specX = sx-r*0.28, specY = sy-r*0.33;
    const spec  = ctx.createRadialGradient(specX, specY, 0, specX, specY, r*0.22);
    spec.addColorStop(0,   `rgba(230,238,242,${near ? 0.68 : 0.24})`);
    spec.addColorStop(0.5, `rgba(230,238,242,${near ? 0.10 : 0.03})`);
    spec.addColorStop(1,   'rgba(230,238,242,0)');
    ctx.fillStyle = spec; ctx.fillRect(sx-r, sy-r, r*2, r*2);

    // ⑥ Micro-specular
    const s2x = sx+r*0.20, s2y = sy-r*0.08;
    const sp2  = ctx.createRadialGradient(s2x, s2y, 0, s2x, s2y, r*0.09);
    sp2.addColorStop(0, `rgba(215,228,232,${near ? 0.25 : 0.07})`);
    sp2.addColorStop(1, 'rgba(215,228,232,0)');
    ctx.fillStyle = sp2; ctx.fillRect(sx-r, sy-r, r*2, r*2);

    // ⑦ Rim shadow
    const rim = ctx.createRadialGradient(sx+r*0.22, sy+r*0.28, r*0.50, sx, sy, r);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, `rgba(0,0,0,${near ? 0.55 : 0.32})`);
    ctx.fillStyle = rim; ctx.fillRect(sx-r, sy-r, r*2, r*2);
    ctx.restore();

    // ── Exterior (no clip) ──
    ctx.save();

    // ⑧ Outer ring
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
    ctx.strokeStyle = near ? `rgba(${pal.rng},0.82)` : `rgba(${pal.rng},0.35)`;
    ctx.lineWidth   = near ? 1.4 : 0.8;
    ctx.stroke();

    // ⑨ Growth rings
    ctx.beginPath(); ctx.arc(sx+r*0.05, sy+r*0.04, r*0.70, 0, Math.PI*2);
    ctx.strokeStyle = near ? `rgba(${pal.inn},0.16)` : `rgba(${pal.inn},0.06)`;
    ctx.lineWidth   = 0.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx-r*0.07, sy-r*0.05, r*0.43, 0, Math.PI*2);
    ctx.strokeStyle = near ? `rgba(${pal.inn},0.10)` : `rgba(${pal.inn},0.04)`;
    ctx.stroke();

    // ⑩ Outer halo
    const halo = ctx.createRadialGradient(sx, sy, r*0.75, sx, sy, r*2.4);
    halo.addColorStop(0, `rgba(${pal.halo},${near ? 0.11 : 0.04})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sx, sy, r*2.4, 0, Math.PI*2); ctx.fill();

    // ⑪ Numeral
    const fSz = Math.round(r * 0.42);
    ctx.font         = `300 ${fSz}px Palatino, 'Palatino Linotype', Georgia, serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(0,0,0,0.42)';
    ctx.fillText(b.num, sx+1, sy+1);
    ctx.fillStyle = near ? `rgba(${pal.num_n},0.88)` : `rgba(${pal.num_f},0.38)`;
    ctx.fillText(b.num, sx, sy);

    // ⑫ Entry hint
    if (near) {
      ctx.font      = `11px Menlo, 'Courier New', monospace`;
      ctx.fillStyle = `rgba(${pal.num_f},0.35)`;
      ctx.fillText('[ enter ]', sx, sy + r + 14);
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
      const active = dist < 200;
      const near   = dist < 400;
      this._drawBonfire(ctx, sx, sy, active, t);
      if (active) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - dist / 200) * 0.55;
        ctx.font = `9px Menlo, 'Courier New', monospace`;
        ctx.fillStyle = 'rgba(185,192,188,1)';
        ctx.textAlign = 'center';
        ctx.fillText('◉ recording', sx, sy - 24);
        ctx.restore();
      }
    });
  }

  _drawBonfire(ctx, sx, sy, active, t) {
    ctx.save();
    ctx.translate(sx, sy);

    const flicker = active ? 1 + Math.sin(t * 0.22) * 0.16 + Math.sin(t * 0.37) * 0.09 : 0.5;

    // Ground glow when active
    if (active) {
      ctx.globalAlpha = 0.08 * flicker;
      const g = ctx.createRadialGradient(0, 4, 0, 0, 4, 24);
      g.addColorStop(0, 'rgba(240,220,160,1)');
      g.addColorStop(1, 'rgba(240,200,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 6, 24, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground shadow
    ctx.globalAlpha = 0.28;
    ctx.fillStyle   = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(1, 7, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Three base stones — black fill, white stroke (B&W character style)
    ctx.globalAlpha = 0.90;
    ctx.lineWidth   = 1.1;
    for (let i = 0; i < 3; i++) {
      const a  = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const bx = Math.cos(a) * 6;
      const by = Math.sin(a) * 3.5 + 5;
      ctx.fillStyle   = 'rgba(14,12,8,0.95)';
      ctx.strokeStyle = 'rgba(175,170,158,0.80)';
      ctx.beginPath();
      ctx.ellipse(bx, by, 5, 3.5, a * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Crossed logs — white highlight on black body
    const logCol   = 'rgba(14,12,8,0.95)';
    const logLight = 'rgba(170,165,152,0.70)';
    ctx.lineCap = 'round';
    [Math.PI / 5, -Math.PI / 5].forEach(angle => {
      ctx.save();
      ctx.rotate(angle);
      // thick dark body
      ctx.strokeStyle = logCol;
      ctx.lineWidth   = 3.5;
      ctx.beginPath();
      ctx.moveTo(-9, 5); ctx.lineTo(9, -3);
      ctx.stroke();
      // thin light edge
      ctx.strokeStyle = logLight;
      ctx.lineWidth   = 1.2;
      ctx.stroke();
      ctx.restore();
    });

    // Flame
    const fh = (active ? 10 : 5) * flicker;
    ctx.globalAlpha = active ? 0.88 : 0.35;

    // Outer black flame shape
    ctx.fillStyle = 'rgba(8,6,4,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.bezierCurveTo(-5, -fh * 0.45, -4, -fh * 0.88, 0, -fh - 1);
    ctx.bezierCurveTo(4, -fh * 0.88, 5, -fh * 0.45, 0, 1);
    ctx.fill();

    // White inner flame
    ctx.globalAlpha = active ? 0.80 * flicker : 0.28;
    ctx.fillStyle   = 'rgba(235,228,205,1)';
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.bezierCurveTo(-2.5, -fh * 0.35, -2, -fh * 0.72, 0, -fh * 0.92);
    ctx.bezierCurveTo(2, -fh * 0.72, 2.5, -fh * 0.35, 0, 1);
    ctx.fill();

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
      ctx.font = `9px Palatino, 'Palatino Linotype', Georgia, serif`;
      ctx.fillStyle = 'rgba(188,195,192,0.88)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.num, 0, -13);
      ctx.restore();
    });
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
      const el  = b2e && b2e.approachEl;
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
        if (el && el.readyState >= 2) {
          const vw = el.videoWidth || 16, vh = el.videoHeight || 9;
          const aspect = vw / vh;
          let dw = CW*0.90, dh = dw/aspect;
          if (dh > CH*0.90) { dh = CH*0.90; dw = dh*aspect; }
          ctx.globalAlpha = bZ;
          ctx.drawImage(el, CW/2-dw/2, CH/2-dh/2, dw, dh);
        }

      } else if (bId === 3) {
        // ── Bubble III: ritual rune chamber ──
        ctx.save();
        ctx.globalAlpha = bZ * 0.85;
        const pulse3 = 0.5 + Math.sin(t*0.027)*0.5;
        const fg = ctx.createRadialGradient(CW/2, CH*1.1, 0, CW/2, CH*1.1, CH*0.9);
        fg.addColorStop(0,   `rgba(44,62,22,${pulse3*0.35})`);
        fg.addColorStop(0.4, `rgba(24,38,12,${pulse3*0.18})`);
        fg.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = fg; ctx.fillRect(0,0,CW,CH);
        ctx.translate(CW/2, CH/2);
        const runeSet = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
        [[200,24,t*0.0006,0.12],[140,16,-t*0.0009,0.18],[80,8,t*0.0015,0.28]].forEach(([r,n,rot,alpha]) => {
          for (let i = 0; i < n; i++) {
            const ang = (i/n)*Math.PI*2 + rot;
            ctx.save();
            ctx.translate(Math.cos(ang)*r, Math.sin(ang)*r);
            ctx.rotate(ang + Math.PI/2);
            ctx.font = `300 ${8+r/40}px Palatino, 'Palatino Linotype', Georgia, serif`;
            ctx.fillStyle = `rgba(165,182,160,${alpha*(0.6+0.4*Math.sin(t*0.02+i))})`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(runeSet[i % runeSet.length], 0, 0);
            ctx.restore();
          }
          ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
          ctx.strokeStyle = `rgba(128,148,124,${alpha*0.35})`;
          ctx.lineWidth = 0.5; ctx.stroke();
        });
        ctx.font = `300 ${38+pulse3*8}px Palatino, 'Palatino Linotype', Georgia, serif`;
        ctx.fillStyle = `rgba(185,200,180,${0.50+pulse3*0.22})`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ᛟ', 0, 0);
        ctx.restore();
      }
    }

    // ESC hint
    ctx.globalAlpha = bZ * 0.35;
    ctx.font = `10px Menlo, 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(175,182,180,1)';
    ctx.textAlign = 'center';
    ctx.fillText('[ esc / enter ]', CW/2, CH - 18);
    ctx.restore();
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
      ctx.font = `300 14px Palatino, 'Palatino Linotype', Georgia, serif`;
      ctx.fillStyle = 'rgba(195,202,200,1)';
      ctx.fillText('ᛟ · the circle is complete · ᛟ', CW/2, CH/2 - 24);
    }
    const cfa2 = Math.min(1, (this._culminationTimer - 220) / 120) * this._culminationAlpha;
    if (cfa2 > 0) {
      ctx.globalAlpha = cfa2 * 0.46;
      ctx.font = `10px Menlo, 'Courier New', monospace`;
      ctx.fillStyle = 'rgba(172,180,178,1)';
      ctx.fillText('all portals visited', CW/2, CH/2 - 4);
    }
    const cfa3 = Math.min(1, (this._culminationTimer - 370) / 180) * this._culminationAlpha;
    if (cfa3 > 0) {
      ctx.globalAlpha = cfa3 * 0.30;
      ctx.font = `9px Menlo, 'Courier New', monospace`;
      ctx.fillStyle = 'rgba(155,162,160,1)';
      ctx.fillText('the echo persists', CW/2, CH/2 + 16);
    }
    ctx.restore();
  }

  _drawMinimap(ctx, renderer) {
    const { CW, CH, WW, WH, cam } = renderer;
    const { P } = this;
    const mw = 41, mh = Math.round(41 * WH / WW);
    const mx = CW - mw - 16, my = CH - mh - 16;
    const sx = mw / WW, sy2 = mh / WH;

    ctx.save();
    ctx.fillStyle   = 'rgba(0,0,0,0.48)';
    ctx.strokeStyle = 'rgba(180,162,130,0.22)';
    ctx.lineWidth   = 0.5;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);

    // Viewport rect
    ctx.strokeStyle = 'rgba(180,162,130,0.18)';
    ctx.strokeRect(mx + cam.x*sx, my + cam.y*sy2, CW*sx, CH*sy2);

    // Bubbles
    const mmPal = ['175,158,140','148,165,178','145,168,140'];
    this.bubbles.forEach(b => {
      const bx      = mx + b.wx*sx, by = my + b.wy*sy2;
      const visited = this._visitedBubbles.has(b.id);
      const mc      = mmPal[b.id - 1];
      ctx.beginPath(); ctx.arc(bx, by, visited ? 3.5 : 2.2, 0, Math.PI*2);
      ctx.fillStyle = visited ? `rgba(${mc},0.82)` : `rgba(${mc},0.35)`;
      ctx.fill();
      if (visited) { ctx.strokeStyle = `rgba(${mc},0.55)`; ctx.lineWidth = 0.7; ctx.stroke(); }
      ctx.font = `6px Palatino, 'Palatino Linotype', Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = visited ? `rgba(${mc},0.75)` : `rgba(${mc},0.38)`;
      ctx.fillText(b.num, bx, by - 7);
    });

    // Research points
    this._researchPts.forEach(pt => {
      const rx   = mx + pt.wx*sx, ry = my + pt.wy*sy2;
      const dist = Math.hypot(pt.wx - P.x, pt.wy - P.y);
      const near   = dist < 400;
      const active = dist < 150;
      const r = active ? 2.8 : near ? 2.0 : 1.4;
      if (active) {
        const halo = ctx.createRadialGradient(rx, ry, 0, rx, ry, r*2.5);
        halo.addColorStop(0, 'rgba(140,240,180,0.45)');
        halo.addColorStop(1, 'rgba(140,240,180,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(rx, ry, r*2.5, 0, Math.PI*2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI*2);
      ctx.fillStyle = active ? 'rgba(160,255,190,0.95)' : near ? 'rgba(130,210,160,0.70)' : 'rgba(90,150,120,0.45)';
      ctx.fill();
    });

    // Player dot
    ctx.beginPath(); ctx.arc(mx + P.x*sx, my + P.y*sy2, 2.5, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(240,232,205,0.92)'; ctx.fill();
    ctx.restore();
  }
}
