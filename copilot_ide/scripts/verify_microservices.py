import httpx
import json
import time

print("=== Enterprise API Copilot Microservices Verification ===\n")

# 1. Ingestion Service (8002)
print("1. Testing Ingestion Service (http://localhost:8002):")
try:
    with httpx.Client(base_url="http://localhost:8002", timeout=10.0) as client:
        r = client.get("/health")
        print("  /health:", r.status_code, r.json())
        r = client.post("/api/parse-dataset")
        data = r.json()
        print("  /api/parse-dataset total chunks:", data.get("total_chunks", 0))
        print("  /api/parse-dataset files:", len(data.get("processed_files", [])))
except Exception as e:
    print("  [ERROR] Ingestion service:", e)

# 2. RAG & Hybrid Search Service (8001)
print("\n2. Testing RAG & Search Service (http://localhost:8001):")
try:
    with httpx.Client(base_url="http://localhost:8001", timeout=15.0) as client:
        r = client.get("/health")
        print("  /health:", r.status_code, r.json())
        r = client.get("/api/database")
        db = r.json()
        print("  /api/database indexed chunks:", db.get("count", len(db.get("fixed_chunks", []))))
        
        r = client.post("/api/search", json={"query": "Stripe create charge", "top_k": 3})
        search_res = r.json()
        print("  /api/search BM25 results:", len(search_res.get("bm25", [])))
        print("  /api/search Dense results:", len(search_res.get("dense", [])))
        print("  /api/search Cross-Encoder results:", len(search_res.get("cross_encoder", [])))
except Exception as e:
    print("  [ERROR] RAG service:", e)

# 3. Orchestrator Gateway (8000)
print("\n3. Testing Orchestrator Gateway (http://localhost:8000):")
try:
    with httpx.Client(base_url="http://localhost:8000", timeout=20.0) as client:
        r = client.get("/health")
        print("  /health mesh status:", r.status_code, r.json())
        
        r = client.get("/api/models")
        print("  /api/models:", r.status_code, r.json())
        
        r = client.post("/api/search", json={"query": "SendGrid send email", "top_k": 3})
        print("  /api/search proxy:", r.status_code, f"Cross-Encoder count: {len(r.json().get('cross_encoder', []))}")
        
        print("  /api/generate SSE stream test (gemma3:4b)...")
        tokens_received = 0
        with client.stream("POST", "/api/generate", json={"query": "How to send an SMS in Twilio?", "model": "gemma3:4b"}) as stream:
            for line in stream.iter_lines():
                if line and line.startswith("data: "):
                    chunk = json.loads(line[6:])
                    if chunk.get("token"):
                        tokens_received += 1
                    if chunk.get("done"):
                        break
        print(f"  /api/generate streaming completed successfully ({tokens_received} tokens received).")
except Exception as e:
    print("  [ERROR] Orchestrator gateway:", e)

print("\n=== All Microservices Verification Complete ===")
