from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os

from .config import PORT, DATASET_DIR
from .chunker import chunk_file_content
from .scip_extractor import SCIPExtractor

app = FastAPI(
    title="Ingestion & Schema Microservice",
    version="1.0.0",
    description="Smart documentation parsing, schema normalization, and chunk enrichment service"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParseRequest(BaseModel):
    file_path: Optional[str] = None
    content: Optional[str] = None
    filename: Optional[str] = "document.txt"

@app.get("/health")
def health():
    return {"status": "healthy", "service": "ingestion_service", "version": "1.0.0"}

@app.post("/api/parse-file")
async def parse_file(file: UploadFile = File(...)):
    """Receives a multipart file upload, parses its schema, and returns enriched semantic chunks."""
    try:
        content_bytes = await file.read()
        chunks = chunk_file_content(content_bytes, file.filename)
        return {
            "status": "success",
            "filename": file.filename,
            "chunk_count": len(chunks),
            "chunks": chunks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse {file.filename}: {str(e)}")

@app.post("/api/parse-dataset")
def parse_dataset():
    """Scans the dataset directory and returns normalized chunks for all API specifications."""
    if not os.path.exists(DATASET_DIR):
        return {"status": "error", "message": f"Dataset directory {DATASET_DIR} not found", "chunks": []}

    all_chunks = []
    processed_files = []

    for filename in sorted(os.listdir(DATASET_DIR)):
        if filename.endswith(('.yaml', '.yml', '.json', '.md')):
            file_path = os.path.join(DATASET_DIR, filename)
            try:
                with open(file_path, 'rb') as f:
                    file_bytes = f.read()
                chunks = chunk_file_content(file_bytes, filename)
                all_chunks.extend(chunks)
                processed_files.append(filename)
            except Exception as e:
                print(f"Error processing {filename}: {e}")

    return {
        "status": "success",
        "processed_files": processed_files,
        "total_chunks": len(all_chunks),
        "chunks": all_chunks
    }

class FileItem(BaseModel):
    path: str
    content: str

class CodebaseIndexRequest(BaseModel):
    files: List[FileItem]

@app.post("/api/scip/index")
def scip_index_codebase(req: CodebaseIndexRequest):
    """Parses a batch of codebase files and returns high-signal SCIP chunks and Knowledge Graph."""
    extractor = SCIPExtractor()
    file_dicts = [{"path": f.path, "content": f.content} for f in req.files]
    return extractor.index_codebase(file_dicts)
