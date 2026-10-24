# RepCounter

**Try it:** https://akarev-maker.github.io/RepCounter/

Upload a video of a set, and RepCounter counts your reps in the browser. For
curls it tracks each arm separately and flags uneven sets. You can confirm or correct the
count, log the weight, and get a next-session target.

Everything runs on your device. Videos are never uploaded or stored; only the
set summary (date, exercise, weight, reps, effort) is saved to `localStorage`.

## Recording in the browser

Tap **Record a set** to film with the phone or laptop camera instead of
uploading. It records video only, without the microphone, so music playing in
another app isn't interrupted. There is a 0/3/5/10 s start timer, a front/back
camera switch, and the screen is kept awake while recording. The recording is
counted exactly like an uploaded clip and is never stored. The camera needs a
secure page: `localhost`, or the site served over https.

## How it works

1. The clip is sampled at 15 fps and each frame goes through the
   [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
   (lite model, WebGL with a CPU fallback).
2. A joint angle is median-smoothed and fed to a state machine with
   hysteresis: a rep counts only after a full extension, a full bend, and a
   return to extension. Low-confidence frames pause counting rather than
   guessing.
   - Curl: elbow (shoulder–elbow–wrist), bent ≤ 70°, straight ≥ 150°.
   - Squat: hip height, using only the vertical positions of hip, knee and
     ankle, so it works filmed from the side or the front. Depth is shown as
     a percentage: 100% means the hips came down level with the knees. A rep
     counts at 20% depth and once you stand back up; reps that never reach
     45% still count but are marked "go deeper". Both legs are averaged when
     both are clearly visible; otherwise the more visible leg is used.
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
  in frame; side, three-quarter and front views all work.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests, including recorded pose data from real clips
npm run build
```

Requires Node 22.12+ (or 20.19+). Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Testing

See [`.kiro/specs/rep-analyzer/manual-test-notes.md`](.kiro/specs/rep-analyzer/manual-test-notes.md)
for what has been verified on real video and what is still an assumption.
