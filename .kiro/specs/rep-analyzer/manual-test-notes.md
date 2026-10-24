# Test Notes — RepCounter

Last updated: 2026-10-24. Separates what was actually run from what is assumed.

## Automated unit tests (`npm test`, 38 passing)

Includes recorded angle sequences from six real clips: the Pexels clip (4 reps,
left arm), the user's first iPhone clip (6 reps, right arm), and the user's four
labeled gym clips (see the gym section below).

`src/counting/balance.test.ts`: a one-rep difference is flagged and names the
arm with more reps; even counts; only one arm moved; neither arm moved; the
weaker arm drives progression.

`src/counting/repCounter.test.ts`
- Synthetic sequences: full cycle counts once; 3 cycles count 3; partial flex
  without re-extension = 0; movement that never reaches flexion = 0; jitter
  around the flex threshold never counts per oscillation; sustained low
  confidence sets `trackingLost` and discards the in-progress cycle;
  non-increasing timestamps are ignored (replay cannot duplicate); null angle
  is treated as low confidence.
- Clip starts already flexed: the first half-cycle is not counted.
- Tracking regained while flexed: needs a fresh extension before counting.
- **Real pose data** (`__fixtures__/pexels-seated-curl.json`): elbow angles
  recorded from RepCounter running MediaPipe on a real clip. Working (left)
  arm = 4 reps with start/end times within tolerance of hand-read values;
  resting (right) arm = 0 reps.

`src/progression/progression.test.ts`: below range / Failed repeat the weight;
inside range adds a rep; one top-of-range set does not add weight; two in a row
do; a weight change resets the streak; increment applies in the last set's unit.
Both-arm sets progress from the weaker arm, and weight is only added once both
arms reach the top of the range twice in a row.

## End-to-end runs in headless Chrome (real app, real video)

Clip: Pexels video 9644934 (free license), seated single-arm curl, 4 reps with
the person's left arm, 19.9 s. Converted with ffmpeg into the variants below.
Script: `.testclips/e2e.mjs` (not committed).

| Clip | Result |
|---|---|
| H.264 `.mov` (720×1366) | Plays. Right arm: 0 reps + hint "left arm looks like the working arm (4)". After "Use left": 4 reps at 0:04.9, 0:08.3, 0:12.2, 0:15.9. Overlay sits on the arm. |
| H.264 `.mov`, landscape pixels + 90° rotation flag (iPhone style) | Displays upright; overlay aligned; same 4 reps. |
| HEVC `.mov` (`hvc1`) | Plays in this Chrome on macOS; same 4 reps. |
| Corrupt `.mov` tagged `hvc1` | Shows the HEVC-specific "Can't play this video" message; Count reps disabled. |
| Mobile viewport 390×844 | Layout stacks; overlay aligned; same 4 reps. |
| Replay at 4× after analysis | Count unchanged (4 → 4). |
| Save 4 reps @ 20 lb, Just right | Appears in History; target = "20 lb × 8 reps" with the below-range reason. |
| **User clip `IMG_6342.MOV`**: iPhone HEVC, 10-bit HDR (HLG + Dolby Vision), 1080×1920, 15.5 s, seated, filmed from the front, right arm, no dumbbell | Plays in Chrome on macOS. Right arm: **6 reps**, starting at 0:02.5, 0:04.1, 0:05.9, 0:07.9, 0:09.7, 0:11.8. Left arm: 0. No false reps while walking to or from the phone. Arm visible in 100% of frames. Replay at 4×: 6 → 6. Analysis took 10.9 s. |

The user clip's angle trace shows six clean dips to 8–25° and returns to
160–180°, so the default thresholds (≤ 70°, ≥ 150°) have wide margins on it.
Its angles are saved as `__fixtures__/user-seated-curl-front.json` (no video).

Analysis time: about 11–17 s for the 19.9 s clip (15 fps sampling, GPU delegate
in headless Chrome).

## User's labeled gym clips (Both arms mode, headless Chrome)

All four are iPhone HEVC HDR, 1080×1920, run with the default thresholds.
Angle sequences are saved as fixtures with matching unit tests.

| Clip | True count | Detected | Notes |
|---|---|---|---|
| `AlternatingCurl_5right_4_left.MOV` (12.8 s, front) | R 5, L 4 | **R 5, L 4** | Reps interleave correctly: R 0:01.5, L 0:03.1, R 0:04.2, L 0:05.4, R 0:06.5, L 0:07.6, R 0:08.7, L 0:09.7, R 0:10.6. Flagged: "Uneven set. Your right arm did 1 more rep than your left (5 vs 4)." Both arms visible 100%. Same result at 390×844 mobile. Replay unchanged. |
| `CurlFromside_6.MOV` (12.3 s, side view) | R 6 | **R 6, L 0** | Reps at 0:01.2, 0:02.9, 0:04.3, 0:05.6, 0:07.0, 0:08.4. Far arm produced no false reps. |
| `QuickCurls_5.MOV` (8.8 s) | R 5 | **R 5, L 0** | Reps about 1.2 s apart (0:01.5 to 0:06.5); 15 fps sampling was enough. |
| `moving_camera_side_angle_7.MOV` (15.8 s, handheld close-up) | 7 | **0** | Arms tracked in only 13% (R) and 16% (L) of frames. The app shows "Tracking lost" plus the unreliable-tracking notice (below 30% tracked) and asks the user to refilm or enter the count by hand. No reps were invented. |

Analysis took 5–10 s per clip.

## Not yet tested (assumptions)

1. **Curls with a real dumbbell held close to the camera, or in a busy gym.**
   Mirrors and other people in frame were not tested; MediaPipe tracks one
   person, which may not be the lifter.
2. **Safari / iOS Safari and Firefox.** Only Chrome on macOS was run. Firefox
   does not decode HEVC, so iPhone `.mov` files will show the HEVC message
   there. iOS Safari seeking speed and `drawImage` rotation handling are
   assumed, not verified.
3. **Partial occlusion in real footage.** The moving-camera clip covers total
   tracking failure. Brief occlusion mid-set (e.g. a hand passing in front) is
   only covered by synthetic sequences.
4. **Very fast reps.** Reps 1.2 s apart were verified; reps under about 0.4 s
   could be missed at 15 fps.
5. **Long or 4K clips.** Analysis time grows linearly with duration; frames are
   downscaled to 640 px before inference, but decode cost of 4K seeking was not
   measured.
