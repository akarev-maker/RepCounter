# Test Notes — RepCounter

Last updated: 2026-10-24. Separates what was actually run from what is assumed.

## Automated unit tests (`npm test`, 52 passing)

Includes recorded angle sequences from six real clips: the Pexels clip (4 reps,
left arm), the user's first iPhone clip (6 reps, right arm), and the user's four
labeled gym clips (see the gym section below).

`src/analysis/squat.test.ts`: hip, knee and ankle landmarks recorded from six
free Pexels squat clips and the user's front-view squat recording are run
through the real scoring path (leg selection plus counter). See the squat
sections below for the clips and counts.

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

## Squats on free Pexels clips (headless Chrome)

True counts were read by eye from a 2 fps frame grid of each clip. Leg
landmarks are saved as fixtures (no video). Default thresholds: bent ≤ 110°,
standing ≥ 155°.

| Pexels clip | View | True count | Detected | Notes |
|---|---|---|---|---|
| 9001924 (21.5 s, 1080×1920) | side / three-quarter, slow reps | 3 | **3** | Bottoms measured 77–93°. Far leg below the visibility bar during reps, so the near leg was used. Same result at 390×844 mobile. |
| 8837221 (25.6 s, 1440×2732) | three-quarter, person small in frame | 5 | **5** | Deepest squats, 58–79° at the bottom. |
| 4838220 (12.7 s, 2160×3840) | front, resistance band | 2 full + 1 cut off | **2** | The clip ends on the way up from rep 3, which is correctly not counted. From the front one knee read 10–15° straighter, so the legs are averaged. Before averaging, one run counted 1. |
| 6326764 (37.1 s, 1920×1080) | front, framed from the hips up | 4 | **0** | Knees and ankles mostly out of frame (0% tracked). The app shows the unreliable-tracking warning with squat-specific framing advice. |

A fifth clip (8233042) was dropped: it is a close-up of the torso with the legs never in frame.

Bodyweight save: weight 0, rep range 3–5, 3 reps, Just right. History shows
"bodyweight"; target "Bodyweight × 4 reps" with the reason "You did 3 reps at
bodyweight, inside your 3–5 range."

Curl regressions after the squat changes: alternating R5/L4, quick 5, and the
moving-camera clip (0 reps, warning) are unchanged.

## Squat depth (counts from 140°, "go deeper" above 110°)

Changed after user testing: filming from hip height, deep squats only bent the
knee to about 130° on screen, so they were not counted at the old 110° limit.
Reps now count from 140°; reps whose deepest bend stays above 110° still
count and are flagged with the measured angle. Dips that last under 0.6 s are
ignored, so a step while walking into frame is not a rep.

| Pexels clip | True count | Detected | Depth flags |
|---|---|---|---|
| 8435486 (front/three-quarter, person small) | 3 (first visibly shallower) | **3** | Rep 1 flagged at 123°; reps 2 and 3 at 99° and 88° not flagged. Before this change only 2 were counted. |
| 8435375 (front/three-quarter) | 4 | **4** | None flagged (86–98°). |
| Earlier clips 9001924, 8837221, 4838220 | 3, 5, 2 | unchanged | None flagged (64–102°). |
| 8416667 (close-up of legs, walking in and out of frame) | unclear | 2 | Not used as a fixture: the legs leave the frame and the true count can't be read from the frames. |

Curl counts are unchanged (alternating clip still R5/L4).

## Squat by hip height (replaces the knee angle)

Changed after the user's front-view recording (`Squats_analyzed.mov`, a screen
recording of the app with its overlay drawn on top, cropped to the phone
video). From the front the knee angle only read 121–148° even on deep reps,
so the 140° rule counted **1**.

New measure: (knee.y − hip.y) / (ankle.y − knee.y) × 100, vertical positions
only, so it does not depend on camera angle the way the 2D knee angle does.
Shown as depth = 100 − value (100% = hips level with knees). Rep starts at a
value ≤ 80 (20% depth), counts after standing back to ≥ 95, shallow if the
lowest value stays above 55 (below 45% depth), minimum rep 0.6 s.

| Clip | True count | Detected |
|---|---|---|
| User's front-view recording | **assumed 6** (not confirmed by the user) | **6**; rep 1 flagged "go deeper", rep 2 the deepest |
| Pexels 9001924 (side), in the browser | 3 | **3** |
| Pexels fixtures (side, three-quarter, front, cut-off, out of frame, one shallow) | 3, 5, 2, 0, 3, 4 | same; the known shallow rep is still the only one flagged |
| Alternating curls (regression) | R5 / L4 | **R5 / L4** |

Rejected: standing line at 90 instead of 95. The user's rep 1 then lasted
under 0.6 s and was dropped.

Not verified: the user's real count, the original (non-screen-recorded) clip,
and whether 45% is the right "good depth" line for most people. The 45% line
comes from the Pexels clips: the visibly shallow rep read 39% and deep reps
read 50% or more.

## In-browser recording (headless Chrome, fake camera)

Chrome was given a fake webcam that plays the Pexels 9001924 squat clip
(scaled to 360×640, 24 fps). The test clicks Record a set, sets the timer to
Off, records, stops, and counts.

| Run | Result |
|---|---|
| 21 s recording, MP4 (Chrome picks `video/mp4;codecs=avc1`) | 21.25 s clip, plays and seeks. **3 squats** at 0:00.8, 0:08.0, 0:15.1, matching the source clip. Replay unchanged. |
| 21 s recording, WebM forced (MP4 disabled, like older Chrome) | Duration was missing from the header and was recovered by the seek-to-end fix: 21.17 s. **3 squats**. Analysis took 23.5 s against 7.2 s for MP4, because WebM recordings have no seek index. |
| 6 s recording at 390×844 mobile | Camera screen scrolls into view and fills the width; counted 1 squat (the only full one in that window). |
| Upload after the change | QuickCurls_5.MOV still counts 5. |

Not verified: real phones (iOS Safari, Android Chrome), whether music keeps
playing (no microphone is requested, which is what normally stops music on
iOS, but this was not tried on a device), the wake lock, the back-camera
switch, and camera-permission denial.

## Not yet tested (assumptions)

1. **Curls with a real dumbbell held close to the camera, or in a busy gym.**
   Mirrors and other people in frame were not tested; MediaPipe tracks one
   person, which may not be the lifter.
2. **Squats filmed by the user, loaded squats, and other squat styles.** No
   barbell clip was tested; a bar or plates can hide the hips. Quarter squats
   under 20% depth are not counted. Only one user recording (a screen
   recording, count assumed) has been run.
3. **Safari / iOS Safari and Firefox.** Only Chrome on macOS was run. Firefox
   does not decode HEVC, so iPhone `.mov` files will show the HEVC message
   there. iOS Safari seeking speed and `drawImage` rotation handling are
   assumed, not verified.
4. **Partial occlusion in real footage.** The moving-camera clip covers total
   tracking failure. Brief occlusion mid-set (e.g. a hand passing in front) is
   only covered by synthetic sequences.
5. **Very fast reps.** Reps 1.2 s apart were verified; reps under about 0.4 s
   could be missed at 15 fps.
6. **Long or 4K clips.** Analysis time grows linearly with duration; frames are
   downscaled to 640 px before inference, but decode cost of 4K seeking was not
   measured.
