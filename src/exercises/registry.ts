import type { Side, Unit } from '../types';

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

export type Joint = 'elbow' | 'knee';

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
  /** Body part named in the UI ("arm", "leg"). */
  limb: 'arm' | 'leg';
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
   * For movements that rest bent (leg extension), a rep is bent -> straight
   * -> bent, and counts when the joint bends back to `flexEnter`. Reps that
   * straighten past `extendEnter` but not `fullDepth` are flagged. Thresholds
   * stay in real joint angles; the scorer flips them (180 - x) for the counter.
   */
  startsBent?: boolean;
  /**
   * Seated machines: largest shoulder-hip-knee angle that still counts as
   * sitting on the machine. Above it (standing up, walking off) frames are
   * not counted and any rep in progress is dropped, so standing up from the
   * seat is never counted as a rep. Ignored when the shoulders aren't visible.
   */
  seatedHipMax?: number;
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
    defaults: { repRangeMin: 8, repRangeMax: 12, increment: 5, unit: 'lb' },
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
    // Every clip counted correctly from 80-88 here and 90-94 for standing.
    flexEnter: 85,
    // The one visibly shallow rep read 68; full squats filmed from the front
    // read up to 64. Little margin either way.
    fullDepth: 65,
    minRepMs: 600,
    extendEnter: 92,
    depth: {
      format: (bottom) => `${Math.min(100, Math.max(0, Math.round(100 - bottom)))}%`,
      suffix: ' hip drop',
      target: '35% hip drop',
      explain: 'Hip drop is the reduction in your on-screen hip-to-ankle height from standing. Camera position affects it; it does not establish squat depth or form.',
      good: 'Hip-drop reference reached',
      full: 'the hip-drop reference',
      cue: 'use a range check',
    },
    filmingHint: 'Counts each squat using hip movement and highlights smaller movements for review. Keep your whole body in frame, from the side or the front.',
    defaults: { repRangeMin: 8, repRangeMax: 12, increment: 10, unit: 'lb' },
  },
  /**
   * Knee angle, filmed from the side. Starts with the legs straight, bends,
   * and counts when the legs straighten again. On a free Pexels clip
   * (reclined machine, side view) the bottoms read 70-90 deg and the tops
   * 145-179 deg, with some reps pausing at 145-150 on the way up.
   */
  'leg-press': {
    id: 'leg-press',
    label: 'Leg Press',
    joint: 'knee',
    limb: 'leg',
    sided: false,
    measure: 'angle',
    weightNote: 'total on the machine',
    loadSuffix: '',
    allowBodyweight: false,
    framingAdvice: 'Tracking needs your hip, knee and ankle in frame from the side, with the phone held still.',
    filmingTips: [
      { t: 'Film from the side', d: 'Set the phone square to the machine so your knee bend is seen side-on.' },
      { t: 'Shoulders to ankles in frame', d: 'Step the phone back far enough that your shoulder, hip, knee and ankle stay visible. Shoulders let it ignore you standing up.' },
      { t: 'Steady phone', d: 'Prop it on the floor or a bench. The near leg is the one that gets tracked.' },
    ],
    landmarks: {
      left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
      right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    },
    // Counts from 125 deg so short-range presses still count; above 100 deg
    // they are flagged "go deeper". The clip's full presses reached 70-90 deg.
    // Reclined: the real clip's hip angle stayed at 43-89 deg. Standing is about 175.
    seatedHipMax: 135,
    flexEnter: 125,
    fullDepth: 100,
    minRepMs: 600,
    extendEnter: 145,
    depth: {
      format: (bottom) => `${Math.round(bottom)}\u00b0`,
      suffix: '',
      target: '100\u00b0 or less at the knee',
      explain: 'A smaller knee angle means a deeper press.',
      good: 'Good depth',
      full: 'full depth',
      cue: 'go deeper',
    },
    filmingHint: 'Counts each press and flags ones that could go deeper. Film from the side with hip, knee and ankle in frame.',
    defaults: { repRangeMin: 8, repRangeMax: 12, increment: 10, unit: 'lb' },
  },
  /**
   * Knee angle, filmed from the side, starting bent (seated). Not yet tested
   * on real video; thresholds are an estimate (seated start is usually about
   * 80-100 deg, the top 150-175 deg).
   */
  'leg-extension': {
    id: 'leg-extension',
    label: 'Leg Extension',
    joint: 'knee',
    limb: 'leg',
    sided: false,
    measure: 'angle',
    startsBent: true,
    weightNote: 'machine weight',
    loadSuffix: '',
    allowBodyweight: false,
    framingAdvice: 'Tracking needs your hip, knee and ankle in frame from the side, with the phone held still.',
    filmingTips: [
      { t: 'Film from the side', d: 'Set the phone square to the machine so your knee bend is seen side-on.' },
      { t: 'Shoulders to ankles in frame', d: 'Keep shoulder, hip, knee and ankle visible with your legs bent and straight. Shoulders let it ignore you standing up.' },
      { t: 'Steady phone', d: 'Prop it on the floor or a bench, a couple of steps away. The near leg is the one that gets tracked.' },
    ],
    landmarks: {
      left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
      right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    },
    // Upright seat: hip angle about 90-120 deg. Standing is about 175.
    seatedHipMax: 135,
    // Rest (bent) at 115 deg or less. A lift to 135 deg counts; below 155 deg
    // it is flagged "straighten more".
    flexEnter: 115,
    fullDepth: 155,
    minRepMs: 600,
    extendEnter: 135,
    depth: {
      // The counter records the flipped value (180 - knee angle).
      format: (bottom) => `${Math.round(180 - bottom)}\u00b0`,
      suffix: '',
      target: '155\u00b0 or more at the knee',
      explain: '180\u00b0 means your legs are fully straight.',
      good: 'Full extension',
      full: 'full extension',
      cue: 'straighten more',
    },
    filmingHint: 'Counts each lift and flags ones that could straighten more. Film from the side with hip, knee and ankle in frame.',
    defaults: { repRangeMin: 8, repRangeMax: 12, increment: 5, unit: 'lb' },
  },
};

export const DEFAULT_EXERCISE_ID = 'dumbbell-curl';

export function getExercise(id: string): ExerciseDef {
  return EXERCISES[id] ?? EXERCISES[DEFAULT_EXERCISE_ID];
}

/** Landmark triplet for the chosen side (falls back to left if not sided). */
export function tripletFor(def: ExerciseDef, side: Side | null): [number, number, number] {
  if (!def.sided) return def.landmarks.left;
  return side === 'right' ? def.landmarks.right : def.landmarks.left;
}
