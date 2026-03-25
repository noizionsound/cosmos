// ─────────────────────────────────────────────────────────────────────────────
//  InputManager — keyboard + future touch/gamepad
//
//  Usage:
//    const input = new InputManager();
//    // in update():
//    const { vx, vy } = input.movement();   // normalised –1..+1
//    if (input.justPressed('Enter')) { ... }
//    if (input.held('Escape')) { ... }
//    input.flush();  // call at END of each update tick
// ─────────────────────────────────────────────────────────────────────────────

export class InputManager {
  constructor() {
    this._held    = new Set();
    this._just    = new Set();   // pressed this tick
    this._released = new Set();  // released this tick

    window.addEventListener('keydown', e => {
      if (!this._held.has(e.code)) this._just.add(e.code);
      this._held.add(e.code);
      this._released.delete(e.code);
    });

    window.addEventListener('keyup', e => {
      this._held.delete(e.code);
      this._just.delete(e.code);
      this._released.add(e.code);
    });
  }

  // Is key currently held down
  held(code) { return this._held.has(code); }

  // Was key pressed for the first time this tick
  justPressed(code) { return this._just.has(code); }

  // Was key released this tick
  justReleased(code) { return this._released.has(code); }

  // Normalised movement vector from WASD / arrow keys
  // Returns { vx, vy } each in –1..+1, diagonal normalised
  movement() {
    let vx = 0, vy = 0;
    if (this.held('ArrowLeft')  || this.held('KeyA')) vx -= 1;
    if (this.held('ArrowRight') || this.held('KeyD')) vx += 1;
    if (this.held('ArrowUp')    || this.held('KeyW')) vy -= 1;
    if (this.held('ArrowDown')  || this.held('KeyS')) vy += 1;
    if (vx && vy) { vx *= 0.707; vy *= 0.707; }
    return { vx, vy };
  }

  // Clear per-tick sets — call at the END of each update()
  flush() {
    this._just.clear();
    this._released.clear();
  }
}
