import type { SessionSummary } from '../types';

const KEY = 'ra.sessions.v1';

export function loadSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionSummary[]) : [];
  } catch {
    return [];
  }
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
