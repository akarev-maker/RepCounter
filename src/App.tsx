import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_EXERCISE_ID, getExercise } from './exercises/registry';
import { analyzeVideo } from './analysis/analyzeVideo';
import { otherSideHint, scoreFrames, type OtherSideHint } from './analysis/scoreFrames';
import { armColor } from './analysis/drawOverlay';
import { progressionReps } from './counting/balance';
import { getPoseLandmarker } from './pose/poseLandmarker';
import { suggestNext } from './progression/progression';
import { addSession, clearSessions, deleteSession, loadSessions, newId } from './storage/sessions';
import { loadSettings, saveSettings } from './storage/settings';
import { ACCEPTED_VIDEO_TYPES, describeDecodeFailure, probeVideoFile, type VideoProbe } from './video/probeVideo';
import type {
  AnalyzedFrame,
  ArmMode,
  ArmTrack,
  Effort,
  PoseFrame,
  ProgressionSettings,
  SessionSummary,
  Side,
  Unit,
} from './types';

import { VideoStage } from './components/VideoStage';
import type { RepMarker, Span } from './components/PlayerControls';
import { SetupPanel, type ModelState } from './components/SetupPanel';
import { ResultsPanel, type ArmResultView } from './components/ResultsPanel';
import { NextTarget } from './components/NextTarget';
import { HistoryView } from './components/HistoryView';
import { IconLock } from './components/icons';
import { Card, Notice, SectionLabel } from './components/ui';

type Tab = 'analyze' | 'history';

type ArmState = Omit<ArmResultView, 'count'> & { lostSpans: Span[] };

interface ResultState {
  /** One entry per counted arm: [side] in one-arm mode, [right, left] in both-arm mode. */
  arms: ArmState[];
  hint: OtherSideHint | null;
}

/** Arms to count for a given setup. */
function sidesFor(sided: boolean, mode: ArmMode, side: Side | null): (Side | null)[] {
  if (!sided) return [null];
  return mode === 'both' ? ['right', 'left'] : [side ?? 'right'];
}

/** Raw pose data from the single scan of the current clip. */
interface ScanState {
  poseFrames: PoseFrame[];
  aspect: number;
  stepMs: number;
}

const METADATA_TIMEOUT_MS = 12_000;
/** Below this tracked fraction (best arm), the count is called unreliable. */
const UNRELIABLE_TRACKING = 0.3;

