// ─────────────────────────────────────────────────────────────────────────────
//  WorldOne — Desert / Kalevala
//  All game logic for world 1: rendering, physics, audio, composition mechanic.
//  To add a new world: copy this file, change config + draw methods.
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

// ─── Sphere palettes ──────────────────────────────────────────────────────────
const BUBBLE_PALETTES = [
  { b0:'88,70,50',  b1:'40,30,18',  b2:'12,8,4',
    df:'195,188,175', dm:'112,106,96',
    rng:'185,172,155', inn:'110,100,85',
    halo:'118,108,92', num_n:'222,215,205', num_f:'148,138,122' },
  { b0:'50,66,78',  b1:'24,34,46',  b2:'7,11,18',
    df:'182,192,205', dm:'105,115,128',
    rng:'168,182,198', inn:'100,115,135',
    halo:'98,115,135', num_n:'208,218,228', num_f:'128,145,162' },
  { b0:'44,62,44',  b1:'20,34,20',  b2:'6,12,6',
    df:'182,196,178', dm:'106,122,102',
    rng:'162,182,158', inn:'96,118,92',
    halo:'88,118,82', num_n:'205,222,200', num_f:'122,148,118' },
];

// ─── Stone / rune positions (seeded) ─────────────────────────────────────────
function seededRandom(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const STONES = Array.from({ length: 38 }, (_, i) => ({
  x: 200 + seededRandom(i * 7 + 1) * 3800,
  y: 200 + seededRandom(i * 7 + 2) * 2600,
  s: 18 + seededRandom(i * 7 + 3) * 38,
  a: seededRandom(i * 7 + 4) * Math.PI,
  t: seededRandom(i * 7 + 5) < 0.38 ? 'rune' : 'stone',
  li: Math.floor(seededRandom(i * 7 + 6) * LORE_TEXTS.length),
}));

export class WorldOne extends WorldBase {
  // ── Config ─────────────────────────────────────────────────────────────────
  get config() {
    return {
      width:  4200,
      height: 3000,
      ambient: './sources/audio/ambient_loop.ogg',
      groundTexture: './sources/photo/ground.jpg',
      bubbles: [
        {
          id: 1, wx: 900,  wy: 700,  r: 72, num: 'I',
          approach:       './sources/audio/bubble_01_approach.ogg',
          inside:         './sources/audio/bubble_01_inside.ogg',
          compositionSrc: './sources/audio/bubble_01_inside.ogg',
        },
        {
          id: 2, wx: 2800, wy: 1400, r: 80, num: 'II',
          approach:       './sources/audio/bubble_02_approach.ogg',
          inside:         './sources/audio/bubble_02_inside.ogg',
          compositionSrc: './sources/audio/bubble_02_inside.ogg',
        },
        {
          id: 3, wx: 1600, wy: 2400, r: 68, num: 'III',
          approach:       './sources/audio/bubble_03_approach.ogg',
          inside:         './sources/audio/bubble_03_inside.ogg',
          compositionSrc: './sources/audio/bubble_03_inside.ogg',
          interiorMode:   'forest',
        },
      ],
      research:     ['./sources/audio/research_01.ogg',
                     './sources/audio/research_02.ogg'],
      nResearchPts: 14,
    };
  }

  // ── Constructor ────────────────────────────────────────────────────────────
  constructor() {
    super();
    // Player
    this._px = 2100; this._py = 1500;
    this._vx = 0;    this._vy = 0;
    this._facing = 0; // radians
    this._trail = [];

    // Bubble state
    this._bubbleState = {};    // id → { visited, inside, flashAlpha, approachVol, insideVol }
    this._visitOrder  = [];    // [bubbleId, ...] in visit order
    this._activeBubble = null;

    // Iris / transition
    this._iris = { open: false, alpha: 0, progress: 0 };

    // Interior
    this._interiorT = 0;

    // Research
    this._collectedResearch = new Set();

    // Composition layers
    this._compositionLayers = [];

    // Texture
    this._groundPattern = null;
    this._groundImg = null;
    this._groundReady = false;

    // Mobile touch
    this._touchVx = 0;
    this._touchVy = 0;
    this._joystickActive = false;

    // HUD
    this._coordText = '';
    this._nearLabel = '';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onLoad(engine) {
    super.onLoad(engine);

    // Init bubble states
    this.config.bubbles.forEach(b => {
      this._bubbleState[b.id] = {
        visited: false, inside: false,
        flashAlpha: 0, approachVol: 0, insideVol: 0,
        runeAlpha: 0,
      };
    });

    // Load ground texture
    if (this.config.groundTexture) {
      const img = new Image();
      img.onload = () => { this._groundImg = img; this._groundReady = true; };
      img.src = this.config.groundTexture;
    }

    // Mobile controls
    this._setupMobileControls();
  }

  onStart(engine) {
    super.onStart(engine);
  }

  // ── Mobile joystick ────────────────────────────────────────────────────────
  _setupMobileControls() {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!hasTouch) return;

    const ovl = document.createElement('div');
    ovl.style.cssText = `
      position:fixed; inset:0; pointer-events:none; z-index:20;
      font-family: Georgia, Palatino, serif;
    `;

    // Joystick zone
    const jZone = document.createElement('div');
    jZone.style.cssText = `
      position:absolute; bottom:24px; left:24px;
      width:110px; height:110px; border-radius:50%;
      background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18);
      pointer-events:all; touch-action:none;
    `;
    const jKnob = document.createElement('div');
    jKnob.style.cssText = `
      position:absolute; top:50%; left:50%;
      width:38px; height:38px; margin:-19px 0 0 -19px;
      border-radius:50%; background:rgba(255,255,255,0.22);
      border:1px solid rgba(255,255,255,0.40);
      transition: transform 0.05s;
    `;
    jZone.appendChild(jKnob);

    let jOriginX = 0, jOriginY = 0;
    const jR = 36;

    jZone.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.targetTouches[0];
      const rect = jZone.getBoundingClientRect();
      jOriginX = rect.left + rect.width / 2;
      jOriginY = rect.top + rect.height / 2;
      this._joystickActive = true;
    }, { passive: false });

    jZone.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.targetTouches[0];
      let dx = t.clientX - jOriginX;
      let dy = t.clientY - jOriginY;
      const dist = Math.hypot(dx, dy);
      if (dist > jR) { dx = dx/dist*jR; dy = dy/dist*jR; }
      jKnob.style.transform = `translate(${dx}px,${dy}px)`;
      this._touchVx = dx / jR;
      this._touchVy = dy / jR;
    }, { passive: false });

    const jEnd = () => {
      this._touchVx = 0; this._touchVy = 0;
      this._joystickActive = false;
      jKnob.style.transform = '';
    };
    jZone.addEventListener('touchend', jEnd);
    jZone.addEventListener('touchcancel', jEnd);

    // Enter button
    const enterBtn = document.createElement('div');
    enterBtn.textContent = 'ENTER';
    enterBtn.style.cssText = `
      position:absolute; bottom:40px; right:24px;
      width:72px; height:72px; border-radius:50%;
      background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.25);
      display:flex; align-items:center; justify-content:center;
      color:rgba(255,255,255,0.55); font-size:9px; letter-spacing:0.2em;
      pointer-events:all; touch-action:none; user-select:none;
    `;
    enterBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }, { passive: false });
    enterBtn.addEventListener('touchend', e => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    }, { passive: false });

    ovl.appendChild(jZone);
    ovl.appendChild(enterBtn);
    document.body.appendChild(ovl);
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update(t, input, renderer, audio) {
    if (this._activeBubble) {
      this._updateInterior(t, input, renderer, audio);
      return;
    }
    this._updateWorld(t, input, renderer, audio);
  }

  _updateWorld(t, input, renderer, audio) {
    const SPEED = 3.2;
    const kbd = input.movement();
    let mvx = kbd.vx + this._touchVx;
    let mvy = kbd.vy + this._touchVy;
    const mag = Math.hypot(mvx, mvy);
    if (mag > 1) { mvx /= mag; mvy /= mag; }

    const nx = this._px + mvx * SPEED;
    const ny = this._py + mvy * SPEED;
    this._px = Math.max(60, Math.min(this.config.width  - 60, nx));
    this._py = Math.max(60, Math.min(this.config.height - 60, ny));

    if (mag > 0.1) {
      this._facing = Math.atan2(mvy, mvx);
      this._trail.push({ x: this._px, y: this._py, a: 1 });
    }
    if (this._trail.length > 120) this._trail.shift();
    this._trail.forEach(p => { p.a -= 0.012; });

    // Camera
    renderer.followTarget(this._px, this._py);

    // Coord label
    this._coordText = `${Math.round(this._px)} · ${Math.round(this._py)}`;

    // ── Bubble audio + enter ─────────────────────────────────────────────────
    this._nearLabel = '';
    this.config.bubbles.forEach((b, idx) => {
      const st = this._bubbleState[b.id];
      const entry = this._bubbleSpatials[b.id];
      const dist = Math.hypot(this._px - b.wx, this._py - b.wy);
      const pal = BUBBLE_PALETTES[idx % BUBBLE_PALETTES.length];

      // Approach audio volume
      const APPROACH_FADE = 380;
      const APPROACH_MAX  = b.r + 90;
      if (entry && entry.approachSrc) {
        const vol = dist < APPROACH_FADE
          ? Math.max(0, 1 - (dist - APPROACH_MAX) / (APPROACH_FADE - APPROACH_MAX))
          : 0;
        entry.approachSrc.fadeTo(Math.max(0, Math.min(0.9, vol)), 0.12);
        if (entry.approachSrc.panner) {
          audio.updatePosition(entry.approachSrc, this._px - b.wx, this._py - b.wy);
        }
      }

      // Enter prompt
      if (dist < b.r + 20) {
        this._nearLabel = `[ ENTER ] — world ${b.num}`;
      }

      // Enter trigger
      if (dist < b.r + 20 && input.justPressed('Enter')) {
        this._enterBubble(b, audio);
      }

      // Rune pulse near bubble
      st.runeAlpha = Math.max(0, 1 - dist / 400);
    });

    // ── Research points audio ─────────────────────────────────────────────────
    this._researchPts.forEach((pt, i) => {
      if (!pt.src) return;
      const dist = Math.hypot(this._px - pt.wx, this._py - pt.wy);
      const maxDist = 480;
      const vol = Math.max(0, 1 - dist / maxDist);
      pt.src.fadeTo(vol * 0.55, 0.10);
      if (pt.src.panner) {
        audio.updatePosition(pt.src, this._px - pt.wx, this._py - pt.wy);
      }
      // Collect if close
      if (dist < 42 && !this._collectedResearch.has(i)) {
        this._collectedResearch.add(i);
        renderer.shakeMag = 4;
      }
    });

    // ── Composition layer spatial update ──────────────────────────────────────
    // Layers follow the player (non-spatial) — just keep them alive
  }

  _updateInterior(t, input, renderer, audio) {
    this._interiorT++;

    // ESC exits
    if (input.justPressed('Escape')) {
      this._exitBubble(audio);
      return;
    }

    // Fade iris open
    if (!this._iris.open) {
      this._iris.progress = Math.min(1, this._iris.progress + 0.025);
      if (this._iris.progress >= 1) this._iris.open = true;
    }
  }

  // ── Bubble enter / exit ─────────────────────────────────────────────────────
  _enterBubble(b, audio) {
    const st = this._bubbleState[b.id];
    this._activeBubble = b;
    this._iris = { open: false, alpha: 1, progress: 0 };
    this._interiorT = 0;

    // Inside audio
    const entry = this._bubbleSpatials[b.id];
    if (entry && entry.insideSrc) {
      entry.insideSrc.fadeTo(0.85, 0.8);
      if (entry.insideSrc.panner) {
        // centre in listener space
        entry.insideSrc.panner.positionX && (entry.insideSrc.panner.positionX.value = 0);
        entry.insideSrc.panner.positionZ && (entry.insideSrc.panner.positionZ.value = -1);
      }
    }
    // Dim approach
    if (entry && entry.approachSrc) entry.approachSrc.fadeTo(0, 0.6);

    // First visit → composition layer
    if (!st.visited) {
      st.visited = true;
      const order = this._visitOrder.length;
      this._visitOrder.push(b.id);
      this._addCompositionLayer(b, order, audio);
    }
  }

  _exitBubble(audio) {
    const b = this._activeBubble;
    if (!b) return;
    const entry = this._bubbleSpatials[b.id];
    if (entry && entry.insideSrc) entry.insideSrc.fadeTo(0, 0.6);
    this._activeBubble = null;
    this._iris = { open: false, alpha: 0, progress: 0 };
  }

  // ── Composition layer ───────────────────────────────────────────────────────
  _addCompositionLayer(b, order, audio) {
    if (!b.compositionSrc || !audio.AC) return;
    const el = new Audio();
    el.src         = b.compositionSrc;
    el.loop        = true;
    el.crossOrigin = 'anonymous';
    el.playbackRate = Math.max(0.5, 1.0 - order * 0.08); // 1.0, 0.92, 0.84

    let node;
    try {
      node = audio.AC.createMediaElementSource(el);
    } catch(e) {
      console.warn('[Composition] createMediaElementSource failed:', e);
      return;
    }

    const gain = audio.AC.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(audio.masterG);

    el.play().catch(() => {});

    const targetVol = 0.06 + order * 0.025;
    const now = audio.AC.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(targetVol, now + 5.0);

    this._compositionLayers.push({ el, gain, bubbleId: b.id, order, targetVol });
    console.log(`[Composition] layer added — bubble ${b.id}, order ${order}, rate ${el.playbackRate}`);
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  draw(t, renderer, ctx, audio) {
    if (this._activeBubble) {
      this._drawInterior(t, renderer, ctx);
      return;
    }
    this._drawWorld(t, renderer, ctx);
  }

  _drawWorld(t, renderer, ctx) {
    const { CW, CH } = renderer;

    // Ground
    this._drawGround(renderer, ctx);

    // Noise
    renderer.drawNoise();

    // Stones / lore
    this._drawStones(renderer, ctx, t);

    // Research bonfires
    this._drawResearchPoints(ctx, renderer, t);

    // Trail
    this._drawTrail(ctx, renderer);

    // Player
    this._drawPlayer(ctx, renderer, t);

    // Bubbles
    this._drawBubbles(ctx, renderer, t);

    // Bubble bleed
    this._drawBubbleBleed(ctx, renderer, t);

    // World edge fog
    renderer.drawWorldEdgeFog(this._px, this._py);

    // Vignette
    renderer.drawVignette(0.25, 0.85, 0.40);
  }

  // ── Ground ─────────────────────────────────────────────────────────────────
  _drawGround(renderer, ctx) {
    const { CW, CH } = renderer;
    ctx.fillStyle = '#1a1610';
    ctx.fillRect(0, 0, CW, CH);

    if (this._groundReady && this._groundImg) {
      if (!this._groundPattern) {
        this._groundPattern = ctx.createPattern(this._groundImg, 'repeat');
      }
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.translate(-renderer.cam.x % this._groundImg.width, -renderer.cam.y % this._groundImg.height);
      ctx.fillStyle = this._groundPattern;
      ctx.fillRect(0, 0, CW + this._groundImg.width, CH + this._groundImg.height);
      ctx.restore();
    }
  }

  // ── Stones ─────────────────────────────────────────────────────────────────
  _drawStones(renderer, ctx, t) {
    STONES.forEach(s => {
      const sc = renderer.toScreen(s.x, s.y);
      if (sc.x < -80 || sc.x > renderer.CW + 80 || sc.y < -80 || sc.y > renderer.CH + 80) return;

      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(s.a);

      if (s.t === 'rune') {
        // Rune stone — slightly glowing
        ctx.globalAlpha = 0.60;
        ctx.fillStyle   = '#2a2620';
        ctx.strokeStyle = 'rgba(200,195,185,0.35)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, s.s * 0.55, s.s * 0.8, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Rune symbol
        ctx.globalAlpha = 0.45;
        ctx.fillStyle   = 'rgba(210,200,180,1)';
        ctx.font        = `${Math.round(s.s * 0.6)}px Georgia, serif`;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
        ctx.fillText(runes[s.li % runes.length], 0, 0);

        // Lore text when near
        const dist = Math.hypot(this._px - s.x, this._py - s.y);
        if (dist < 220) {
          const fade = Math.max(0, 1 - dist / 220);
          ctx.globalAlpha = fade * 0.70;
          ctx.rotate(-s.a); // upright
          ctx.font        = '9px Georgia, serif';
          ctx.fillStyle   = 'rgba(210,200,180,1)';
          ctx.letterSpacing = '0.12em';
          ctx.fillText(LORE_TEXTS[s.li], 0, -s.s - 12);
        }
      } else {
        // Plain stone
        ctx.globalAlpha = 0.45;
        ctx.fillStyle   = '#252018';
        ctx.strokeStyle = 'rgba(160,155,145,0.20)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, s.s * 0.5, s.s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }

      ctx.restore();
    });
  }

  // ── Research bonfires ───────────────────────────────────────────────────────
  _drawResearchPoints(ctx, renderer, t) {
    this._researchPts.forEach((pt, i) => {
      const sc = renderer.toScreen(pt.wx, pt.wy);
      if (sc.x < -60 || sc.x > renderer.CW + 60 || sc.y < -60 || sc.y > renderer.CH + 60) return;

      const dist = Math.hypot(this._px - pt.wx, this._py - pt.wy);
      const collected = this._collectedResearch.has(i);
      const near = dist < 160;
      this._drawBonfire(ctx, sc.x, sc.y, near && !collected, collected, t);

      if (near && !collected) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - dist / 160) * 0.80;
        ctx.font = '9px Georgia, serif';
        ctx.fillStyle = 'rgba(230,220,200,1)';
        ctx.textAlign = 'center';
        ctx.fillText('◉ field recording', sc.x, sc.y - 28);
        ctx.restore();
      }
    });
  }

  _drawBonfire(ctx, sx, sy, active, collected, t) {
    ctx.save();
    ctx.translate(sx, sy);

    if (collected) {
      // Ash — just grey stones
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = '#888';
      ctx.lineWidth   = 1;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 7, Math.sin(a) * 4 + 2, 4, 3, a, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const flicker = active ? 1 + Math.sin(t * 0.22) * 0.18 : 0.6;

    // Ground glow
    if (active) {
      ctx.globalAlpha = 0.10 * flicker;
      const g = ctx.createRadialGradient(0, 4, 0, 0, 4, 22);
      g.addColorStop(0, 'rgba(255,240,180,1)');
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 6, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Base stones — black fill, white outline (B&W style)
    ctx.globalAlpha = 0.90;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle   = '#111';
    ctx.lineWidth   = 1.2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const bx = Math.cos(a) * 7;
      const by = Math.sin(a) * 4 + 4;
      ctx.beginPath();
      ctx.ellipse(bx, by, 5, 3.5, a * 0.4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // Crossed logs
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle   = '#111';

    ctx.save();
    ctx.rotate(Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(-9, 6); ctx.lineTo(9, -6);
    ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#ccc'; ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(-9, 6); ctx.lineTo(9, -6);
    ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#ccc'; ctx.stroke();
    ctx.restore();

    // Flame — black outer, white inner
    const fh = 10 * flicker;
    ctx.globalAlpha = active ? 0.90 : 0.40;

    // Outer black flame
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(-5, -fh * 0.5, -4, -fh * 0.9, 0, -fh - 2);
    ctx.bezierCurveTo(4, -fh * 0.9, 5, -fh * 0.5, 0, -1);
    ctx.fill();

    // White inner flame
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = active ? 0.85 * flicker : 0.30;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-2.5, -fh * 0.4, -2, -fh * 0.75, 0, -fh * 0.95);
    ctx.bezierCurveTo(2, -fh * 0.75, 2.5, -fh * 0.4, 0, 0);
    ctx.fill();

    ctx.restore();
  }

  // ── Trail ───────────────────────────────────────────────────────────────────
  _drawTrail(ctx, renderer) {
    if (this._trail.length < 2) return;
    ctx.save();
    this._trail.forEach((p, i) => {
      if (i === 0) return;
      const a = p.a;
      if (a <= 0) return;
      const sp = renderer.toScreen(p.x, p.y);
      ctx.globalAlpha = a * 0.18;
      ctx.fillStyle = 'rgba(200,192,178,1)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // ── Player character (B&W linework) ─────────────────────────────────────────
  _drawPlayer(ctx, renderer, t) {
    const sc = renderer.toScreen(this._px, this._py);
    ctx.save();
    ctx.translate(sc.x, sc.y);
    ctx.rotate(this._facing + Math.PI / 2);

    const bob = Math.sin(t * 0.14) * 1.5;

    // Shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 12, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    // Cloak / body — black filled, white outline
    ctx.fillStyle   = '#0a0a0a';
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, bob - 18);
    ctx.bezierCurveTo(9, bob - 10, 11, 4, 7, 13);
    ctx.lineTo(0, 10); ctx.lineTo(-7, 13);
    ctx.bezierCurveTo(-11, 4, -9, bob - 10, 0, bob - 18);
    ctx.fill(); ctx.stroke();

    // Head
    ctx.fillStyle   = '#111';
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.ellipse(0, bob - 22, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Hood seam
    ctx.beginPath();
    ctx.moveTo(-5, bob - 26);
    ctx.quadraticCurveTo(0, bob - 30, 5, bob - 26);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.70;
    ctx.beginPath();
    ctx.ellipse(-2.2, bob - 23, 1.2, 1, 0, 0, Math.PI * 2);
    ctx.ellipse( 2.2, bob - 23, 1.2, 1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Bubbles ─────────────────────────────────────────────────────────────────
  _drawBubbles(ctx, renderer, t) {
    this.config.bubbles.forEach((b, idx) => {
      const sc = renderer.toScreen(b.wx, b.wy);
      const pal = BUBBLE_PALETTES[idx % BUBBLE_PALETTES.length];
      const st  = this._bubbleState[b.id];
      const dist = Math.hypot(this._px - b.wx, this._py - b.wy);

      if (sc.x < -b.r - 40 || sc.x > renderer.CW + b.r + 40) return;
      if (sc.y < -b.r - 40 || sc.y > renderer.CH + b.r + 40) return;

      const pulse = 1 + Math.sin(t * 0.03 + idx * 1.2) * 0.012;
      const R = b.r * pulse;

      // Halo (visited)
      if (st.visited) {
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(t * 0.04) * 0.06;
        const hg = ctx.createRadialGradient(sc.x, sc.y, R * 0.85, sc.x, sc.y, R * 1.35);
        hg.addColorStop(0, `rgba(${pal.halo},0.7)`);
        hg.addColorStop(1, `rgba(${pal.halo},0)`);
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, R * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sphere body
      ctx.save();
      const sg = ctx.createRadialGradient(sc.x - R*0.28, sc.y - R*0.32, R*0.05,
                                           sc.x, sc.y, R);
      sg.addColorStop(0,   `rgba(${pal.b0},0.92)`);
      sg.addColorStop(0.5, `rgba(${pal.b1},0.88)`);
      sg.addColorStop(1,   `rgba(${pal.b2},0.95)`);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, R, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = `rgba(${pal.rng},0.45)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, R, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glow
      const ig = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, R * 0.7);
      ig.addColorStop(0, `rgba(${pal.inn},0.20)`);
      ig.addColorStop(1, `rgba(${pal.inn},0)`);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, R * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Number
      ctx.globalAlpha = dist < b.r + 180 ? 0.80 : 0.45;
      ctx.font = `italic ${Math.round(R * 0.38)}px Georgia, Palatino, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${st.visited ? pal.num_f : pal.num_n},1)`;
      ctx.fillText(b.num, sc.x, sc.y);

      ctx.restore();
    });
  }

  // ── Bubble bleed (approach glow on ground) ──────────────────────────────────
  _drawBubbleBleed(ctx, renderer, t) {
    this.config.bubbles.forEach((b, idx) => {
      const dist = Math.hypot(this._px - b.wx, this._py - b.wy);
      if (dist > b.r + 320) return;
      const sc = renderer.toScreen(b.wx, b.wy);
      const pal = BUBBLE_PALETTES[idx % BUBBLE_PALETTES.length];
      const fade = Math.max(0, 1 - (dist - b.r) / 320);
      ctx.save();
      ctx.globalAlpha = fade * 0.08;
      const bg = ctx.createRadialGradient(sc.x, sc.y, b.r, sc.x, sc.y, b.r + 200);
      bg.addColorStop(0, `rgba(${pal.b0},1)`);
      bg.addColorStop(1, `rgba(${pal.b0},0)`);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, b.r + 200, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── Interior drawing ─────────────────────────────────────────────────────────
  _drawInterior(t, renderer, ctx) {
    const b = this._activeBubble;
    const { CW, CH } = renderer;
    const idx = this.config.bubbles.findIndex(x => x.id === b.id);
    const pal = BUBBLE_PALETTES[idx % BUBBLE_PALETTES.length];

    // Background
    const bg = ctx.createRadialGradient(CW/2, CH/2, 0, CW/2, CH/2, Math.max(CW, CH));
    bg.addColorStop(0, `rgba(${pal.b1},1)`);
    bg.addColorStop(1, `rgba(${pal.b2},1)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    // Forest interior (bubble III)
    if (b.interiorMode === 'forest') {
      this._drawForestInterior(ctx, CW, CH, t, pal);
    } else {
      this._drawDefaultInterior(ctx, CW, CH, t, pal, idx);
    }

    // Iris wipe
    if (!this._iris.open) {
      const p = this._iris.progress;
      const maxR = Math.hypot(CW, CH) * 0.6;
      const r = p * maxR;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(CW/2, CH/2, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
      ctx.restore();

      // Black overlay for mask
      if (p < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CW, CH);
        ctx.restore();
      }
    }

    // Noise + vignette
    renderer.drawNoise();
    renderer.drawVignette(0.2, 0.9, 0.50);

    // ESC hint
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.font = '9px Georgia, serif';
    ctx.fillStyle = `rgba(${pal.num_n},1)`;
    ctx.textAlign = 'right';
    ctx.letterSpacing = '0.20em';
    ctx.fillText('[ ESC ] EXIT', CW - 18, CH - 16);
    ctx.restore();
  }

  _drawDefaultInterior(ctx, CW, CH, t, pal, idx) {
    // Rune rings
    const cx = CW / 2, cy = CH / 2;
    for (let r = 0; r < 3; r++) {
      const radius = 90 + r * 60;
      const rot = t * (r % 2 === 0 ? 0.003 : -0.002) + idx;
      ctx.save();
      ctx.globalAlpha = 0.18 - r * 0.04;
      ctx.strokeStyle = `rgba(${pal.rng},1)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Rune marks on ring
      const nRunes = 8 + r * 4;
      const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
      ctx.font = `${10 - r}px Georgia, serif`;
      ctx.fillStyle = `rgba(${pal.num_n},1)`;
      ctx.globalAlpha = 0.30 - r * 0.06;
      for (let i = 0; i < nRunes; i++) {
        const a = (i / nRunes) * Math.PI * 2 + rot;
        const rx = cx + Math.cos(a) * radius;
        const ry = cy + Math.sin(a) * radius;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(a + Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(runes[(i + idx * 3) % runes.length], 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    // Centre symbol
    ctx.save();
    ctx.globalAlpha = 0.60;
    ctx.font = `italic 42px Georgia, Palatino, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${pal.num_n},1)`;
    const syms = ['ᛟ', 'ᚨ', 'ᚠ'];
    ctx.fillText(syms[idx % syms.length], cx, cy);
    ctx.restore();
  }

  _drawForestInterior(ctx, CW, CH, t, pal) {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, CH * 0.6);
    sky.addColorStop(0, `rgba(${pal.b2},1)`);
    sky.addColorStop(1, `rgba(${pal.b1},1)`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CW, CH * 0.6);

    // Ground
    ctx.fillStyle = `rgba(${pal.b0},0.6)`;
    ctx.fillRect(0, CH * 0.6, CW, CH * 0.4);

    // Swaying grass blades
    const nBlades = 60;
    for (let i = 0; i < nBlades; i++) {
      const bx = (i / nBlades) * CW + seededRandom(i * 3 + 1) * (CW / nBlades);
      const by = CH * 0.60 + seededRandom(i * 3 + 2) * CH * 0.15;
      const bh = 18 + seededRandom(i * 3 + 3) * 38;
      const sway = Math.sin(t * 0.022 + i * 0.7) * 8;

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = `rgba(${pal.rng},1)`;
      ctx.lineWidth = 0.8 + seededRandom(i * 3) * 1.0;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + sway * 0.5, by - bh * 0.5,
                            bx + sway, by - bh);
      ctx.stroke();
      ctx.restore();
    }

    // Green rune rings
    const cx = CW / 2, cy = CH * 0.45;
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let r = 0; r < 2; r++) {
      const radius = 70 + r * 55;
      const rot = t * (r === 0 ? 0.004 : -0.003);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = `rgba(${pal.rng},1)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      const nR = 10 + r * 4;
      ctx.font = '9px Georgia, serif';
      ctx.fillStyle = `rgba(${pal.num_n},1)`;
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < nR; i++) {
        const a = (i / nR) * Math.PI * 2 + rot;
        const rx = cx + Math.cos(a) * radius;
        const ry = cy + Math.sin(a) * radius;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(a + Math.PI / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(runes[(i * 3 + r * 7) % runes.length], 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    // Bird silhouettes (placeholder)
    const nBirds = 4;
    for (let i = 0; i < nBirds; i++) {
      const bx = CW * 0.15 + seededRandom(i * 5 + 10) * CW * 0.70
                 + Math.sin(t * 0.008 + i * 2.1) * 30;
      const by = CH * 0.10 + seededRandom(i * 5 + 11) * CH * 0.28
                 + Math.sin(t * 0.006 + i * 1.3) * 12;
      const wing = Math.sin(t * 0.12 + i * 1.1) * 4;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = `rgba(${pal.num_n},1)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - 6, by + wing);
      ctx.quadraticCurveTo(bx, by, bx + 6, by + wing);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  drawHUD(t, renderer, ctx) {
    if (this._activeBubble) return; // interior has its own HUD hints

    this._drawMinimap(ctx, renderer, t);
    this._drawCoords(ctx, renderer);
    this._drawNearLabel(ctx, renderer);
    this._drawCompositionIndicator(ctx, renderer, t);
  }

  _drawMinimap(ctx, renderer, t) {
    const MW = 82, MH = 58;
    const MX = renderer.CW - MW - 14;
    const MY = renderer.CH - MH - 14;
    const scaleX = MW / this.config.width;
    const scaleY = MH / this.config.height;

    ctx.save();

    // Background
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#0c0b09';
    ctx.strokeStyle = 'rgba(200,195,185,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(MX, MY, MW, MH);
    ctx.fill(); ctx.stroke();

    ctx.globalAlpha = 1;

    // Research bonfires
    this._researchPts.forEach((pt, i) => {
      const mx = MX + pt.wx * scaleX;
      const my = MY + pt.wy * scaleY;
      const col = this._collectedResearch.has(i);
      ctx.globalAlpha = col ? 0.25 : 0.70;
      ctx.fillStyle = col ? '#555' : '#eee';
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    });

    // Bubbles
    this.config.bubbles.forEach((b, idx) => {
      const mx = MX + b.wx * scaleX;
      const my = MY + b.wy * scaleY;
      const pal = BUBBLE_PALETTES[idx % BUBBLE_PALETTES.length];
      const st  = this._bubbleState[b.id];
      const mr  = Math.max(3, b.r * scaleX);

      // Glow ring for visited
      if (st.visited) {
        ctx.globalAlpha = 0.40 + Math.sin(t * 0.05) * 0.15;
        ctx.strokeStyle = `rgba(${pal.halo},1)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, mr + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.80;
      ctx.fillStyle = `rgba(${pal.b0},1)`;
      ctx.strokeStyle = `rgba(${pal.rng},0.70)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Numeral
      ctx.globalAlpha = 0.75;
      ctx.font = `italic ${Math.max(6, Math.round(mr * 1.4))}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${pal.num_n},1)`;
      ctx.fillText(b.num, mx, my);
    });

    // Player dot
    const px = MX + this._px * scaleX;
    const py = MY + this._py * scaleY;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Direction tick
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(this._facing) * 5, py + Math.sin(this._facing) * 5);
    ctx.stroke();

    ctx.restore();
  }

  _drawCoords(ctx, renderer) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = '9px Georgia, serif';
    ctx.fillStyle = 'rgba(210,205,195,1)';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0.10em';
    ctx.fillText(this._coordText, 16, renderer.CH - 16);
    ctx.restore();
  }

  _drawNearLabel(ctx, renderer) {
    if (!this._nearLabel) return;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.font = 'italic 13px Georgia, Palatino, serif';
    ctx.fillStyle = 'rgba(225,218,205,1)';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.15em';
    ctx.fillText(this._nearLabel, renderer.CW / 2, renderer.CH - 28);
    ctx.restore();
  }

  _drawCompositionIndicator(ctx, renderer, t) {
    if (this._compositionLayers.length === 0) return;
    const n = this._compositionLayers.length;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = '8px Georgia, serif';
    ctx.fillStyle = 'rgba(200,195,185,1)';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0.12em';
    ctx.fillText('ECHO', 16, 22);

    for (let i = 0; i < n; i++) {
      const layer = this._compositionLayers[i];
      const bIdx  = this.config.bubbles.findIndex(b => b.id === layer.bubbleId);
      const pal   = BUBBLE_PALETTES[bIdx % BUBBLE_PALETTES.length];
      const pulse = 0.40 + Math.sin(t * 0.05 * (1 + i * 0.3) + i) * 0.25;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = `rgba(${pal.num_n},1)`;
      ctx.font = `italic 11px Georgia, serif`;
      ctx.fillText(this.config.bubbles[bIdx].num, 16 + i * 18, 36);
    }
    ctx.restore();
  }
}
