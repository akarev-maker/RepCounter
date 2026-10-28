import type { Effort, ProgressionSettings, RepEvent, Side, Unit } from '../types';
import type { OtherSideHint } from '../analysis/scoreFrames';
import { armBalance } from '../counting/balance';
import type { DepthWording, Limb } from '../exercises/registry';
import type { SessionSummary } from '../types';
import { formatLoad } from '../progression/progression';
import { armColor } from '../analysis/drawOverlay';
import { formatTime } from './formatTime';
import { IconCheck, IconMinus, IconPlus } from './icons';
import { Button, Card, Notice, SectionLabel, Segmented } from './ui';
import { RepRangePicker } from './RepRangePicker';

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
  /** Body part being tracked, for wording. */
  limb: Limb;
  /** Depth wording for exercises that flag partial reps. */
  depth?: DepthWording;
  weightNote: string;
  allowBodyweight: boolean;
  settings: ProgressionSettings;
  onSettings: (s: ProgressionSettings) => void;
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

  /** Reps typed in by hand (no video). */
  manual: boolean;
  /** Sets of this exercise (and arm) saved today, oldest first; includes this one once saved. */
  todaySets: SessionSummary[];
  saved: boolean;
  onSave: () => void;
  /** Share an image of the saved set. */
  onShare: () => void;
  onNewSet: () => void;
}

