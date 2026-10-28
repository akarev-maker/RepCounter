import { useState } from 'react';
import type { SessionSummary } from '../types';
import { EFFORTS } from './ResultsPanel';
import { lookupExercise } from '../exercises/registry';
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
          Count a clip or enter reps by hand, then save it. Sets saved on the same day are one
          workout and set your next target.
        </p>
        <Button variant="primary" className="mt-6" onClick={onStart}>
          Analyze a set
        </Button>
      </Card>
    );
  }

  // Day -> workouts (one per exercise and arm setup) -> sets, oldest set first.
  const groups = new Map<string, Map<string, SessionSummary[]>>();
  for (const s of [...sessions].sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO))) {
    const k = dayKey(s.dateISO);
    const w = `${s.exerciseId}|${s.mode ?? 'one'}|${s.perArm ? '' : (s.side ?? '')}`;
    const day = groups.get(k) ?? new Map<string, SessionSummary[]>();
    day.set(w, [...(day.get(w) ?? []), s]);
    groups.set(k, day);
  }
  // Newest day first; within a day, the workout with the latest set first.
  const days = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([k, ws]) => [k, [...ws.values()].sort((a, b) => Date.parse(b[b.length - 1].dateISO) - Date.parse(a[a.length - 1].dateISO))] as const);

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

      {days.map(([k, workouts]) => (
        <div key={k}>
          <p className="bg-canvas/60 px-5 py-2 text-xs font-semibold text-ink-3">{dayLabel(k)}</p>
          {workouts.map((sets) => {
            const first = sets[0];
            return (
              <div key={first.id} className="border-t border-line first:border-t-0">
                <p className="truncate px-5 pt-3 text-sm font-semibold">
                  {first.exerciseLabel}
                  {first.perArm ? (
                    <span className="font-normal text-ink-3"> · both arms</span>
                  ) : (
                    first.side && <span className="font-normal text-ink-3"> · {first.side} arm</span>
                  )}
                  <span className="font-normal text-ink-3">
                    {' '}
                    · {sets.length} set{sets.length === 1 ? '' : 's'}
                  </span>
                </p>
                <ul className="pb-1.5">
                  {sets.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-1.5">
                      <span className="w-11 shrink-0 text-xs font-semibold text-ink-3">Set {i + 1}</span>
                      <span className="w-16 shrink-0 text-lg font-bold leading-none tabular-nums">
                        {s.perArm ? (
                          <>
                            {s.perArm.right}
                            <span className="text-ink-3">·</span>
                            {s.perArm.left}
                          </>
                        ) : (
                          s.reps
                        )}
                        <span className="ml-1 text-[11px] font-medium text-ink-3">{s.perArm ? 'R·L' : 'reps'}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                        <span className="tabular-nums">
                          {formatLoad(s.weight, s.unit)}
                          {s.weight === 0 ? '' : (lookupExercise(s.exerciseId)?.loadSuffix ?? '')}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${EFFORT_DOT[s.effort] ?? 'bg-ink-3'}`} />
                          {effortLabel(s.effort)}
                        </span>
                        {!!s.shallowReps && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            {s.shallowReps} partial
                          </span>
                        )}
                        {s.perArm && s.perArm.left !== s.perArm.right && (
                          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
                            +{Math.abs(s.perArm.right - s.perArm.left)} {s.perArm.right > s.perArm.left ? 'right' : 'left'}
                          </span>
                        )}
                        {s.manual && <span className="text-[11px] text-ink-3">by hand</span>}
                      </span>
                      <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">
                        {new Date(s.dateISO).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        aria-label={`Delete set ${i + 1} of ${s.exerciseLabel}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition hover:bg-red-50 hover:text-red-700"
                      >
                        <IconTrash size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}
