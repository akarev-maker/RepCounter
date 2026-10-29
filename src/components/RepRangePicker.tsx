import { useState } from 'react';
import type { ProgressionSettings } from '../types';

/** Common rep ranges. Any range can be entered with Custom. */
const REP_RANGE_PRESETS: { min: number; max: number; label: string }[] = [
  { min: 3, max: 5, label: 'Strength' },
  { min: 5, max: 8, label: 'Strength + size' },
  { min: 5, max: 12, label: 'Wide range' },
  { min: 12, max: 20, label: 'Endurance' },
];

interface Props {
  settings: ProgressionSettings;
  onSettings: (s: ProgressionSettings) => void;
  disabled?: boolean;
}

/**
 * Pick the rep range the next-set target aims for. The choice is saved per
 * exercise and changes the target immediately.
 */
export function RepRangePicker({ settings, onSettings, disabled }: Props) {
  const { repRangeMin: min, repRangeMax: max } = settings;
  const preset = REP_RANGE_PRESETS.find((p) => p.min === min && p.max === max);
  const [custom, setCustom] = useState(!preset);
  const showCustom = custom || !preset;

  const setRange = (lo: number, hi: number) => {
    const a = Math.max(1, Math.round(lo));
    const b = Math.max(a, Math.round(hi));
    onSettings({ ...settings, repRangeMin: a, repRangeMax: b });
  };

  const chip = (active: boolean) =>
    `flex h-9 items-center justify-center rounded-full border px-2 text-[13px] font-medium tabular-nums transition disabled:opacity-50 ${
      active ? 'border-ink bg-ink text-cream' : 'border-line-strong bg-transparent text-ink-2 hover:border-ink-3'
    }`;

  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Rep range">
        {REP_RANGE_PRESETS.map((p) => {
          const active = !showCustom && p === preset;
          return (
            <button
              key={p.label}
              type="button"
              role="radio"
              aria-checked={active}
              title={p.label}
              disabled={disabled}
              onClick={() => {
                setCustom(false);
                setRange(p.min, p.max);
              }}
              className={chip(active)}
            >
              {p.min}–{p.max}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={showCustom}
          disabled={disabled}
          onClick={() => setCustom(true)}
          className={chip(showCustom)}
        >
          Custom
        </button>
      </div>

      {showCustom ? (
        <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
          <RangeInput label="Lowest reps" value={min} disabled={disabled} onCommit={(v) => setRange(v, Math.max(v, max))} />
          <span>to</span>
          <RangeInput label="Highest reps" value={max} disabled={disabled} onCommit={(v) => setRange(Math.min(min, v), v)} />
          <span>reps</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-3">
          {preset?.label}. Add reps first; weight goes up once your best set reaches {max}.
        </p>
      )}
    </div>
  );
}

function RangeInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      aria-label={label}
      disabled={disabled}
      defaultValue={value}
      key={value}
      onBlur={(e) => {
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 1) onCommit(n);
        else e.target.value = String(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="h-9 w-16 rounded-xl border border-line-strong bg-[#fffdf9] px-2.5 text-center text-sm font-semibold tabular-nums text-ink outline-none focus:border-ink focus:ring-4 focus:ring-black/5"
    />
  );
}
