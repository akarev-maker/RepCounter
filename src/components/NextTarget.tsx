import { useState } from 'react';
import type { ProgressionSettings, Suggestion, Unit } from '../types';
import { Card, SectionLabel } from './ui';
import { RepRangePicker } from './RepRangePicker';

interface Props {
  title?: string;
  suggestion: Suggestion | null;
  settings: ProgressionSettings;
  /** Unit the increment applies in (the unit of the latest set). */
  incrementUnit: Unit;
  onSettings: (s: ProgressionSettings) => void;
}

export function NextTarget({ title = 'Next workout', suggestion, settings, incrementUnit, onSettings }: Props) {
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
          <p className="text-2xl font-bold tracking-tight">
            {suggestion.weight === 0 ? (
              <span>Bodyweight</span>
            ) : (
              <>
                <span className="tabular-nums">{suggestion.weight}</span>{' '}
                <span className="text-ink-2">{suggestion.unit}</span>
              </>
            )}
            <span className="mx-2 text-ink-3">×</span>
            <span className="tabular-nums">{suggestion.reps}</span>{' '}
            <span className="text-ink-2">reps</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{suggestion.reason}</p>
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
          className="mt-4 flex w-full flex-wrap gap-x-3 gap-y-1 rounded-xl bg-canvas px-3.5 py-2.5 text-left text-[13px] text-ink-2 transition hover:bg-black/[0.05]"
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
              <span className="font-semibold text-ink">A set below {settings.repRangeMin}, or marked Failed:</span> same
              weight, one more rep.
            </li>
            <li>
              <span className="font-semibold text-ink">
                Weakest set {settings.repRangeMin}–{Math.max(settings.repRangeMin, settings.repRangeMax - 1)} reps:
              </span>{' '}
              same weight, one more rep.
            </li>
            <li>
              <span className="font-semibold text-ink">Every set {settings.repRangeMax}+ reps:</span> add {settings.increment}{' '}
              {incrementUnit} next workout.
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
        className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold tabular-nums outline-none focus:border-ink focus:ring-4 focus:ring-black/5"
      />
    </label>
  );
}
