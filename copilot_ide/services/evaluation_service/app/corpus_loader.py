import httpx
from .config import INGESTION_SERVICE_URL

CORPUS_ENDPOINTS: frozenset = frozenset()

def load_corpus_endpoints() -> frozenset:
    """Calls ingestion service to get all chunks, extracts endpoint set."""
    global CORPUS_ENDPOINTS
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(f"{INGESTION_SERVICE_URL}/api/parse-dataset")
            if resp.status_code == 200:
                data = resp.json()
                chunks = data.get("chunks", [])
                endpoints = set()
                for chunk in chunks:
                    ep = chunk.get("endpoint", "")
                    if ep and ep != "General":
                        endpoints.add(ep)
                CORPUS_ENDPOINTS = frozenset(endpoints)
                print(f"Corpus loader: Loaded {len(CORPUS_ENDPOINTS)} unique endpoints from {len(chunks)} chunks")
            else:
                print(f"Corpus loader: Ingestion service returned {resp.status_code}")
    except Exception as e:
        print(f"Corpus loader: Failed to connect to ingestion service: {e}")
    return CORPUS_ENDPOINTS

def get_corpus_endpoints() -> frozenset:
    global CORPUS_ENDPOINTS
    if not CORPUS_ENDPOINTS:
        load_corpus_endpoints()
    return CORPUS_ENDPOINTS
