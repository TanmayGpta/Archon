from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import os
import uuid
import threading
import json as json_module

from .config import OLLAMA_URL
from .chunker import chunk_file
from .search_engine import SearchEngine

app = FastAPI(
    title="Enterprise API Copilot Backend",
    version="1.0.0",
    description="Production-grade Hybrid RAG API Copilot"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SearchEngine()

# Start background loading of heavy neural models
threading.Thread(target=engine.initialize_models_and_data, daemon=True).start()

class QueryRequest(BaseModel):
    query: str
    model: str = "gemma3:4b"

@app.get("/api/models")
async def get_models():
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{OLLAMA_URL}/api/tags", timeout=5.0)
            models = [m["name"] for m in response.json().get("models", [])]
            return {"models": models}
        except Exception:
            return {"models": ["gemma3:4b", "gemma3:12b", "codellama:7b-instruct"]}

@app.get("/api/database")
def get_database():
    try:
        if not engine.collection:
            return {"error": "Database not initialized"}
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
            "semantic_chunks": semantic_chunks
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    temp_path = f"temp_{uuid.uuid4()}_{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())
        
    try:
        chunks = chunk_file(temp_path)
        if not chunks:
            os.remove(temp_path)
            return {"message": "No endpoints or sections found in file.", "chunks": []}
            
        if not engine.encoder or not engine.collection:
            os.remove(temp_path)
            return {
                "message": "Models are still initializing. Showing preview only.",
                "chunks": [c["text"] for c in chunks]
            }

        texts = [c["text"] for c in chunks]
        metas = [{"source": c.get("source", file.filename)} for c in chunks]
        ids = [str(uuid.uuid4()) for _ in chunks]
        
        embeddings = engine.encoder.encode(texts).tolist()
        engine.collection.add(
            documents=texts,
            metadatas=metas,
            ids=ids,
            embeddings=embeddings
        )
        
        engine.bm25, engine.docs_texts = engine.load_bm25()
        os.remove(temp_path)
        
        return {
            "message": f"Successfully ingested {len(chunks)} segments.",
            "chunks": texts
        }
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search")
def run_search(req: QueryRequest):
    return engine.search(req.query, top_k=5)

@app.post("/api/generate")
async def generate(req: QueryRequest):
    search_results = engine.search(req.query, top_k=3)
    cross_results = search_results.get("cross_encoder", [])
    valid_chunks = [c["text"] for c in cross_results if "text" in c and c.get("score") != "N/A"]
    context_text = "\n\n---\n\n".join(valid_chunks)

    prompt = f"""You are an Enterprise API Copilot, an expert AI assistant specializing in API integrations and developer code synthesis.
Answer the developer's query accurately, completely, and concisely based on the following API documentation context.
Provide production-ready code examples with correct endpoints, headers, and request parameters.

### API Documentation Context:
{context_text if context_text else 'No specific API documentation found.'}

### Developer Query:
{req.query}
"""

    async def token_stream():
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/generate",
                    json={"model": req.model, "prompt": prompt, "stream": True},
                    timeout=None
                ) as response:
                    async for line in response.aiter_lines():
                        if line.strip():
                            try:
                                chunk = json_module.loads(line)
                                token = chunk.get("response", "")
                                if token:
                                    yield f"data: {json_module.dumps({'token': token})}\n\n"
                                if chunk.get("done", False):
                                    yield f"data: {json_module.dumps({'done': True})}\n\n"
                                    break
                            except json_module.JSONDecodeError:
                                continue
            except Exception as e:
                err_msg = str(e) if str(e) else repr(e)
                yield f"data: {json_module.dumps({'error': f'Ollama Connection Error: {err_msg}'})}\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")