function lostSpansFrom(frames: AnalyzedFrame[], stepMs: number): Span[] {
  const spans: Span[] = [];
  let start: number | null = null;
  for (const f of frames) {
    if (f.trackingLost && start === null) start = f.tMs;
    if (!f.trackingLost && start !== null) {
      spans.push({ startMs: start, endMs: f.tMs });
      start = null;
    }
  }
  if (start !== null && frames.length) spans.push({ startMs: start, endMs: frames[frames.length - 1].tMs + stepMs });
  return spans;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('analyze');

  // Pose engine
  const [modelState, setModelState] = useState<ModelState>('loading');
  const [modelError, setModelError] = useState<string | null>(null);

  // Video
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const probeRef = useRef<VideoProbe | null>(null);

  // Setup
  const [exerciseId, setExerciseId] = useState(DEFAULT_EXERCISE_ID);
  const [side, setSide] = useState<Side | null>('right');
  const [mode, setMode] = useState<ArmMode>('one');
  const exercise = useMemo(() => getExercise(exerciseId), [exerciseId]);
  const effectiveMode: ArmMode = exercise.sided ? mode : 'one';

  // Analysis
  const tracksRef = useRef<ArmTrack[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [stepMs, setStepMs] = useState(1000 / 15);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const scanRef = useRef<ScanState | null>(null);

  // Logging (confirmed counts, one per arm in result.arms)
  const [counts, setCounts] = useState<number[]>([]);
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<Unit>('lb');
  const [effort, setEffort] = useState<Effort | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Persistence
  const [sessions, setSessions] = useState<SessionSummary[]>(() => loadSessions());
  const [settings, setSettings] = useState<ProgressionSettings>(() => loadSettings(DEFAULT_EXERCISE_ID));

  const loadModel = useCallback(() => {
    setModelState('loading');
    setModelError(null);
    getPoseLandmarker()
      .then(() => setModelState('ready'))
      .catch((e: Error) => {
        setModelState('error');
        setModelError(e.message);
      });
  }, []);

  useEffect(() => loadModel(), [loadModel]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // A clip that never reports metadata is treated as undecodable.
  useEffect(() => {
    if (!videoUrl || videoReady || decodeError) return;
    const t = window.setTimeout(() => setDecodeError(describeDecodeFailure(probeRef.current)), METADATA_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [videoUrl, videoReady, decodeError]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Progression history is kept separate per arm mode (and per arm in one-arm mode).
  const history = useMemo(
    () =>
      sessions.filter((s) => {
        if (s.exerciseId !== exerciseId) return false;
        if (!exercise.sided) return true;
        const sMode = s.mode ?? 'one';
        if (sMode !== effectiveMode) return false;
        return effectiveMode === 'both' || s.side === side;
      }),
    [sessions, exerciseId, side, exercise.sided, effectiveMode],
  );
  const lastSet = useMemo(
    () => [...history].sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO))[0] ?? null,
    [history],
  );
  const suggestion = useMemo(() => suggestNext(history, settings), [history, settings]);

  function clearResult() {
    abortRef.current?.abort();
    tracksRef.current = [];
    scanRef.current = null;
    setResult(null);
    setAnalysisError(null);
    setSaved(false);
    setEffort(null);
    setCounts([]);
  }

  async function handleFile(file: File) {
    clearResult();
    setDecodeError(null);
    setVideoReady(false);
    probeRef.current = null;
    setTab('analyze');
    setVideoUrl(URL.createObjectURL(file));
    probeRef.current = await probeVideoFile(file);
  }

  function handleLoadedMetadata(v: HTMLVideoElement) {
    if (!v.videoWidth || !v.videoHeight) {
      // Some browsers load HEVC audio but cannot decode the picture.
      setDecodeError(describeDecodeFailure(probeRef.current));
      return;
    }
    setDecodeError(null);
    setVideoReady(true);
  }

  function handleExercise(id: string) {
    if (id === exerciseId) return;
    clearResult();
    setExerciseId(id);
    const s = loadSettings(id);
    setSettings(s);
    if (!getExercise(id).sided) setSide(null);
    else setSide((prev) => prev ?? 'right');
  }

  /**
   * Count the stored scan for the current setup. Each arm gets its own counter,
   * so one arm's movement can never add reps to the other.
   */
  function applyScan(scan: ScanState, forMode: ArmMode, forSide: Side | null) {
    const sides = sidesFor(exercise.sided, forMode, forSide);
    const scored = sides.map((s) => scoreFrames(scan.poseFrames, exercise, s, scan.aspect));
    tracksRef.current = sides.map((s, i) => ({ side: s, frames: scored[i].frames }));
    setStepMs(scan.stepMs);
    setResult({
      arms: sides.map((s, i) => ({
        side: s,
        detected: scored[i].count,
        reps: scored[i].reps,
        trackedFraction: scored[i].trackedFraction,
        everLostTracking: scored[i].everLostTracking,
        lostSpans: lostSpansFrom(scored[i].frames, scan.stepMs),
      })),
      hint:
        forMode === 'one' && sides[0]
          ? otherSideHint(scan.poseFrames, exercise, sides[0], scan.aspect, scored[0])
          : null,
    });
    setCounts(scored.map((r) => r.count));
    const best = Math.max(...scored.map((r) => r.trackedFraction));
    const what =
      exercise.limb === 'leg' ? 'Your legs were' : sides.length > 1 ? 'Your arms were' : 'Your arm was';
    setAnalysisError(
      best === 0
        ? `${what} not tracked in this clip. ${exercise.framingAdvice} Good light helps too.`
        : best < UNRELIABLE_TRACKING
          ? `${what} only tracked in ${Math.round(best * 100)}% of the clip, so the count isn't reliable. ${exercise.framingAdvice} Refilm, or enter the count by hand below.`
          : null,
    );
  }

  /** Re-count after a setup change, without scanning the video again. */
  function rescore(nextMode: ArmMode, nextSide: Side | null) {
    const scan = scanRef.current;
    if (!result || !scan) return;
    if (saved) {
      clearResult();
      return;
    }
    applyScan(scan, nextMode, nextSide);
  }

  function handleSide(s: Side) {
    if (s === side) return;
    setSide(s);
    rescore(effectiveMode, s);
  }

  function handleMode(m: ArmMode) {
    if (m === mode) return;
    setMode(m);
    rescore(m, side);
  }

  function handleHint(h: OtherSideHint) {
    if (h.kind === 'switch') handleSide(h.side);
    else handleMode('both');
  }

  async function handleAnalyze() {
    const video = videoRef.current;
    if (!video || modelState !== 'ready') return;
    clearResult();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setProgress(0);
    const sides = sidesFor(exercise.sided, effectiveMode, side);
    tracksRef.current = sides.map((s) => ({ side: s, frames: [] }));
    try {
      const res = await analyzeVideo(video, {
        exercise,
        previewSides: sides,
        signal: controller.signal,
        onFrame: (frames, p) => {
          frames.forEach((f, i) => tracksRef.current[i]?.frames.push(f));
          setProgress(p);
        },
      });
      const scan: ScanState = { poseFrames: res.poseFrames, aspect: res.aspect, stepMs: res.stepMs };
      scanRef.current = scan;
      applyScan(scan, effectiveMode, side);
      if (!weight && lastSet) {
        setWeight(String(lastSet.weight));
        setUnit(lastSet.unit);
      }
    } catch (e) {
      tracksRef.current = [];
      if ((e as Error).name !== 'AbortError') setAnalysisError((e as Error).message);
      if (videoRef.current) videoRef.current.currentTime = 0;
    } finally {
      setAnalyzing(false);
      abortRef.current = null;
    }
  }

  function handleSeek(ms: number) {
    const v = videoRef.current;
    if (!v || analyzing) return;
    v.pause();
    v.currentTime = ms / 1000;
    v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function handleSave() {
    if (!effort || saved || !result) return;
    const w = Number(weight);
    const base = {
      id: newId(),
      dateISO: new Date().toISOString(),
      exerciseId,
      exerciseLabel: exercise.label,
      weight: w,
      unit,
      effort,
    };
    let summary: SessionSummary;
    if (effectiveMode === 'both' && exercise.sided) {
      const at = (s: Side) => counts[result.arms.findIndex((a) => a.side === s)] ?? 0;
      const perArm = { right: at('right'), left: at('left') };
      summary = { ...base, side: null, mode: 'both', perArm, reps: progressionReps(perArm.right, perArm.left) };
    } else {
      summary = { ...base, side: exercise.sided ? side : null, mode: 'one', reps: counts[0] ?? 0 };
    }
    setSessions(addSession(summary));
    setSaved(true);
    setToast('Set saved');
  }

  function handleNewSet() {
    clearResult();
    setVideoUrl(null);
    setVideoReady(false);
    setDecodeError(null);
  }

  function handleSettings(s: ProgressionSettings) {
    setSettings(s);
    saveSettings(exerciseId, s);
  }

  const incrementUnit: Unit = lastSet?.unit ?? unit;

  const multiArm = (result?.arms.length ?? 0) > 1;
  const markers: RepMarker[] =
    result?.arms.flatMap((arm) =>
      arm.reps.map((r) => ({
        key: `${arm.side ?? 'x'}-${r.index}`,
        ms: r.startMs,
        color: armColor(arm.side).solid,
        label: multiArm ? `${arm.side === 'left' ? 'Left' : 'Right'} rep ${r.index}` : `Rep ${r.index}`,
      })),
    ) ?? [];
  const armViews: ArmResultView[] =
    result?.arms.map((a, i) => ({ ...a, count: counts[i] ?? a.detected })) ?? [];

  const target =
    suggestion || history.length > 0 || saved ? (
      <NextTarget
        title={saved ? 'Next session' : 'Target'}
        suggestion={suggestion}
        settings={settings}
        incrementUnit={incrementUnit}
        onSettings={handleSettings}
      />
    ) : null;

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => setTab('analyze')} className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-bold tracking-tight">RepCounter</span>
          </button>
          <nav className="flex rounded-xl bg-black/[0.05] p-1" aria-label="Sections">
            {(
              [
                ['analyze', 'Analyze'],
                ['history', 'History'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`h-8 rounded-lg px-3.5 text-[13px] font-semibold transition ${
                  tab === id
                    ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {label}
                {id === 'history' && sessions.length > 0 && (
                  <span className="ml-1.5 tabular-nums text-ink-3">{sessions.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-5 sm:px-6 sm:pt-8">
        {tab === 'analyze' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
            <div className="min-w-0 space-y-4">
              {!videoUrl && (
                <div className="mb-1">
                  <h1 className="text-balance text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                    Count reps from a recorded set
                  </h1>
                  <p className="mt-1.5 max-w-xl text-[15px] text-ink-2">
                    Pose tracking runs in your browser and counts each full rep of curls (one arm or
                    each arm separately) and squats. You confirm the numbers before anything is saved.
                  </p>
                </div>
              )}

              <VideoStage
                videoUrl={videoUrl}
                videoRef={videoRef}
                tracksRef={tracksRef}
                stepMs={stepMs}
                markers={markers}
                totals={result ? result.arms.map((a) => a.detected) : null}
                lostSpans={result?.arms.flatMap((a) => a.lostSpans) ?? []}
                analyzing={analyzing}
                decodeError={!!decodeError}
                onPickFile={handleFile}
                onLoadedMetadata={handleLoadedMetadata}
                onDecodeError={() => setDecodeError(describeDecodeFailure(probeRef.current))}
              />

              {decodeError && (
                <Notice tone="error">
                  <p className="font-semibold">Can&apos;t play this video</p>
                  <p className="mt-0.5">{decodeError}</p>
                </Notice>
              )}
              {analysisError && <Notice tone="warn">{analysisError}</Notice>}

              {!videoUrl && <FilmingTips tips={exercise.filmingTips} both={effectiveMode === 'both'} />}
            </div>

            <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
              <SetupPanel
                exerciseId={exerciseId}
                onExercise={handleExercise}
                mode={effectiveMode}
                onMode={handleMode}
                side={side}
                onSide={handleSide}
                hasVideo={!!videoUrl && !decodeError}
                videoFailed={!!videoUrl && !!decodeError}
                videoReady={videoReady && !decodeError}
                hasResult={!!result}
                analyzing={analyzing}
                progress={progress}
                modelState={modelState}
                modelError={modelError}
                onRetryModel={loadModel}
                onAnalyze={handleAnalyze}
                onCancel={() => abortRef.current?.abort()}
                onReplace={() => replaceInputRef.current?.click()}
              />

              {result && !analyzing && (
                <ResultsPanel
                  arms={armViews}
                  limb={exercise.limb}
                  weightNote={exercise.weightNote}
                  allowBodyweight={exercise.allowBodyweight}
                  settings={settings}
                  onSettings={handleSettings}
                  onCountChange={(i, n) => setCounts((prev) => prev.map((c, j) => (j === i ? n : c)))}
                  hint={result.hint}
                  onApplyHint={handleHint}
                  onSeek={handleSeek}
                  weight={weight}
                  onWeight={setWeight}
                  unit={unit}
                  onUnit={setUnit}
                  effort={effort}
                  onEffort={setEffort}
                  saved={saved}
                  onSave={handleSave}
                  onNewSet={handleNewSet}
                />
              )}

              {target}
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight">History</h1>
              <p className="mt-1 text-[15px] text-ink-2">Saved set summaries. Videos are never stored.</p>
            </div>
            {target}
            <HistoryView
              sessions={sessions}
              onDelete={(id) => setSessions(deleteSession(id))}
              onClear={() => setSessions(clearSessions())}
              onStart={() => setTab('analyze')}
            />
          </div>
        )}

        <p className="mt-12 flex items-center justify-center gap-1.5 text-xs text-ink-3">
          <IconLock size={13} />
          Runs entirely on this device. Only set summaries are saved, in this browser.
        </p>
      </main>

      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_VIDEO_TYPES}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {toast && (
        <div
          role="status"
          className="toast-in fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink text-white">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 16.5l4.5-6 4 3.5L19 6.5" stroke="#ff5a1f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9.5" cy="10.5" r="1.6" fill="currentColor" />
        <circle cx="13.5" cy="14" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}

function FilmingTips({ tips: base, both }: { tips: { t: string; d: string }[]; both: boolean }) {
  const tips = both
    ? [
        { t: 'Face the camera', d: 'Film from the front so neither arm hides the other.' },
        { t: 'Both arms in frame', d: 'Shoulders, elbows and wrists should stay visible for every rep.' },
        base[2],
      ]
    : base;
  return (
    <Card className="p-5">
      <SectionLabel>For an accurate count</SectionLabel>
      <ul className="mt-3 grid gap-4 sm:grid-cols-3">
        {tips.map((x, i) => (
          <li key={x.t} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-bold tabular-nums text-ink-2">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{x.t}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{x.d}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
