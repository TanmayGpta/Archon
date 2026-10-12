import re
from difflib import SequenceMatcher
from typing import Dict, Any, List, Optional, Set, Tuple

FLOW_KEYWORDS = {
    "how do we", "how does", "how can we", "how to", "where is", "where are",
    "what happens when", "who handles", "trace", "flow of", "lifecycle of",
    "send certificate", "receive certificate", "checkout flow", "refund flow", "authentication flow"
}

def split_identifiers(s: str) -> List[str]:
    """Splits camelCase, PascalCase, snake_case, kebab-case, and path identifiers."""
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', s)
    return re.findall(r'[a-zA-Z0-9]+', spaced.lower())

def stem_word(w: str) -> str:
    """Lightweight suffix stripping for common English inflections."""
    w = w.lower().strip()
    for suffix in ['ies', 'es', 's', 'ing', 'ed', 'tion']:
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            return w[:-len(suffix)]
    return w

def is_keyword_match(kw: str, target: str) -> bool:
    """Fuzzy and morphological keyword matcher with typo tolerance."""
    if not kw or not target:
        return False
    kw = kw.lower().strip()
    target_lower = target.lower().strip()
    kw_stem = stem_word(kw)
    
    if kw in target_lower or (kw_stem and kw_stem in target_lower):
        return True
    
    words = split_identifiers(target)
    for word in words:
        w_stem = stem_word(word)
        if kw_stem and w_stem:
            if kw_stem == w_stem or kw_stem.startswith(w_stem) or w_stem.startswith(kw_stem):
                return True
            # Fuzzy match for typos (e.g. cirtificate -> certificate, recive -> receive)
            if len(kw_stem) >= 4 and len(w_stem) >= 4:
                if SequenceMatcher(None, kw_stem, w_stem).ratio() >= 0.75:
                    return True
    return False

def is_flow_query(query: str) -> bool:
    """Detects if developer is asking an architectural, execution-flow, or lifecycle question."""
    if not query:
        return False
    q = query.lower().strip()
    return any(kw in q for kw in FLOW_KEYWORDS) or q.startswith(("how ", "where ", "what handles ", "which file ", "trace "))

