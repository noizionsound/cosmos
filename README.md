# COSMOS — Field Recording Game Engine

A spatial audio game engine built around field recordings. Players navigate a world of sound bubbles — each bubble is a field recording site with binaural / ambisonics audio that emerges as you approach. The engine is local-first, runs entirely in the browser via a local HTTP server, and deploys to GitHub Pages on demand.

---

## Quick Start (local)

**Double-click `START.command`** — that's it.

This opens `studio.html` in Chrome at `http://localhost:8080`. No install required beyond Node.js or Python (at least one must be present).

If Chrome is not found it falls back to Chromium, then Chrome Canary, then the system default. Note: Safari blocks `captureStream()` and `SharedArrayBuffer`, so Chrome is required for full audio functionality.

---

## Studio Interface

`studio.html` is the unified hub with six tabs:

| Tab | What it does |
|-----|-------------|
| **HOME** | Dashboard, quick links |
| **GAME** | Runs `index.html` in an iframe |
| **EDITOR** | World map editor (`editor.html`) |
| **AUDIO** | OGG converter |
| **TEXTURES** | Procedural texture generator |
| **CONVERT OGG** | Converter, standalone tab |

The **▶ PLAY** button opens the game in a new full-screen tab.

---

## Game Controls

| Key | Action |
|-----|--------|
| `W A S D` / arrows | Move |
| `ENTER` | Enter a sound bubble |
| `ESC` (inside bubble) | Exit bubble |
| `ESC` (in world) | Pause menu |

---

## World Editor (`editor.html`)

Reads and writes `worlds/world_01_config.json`.

**Toolbar tools:**
- `SELECT` — click to inspect/edit, drag to reposition
- `+BUBBLE` — click canvas to add a sound bubble
- `+RESEARCH` — click to add a research point

**Sidebar:** lists all objects. Click to select.

**Properties panel (right):** edit position, radius, audio paths, interior mode.

**Audio preview bar (bottom):** audition recordings with a live frequency analyser before assigning.

**Export config** → downloads `world_01_config.json`. Drop it into `worlds/` to apply.

**Load config** → import existing JSON to resume editing.

---

## Audio Engine

`engine/AudioManager.js` has automatic tier selection:

**Tier 1 — Google Resonance Audio** (active when online, CDN loaded)
3rd-order ambisonics with room acoustics. Library loads from CDN in `index.html`.

**Tier 2 — Web Audio HRTF PannerNode** (offline fallback)
Binaural stereo, no external dependency, works fully offline.

Console shows which tier is active:
```
[AudioManager] booted — Resonance Audio (ambisonics)
[AudioManager] booted — HRTF binaural
```

### Audio API

```javascript
// In onStart() — after audio.boot():
this._src = this.audio.createSpatial(this._mediaElement);

// Every frame:
this.audio.updatePosition(this._src, dx, dy);   // world-space pixel offset
this._src.fadeTo(volume, 0.1);                   // smooth fade 0..1

// Optional — room acoustics:
this.audio.setListenerPosition(player.wx, player.wy);

// Ambient (non-spatial):
this.audio.setAmbient(this._ambEl, 0.72);
```

---

## World Config (`worlds/world_01_config.json`)

Shared between editor and game:

```json
{
  "width": 4200,
  "height": 3000,
  "ambient": "./sources/audio/loop.ogg",
  "groundTexture": "./sources/photo/stone_texture.jpg",
  "bubbles": [
    {
      "id": 1, "num": "I",
      "wx": 300, "wy": 300, "r": 62, "ph": 0.0,
      "approach":      "./sources/audio/approach.ogg",
      "inside":        "./sources/video/scene.mp4",
      "insideType":    "video",
      "interiorVideo": "./sources/video/scene.mp4",
      "interiorMode":  "fullscreen",
      "label":         "desert / field I"
    }
  ],
  "research": ["./sources/audio/research/recording.ogg"],
  "nResearchPts": 14,
  "researchPositions": []
}
```

`interiorMode`: `fullscreen` | `floor` | `rune`
`insideType`: `video` | `audio`

If `researchPositions` is empty, positions are seeded from `nResearchPts`. The editor's **Materialize** button converts them to an explicit editable array.

---

## File Converter (`tools/convert_ogg.html`)

MP3 / WAV / AIFF / FLAC → OGG Opus, in-browser.

- Drag-drop or click, batch supported
- Settings: bitrate, sample rate, channels, normalize
- Live frequency analyser on converted output
- Download individually or all at once

Requires Chrome (Safari does not support `MediaRecorder` with OGG).

---

## Texture Editor (`tools/textures.html`)

**Generate mode:** 6 types — gravel, sand, moss, slate, noise, fabric. Parameters: scale, roughness, contrast, hue, seed. 3×3 tile preview. Export PNG.

**Import mode:** drag-drop image, resize, brightness/contrast/desaturate. Export PNG.

---

## Deploy to GitHub Pages

Only when you explicitly want to publish:

```bash
bash deploy.sh "describe changes"
# or prompt-driven:
bash deploy.sh
```

Syncs to `../cosmos_deploy/` and pushes to `main`. Result at:
**https://noizionsound.github.io/cosmos/**

Excluded from deploy: `START.command`, `deploy.sh`, `dev.sh`, `node_modules/`, `cosmos_backup_*/`

---

## Local Server Only

```bash
bash dev.sh
# Tries: npx serve → python3 → python → php
# Serves at http://localhost:8080
```

---

## File Structure

```
cosmos/
├── START.command          ← double-click to launch
├── studio.html            ← unified hub (entry point)
├── index.html             ← game standalone
├── editor.html            ← world editor
├── deploy.sh              ← explicit GitHub Pages deploy
├── dev.sh                 ← local server only
│
├── engine/
│   ├── Engine.js          ← main loop, world lifecycle
│   ├── AudioManager.js    ← Resonance Audio / HRTF spatial engine
│   ├── Renderer.js        ← canvas drawing utilities
│   └── WorldBase.js       ← base class for worlds
│
├── worlds/
│   ├── world_01.js        ← World One
│   └── world_01_config.json ← editor/game shared config
│
├── tools/
│   ├── convert_ogg.html   ← audio converter
│   └── textures.html      ← texture generator
│
└── sources/
    ├── audio/             ← .ogg field recordings
    ├── video/             ← .mp4 interior scenes
    └── photo/             ← textures, images
```

---

## Adding a New World

1. Create `worlds/world_02.js` extending `WorldBase`
2. Override `onLoad()` (DOM/media setup) and `onStart()` (audio graph — after `audio.boot()`)
3. Create `worlds/world_02_config.json`
4. Import in `index.html` and pass to `engine.loadWorld(new WorldTwo())`

---

## Requirements

- **Chrome** or **Chromium** — required for `captureStream`, `SharedArrayBuffer`, OGG encoding
- **Node.js** (for `npx serve`) or Python 3 as fallback
- Internet: only needed for Resonance Audio CDN on first load (then browser-cached). Everything else works offline.
