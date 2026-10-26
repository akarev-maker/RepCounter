import { useState } from 'react';
import type { SessionSummary } from '../types';
import { EFFORTS } from './ResultsPanel';
import { EXERCISES } from '../exercises/registry';
import { formatLoad } from '../progression/progression';
import { IconTrash } from './icons';
import { Button, Card, SectionLabel } from './ui';

interface Props {
  sessions: SessionSummary[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onStart: () => void;
}

const effortLabel = (e: string) => EFFORTS.find((x) => x.value === e)?.label ?? e;

const EFFORT_DOT: Record<string, string> = {
  easy: 'bg-emerald-500',
  'just-right': 'bg-sky-500',
  hard: 'bg-amber-500',
  failed: 'bg-red-500',
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function dayLabel(key: string) {
  const d = new Date(key);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((startToday - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function HistoryView({ sessions, onDelete, onClear, onStart }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  if (sessions.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <p className="text-lg font-semibold">No sets saved yet</p>
        <p className="mt-1.5 max-w-sm text-sm text-ink-2">
          Analyze a clip, confirm the count, and save it. Your sets show up here and feed the
          next-session target.
        </p>
        <Button variant="primary" className="mt-6" onClick={onStart}>
          Analyze a set
        </Button>
      </Card>
    );
  }

  const groups = new Map<string, SessionSummary[]>();
  for (const s of [...sessions].sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO))) {
    const k = dayKey(s.dateISO);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <SectionLabel>
          {sessions.length} saved set{sessions.length === 1 ? '' : 's'}
        </SectionLabel>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-2">Delete all?</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="border-red-200 bg-red-600 text-white hover:border-red-700 hover:bg-red-700"
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
            >
              Delete all
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-[13px] font-semibold text-ink-2 underline-offset-4 hover:text-red-700 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {[...groups.entries()].map(([k, items]) => (
        <div key={k}>
          <p className="bg-canvas/60 px-5 py-2 text-xs font-semibold text-ink-3">{dayLabel(k)}</p>
          <ul>
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-4 border-t border-line px-5 py-3.5 first:border-t-0">
                <div className="w-16 shrink-0">
                  {s.perArm ? (
                    <>
                      <p className="text-2xl font-bold leading-none tabular-nums">
                        {s.perArm.right}
                        <span className="text-ink-3">·</span>
                        {s.perArm.left}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-ink-3">R · L reps</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold leading-none tabular-nums">{s.reps}</p>
                      <p className="mt-1 text-[11px] font-medium text-ink-3">reps</p>
                    </>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.exerciseLabel}
                    {s.perArm ? (
                      <span className="font-normal text-ink-3"> · both arms</span>
                    ) : (
                      s.side && <span className="font-normal text-ink-3"> · {s.side} arm</span>
                    )}
                    {!!s.shallowReps && (
                      <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        {s.shallowReps} partial
                      </span>
                    )}
                    {s.perArm && s.perArm.left !== s.perArm.right && (
                      <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
                        +{Math.abs(s.perArm.right - s.perArm.left)} {s.perArm.right > s.perArm.left ? 'right' : 'left'}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                    <span className="tabular-nums">
                      {formatLoad(s.weight, s.unit)}
                      {s.weight === 0 ? '' : (EXERCISES[s.exerciseId]?.loadSuffix ?? '')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${EFFORT_DOT[s.effort] ?? 'bg-ink-3'}`} />
                      {effortLabel(s.effort)}
                    </span>
                    <span className="text-ink-3">
                      {new Date(s.dateISO).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={`Delete ${s.reps}-rep set`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition hover:bg-red-50 hover:text-red-700"
                >
                  <IconTrash size={17} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
