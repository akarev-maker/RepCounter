import { useState } from 'react';
import type { ProgressionSettings, SessionSummary, Suggestion, Unit } from '../types';
import { formatLoad } from '../progression/progression';
import { Card, SectionLabel } from './ui';
import { RepRangePicker } from './RepRangePicker';

interface Props {
  title?: string;
  suggestion: Suggestion | null;
  /** The sets the suggestion is based on (last workout at its heaviest weight). */
  basis: { sets: SessionSummary[]; weight: number; unit: Unit } | null;
  /** Show the last workout as a bar chart (History tab). */
  chart?: boolean;
  settings: ProgressionSettings;
  /** Unit the increment applies in (the unit of the latest set). */
  incrementUnit: Unit;
  onSettings: (s: ProgressionSettings) => void;
}

export function NextTarget({ title = 'Next workout', suggestion, basis, chart = false, settings, incrementUnit, onSettings }: Props) {
  const [open, setOpen] = useState(false);

  const setNum = (key: keyof ProgressionSettings, raw: string, min = 0) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onSettings({ ...settings, [key]: Math.max(min, n) });
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-[13px] font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
        >
          {open ? 'Done' : 'Change rules'}
        </button>
      </div>

      {suggestion ? (
        <div className="mt-3">
          <p className="num-display text-[38px] leading-tight">
            {suggestion.weight === 0 ? (
              <span>Bodyweight</span>
            ) : (
              <>
                {suggestion.weight} {suggestion.unit}
              </>
            )}
            <span className="mx-2.5 font-sans text-[22px] text-ink-3">×</span>
            {suggestion.reps} reps
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{suggestion.reason}</p>
          {chart && basis && basis.sets.length > 0 && <SetChart basis={basis} suggestion={suggestion} settings={settings} />}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Save a set to get a target for next time. Targets come from all the sets you saved in your
          last workout and the rules below, so you can always see why.
        </p>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 flex w-full flex-wrap gap-x-3 gap-y-1 rounded-xl bg-inset px-3.5 py-2.5 text-left text-[13px] text-ink-2 transition hover:bg-black/[0.05]"
        >
          <span>
            Rep range <span className="font-semibold tabular-nums text-ink">{settings.repRangeMin}–{settings.repRangeMax}</span>
          </span>
          <span>
            Weight steps of <span className="font-semibold tabular-nums text-ink">{settings.increment} {incrementUnit}</span>
          </span>
        </button>
      )}

      {open && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="mb-2 text-sm font-medium">Rep range</p>
          <RepRangePicker settings={settings} onSettings={onSettings} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumField
              label={`Weight step (${incrementUnit})`}
              value={settings.increment}
              step="any"
              onChange={(v) => setNum('increment', v, 0)}
            />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            All sets saved on the same day are one workout. Rules use that workout&apos;s sets at its heaviest
            weight, so lighter warm-up sets don&apos;t hold you back.
          </p>
          <ol className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
            {settings.repRangeMin > 3 && (
              <li>
                <span className="font-semibold text-ink">Best set {settings.repRangeMin - 3} reps or fewer:</span> drop{' '}
                {settings.increment} {incrementUnit} and aim for {settings.repRangeMin}.
              </li>
            )}
            <li>
              <span className="font-semibold text-ink">Best set under {settings.repRangeMax} reps:</span> same weight, beat
              your best set by one rep.
            </li>
            <li>
              <span className="font-semibold text-ink">Best set {settings.repRangeMax}+ reps:</span> add {settings.increment}{' '}
              {incrementUnit} and start again at {settings.repRangeMin}.
            </li>
            <li>
              <span className="font-semibold text-ink">A set marked Failed:</span> no weight added that workout.
            </li>
          </ol>
        </div>
      )}
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (raw: string) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        defaultValue={value}
        key={value}
        onBlur={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-10 w-full rounded-xl border border-line-strong bg-[#fffdf9] px-3 text-sm font-semibold tabular-nums outline-none focus:border-ink focus:ring-4 focus:ring-black/5"
      />
    </label>
  );
}

const CHART_H = 104;

/**
 * Last workout's working sets as bars against the rep range, with the next
 * target as a dashed bar. Same numbers the rules used; both-arm sets show the
 * weaker arm.
 */
