// ─────────────────────────────────────────────────────────────────────────────
//  Engine — main loop, wires together Renderer / AudioManager / InputManager
//
//  Usage:
//    import { Engine }   from './engine/Engine.js';
//    import { WorldOne } from './worlds/world_01.js';
//
//    const engine = new Engine('c');
//    engine.loadWorld(new WorldOne(engine));
//    // Start on first user gesture:
//    document.getElementById('overlay').addEventListener('click', () => {
//      engine.start();
//    }, { once: true });
// ─────────────────────────────────────────────────────────────────────────────

import { Renderer }     from './Renderer.js';
import { AudioManager } from './AudioManager.js';
import { InputManager } from './InputManager.js';

export class Engine {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.renderer = null;   // created after world defines WW/WH
    this.audio    = new AudioManager();
    this.input    = new InputManager();
    this.world    = null;
    this._running = false;
    this._t       = 0;      // frame counter (integer)
  }

  // ── Load a world (can be called to switch worlds) ─────────────────────────
  loadWorld(worldInstance) {
    if (this.world) this.world.dispose();

    this.world = worldInstance;

    const { width, height } = worldInstance.config;
    this.renderer = new Renderer(this.canvasId, width, height);

    worldInstance.onLoad(this);
  }

  // ── Start engine (call on first user gesture so AudioContext is allowed) ──
  start() {
    if (this._running) return;
    this._running = true;

    this.audio.boot();
    if (this.world) this.world.onStart(this);

    const loop = () => {
      if (!this._running) return;
      this._update();
      this._draw();
      this._t++;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this._running = false; }

  // ── Internal tick ─────────────────────────────────────────────────────────
  _update() {
    this.renderer.updateShake();
    this.renderer.tickNoise();
    if (this.world) this.world.update(this._t, this.input, this.renderer, this.audio);
    this.input.flush();
  }

  _draw() {
    const { renderer, world } = this;
    renderer.beginFrame();
    if (world) world.draw(this._t, renderer, renderer.ctx, this.audio);
    renderer.endShake();
    // HUD drawn outside shake transform
    if (world) world.drawHUD(this._t, renderer, renderer.ctx);
  }
}
