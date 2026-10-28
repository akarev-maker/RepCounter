import { beforeEach, describe, expect, it } from 'vitest';
import { addCustomExercise, cleanName, loadCustomExercises, removeCustomExercise, resetCustomExerciseCache } from './customExercises';
import { getExercise, lookupExercise } from '../exercises/registry';

// Minimal in-memory localStorage for the node test environment.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => {
  store.clear();
  resetCustomExerciseCache();
});

describe('custom exercises', () => {
  it('adds, persists and becomes a manual exercise', () => {
    const r = addCustomExercise('  Bench   Press ', 'total');
    expect(r?.exercise.label).toBe('Bench Press');
    resetCustomExerciseCache();
    expect(loadCustomExercises().map((c) => c.label)).toEqual(['Bench Press']);
    const def = getExercise(r!.exercise.id);
    expect(def.manual).toBe(true);
    expect(def.label).toBe('Bench Press');
    expect(def.sided).toBe(false);
  });

  it('weight type sets the wording and bodyweight option', () => {
    const db = addCustomExercise('Incline DB Press', 'per-dumbbell')!.exercise;
    const bw = addCustomExercise('Dips', 'bodyweight')!.exercise;
    expect(getExercise(db.id).loadSuffix).toBe(' per dumbbell');
    expect(getExercise(db.id).allowBodyweight).toBe(false);
    expect(getExercise(bw.id).allowBodyweight).toBe(true);
  });

  it('ignores empty names and reuses an existing name', () => {
    expect(addCustomExercise('   ', 'total')).toBeNull();
    const a = addCustomExercise('Rows', 'total')!.exercise;
    const b = addCustomExercise('rows', 'per-dumbbell')!;
    expect(b.exercise.id).toBe(a.id);
    expect(b.list).toHaveLength(1);
  });

  it('removing it leaves old sets with no definition (History keeps the saved name)', () => {
    const c = addCustomExercise('Rows', 'total')!.exercise;
    removeCustomExercise(c.id);
    expect(lookupExercise(c.id)).toBeUndefined();
  });

  it('ignores corrupt stored data', () => {
    store.set('ra.customExercises.v1', '{"oops":1}');
    expect(loadCustomExercises()).toEqual([]);
  });

  it('cleans names to 40 characters', () => {
    expect(cleanName('x'.repeat(50))).toHaveLength(40);
  });
});
