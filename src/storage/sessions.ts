import type { SessionSummary } from '../types';

const KEY = 'ra.sessions.v1';

export function loadSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Skip entries that would break grouping or rendering (bad dates, missing fields).
    return Array.isArray(parsed) ? parsed.filter(isSession) : [];
  } catch {
    return [];
  }
}

function isSession(x: unknown): x is SessionSummary {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.dateISO === 'string' &&
    Number.isFinite(Date.parse(s.dateISO)) &&
    typeof s.exerciseId === 'string' &&
    typeof s.exerciseLabel === 'string' &&
    typeof s.weight === 'number' &&
    Number.isFinite(s.weight) &&
    typeof s.reps === 'number' &&
    Number.isFinite(s.reps) &&
    (s.unit === 'lb' || s.unit === 'kg') &&
    typeof s.effort === 'string'
  );
}

function persist(sessions: SessionSummary[]): void {
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

export function addSession(s: SessionSummary): SessionSummary[] {
  const next = [s, ...loadSessions()];
  persist(next);
  return next;
}

export function deleteSession(id: string): SessionSummary[] {
  const next = loadSessions().filter((s) => s.id !== id);
  persist(next);
  return next;
}

export function clearSessions(): SessionSummary[] {
  persist([]);
  return [];
}

export function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