function SetChart({
  basis,
  suggestion,
  settings,
}: {
  basis: NonNullable<Props['basis']>;
  suggestion: Suggestion;
  settings: ProgressionSettings;
}) {
  const { repRangeMin: lo, repRangeMax: hi } = settings;
  const reps = basis.sets.map((s) => s.reps);
  const top = Math.max(hi, suggestion.reps, ...reps) * 1.12;
  const y = (n: number) => (Math.max(0, n) / top) * CHART_H;
  const weaker = basis.sets.some((s) => s.perArm);
  const nextLoad = suggestion.weight !== basis.weight || suggestion.unit !== basis.unit;
  const day = new Date(basis.sets[0].dateISO).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  // Bars are at most 56px wide; leave room on the right for the range label.
  const maxWidth = (basis.sets.length + 1) * 66 + 56;
  const summary = `Last workout, ${formatLoad(basis.weight, basis.unit)}: ${reps.join(', ')} reps. Rep range ${lo} to ${hi}. Next: ${suggestion.reps} reps.`;

  return (
    <figure className="mt-5" role="img" aria-label={summary}>
      <figcaption className="mb-3 flex items-baseline justify-between gap-3 text-xs text-ink-3">
        <span>
          <span className="font-display text-[14px] italic text-ink-2">last workout</span> · {day} · {formatLoad(basis.weight, basis.unit)}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {basis.sets.some((s) => s.effort === 'failed') && (
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-[2px] bg-[#b9826f]" />
              Failed
            </span>
          )}
          {weaker && <span>weaker arm</span>}
        </span>
      </figcaption>
      <div className="relative" style={{ height: CHART_H, maxWidth }}>
        {/* Rep range band. */}
        <div
          className="absolute inset-x-0 flex items-center justify-end border-y border-dashed border-[#7b96ab]/60 bg-[#7b96ab]/[0.09] pr-2"
          style={{ bottom: y(lo), height: Math.max(1, y(hi) - y(lo)) }}
        >
          <span className="text-[11px] font-medium tabular-nums text-[#5d7a90]">
            {lo}–{hi}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 border-b border-line-strong" />
        <div className="relative flex h-full items-end gap-2.5">
          {basis.sets.map((s) => (
            <Bar key={s.id} reps={s.reps} height={y(s.reps)} failed={s.effort === 'failed'} />
          )).concat(
            <Bar key="next" reps={suggestion.reps} height={y(suggestion.reps)} next />,
          )}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2.5 text-center text-[11px] text-ink-3" style={{ maxWidth }}>
        {basis.sets.map((s, i) => (
          <span key={s.id} className="w-full max-w-14 flex-1">
            Set {i + 1}
          </span>
        ))}
        <span className="w-full max-w-14 flex-1 font-medium text-ink-2">
          Next
          {nextLoad && (
            <span className="block font-normal text-ink-3">
              {suggestion.weight === 0 ? 'bw' : `${suggestion.weight} ${suggestion.unit}`}
            </span>
          )}
        </span>
      </div>
    </figure>
  );
}

function Bar({ reps, height, next, failed }: { reps: number; height: number; next?: boolean; failed?: boolean }) {
  // The number goes inside the bar when it fits, otherwise just above it.
  const inside = height >= 28;
  return (
    <div className="flex w-full max-w-14 flex-1 flex-col items-center justify-end">
      {!inside && <span className="num-display mb-1 text-[15px] leading-none text-ink-2">{reps}</span>}
      <div
        className={`flex w-full justify-center rounded-t-[7px] rounded-b-[3px] pt-1.5 ${
          next
            ? 'border-[1.5px] border-dashed border-ink-3/70 bg-transparent'
            : failed
              ? 'bg-gradient-to-b from-[#b9826f] to-[#e2c9b4]'
              : 'bg-gradient-to-b from-[#6f8ea6] to-[#d8cdb8]'
        }`}
        style={{ height: Math.max(3, height) }}
        title={failed ? 'Marked Failed' : undefined}
      >
        {inside && <span className={`num-display text-[17px] leading-none ${next ? 'text-ink-2' : 'text-white'}`}>{reps}</span>}
      </div>
    </div>
  );
}
