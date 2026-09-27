# ChatGPT-no-Hands · INPUT LAB

Alternative ChatGPT GUI controlled through head movement and facial expressions.

This repository currently contains **Input Lab**: a browser-only experimentation environment for webcam-based
interaction. It is a measurement instrument, not a product. Every layer between the camera and a GUI action is
visible, tunable and logged so we can answer questions like *"is a long blink better than a nod for confirmation?"*
empirically.

```
RAW INPUT → SIGNALS → INTERPRETATION → INTENT → INTERACTION STATE → GUI ACTION
```

Raw tracker values are never wired to GUI actions. Looking at a button never clicks it.

## Interfaces

The app has two interfaces that share the same camera, signal and interaction pipeline. Switch between them with
the tab strip in the header:

- **Input Lab** (`/`): the measurement instrument described below — every panel, threshold and event is visible.
- **ChatGPT No Hands** (`/chat`): a hands-free chat GUI that explores using ChatGPT without typing or voice. The user
  builds a prompt spatially — **choose → predict → choose** — with the existing Grid Glide head interaction:

  1. *Starters.* Ten high-utility first words (What, How, Why, Can, Summarize, Help, Create, Write, Explain, Compare — question words plus task verbs from common prompt-writing terms, see Research & open source) in a
     4 / 3 / 3 grid of large fields. No keyboard is shown.
  2. *Prediction compass.* After a pick the chosen text moves to the centre and 8 AI predictions appear around it in a
     fixed spatial grammar: **4 phrases (3–5 words) on the cardinal fields ↑ → ↓ ←** and **4 single words on the
     diagonals ↖ ↗ ↘ ↙**. Positions never move; only the content changes. The grid cursor re-centres after every
     pick so the next choice starts from the current text.
  3. *Input bar.* The canonical prompt accumulates in a ChatGPT-style bar with a head-selectable **Keyboard** escape
     hatch (a temporary on-screen keyboard for anything the predictions did not offer; confirmed text is appended
     verbatim and re-predicted), a **Back** control that removes only the most recent segment (predicted or typed)
     and restores that state's predictions, and a **Send** control. The bar grows with the wrapped prompt up to two lines; beyond that the text is cut off with a fade and the bar text itself becomes a head-selectable target that expands a panel over the compass showing the whole prompt (select again to collapse). The prompt is stored as segments
     (`src/chat/promptState.ts`), so it can be reconstructed and predicted vs. manual input stays distinguishable.
  4. *Reading mode.* Sending collapses the composer: the conversation takes everything above the tabs except a narrow column on
     its right, where scroll up, scroll down and **Reply** are stacked. Reply brings the word grid back; while composing in an
     ongoing conversation the left column is shared between Keyboard and a **Conversation** field that returns to
     reading, and the sidebar's free space shows the AI's **Last reply** for reference. Conversations opened from Recents start in reading mode.
  5. *Bottom navigation* switches between New Chat, Recents and Account (Account is a placeholder).
  6. *Recents* uses the same base grid: uncategorised chats in the left column, projects in the two right columns,
     three cards per column at compass-field height; when a list does not fit, its last slot becomes a dashed
     “N more” tile and, once paged, its first slot a “Previous” tile, both full-size fields. Each card has a head-selectable menu button; the menu opens as
     a panel of full-size fields over the projects area (chat: Pin · Rename · Delete chat · Move to project;
     project: Pin · Rename · Delete). Chats can also be dragged onto a project with the mouse. The counts and a
     New project field sit in the input-bar rows. Selecting a chat card's body opens that conversation in New
     Chat (its transcript loads and the compass continues it); selecting a project shows only its chats, with a
     "New chat" field to start a fresh conversation pre-filed under that project and an "All recents" field to
     return. New Chat saves every conversation into Recents on send (created on the first send, updated
     afterwards; a chat started from within a project is filed there on that first send). Data lives in a small
     localStorage store (`src/components/ChatNoHands/recents/`) seeded with sample chats.

  Every prediction request sends the **entire prompt so far** to `/api/predict`, which **streams**: Claude writes one
  candidate per line (`W: word` / `P: phrase`), and each line is validated, de-duplicated and checked for diversity the
  moment it's complete (`PredictionSelector` in `src/chat/predictionRules.ts`, unit-tested) and sent on as NDJSON.
  Each compass field fills in and fades in as soon as its own word or phrase exists (bursts are spaced ~80 ms apart);
  the coloured fields themselves animate once per pick, independently. Whatever the stream doesn't fill is asked for
  once more (plain request), then topped up from local fallback suggestions — the Keyboard is always available, so
  the user is never trapped. Replies come from `/api/chat`. Both routes share
  `src/server/llm.ts` (Anthropic SDK: predictions on `claude-sonnet-5` for speed, replies on `claude-sonnet-5` too; override
  with `ANTHROPIC_PREDICT_MODEL` / `ANTHROPIC_MODEL`; a key that isn't scoped to a workspace also needs
  `ANTHROPIC_WORKSPACE_ID`). An **Offline mode** switch in the sidebar (remembered per browser)
  sends nothing to Claude: predictions come from the local rules in the browser and replies are a short notice; the line
  under the switch says whether the server has a key (`/api/status`). Without `ANTHROPIC_API_KEY` (see `.env.example`)
  the app still works with local fallback suggestions and a placeholder reply, and the header shows
  “offline suggestions”. Mouse clicks on any field trigger the same action as a confirmed gesture, for testing.

  Its look follows ChatGPT's visual language (neutral palette, native system grotesque type, 768 px reading column,
  pill composer, 260 px sidebar, light and dark) and is built from shadcn/ui components under
  `src/components/shadcn/` with tokens scoped to `.chat-root` in `globals.css`. Opening the page switches the focus
  mode to Grid Glide and restores the previous mode when you leave; the other focus modes also work. Grid Glide
  fields here are not equal rectangles: every button's own box (measured from the DOM, `useMeasuredGrid`) is a
  field. The screen is laid out on a fine **base grid** (25 × 17 base cells, `BASE_PLACEMENT` in `spatial.ts`) that
  forms one block: the input bar (prompt ~2/3, Send ~1/3) and the three tabs span its whole width, while the word
  grid sits inside it between a 3-column Keyboard field on the left and a 3-column Back field on the right (both
  as tall as the word grid, in the sidebar's faded grey), each separated from the words by two empty gutter
  columns. Every control spans a whole number of base cells (a compass field is 5 × 3, a starter 3 × 4) and two
  empty rows separate the words from the bar, one the bar from the tabs. The navigator's snap distance is about
  one base gap for this layout, so that empty space really is empty. The nine word rows flex with the available
  height while the bar and tab rows have fixed pixel heights anchored to the bottom, so the bottom part never
  moves whatever is shown above it (heading, transcript, expanded prompt). Colour follows the conversation: starters use the
  full pastel rainbow; on the prediction screens the four cardinal phrase fields take the colour of the starter
  the user chose first and the four diagonal word fields share one random pastel picked when that starter was chosen
  and kept for the whole prompt, falling back to purple / blue when the prompt began with typed text; the tabs are white with the active
  one in the sidebar's selection grey; short enter / leave / pick
  animations (≤ 300 ms) mark changes without moving anything. The
  navigator's snap distance is about one base gap for this layout, so that empty space really is empty. The nine
  compass rows flex with the available height while the bar and navigation rows have fixed pixel heights anchored to
  the bottom, so the bottom part never moves whatever is shown above it (heading, transcript, expanded prompt). Turn on
  EXPERIMENT MODE in the lab header to see the base grid lines under the chat. The navigator gained explicit `cells` for this (`layoutFromRects`); the lab's equal grid is the
  same mechanism with uniform cells.

## Run

```bash
npm install     # also copies MediaPipe wasm to public/ and downloads the face model (~4 MB)
npm run dev     # http://localhost:3000
npm test        # vitest: detectors, state machine, calibration, smoothing, focus hit-testing
```

Camera frames never leave the browser: the MediaPipe wasm and model are served from `public/`, there is no backend,
no analytics and no video storage. The signal recorder stores normalized numbers only, never video.

If `npm install` could not download the model (offline), fetch it manually into `public/models/face_landmarker.task`
from `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
or run `npm run setup-assets` later.

## Using the lab

1. **START CAMERA**, allow permission. Denied/unavailable cameras show a diagnostic message.
2. **CALIBRATE**: look at the screen naturally for 2 s. This captures your neutral head pose, eye openness, mouth and
   brow baseline; all normalized signals are relative to it. Recalibrate any time.
3. Turn your head toward a card, button or key in the **INTERACTION TEST AREA**. The crosshair is a **head pointer**
   (MediaPipe does not provide screen-space gaze; the panel says so and never pretends otherwise).
4. Keep the pointer on a target: `FOCUSED` → after the gaze-hold time (800 ms default) → `ARMED` (amber ring).
5. Perform a deliberate confirmation gesture (default: long blink ≥ 600 ms, or a nod) → `CONFIRMING` → `EXECUTING`
   → `COOLDOWN`. Head shake cancels.
6. Read the **EVENT LOG** to see every event, its duration, the threshold that applied and its heuristic confidence.
   Press **F** (or MARK FALSE +) to tag the last executed action as unintended; the test-area header counts them.

**SETTINGS** (top right) changes every threshold, smoothing factor and gesture→intent binding live, switches between
the three focus modes, and resets to defaults:

- **HEAD POINTER**: the crosshair hit-tests targets directly (default).
- **DISCRETE STEPS**: holding the head past a threshold steps focus LEFT/RIGHT/UP/DOWN to the nearest neighbour.
- **GRID GLIDE**: the test area switches to a grid layout in which every card, button and key is exactly one field
  of a ragged grid (a row of 4 cards has 4 wide fields, a row of 10 keys has 10 narrow ones). Head movement is
  interpreted like a mouse: the *change* in yaw/pitch moves a cursor, scaled by *Sensitivity*, with *Acceleration*
  (fast flicks travel further than slow returns) and a *Dead zone* on head speed that ignores jitter. RECENTER (or
  calibrating) puts the cursor back in the middle; ABSOLUTE switches to a direct head-angle mapping for comparison.
  The field under the cursor is highlighted while gliding, but nothing is focused until the cursor stops on a field
  (velocity below *Settle velocity* for *Settle time*). Then the field's target becomes the focus and the usual
  dwell → `ARMED` → confirm ladder applies. Field switches use hysteresis (*Cell hysteresis*) so jitter at a boundary
  does not flicker. Moving again drops the focus; the dwell restarts when you stop on a field.

## Architecture

```
src/
  tracking/      TrackingProvider interface, MediaPipeProvider (the only file that imports MediaPipe), headPose.ts
  signals/       normalizeSignals (raw → calibrated -1..1 / 0..1), smoothSignals (EMA + dead zone), calibration, pointer
  quality/       heuristic tracking-quality estimator (face size, framing, motion, latency)
  gestures/      one detector per gesture: blink/long blink, nod, head shake, mouth open/hold (with speech guard),
                 eyebrows, look-away, head-step (discrete nav), gaze dwell. Each reports live status + thresholds.
  events/        typed event bus with ring buffer (the event log reads from here)
  interaction/   FocusManager (target registry + hit test + stepping), GridNavigator (grid glide focus mode: mouse-like
                 relative cursor over a GUI-declared ragged grid, field hysteresis, settle detection), InteractionStateMachine
                 (IDLE → NAVIGATING → FOCUSED → ARMED → CONFIRMING → EXECUTING → COOLDOWN, plus TRACKING_LOST),
                 bindings lookup, ActionDispatcher (the only bridge to the GUI)
  pipeline/      Pipeline.ts orchestrates the layers per frame; recorder.ts records/replays the signal stream
  store/         LabStore (high-frequency state, published to React at ~20 Hz), settingsStore (localStorage)
  config/        DEFAULT_THRESHOLDS + slider metadata, DEFAULT_BINDINGS, blendshape names
  components/    Camera, Signals, Gesture detectors, Interaction state, Test GUI, Event log, Calibration, Settings, Recorder
```

Design rules enforced by the code:

- The GUI registers targets via `useFocusable` and receives `ActionEvent`s from the dispatcher. It never sees gestures
  or MediaPipe.
- Only `ARMED` + a gesture bound to `CONFIRM` (or `FOCUSED`/`ARMED` + a gesture bound to `ACTIVATE`) reaches
  `EXECUTING`. `TRACKING_LOST` resets detectors and can never execute.
- Detectors are temporal: a nod is CENTER → DOWN → CENTER within a max duration starting from neutral, not "head is
  below neutral". Natural blinks emit `BLINK` (bound to nothing by default). Mouth hold rejects oscillating openness.
- Confidence values are heuristic combinations of strength, duration margin, symmetry and tracking quality; they are
  labelled "heur." everywhere.

## Swapping the tracker

Implement `TrackingProvider` (`src/types/tracking.ts`): produce `TrackingFrame`s with normalized landmarks, a
blendshape map and optionally a 4x4 head matrix, then pass an instance to `pipeline.attachProvider()`. Nothing else
needs to change.

## Known limitations / to verify on a real face

- The yaw/pitch sign convention of the MediaPipe transformation matrix is derived from the canonical face model, not
  measured. If turning right moves the pointer left, toggle **INVERT YAW** / **INVERT PITCH** in settings (and tell us).
- Head range defaults (±20° yaw, ±15° pitch → full pointer travel) and the 1.4 pointer gain are starting points.
- Screen-space gaze is unavailable. `eyeX/eyeY` from `eyeLook*` blendshapes can be blended into the pointer with the
  "Eye blend" slider, but it is experimental and noisy.

## Research & open source

Sources and tools this project builds on. Keep this list current when a new one is used.

**Research / references**

- Villaroman, N., Rowe, D., & Helps, R. (2013). *Design and evaluation of face tracking user interfaces for
  accessibility.* Proceedings of the 2nd Annual Conference on Research in Information Technology (RIIT '13), 65–70.
  ACM. https://doi.org/10.1145/2512209.2512218 — consumer-grade face tracking as cheap, non-intrusive input for
  people who can't use a mouse and keyboard but can control their head. Its five stages of a face tracking UI map
  onto this pipeline and structure the in-app **Technicalities** page (Account › Settings › More):
  user input (head movement, face and head gestures) → capture technology (webcam, `getUserMedia`) → feature
  retrieval (MediaPipe Face Landmarker) → feature processing (calibration, smoothing, dead zone, detectors, state
  machine) → pointer behaviour (Grid Glide: magnetic grid, dwell to arm, gesture to confirm).
- University of Minnesota CCAPS, *Common Writing Prompt Terms* —
  https://ccaps.umn.edu/esl-resources/students/writing/common-prompts — the common instruction verbs used in prompt
  writing (Explain, Summarize, Compare, Define, Outline, …); reviewed for the New Chat starter words.

**Open-source tools**

- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) — FaceLandmarker (landmarks, blendshapes,
  head transformation matrix), run in the browser via wasm
- [Next.js](https://nextjs.org), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com), [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css)
- [shadcn/ui](https://ui.shadcn.com) on [Radix UI](https://www.radix-ui.com), with class-variance-authority, clsx and
  tailwind-merge
- [Lucide](https://lucide.dev) icons
- [Zod](https://zod.dev) — validation of model responses
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) — predictions and replies
- [Vitest](https://vitest.dev), [ESLint](https://eslint.org) — tests and linting
