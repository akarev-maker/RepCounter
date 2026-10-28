// Dataset eval: runs the app's pose pass on every labelled RepCount-A video
// (headless Chrome), caches the landmarks, then counts reps with the app's
// own scoreFrames in Node and compares with the labels.
//
//   npm run eval                    squat clips, test + validation if extracted
//   npm run eval -- --rescore       score cached poses only (fast, no Chrome)
//   npm run eval -- --action all    cache poses for every action (for new exercises)
//   npm run eval -- --rescore --action bench_pressing --set flexEnter=95,extendEnter=150
//   npm run eval -- --workers 2 --split test --verbose   (more workers = faster but hotter)
//
// Setup (once): scripts/eval/fetch-repcount.sh, then scripts/eval/extract-repcount.py.
// RepCount-A is research-use only. The videos, poses and results stay in the
// gitignored test-videos/datasets/ and must never be committed.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args0 = process.argv.slice(2);
// --dataset repcount (RepCount-A, default) or mmfit (MM-Fit sets, see scripts/eval/mmfit-clips.py).
const DATASET = args0.includes('--dataset') ? args0[args0.indexOf('--dataset') + 1] : 'repcount';
const DATA = resolve(ROOT, 'test-videos/datasets', DATASET);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/**
 * RepCount-A action -> app exercise id. Only these are scored. RepCount-A has
 * front raises only; they stand in for the lateral raise (same shoulder angle).
 */
const EXERCISE_FOR = {
  squat: 'squat', bench_pressing: 'bench-press', front_raise: 'lateral-raise', pull_up: 'pull-up',
  // MM-Fit
  dumbbell_shoulder_press: 'shoulder-press', lateral_shoulder_raises: 'lateral-raise', squats: 'squat', bicep_curls: 'dumbbell-curl',
};

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);
const splits = opt('split', 'test,validation').split(',');
const action = opt('action', 'scored');
// One Chrome by default: each worker keeps a CPU core busy and heats a laptop.
const workers = Math.max(1, +opt('workers', 1));
const rescore = flag('rescore');
const verbose = flag('verbose');
// --set key=value,...: try other thresholds without editing the registry.
const overrides = Object.fromEntries(
  (opt('set', '') || '').split(',').filter(Boolean).map((kv) => {
    const [k, v] = kv.split('=');
    return [k, Number(v)];
  }),
);

const labelsPath = resolve(DATA, 'labels.json');
if (!existsSync(labelsPath)) {
  console.error(DATASET === 'mmfit'
    ? 'No labels. Run scripts/eval/mmfit-labels.py, then scripts/eval/mmfit-clips.py.'
    : 'No labels. Run scripts/eval/fetch-repcount.sh, then scripts/eval/extract-repcount.py.');
  process.exit(1);
}
const labels = JSON.parse(readFileSync(labelsPath, 'utf8')).filter(
  (l) => splits.includes(l.split) && (action === 'all' || (action === 'scored' ? l.action in EXERCISE_FOR : l.action === action)),
);
const posePath = (l) => resolve(DATA, 'poses', l.split, `${l.id}.json`);

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5300, strictPort: false } });

// ---- 1. Pose extraction (only videos without cached poses) ----
const todo = rescore ? [] : labels.filter((l) => !existsSync(posePath(l)));
if (todo.length) {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  console.log(`extracting poses for ${todo.length} videos with ${workers} Chrome workers...`);
  let done = 0;
  const t0 = Date.now();
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(workers, queue.length) }, (_, w) => worker(w, base, queue, () => {
      done++;
      const eta = ((Date.now() - t0) / done) * (todo.length - done) / 1000;
      process.stdout.write(`\r  ${done}/${todo.length}  ~${Math.round(eta / 60)} min left   `);
    })),
  );
  process.stdout.write('\n');
}

// ---- 2. Scoring ----
if (Object.keys(overrides).length) console.log('overrides', overrides);
const ssr = server.ssrLoadModule.bind(server);
const { scoreFrames } = await ssr('/src/analysis/scoreFrames.ts');
const { EXERCISES } = await ssr('/src/exercises/registry.ts');
await server.close();

const rows = [];
for (const l of labels) {
  const exId = EXERCISE_FOR[l.action];
  if (!exId || !EXERCISES[exId] || !existsSync(posePath(l))) continue;
  const pose = JSON.parse(readFileSync(posePath(l), 'utf8'));
  if (pose.error) {
    rows.push({ ...l, detected: null, error: pose.error });
    continue;
  }
  const def = { ...EXERCISES[exId], ...overrides };
  // One-arm exercises: count each arm and keep the arm with more reps (the
  // clips are mostly both arms together, and the working arm isn't labelled).
  const r = def.sided
    ? ['left', 'right'].map((side) => scoreFrames(pose.frames, def, side, pose.w / pose.h)).sort((a, b) => b.count - a.count)[0]
    : scoreFrames(pose.frames, def, null, pose.w / pose.h);
  if (opt('trace') === l.id) {
    // --trace <clip id>: the measured value per frame, for finding why a clip fails.
    for (const f of r.frames) {
      console.log(`${(f.tMs / 1000).toFixed(2).padStart(7)}  ${String(f.label ?? '-').padEnd(16)} ${f.confident ? '' : 'low-conf'}  count ${f.count}`);
    }
  }
  // Labelled cycles (frame indices) with no counted rep finishing inside them.
  const cycles = [];
  for (let i = 0; i + 1 < l.bounds.length; i += 2) cycles.push([l.bounds[i] / pose.fps, l.bounds[i + 1] / pose.fps]);
  const missed = cycles.filter(([s, e]) => !r.reps.some((rep) => rep.tsMs / 1000 >= s - 0.3 && rep.tsMs / 1000 <= e + 1));
  rows.push({
    ...l,
    detected: r.count,
    tracked: r.trackedFraction,
    lost: r.everLostTracking,
    shallow: r.reps.filter((x) => x.shallow).length,
    durationS: pose.durationMs / 1000,
    missed,
    reps: r.reps.map((x) => +(x.tsMs / 1000).toFixed(1)),
  });
}

