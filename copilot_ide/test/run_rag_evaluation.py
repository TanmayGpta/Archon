import json
import urllib.request
import os
import sys

RAG_URL = os.environ.get("RAG_SERVICE_URL", "http://rag-service:8001")
ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:8000")

QUESTIONS = [
    # Group 1: Single-File Retrieval (Baseline)
    {
        "id": "Q1",
        "group": "Group 1: Single-File Retrieval",
        "question": "What fields are required in the request body to create a new order?",
        "expected_sources": ["order_management_api.yaml"],
        "tag": "[SINGLE][BM25]"
    },
    {
        "id": "Q2",
        "group": "Group 1: Single-File Retrieval",
        "question": "What authentication scheme does the Twilio API use?",
        "expected_sources": ["twilio_v2010.yaml", "global_security_policies.md"],
        "tag": "[SINGLE][BM25]"
    },
    {
        "id": "Q3",
        "group": "Group 1: Single-File Retrieval",
        "question": "How do I send a Slack message to a channel?",
        "expected_sources": ["slack_dev_guide.md", "slack_v1.yaml"],
        "tag": "[SINGLE][BM25]"
    },
    {
        "id": "Q4",
        "group": "Group 1: Single-File Retrieval",
        "question": "What happens when an alert is escalated?",
        "expected_sources": ["incident_response_workflow.md", "alerting_service_api.yaml"],
        "tag": "[SINGLE][DENSE]"
    },
    {
        "id": "Q5",
        "group": "Group 1: Single-File Retrieval",
        "question": "List all the endpoints exposed by the Zendesk Tickets API.",
        "expected_sources": ["zendesk_tickets_api.yaml"],
        "tag": "[SINGLE][BM25]"
    },
    {
        "id": "Q6",
        "group": "Group 1: Single-File Retrieval",
        "question": "Which APIs prohibit passing the API key as a query parameter?",
        "expected_sources": ["global_security_policies.md"],
        "tag": "[SINGLE][BM25]"
    },
    {
        "id": "Q7",
        "group": "Group 1: Single-File Retrieval",
        "question": "What does a 429 error mean and what should the client do?",
        "expected_sources": ["api_error_codes.md", "api_gateway_routing.md"],
        "tag": "[SINGLE][BM25]"
    },

    # Group 2: Two-File Cross-Referencing
    {
        "id": "Q8",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "What is the exact Stripe endpoint called when a customer requests a refund through the Order Management API?",
        "expected_sources": ["order_management_api.yaml", "checkout_architecture_guide.md", "stripe_v1.yaml"],
        "tag": "[CROSS-2][DENSE]"
    },
    {
        "id": "Q9",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "What header must be included when initiating a refund to prevent duplicate charges, and which services require it?",
        "expected_sources": ["checkout_architecture_guide.md", "api_error_codes.md", "order_management_api.yaml"],
        "tag": "[CROSS-2][BM25]"
    },
    {
        "id": "Q10",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "When a critical alert fires, what Twilio API endpoint is called and what does the request body contain?",
        "expected_sources": ["alerting_service_api.yaml", "incident_response_workflow.md", "twilio_v2010.yaml"],
        "tag": "[CROSS-2][CROSS-3+]"
    },
    {
        "id": "Q11",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "After a Zendesk ticket tagged as a refund request is resolved, what external APIs are called and in what order?",
        "expected_sources": ["zendesk_tickets_api.yaml", "customer_support_workflow.md"],
        "tag": "[CROSS-2][DENSE]"
    },
    {
        "id": "Q12",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "Which internal services are NOT routed through the API Gateway, and why?",
        "expected_sources": ["api_gateway_routing.md", "github_webhooks_api.yaml", "zendesk_tickets_api.yaml"],
        "tag": "[CROSS-2][DENSE]"
    },
    {
        "id": "Q13",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "How is the pusher.email field from a GitHub push event used later in the deployment pipeline?",
        "expected_sources": ["github_webhooks_api.yaml", "ci_cd_deployment_guide.md"],
        "tag": "[CROSS-2][BM25]"
    },
    {
        "id": "Q14",
        "group": "Group 2: Two-File Cross-Referencing",
        "question": "What SendGrid endpoint is used to send a receipt after a successful order, and what triggers the call?",
        "expected_sources": ["checkout_architecture_guide.md", "sendgrid_v3.yaml", "sendgrid_swagger_2.json"],
        "tag": "[CROSS-2][DENSE]"
    },

    # Group 3: Multi-File / Multi-Hop
    {
        "id": "Q15",
        "group": "Group 3: Multi-Hop",
        "question": "Trace the complete flow from a GitHub push to main to a Slack notification appearing in #deployments. Name every API endpoint called, in order.",
        "expected_sources": ["github_webhooks_api.yaml", "ci_cd_deployment_guide.md", "alerting_service_api.yaml", "incident_response_workflow.md", "slack_v1.yaml"],
        "tag": "[CROSS-3+][DENSE]"
    },
    {
        "id": "Q16",
        "group": "Group 3: Multi-Hop",
        "question": "If a deployment fails, which APIs are called to notify the team, and which auth scheme does each one use?",
        "expected_sources": ["ci_cd_deployment_guide.md", "alerting_service_api.yaml", "global_security_policies.md", "twilio_v2010.yaml", "slack_dev_guide.md"],
        "tag": "[CROSS-3+][DENSE]"
    },
    {
        "id": "Q17",
        "group": "Group 3: Multi-Hop",
        "question": "A customer requests a refund via the support portal. Describe the full sequence of calls, starting from ticket creation to the email confirmation, naming every endpoint and field.",
        "expected_sources": ["zendesk_tickets_api.yaml", "customer_support_workflow.md", "stripe_v1.yaml", "sendgrid_v3.yaml"],
        "tag": "[CROSS-3+][DENSE]"
    },
    {
        "id": "Q18",
        "group": "Group 3: Multi-Hop",
        "question": "Which components or services could be affected if the Idempotency-Key requirement were removed from the Order Management API?",
        "expected_sources": ["order_management_api.yaml", "checkout_architecture_guide.md", "api_error_codes.md", "global_security_policies.md"],
        "tag": "[CROSS-3+][DENSE]"
    },
    {
        "id": "Q19",
        "group": "Group 3: Multi-Hop",
        "question": "What is the difference between how a warning alert and a critical alert are handled, end to end, including which external APIs are invoked?",
        "expected_sources": ["alerting_service_api.yaml", "incident_response_workflow.md", "twilio_v2010.yaml", "slack_dev_guide.md"],
        "tag": "[CROSS-3+][DENSE]"
    },

    # Group 4: Retrieval Failure / Decoy (Lab 4 Exercise 5)
    {
        "id": "Q20",
        "group": "Group 4: Retrieval Failure / Decoy",
        "question": "What is a refund?",
        "expected_sources": ["billing_glossary.md"],
        "tag": "[FAILURE][BM25]"
    },
    {
        "id": "Q21",
        "group": "Group 4: Retrieval Failure / Decoy",
        "question": "How do I issue a refund to a customer?",
        "expected_sources": ["stripe_v1.yaml", "order_management_api.yaml", "checkout_architecture_guide.md"],
        "tag": "[FAILURE][DENSE]"
    },
    {
        "id": "Q22",
        "group": "Group 4: Retrieval Failure / Decoy",
        "question": "What is idempotency?",
        "expected_sources": ["billing_glossary.md", "api_error_codes.md"],
        "tag": "[FAILURE][DENSE]"
    },
    {
        "id": "Q23",
        "group": "Group 4: Retrieval Failure / Decoy",
        "question": "Which file handles payment authentication?",
        "expected_sources": ["global_security_policies.md", "stripe_v1.yaml"],
        "tag": "[FAILURE][BM25]"
    },

    # Group 5: Code Generation / Synthesis
    {
        "id": "Q24",
        "group": "Group 5: Code Generation",
        "question": "Write a Python requests snippet to place a new order via POST /orders with all required fields.",
        "expected_sources": ["order_management_api.yaml", "checkout_architecture_guide.md"],
        "tag": "[SINGLE]"
    },
    {
        "id": "Q25",
        "group": "Group 5: Code Generation",
        "question": "Write a Python function that first creates a Stripe charge, then records the charge_id in an order refund request.",
        "expected_sources": ["stripe_v1.yaml", "order_management_api.yaml", "checkout_architecture_guide.md"],
        "tag": "[CROSS-2]"
    },
    {
        "id": "Q26",
        "group": "Group 5: Code Generation",
        "question": "Write a unit test for a function that calls POST /alerts and asserts that the response contains a channels_notified array.",
        "expected_sources": ["alerting_service_api.yaml", "incident_response_workflow.md"],
        "tag": "[SINGLE]"
    }
]

