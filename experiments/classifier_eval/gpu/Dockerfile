# Pre-baked base image for Kev-9B serving on the college DGX pod (clf-dev).
# Contains Python 3.13 + kev's .venv + open-source Qwen/Qwen3.5-9B-Base weights ONLY.
# Fine-tuned Archon LoRA adapters (archon-9b-L0..L3, ~193 MB each) stay on the head node
# and are streamed into /work/runs/ by kev_serve.sh at pod start (~3 s).
#
# Note: Shards are fetched across separate RUN layers so each compressed layer remains
# below GitHub Container Registry's 10 GB per-layer limit.
FROM python:3.13-bookworm

ENV HF_HOME=/work/hf \
    HF_HUB_DISABLE_XET=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN pip install --no-cache-dir uv \
    && mkdir -p /work/runs /work/hf \
    && git clone --depth 1 https://github.com/jaredpalmer/kev.git /work/kev \
    && cd /work/kev \
    && uv sync --extra serve \
    && rm -rf /work/kev/.git /work/kev/runs /work/kev/evals \
    && find /work/kev -type d -name __pycache__ -exec rm -rf {} +

# Pre-download Qwen/Qwen3.5-9B-Base across <=5 GB layers (metadata first, then each shard).
RUN /work/kev/.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3.5-9B-Base', ignore_patterns=['*.safetensors'])"
RUN /work/kev/.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3.5-9B-Base', allow_patterns=['*00001*'])"
RUN /work/kev/.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3.5-9B-Base', allow_patterns=['*00002*'])"
RUN /work/kev/.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3.5-9B-Base', allow_patterns=['*00003*'])"
RUN /work/kev/.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3.5-9B-Base', allow_patterns=['*00004*'])"

WORKDIR /work
CMD ["bash", "-c", "mkdir -p /work/runs && sleep infinity"]
