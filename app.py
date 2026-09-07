import streamlit as st
import streamlit.components.v1 as components
import os
import json
import zipfile
import tempfile
import html
import requests as http_requests
import time
from dotenv import load_dotenv

load_dotenv()

from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph
from conformance.visualize import generate_interactive_html
from conformance.classifier_agent import classify_modules
from conformance.checker import check_architecture

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(layout="wide", page_title="Archon Conformance", initial_sidebar_state="expanded")

st.markdown("""
    <style>
        .block-container { padding-top: 3rem; padding-bottom: 0rem; }
        header[data-testid="stHeader"] { background-color: transparent; }
    </style>
""", unsafe_allow_html=True)

# ── CURATED NVIDIA MODELS ─────────────────────────────────────────────────────
# Updated with active NVIDIA NIM hosted models
CURATED_NVIDIA_MODELS = [
    "meta/llama-3.2-11b-vision-instruct",
    "meta/llama-3.2-90b-vision-instruct",
    "deepseek-ai/deepseek-v4-pro-0813",
    "deepseek-ai/deepseek-v4-flash-0731",
    "moonshotai/kimi-k3"
]

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("Archon")

    st.header("1. Upload Project Files")
    st.write("Upload a `.zip` of a Python project.")
    
    DEMO_ZIP_PATH = os.path.join("test_codebases", "ecommerce_platform.zip")
    
    col_upload, col_demo = st.columns([3, 1.2])
    with col_upload:
        uploaded_zip = st.file_uploader("Project ZIP", type=["zip"], label_visibility="collapsed")
    with col_demo:
        if st.button("⚡ Demo", help="Auto-load pre-built demo codebase with injected violations", use_container_width=True):
            st.session_state['demo_loaded'] = True
            st.rerun()

    if uploaded_zip is not None:
        st.session_state['demo_loaded'] = False

    if st.session_state.get('demo_loaded'):
        st.caption("📦 **Demo Active:** `ecommerce_platform.zip`")

    st.header("2. AI Settings")
    provider = st.selectbox("Provider", ["groq", "nvidia", "gemini", "openai", "qwen"])

    if provider == "nvidia":
        nvidia_model = st.selectbox("NVIDIA Model", CURATED_NVIDIA_MODELS)
    else:
        nvidia_model = None

    st.header("3. Actions")
    generate_btn = st.button("Generate Reality Graph", use_container_width=True)
    classify_btn = st.button("Run AI Classifier", use_container_width=True)

    st.header("4. The Blueprint")
    st.write("Select an architecture ruleset to enforce.")
    
    template_choice = st.selectbox(
        "Architecture Template", 
        ["Clean Architecture", "Model-View-Controller (MVC)", "Traditional 3-Tier", "Upload Custom JSON..."]
    )
    
    uploaded_json = None
    if template_choice == "Upload Custom JSON...":
        uploaded_json = st.file_uploader("Upload Architecture JSON", type=["json"], label_visibility="collapsed")
    
    # ── Map choice to JSON file ──
    template_map = {
        "Clean Architecture": "clean_architecture.json",
        "Model-View-Controller (MVC)": "mvc_architecture.json",
        "Traditional 3-Tier": "layered_architecture.json"
    }

    if template_choice == "Upload Custom JSON..." and uploaded_json is not None:
        blueprint = json.load(uploaded_json)
        ruleset_path = "temp_blueprint.json"
        with open(ruleset_path, "w") as f:
            json.dump(blueprint, f)
    else:
        # Load from our curated fixtures
        file_name = template_map.get(template_choice, "clean_architecture.json")
        ruleset_path = os.path.join("shared", "fixtures", file_name)
        try:
            with open(ruleset_path, "r") as f:
                blueprint = json.load(f)
        except Exception:
            blueprint = {}

    with st.expander("View Architecture Rules (JSON)"):
        st.json(blueprint)

# ── STATE ─────────────────────────────────────────────────────────────────────
if 'target_dir' not in st.session_state:
    st.session_state['target_dir'] = None

