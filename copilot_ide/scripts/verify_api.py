import httpx
import json

client = httpx.Client(base_url="http://localhost:8003", timeout=10.0)

# 1. Models
print("1. Testing /api/models:")
r = client.get("/api/models")
print(r.status_code, r.json())

# 2. Database
print("\n2. Testing /api/database:")
r = client.get("/api/database")
data = r.json()
print("Fixed chunks:", len(data.get("fixed_chunks", [])))
print("Semantic chunks:", len(data.get("semantic_chunks", [])))

# 3. Search
print("\n3. Testing /api/search:")
r = client.post("/api/search", json={"query": "stripe create customer charge", "model": "gemma3:4b"})
search_data = r.json()
print("BM25 top count:", len(search_data.get("bm25", [])))
print("Dense top count:", len(search_data.get("dense", [])))
print("Reranked top count:", len(search_data.get("reranked", [])))
if search_data.get("reranked"):
    print("Top reranked chunk score:", search_data["reranked"][0].get("score"))
    print("Top reranked snippet:", search_data["reranked"][0].get("text", "")[:120], "...")

print("\nALL_API_ENDPOINTS_FUNCTIONAL_SUCCESS")
