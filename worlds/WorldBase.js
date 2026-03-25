// ─────────────────────────────────────────────────────────────────────────────
//  WorldBase — extend this to create a new world
//
//  Minimal new world:
//
//    import { WorldBase } from '../worlds/WorldBase.js';
//
//    export class WorldTwo extends WorldBase {
//      get config() {
//        return {
//          width:        4200,
//          height:       3000,
//          ambient:      './sources/audio/my_ambient.ogg',
//          groundTexture:'./sources/photo/my_texture.jpg',
//          bubbles: [
//            { id: 1, wx: 300,  wy: 300,  r: 62, num: 'I',
//              approach: './sources/audio/loop.ogg',
//              inside:   './sources/video/scene.mp4', insideType: 'video' },
//          ],
//          research: [
//            './sources/audio/research/file.ogg',
//          ],
//        };
//      }
//    }
//
//  Override update() and/or draw() for custom behaviour.
// ─────────────────────────────────────────────────────────────────────────────

export class WorldBase {
  // ── Override this getter in your world ────────────────────────────────────
  get config() {
    return {
      width:         4200,
      height:        3000,
      ambient:       null,      // path to looping ambient OGG
      groundTexture: null,      // path to tileable texture image
      bubbles:       [],        // array of bubble descriptors (see above)
      research:      [],        // array of audio paths for spatial research pts
      nResearchPts:  14,        // how many points to scatter in world
    };
  }

  // ── Engine lifecycle hooks ────────────────────────────────────────────────
  // Called when loadWorld() is invoked — set up media elements (no audio graph yet)
  onLoad(engine) {
    this.engine = engine;
    this._setupMedia(engine);
  }

  // Called when engine.start() fires — audio is booted, set up audio graph
  onStart(engine) {
    const { audio } = engine;

    // Start ambient (non-spatial, direct el.volume control)
    if (this._ambEl) {
      this._ambEl.play().catch(() => {});
      audio.setAmbient(this._ambEl, 0.72);
    }

    // Now that AudioContext is live, wire up spatial sources for all media
    this.config.bubbles.forEach(b => {
      const entry = this._bubbleSpatials[b.id];
      if (!entry) return;
      if (entry.approachEl) entry.approachSrc = audio.createSpatial(entry.approachEl);
      if (entry.insideEl)   entry.insideSrc   = audio.createSpatial(entry.insideEl);
    });

    this._researchPts.forEach(pt => {
      pt.src = audio.createSpatial(pt.el);
    });
  }

  dispose() {
    // Stop and detach media when switching worlds
    if (this._ambEl) { this._ambEl.pause(); this._ambEl.src = ''; }
    if (this._mediaEls) this._mediaEls.forEach(el => { el.pause(); el.src = ''; });
  }

  // ── Internal media setup — creates DOM elements only, no Web Audio graph ──
  _setupMedia(engine) {
    const cfg = this.config;
    this._mediaEls = [];

    // Ambient (non-spatial)
    this._ambEl = cfg.ambient ? this._makeAudio(cfg.ambient, true) : null;

    // Bubbles — create elements, store in _bubbleSpatials
    this._bubbleSpatials = {};  // id → { approachEl, insideEl, approachSrc, insideSrc }
    cfg.bubbles.forEach(b => {
      const entry = {};

      if (b.approach) {
        entry.approachEl = b.approach.endsWith('.mp4') || b.approach.endsWith('.webm')
          ? this._makeVideo(b.approach)
          : this._makeAudio(b.approach, true);
        this._mediaEls.push(entry.approachEl);
      }

      if (b.inside) {
        entry.insideEl = b.insideType === 'video'
          ? this._makeVideo(b.inside)
          : this._makeAudio(b.inside, true);
        this._mediaEls.push(entry.insideEl);
      }

      this._bubbleSpatials[b.id] = entry;
    });

    // Research points — deterministic seeded positions
    this._researchPts = [];
    const files   = cfg.research || [];
    const N       = cfg.nResearchPts || files.length;
    const bubbles = cfg.bubbles;

    for (let i = 0; i < N; i++) {
      const file = files[i % files.length];
      const el   = this._makeAudio(file, true);
      this._mediaEls.push(el);

      let wx, wy, tries = 0;
      do {
        wx = 350 + this._sr(i*19+3+tries) * (cfg.width  - 700);
        wy = 350 + this._sr(i*19+7+tries) * (cfg.height - 700);
        tries++;
      } while (tries < 16 && bubbles.some(b => Math.hypot(wx-b.wx, wy-b.wy) < 500));

      this._researchPts.push({ wx, wy, el, src: null, fileIdx: i % files.length });
    }
  }

  // ── To be overridden ──────────────────────────────────────────────────────
  // Called every frame. engine, input, renderer, audio are passed.
  update(t, input, renderer, audio) {}

  // Called every frame inside shake transform.
  draw(t, renderer, ctx, audio) {}

  // Called every frame OUTSIDE shake (for HUD elements).
  drawHUD(t, renderer, ctx) {}

  // ── Helpers ───────────────────────────────────────────────────────────────
  _makeAudio(src, loop = false) {
    const el = new Audio();
    el.src     = src;
    el.loop    = loop;
    el.preload = 'auto';
    return el;
  }

  _makeVideo(src) {
    const el = document.createElement('video');
    el.src         = src;
    el.loop        = true;
    el.playsInline = true;
    el.preload     = 'auto';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  // Deterministic seeded random 0..1
  _sr(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
}
