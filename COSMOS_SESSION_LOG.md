---
type: dev-log
tags: [cosmos, game, dev-log, spatial-audio]
project: cosmos
updated: 2026-03-29 (v8)
---

# COSMOS — Лог разработки

Чеклист + архитектурная документация. Читать перед любым изменением.

→ [[LAUNCH]] — как запустить игру

---

## ✅ Сделано

### Интерфейс
- [x] Убрать вкладки РЕДАКТОР / ТЕКСТУРЫ / OGG из `studio.html`
- [x] Белый контрастный текст — `--text: #ffffff`
- [x] Шрифт Cinzel — Google Fonts
- [x] Театральный режим по умолчанию — игра на весь экран
- [x] Ползунки микшера WORLD / FIRES / BUBBLES — правый нижний угол, `window._COSMOS_VOL`
- [x] **Старт — только клавиатура**: `document.addEventListener('keydown', ...)` вместо click
- [x] Оверлей: "press any key" вместо "click to begin"

### Игровой мир
- [x] Canvas на весь экран, нативное разрешение
- [x] Убрать пикселизацию, убрать лаги (gradients)
- [x] Масштабируемая скорость — `speed = 1.5 * (CW / 960)`
- [x] Рандомные позиции костров каждый запуск; мин. 500px от пузырей
- [x] Размер 4200×3000. Пузыри: I=(300,300) II=(3900,300) III=(2100,2700)
- [x] 28 костров (было 14)
- [x] Названия пузырей 84px (было 42px)

### Аудио — АРХИТЕКТУРА (текущая, v4)

**Ключевое**: все источники используют `createMediaElementSource` (НЕ captureStream).
- Синхронный, без race conditions
- Gain ноды инициализируются в 0 — нет утечек аудио до начала игры
- Нет нативного вывода через el.volume (аудио идёт ТОЛЬКО через Web Audio)
- el.volume больше НЕ используется как часть сигнальной цепи (кроме ambient)

```
SpatialSource: el → createMediaElementSource → gainNode/dryGain → Resonance → masterG
                                              ↘ dryGain → masterG (параллельно)
DirectSource:  el → createMediaElementSource → gain → masterG
Ghost/PersistentGhost: el → createMediaElementSource → lp/gain → masterG
DelayFire:     el → createMediaElementSource → inputGain → granularChain → masterG
```

Ambient (`_ambEl`) по-прежнему использует captureStream (отдельная цепочка через `_initAcousticEcho`).

### Аудио — видео элементы

- `_makeVideo()` в WorldBase ВСЕГДА устанавливает `el.muted = true` — это только visual texture, аудио маршрутизируется ОТДЕЛЬНО через Web Audio (createDirect/createSpatial)
- Когда `b.interiorVideo === b.inside` (bubble I: desert.mp4) — НЕ создавать отдельный videoEl. Добавлена проверка `b.interiorVideo !== b.inside` в `_setupMedia`
- `createMediaElementSource` отключает нативный вывод элемента автоматически — `insideEl` уже защищён, `videoEl` нужно мутить отдельно
- Для bubble II: `entry.videoEl = kalevala_texture.mp4` (visual floor texture) — muted ✓

### Аудио — правила volume

- **Gain ноды начинают в 0** — не надо мутить вручную при старте
- **Intro muting** (`_introActive`): `setDryWet(0,0)` и `setVolume(0)` зануляют gain ноды — избыточно но корректно
- **el.volume НЕ трогать** для muting — это сломает сигнал в createMediaElementSource
- **Исключение**: ambient `_ambEl` — там el.volume управляет уровнем в captureStream цепи
- **`setVolume(v)`** — ТОЛЬКО `_resGain.gain.value = v`. **НЕ трогать dryGain** — иначе approach звук идёт через dry path (omnidirectional, без spatial). **НЕ использовать setTargetAtTime** каждый кадр — накапливает события в scheduler, ломает fadeTo
- **`setDryWet(dry, wet)`** — прямое `gain.value`. HRTF fallback: `gain=max(dry,wet)`
- **НЕ сбрасывать `_bubbleZoom = 0` на выходе** — lerp сам к 0 за ≈1 sec. Instant reset = pop всех внешних звуков
- **Approach gain multiplier**: `Math.min(1, f*f*4.5) * (1-bZ) * bVol` — компенсирует Resonance rolloff (×0.22 на 4.5m)

