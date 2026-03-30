// ─────────────────────────────────────────────────────────────────────────────
//  AudioManager — spatial audio engine
//
//  Tier 1 (preferred): Google Resonance Audio — full ambisonics / room acoustics
//  Tier 2 (fallback):  Web Audio HRTF PannerNode — binaural stereo
//
//  Usage:
//    const audio = new AudioManager();
//    await audio.boot();                          // call on first user gesture
//
//    // Tier 1 — Resonance (auto-selected if library loaded)
//    const src = audio.createSpatial(element);    // returns SpatialSource
//    audio.updatePosition(src, dx, dy);           // world-space offset px
//
//    // Non-spatial ambient
//    audio.setAmbient(element, 0.72);
//
//  Load Resonance before the game module:
//    <script src="https://cdn.jsdelivr.net/npm/resonance-audio/build/resonance-audio.min.js"></script>
// ─────────────────────────────────────────────────────────────────────────────

export class AudioManager {
  constructor() {
    this.AC         = null;
    this.masterG    = null;
    this.comp       = null;
    this._booted    = false;
    this._resonance = null;   // ResonanceAudio instance (if library present)
    this.BOOST      = 30;     // captureStream volume compensation
  }

  // ── Boot (call once on first user gesture) ────────────────────────────────
  boot() {
    if (this._booted) return;
    this._booted = true;

    this.AC = new (window.AudioContext || window.webkitAudioContext)();
    if (this.AC.state === 'suspended') this.AC.resume();

    // Master chain: masterG → compressor → destination
    this.masterG = this.AC.createGain();
    this.masterG.gain.value = 0.60;

    this.comp = this.AC.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value      = 8;
    this.comp.ratio.value     = 3;
    this.comp.attack.value    = 0.005;
    this.comp.release.value   = 0.20;

    this.masterG.connect(this.comp);
    this.comp.connect(this.AC.destination);

    // ── Try Resonance Audio ────────────────────────────────────────────────
    if (window.ResonanceAudio) {
      try {
        this._resonance = new window.ResonanceAudio(this.AC, {
          ambisonicOrder: 3,
          // Small dry room — subtle presence, short tail, no wash
          dimensions: { width: 6, height: 3, depth: 6 },
          materials: {
            left:   'brick-painted',        right:  'brick-painted',
            front:  'curtain-heavy',        back:   'curtain-heavy',
            down:   'parquet-on-concrete',  up:     'acoustic-ceiling-tiles',
          },
        });
        // Resonance output → masterG (so master gain / compressor still applies)
        this._resonance.output.connect(this.masterG);
        console.log('[AudioManager] Resonance Audio 3rd-order ambisonics ready');
      } catch (e) {
        console.warn('[AudioManager] Resonance init failed, falling back to HRTF:', e.message);
        this._resonance = null;
      }
    }

    // ── HRTF listener (used when Resonance absent) ─────────────────────────
    const L = this.AC.listener;
    if (L.positionX) {
      L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
      L.forwardX.value  = 0; L.forwardY.value  = 0; L.forwardZ.value  = -1;
      L.upX.value       = 0; L.upY.value       = 1; L.upZ.value       =  0;
    } else {
      L.setPosition(0, 0, 0);
      L.setOrientation(0, 0, -1, 0, 1, 0);
    }

    const tier = this._resonance ? 'Resonance Audio (ambisonics)' : 'HRTF binaural';
    console.log(`[AudioManager] booted — ${tier}`);
  }

  // ── Returns true if Resonance Audio is active ──────────────────────────────
  get hasResonance() { return !!this._resonance; }

  // ── Create direct source — no spatial processing, no room reverb ──────────
  // Use for inside-bubble audio where dry signal is needed.
  createDirect(el) {
    if (!this._booted) {
      console.warn('[AudioManager] createDirect called before boot()');
      return new DirectSource(null, null, el, this.BOOST);
    }
    const src = new DirectSource(this.AC, this.masterG, el, this.BOOST);
    src._init();
    return src;
  }

  // ── Create spatial source (auto-selects Resonance or HRTF) ────────────────
  // options.filter = true → inserts a BiquadFilter (lowpass) into the chain,
  //   exposed as src.filter for real-time cutoff control (distance air-absorption).
  createSpatial(el, options = {}) {
    if (!this._booted) {
      console.warn('[AudioManager] createSpatial called before boot()');
      return new SpatialSource(null, null, null, el, this.BOOST, options.filter);
    }
    const src = new SpatialSource(
      this.AC, this.masterG, this._resonance, el, this.BOOST, options.filter
    );
    src._init();
    return src;
  }