export function ResultsPanel(p: Props) {
  const multi = p.arms.length > 1;
  const weightNum = Number(p.weight);
  const weightOk =
    p.weight.trim() !== '' && Number.isFinite(weightNum) && (weightNum > 0 || (p.allowBodyweight && weightNum === 0));
  const single = p.limb === 'leg' ? 'legs' : p.limb;
  const missing = [!weightOk && 'weight', !p.effort && 'effort'].filter(Boolean);

  const right = p.arms.find((a) => a.side === 'right');
  const left = p.arms.find((a) => a.side === 'left');
  const balance = multi && right && left ? armBalance(right.count, left.count) : null;

  const lostArms = p.arms.filter((a) => a.everLostTracking);
  const allReps = p.arms.flatMap((a) => a.reps);
  const shallowReps = allReps.filter((r) => r.shallow);
  const lowVisArms = p.arms.filter((a) => Math.round(a.trackedFraction * 100) < 60);

  const saveLabel = balance?.tone === 'one-sided'
    ? `Save ${balance.diff} rep${balance.diff === 1 ? '' : 's'} (${balance.stronger} arm)`
    : multi
    ? `Save R ${right?.count ?? 0} · L ${left?.count ?? 0}`
    : `Save ${p.arms[0]?.count ?? 0} rep${p.arms[0]?.count === 1 ? '' : 's'}`;

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>{p.manual ? 'Your set' : 'Result'}</SectionLabel>
          <SetsToday sets={p.saved ? p.todaySets.slice(0, -1) : p.todaySets} />
        </div>

        {multi ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {p.arms.map((arm, i) => (
              <ArmCount key={arm.side ?? i} arm={arm} compact manual={p.manual} disabled={p.saved} onChange={(n) => p.onCountChange(i, n)} />
            ))}
          </div>
        ) : (
          p.arms[0] && <ArmCount arm={p.arms[0]} manual={p.manual} disabled={p.saved} onChange={(n) => p.onCountChange(0, n)} />
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

        {!p.manual && <p className="mt-4 text-[13px] text-ink-2">
          {multi ? (
            <>
              Pose found in{' '}
              {p.arms.map((a, i) => (
                <span key={a.side ?? i}>
                  {i > 0 && ', '}
                  <span className="font-semibold tabular-nums text-ink">{Math.round(a.trackedFraction * 100)}%</span>{' '}
                  of frames ({a.side})
                </span>
              ))}
              . Check that the lines in the video sit on your arms.
            </>
          ) : (
            <>
              Pose found in{' '}
              <span className="font-semibold tabular-nums text-ink">{Math.round((p.arms[0]?.trackedFraction ?? 0) * 100)}%</span>{' '}
              of analyzed frames. Check that the lines in the video sit on your {single}.
            </>
          )}
        </p>}

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
                ? `Tracking was lost on the ${multi ? lostArms.map((a) => a.side).join(' and ') + ' arm' : single} during the clip (shaded on the timeline). Reps in progress at that moment were not counted, so check the total.`
                : `The ${multi ? lowVisArms.map((a) => a.side).join(' and ') + ' arm was' : single + (single === 'arm' ? ' was' : ' were')} hard to see for much of the clip, so check the total before saving.`}
            </Notice>
          </div>
        )}

        {p.depth && allReps.length > 0 && (
          <div
            className={`mt-3 rounded-xl border px-3.5 py-3 text-[13px] leading-snug ${
              shallowReps.length ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {shallowReps.length === 0 ? (
              <>
                <span className="font-semibold">{p.depth.good} on every rep.</span> Each one reached {p.depth.target}.{' '}
                {p.depth.explain}
              </>
            ) : (
              <>
                <span className="font-semibold">
                  {shallowReps.length === allReps.length
                    ? `All reps counted, but none reached ${p.depth.full}.`
                    : `${shallowReps.length} of ${allReps.length} reps could ${p.depth.cue}.`}
                </span>{' '}
                {shallowReps.length === 1 ? 'Rep' : 'Reps'} {joinList(shallowReps.map((r) => String(r.index)))} reached{' '}
                {joinList(shallowReps.map((r) => p.depth!.format(r.bottomAngle)))}
                {p.depth.suffix}. They still count. Aim for{' '}
                {p.depth.target}. {p.depth.explain}
              </>
            )}
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
                        title={`${multi ? `${sideLabel(arm.side)} rep` : 'Rep'} ${r.index}: ${formatTime(r.startMs)} to ${formatTime(r.tsMs)}${
                          p.depth ? `, ${p.depth.format(r.bottomAngle)}${p.depth.suffix}${r.shallow ? ` (could ${p.depth.cue})` : ''}` : ''
                        }`}
                        className="group inline-flex h-8 items-center gap-1.5 rounded-lg bg-canvas pl-1.5 pr-2.5 text-[13px] font-medium text-ink-2 transition hover:bg-ink hover:text-white"
                      >
                        <span
                          className="flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-bold tabular-nums text-white"
                          style={{ backgroundColor: r.shallow ? '#f59e0b' : multi ? armColor(arm.side).solid : '#121211' }}
                        >
                          {r.index}
                        </span>
                        <span className="tabular-nums">{formatTime(r.startMs)}</span>
                        {p.depth && (
                          <span className={`tabular-nums text-[11px] ${r.shallow ? 'font-semibold text-amber-700 group-hover:text-amber-300' : 'text-ink-3 group-hover:text-white/60'}`}>
                            {p.depth.format(r.bottomAngle)}
                          </span>
                        )}
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
              <span className="text-xs font-normal text-ink-3">{p.weightNote}</span>
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
                placeholder={p.allowBodyweight ? 'e.g. 95, or 0' : 'e.g. 25'}
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
            <p className="mb-2 flex items-baseline justify-between text-sm font-medium">
              Rep range
              <span className="text-xs font-normal text-ink-3">sets your next target</span>
            </p>
            <RepRangePicker settings={p.settings} onSettings={p.onSettings} disabled={p.saved} />
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
              <div className="flex gap-2">
                <Button onClick={p.onShare}>Share</Button>
                <Button onClick={p.onNewSet}>{p.manual ? 'Log next set' : 'Analyze next set'}</Button>
              </div>
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

/** "1", "1 and 2", "1, 2 and 3". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Set 3 today · earlier 12, 10 at 25 lb". */
function SetsToday({ sets }: { sets: SessionSummary[] }) {
  if (sets.length === 0) return <span className="text-xs font-semibold text-ink-3">Set 1 today</span>;
  const sameLoad = sets.every((s) => s.weight === sets[0].weight && s.unit === sets[0].unit);
  const list = sets.map((s) => (s.perArm ? `${s.perArm.right}·${s.perArm.left}` : String(s.reps))).join(', ');
  return (
    <span className="truncate text-xs text-ink-3">
      <span className="font-semibold text-ink-2">Set {sets.length + 1} today</span>
      {' · '}earlier {list}
      {sameLoad ? ` at ${formatLoad(sets[0].weight, sets[0].unit)}` : ''}
    </span>
  );
}

/** Rep count typed directly (by-hand logging). */
function RepInput({ value, onChange, disabled, label, big }: { value: number; onChange: (n: number) => void; disabled: boolean; label: string; big?: boolean }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={999}
      aria-label={label}
      disabled={disabled}
      value={value === 0 ? '' : value}
      placeholder="0"
      onChange={(e) => {
        const n = Math.round(Number(e.target.value));
        onChange(Number.isFinite(n) ? Math.min(999, Math.max(0, n)) : 0);
      }}
      onFocus={(e) => e.target.select()}
      className={`${big ? 'h-16 w-28 text-5xl' : 'h-12 w-full text-4xl'} rounded-xl border border-line-strong bg-surface px-2 text-center font-bold tabular-nums tracking-tight outline-none placeholder:text-ink-3/50 focus:border-ink focus:ring-4 focus:ring-black/5 disabled:opacity-60`}
    />
  );
}

function ArmCount({
  arm,
  compact = false,
  manual = false,
  disabled,
  onChange,
}: {
  arm: ArmResultView;
  compact?: boolean;
  manual?: boolean;
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
        {manual ? (
          <div className="mt-1.5">
            <RepInput value={arm.count} onChange={onChange} disabled={disabled} label={`${sideLabel(arm.side)} arm reps`} />
          </div>
        ) : (
          <p className="mt-1.5 text-5xl font-bold leading-none tracking-tight tabular-nums">{arm.count}</p>
        )}
        <p className="mt-1.5 text-[11px] text-ink-3">{manual ? 'Reps' : edited ? `Was ${arm.detected}` : 'Detected'}</p>
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
          {manual ? (
            <RepInput value={arm.count} onChange={onChange} disabled={disabled} label="Reps" big />
          ) : (
            <span className="text-6xl font-bold leading-none tracking-tight tabular-nums">{arm.count}</span>
          )}
          <span className="text-lg font-semibold text-ink-2">reps</span>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {manual ? 'Entered by hand' : edited ? `Corrected from ${arm.detected} detected` : 'Detected automatically'}
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
