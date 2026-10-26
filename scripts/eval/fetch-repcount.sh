#!/bin/zsh
# Downloads RepCount-A (Lance format, videos embedded) from Hugging Face into
# test-videos/datasets/repcount (gitignored). Research use only: never commit
# these videos or anything derived from them.
#   scripts/eval/fetch-repcount.sh                 test split (1.5 GB)
#   RC_SPLITS="test validation" scripts/eval/fetch-repcount.sh
# Dataset: https://huggingface.co/datasets/lmms-lab-eval/repcounta-lance
set -u
ROOT=${0:A:h}/../../test-videos/datasets/repcount
mkdir -p "$ROOT"
RC=lmms-lab-eval/repcounta-lance
for sp in ${=RC_SPLITS:-test}; do
  curl -s "https://huggingface.co/api/datasets/$RC/tree/main/data/$sp.lance?recursive=true" |
    node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{for(const f of JSON.parse(s)) if(f.type==="file") console.log(f.path)})' |
    while read -r p; do
      out="$ROOT/${p#data/}"
      mkdir -p "${out:h}"
      [[ -s "$out" ]] || curl -sL --retry 3 -o "$out" "https://huggingface.co/datasets/$RC/resolve/main/$p"
    done
  echo "$sp done"
done
du -sh "$ROOT"
