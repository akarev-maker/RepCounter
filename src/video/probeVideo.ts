/**
 * Lightweight container/codec sniffing for MP4/MOV files, used only to explain
 * playback failures. iPhone .mov clips are usually HEVC (H.265) unless the
 * camera is set to "Most Compatible", and not every browser decodes HEVC.
 */

export type VideoCodec = 'hevc' | 'h264' | 'unknown';
export type VideoContainer = 'mov' | 'mp4' | 'webm' | 'unknown';

export interface VideoProbe {
  container: VideoContainer;
  codec: VideoCodec;
}

export const ACCEPTED_VIDEO_TYPES =
  'video/*,.mov,.qt,.mp4,.m4v,.webm,video/quicktime,video/mp4,video/webm';

const CHUNK = 4 * 1024 * 1024;

function includesAscii(bytes: Uint8Array, text: string): boolean {
  const codes = Array.from(text, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - codes.length; i++) {
    for (let j = 0; j < codes.length; j++) {
      if (bytes[i + j] !== codes[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function readSlice(file: File, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

export async function probeVideoFile(file: File): Promise<VideoProbe> {
  const name = file.name.toLowerCase();
  let container: VideoContainer = 'unknown';
  if (name.endsWith('.mov') || name.endsWith('.qt') || file.type === 'video/quicktime') {
    container = 'mov';
  } else if (name.endsWith('.webm') || file.type === 'video/webm') {
    container = 'webm';
  } else if (name.endsWith('.mp4') || name.endsWith('.m4v') || file.type === 'video/mp4') {
    container = 'mp4';
  }

  if (container === 'webm') return { container, codec: 'unknown' };

  try {
    // The codec tag lives in the 'moov' box, which phones often write at the
    // end of the file, so check both the start and the end.
    const head = await readSlice(file, 0, Math.min(file.size, CHUNK));
    const tail =
      file.size > CHUNK ? await readSlice(file, Math.max(0, file.size - CHUNK), file.size) : head;

    if (container === 'unknown' && includesAscii(head.subarray(0, 64), 'ftypqt')) {
      container = 'mov';
    }
    const has = (tag: string) => includesAscii(head, tag) || includesAscii(tail, tag);
    if (has('hvc1') || has('hev1')) return { container, codec: 'hevc' };
    if (has('avc1')) return { container, codec: 'h264' };
  } catch {
    /* sniffing is best-effort */
  }
  return { container, codec: 'unknown' };
}

/** Human-readable explanation for a clip the browser could not decode. */
export function describeDecodeFailure(probe: VideoProbe | null): string {
  if (probe?.codec === 'hevc') {
    return (
      'This clip is HEVC (H.265), the default iPhone format, and this browser can\u2019t decode it. ' +
      'Open RepCounter in Safari or a recent Chrome on macOS, or export the clip as H.264. ' +
      'On iPhone, Settings \u2192 Camera \u2192 Formats \u2192 Most Compatible records H.264 from now on.'
    );
  }
  return 'This browser couldn\u2019t decode the video. MP4 or MOV with H.264 video works everywhere.';
}
