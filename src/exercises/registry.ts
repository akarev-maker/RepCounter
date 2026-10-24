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
  /** Angle at or below this = movement is in the flexed (bottom) position. */
  flexEnter: number;
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
   * Knee angle (hip-knee-ankle). Thresholds come from recorded pose data on
   * four free Pexels squat clips (see manual-test-notes.md): the bottom of a
   * rep measured 58-117 deg depending on depth and camera angle, standing
   * measured 162-180 deg.
   */
  squat: {
    id: 'squat',
    label: 'Squat',
    joint: 'knee',
    limb: 'leg',
    sided: false,
    weightNote: 'total load, 0 for bodyweight',
    loadSuffix: '',
    allowBodyweight: true,
    framingAdvice: 'Tracking needs your hips, knees and ankles in frame, with the phone held still.',
    filmingTips: [
      { t: 'Film from the side', d: 'A side or three-quarter view shows the knee bend clearly.' },
      { t: 'Whole body in frame', d: 'Keep hips, knees and feet visible at the bottom of every rep.' },
      { t: 'Steady phone', d: 'Prop it up at hip height, a few steps away. Good light helps tracking.' },
    ],
    landmarks: {
      left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
      right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    },
    flexEnter: 110,
    extendEnter: 155,
    filmingHint: 'Counts each full squat from the bend at your knees. Film from the side, whole body in frame.',
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
