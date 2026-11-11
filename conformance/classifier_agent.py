import json
import os
from typing import List, Dict
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from dotenv import load_dotenv

load_dotenv()

# ── Pydantic model: the EXACT structure we force the AI to return ─────────────
class ModuleClassification(BaseModel):
    mapping: Dict[str, str] = Field(
        description="Key = python module name, value = assigned architectural layer. Use 'unclassified' if unsure."
    )
    confidence_score: float = Field(
        description="0.0–1.0 confidence in the overall mapping."
    )
    reasoning: str = Field(
        description="Brief explanation of ambiguous or interesting classification decisions."
    )

# ── LLM factory: one function, swap model with a string ──────────────────────
def get_llm(model_choice: str, nvidia_model: str = None, schema: type = ModuleClassification, api_key: str = None):
    """
    Returns the correct LangChain LLM with structured output forced via Pydantic
    (`schema`, ModuleClassification unless another agent passes its own).

    Supported values:
        "gemini"  – Google Gemini 1.5 Pro (needs GOOGLE_API_KEY in .env)
        "groq"    – Groq Llama-3.3-70b, extremely fast free tier (needs GROQ_API_KEY)
        "nvidia"  – NVIDIA NIM meta/llama-3.1-70b (needs NVIDIA_API_KEY)
        "qwen"    – Local Qwen via Ollama, truly free/offline (needs Ollama running)
        "openai"  – GPT-4o-mini (needs OPENAI_API_KEY)
    """
    if model_choice == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-pro",
            temperature=0.1,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        ).with_structured_output(schema)

    elif model_choice == "groq":
        # Groq fast inference
        from langchain_groq import ChatGroq
        return ChatGroq(
            model="openai/gpt-oss-120b",
            temperature=0.1,
            groq_api_key=api_key or os.getenv("GROQ_API_KEY")
        ).with_structured_output(schema)

    elif model_choice == "nvidia":
        # NVIDIA NIM is OpenAI-compatible — just swap the base_url and key
        # nvidia_model is dynamically fetched from the live /v1/models endpoint in app.py
        # WARNING: Do NOT select reasoning models (deepseek-r1, nemotron-reasoning) — they
        # think for minutes before answering. Use instruct models only.
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=nvidia_model or "meta/llama-3.2-11b-vision-instruct",
            temperature=0.1,
            openai_api_key=os.getenv("NVIDIA_API_KEY"),
            openai_api_base="https://integrate.api.nvidia.com/v1",
            request_timeout=60   # Fail after 60s instead of hanging forever
        ).with_structured_output(schema)

    elif model_choice == "qwen":
        # Local Ollama model — requires Ollama running in background
        from langchain_community.chat_models import ChatOllama
        return ChatOllama(
            model="qwen:3b",
            temperature=0.1
        ).with_structured_output(schema)

    else:  # openai
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.1,
            openai_api_key=os.getenv("OPENAI_API_KEY")
        ).with_structured_output(schema)


# ── Main classification function ──────────────────────────────────────────────
def classify_modules(
    modules: List[str],
    ruleset_path: str,
    model_choice: str = "groq",
    nvidia_model: str = None,
    root_dir: str = None,
    api_key: str = None
) -> ModuleClassification:
    """
    Maps physical Python modules to architectural layers.
    model_choice "kev-precise" / "kev-efficient" uses the fine-tuned Kev-9B (needs root_dir to
    read the sources; see conformance/kev_classifier.py); anything else is an LLM from get_llm.
    """
    with open(ruleset_path, "r", encoding="utf-8") as f:
        ruleset = json.load(f)
    return classify_modules_with_ruleset(modules, ruleset, model_choice, nvidia_model, root_dir, api_key)


def classify_modules_with_ruleset(
    modules: List[str],
    ruleset: dict,
    model_choice: str = "groq",
    nvidia_model: str = None,
    root_dir: str = None,
    api_key: str = None
) -> ModuleClassification:
    """classify_modules for a ruleset already loaded (e.g. a Conformance Studio blueprint)."""
    if model_choice.startswith("kev"):
        from conformance.kev_classifier import classify_with_kev
        return classify_with_kev(modules, ruleset, root_dir, mode=model_choice.split("-", 1)[-1])

    layers_text = "\n".join(
        f"- **{l['name']}**: {l['description']}"
        for l in ruleset.get("layers", [])
    )
    unclassified_policy = ruleset.get("unclassified_policy", "flag_for_review")

    llm = get_llm(model_choice, nvidia_model=nvidia_model, api_key=api_key)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert Software Architect analyzing a codebase.
Map each Python module name to one of the defined architectural layers below.

Defined layers:
{layers_text}

Rules:
- Only use layer names exactly as listed above, or the string 'unclassified'.
- Never invent new layer names.
- Unclassified policy: {unclassified_policy}"""),
        ("human", "Classify these modules:\n\n{modules_list}")
    ])

    chain = prompt | llm

    result = chain.invoke({
        "layers_text": layers_text,
        "unclassified_policy": unclassified_policy,
        "modules_list": "\n".join(f"- {m}" for m in modules)
    })

    return result
