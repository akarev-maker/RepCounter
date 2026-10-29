import type { Side, Unit } from '../types';
import { loadCustomExercises, type CustomExercise } from '../storage/customExercises';

/**
 * MediaPipe Pose landmark indices.
 * https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export type Joint = 'elbow' | 'knee' | 'shoulder';

/** Body part named in the UI: one arm, both arms together, or the legs. */
export type Limb = 'arm' | 'arms' | 'leg';

/** Wording for exercises that flag reps below a movement reference. */
export interface DepthWording {
  /** Format a rep's bottom value (as recorded by the counter), e.g. "45%" or "118°". */
  format: (bottom: number) => string;
  /** Appended after `format` in sentences, e.g. " depth" -> "45% depth". */
  suffix: string;
  /** Target phrase, e.g. "45% depth or more". */
  target: string;
  /** One sentence explaining the scale. */
  explain: string;
  /** Note on a full rep, e.g. "Good depth". */
  good: string;
  /** What a full rep reaches, e.g. "full depth". */
  full: string;
  /** Advice on a partial rep, e.g. "go deeper". */
  cue: string;
}

export interface ExerciseDef {
  id: string;
  label: string;
  joint: Joint;
  limb: Limb;
  /** Logged by hand only (user-added exercises); never counted from video. */
  manual?: boolean;
  /**
   * Whether the user picks a side (left/right). Exercises that are not sided
   * use both sides of the body together: each frame is measured on the more
   * visible side (see scoreFrames).
   */
  sided: boolean;
  /** Shown next to the weight field, e.g. "per dumbbell". */
  weightNote: string;
  /** Appended to a saved weight in History, e.g. "per dumbbell". */
  loadSuffix: string;
  /** Whether 0 is a valid weight (bodyweight sets). */
  allowBodyweight: boolean;
  /** What must be in frame, used in tracking warnings. */
  framingAdvice: string;
  /** Three filming tips shown before a video is added. */
  filmingTips: { t: string; d: string }[];
  /**
   * The angle is measured at the middle landmark between the three points.
   * triplet = [proximal, joint, distal].
   */
  landmarks: {
    left: [number, number, number];
    right: [number, number, number];
  };
  /**
   * What the counter tracks for each frame (lower = deeper in the rep):
   * - 'angle': the joint angle in degrees at the middle landmark.
   * - 'hipDrop': hip-to-ankle height (vertical image position only) as a
   *   percentage of that leg's retained standing-height reference. It measures
   *   motion in the image, not anatomical squat depth. Knee position helps
   *   decide when a change of camera distance can reset that reference.
   */
  measure: 'angle' | 'hipDrop';
  /**
   * For movements that rest at a small angle and rise (raises), a rep is
   * down -> up -> down. Thresholds stay in real angles: `extendEnter` is
   * the most the angle can be at rest (arm down), `flexEnter` the least it
   * must reach at the top. The scorer flips them (180 - x) for the counter.
   */
  restsLow?: boolean;
  /** Value at or below this = bottom position reached; the rep counts. */
  flexEnter: number;
  /**
   * Optional angle for full depth. Reps that reach flexEnter but not this
   * still count, and are flagged so the user can go deeper next time.
   */
  fullDepth?: number;
  /** Optional shortest rep in ms; quicker dips (e.g. walking) are ignored. */
  minRepMs?: number;
  /** How depth is shown to the user, for exercises with `fullDepth`. */
  depth?: DepthWording;
  /** Angle at or above this = movement is in the extended (top) position. */
  extendEnter: number;
  /** Short hint shown in the UI about how to film. */
  filmingHint: string;
  defaults: {
    repRangeMin: number;
    repRangeMax: number;
    increment: number;
    unit: Unit;
  };
}

