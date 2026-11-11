"""ArcGen microservice: SRS / prompt -> requirement-grounded architecture.

Run natively:  uvicorn app.main:app --port 8004   (from copilot_ide/services/arcgen_service)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.llm_router import router as llm_router
from app.router import router

app = FastAPI(
    title="Archon ArcGen Service",
    version="1.0.0",
    description="Phase A ASR elicitation and Phase B architecture generation",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(llm_router, prefix="/api/arcgen/llm", tags=["arcgen-llm"])
app.include_router(router, prefix="/api/arcgen", tags=["arcgen"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "arcgen"}