### Аудио — костры (28 штук)
- [x] Доплер — `pt.el.playbackRate`, virtualSoS=70, диапазон 0.75–1.33, lerp 0.06
- [x] Air absorption — BiquadFilter lowpass: `3500/(1+d/120)`, min 280Hz
- [x] **Wet/dry blend** — dryGain (близко) + Resonance wet (далеко). `closeness=1-d/250`
- [x] Громкость: `Math.min(1, f*f*5.0) * (1-bZ) * fVol`, range=400px, default fVol=0.85
- [x] Автообнаружение через `manifest.json` (синхронный XHR)

### Аудио — пузыри
- [x] **Все три approach-источника — SpatialSource** (всегда, без флага `approachSpatial`)
  - Панорамируются как костры, `audio.updatePosition` каждый кадр
  - Radius detection: **900px** (было 600)
  - Multiplier **9.0** (было 4.5) — сигнал входит в Resonance на максимальном gain с ~600px
- [x] Inside-источники — DirectSource (без spatial, intimate feel)
- [x] **Видео-текстура** kalevala_texture.mp4 — `entry.videoEl.play()` при `onStart`
- [x] Bubble III (digital_echo) — `interiorMode: 'genesis'`, нет videoEl

### Аудио — ghost система
- [x] **Transient ghost** (`_startGhost`): запускается при ВЫХОДЕ из пузыря
  - createMediaElementSource → gainNode с envelope: fadeIn 3.5s, hold 4s, fadeOut 30s
  - Случайная позиция воспроизведения (через 300ms после старта)
  - Предыдущий ghost убивается при повторном входе
- [x] **Persistent ghost** (`_startPersistentGhost`): запускается при ПЕРВОМ ВХОДЕ
  - createMediaElementSource → lowpass(900Hz) → gainNode
  - Медленный фейд-ин 8s, peakVol=0.006
  - Мутируется при входе в любой пузырь (ramp 1.5s → 0)
  - Восстанавливается при выходе (ramp 5s → peakVol)
  - Накапливается: при посещении 3 пузырей играют 3 ghost-слоя одновременно

### Аудио — Delay World (Bubble III)
- [x] **8 костров в world-space** вокруг bubble III (2100, 2700)
- [x] Каждый — createMediaElementSource → inputGain → granularDelayChain → masterG
- [x] Гранулярный дилей: 7 тапов, LFO modulation (sine/triangle/sawtooth/square), tremolo, BiquadFilter per tap
  - baseDelay: 25ms–1.1s, feedback: 22–74%, LFO: 0.05–6Hz, tremolo: 0.4–18Hz
- [x] Визуал: используют `_drawBonfire()` с фазовым смещением (нет кастомного blue flame)
- [x] **Инициализируются только после закрытия intro** (в обработчике keydown → `_introActive = false`)
- [x] Слышны только внутри bubble III, fadeRange=520px

### Структура файлов
- [x] `sources/audio/ambient/` — first_level_loop_1.ogg
- [x] `sources/audio/bubbles/` — desert_pre.opus, kalevala_pre.opus, kalevala_bouble_2.opus, delay_pre.opus, delay_in.opus, delay_ghost_stereo.opus, ghost_desert_1.opus, kalevala_ghost_2.opus
- [x] `sources/audio/fires/` — 13 opus + manifest.json
- [x] `sources/video/` — desert.mp4, kalevala_texture.mp4
- [x] `sources/photo/` — stone_texture.jpg

---

## ⛔ Что нельзя делать

### createMediaElementSource
- Вызывать ОДИН РАЗ на элемент — повторный вызов бросит ошибку
- НЕ устанавливать el.volume для muting — только gain ноды
- Ambient (`_ambEl`) использует captureStream — НЕ вызывать на нём createMediaElementSource

### Gain ноды
- `setVolume` — только `_resGain.gain.value`. НЕ dryGain, НЕ setTargetAtTime
- `setDryWet` — прямое `.gain.value`. НЕ setTargetAtTime (накапливает события)
- `_bubbleZoom` НЕ СБРАСЫВАЕТСЯ в 0 на выходе — lerp сам доходит до 0 за ~1 сек
- Обе функции есть в SpatialSource и DirectSource — всегда использовать их, не напрямую

