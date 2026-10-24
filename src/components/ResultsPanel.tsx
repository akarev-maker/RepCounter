import type { Effort, RepEvent, Side, Unit } from '../types';
import type { OtherSideHint } from '../analysis/scoreFrames';
import { armBalance } from '../counting/balance';
import { armColor } from '../analysis/drawOverlay';
import { formatTime } from './formatTime';
import { IconCheck, IconMinus, IconPlus } from './icons';
import { Button, Card, Notice, SectionLabel, Segmented } from './ui';

/** Result for one counted arm, as shown in the panel. */
export interface ArmResultView {
  side: Side | null;
  detected: number;
  count: number;
  reps: RepEvent[];
  trackedFraction: number;
  everLostTracking: boolean;
}

const sideLabel = (s: Side | null) => (s === 'left' ? 'Left' : s === 'right' ? 'Right' : 'Reps');

export const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Several reps left' },
  { value: 'just-right', label: 'Just right', hint: 'One or two left' },
  { value: 'hard', label: 'Hard', hint: 'Last rep was a grind' },
  { value: 'failed', label: 'Failed', hint: 'Couldn\u2019t finish a rep' },
];

interface Props {
  arms: ArmResultView[];
  onCountChange: (armIndex: number, n: number) => void;
  hint: OtherSideHint | null;
  onApplyHint: (h: OtherSideHint) => void;
  onSeek: (ms: number) => void;

  weight: string;
  onWeight: (v: string) => void;
  unit: Unit;
  onUnit: (u: Unit) => void;
  effort: Effort | null;
  onEffort: (e: Effort) => void;

  saved: boolean;
  onSave: () => void;
  onNewSet: () => void;
}