class FlowTracer:
    """
    Deterministic Codebase Architecture & Flow Tracer.
    Traverses Knowledge Graph nodes and directional edges (ROUTES_TO, CALLS, CONTAINS, IMPORTS)
    to establish a grounded UI -> API -> Controller -> Service execution trace.
    """

    def __init__(self, knowledge_graph: Dict[str, Any]):
        self.graph = knowledge_graph or {}
        self.nodes: List[Dict[str, Any]] = self.graph.get("nodes", [])
        self.edges: List[Dict[str, Any]] = self.graph.get("edges", [])
        
        self.node_map: Dict[str, Dict[str, Any]] = {n["id"]: n for n in self.nodes}
        
        # Adjacency lists for fast graph navigation
        self.outgoing: Dict[str, List[Tuple[str, str]]] = {}
        self.incoming: Dict[str, List[Tuple[str, str]]] = {}
        
        for e in self.edges:
            s, t, rel = e.get("source"), e.get("target"), e.get("relationship", "")
            if s and t:
                self.outgoing.setdefault(s, []).append((t, rel))
                self.incoming.setdefault(t, []).append((s, rel))

    def trace_flow(self, user_prompt: str) -> Dict[str, Any]:
        """
        Extracts matching symbols and constructs a chronological execution path:
        Step 01: UI Component / Client Trigger
        Step 02: Client API Request / Route
        Step 03: Backend Controller / Handler / Recipient Processing
        Step 04: Downstream Service / Delivery / Template
        """
        user_words = re.findall(r'[a-zA-Z0-9]+', user_prompt.lower())
        stop_words = {
            "how", "do", "we", "the", "a", "an", "is", "in", "to", "for", "of",
            "on", "what", "where", "can", "when", "does", "are", "by", "with", "from"
        }
        keywords = [w for w in user_words if w not in stop_words and len(w) > 2]

        if not keywords:
            return {"is_flow": False, "steps": [], "flow_node_ids": [], "markdown_trace": ""}

        # 1. Score nodes based on keyword matches across label, file path, route, and docstring
        scored_nodes: List[Tuple[float, Dict[str, Any]]] = []
        for n in self.nodes:
            score = 0.0
            label_text = n.get("label") or ""
            file_text = n.get("file_path") or ""
            id_text = n.get("id") or ""
            doc_text = n.get("docstring") or ""
            
            for kw in keywords:
                if is_keyword_match(kw, label_text):
                    score += 4.0
                if is_keyword_match(kw, file_text):
                    score += 3.0
                if is_keyword_match(kw, id_text):
                    score += 2.0
                if doc_text and is_keyword_match(kw, doc_text):
                    score += 1.5

            if score > 0:
                scored_nodes.append((score, n))

        scored_nodes.sort(key=lambda x: x[0], reverse=True)
        if not scored_nodes:
            return {"is_flow": False, "steps": [], "flow_node_ids": [], "markdown_trace": ""}

        candidates = [item[1] for item in scored_nodes]

        # 2. Flexible Categorization across architectural layers
        ui_nodes = [
            n for n in candidates
            if any(p in (n.get("file_path") or "").lower() for p in ["page.js", "page.tsx", "components", "admin", "views", "screens"])
            and n.get("kind") in ["function", "file"]
        ]

        api_nodes = [
            n for n in candidates
            if any(p in (n.get("file_path") or "").lower() for p in ["api.js", "routes", "endpoint", "client.js"])
            or n.get("kind") == "endpoint"
            or (n.get("kind") == "function" and any(n.get("label", "").startswith(p) for p in ["submit", "send", "post", "get", "mark"]))
        ]

        backend_nodes = [
            n for n in candidates
            if any(p in (n.get("file_path") or "").lower() for p in ["modules", "controller", "service", "recipient", "storage", "scripts", "handlers"])
        ]

        downstream_nodes = [
            n for n in candidates
            if any(p in (n.get("file_path") or "").lower() for p in ["template", "email", "mail", "supabase", "sendgrid", "bucket", "queue"])
        ]

        # 3. Assemble Ordered Trace Sequence
        steps = []
        step_idx = 1
        used_ids: Set[str] = set()

        layer_definitions = [
            ("UI Trigger & Client Action", "ui", ui_nodes, "Triggers action or views status from UI component"),
            ("Client API Request / Route", "endpoint", api_nodes, "Dispatches network request with payload parameters"),
            ("Backend Processing & Handler", "function", backend_nodes, "Executes core domain logic and recipient mapping"),
            ("Downstream Service & Delivery", "service", downstream_nodes, "Dispatches external service integration, storage, or email delivery")
        ]

        for stage_name, kind, group, default_detail in layer_definitions:
            for n in group:
                if n["id"] not in used_ids:
                    steps.append({
                        "step": step_idx,
                        "node_id": n["id"],
                        "stage": stage_name,
                        "kind": kind,
                        "label": n.get("label", ""),
                        "file_path": n.get("file_path", ""),
                        "line_start": n.get("line_start", 1),
                        "detail": f"{default_detail} in `{n.get('file_path')}`"
                    })
                    used_ids.add(n["id"])
                    step_idx += 1
                    break

        # Fallback: if fewer than 2 stages matched, fill with remaining top candidate nodes
        if len(steps) < 2:
            for n in candidates:
                if n["id"] not in used_ids:
                    steps.append({
                        "step": step_idx,
                        "node_id": n["id"],
                        "stage": "Architecture Component",
                        "kind": n.get("kind", "file"),
                        "label": n.get("label", ""),
                        "file_path": n.get("file_path", ""),
                        "line_start": n.get("line_start", 1),
                        "detail": f"Involved module in `{n.get('file_path')}`"
                    })
                    used_ids.add(n["id"])
                    step_idx += 1
                    if len(steps) >= 3:
                        break

        if not steps:
            return {"is_flow": False, "steps": [], "flow_node_ids": [], "markdown_trace": ""}

        flow_node_ids = [s["node_id"] for s in steps]

        # 4. Generate Deterministic Markdown Trace for System Prompt
        trace_lines = [
            "### 🗺️ Discovered Codebase Architecture & Execution Flow (Deterministic Trace):",
            "Below is the exact component chain found in the indexed Knowledge Graph for this flow. Ground your answer strictly in these files and endpoints:\n"
        ]
        for s in steps:
            line_str = f":{s['line_start']}" if s.get("line_start") else ""
            trace_lines.append(f"**Step 0{s['step']} [{s['stage']}]:** `{s['file_path']}{line_str}` — `{s['label']}` ({s['detail']})")

        trace_lines.append("\n**Strict Directive:** Explain this end-to-end execution flow cleanly with the exact file locations, UI button trigger, HTTP method, and backend handlers. DO NOT fabricate generic mock code or placeholder comments like `// In a real app use Nodemailer`.")

        return {
            "is_flow": True,
            "steps": steps,
            "flow_node_ids": flow_node_ids,
            "markdown_trace": "\n".join(trace_lines)
        }
