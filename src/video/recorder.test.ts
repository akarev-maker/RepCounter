import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRecording } from './recorder';

// Only the browser recorder is simulated: the wrapper, Blob/File contents,
// promise ordering, and failure handling are the production code under test.
class FakeRecorder {
  static current: FakeRecorder;
  static isTypeSupported() { return true; }
  state = 'inactive';
  mimeType = 'video/mp4';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: { error: Error }) => void) | null = null;

  constructor() { FakeRecorder.current = this; }
  start() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') throw new Error('Already stopped');
    this.state = 'inactive';
    // Final data and stop events arrive asynchronously, after state changes.
    queueMicrotask(() => this.end());
  }
  end(data = 'last chunk') {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([data]) });
    this.onstop?.();
  }
  fail() {
    this.state = 'inactive';
    this.onerror?.({ error: new Error('Camera disconnected') });
    this.end();
  }
}

beforeEach(() => vi.stubGlobal('MediaRecorder', FakeRecorder));
afterEach(() => vi.unstubAllGlobals());

// Flush promise reactions without hanging a test on the broken implementation.
async function outcome(promise: Promise<File>): Promise<File | Error | 'pending'> {
  let result: File | Error | 'pending' = 'pending';
  void promise.then((file) => { result = file; }, (e: Error) => { result = e; });
  await Promise.resolve();
  await Promise.resolve();
  return result;
}

describe('recording completion', () => {
  const start = () => startRecording({} as MediaStream);

  it('collects all chunks, including the final chunk, on normal stop', async () => {
    const rec = start();
    FakeRecorder.current.ondataavailable?.({ data: new Blob(['first chunk;']) });
    const file = await rec.stop();
    expect(await file.text()).toBe('first chunk;last chunk');
    expect(file.type).toBe('video/mp4');
    expect(file.name.endsWith('.mp4')).toBe(true);
  });

  it('returns the file when the browser already emitted stop', async () => {
    const rec = start();
    FakeRecorder.current.end();
    const result = await outcome(rec.stop());
    expect(result).toBeInstanceOf(File);
    expect(await (result as File).text()).toBe('last chunk');
  });

  it('notifies the camera UI of automatic completion without a Stop click', async () => {
    const rec = start();
    FakeRecorder.current.end();
    expect(rec.finished).toBeInstanceOf(Promise);
    expect(await (await rec.finished).text()).toBe('last chunk');
  });

  it('notifies the camera UI of a recorder error without a Stop click', async () => {
    const rec = start();
    FakeRecorder.current.fail();
    expect(rec.finished).toBeInstanceOf(Promise);
    await expect(rec.finished).rejects.toThrow('Camera disconnected');
  });

  it('returns the same completion for repeated stop calls, including after completion', async () => {
    const rec = start();
    const first = rec.stop();
    const second = rec.stop();
    expect(second).toBe(first);
    const file = await first;
    expect(await rec.stop()).toBe(file);
  });

  it('rejects with the recording error even if it happened before stop was requested', async () => {
    const rec = start();
    FakeRecorder.current.fail();
    const result = await outcome(rec.stop());
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('Camera disconnected');
  });

  it('rejects an empty automatically stopped recording instead of hanging', async () => {
    const rec = start();
    FakeRecorder.current.end('');
    const result = await outcome(rec.stop());
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('Nothing was recorded.');
  });
});
