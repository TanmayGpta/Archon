# One image, two Cloud Run services (gateway + healing A2A). Build from the repo root:
#   docker build -f archon_agai/deploy/Dockerfile -t archon-guard .
FROM python:3.13-slim

# Node.js for the external Filesystem MCP server (npx) + git for importing codebases
RUN apt-get update && apt-get install -y --no-install-recommends git nodejs npm \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @modelcontextprotocol/server-filesystem@2025.8.21

WORKDIR /app
COPY archon_agai/requirements.txt archon_agai/requirements.txt
RUN pip install --no-cache-dir -r archon_agai/requirements.txt

COPY README.md README.md
COPY conformance/ conformance/
COPY shared/ shared/
COPY test_codebases/ test_codebases/
COPY archon_agai/ archon_agai/

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    AGAI_ALLOWED_ROOTS=/app/test_codebases:/app \
    AGAI_DEFAULT_CODEBASE=/app \
    AGAI_RUNS_DIR=/tmp/agai-runs \
    AGAI_FS_MCP_COMMAND=mcp-server-filesystem \
    AGAI_FS_MCP_PACKAGE=

# SERVICE=gateway | healing ; Cloud Run injects $PORT
ENV SERVICE=both
CMD ["sh", "-c", "if [ \"$SERVICE\" = healing ]; then uvicorn archon_agai.healing.a2a_server:app --host 0.0.0.0 --port ${PORT:-8101}; elif [ \"$SERVICE\" = both ]; then uvicorn archon_agai.healing.a2a_server:app --host 127.0.0.1 --port 8101 & exec uvicorn archon_agai.gateway:app --host 0.0.0.0 --port ${PORT:-8100}; else uvicorn archon_agai.gateway:app --host 0.0.0.0 --port ${PORT:-8100}; fi"]
