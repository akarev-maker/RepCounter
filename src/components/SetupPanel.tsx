import { EXERCISES, getExercise } from '../exercises/registry';
import type { ArmMode, Side } from '../types';
import { Button, Card, Notice, SectionLabel, Segmented } from './ui';

export type ModelState = 'loading' | 'ready' | 'error';

interface Props {
  exerciseId: string;
  onExercise: (id: string) => void;
  mode: ArmMode;
  onMode: (m: ArmMode) => void;
  side: Side | null;
  onSide: (s: Side) => void;
  hasVideo: boolean;
  videoFailed: boolean;
  videoReady: boolean;
  hasResult: boolean;
  analyzing: boolean;
  progress: number;
  modelState: ModelState;
  modelError: string | null;
  onRetryModel: () => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onReplace: () => void;
  /** Close the current video and go back to the empty screen. */
  onRemove: () => void;
}

export function SetupPanel(p: Props) {
  const def = getExercise(p.exerciseId);
  const exercises = Object.values(EXERCISES);
  const locked = p.analyzing;
  const canAnalyze =
    p.videoReady &&
    !p.analyzing &&
    p.modelState === 'ready' &&
    (!def.sided || p.mode === 'both' || !!p.side);

  let hint: string | null = null;
  if (p.videoFailed) hint = 'Choose a different video to continue.';
  else if (!p.hasVideo) hint = 'Add a video to start.';
  else if (!p.videoReady) hint = 'Loading video\u2026';
  else if (p.modelState === 'loading') hint = 'Preparing pose tracking\u2026';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <SectionLabel>Set up</SectionLabel>
        {(p.hasVideo || p.videoFailed) && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={p.onReplace}
              disabled={locked}
              className="text-[13px] font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
            >
              Replace video
            </button>
            <button
              type="button"
              onClick={p.onRemove}
              disabled={locked}
              className="text-[13px] font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Exercise</p>
          <div className="flex flex-wrap gap-2">
            {exercises.map((x) => {
              const active = x.id === p.exerciseId;
              return (
                <button
                  key={x.id}
                  type="button"
                  disabled={locked}
                  onClick={() => p.onExercise(x.id)}
                  className={`h-9 rounded-full border px-3.5 text-sm font-semibold transition disabled:opacity-50 ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-line-strong bg-surface text-ink-2 hover:border-ink-3'
                  }`}
                >
                  {x.label}
                </button>
              );
            })}
          </div>
        </div>

        {!def.sided && (
          <p className="-mt-1 text-xs leading-relaxed text-ink-3">
            {def.filmingHint}
          </p>
        )}

        {def.sided && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Arms</p>
            <Segmented<ArmMode>
              value={p.mode}
              disabled={locked}
              onChange={p.onMode}
              options={[
                { value: 'one', label: 'One arm' },
                { value: 'both', label: 'Both arms' },
              ]}
            />
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              {p.mode === 'both'
                ? 'Each arm is counted on its own, whether you curl together or alternate. Film facing the camera so both arms stay visible.'
                : 'Counts a single working arm.'}
            </p>
          </div>
        )}

        {def.sided && p.mode === 'one' && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink">Working arm</p>
              <p className="text-xs text-ink-3">Your own left or right</p>
            </div>
            <Segmented<Side>
              value={p.side}
              disabled={locked}
              onChange={p.onSide}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </div>
        )}
      </div>

      <div className="mt-5">
        {p.analyzing ? (
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">Analyzing frames</span>
              <span className="tabular-nums text-ink-3">{Math.round(p.progress * 100)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.round(p.progress * 100)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-ink-3">The clip is scanned once. Playback won&apos;t re-count.</p>
              <Button size="sm" variant="ghost" onClick={p.onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="primary" size="lg" className="w-full" disabled={!canAnalyze} onClick={p.onAnalyze}>
              {p.hasResult ? 'Count again' : 'Count reps'}
            </Button>
            {hint && <p className="mt-2 text-center text-xs text-ink-3">{hint}</p>}
          </>
        )}
      </div>

      {p.modelState === 'error' && (
        <div className="mt-4">
          <Notice tone="error">
            <p className="font-semibold">Pose tracking didn&apos;t load</p>
            <p className="mt-0.5">{p.modelError}</p>
            <button type="button" onClick={p.onRetryModel} className="mt-2 font-semibold underline underline-offset-4">
              Try again
            </button>
          </Notice>
        </div>
      )}
    </Card>
  );
}
