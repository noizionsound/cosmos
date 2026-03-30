// ─────────────────────────────────────────────────────────────────────────────
//  Renderer — canvas 2D, camera, draw layers
//
//  Layers (drawn in order):
//    background   ground texture + noise + zone atmosphere
//    world        stones, ruins, lore texts, bubble bleed
//    entities     player trail, footprints, player character
//    bubbles      3D sphere portals
//    fx           particles, vignette, world-edge fog
//    hud          minimap, coordinates, indicators (no shake)
//    overlay      iris wipe, bubble interior, culmination
// ─────────────────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(canvasId, worldW, worldH) {
    this.canvas  = document.getElementById(canvasId);
    this.ctx     = this.canvas.getContext('2d');

    // Native screen resolution — sharp, no upscaling, no DPR (DPR causes lag)
    this.CW      = window.innerWidth;
    this.CH      = window.innerHeight;
    this.WW      = worldW;
    this.WH      = worldH;
    this.canvas.width  = this.CW;
    this.canvas.height = this.CH;
    // Ensure canvas visually fills the entire viewport via CSS.
    // Without this, some browsers/zoom levels leave a gap where the video
    // element (opacity:1, z-index:-1) shows as a black strip on the right.
    this.canvas.style.width  = '100vw';
    this.canvas.style.height = '100vh';

    // Camera (world-space top-left corner of viewport)
    this.cam = { x: 0, y: 0 };

    // Shake
    this.shakeX   = 0;
    this.shakeY   = 0;
    this.shakeMag = 0;

    // Noise canvas — generated ONCE, then only rotated (no per-frame regeneration)
    this._NS       = Math.ceil(Math.hypot(this.CW, this.CH)) + 40;
    this._noiseC   = document.createElement('canvas');
    this._noiseC.width = this._noiseC.height = this._NS;
    this._noiseCtx = this._noiseC.getContext('2d');
    this._noiseRot = 0;
    this._noiseTick = 0;
    this.genNoise(); // generate once at startup
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  followTarget(wx, wy, lerp = 0.085) {
    const tx = wx - this.CW / 2;
    const ty = wy - this.CH / 2;
    this.cam.x += (tx - this.cam.x) * lerp;
    this.cam.y += (ty - this.cam.y) * lerp;
    this.cam.x = Math.max(0, Math.min(this.WW - this.CW, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.WH - this.CH, this.cam.y));
  }

  // World → screen
  toScreen(wx, wy) {
    return { x: wx - this.cam.x, y: wy - this.cam.y };
  }

  // Shake tick (call every update)
  updateShake() {
    if (this.shakeMag > 0.3) {
      this.shakeX = (Math.random() - 0.5) * this.shakeMag * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeMag * 2;
      this.shakeMag *= 0.72;
    } else {
      this.shakeX = this.shakeY = this.shakeMag = 0;
    }
  }

  // ── Noise ─────────────────────────────────────────────────────────────────
  genNoise() {
    const NS = this._NS;
    const id = this._noiseCtx.createImageData(NS, NS);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255 | 0;
      d[i] = d[i+1] = d[i+2] = v; d[i+3] = 18;
    }
    this._noiseCtx.putImageData(id, 0, 0);
  }

  tickNoise() {
    this._noiseRot += 0.0013; // only rotate — no per-frame regeneration, eliminates 30Hz flicker
  }

  drawNoise() {
    const { ctx, CW, CH, _NS: NS } = this;
    ctx.save();
    ctx.translate(CW / 2, CH / 2);
    ctx.rotate(this._noiseRot);
    ctx.drawImage(this._noiseC, -NS / 2, -NS / 2);
    ctx.restore();
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────
  // Call at start of draw() frame — clears canvas and applies shake transform
  beginFrame() {
    const { ctx, CW, CH } = this;
    ctx.clearRect(0, 0, CW, CH);
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
  }

  // Call at end of shakeable content — restores shake transform
  endShake() {
    this.ctx.restore();
  }

  // Radial vignette over full screen
  drawVignette(inner = 0.25, outer = 0.82, alpha = 0.38) {
    const { ctx, CW, CH } = this;
    const g = ctx.createRadialGradient(CW/2, CH/2, CH*inner, CW/2, CH/2, CH*outer);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  }

  // World-edge darkness based on player position
  drawWorldEdgeFog(px, py) {
    const { ctx, CW, CH, WW, WH } = this;
    const ex = px / WW, ey = py / WH;
    const aMax = Math.max(
      Math.max(0, (0.12 - ex)  / 0.12),
      Math.max(0, (ex - 0.88)  / 0.12),
      Math.max(0, (0.12 - ey)  / 0.12),
      Math.max(0, (ey - 0.88)  / 0.12)
    );
    if (aMax > 0) {
      ctx.fillStyle = `rgba(0,0,0,${aMax * 0.70})`;
      ctx.fillRect(0, 0, CW, CH);
    }
  }

  // Flash overlay (entry flash, etc)
  drawFlash(r, g, b, alpha) {
    if (alpha < 0.005) return;
    this.ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    this.ctx.fillRect(0, 0, this.CW, this.CH);
  }
}
