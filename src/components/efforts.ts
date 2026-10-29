import type { Effort } from '../types';

/** The "How did it feel?" choices, shared by the results form and History. */
export const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Several reps left' },
  { value: 'just-right', label: 'Just right', hint: 'One or two left' },
  { value: 'hard', label: 'Hard', hint: 'Last rep was a grind' },
  { value: 'failed', label: 'Failed', hint: 'Couldn\u2019t finish a rep' },
];