def search_rag(query: str, top_k: int = 5):
    url = f"{RAG_URL}/api/search"
    body = json.dumps({"query": query, "top_k": top_k}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def evaluate():
    print(f"Connecting to RAG Service at {RAG_URL}...")
    
    # Check RAG database status
    db_req = urllib.request.Request(f"{RAG_URL}/api/database")
    with urllib.request.urlopen(db_req, timeout=10) as resp:
        db_info = json.loads(resp.read().decode("utf-8"))
        print(f"RAG ChromaDB indexed chunks: {db_info.get('count', 'N/A')}\n")

    results = []
    summary_stats = {"Correct": 0, "Partial": 0, "Wrong": 0, "Total": len(QUESTIONS)}

    print("=" * 80)
    print(f"{'ID':<4} | {'Tag':<20} | {'Status':<10} | {'Question & Retrieved Sources'}")
    print("=" * 80)

    for q in QUESTIONS:
        try:
            res = search_rag(q["question"], top_k=5)
            bm25_sources = [c.get("source") for c in res.get("bm25", [])]
            dense_sources = [c.get("source") for c in res.get("dense", [])]
            ce_items = res.get("cross_encoder", [])
            ce_sources = [c.get("source") for c in ce_items]
            ce_endpoints = [c.get("endpoint") for c in ce_items]

            # Assessment
            expected = set(q["expected_sources"])
            retrieved = set(ce_sources[:3])
            overlap = expected.intersection(retrieved)

            if len(overlap) == len(expected) or (len(expected) > 1 and len(overlap) >= 2):
                status = "✅ Correct"
                summary_stats["Correct"] += 1
            elif len(overlap) > 0:
                status = "⚠️ Partial"
                summary_stats["Partial"] += 1
            else:
                status = "❌ Decoy/Miss"
                summary_stats["Wrong"] += 1

            print(f"{q['id']:<4} | {q['tag']:<20} | {status:<10} | {q['question']}")
            print(f"     Expected: {q['expected_sources']}")
            print(f"     Retrieved (Cross-Encoder Top-3): {ce_sources[:3]}")
            print(f"     Endpoints: {ce_endpoints[:3]}")
            print("-" * 80)

            results.append({
                "id": q["id"],
                "group": q["group"],
                "tag": q["tag"],
                "question": q["question"],
                "expected_sources": q["expected_sources"],
                "status": status,
                "bm25_top3": bm25_sources[:3],
                "dense_top3": dense_sources[:3],
                "cross_encoder_top3": [
                    {"source": c.get("source"), "endpoint": c.get("endpoint"), "score": round(c.get("score", 0), 4)}
                    for c in ce_items[:3]
                ]
            })
        except Exception as e:
            print(f"{q['id']:<4} | {q['tag']:<20} | ERROR      | {e}")

    print("\n" + "=" * 40)
    print("EVALUATION SUMMARY")
    print("=" * 40)
    print(f"Total Questions Evaluated: {summary_stats['Total']}")
    print(f"✅ Correct Source Hits:     {summary_stats['Correct']}")
    print(f"⚠️ Partial Multi-doc Hits: {summary_stats['Partial']}")
    print(f"❌ Decoys / Misaligned:    {summary_stats['Wrong']}")
    print("=" * 40)

    # Save evaluation output
    with open("test/evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump({"summary": summary_stats, "results": results}, f, indent=2)
    print("\nFull evaluation report saved to test/evaluation_results.json")

if __name__ == "__main__":
    evaluate()
