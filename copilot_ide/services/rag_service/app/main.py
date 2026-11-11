from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import threading

from .config import PORT
from .search_engine import SearchEngine

app = FastAPI(
    title="RAG & Hybrid Search Microservice",
    version="1.0.0",
    description="Dual-engine Lexical + Dense Vector retrieval with MS-Marco Cross-Encoder neural re-ranking"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SearchEngine()

# Start background model loading and data synchronization
threading.Thread(target=engine.initialize_models_and_data, daemon=True).start()

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

class IngestRequest(BaseModel):
    chunks: List[Dict[str, Any]]
    clear_existing: Optional[bool] = False

@app.get("/health")
def health():
    try:
        count = engine.collection.count() if engine.collection else 0
    except Exception:
        count = 0
    return {
        "status": "healthy",
        "service": "rag_service",
        "ready": engine.ready,
        "indexed_chunks": count
    }

@app.post("/api/search")
def search(req: SearchRequest):
    """Executes hybrid retrieval and neural re-ranking across BM25 and ChromaDB."""
    return engine.search(req.query, top_k=req.top_k)

@app.post("/api/ingest")
def ingest(req: IngestRequest):
    """Ingests newly parsed chunks from Ingestion Service into ChromaDB and BM25 index."""
    count = engine.ingest_chunks(req.chunks, clear_existing=req.clear_existing or False)
    return {
        "status": "success",
        "ingested_count": count,
        "total_count": engine.collection.count() if engine.collection else 0
    }

@app.post("/api/sync")
def sync_dataset():
    """Triggers dataset synchronization with Ingestion Service."""
    engine.sync_with_ingestion_service()
    return {
        "status": "success",
        "total_count": engine.collection.count() if engine.collection else 0
    }

@app.get("/api/database")
def get_database():
    """Returns indexed documents and metadata for diagnostic inspection."""
    try:
        if not engine.collection:
            return {"error": "Database not initialized", "fixed_chunks": [], "semantic_chunks": []}
        all_docs = engine.collection.get()
        docs = all_docs.get('documents', [])
        metas = all_docs.get('metadatas', [])
        
        semantic_chunks = []
        for d, m in zip(docs, metas):
            if m and m.get("source"):
                semantic_chunks.append(f"[{m['source']}]\n{d}")
            else:
                semantic_chunks.append(d)
                
        return {
            "fixed_chunks": engine.docs_texts if engine.docs_texts else [],
            "semantic_chunks": semantic_chunks,
            "count": len(docs)
        }
    except Exception as e:
        return {"error": str(e), "fixed_chunks": [], "semantic_chunks": []}

@app.post("/api/database/clear-scip-chunks")
def clear_scip_chunks():
    """Removes all codebase SCIP chunks from ChromaDB and rebuilds BM25."""
    deleted = engine.clear_scip_chunks()
    return {
        "status": "success",
        "deleted_count": deleted,
        "remaining_count": engine.collection.count() if engine.collection else 0
    }

@app.get("/api/database/chunk-stats")
def get_chunk_stats():
    """Returns statistics on dataset chunks vs SCIP codebase chunks."""
    return engine.get_chunk_stats()