export const EXERCISES: Record<string, ExerciseDef> = {
  'dumbbell-curl': {
    id: 'dumbbell-curl',
    label: 'Dumbbell Curl',
    joint: 'elbow',
    limb: 'arm',
    sided: true,
    measure: 'angle',
    weightNote: 'per dumbbell',
    loadSuffix: ' per dumbbell',
    allowBodyweight: false,
    framingAdvice: 'Tracking needs your shoulder and some of your torso in frame, with the phone held still.',
    filmingTips: [
      { t: 'Clear view', d: 'Film from the side or the front, with nothing blocking the working arm.' },
      { t: 'Whole arm in frame', d: 'Shoulder, elbow and wrist should stay visible for every rep.' },
      { t: 'Steady phone', d: 'Prop it up at chest height. Good light helps tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
      right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    },
    flexEnter: 70,
    extendEnter: 150,
    filmingHint: 'Film from the side or the front, with nothing blocking the working arm.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: 5, unit: 'lb' },
  },
  /**
   * Hip drop (see `measure`). Two earlier measures failed on the user's own
   * front-view clips:
   * - Knee angle: six real squats read 121-148 deg; only one counted.
   * - Hip height above the knee (in shin lengths): with the phone low and
   *   close, standing read about 150 instead of 100-130, so no rep counted.
   * Hip drop counts all 8 recorded clips correctly. Bottoms read 41-55 on
   * full squats and 58-68 on the visibly shallow ones. See manual-test-notes.md.
   */
  squat: {
    id: 'squat',
    label: 'Squat',
    joint: 'knee',
    limb: 'leg',
    sided: false,
    measure: 'hipDrop',
    weightNote: 'total load, 0 for bodyweight',
    loadSuffix: '',
    allowBodyweight: true,
    framingAdvice: 'Tracking needs your hips, knees and ankles in frame, with the phone held still.',
    filmingTips: [
      { t: 'Side or front', d: 'Either works. A side or three-quarter view shows depth most clearly.' },
      { t: 'Whole body in frame', d: 'Keep hips, knees and feet visible at the bottom of every rep.' },
      { t: 'Steady phone', d: 'Prop it up at hip height, a few steps away. Good light helps tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
      right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    },
    // Every recorded clip counted correctly from 80-88 here and 90-94 for
    // standing. 90 (not 92) counted best on RepCount-A: 11 of 18 held-out
    // test clips exact instead of 9.
    flexEnter: 85,
    // The one visibly shallow rep read 68; full squats filmed from the front
    // read up to 64. Little margin either way.
    fullDepth: 65,
    minRepMs: 600,
    extendEnter: 90,
    depth: {
      // How much the on-screen hip-to-ankle height shrank from standing. A
      // video measurement, not a joint angle or a form judgement.
      format: (bottom) => `${Math.min(100, Math.max(0, Math.round(100 - bottom)))}%`,
      suffix: ' hip drop',
      target: '35% hip drop or more',
      explain: 'Hip drop is how much your hip-to-ankle height shrank on screen compared with standing. It is measured from the video, so camera position affects it.',
      good: 'Good depth',
      full: 'a 35% hip drop',
      cue: 'go deeper',
    },
    filmingHint: 'Counts each squat from how far your hips drop, and flags reps that could go deeper. Keep your whole body in frame, from the side or the front.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: 10, unit: 'lb' },
  },
  /**
   * Shoulder angle (hip-shoulder-elbow): how far the upper arm is raised
   * from the side of the body. Rests low, so the scorer flips it. RepCount-A
   * has front raises only, so thresholds come from those clips; a lateral
   * raise filmed from the front shows the same angle more directly.
   */
  'lateral-raise': {
    id: 'lateral-raise',
    label: 'Lateral Raise',
    joint: 'shoulder',
    limb: 'arm',
    sided: true,
    measure: 'angle',
    restsLow: true,
    weightNote: 'per dumbbell',
    loadSuffix: ' per dumbbell',
    allowBodyweight: false,
    framingAdvice: 'Tracking needs your hip, shoulder and elbow in frame, with the phone held still.',
    filmingTips: [
      { t: 'Film from the front', d: 'Face the phone so the arm rises out to the side across the frame.' },
      { t: 'Hip to hand in frame', d: 'Keep your hip, shoulder and elbow visible with the arm down and raised.' },
      { t: 'Steady phone', d: 'Prop it up at chest height, a few steps away. Good light helps tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
      right: [LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
    },
    // Real angles: arm down at 35 deg or less, raised to at least 60 deg.
    flexEnter: 60,
    extendEnter: 35,
    minRepMs: 600,
    filmingHint: 'Film from the front, with nothing blocking the working arm.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: 2.5, unit: 'lb' },
  },
  /**
   * Elbow angle, both arms together: dumbbells at the shoulders (bent),
   * pressed overhead (straight), back down. Tuned on MM-Fit seated dumbbell
   * shoulder press sets filmed from the front; see manual-test-notes.md.
   */
  'shoulder-press': {
    id: 'shoulder-press',
    label: 'Shoulder Press',
    joint: 'elbow',
    limb: 'arms',
    sided: false,
    measure: 'angle',
    weightNote: 'per dumbbell',
    loadSuffix: ' per dumbbell',
    allowBodyweight: false,
    framingAdvice: 'Tracking needs your shoulders, elbows and wrists in frame, with the phone held still.',
    filmingTips: [
      { t: 'Film from the front', d: 'Face the phone, a few steps away, so both arms are seen straight on.' },
      { t: 'Hands overhead in frame', d: 'Leave room above your head so the dumbbells stay in frame at the top.' },
      { t: 'Steady phone', d: 'Prop it up at chest height. Good light helps tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
      right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    },
    // Rests bent (dumbbells at the shoulders), so a rep counts when they come
    // back down. Real angles: rest at 100 deg or less, pressed to 145 or more.
    restsLow: true,
    flexEnter: 145,
    extendEnter: 100,
    minRepMs: 600,
    filmingHint: 'Counts each press from your elbow angle, both arms together. Film from the front with room above your head.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: 5, unit: 'lb' },
  },
  /**
   * Elbow angle, both arms together: hanging (straight) -> chin up (bent)
   * -> hanging. Tuned on RepCount-A pull-up clips.
   */
  'pull-up': {
    id: 'pull-up',
    label: 'Pull-up',
    joint: 'elbow',
    limb: 'arms',
    sided: false,
    measure: 'angle',
    weightNote: 'added weight, 0 for bodyweight',
    loadSuffix: ' added',
    allowBodyweight: true,
    framingAdvice: 'Tracking needs your shoulders, elbows and wrists in frame, with the phone held still.',
    filmingTips: [
      { t: 'Front or back', d: 'Film from in front or behind, far enough back to see the bar.' },
      { t: 'Hands to hips in frame', d: 'Keep the bar, your arms and shoulders visible when hanging and at the top.' },
      { t: 'Steady phone', d: 'Prop it on the floor angled up. Good light helps tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
      right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    },
    flexEnter: 90,
    extendEnter: 140,
    minRepMs: 600,
    filmingHint: 'Counts each pull from your elbow angle. Film from the front or behind with the bar and your arms in frame.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: 5, unit: 'lb' },
  },
  /** Same movement and thresholds as the pull-up. Not tested on pulldown video. */
  'lat-pulldown': {
    id: 'lat-pulldown',
    label: 'Lat Pulldown',
    joint: 'elbow',
    limb: 'arms',
    sided: false,
    measure: 'angle',
    weightNote: 'machine weight',
    loadSuffix: '',
    allowBodyweight: false,
    framingAdvice: 'Tracking needs your shoulders, elbows and wrists in frame, with the phone held still.',
    filmingTips: [
      { t: 'Front or back', d: 'Film from in front or behind the seat, far enough back to see the bar.' },
      { t: 'Bar to hips in frame', d: 'Keep the bar, your arms and shoulders visible with arms up and pulled down.' },
      { t: 'Steady phone', d: 'Prop it up a few steps away. The machine frame can block tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
      right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    },
    flexEnter: 90,
    extendEnter: 140,
    minRepMs: 600,
    filmingHint: 'Counts each pull from your elbow angle. Film from the front or behind with the bar and your arms in frame.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: 10, unit: 'lb' },
  },
};

export const DEFAULT_EXERCISE_ID = 'dumbbell-curl';

const LOAD_TEXT: Record<CustomExercise['load'], { weightNote: string; loadSuffix: string; bodyweight: boolean }> = {
  total: { weightNote: 'total weight', loadSuffix: '', bodyweight: false },
  'per-dumbbell': { weightNote: 'per dumbbell', loadSuffix: ' per dumbbell', bodyweight: false },
  bodyweight: { weightNote: 'added weight, 0 for bodyweight', loadSuffix: ' added', bodyweight: true },
};

/** A user-added exercise as an ExerciseDef. The tracking fields are unused (it is manual). */
export function customExerciseDef(c: CustomExercise): ExerciseDef {
  const t = LOAD_TEXT[c.load];
  return {
    id: c.id,
    label: c.label,
    joint: 'elbow',
    limb: 'arm',
    manual: true,
    sided: false,
    measure: 'angle',
    weightNote: t.weightNote,
    loadSuffix: t.loadSuffix,
    allowBodyweight: t.bodyweight,
    framingAdvice: '',
    filmingTips: [],
    landmarks: { left: [0, 0, 0], right: [0, 0, 0] },
    flexEnter: 0,
    extendEnter: 0,
    filmingHint: 'Added by you. Not counted from video: enter your reps by hand.',
    defaults: { repRangeMin: 5, repRangeMax: 8, increment: c.load === 'per-dumbbell' ? 5 : 10, unit: 'lb' },
  };
}

/** Built-in or user-added exercise, or undefined (e.g. a removed exercise in old History). */
export function lookupExercise(id: string): ExerciseDef | undefined {
  if (EXERCISES[id]) return EXERCISES[id];
  const c = loadCustomExercises().find((x) => x.id === id);
  return c ? customExerciseDef(c) : undefined;
}

export function getExercise(id: string): ExerciseDef {
  return lookupExercise(id) ?? EXERCISES[DEFAULT_EXERCISE_ID];
}

/** Landmark triplet for the chosen side (falls back to left if not sided). */
export function tripletFor(def: ExerciseDef, side: Side | null): [number, number, number] {
  if (!def.sided) return def.landmarks.left;
  return side === 'right' ? def.landmarks.right : def.landmarks.left;
}
