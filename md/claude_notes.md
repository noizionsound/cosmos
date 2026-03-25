# COSMOS — Project State (Claude internal notes)

## Что это
HTML5 Canvas top-down игра-исследование на основе перформанс-проекта **ECHO** Даниила — мифология + традиционная музыка + ML обработка звука.

Файл игры: `ECHO/cosmos/index.html` — открывать в **Chrome** (Web Audio API, captureStream).

---

## Текущее состояние движка

### Мир
- Canvas viewport: **960×640**
- World size: **4200×3000** (камера плавно следует за игроком, lerp 0.085)
- Фон: тайлованная текстура камня (`stone_texture.jpg`) + минеральные блики (60 world-space точек) + вращающийся белый шум
- Зональное освещение: тёплый янтарь (I), индиго (II), мшистый зелёный (III) — пульсирует вокруг каждого пузыря (radius 420px)
- Виньетка + туман на краях мира (последние 12% с каждой стороны)
- **Объекты мира**: 260 процедурных элементов (менгиры, плиты, кластеры, руны, колонны, галька) — детерминированный seeded random `sr(n)`
- **Коллизии**: менгиры (t<0.18) и колонны (0.74≤t<0.83) блокируют проход
- **Следы**: персонаж оставляет отпечатки ног (36 точек, fade 180 кадров)
- **Атмосферные частицы**: 55 пылинок, реагируют на ветер
- **Ветер**: случайные порывы каждые 5–8 сек

### Персонаж
- Полностью нарисован в canvas (`drawChar`), фото не используется
- Чёрно-белый graphic novel стиль: белое тело, чёрный контур, рюкзак с ремнями
- Управление: WASD / стрелки, все 4 направления
- Walk cycle, боб, наклон, тень под ногами, тянущийся light trail (18 точек)
- Speed: **1.5 px/frame**, инерция lerp 0.20

### Пузыри (порталы) — треугольник
| ID  | Координаты     | Расположение   |
|-----|----------------|----------------|
| I   | (300, 300)     | top-left       |
| II  | (3900, 300)    | top-right      |
| III | (2100, 2700)   | bottom-center  |

3D-рендер: radial gradient base + diffuse + specular hotspot + rim shadow + outer halo.
При приближении: пульсирует сильнее + `[enter]` подсказка.
При входе (Enter рядом): iris-wipe переход, полноэкранный интерьер.

Сфера bubble I: кадр `desert.mp4` (cover-fill) внутри шара.
Сфера bubble II: кадр `kalevala_texture.mp4` (cover-fill) внутри шара.
Сфера bubble III: только нумерал `III` (без рун на сфере).

### Интерьеры пузырей
- **I**: видео `desert.mp4` на весь экран (90% viewport, сохранение aspect ratio), перематывается при входе
- **II**: `kalevala_texture.mp4` как **пол под ногами** — видео 120% oversized, параллакс `ox = -(P.x - b2.wx) * 0.055`, персонаж ходит по видео-поверхности + footprints + виньетка по краям
- **III**: ритуальная камера — 3 кольца вращающихся рун (ᚠ…ᛟ) + пульсирующий **ᛟ** в центре + огонь снизу

Если посещены все 3: золотая вспышка + надпись `ᛟ · the circle is complete · ᛟ`

---

## Аудио (Web Audio API, только Chrome)

`bootAudio()` запускается по клику на оверлей.

### Архитектура — captureStream + HRTF (биноуральный рендер)

**Только captureStream** (createMediaElementSource убран — тихо фейлит на `computer://`).

```
el.volume = 1/BOOST (0.033) → нативный вывод –30 dB (почти не слышно)
captureStream() захватывает этот уровень
boost gain = BOOST (×30) внутри Web Audio восстанавливает уровень
```

**Граф для каждого spatial-источника:**
```
[media el] → captureStream → MediaStreamSource
                                   ↓
                             boost gain (×30)
                                   ↓
                            HRTF PannerNode  ← positionX/Z = (dx/100, dy/100) каждый кадр
                                   ↓
                            spatial gain (0..1)  ← manual falloff
                                   ↓
                            masterGain (0.60)
                                   ↓
                            DynamicsCompressor  (threshold –18 dB, knee 8, ratio 3:1)
                                   ↓
                            AC.destination
```

**Listener**: зафиксирован в (0,0,0), forward (0,0,–1), up (0,1,0). Источники позиционируются в XZ-плоскости: `(dx/100, 0, dy/100)` где dx/dy — вектор от игрока к источнику. `rolloffFactor = 0` — встроенный falloff отключён, только HRTF-азимут.

