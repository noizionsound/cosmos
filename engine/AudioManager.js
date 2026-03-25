// ─────────────────────────────────────────────────────────────────────────────
//  AudioManager — HRTF binaural spatial audio engine
//
//  Usage:
//    const audio = new AudioManager();
//    await audio.boot();                         // call on first user gesture
//    const src = audio.createSpatial(element);   // returns SpatialSource
//    src.setVolume(0.8);                         // 0..1, fades smoothly
//    audio.updatePosition(src, dx, dy);          // world-space offset from listener
//    audio.setAmbient(element, 0.72);            // non-spatial ambient
// ─────────────────────────────────────────────────────────────────────────────

export class AudioManager {
  constructor() {
    this.AC       = null;
    this.masterG  = null;
    this.comp     = null;
    this._booted  = false;
    this.BOOST    = 30;         // captureStream volume compensation
  }

  // ── Boot (call once on user gesture) ──────────────────────────────────────
  boot() {
    if (this._booted) return;
    this._booted = true;

    this.AC = new (window.AudioContext || window.webkitAudioContext)();
    if (this.AC.state === 'suspended') this.AC.resume();

    // Master gain → light dynamics compressor → output
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

    // Listener: origin, facing –Z (top-down: right=+X, down=+Z)
    const L = this.AC.listener;
    if (L.positionX) {
      L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
      L.forwardX.value  = 0; L.forwardY.value  = 0; L.forwardZ.value  = -1;
      L.upX.value       = 0; L.upY.value       = 1; L.upZ.value       =  0;
    } else {
      L.setPosition(0, 0, 0);
      L.setOrientation(0, 0, -1, 0, 1, 0);
    }

    console.log('[AudioManager] booted, HRTF ready');
  }

  // ── Spatial source from HTMLMediaElement ──────────────────────────────────
  // Returns a SpatialSource handle. Volume starts at 0.
  createSpatial(el) {
    if (!this._booted) {
      console.warn('[AudioManager] createSpatial called before boot()');
      return new SpatialSource(null, null, el, this.BOOST);
    }

    const src = new SpatialSource(this.AC, this.masterG, el, this.BOOST);
    src._init();
    return src;
  }

  // ── Non-spatial ambient (direct el.volume control) ────────────────────────
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

  // ── Update panner position (call every frame) ─────────────────────────────
  // dx, dy: world-space vector from player to source (pixels)
  // Normalises to unit sphere — HRTF only cares about direction
  updatePosition(spatialSrc, dx, dy) {
    if (!spatialSrc || !spatialSrc.panner) return;
    const dist = Math.hypot(dx, dy);
    const nx = dist < 1 ? 0  : dx / dist;   // +X = right ear
    const nz = dist < 1 ? -1 : dy / dist;   // –Z = front, +Z = behind
    const p = spatialSrc.panner;
    if (p.positionX) {
      p.positionX.value = nx;
      p.positionY.value = 0;
      p.positionZ.value = nz;
    } else {
      p.setPosition(nx, 0, nz);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SpatialSource — handle returned by AudioManager.createSpatial()
// ─────────────────────────────────────────────────────────────────────────────
export class SpatialSource {
  constructor(AC, masterG, el, boost) {
    this.AC      = AC;
    this.masterG = masterG;
    this.el      = el;
    this.BOOST   = boost;
    this.panner  = null;
    this.gain    = null;
    this._ready  = false;
  }

  _init() {
    const { AC, masterG, el, BOOST } = this;
    el.volume = 1 / BOOST;   // CRITICAL: captureStream captures after el.volume
    el.play().catch(() => {});

    const tryCapture = () => {
      try {
        const cs = el.captureStream || el.mozCaptureStream;
        if (!cs) throw new Error('no captureStream');
        const stream = cs.call(el);
        if (!stream.getAudioTracks().length) throw new Error('no tracks yet');

        const src   = AC.createMediaStreamSource(stream);
        const boost = AC.createGain();
        boost.gain.value = BOOST;

        const pan = AC.createPanner();
        pan.panningModel   = 'HRTF';
        pan.distanceModel  = 'inverse';
        pan.refDistance    = 1;
        pan.maxDistance    = 10000;
        pan.rolloffFactor  = 0;       // manual volume via gain node
        pan.coneInnerAngle = 360;
        pan.coneOuterAngle = 360;
        if (pan.positionX) {
          pan.positionX.value = 0;
          pan.positionY.value = 0;
          pan.positionZ.value = -1;   // default: straight ahead
        } else {
          pan.setPosition(0, 0, -1);
        }

        const gain = AC.createGain();
        gain.gain.value = 0;

        src.connect(boost);
        boost.connect(pan);
        pan.connect(gain);
        gain.connect(masterG);

        this.panner = pan;
        this.gain   = gain;
        this._ready = true;
        console.log('[AudioManager] HRTF OK:', el.id || el.src.split('/').pop());
      } catch(e) {
        console.warn('[AudioManager] fallback el.volume:', e.message);
        el.volume = 1;
        // gain/panner stay null → caller uses el.volume fallback
      }
    };

    if (el.readyState >= 3) tryCapture();
    else el.addEventListener('playing', tryCapture, { once: true });
  }

  // Set target volume (0..1), immediate
  setVolume(v) {
    if (this.gain) {
      this.gain.gain.value = Math.max(0, Math.min(1, v));
    } else if (this.el) {
      this.el.volume = Math.max(0, Math.min(1, v));
    }
  }

  // Smooth volume fade via AudioParam ramp
  fadeTo(v, durationSec = 0.08) {
    if (this.gain && this.AC) {
      const now = this.AC.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), now + durationSec);
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
