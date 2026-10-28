#!/usr/bin/env bash
# Runs inside the dev pod: delta fine-tune of a Kev size on the train split, then one scored pass on the eval subset.
# Config is fixed up front (Kev's documented delta recipe); the test split is never used for choices.
#   LEVEL=L2 KEV=4b bash run_finetune.sh        (KEV: 0.8b | 4b | 9b, default 9b)
set -uo pipefail
export HF_HOME=/work/hf USE_TF=0 HF_HUB_DISABLE_XET=1
EVAL=/work/experiments/classifier_eval
LEVEL=${LEVEL:-L3}
KEV=${KEV:-9b}
RUN=/work/kev/runs/archon-$KEV-$LEVEL

python "$EVAL/gpu/make_kev_data.py" --level "$LEVEL"
cd /work/kev
uv run python -m kev.train --data "$EVAL/data/kev_train_$LEVEL.jsonl" \
  --base "Qwen/Qwen3.5-${KEV^^}-Base" --init_from "jaredpalmer/kev-$KEV" \
  --epochs 1 --lr 2e-5 --batch 1 --accum 8 --dtype bf16 --weights_dtype bf16 --checkpointing 1 \
  --max_state 2560 --device cuda --out "$RUN" || { echo TRAIN_FAILED; exit 1; }

(uv run --extra serve python -m kev.serve --run "$RUN" --port 8009 > /work/ft.serve.log 2>&1) &
until curl -sf http://127.0.0.1:8009/v1/models > /dev/null; do sleep 5; done
python "$EVAL/gpu/predict_decision.py" --backend kev --target http://127.0.0.1:8009 --name "kev-$KEV-ft" --levels "$LEVEL"
pkill -f kev.serve
echo FT_DONE
