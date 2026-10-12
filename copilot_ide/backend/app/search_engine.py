import os
import uuid
import numpy as np
from rank_bm25 import BM25Okapi
import chromadb
from sentence_transformers import SentenceTransformer, CrossEncoder

from .config import (
    CHROMA_DB_DIR, 
    DATASET_DIR, 
    EMBEDDING_MODEL, 
    CROSS_ENCODER_MODEL, 
    DEFAULT_COLLECTION_NAME
)
from .chunker import chunk_file

class SearchEngine:
    def __init__(self):
        self.encoder = None
        self.cross_encoder = None
        self.bm25 = None
        self.docs_texts = []
        self.collection = None
        self.ready = False
        
        self._init_chroma()

    def _init_chroma(self):
        try:
            self.chroma_client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
            self.collection = self.chroma_client.get_or_create_collection(name=DEFAULT_COLLECTION_NAME)
        except Exception as e:
            print(f"Warning: Could not initialize Chroma DB at {CHROMA_DB_DIR}: {e}")

    def load_bm25(self):
        if not self.collection:
            return None, []
        try:
            all_docs = self.collection.get()
            texts = all_docs.get('documents', [])
            if not texts:
                return None, []
            tokenized_corpus = [doc.split(" ") for doc in texts]
            return BM25Okapi(tokenized_corpus), texts
        except Exception as e:
            print(f"Error loading BM25 index: {e}")
            return None, []

    def initialize_models_and_data(self):
        """Loads neural models and auto-ingests the dataset if collection is empty."""
        try:
            print(f"SearchEngine: Loading {EMBEDDING_MODEL}...")
            self.encoder = SentenceTransformer(EMBEDDING_MODEL)
            
            print(f"SearchEngine: Loading {CROSS_ENCODER_MODEL}...")
            self.cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL)
            
            self.bm25, self.docs_texts = self.load_bm25()
            
            # Check if database needs seeding
            if self.collection and self.collection.count() == 0:
                print("SearchEngine: Collection is empty. Ingesting dataset...")
                self._seed_dataset()
            else:
                count = self.collection.count() if self.collection else 0
                print(f"SearchEngine: ChromaDB initialized with {count} chunks.")
                
            self.ready = True
            print("SearchEngine: Ready.")
        except Exception as e:
            print(f"SearchEngine Initialization Failed: {e}")

    def _seed_dataset(self):
        if not os.path.exists(DATASET_DIR):
            print(f"Dataset directory not found: {DATASET_DIR}")
            return
            
        all_chunks = []
        for filename in os.listdir(DATASET_DIR):
            if filename.endswith(('.yaml', '.yml', '.json', '.md')):
                file_path = os.path.join(DATASET_DIR, filename)
                try:
                    chunks = chunk_file(file_path)
                    all_chunks.extend(chunks)
                except Exception as e:
                    print(f"Failed to chunk {filename}: {e}")
                    
        if all_chunks:
            texts = [c["text"] for c in all_chunks]
            metas = [{"source": c["source"]} for c in all_chunks]
            ids = [str(uuid.uuid4()) for _ in all_chunks]
            
            print("SearchEngine: Encoding chunks into dense embeddings...")
            embeddings = self.encoder.encode(texts).tolist()
            
            print("SearchEngine: Storing in ChromaDB...")
            self.collection.add(
                documents=texts,
                metadatas=metas,
                ids=ids,
                embeddings=embeddings
            )
            print(f"SearchEngine: Successfully ingested {len(all_chunks)} chunks.")
            self.bm25, self.docs_texts = self.load_bm25()

    def search(self, query: str, top_k: int = 5) -> dict:
        """Executes BM25, Dense Vector, and Cross-Encoder re-ranking in parallel."""
        # 1. BM25 Lexical Search
        bm25_results = []
        if self.bm25 and self.docs_texts:
            tokens = query.split(" ")
            scores = self.bm25.get_scores(tokens)
            if len(scores) > 0:
                top_indices = np.argsort(scores)[::-1][:min(top_k, len(scores))]
                for i, idx in enumerate(top_indices):
                    bm25_results.append({
                        "rank": i + 1,
                        "score": f"Score: {scores[idx]:.2f}",
                        "text": self.docs_texts[idx]
                    })
        else:
            bm25_results.append({"rank": 1, "score": "N/A", "text": "BM25 index not ready or dataset empty."})

        # 2. Dense Vector Proximity Search
        dense_results = []
        top_docs = []
        if self.encoder and self.collection and self.collection.count() > 0:
            query_vector = self.encoder.encode(query).tolist()
            k = min(top_k * 2, self.collection.count())
            raw = self.collection.query(query_embeddings=[query_vector], n_results=k)
            
            if raw['documents'] and len(raw['documents'][0]) > 0:
                docs = raw['documents'][0]
                dists = raw['distances'][0]
                for i in range(min(top_k, len(docs))):
                    dense_results.append({
                        "rank": i + 1,
                        "score": f"L2 Dist: {dists[i]:.4f}",
                        "text": docs[i]
                    })
                top_docs = docs
        else:
            dense_results.append({"rank": 1, "score": "N/A", "text": "Dense vector model loading or DB empty."})

        # 3. Cross-Encoder Deep Attention Re-Ranking
        cross_results = []
        if self.cross_encoder and top_docs:
            pairs = [[query, doc] for doc in top_docs]
            scores = self.cross_encoder.predict(pairs)
            ranked = sorted(zip(scores, top_docs), reverse=True)
            for i, (score, doc) in enumerate(ranked[:top_k]):
                cross_results.append({
                    "rank": i + 1,
                    "score": f"Logit: {score:.4f}",
                    "text": doc
                })
        else:
            cross_results.append({"rank": 1, "score": "N/A", "text": "Cross-Encoder model loading or candidate pool empty."})

        return {
            "bm25": bm25_results,
            "dense": dense_results,
            "cross_encoder": cross_results
        }