# ── GENERATE GRAPH ────────────────────────────────────────────────────────────
if generate_btn:
    zip_source = None
    if uploaded_zip is not None:
        zip_source = uploaded_zip
    elif st.session_state.get('demo_loaded') and os.path.exists(DEMO_ZIP_PATH):
        zip_source = DEMO_ZIP_PATH

    if zip_source is not None:
        with st.spinner("Extracting ZIP and mapping dependencies..."):
            temp_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(zip_source, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            st.session_state['target_dir'] = temp_dir

            raw_deps = extract_project_dependencies(temp_dir)
            G = build_dependency_graph(raw_deps)

            html_path = "temp_graph.html"
            generate_interactive_html(G, html_path)

            st.session_state['G'] = G
            st.session_state['nodes_list'] = list(G.nodes())
            st.session_state['graph_html'] = html_path
    else:
        st.error("Please upload a .zip file or click ⚡ Demo first!")

# ── AI CLASSIFY ───────────────────────────────────────────────────────────────
if classify_btn:
    if 'nodes_list' not in st.session_state:
        st.error("Please generate the graph first!")
    else:
        label = f"{provider} ({nvidia_model})" if provider == "nvidia" and nvidia_model else provider
        with st.spinner(f"AI [{label}] is classifying {len(st.session_state['nodes_list'])} files..."):
            try:
                result = classify_modules(
                    modules=st.session_state['nodes_list'],
                    ruleset_path=ruleset_path,
                    model_choice=provider,
                    nvidia_model=nvidia_model  # Pass the selected NVIDIA model name through
                )
                st.session_state['classification_mapping'] = result.mapping
                
                # RE-RENDER GRAPH WITH AI COLORS
                html_path = "temp_graph.html"
                generate_interactive_html(st.session_state['G'], html_path, mapping=result.mapping)
                st.session_state['graph_html'] = html_path
                
                st.success(f"Classification Complete! Confidence: {result.confidence_score * 100:.1f}%")
                st.info(f"**AI Reasoning:** {result.reasoning}")
                with st.expander("View Layer Mappings", expanded=False):
                    st.json(result.mapping)
            except Exception as e:
                st.error(f"AI Error: {e}")

# ── VIOLATION INSPECTION MODAL (XAI POPUP) ───────────────────────────────────
def render_violation_card_html(v) -> str:
    """Renders the identical high-fidelity card used in the graph popup."""
    code_html = ""
    if v.line_number and v.code_snippet:
        code_html = f"""
        <div style="background:#0c0e14; border:1px solid #222736; border-radius:8px; padding:10px 14px; font-family:'Consolas', monospace; font-size:13px; color:#e2e8f0; margin:8px 0 14px 0; overflow-x:auto;">
            <span style="color:#747d8c; margin-right:12px; font-weight:bold;">Line {v.line_number}</span>
            <span style="color:#ff6b81;">{html.escape(v.code_snippet)}</span>
        </div>
        """
    else:
        code_html = '<div style="color:#747d8c; font-size:13px; margin:6px 0 12px 0;">Direct module-level dependency detected.</div>'

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    body {{
        margin: 0; padding: 4px;
        background-color: transparent;
        color: #f1f2f6;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }}
    .card {{
        background: #181b24;
        border: 1px solid #2f3542;
        border-radius: 12px;
        padding: 20px 24px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }}
    .badge-source {{
        background: rgba(52, 152, 219, 0.2); border: 1px solid #3498db; color: #70a1ff; padding: 4px 10px; border-radius: 6px; font-size: 13px;
    }}
    .badge-target {{
        background: rgba(255, 71, 87, 0.2); border: 1px solid #ff4757; color: #ff6b81; padding: 4px 10px; border-radius: 6px; font-size: 13px;
    }}
    .sec-title {{
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-top: 10px;
    }}
    .box-hazard {{
        background: rgba(230, 126, 34, 0.12); border-left: 4px solid #e67e22; padding: 10px 14px; border-radius: 4px; font-size: 13.5px; line-height: 1.5; color: #dfe4ea; margin: 6px 0 14px 0;
    }}
    .box-remediation {{
        background: rgba(46, 204, 113, 0.12); border-left: 4px solid #2ecc71; padding: 10px 14px; border-radius: 4px; font-size: 13.5px; line-height: 1.5; color: #dfe4ea; margin-top: 6px;
    }}
</style>
</head>
<body>
<div class="card">
    <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <span class="badge-source">Source: <b>{html.escape(v.source_module)}</b> ({html.escape(v.source_layer)})</span>
        <span class="badge-target">Target: <b>{html.escape(v.target_module)}</b> ({html.escape(v.target_layer)})</span>
    </div>

    <div class="sec-title" style="color: #a4b0be;">📍 Offending Source Code</div>
    {code_html}

    <div class="sec-title" style="color: #e67e22;">🧠 Architectural Hazard (XAI)</div>
    <div class="box-hazard">{html.escape(v.explanation or v.reason)}</div>

    <div class="sec-title" style="color: #2ecc71;">💡 Remediation Strategy (How to Fix)</div>
    <div class="box-remediation">{html.escape(v.remediation or "Refactor modules to invert or decouple dependencies.")}</div>
</div>
</body>
</html>"""

if "selected_violation_idx" not in st.session_state:
    st.session_state.selected_violation_idx = None

# ── RUN AUDIT (THE CHECKER) ───────────────────────────────────────────────────
if st.sidebar.button("Run Conformance Audit", type="primary", use_container_width=True):
    if 'G' not in st.session_state or 'classification_mapping' not in st.session_state:
        st.sidebar.error("Generate graph and run AI classifier first!")
    else:
        with st.spinner("Auditing architecture against Blueprint..."):
            report = check_architecture(
                G=st.session_state['G'],
                mapping=st.session_state['classification_mapping'],
                ruleset=blueprint
            )
            st.session_state['audit_report'] = report

            # RE-RENDER GRAPH WITH RED DASHED VIOLATION EDGES
            html_path = "temp_graph.html"
            generate_interactive_html(
                st.session_state['G'],
                html_path,
                mapping=st.session_state['classification_mapping'],
                violations=report.violations
            )
            st.session_state['graph_html'] = html_path

# ── RENDER RESULTS ────────────────────────────────────────────────────────────
if 'audit_report' in st.session_state:
    report = st.session_state['audit_report']
    
    # Display the score
    score_color = "#2ecc71" if report.score > 80 else ("#f39c12" if report.score > 50 else "#ff4757")
    st.markdown(f"<h2 style='text-align: center; color: {score_color};'>Architecture Health Score: {report.score:.1f}%</h2>", unsafe_allow_html=True)
    st.write(f"Checked **{report.total_edges_checked}** internal dependencies.")
    
    # Display violations
    if report.violations:
        st.error(f"Found {len(report.violations)} architectural violations! Click 'Inspect' on any item to view code & remediation.")
        for idx, v in enumerate(report.violations):
            col_text, col_act = st.columns([5, 1])
            with col_text:
                line_info = f" (line {v.line_number})" if v.line_number else ""
                st.markdown(f"⚠️ **`{v.source_module}`** ({v.source_layer}) ➔ **`{v.target_module}`** ({v.target_layer}){line_info}")
            with col_act:
                if st.button("🔍 Inspect", key=f"btn_violation_{idx}", use_container_width=True):
                    if st.session_state.get("selected_violation_idx") == idx:
                        st.session_state.selected_violation_idx = None
                    else:
                        st.session_state.selected_violation_idx = idx
                    st.rerun()
            
            if st.session_state.get("selected_violation_idx") == idx:
                components.html(render_violation_card_html(v), height=410)
    else:
        st.success("No architectural violations found! Your codebase perfectly matches the blueprint.")
        
    st.divider()

if 'graph_html' in st.session_state and os.path.exists(st.session_state['graph_html']):
    with open(st.session_state['graph_html'], "r", encoding="utf-8") as f:
        html_data = f.read()
    components.html(html_data, height=900)
elif not generate_btn and not classify_btn:
    st.info("Upload a project .zip in the sidebar and click 'Generate Reality Graph' to start!")
