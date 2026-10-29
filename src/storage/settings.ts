import type { ProgressionSettings } from '../types';
import { DEFAULT_PROGRESSION } from '../progression/progression';
import { getExercise } from '../exercises/registry';

const KEY = 'ra.settings.v2';
const OLD_KEY = 'ra.settings.v1';

/** Progression settings are stored per exercise id. */
type Store = Record<string, ProgressionSettings>;

/** Ranges that were presets before v2 and are gone now; they move to the new default. */
const RETIRED_RANGES = new Set(['8-12', '6-10']);

function isSettings(x: unknown): x is ProgressionSettings {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return (
    n(s.repRangeMin) && n(s.repRangeMax) && n(s.increment) &&
    (s.repRangeMin as number) >= 1 && (s.repRangeMax as number) >= (s.repRangeMin as number) && (s.increment as number) >= 0
  );
}

/** Valid entries only; anything malformed falls back to the exercise defaults. */
function parseStore(raw: string | null): Store {
  const parsed: unknown = raw ? JSON.parse(raw) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => isSettings(v))) as Store;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseStore(raw);
    // One-time move from v1: keep weight steps, replace retired rep ranges.
    const store: Store = {};
    for (const [id, s] of Object.entries(parseStore(localStorage.getItem(OLD_KEY)))) {
      store[id] = RETIRED_RANGES.has(`${s.repRangeMin}-${s.repRangeMax}`)
        ? { ...s, repRangeMin: DEFAULT_PROGRESSION.repRangeMin, repRangeMax: DEFAULT_PROGRESSION.repRangeMax }
        : s;
    }
    localStorage.setItem(KEY, JSON.stringify(store));
    return store;
  } catch {
    return {};
  }
}

export function loadSettings(exerciseId: string): ProgressionSettings {
  const store = readStore();
  if (store[exerciseId]) return store[exerciseId];
  const def = getExercise(exerciseId).defaults;
  return {
    ...DEFAULT_PROGRESSION,
    repRangeMin: def.repRangeMin,
    repRangeMax: def.repRangeMax,
    increment: def.increment,
    unit: def.unit,
  };
}

export function saveSettings(exerciseId: string, settings: ProgressionSettings): void {
  const store = readStore();
  store[exerciseId] = settings;
  localStorage.setItem(KEY, JSON.stringify(store));
}