**КРИТИЧНО**: `el.volume = 0` убивает captureStream. Всегда `el.volume = 1/BOOST`.

### Источники и маршруты

| Источник          | Файл                                         | Тип       | Поведение                                   |
|-------------------|----------------------------------------------|-----------|---------------------------------------------|
| Ambient           | `sources/audio/first_level_loop_1.wav`       | `<audio>` | Нет Web Audio, `el.volume` напрямую (0.72/0.18) |
| Bubble I approach | `sources/audio/bouble_1_loop_1.wav`          | `<audio>` | HRTF spatial, fade (dist/1400)², только вне пузыря |
| Bubble I inside   | `sources/video/desert.mp4`                   | `<video>` | HRTF, vol = bubbleZoom × 0.92, только когда activeBId===1 |
| Bubble II approach| `sources/video/kalevala_texture.mp4`         | `<video>` | HRTF spatial, fade (dist/1400)², только вне пузыря |
| Bubble II inside  | `sources/audio/kalevala_21_03_26.wav`        | `<audio>` | HRTF, vol = bubbleZoom × 0.92, только когда activeBId===2 |
| Research × 5      | `sources/audio/research /` (папка с пробелом)| `new Audio()` | HRTF spatial, fade (dist/400)², 5 точек в мире |

### Research points

Файлы в папке `sources/audio/research /` (trailing space в имени папки):
1. `(Okänt,_ska_kompletteras)_-_SMV_-_SVA_CYL_0456.wav`
2. `03 - Chants of the old men from Bathhurst Island.mp3`
3. `06 - Music from Korobori.flac`
4. `1._Björnsång_..._SVA_CYL_0390.wav`
5. `1._Familjefaderns_..._SVA_CYL_0327.wav`

URL строится как `encodeURI('./sources/audio/research /' + filename)`.
Позиции: детерминированные через `sr(i*19+3)`, минимум 500px от центров пузырей, retry до 12 раз.
Radius слышимости: 400px. Видны на минимапе (зелёные точки, ярче при близости).

### Кросс-фейды

- **Подход → вход в пузырь**: approach vol × `(1 - bubbleZoom)`, inside vol × `bubbleZoom`
- **bubbleZoom lerp**: enter 0.10, exit 0.055 (плавный выход = плавный fade аудио)
- **Ambient duck при входе**: lerp 0.72 → 0.18 (шаг 0.04/кадр)
- **activeBId**: `(enteredBubble || lastEnteredBubble).id` — сохраняет ID последнего пузыря при выходе, чтобы fade работал плавно

### Убрано по просьбе Даниила
- Процедурные дроны
- HRTF ambient clicks
- Footstep sounds
- Руны на сфере bubble III (остался только нумерал)

---

## Minimap
- Размер: **41px** ширина (было 82, уменьшено в 2×), нижний правый угол
- Посещённые пузыри: золотой кружок + нумерал
- Research points: маленькие зелёные точки (ярче в radius 400px от игрока)
- Viewport rect + позиция игрока (белая точка)
- Скрывается при входе в пузырь (bubbleZoom > 0.5)

---

## Структура файлов

```
ECHO/cosmos/
├── index.html              ← вся игра (один файл, ~1660 строк)
├── md/
│   ├── claude_notes.md     ← этот файл
│   └── materials_guide.md
└── sources/
    ├── audio/
    │   ├── first_level_loop_1.wav      ← ambient (глобальный)
    │   ├── bouble_1_loop_1.wav         ← bubble I approach
    │   ├── kalevala_21_03_26.wav       ← bubble II inside (vocal, 233 сек, 65MB)
    │   └── research /                  ← (папка с пробелом в конце)
    │       ├── (Okänt,...) CYL_0456.wav
    │       ├── 03 - Chants of the old men from Bathhurst Island.mp3
    │       ├── 06 - Music from Korobori.flac
    │       ├── 1._Björnsång_... CYL_0390.wav
    │       └── 1._Familjefaderns_... CYL_0327.wav
    ├── video/
    │   ├── desert.mp4                  ← bubble I interior + sphere preview
    │   └── kalevala_texture.mp4        ← bubble II floor + sphere preview + approach audio
    └── photo/
        └── stone_texture.jpg           ← фон (тайлованный)
```

---

## draw() render order

