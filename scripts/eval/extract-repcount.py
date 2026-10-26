"""Extract RepCount-A videos and labels from the Lance files (research use only).

Writes test-videos/datasets/repcount/videos/<split>/<id>.mp4 and labels.json
with one entry per video: split, id, file, action (normalised), count, bounds.
Never commit these videos or anything derived from them.
Needs the Lance reader, once:
  python3 -m venv test-videos/.venv && test-videos/.venv/bin/pip install pylance
Then: test-videos/.venv/bin/python scripts/eval/extract-repcount.py [test validation ...]
"""
import json
import sys
from pathlib import Path

import lance

ROOT = Path(__file__).resolve().parents[2] / 'test-videos/datasets/repcount'
# RepCount-A spells some classes two ways.
ALIASES = {
    'squant': 'squat', 'frontraise': 'front_raise', 'benchpressing': 'bench_pressing',
    'jumpjacks': 'jump_jack', 'pullups': 'pull_up', 'pushups': 'push_up',
}

splits = sys.argv[1:] or ['test']
labels_path = ROOT / 'labels.json'
labels = json.loads(labels_path.read_text()) if labels_path.exists() else []
labels = [l for l in labels if l['split'] not in splits]

for split in splits:
    src = ROOT / f'{split}.lance'
    if not src.exists():
        print(f'skip {split}: {src} not downloaded')
        continue
    ds = lance.dataset(str(src))
    rows = ds.to_table(columns=['video_id', 'action_type', 'count', 'cycle_bounds_json', 'video_ext']).to_pylist()
    out_dir = ROOT / 'videos' / split
    out_dir.mkdir(parents=True, exist_ok=True)
    blobs = ds.take_blobs('video_blob', indices=list(range(len(rows))))
    for row, blob in zip(rows, blobs):
        out = out_dir / f"{row['video_id']}.{row['video_ext'] or 'mp4'}"
        if not out.exists() or out.stat().st_size == 0:
            with blob as f:
                out.write_bytes(f.read())
        action = ALIASES.get(row['action_type'], row['action_type'])
        labels.append({
            'split': split,
            'id': row['video_id'],
            'file': str(out.relative_to(ROOT)),
            'action': action,
            'count': row['count'],
            # Frame indices, start/end per cycle, at the video's own frame rate.
            'bounds': json.loads(row['cycle_bounds_json'] or '[]'),
        })
    print(f'{split}: {len(rows)} videos')

labels_path.write_text(json.dumps(labels, indent=1))
print(f'{len(labels)} labels in {labels_path}')
