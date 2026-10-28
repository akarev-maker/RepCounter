"""Cut labelled sets out of the MM-Fit RGB videos on Zenodo, without
downloading the full 39 GB (ffmpeg seeks over HTTP).

Needs the label CSVs first: python3 scripts/eval/mmfit-labels.py
Writes test-videos/datasets/mmfit/videos/<workout>_<n>.mp4 (640 wide, no audio)
and test-videos/datasets/mmfit/labels.json in the same format as RepCount-A.
Workouts w00-w09 are the tuning split ("validation"), w10-w20 the held-out
split ("test").

MM-Fit: https://mmfit.github.io/ and https://zenodo.org/records/7672767
(CC BY 4.0). Cite: Strömbäck, Huang, Radu, "MM-Fit: Multimodal Deep Learning
for Automatic Exercise Logging Across Sensing Devices", IMWUT 4(4), 2020.

  python3 scripts/eval/mmfit-clips.py [exercise ...]
"""
import csv
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'test-videos/datasets/mmfit'
VIDEO = 'https://zenodo.org/records/7672767/files/{w}_rgb.mp4'
FPS = 30
PAD_S = 1.5
DEFAULT = ['dumbbell_shoulder_press', 'tricep_extensions', 'lateral_shoulder_raises']

wanted = sys.argv[1:] or DEFAULT
labels_path = ROOT / 'labels.json'
labels = json.loads(labels_path.read_text()) if labels_path.exists() else []
have = {l['id'] for l in labels}
(ROOT / 'videos').mkdir(parents=True, exist_ok=True)

todo = []
for f in sorted((ROOT / 'labels').glob('w*_labels.csv')):
    w = f.name.split('_')[0]
    for i, (start, end, reps, ex) in enumerate(csv.reader(f.open())):
        if ex in wanted:
            todo.append((w, i, int(start), int(end), int(reps), ex))

done = 0
for w, i, start, end, reps, ex in todo:
    cid = f'{w}_{i:02d}'
    out = ROOT / 'videos' / f'{cid}.mp4'
    if not out.exists() or out.stat().st_size == 0:
        t0 = max(0, start / FPS - PAD_S)
        dur = (end - start) / FPS + 2 * PAD_S
        cmd = ['ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-i', VIDEO.format(w=w), '-t', f'{dur:.3f}',
               '-an', '-vf', 'scale=640:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', str(out)]
        if subprocess.run(cmd).returncode != 0:
            print('failed', cid)
            out.unlink(missing_ok=True)
            continue
    if cid not in have:
        labels.append({
            'split': 'validation' if int(w[1:]) < 10 else 'test',
            'id': cid,
            'file': f'videos/{cid}.mp4',
            'action': ex,
            'count': reps,
            'bounds': [],
        })
        have.add(cid)
        labels_path.write_text(json.dumps(labels, indent=1))
    done += 1
    print(f'\r{done}/{len(todo)} {cid} {ex}      ', end='', flush=True)
print(f'\n{len(labels)} labels in {labels_path}')