export function ResultsPanel(p: Props) {
  const multi = p.arms.length > 1;
  const weightNum = Number(p.weight);
  const weightOk = p.weight.trim() !== '' && Number.isFinite(weightNum) && weightNum > 0;
  const missing = [!weightOk && 'weight', !p.effort && 'effort'].filter(Boolean);

  const right = p.arms.find((a) => a.side === 'right');
  const left = p.arms.find((a) => a.side === 'left');
  const balance = multi && right && left ? armBalance(right.count, left.count) : null;

  const lostArms = p.arms.filter((a) => a.everLostTracking);
  const lowVisArms = p.arms.filter((a) => Math.round(a.trackedFraction * 100) < 60);

  const saveLabel = multi
    ? `Save R ${right?.count ?? 0} · L ${left?.count ?? 0}`
    : `Save ${p.arms[0]?.count ?? 0} rep${p.arms[0]?.count === 1 ? '' : 's'}`;

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <SectionLabel>Result</SectionLabel>

        {multi ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {p.arms.map((arm, i) => (
              <ArmCount key={arm.side ?? i} arm={arm} compact disabled={p.saved} onChange={(n) => p.onCountChange(i, n)} />
            ))}
          </div>
        ) : (
          p.arms[0] && <ArmCount arm={p.arms[0]} disabled={p.saved} onChange={(n) => p.onCountChange(0, n)} />
        )}

        {balance && (
          <div
            className={`mt-3 rounded-xl border px-3.5 py-3 text-[13px] leading-snug ${
              balance.tone === 'even' ? 'border-line bg-canvas text-ink-2' : 'border-accent/30 bg-accent-soft text-ink'
            }`}
          >
            {balance.tone === 'uneven' && <span className="font-semibold">Uneven set. </span>}
            {balance.text}
          </div>
        )}

        <p className="mt-4 text-[13px] text-ink-2">
          {multi ? (
            <>
              Visible in{' '}
              {p.arms.map((a, i) => (
                <span key={a.side ?? i}>
                  {i > 0 && ', '}
                  <span className="font-semibold tabular-nums text-ink">{Math.round(a.trackedFraction * 100)}%</span>{' '}
                  of frames ({a.side})
                </span>
              ))}
              .
            </>
          ) : (
            <>
              Arm clearly visible in{' '}
              <span className="font-semibold tabular-nums text-ink">{Math.round((p.arms[0]?.trackedFraction ?? 0) * 100)}%</span>{' '}
              of analyzed frames.
            </>
          )}
        </p>

        {p.hint && !p.saved && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-3">
            <p className="text-[13px] leading-snug text-ink">
              {p.hint.kind === 'switch' ? (
                <>
                  Your <span className="font-semibold">{p.hint.side}</span> arm looks like the working arm ({p.hint.count} rep
                  {p.hint.count === 1 ? '' : 's'}).
                </>
              ) : (
                <>
                  Your <span className="font-semibold">{p.hint.side}</span> arm also did {p.hint.count} reps. Count both arms
                  separately?
                </>
              )}
            </p>
            <Button size="sm" variant="primary" className="shrink-0" onClick={() => p.onApplyHint(p.hint!)}>
              {p.hint.kind === 'switch' ? `Use ${p.hint.side}` : 'Both arms'}
            </Button>
          </div>
        )}

        {(lostArms.length > 0 || lowVisArms.length > 0) && (
          <div className="mt-3">
            <Notice tone="warn">
              {lostArms.length > 0
                ? `Tracking was lost on the ${multi ? lostArms.map((a) => a.side).join(' and ') + ' arm' : 'arm'} during the clip (shaded on the timeline). Reps in progress at that moment were not counted, so check the total.`
                : `The ${multi ? lowVisArms.map((a) => a.side).join(' and ') + ' arm was' : 'arm was'} hard to see for much of the clip, so check the total before saving.`}
            </Notice>
          </div>
        )}

        {p.arms.some((a) => a.reps.length > 0) && (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium">Review reps</p>
            {p.arms.map((arm, i) =>
              arm.reps.length === 0 ? null : (
                <div key={arm.side ?? i}>
                  {multi && <p className="mb-1.5 text-xs font-semibold text-ink-3">{sideLabel(arm.side)} arm</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {arm.reps.map((r) => (
                      <button
                        key={r.index}
                        type="button"
                        onClick={() => p.onSeek(r.startMs)}
                        title={`${multi ? `${sideLabel(arm.side)} rep` : 'Rep'} ${r.index}: ${formatTime(r.startMs)} to ${formatTime(r.tsMs)}`}
                        className="group inline-flex h-8 items-center gap-1.5 rounded-lg bg-canvas pl-1.5 pr-2.5 text-[13px] font-medium text-ink-2 transition hover:bg-ink hover:text-white"
                      >
                        <span
                          className="flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-bold tabular-nums text-white"
                          style={{ backgroundColor: multi ? armColor(arm.side).solid : '#121211' }}
                        >
                          {r.index}
                        </span>
                        <span className="tabular-nums">{formatTime(r.startMs)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line bg-canvas/50 p-5">
        <SectionLabel>Log this set</SectionLabel>

        <fieldset disabled={p.saved} className="mt-3 space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor="weight" className="mb-2 flex items-baseline justify-between text-sm font-medium">
              Weight
              <span className="text-xs font-normal text-ink-3">per dumbbell</span>
            </label>
            <div className="flex gap-2">
              <input
                id="weight"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={p.weight}
                onChange={(e) => p.onWeight(e.target.value)}
                placeholder="e.g. 25"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] font-semibold tabular-nums outline-none transition placeholder:font-normal placeholder:text-ink-3 focus:border-ink focus:ring-4 focus:ring-black/5"
              />
              <div className="w-28 shrink-0">
                <Segmented<Unit>
                  value={p.unit}
                  onChange={p.onUnit}
                  options={[
                    { value: 'lb', label: 'lb' },
                    { value: 'kg', label: 'kg' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">How did it feel?</p>
            <div className="grid grid-cols-2 gap-2">
              {EFFORTS.map((e) => {
                const active = p.effort === e.value;
                return (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => p.onEffort(e.value)}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-line-strong bg-surface hover:border-ink-3'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{e.label}</span>
                    <span className={`block text-xs ${active ? 'text-white/70' : 'text-ink-3'}`}>{e.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

        <div className="mt-5">
          {p.saved ? (
            <div className="flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <IconCheck size={16} /> Saved to history
              </p>
              <Button onClick={p.onNewSet}>Analyze next set</Button>
            </div>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={missing.length > 0}
                onClick={p.onSave}
              >
                {saveLabel}
              </Button>
              {missing.length > 0 && (
                <p className="mt-2 text-center text-xs text-ink-3">Add {missing.join(' and ')} to save.</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function ArmCount({
  arm,
  compact = false,
  disabled,
  onChange,
}: {
  arm: ArmResultView;
  compact?: boolean;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const edited = arm.count !== arm.detected;
  const stepBtn =
    'flex items-center justify-center rounded-xl border border-line-strong text-ink transition hover:border-ink-3 disabled:opacity-40';

  if (compact) {
    return (
      <div className="rounded-xl border border-line p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: armColor(arm.side).solid }} />
          {sideLabel(arm.side)} arm
        </p>
        <p className="mt-1.5 text-5xl font-bold leading-none tracking-tight tabular-nums">{arm.count}</p>
        <p className="mt-1.5 text-[11px] text-ink-3">{edited ? `Was ${arm.detected}` : 'Detected'}</p>
        <div className="mt-2.5 flex gap-1.5">
          <button
            type="button"
            disabled={disabled || arm.count === 0}
            onClick={() => onChange(Math.max(0, arm.count - 1))}
            aria-label={`One fewer ${arm.side} rep`}
            className={`${stepBtn} h-8 flex-1`}
          >
            <IconMinus size={16} />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(arm.count + 1)}
            aria-label={`One more ${arm.side} rep`}
            className={`${stepBtn} h-8 flex-1`}
          >
            <IconPlus size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-end justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-6xl font-bold leading-none tracking-tight tabular-nums">{arm.count}</span>
          <span className="text-lg font-semibold text-ink-2">reps</span>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {edited ? `Corrected from ${arm.detected} detected` : 'Detected automatically'}
        </p>
      </div>
      <div className="flex gap-1.5" aria-label="Correct the count">
        <button
          type="button"
          disabled={disabled || arm.count === 0}
          onClick={() => onChange(Math.max(0, arm.count - 1))}
          aria-label="One fewer rep"
          className={`${stepBtn} h-10 w-10`}
        >
          <IconMinus />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(arm.count + 1)}
          aria-label="One more rep"
          className={`${stepBtn} h-10 w-10`}
        >
          <IconPlus />
        </button>
      </div>
    </div>
  );
}
