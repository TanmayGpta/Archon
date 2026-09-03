import streamlit as st
import streamlit.components.v1 as components
import os
import json
import zipfile
import tempfile
import requests as http_requests
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
    uploaded_zip = st.file_uploader("Project ZIP", type=["zip"], label_visibility="collapsed")

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
    if uploaded_zip is not None:
        with st.spinner("Extracting ZIP and mapping dependencies..."):
            temp_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(uploaded_zip, 'r') as zip_ref:
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
        st.error("Please upload a .zip file of your codebase first!")

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

# ── RENDER RESULTS ────────────────────────────────────────────────────────────
if 'audit_report' in st.session_state:
    report = st.session_state['audit_report']
    
    # Display the score
    score_color = "green" if report.score > 80 else ("orange" if report.score > 50 else "red")
    st.markdown(f"<h2 style='text-align: center; color: {score_color};'>Architecture Health Score: {report.score:.1f}%</h2>", unsafe_allow_html=True)
    st.write(f"Checked **{report.total_edges_checked}** internal dependencies.")
    
    # Display violations
    if report.violations:
        st.error(f"Found {len(report.violations)} architectural violations!")
        for v in report.violations:
            st.warning(f"**Violation:** `{v.source_module}` ({v.source_layer}) ➔ `{v.target_module}` ({v.target_layer})\n\n*Reason: {v.reason}*")
    else:
        st.success("No architectural violations found! Your codebase perfectly matches the blueprint.")
        
    st.divider()

if 'graph_html' in st.session_state and os.path.exists(st.session_state['graph_html']):
    with open(st.session_state['graph_html'], "r", encoding="utf-8") as f:
        html_data = f.read()
    components.html(html_data, height=900)
elif not generate_btn and not classify_btn:
    st.info("Upload a project .zip in the sidebar and click 'Generate Reality Graph' to start!")
