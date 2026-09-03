# Archon: Conformance Engine 🛡️

This directory contains the **Conformance Half** of the Archon project. 
While Phase 1 (Generation) designs an architecture, this engine enforces it. It ingests a raw Python codebase, visualizes its actual physical dependencies, uses AI to classify the modules into semantic layers, and (soon) checks them against a strict architectural JSON contract.

## 🧠 Core Philosophy
1. **Deterministic Extraction:** We do *not* use AI to draw the graph. We use strict Python AST parsing to guarantee 100% mathematical accuracy of dependencies.
2. **Semantic Classification:** We use LLMs exclusively for what they are best at: reading human-named files (like `db_utils.py`) and assigning them to abstract architectural layers (like `Infrastructure`).
3. **Agnostic Enforcement:** The engine does not force a specific architecture. It reads a shared `architecture.json` contract (e.g., Clean, MVC, Layered) and enforces whatever rules are inside it.

---

## 📂 File Structure

*   **`extraction.py`**: Uses `ast` to recursively parse Python files and build a raw dictionary of imports.
*   **`graph.py`**: Converts the raw dictionary into a mathematical `networkx.DiGraph`. Distinguishes between Internal, Stdlib, and External nodes. Also handles circular dependency detection (Tarjan's algorithm).
*   **`visualize.py`**: Converts the NetworkX graph into an interactive, physics-based HTML visualization using `vis-network`.
*   **`classifier_agent.py`**: A LangChain-powered agent that uses strict Pydantic structured output to map physical Python files to architectural layers. Supports multi-provider routing (Groq, NVIDIA NIM, Gemini, OpenAI, Qwen).
*   **`checker.py`**: *(WIP)* The deterministic rule engine that compares the AI's classification map and the NetworkX graph against the JSON ruleset to flag violations.

---

## 🚀 Setup & Execution

1. **Install Dependencies** (from the root folder):
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure API Keys**:
   Create a `.env` file in the root directory (do not commit this file). Add your keys for whichever providers you want to use:
   ```env
   GROQ_API_KEY="gsk_..."
   NVIDIA_API_KEY="nvapi-..."
   GOOGLE_API_KEY="..."
   OPENAI_API_KEY="..."
   ```

3. **Run the Dashboard**:
   We provide a rich Streamlit UI to run the entire pipeline end-to-end.
   ```bash
   streamlit run app.py
   ```
   *   Upload a `.zip` of any Python codebase.
   *   Generate the interactive reality graph.
   *   Select a JSON template (Clean Architecture, MVC) and run the AI Classifier!
