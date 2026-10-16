import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Ensure repository root is in sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Attempt to load GOOGLE_API_KEY from known .env files if not already in os.environ
if not os.environ.get("GOOGLE_API_KEY"):
    candidate_envs = [
        os.path.join(REPO_ROOT, ".env"),
        r"C:\Users\krish\OneDrive\Desktop\CrewAI_Labs\lab-6\student_utility_agent\.env",
        r"C:\Users\krish\OneDrive\Desktop\CrewAI_Labs\.env",
    ]
    for env_path in candidate_envs:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            if os.environ.get("GOOGLE_API_KEY"):
                break

if not os.environ.get("GOOGLE_API_KEY"):
    raise RuntimeError("GOOGLE_API_KEY is not set. Please provide it in environment or .env file.")

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from archon_agai.agent import archon_audit_agent

async def run_archon_audit_session():
    print("=" * 80)
    print("  ARCHON AGENTIC AI - LAB ASSIGNMENT EXECUTION")
    print("  Google ADK Agent Execution using Session and Runner (Events Loop)")
    print("=" * 80)

    # 1. Initialize ADK In-Memory Session Service
    app_name = "archon-architectural-guard"
    user_id = "architect-krish"
    session_id = "session-audit-001"

    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id
    )
    print(f"\n[+] Created ADK Session: ID={session.id}, User={user_id}, App={app_name}")

    # 2. Instantiate ADK Runner with Archon LLM Agent and Session Service
    runner = Runner(
        agent=archon_audit_agent,
        session_service=session_service,
        app_name=app_name
    )
    print(f"[+] Initialized ADK Runner for Agent: {archon_audit_agent.name}")

    # 3. Construct initial User Query
    user_prompt = (
        "Run an architectural conformance and circular dependency audit on the codebase "
        "located at 'test_codebases/ecommerce_platform' against 'shared/fixtures/clean_architecture.json'. "
        "Diagnose any boundary violations using Explainable AI (XAI) rationale and suggest remediations."
    )
    user_content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_prompt)]
    )

    print(f"\n[USER PROMPT]: {user_prompt}\n")
    print("-" * 80)
    print("  COMMENCING ADK RUNNER EVENTS LOOP")
    print("-" * 80)

    # 4. Execute the ADK Runner Events Loop
    event_count = 0
    final_response_text = []

    for event in runner.run(session_id=session.id, user_id=user_id, new_message=user_content):
        event_count += 1
        print(f"\n>>> [EVENT #{event_count}] Author: {event.author}")

        if hasattr(event, "content") and event.content and hasattr(event.content, "parts"):
            for p in event.content.parts:
                # Check for Tool / Function Call
                if hasattr(p, "function_call") and p.function_call:
                    fc = p.function_call
                    print(f"    [TOOL CALL] Function: {fc.name}")
                    print(f"                Args: {dict(fc.args) if fc.args else {}}")

                # Check for Tool / Function Response
                elif hasattr(p, "function_response") and p.function_response:
                    fr = p.function_response
                    res = fr.response
                    res_snippet = str(res)
                    if len(res_snippet) > 180:
                        res_snippet = res_snippet[:180] + " ... [truncated]"
                    print(f"    [TOOL RESPONSE] Name: {fr.name}")
                    print(f"                    Result: {res_snippet}")

                # Check for Model Text Generation
                elif hasattr(p, "text") and p.text:
                    final_response_text.append(p.text)
                    print(f"    [MODEL OUTPUT]:\n{p.text}")

    print("\n" + "=" * 80)
    print(f"  EVENTS LOOP COMPLETED: Total Events Processed: {event_count}")
    print("=" * 80)

    # 5. Verify Session History state
    retrieved_session = await session_service.get_session(app_name=app_name, user_id=user_id, session_id=session.id)
    print(f"[+] Verified Persisted Session: ID={retrieved_session.id}")
    if hasattr(retrieved_session, "events"):
        print(f"[+] Total Events Recorded in Session State: {len(retrieved_session.events)}")

    return "".join(final_response_text)

if __name__ == "__main__":
    asyncio.run(run_archon_audit_session())
