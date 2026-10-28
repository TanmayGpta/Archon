#!/usr/bin/env bash
# Runs inside the dev pod: installs Kev + Laya, then scores every model at every level.
# Layout expected: /work/experiments/classifier_eval (this harness) + /work/shared/fixtures.
set -uo pipefail
cd /work
export HF_HOME=/work/hf USE_TF=0 PIP_DISABLE_PIP_VERSION_CHECK=1
EVAL=/work/experiments/classifier_eval

if [ ! -d kev ]; then
  pip install -q uv laya
  git clone -q --depth 1 https://github.com/jaredpalmer/kev.git && (cd kev && uv sync -q --extra serve)
fi

for m in kev-4b kev-9b; do
  (cd kev && uv run --extra serve python -m kev.serve --run "jaredpalmer/$m" --port 8009 > "/work/$m.serve.log" 2>&1) &
  until curl -sf http://127.0.0.1:8009/v1/models > /dev/null; do
    kill -0 $! 2>/dev/null || { echo "$m server died:"; tail -20 "/work/$m.serve.log"; continue 2; }
    sleep 5
  done
  python "$EVAL/gpu/predict_decision.py" --backend kev --target http://127.0.0.1:8009 --name "$m"
  pkill -f "kev.serve" ; sleep 5
done

python "$EVAL/gpu/predict_decision.py" --backend laya --target convaiinnovations/laya --name laya
python "$EVAL/gpu/predict_decision.py" --backend laya --target convaiinnovations/laya-typed-decisions --name laya-typed
python "$EVAL/gpu/predict_decision.py" --backend laya --target convaiinnovations/laya-multilingual --name laya-ml8k --max-len 8192
echo ALL_DONE
