# Requirements — Workout Rep Analyzer

A client-side, mobile-friendly web app that counts dumbbell reps from a recorded
video using on-device pose tracking, lets the user confirm and save the result,
and suggests a transparent next-session target.

Scope for the hackathon: start with single-arm dumbbell bicep curl (left or
right arm). The exercise layer is pluggable (each exercise defines the joint,
landmarks, angle direction, and thresholds) so movements like squats (knee
angle) and overhead press can be added as config without rewrites. No backend,
no accounts, no uploaded video storage.

## R1 — Video + Pose Tracking
1. The user can load a local phone-recorded video file (portrait or landscape).
2. The app displays the video with a canvas overlay drawing the tracked
   shoulder, elbow, and wrist for the selected arm.
3. The overlay stays aligned with the video across aspect ratios and resizes.
4. Pose analysis uses real video timestamps, not wall-clock time.
5. The user selects which arm (left/right) to track; the app tracks exactly one
   arm and never counts both.
6. The app shows clear, actionable errors for: model load failure, unsupported
   or undecodable video, and no person detected.

## R2 — Rep Counting
1. Counting logic is a pure module, independent of pose detection and UI.
2. A rep is derived from elbow angle via a state machine:
   extended → flexed → extended completes one rep.
3. Angle values are smoothed; distinct enter/exit thresholds (hysteresis)
   prevent jitter from toggling states.
4. Partial movements (not crossing both thresholds) do not count.
5. When landmark confidence is insufficient, the app shows "Tracking lost" and
   discards the in-progress cycle (no count from that cycle).
6. Each completed rep stores its video timestamp.
7. Processing the video once produces a fixed result; replaying or scrubbing
   does not add or duplicate reps.

## R3 — Results + History
1. The user enters weight and chooses units (lb/kg). UI states weight is
   per dumbbell.
2. The app shows the rep count and a list of clickable rep timestamps that seek
   the video to that moment.
3. The user can correct the final rep count before saving.
4. Saving persists to localStorage: date, exercise, arm, weight, units,
   confirmed reps, and reported effort (RPE).
5. Only summaries are saved; video files are never stored.
6. A history view lists saved sessions with per-item and clear-all delete.

## R4 — Next-Session Target
1. Progression rules are transparent and editable (settings): target rep range,
   weight increment, and how the set felt.
2. The suggestion considers confirmed history, not just the latest set; it does
   not raise weight after a single successful set.
3. Each suggestion includes a plain-language explanation of why.
4. No LLM or invented metrics are used to generate recommendations.

## R5 — Design + Integrity
1. Clean, mobile-first UI: readable type, restrained palette, large video,
   obvious controls, useful feedback/empty/error states.
2. No fake metrics, invented form scores, or injury predictions.
3. Tested behavior is clearly distinguished from assumptions in notes.
