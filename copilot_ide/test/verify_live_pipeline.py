import urllib.request
import json

print("=== Ingesting Dataset into Ingestion Service ===")
try:
    req = urllib.request.Request("http://localhost:8002/api/parse-dataset", method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print("Status code:", resp.status)
        print("Total chunks:", data.get("total_chunks"))
        print("Processed files count:", len(data.get("processed_files", [])))
        for f in data.get("processed_files", []):
            print(f"  - {f['filename']}: {f['chunk_count']} chunks")
except Exception as e:
    print("Ingestion error:", e)

print("\n=== Checking RAG Service via Orchestrator or direct (8010) ===")
for port in [8010, 8001]:
    try:
        url = f"http://localhost:{port}/health"
        with urllib.request.urlopen(url, timeout=5) as resp:
            print(f"Port {port} health:", resp.status, resp.read().decode())
    except Exception as e:
        print(f"Port {port} failed:", e)

try:
    req = urllib.request.Request("http://localhost:8000/api/search", method="POST",
                                 data=json.dumps({"query": "order refund stripe Idempotency-Key", "top_k": 3}).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("\nOrchestrator Search response status:", resp.status)
        print("BM25 results count:", len(res.get("bm25", [])))
        print("Dense results count:", len(res.get("dense", [])))
        print("Cross-Encoder results count:", len(res.get("cross_encoder", [])))
        if res.get("cross_encoder"):
            print("Top cross encoder chunk source:", res["cross_encoder"][0].get("source"), "| endpoint:", res["cross_encoder"][0].get("endpoint"))
except Exception as e:
    print("Orchestrator search error:", e)