### Ghost
- `_startGhost` вызывается при ВЫХОДЕ — не трогать тайминг
- **catch path ОБЯЗАН** устанавливать `this._ghost = { el, gainNode: null, ... }` — иначе ghost не заглушается при входе в пузырь
- `_updateGhost` проверяет `ghost.gainNode !== null` перед `.gain.cancelScheduledValues()`; при null → `ghost.el.volume = 0`
- **Ghost kill при входе в пузырь**: ramp 0.3s (`linearRampToValueAtTime(0, now + 0.3)`), timeout 500ms — НЕ 2.0s/2600ms
- **Transient ghost peakVol = 0.18** (было 0.008 — почти неслышно без captureStream boost). Прямой connect к masterG — без boost chain
- **Persistent ghost peakVol = 0.12** (было 0.006 — inaudible). Fallback catch path: 0.12
- **Click-to-start**: index.html слушает `click` на overlay + `keydown` на document. InputManager добавляет mousedown в `_just` (держит до flush, не очищает при mouseup)
- **VideoEl muted**: `_makeVideo` устанавливает `el.muted = true` — native audio мутируется; Web Audio через createMediaElementSource работает независимо
- `_startPersistentGhost` вызывается при ПЕРВОМ ВХОДЕ — не раньше
- Persistent ghost мутируется внутри bubble через `_updatePersistentGhosts` каждый кадр

### Delay fires
- Инициализировать только после `_introActive = false` — иначе el.play() до intro exit
- `pt.inputGain.gain.value = 0` — silence пока не внутри bubble III
- Не вызывать в `onStart` — только в обработчике keydown
- **`inDelay`** = `this._enteredBubble?.id === 3` (НЕ `actId === 3`) — иначе delay fires остаются активны после выхода из bubble III
- **Fire volume**: `Math.min(1, f*f*2.5) * (1-bZ) * fVol` (было 0.55 — слишком тихо vs оригинальный captureStream дизайн). Multiplier 2.5 восстанавливает оригинальную громкость костров
- **Delay fires target**: `Math.min(1, f*f*2.5) * bVol` (тот же boost)

### Рендеринг
- Нет devicePixelRatio — намеренно (Retina 2× вызывал лаг)
- Шум генерируется один раз в конструкторе Renderer

### Пузыри
- Approach radius = **900px** (было 600)
- Bubble III не имеет videoEl — `interiorMode: 'genesis'`
- Все approach-источники — SpatialSource (не DirectSource)

### Fires manifest
- После добавления файлов → `tools/scan_fires.html`

---

## 🔁 Чеклист перед изменением аудио

1. Использую `createMediaElementSource` — один раз на элемент
2. Gain нода инициализирована в 0 — нет утечки при старте
3. Muting через gain ноды, НЕ el.volume
4. Ambient (`_ambEl`) — исключение, там captureStream
5. Ghost запускается в правильный момент (transient = exit, persistent = first entry)
6. Delay fires создаются только после intro dismiss
7. Approach sources = SpatialSource с filter:true

---

## 📁 Структура файлов

```
cosmos/
  index.html                ← точка входа. keydown → engine.start()
  studio.html               ← хаб (ИГРА + ГАЙД)
  START.command             ← python3 сервер + открыть Chrome
  engine/
    Engine.js
    AudioManager.js         ← SpatialSource (createMediaElementSource), DirectSource
    Renderer.js
    InputManager.js
  worlds/
    WorldBase.js            ← _setupMedia, onStart (всегда createSpatial для approach)
    world_01.js             ← весь игровой код мира 1
  sources/
    audio/
      ambient/              ← first_level_loop_1.ogg
      bubbles/              ← *_pre.opus, *_in.opus, *_ghost*.opus
      fires/                ← 13 × .opus + manifest.json
    photo/                  ← stone_texture.jpg
    video/                  ← desert.mp4, kalevala_texture.mp4
  tools/
    scan_fires.html         ← пересобрать manifest одним кликом
  LAUNCH.md
  COSMOS_SESSION_LOG.md     ← этот файл
```
