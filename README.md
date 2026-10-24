# RepCounter

Upload a video of a set, and RepCounter counts your reps in the browser. For
curls it tracks each arm separately and flags uneven sets. You can confirm or correct the
count, log the weight, and get a next-session target.

Everything runs on your device. Videos are never uploaded or stored; only the
set summary (date, exercise, weight, reps, effort) is saved to `localStorage`.

## How it works

1. The clip is sampled at 15 fps and each frame goes through the
   [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
   (lite model, WebGL with a CPU fallback).
2. A joint angle is median-smoothed and fed to a state machine with
   hysteresis: a rep counts only after a full extension, a full bend, and a
   return to extension. Low-confidence frames pause counting rather than
   guessing.
   - Curl: elbow (shoulder–elbow–wrist), bent ≤ 70°, straight ≥ 150°.
   - Squat: knee (hip–knee–ankle), bent ≤ 110°, standing ≥ 155°. Both legs
     are averaged when both are clearly visible; otherwise the more visible
     leg is used.
3. Each rep gets a timestamp you can click to jump to it in the video.
4. The next-set target uses double progression: add reps within your range, and
   add weight only after hitting the top of the range on two sets in a row.
   The rep range (3–5, 6–10, 8–12, 12–20 or custom) and the other rules are
   editable per exercise.

## Supported

- Exercises: dumbbell curl (one arm, or both arms together or alternating),
  and squat (bodyweight or loaded).
- Video: anything the browser can decode. iPhone `.mov` (HEVC) works in Chrome
  and Safari on macOS; Firefox can't decode HEVC.
- Filming: phone held still. Curls need the shoulder and torso in frame, and
  front-facing is best for both-arm sets. Squats need hips, knees and ankles
  in frame, and a side or three-quarter view works best.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests, including recorded pose data from real clips
npm run build
```

Requires Node 20+.

## Testing

See [`.kiro/specs/rep-analyzer/manual-test-notes.md`](.kiro/specs/rep-analyzer/manual-test-notes.md)
for what has been verified on real video and what is still an assumption.
