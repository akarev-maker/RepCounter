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
    defaults: { repRangeMin: 8, repRangeMax: 12, increment: 10, unit: 'lb' },
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
