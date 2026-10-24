/**
 * In-browser recording. Video only: asking for the microphone makes phones
 * (iOS in particular) pause music from other apps, and the counter never
 * uses sound.
 */

export type Facing = 'user' | 'environment';

/** Longest recording allowed, to keep memory use bounded on phones. */
export const MAX_RECORDING_MS = 5 * 60 * 1000;

/** True when this browser can record from a camera at all. */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

/**
 * MP4 first: Safari only records MP4, and where Chrome supports it the file
 * plays and seeks more reliably than MediaRecorder WebM.
 */
export function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
    throw Object.assign(new Error('Camera recording is not supported here.'), { name: 'NotSupportedError' });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Plain-language reason for a camera failure. */
export function describeCameraError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (!window.isSecureContext) {
    return 'The camera only works on a secure (https) page. Open RepCounter over https, or upload a video instead.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotSupportedError') {
    return 'This browser can\u2019t record video. You can still upload a video.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is in use by another app. Close it and try again.';
  }
  return 'The camera could not be started. You can still upload a video.';
}

export interface Recording {
  /** Settles on either a user stop or a browser-initiated stop/error. */
  finished: Promise<File>;
  stop: () => Promise<File>;
}

/** Records a stream into chunks; completion supplies a File for the upload path. */
export function startRecording(stream: MediaStream): Recording {
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 5_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  let rejectCompletion: (reason: unknown) => void;
  // Install handlers before start: the browser can stop or fail without the
  // user pressing Stop. Every caller receives this same terminal result.
  const completion = new Promise<File>((resolve, reject) => {
    rejectCompletion = reject;
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      if (chunks.length === 0) reject(new Error('Nothing was recorded.'));
      else resolve(new File(chunks, `recording-${stamp}.${ext}`, { type: type.split(';')[0] }));
    };
    recorder.onerror = (event) => {
      const error = (event as Event & { error?: Error }).error;
      reject(error ?? new Error('The recording failed. Try again.'));
    };
  });
  // An automatic error may precede the caller's stop(); retain the rejection
  // for that caller without an unhandled-promise notification in the meantime.
  void completion.catch(() => {});
  recorder.start(1000);

  return {
    finished: completion,
    stop: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch (error) {
        rejectCompletion(error);
      }
      return completion;
    },
  };
}

/**
 * MediaRecorder output (WebM in Chrome, sometimes fragmented MP4) often has no
 * duration in its header, so the browser reports Infinity. Seeking far past
 * the end makes the browser scan the file and learn the real duration.
 */
export async function ensureFiniteDuration(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (Number.isFinite(video.duration) && video.duration > 0) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener('durationchange', onChange);
      video.removeEventListener('timeupdate', onChange);
      resolve();
    };
    const onChange = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) done();
    };
    const timer = window.setTimeout(done, timeoutMs);
    video.addEventListener('durationchange', onChange);
    video.addEventListener('timeupdate', onChange);
    video.currentTime = 1e101;
  });
  video.currentTime = 0;
}

/** Keeps the phone screen on while recording, where supported. */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const lock = await (navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    }).wakeLock?.request('screen');
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}
