/** Exercises the user adds by name. They are logged by hand, not counted from video. */
export type CustomLoad = 'total' | 'per-dumbbell' | 'bodyweight';

export interface CustomExercise {
  id: string;
  label: string;
  load: CustomLoad;
}

const KEY = 'ra.customExercises.v1';
const MAX_NAME = 40;

let cache: CustomExercise[] | null = null;

function isCustom(x: unknown): x is CustomExercise {
  const c = x as CustomExercise;
  return (
    !!c &&
    typeof c.id === 'string' &&
    c.id.startsWith('custom-') &&
    typeof c.label === 'string' &&
    ['total', 'per-dumbbell', 'bodyweight'].includes(c.load)
  );
}

export function loadCustomExercises(): CustomExercise[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed.filter(isCustom) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(list: CustomExercise[]): CustomExercise[] {
  cache = list;
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

/** Trimmed, single-spaced, at most 40 characters. Empty means invalid. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** Adds an exercise, or returns the existing one with the same name (any case). */
export function addCustomExercise(rawName: string, load: CustomLoad): { list: CustomExercise[]; exercise: CustomExercise } | null {
  const label = cleanName(rawName);
  if (!label) return null;
  const list = loadCustomExercises();
  const existing = list.find((c) => c.label.toLowerCase() === label.toLowerCase());
  if (existing) return { list, exercise: existing };
  const exercise: CustomExercise = { id: `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label, load };
  return { list: persist([...list, exercise]), exercise };
}

/** Removes the exercise. Saved sets keep their name in History. */
export function removeCustomExercise(id: string): CustomExercise[] {
  return persist(loadCustomExercises().filter((c) => c.id !== id));
}

/** For tests. */
export function resetCustomExerciseCache(): void {
  cache = null;
}