| Шаг | Функция / код | Описание |
|-----|--------------|----------|
| 1   | stonePat | тайлованная текстура камня, scrolled с камерой |
| 1b  | mineral sparkle | 60 мерцающих точек в world-space |
| 2a  | zone atmosphere | radial gradient пулы вокруг каждого пузыря |
| 2   | noiseC | вращающийся белый шум |
| 3   | drawPlayerTrail() | light trail за игроком |
| 3b  | drawFootprints() | отпечатки ног на земле |
| 4   | drawWorldObjects() | менгиры, плиты, руны, колонны, галька |
| 4b  | drawLoreTexts() | тексты над рунными знаками при приближении |
| **4c** | **drawBubbleBleed()** | **контент пузыря просачивается в мир при приближении (dist < 520px), cubic falloff, круг 62→282px, мягкий edge vignette** |
| 5   | bubbles.forEach(drawBubble) | 3D-сферы пузырей |
| 6   | drawPlayer() | персонаж |
| 7   | drawParticles() | атмосферная пыль |
| 8   | vignette gradient | радиальное затемнение краёв экрана |
| 9   | world-edge darkness | туман на границах мира |
| 10  | drawBubbleIndicators() | шевроны для off-screen пузырей |
| 11  | drawMinimap() | карта (нижний правый угол) |
| 12  | bubbleFlash | вспышка при входе |
| 12b | iris wipe | radial cut-in при переходе |
| 13  | bubble interior | полноэкранный интерьер (bId 1/2/3) |
| 14  | culmination | золотая вспышка + текст при посещении всех 3 |
| HUD | coords + controls + nearest bubble | без shake-трансформации |

---

## Ключевые технические решения

- **Один HTML файл** — всё в `index.html`, никаких зависимостей, никаких npm
- **Canvas 2D** — не WebGL, полный ручной контроль рендера
- **captureStream-only audio** — MES убран (тихо фейлит на computer://)
- **HRTF PannerNode** — биноуральный рендер; listener (0,0,0); источники в XZ; rolloffFactor=0
- **DynamicsCompressor** — threshold –18 dB, knee 8, ratio 3, attack 5ms, release 200ms
- **el.volume = 1/BOOST** — обязательно для captureStream; volume=0 убьёт поток
- **Ambient duck при входе**: lerp 0.72 → 0.18 (шаг 0.04/кадр)
- **Кросс-фейд approach/inside**: approachVol × (1–bubbleZoom), insideVol × bubbleZoom
- **Smoother exit**: bubbleZoom lerp exit = 0.055 (vs enter 0.10)
- **Seeded random `sr(n)`** — мир одинаков при каждой загрузке
- **Chrome only** — Safari не поддерживает captureStream нормально
- **Bubble II parallax**: `ox = -(P.x - b2.wx) * 0.055`, clamped до ±(dw-CW)/2 = ±96px
- **Bleed video cover-fill**: `scale = bleedR*2 / Math.min(vw,vh)` — заполняет круг без пустых полос
- **Zone atmosphere frustum cull**: пропускаем если весь circle (r=420) за экраном
- **Research folder trailing space**: `encodeURI('./sources/audio/research /' + filename)`

---

## Backlog

- [x] Звуки bubble I (desert.mp4 inside + bouble_1_loop_1 approach) — сделано
- [x] Звуки bubble II (kalevala_texture.mp4 approach + kalevala_21_03_26 inside) — сделано
- [x] Bubble II interior: kalevala video как walkable floor — сделано
- [x] drawBubbleBleed() — bleed эффект при приближении — сделано
- [x] Bubble II sphere: kal_tex видео-превью внутри шара (cover-fill) — сделано
- [x] Bubble III sphere: убрана руническая придумка, остался нумерал — сделано
- [x] Lore texts: 23 фрагмента (geophysics / anthropology / kalevala) — сделано
- [x] Culmination: 3 строки с задержкой (80 / 220 / 370 кадров) — сделано
- [x] HUD coordinates: нормализованные 0.000…1.000 (field recorder стиль) — сделано
- [x] HRTF биноуральный рендер (PannerNode, rolloffFactor=0) — сделано
- [x] DynamicsCompressor на выходе — сделано
- [x] Research points: 5 точек в мире, audio из папки research / — сделано
- [x] Minimap: уменьшена до 41px (было 82) — сделано
- [x] Research points на минимапе (зелёные точки) — сделано
- [x] Плавный fade при выходе из пузыря (zLerp exit=0.055) — сделано
- [ ] Аудио для bubble III (Даниил определит контент)
- [ ] Touch controls (опционально)