  // ── Non-spatial ambient (direct el.volume lerp) ───────────────────────────
  setAmbient(el, targetVol, lerpSpeed = 0.04) {
    if (!el._ambTarget) el._ambTarget = el.volume;
    el._ambTarget = targetVol;
    el._ambLerp   = lerpSpeed;
    if (!el._ambTick) {
      el._ambTick = true;
      const tick = () => {
        if (!el._ambTick) return;
        const delta = el._ambTarget - el.volume;
        if (Math.abs(delta) < 0.002) { el.volume = el._ambTarget; return; }
        el.volume += delta * el._ambLerp;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  // ── Update 3-D position (call every frame) ────────────────────────────────
  // dx, dy: world-space pixel offset from listener to source
  // Scale: 1 px ≈ WORLD_SCALE metres (default 1 px = 0.01 m)
  updatePosition(spatialSrc, dx, dy, worldScale = 0.01) {
    if (!spatialSrc) return;

    // Resonance path — absolute position in metres
    if (spatialSrc._resSource) {
      spatialSrc._resSource.setPosition(
        dx  * worldScale,   //  +X = right
        0,                  //  Y fixed (top-down world)
        dy  * worldScale,   //  +Z = into screen
      );
      return;
    }

    // HRTF path — unit-sphere direction only
    if (!spatialSrc.panner) return;
    const dist = Math.hypot(dx, dy);
    const nx = dist < 1 ? 0  : dx / dist;
    const nz = dist < 1 ? -1 : dy / dist;
    const p = spatialSrc.panner;
    if (p.positionX) {
      p.positionX.value = nx;
      p.positionY.value = 0;
      p.positionZ.value = nz;
    } else {
      p.setPosition(nx, 0, nz);
    }
  }

  // ── Set listener position (for Resonance room acoustics) ──────────────────
  // Call each frame with the player's world position if room acoustics matter
  setListenerPosition(wx, wy, worldScale = 0.01) {
    if (this._resonance) {
      this._resonance.setListenerPosition(
        wx * worldScale,
        0,
        wy * worldScale,
      );
    }
  }

  // ── Ambient stereo rotation helper ────────────────────────────────────────
  // Returns a pan value (-1..1) for a StereoPannerNode given movement velocity.
  // Used by worlds to rotate only the ambient soundfield, NOT bonfire sources.
  //   vx: left/right velocity  → horizontal pan
  //   vy: up/down velocity     → added as diagonal component (subtle depth)
  //   maxPan: maximum pan excursion (default 0.72 = subtle but clear)
  calcAmbientPan(vx, vy, maxPan = 0.72) {
    const speed = Math.hypot(vx, vy);
    if (speed < 0.02) return 0;
    // Primary: vx drives L/R.  Secondary: vy adds ±15% diagonal feel.
    const pan = (vx + vy * 0.15) / speed * maxPan;
    return Math.max(-1, Math.min(1, pan));
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SpatialSource — handle returned by AudioManager.createSpatial()
//
//  Internal graph (createMediaElementSource — synchronous, no timing issues):
//    Resonance: el → MediaElementSource → gainNode/dryGain → resSource.input / masterG
//    HRTF:      el → MediaElementSource → [filter?] → panner → gain → masterG
// ─────────────────────────────────────────────────────────────────────────────
export class SpatialSource {
  constructor(AC, masterG, resonance, el, boost, useFilter = false) {
    this.AC          = AC;
    this.masterG     = masterG;
    this._resonance  = resonance;
    this.el          = el;
    this.BOOST       = boost;
    this._useFilter  = useFilter;
    this._resSource  = null;
    this._resGain    = null;
    this.panner      = null;
    this.gain        = null;
    this._ready      = false;
    this.filter      = null;
    this.dryGain     = null;
  }

  _init() {
    const { AC, masterG, _resonance, el } = this;
    el.play().catch(() => {});

    try {
      // createMediaElementSource is synchronous and routes audio exclusively through
      // Web Audio — no native output leak, no captureStream timing issues.
      const src = AC.createMediaElementSource(el);

      if (this._useFilter) {
        const filt = AC.createBiquadFilter();
        filt.type            = 'lowpass';
        filt.frequency.value = 3500;
        filt.Q.value         = 0.5;
        this.filter = filt;
      }

      if (_resonance) {
        // ── Resonance path ─────────────────────────────────────────────
        const resSrc   = _resonance.createSource({ rolloff: 'logarithmic' });
        const gainNode = AC.createGain(); gainNode.gain.value = 0;
        const dryGain  = AC.createGain(); dryGain.gain.value  = 0;

        // Dry tap: src → dryGain → masterG (close, direct)
        src.connect(dryGain);
        dryGain.connect(masterG);
        this.dryGain = dryGain;

        // Wet path: src → gainNode → [filter?] → Resonance room
        src.connect(gainNode);
        if (this.filter) {
          gainNode.connect(this.filter);
          this.filter.connect(resSrc.input);
        } else {
          gainNode.connect(resSrc.input);
        }

        this._resSource = resSrc;
        this._resGain   = gainNode;
        resSrc.setPosition(0, 0, -1);
        this._ready = true;
        console.log('[AudioManager] Resonance source OK:', _srcName(el));

      } else {
        // ── HRTF path ──────────────────────────────────────────────────
        const pan = AC.createPanner();
        pan.panningModel   = 'HRTF';
        pan.distanceModel  = 'inverse';
        pan.refDistance    = 1;
        pan.maxDistance    = 10000;
        pan.rolloffFactor  = 0;
        pan.coneInnerAngle = 360;
        pan.coneOuterAngle = 360;
        if (pan.positionX) {
          pan.positionX.value = 0; pan.positionY.value = 0; pan.positionZ.value = -1;
        } else { pan.setPosition(0, 0, -1); }

        const gain = AC.createGain(); gain.gain.value = 0;

        if (this.filter) {
          src.connect(this.filter); this.filter.connect(pan);
        } else { src.connect(pan); }
        pan.connect(gain);
        gain.connect(masterG);

        this.panner = pan;
        this.gain   = gain;
        this._ready = true;
        console.log('[AudioManager] HRTF source OK:', _srcName(el));
      }
    } catch(e) {
      console.warn('[AudioManager] SpatialSource init failed:', e.message);
    }
  }

  // ── Wet/dry blend for distance-based reverb (Resonance path) ──────────────
  // Direct gain.value assignment — bZ lerp in world_01 already smooths transitions.
  // DO NOT switch to setTargetAtTime here: it accumulates scheduler events every frame
  // and breaks fadeTo() which relies on reading gain.value after cancelScheduledValues.
  setDryWet(dry, wet) {
    dry = Math.max(0, Math.min(1, dry));
    wet = Math.max(0, Math.min(1, wet));
    if (this._resGain) this._resGain.gain.value = wet;
    if (this.dryGain)  this.dryGain.gain.value  = dry;
    // HRTF fallback — no wet/dry split, use the louder of the two
    if (!this._resGain && this.gain) this.gain.gain.value = Math.max(dry, wet);
  }

  // ── Volume (0..1) ──────────────────────────────────────────────────────────
  // Only sets _resGain (Resonance wet path) — dryGain deliberately NOT set here.
  // Setting dryGain would route the signal non-spatially straight to masterG,
  // making approach sounds omnidirectional and too loud. Spatialization lives
  // entirely in the Resonance path. Gain is boosted in world_01 to compensate
  // for Resonance's own distance rolloff.
  setVolume(v) {
    v = Math.max(0, Math.min(1, v));
    if (this._resGain) { this._resGain.gain.value = v; return; }
    if (this.gain)     { this.gain.gain.value = v;     return; }
    if (this.el) this.el.volume = v;
  }

  // ── Smooth volume fade ─────────────────────────────────────────────────────
  fadeTo(v, durationSec = 0.08) {
    v = Math.max(0, Math.min(1, v));
    const gainNode = this._resGain || this.gain;
    if (gainNode && this.AC) {
      const now = this.AC.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(v, now + durationSec);
    } else {
      this.setVolume(v);
    }
  }

  restart() {
    if (this.el) {
      this.el.currentTime = 0;
      this.el.play().catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DirectSource — dry signal, no room reverb, no spatial panning
//  Used for inside-bubble audio so it sounds present and intimate.
//  Same external interface as SpatialSource (setVolume / fadeTo / restart).
// ─────────────────────────────────────────────────────────────────────────────
export class DirectSource {
  constructor(AC, masterG, el, boost) {
    this.AC      = AC;
    this.masterG = masterG;
    this.el      = el;
    this.BOOST   = boost;
    this._gain   = null;
    this._ready  = false;
    this._resGain   = null;
    this._resSource = null;
    this.gain       = null;
    this.panner     = null;
  }

  _init() {
    const { AC, masterG, el } = this;
    el.play().catch(() => {});
    try {
      const src  = AC.createMediaElementSource(el);
      const gain = AC.createGain(); gain.gain.value = 0;
      src.connect(gain);
      gain.connect(masterG);
      this._gain  = gain;
      this._ready = true;
      console.log('[AudioManager] DirectSource OK:', _srcName(el));
    } catch(e) {
      console.warn('[AudioManager] DirectSource init failed:', e.message);
    }
  }

  setVolume(v) {
    v = Math.max(0, Math.min(1, v));
    if (this._gain) { this._gain.gain.value = v; return; }
    if (this.el) this.el.volume = v;
  }

  fadeTo(v, durationSec = 0.08) {
    v = Math.max(0, Math.min(1, v));
    if (this._gain && this.AC) {
      const now = this.AC.currentTime;
      this._gain.gain.cancelScheduledValues(now);
      this._gain.gain.setValueAtTime(this._gain.gain.value, now);
      this._gain.gain.linearRampToValueAtTime(v, now + durationSec);
    } else {
      this.setVolume(v);
    }
  }

  restart() {
    if (this.el) { this.el.currentTime = 0; this.el.play().catch(() => {}); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function _srcName(el) {
  return el.src ? el.src.split('/').pop() : '(unknown)';
}
