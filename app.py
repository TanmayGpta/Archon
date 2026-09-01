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

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(layout="wide", page_title="Archon Conformance", initial_sidebar_state="expanded")

st.markdown("""
    <style>
        .block-container { padding-top: 1rem; padding-bottom: 0rem; }
    </style>
""", unsafe_allow_html=True)

# ── Helper: fetch live NVIDIA model list ──────────────────────────────────────
@st.cache_data(ttl=300)  # Cache for 5 minutes so we don't spam NVIDIA's API
def fetch_nvidia_models() -> list:
    """
    Hits the NVIDIA NIM /v1/models endpoint to get the live list of available models.
    Falls back to a hardcoded list if the API call fails.
    """
    fallback = [
        "meta/llama-3.3-70b-instruct",
        "nvidia/llama-3.3-nemotron-super-49b-v1",
        "qwen/qwen2.5-72b-instruct",
        "deepseek-ai/deepseek-r1",
    ]
    
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        return fallback
    
    try:
        response = http_requests.get(
            "https://integrate.api.nvidia.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            # Only keep models with "provider/model-name" format.
            # UUIDs like "f6b06895-..." are internal function IDs, not public endpoints.
            models = [
                m["id"] for m in data.get("data", [])
                if "/" in m.get("id", "")
            ]
            return sorted(models) if models else fallback
    except Exception:
        pass
    
    return fallback

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("Archon")

    st.header("1. Upload Codebase")
    st.write("Upload a `.zip` of a Python project.")
    uploaded_zip = st.file_uploader("Project ZIP", type=["zip"], label_visibility="collapsed")

    st.header("2. AI Settings")
    provider = st.selectbox("Provider", ["groq", "nvidia", "gemini", "openai", "qwen"])

    # Dynamic model selection — only shows live NVIDIA models when nvidia is selected
    if provider == "nvidia":
        with st.spinner("Fetching live NVIDIA models..."):
            nvidia_models = fetch_nvidia_models()
        nvidia_model = st.selectbox("NVIDIA Model", nvidia_models)
        # Warn user if they pick a reasoning model — those think for minutes
        if nvidia_model and any(x in nvidia_model for x in ["reasoning", "r1", "deepseek-r1"]):
            st.warning("Reasoning models can take several minutes. Pick an 'instruct' model for fast results.")
    else:
        nvidia_model = None

    st.header("3. Actions")
    generate_btn = st.button("Generate Reality Graph", use_container_width=True)
    classify_btn = st.button("Run AI Classifier", use_container_width=True)

    st.header("4. The Blueprint")
    ruleset_path = os.path.join("shared", "fixtures", "clean_architecture.json")
    try:
        with open(ruleset_path, "r") as f:
            blueprint = json.load(f)
        with st.expander("View Architecture Rules (JSON)"):
            st.json(blueprint)
    except Exception:
        blueprint = {}

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
                st.success(f"Classification Complete! Confidence: {result.confidence_score * 100:.1f}%")
                st.info(f"**AI Reasoning:** {result.reasoning}")
                with st.expander("View Layer Mappings", expanded=False):
                    st.json(result.mapping)
            except Exception as e:
                st.error(f"AI Error: {e}")

# ── RENDER GRAPH ──────────────────────────────────────────────────────────────
if 'graph_html' in st.session_state and os.path.exists(st.session_state['graph_html']):
    with open(st.session_state['graph_html'], "r", encoding="utf-8") as f:
        html_data = f.read()
    components.html(html_data, height=900)
elif not generate_btn and not classify_btn:
    st.info("Upload a project .zip in the sidebar and click 'Generate Reality Graph' to start!")
