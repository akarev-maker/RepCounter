# Design — Workout Rep Analyzer

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS
- `@mediapipe/tasks-vision` Pose Landmarker (VIDEO running mode)
- `<video>` + absolutely-positioned `<canvas>` overlay
- localStorage for session summaries

## Architecture (separation of concerns)

```
src/
  pose/
    poseLandmarker.ts   // load model, wrap detectForVideo(video, tsMs)
    landmarks.ts        // landmark index constants, angle math, selection
  counting/
    repCounter.ts       // PURE state machine. No DOM, no MediaPipe imports.
    smoothing.ts        // moving-average / median smoothing (pure)
  analysis/
    useVideoAnalysis.ts // orchestrates: drive video frames -> pose -> counter
  storage/
    sessions.ts         // localStorage CRUD for summaries
    settings.ts         // progression settings persistence
  progression/
    progression.ts      // PURE suggestion rules + explanation
  components/           // Uploader, VideoStage, Controls, Results, History, Settings
  App.tsx
```

Key rule: `counting/repCounter.ts` and `progression/progression.ts` import
nothing from React or MediaPipe so they are unit-testable in isolation.

## Pose tracking
- Model: `pose_landmarker_lite.task` served from `/public/models`.
- `FilesetResolver.forVisionTasks(<wasm cdn>)` then
  `PoseLandmarker.createFromOptions({ baseOptions:{ modelAssetPath }, runningMode:"VIDEO", numPoses:1 })`.
- Landmark indices: LEFT shoulder/elbow/wrist = 11/13/15; RIGHT = 12/14/16.
- Elbow angle = angle at elbow between shoulder->elbow and wrist->elbow vectors,
  computed in normalized image space (aspect-corrected using video dimensions).

## Analysis loop (process-once, deterministic, replay-safe)
- On load we run a controlled pass: step the video via `requestVideoFrameCallback`
  (fallback: timed seeks) from start to end, calling
  `detectForVideo(video, Math.round(mediaTimeMs))` with strictly increasing
  timestamps.
- Each frame yields the selected arm's elbow angle + min visibility of the three
  landmarks. These feed the pure rep counter.
- Results (count + rep timestamps) are stored in state once. Replaying or
  scrubbing only moves the playhead; it never re-feeds the counter. A re-analyze
  action resets the counter explicitly.

## Rep counter state machine (pure)
States: `EXTENDED`, `FLEXING`, `FLEXED`, `EXTENDING`.
- Smoothed angle `a` (moving median window).
- Thresholds with hysteresis: `flexEnter` (e.g. ≤ 70°), `extendEnter` (e.g. ≥ 150°).
- Transitions:
  - EXTENDED: a ≤ flexEnter -> FLEXED (we treat reaching flexion as the turn)
  - FLEXED: a ≥ extendEnter -> count++ , record timestamp, back to EXTENDED
- Confidence gate: if min visibility < `minVisibility` for > N consecutive
  frames, emit `trackingLost`, discard any in-progress cycle (reset to EXTENDED
  without counting), and surface the status to UI.
- Inputs that don't cross a threshold never change the count (handles partials
  and jitter). Idempotent: feeding the same frame twice (same tsMs) is ignored.

## Results + history
- Results panel: big count, editable number, clickable timestamp chips (seek),
  weight input + unit toggle (per dumbbell note), RPE picker
  (Easy / Just right / Hard / Failed), Save.
- `sessions.ts`: array of `SessionSummary` in localStorage key `ra.sessions.v1`.
- History list newest-first with delete and clear-all.

## Progression (transparent double-progression)
Per-exercise, editable, persisted settings: `repRangeMin`, `repRangeMax`,
`increment`, `unit`, `successSetsRequired` (default 2 — a single good set does
NOT raise weight). Rules evaluated in order against confirmed history for the
same exercise + current weight:
1. If last set reps < `repRangeMin` OR effort = "failed":
   suggest SAME weight, target `repRangeMin`.
   reason: below range / failed -> repeat weight.
2. If last set reps ≥ `repRangeMax` (hit top):
   look back at the most recent sessions at the current weight. If at least
   `successSetsRequired` consecutive of them hit `repRangeMax` and none were
   "failed": suggest +`increment`, target `repRangeMin`.
   Otherwise: suggest SAME weight, target `repRangeMax` (confirm before adding).
3. Else (inside range): suggest SAME weight, target reps+1 (toward max).
Every suggestion returns `{ weight, reps, reason }`; reason is a plain sentence
citing the actual numbers used (e.g. "hit 12 reps at 25 lb for 2 sessions").

## Exercise registry (pluggable)
`exercises/registry.ts` maps an exercise id to an `ExerciseDef`:
```ts
interface ExerciseDef {
  id: string; label: string;
  joint: "elbow" | "knee";           // which angle to track
  landmarks: { left:[number,number,number]; right:[number,number,number] };
  sided: boolean;                     // true => arm/side selector shown
  // angle at `flexEnter` is the bottom of the movement for this exercise
  flexEnter: number; extendEnter: number;
  defaults: { repRangeMin:number; repRangeMax:number; increment:number; unit:Unit };
}
```
Curl = elbow, sided, flex ≤70° / extend ≥150°, defaults 8–12.
Adding squats later = one registry entry (knee, not sided, hip/knee/ankle
landmarks, e.g. flex ≤100° / extend ≥160°, defaults 5–8). The counter, overlay,
and analysis loop read from the def and need no change.

## Error handling
- Model load: retry button + CDN/network hint.
- Video decode: detect via `video.error` / `loadedmetadata` timeout; show format
  guidance (mp4/H.264/webm).
- No pose: if analysis pass finds no person in any frame, show guidance.

## Types
```ts
type Unit = "lb" | "kg";
type Arm = "left" | "right";
type Effort = "easy" | "just-right" | "hard" | "failed";
interface SessionSummary {
  id: string; dateISO: string; exercise: "dumbbell-curl";
  arm: Arm; weight: number; unit: Unit; reps: number; effort: Effort;
}
interface RepEvent { index: number; tsMs: number; }
```