// ---- 3. Report ----
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
for (const exId of new Set(rows.map((r) => EXERCISE_FOR[r.action]))) {
  const rs = rows.filter((r) => EXERCISE_FOR[r.action] === exId).sort((a, b) => Math.abs(b.detected - b.count) - Math.abs(a.detected - a.count));
  console.log(`\n${EXERCISES[exId].label}: ${rs.length} ${DATASET === 'mmfit' ? 'MM-Fit' : 'RepCount-A'} clips (${[...new Set(rs.map((r) => r.split))].join(', ')})`);
  console.log(`${pad('clip', 22)}${lpad('true', 5)}${lpad('found', 6)}${lpad('diff', 6)}${lpad('tracked', 9)}  notes`);
  for (const r of rs) {
    const diff = r.detected === null ? '' : r.detected - r.count;
    if (!verbose && diff === 0) continue;
    const notes = r.error
      ? r.error
      : [r.lost && 'tracking lost', r.shallow && `${r.shallow} flagged shallow`, r.missed.length && `missed cycles at ${r.missed.map(([s]) => s.toFixed(1) + 's').join(' ')}`]
          .filter(Boolean)
          .join('; ');
    console.log(
      `${pad(`${r.split}/${r.id}`, 22)}${lpad(r.count, 5)}${lpad(r.detected ?? '-', 6)}${lpad(diff > 0 ? '+' + diff : diff, 6)}${lpad(r.tracked === undefined ? '' : Math.round(r.tracked * 100) + '%', 9)}  ${notes}`,
    );
  }
  const ok = rs.filter((r) => r.detected !== null);
  const exact = ok.filter((r) => r.detected === r.count).length;
  const obo = ok.filter((r) => Math.abs(r.detected - r.count) <= 1).length;
  const mae = ok.reduce((s, r) => s + Math.abs(r.detected - r.count), 0) / ok.length;
  // A few clips are labelled 0 reps; leave them out of the relative error.
  const pos = ok.filter((r) => r.count > 0);
  const nmae = pos.reduce((s, r) => s + Math.abs(r.detected - r.count) / r.count, 0) / pos.length;
  const sumTrue = ok.reduce((s, r) => s + r.count, 0);
  const sumFound = ok.reduce((s, r) => s + r.detected, 0);
  const over = ok.filter((r) => r.detected > r.count).length;
  const under = ok.filter((r) => r.detected < r.count).length;
  console.log(
    `exact ${exact}/${ok.length}, off by at most 1: ${obo}/${ok.length}, mean abs error ${mae.toFixed(2)} reps (${(nmae * 100).toFixed(0)}% of the true count)`,
  );
  console.log(`reps found ${sumFound} of ${sumTrue}; overcounted clips ${over}, undercounted ${under}${rs.length - ok.length ? `, failed ${rs.length - ok.length}` : ''}`);
  if (!verbose) console.log('(exact clips hidden; --verbose shows all)');
}
writeFileSync(resolve(DATA, 'eval-results.json'), JSON.stringify(rows, null, 1));
console.log(`\nper-clip results: ${resolve(DATA, 'eval-results.json')}`);
// Exit explicitly: a closed Chrome socket or the Vite server can keep Node alive.
process.exit(0);

// ---- Chrome worker ----
async function worker(w, base, queue, tick) {
  const port = 9600 + w + Math.floor(Math.random() * 300);
  const profile = `/tmp/rc-eval-${port}`;
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  const cdp = await connect(port);
  try {
    while (queue.length) {
      const l = queue.shift();
      const out = posePath(l);
      mkdirSync(dirname(out), { recursive: true });
      const fps = frameRate(resolve(DATA, l.file));
      let result;
      try {
        // A fresh page per video: MediaPipe's tracker keeps state between clips.
        await cdp.send('Page.navigate', { url: `${base}scripts/eval/extract.html` });
        await cdp.waitFor('!!window.extractReady', 30000);
        await cdp.eval('window.extractReady.then(() => true)', 60000);
        const json = await cdp.eval(`window.extractPoses(${JSON.stringify(`/test-videos/datasets/${DATASET}/${l.file}`)}).then(JSON.stringify)`, 15 * 60000);
        result = { ...JSON.parse(json), fps };
      } catch (e) {
        result = { error: String(e.message ?? e).slice(0, 200), fps };
      }
      writeFileSync(out, JSON.stringify(result));
      tick();
    }
  } finally {
    cdp.close();
    chrome.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 300));
    rmSync(profile, { recursive: true, force: true });
  }
}

function frameRate(file) {
  const r = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file]).toString().trim();
  const [n, d] = r.split('/').map(Number);
  return d ? n / d : n;
}

async function connect(port) {
  let url;
  for (let i = 0; i < 100 && !url; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      url = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!url) await new Promise((r) => setTimeout(r, 200));
  }
  if (!url) throw new Error('Chrome did not start');
  const ws = new WebSocket(url);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evalExpr = async (expression, timeoutMs) => {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page error');
    return r.result.value;
  };
  return {
    send,
    eval: evalExpr,
    async waitFor(expr, timeoutMs) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try {
          if (await evalExpr(expr, 5000)) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error('page did not load');
    },
    close: () => ws.close(),
  };
}
