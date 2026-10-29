# RepCounter AI: project context

- Repo `akarev-maker/RepCounter`, live at https://repcounterai.com (GitHub Pages; push to `main` runs tests and deploys).
- React 19 + TS + Vite + Tailwind v4, MediaPipe Pose Landmarker lite. Fully client-side: no backend, videos never uploaded, sets saved in localStorage. The page makes no outside requests (CSP blocks MediaPipe's usage log).
- Exercises (`src/exercises/registry.ts`): curl and lateral raise (per arm), squat (hip drop), shoulder press, pull-up, lat pulldown. Users can add their own exercises (logged by hand), and any exercise can be logged by hand. Bench press is left out: poor tracking on public data; the user will film side-view clips later.
- Workouts: sets saved the same day are one workout. Targets (`src/progression/progression.ts`) use that day's sets at the heaviest weight. Reps first, then weight: aim for one more rep than the best set; the best set reaching the top of the range adds weight (unless a set was marked Failed); far below the range drops one weight step. Default range 5–8 (user prefers 5–8, 5–12 at most).
- Testing: `npm test` (unit tests), `npm run lint`, `npx tsc -b`. Dataset eval: `npm run eval -- --rescore` (RepCount-A) or `--dataset mmfit`. Browser harness: `.testclips/e2e.mjs` against `npm run dev -- --port 5180 --strictPort`. Results go in `.kiro/specs/rep-analyzer/manual-test-notes.md`.
- Dataset videos and anything derived from them stay in gitignored `test-videos/datasets/` and are never committed.
- Pose extraction and video cutting heat the user's Mac: ask first, use one worker, stop background jobs when done.
- No fake metrics, form scores or LLM advice. Keep tested results separate from assumptions.
- The user wants short, plain replies.
