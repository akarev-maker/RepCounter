import type { ProgressionSettings } from '../types';
import { DEFAULT_PROGRESSION } from '../progression/progression';
import { getExercise } from '../exercises/registry';

const KEY = 'ra.settings.v1';

/** Progression settings are stored per exercise id. */
type Store = Record<string, ProgressionSettings>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
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
