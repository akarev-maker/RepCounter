import { useState } from 'react';
import type { ProgressionSettings, Suggestion, Unit } from '../types';
import { Card, SectionLabel } from './ui';

interface Props {
  title?: string;
  suggestion: Suggestion | null;
  settings: ProgressionSettings;
  /** Unit the increment applies in (the unit of the latest set). */
  incrementUnit: Unit;
  onSettings: (s: ProgressionSettings) => void;
}

export function NextTarget({ title = 'Next session', suggestion, settings, incrementUnit, onSettings }: Props) {
  const [open, setOpen] = useState(false);

  const setNum = (key: keyof ProgressionSettings, raw: string, min = 0) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onSettings({ ...settings, [key]: Math.max(min, n) });
  };

  const rangeInvalid = settings.repRangeMin > settings.repRangeMax;

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
          {open ? 'Done' : 'Edit rules'}
        </button>
      </div>

      {suggestion ? (
        <div className="mt-3">
          <p className="text-2xl font-bold tracking-tight">
            <span className="tabular-nums">{suggestion.weight}</span>{' '}
            <span className="text-ink-2">{suggestion.unit}</span>
            <span className="mx-2 text-ink-3">×</span>
            <span className="tabular-nums">{suggestion.reps}</span>{' '}
            <span className="text-ink-2">reps</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{suggestion.reason}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Save a set to get a target for next time. Targets come from your saved history and the
          rules below, so you can always see why.
        </p>
      )}

      {open && (
        <div className="mt-5 border-t border-line pt-5">
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Rep range low" value={settings.repRangeMin} onChange={(v) => setNum('repRangeMin', v, 1)} />
            <NumField label="Rep range high" value={settings.repRangeMax} onChange={(v) => setNum('repRangeMax', v, 1)} />
            <NumField
              label={`Smallest jump (${incrementUnit})`}
              value={settings.increment}
              step="any"
              onChange={(v) => setNum('increment', v, 0)}
            />
            <NumField
              label="Top-of-range sets first"
              value={settings.successSetsRequired}
              onChange={(v) => setNum('successSetsRequired', v, 1)}
            />
          </div>
          {rangeInvalid && (
            <p className="mt-2 text-xs font-medium text-red-700">The low end of the range is above the high end.</p>
          )}
          <ol className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
            <li>
              <span className="font-semibold text-ink">Below {settings.repRangeMin} reps or Failed:</span> repeat the weight.
            </li>
            <li>
              <span className="font-semibold text-ink">
                {settings.repRangeMin}–{settings.repRangeMax - 1} reps:
              </span>{' '}
              same weight, one more rep.
            </li>
            <li>
              <span className="font-semibold text-ink">{settings.repRangeMax}+ reps:</span> add {settings.increment}{' '}
              {incrementUnit} once you&apos;ve done it in {settings.successSetsRequired} set
              {settings.successSetsRequired === 1 ? '' : 's'} in a row at that weight.
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
