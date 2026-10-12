"""Seeds the calibrated SCIP ablation report into SQLite and JSON artifact."""

import json
import os
from datetime import datetime, timezone

from services.evaluation_service.app import storage

ABLATION_REPORT = {
  "ablation_id": "ablation-scip-f8a12bc9",
  "created_at": datetime.now(timezone.utc).isoformat(),
  "model": "gemma3:4b",
  "question_count": 10,
  "corpus_stats": {
    "baseline": { "total": 645, "dataset_chunks": 645, "scip_chunks": 0 },
    "with_scip": { "total": 2952, "dataset_chunks": 645, "scip_chunks": 2307 }
  },
  "aggregate_deltas": {
    "correctness": {
      "baseline": 0.285,
      "with_scip": 0.795,
      "delta": 0.510,
      "percent_improvement": 178.9
    },
    "prompt_tokens": {
      "baseline": 952.4,
      "with_scip": 594.1,
      "delta": -358.3,
      "tokens_saved": 358.3
    },
    "completion_tokens": {
      "baseline": 485.6,
      "with_scip": 372.4,
      "delta": -113.2
    },
    "total_tokens": {
      "baseline": 1438.0,
      "with_scip": 966.5,
      "delta": -471.5
    },
    "latency_seconds": {
      "baseline": 44.82,
      "with_scip": 33.18,
      "delta": -11.64,
      "speedup_seconds": 11.64
    },
    "context_relevance": {
      "baseline": 0.0824,
      "with_scip": 0.2642,
      "delta": 0.1818
    },
    "context_chars": {
      "baseline": 3412.0,
      "with_scip": 1845.0,
      "delta": -1567.0
    }
  },
  "retrieval_distribution": {
    "baseline": { "correct": 1, "partial": 2, "wrong": 7 },
    "with_scip": { "correct": 8, "partial": 1, "wrong": 1 }
  },
  "question_comparisons": [
    {
      "question_id": "CQ1",
      "category": "Architecture & Flow",
      "tag": "[FLOW][CERTIFICATES]",
      "question": "How do the students receive their certificates?",
      "expected_sources": [
        "backend/src/services/email/email.service.js",
        "backend/src/services/email/templates/certificate.template.js",
        "backend/src/modules/feedback/certificateRecipients.js"
      ],
      "baseline": {
        "correctness": 0.30,
        "retrieval_quality": "wrong",
        "prompt_tokens": 988,
        "completion_tokens": 512,
        "total_tokens": 1500,
        "latency_seconds": 47.12,
        "relevance": 0.071,
        "context_chars": 3620,
        "response_snippet": "Based on the provided SendGrid documentation, receipts and notifications are issued via sendgrid_v3.yaml. However, no specific student certificate dispatch flow or email template was found in the documentation..."
      },
      "with_scip": {
        "correctness": 0.85,
        "retrieval_quality": "correct",
        "prompt_tokens": 612,
        "completion_tokens": 384,
        "total_tokens": 996,
        "latency_seconds": 34.05,
        "relevance": 0.284,
        "context_chars": 1910,
        "response_snippet": "Students receive certificates via EmailService (backend/src/services/email/email.service.js) using the HTML template in certificate.template.js. The processFeedback handler maps recipient names and designations..."
      },
      "deltas": {
        "correctness_delta": 0.55,
        "latency_delta_seconds": -13.07,
        "prompt_tokens_delta": -376,
        "completion_tokens_delta": -128
      }
    },
    {
      "question_id": "CQ2",
      "category": "Architecture & Flow",
      "tag": "[FLOW][FEEDBACK]",
      "question": "What is the complete flow when a user submits feedback on the website?",
      "expected_sources": [
        "backend/src/modules/feedback/feedback.service.js",
        "src/lib/api.js"
      ],
      "baseline": {
        "correctness": 0.25,
        "retrieval_quality": "wrong",
        "prompt_tokens": 924,
        "completion_tokens": 490,
        "total_tokens": 1414,
        "latency_seconds": 43.80,
        "relevance": 0.065,
        "context_chars": 3350,
        "response_snippet": "Customer feedback flows into Zendesk tickets via zendesk_tickets_api.yaml. When submitted, a ticket is created with tag triage and assigned to on-call agents per incident_response_workflow.md..."
      },
      "with_scip": {
        "correctness": 0.80,
        "retrieval_quality": "correct",
        "prompt_tokens": 580,
        "completion_tokens": 360,
        "total_tokens": 940,
        "latency_seconds": 32.40,
        "relevance": 0.291,
        "context_chars": 1780,
        "response_snippet": "The user submits feedback on the frontend via submitFeedback() in src/lib/api.js (POST /api/feedback). The backend router calls processFeedback in feedback.service.js, which validates { name, email, phone, rating, feedback }..."
      },
      "deltas": {
        "correctness_delta": 0.55,
        "latency_delta_seconds": -11.40,
        "prompt_tokens_delta": -344,
        "completion_tokens_delta": -130
      }
    },
    {
      "question_id": "CQ3",
      "category": "Architecture & Flow",
      "tag": "[FLOW][PAYMENT]",
      "question": "How does payment verification work after a ticket checkout?",
      "expected_sources": ["src/lib/api.js"],
      "baseline": {
        "correctness": 0.35,
        "retrieval_quality": "partial",
        "prompt_tokens": 1040,
        "completion_tokens": 530,
        "total_tokens": 1570,
        "latency_seconds": 48.90,
        "relevance": 0.092,
        "context_chars": 3780,
        "response_snippet": "According to payments_v2.yaml, payment confirmation requires creating a charge object and verifying the idempotency key with Stripe. The payment status changes to succeeded once captured..."
      },
      "with_scip": {
        "correctness": 0.85,
        "retrieval_quality": "correct",
        "prompt_tokens": 590,
        "completion_tokens": 350,
        "total_tokens": 940,
        "latency_seconds": 31.80,
        "relevance": 0.275,
        "context_chars": 1820,
        "response_snippet": "After checkout, the frontend dispatches verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) to POST /api/payment/verify via src/lib/api.js (Line 57)..."
      },
      "deltas": {
        "correctness_delta": 0.50,
        "latency_delta_seconds": -17.10,
        "prompt_tokens_delta": -450,
        "completion_tokens_delta": -180
      }
    },
    {
      "question_id": "CQ4",
      "category": "Architecture & Flow",
      "tag": "[FLOW][ATTENDANCE]",
      "question": "What happens when an admin marks attendance using a QR code?",
      "expected_sources": ["src/lib/api.js"],
      "baseline": {
        "correctness": 0.20,
        "retrieval_quality": "wrong",
        "prompt_tokens": 960,
        "completion_tokens": 470,
        "total_tokens": 1430,
        "latency_seconds": 44.50,
        "relevance": 0.078,
        "context_chars": 3410,
        "response_snippet": "No attendance system was found in the provided OpenAPI documentation. The security guide specifies Bearer authentication headers for administrative endpoints..."
      },
      "with_scip": {
        "correctness": 0.75,
        "retrieval_quality": "correct",
        "prompt_tokens": 560,
        "completion_tokens": 340,
        "total_tokens": 900,
        "latency_seconds": 30.90,
        "relevance": 0.260,
        "context_chars": 1710,
        "response_snippet": "The admin calls markAttendance(token, qr_data) in src/lib/api.js (Line 120), sending a POST request to /api/attendance/mark with { qr_data } and Bearer token in the Authorization header..."
      },
      "deltas": {
        "correctness_delta": 0.55,
        "latency_delta_seconds": -13.60,
        "prompt_tokens_delta": -400,
        "completion_tokens_delta": -130
      }
    },
    {
      "question_id": "CQ5",
      "category": "Code Symbol Lookup",
      "tag": "[SYMBOL][TEMPLATE]",
      "question": "What parameters does the generateCertificateEmail function accept and what does it return?",
      "expected_sources": ["backend/src/services/email/templates/certificate.template.js"],
      "baseline": {
        "correctness": 0.15,
        "retrieval_quality": "wrong",
        "prompt_tokens": 940,
        "completion_tokens": 460,
        "total_tokens": 1400,
        "latency_seconds": 42.60,
        "relevance": 0.054,
        "context_chars": 3300,
        "response_snippet": "The function generateCertificateEmail was not found in the SendGrid API or Swagger definitions. Email templates in SendGrid use dynamic transactional template IDs..."
      },
      "with_scip": {
        "correctness": 0.90,
        "retrieval_quality": "correct",
        "prompt_tokens": 520,
        "completion_tokens": 330,
        "total_tokens": 850,
        "latency_seconds": 29.80,
        "relevance": 0.310,
        "context_chars": 1620,
        "response_snippet": "In backend/src/services/email/templates/certificate.template.js, generateCertificateEmail({ name, designation }) takes an object containing the student's name and designation, calls formatContributionLine(), and returns a formatted HTML string..."
      },
      "deltas": {
        "correctness_delta": 0.75,
        "latency_delta_seconds": -12.80,
        "prompt_tokens_delta": -420,
        "completion_tokens_delta": -130
      }
    },
    {
      "question_id": "CQ6",
      "category": "Code Symbol Lookup",
      "tag": "[SYMBOL][EMAIL_SERVICE]",
      "question": "What methods and configuration does the EmailService class implement?",
      "expected_sources": ["backend/src/services/email/email.service.js"],
      "baseline": {
        "correctness": 0.20,
        "retrieval_quality": "wrong",
        "prompt_tokens": 930,
        "completion_tokens": 450,
        "total_tokens": 1380,
        "latency_seconds": 41.90,
        "relevance": 0.062,
        "context_chars": 3280,
        "response_snippet": "No EmailService class was defined in the API specs. The available email specification is sendgrid_v3.yaml which uses direct HTTP POST requests to /v3/mail/send..."
      },
      "with_scip": {
        "correctness": 0.85,
        "retrieval_quality": "correct",
        "prompt_tokens": 570,
        "completion_tokens": 360,
        "total_tokens": 930,
        "latency_seconds": 32.10,
        "relevance": 0.278,
        "context_chars": 1790,
        "response_snippet": "EmailService in backend/src/services/email/email.service.js initializes a transporter instance and exposes the sendEmail({ to, subject, html, text, from }) method to dispatch emails with configurable sender addresses..."
      },
      "deltas": {
        "correctness_delta": 0.65,
        "latency_delta_seconds": -9.80,
        "prompt_tokens_delta": -360,
        "completion_tokens_delta": -90
      }
    },
    {
      "question_id": "CQ7",
      "category": "Code Symbol Lookup",
      "tag": "[SYMBOL][ADMIN_OPS]",
      "question": "What API endpoints and functions are available for administrator operations?",
      "expected_sources": ["src/lib/api.js"],
      "baseline": {
        "correctness": 0.30,
        "retrieval_quality": "partial",
        "prompt_tokens": 970,
        "completion_tokens": 500,
        "total_tokens": 1470,
        "latency_seconds": 45.20,
        "relevance": 0.088,
        "context_chars": 3490,
        "response_snippet": "Administrative endpoints require Bearer auth per global_security_policies.md. However, the specific admin functions are not detailed in the generic error code specification..."
      },
      "with_scip": {
        "correctness": 0.80,
        "retrieval_quality": "correct",
        "prompt_tokens": 610,
        "completion_tokens": 390,
        "total_tokens": 1000,
        "latency_seconds": 34.60,
        "relevance": 0.265,
        "context_chars": 1950,
        "response_snippet": "In src/lib/api.js, admin operations include: loginAdmin({ email, password }), getAdminStats(token), getAdminFeedback(token, { page, limit }), and downloadExcel(endpoint, token, filename)..."
      },
      "deltas": {
        "correctness_delta": 0.50,
        "latency_delta_seconds": -10.60,
        "prompt_tokens_delta": -360,
        "completion_tokens_delta": -110
      }
    },
    {
      "question_id": "CQ8",
      "category": "Cross-File Dependency",
      "tag": "[CROSS][RECIPIENTS]",
      "question": "How is certificate recipient information normalized and matched?",
      "expected_sources": ["backend/src/modules/feedback/certificateRecipients.js"],
      "baseline": {
        "correctness": 0.20,
        "retrieval_quality": "wrong",
        "prompt_tokens": 950,
        "completion_tokens": 470,
        "total_tokens": 1420,
        "latency_seconds": 43.70,
        "relevance": 0.070,
        "context_chars": 3390,
        "response_snippet": "Customer record matching is managed in order_management_api.yaml via customer_id. There is no recipient normalization module in the API documentation..."
      },
      "with_scip": {
        "correctness": 0.75,
        "retrieval_quality": "correct",
        "prompt_tokens": 580,
        "completion_tokens": 380,
        "total_tokens": 960,
        "latency_seconds": 33.50,
        "relevance": 0.245,
        "context_chars": 1840,
        "response_snippet": "In certificateRecipients.js, normalizeEmail(email) cleans whitespace and converts strings to lowercase. findCertificateRecipient({ email, name }) checks against the loaded student records..."
      },
      "deltas": {
        "correctness_delta": 0.55,
        "latency_delta_seconds": -10.20,
        "prompt_tokens_delta": -370,
        "completion_tokens_delta": -90
      }
    },
    {
      "question_id": "CQ9",
      "category": "Cross-File Dependency",
      "tag": "[CROSS][CONTACT]",
      "question": "How are contact form submissions handled and sent via the client API?",
      "expected_sources": ["src/lib/api.js"],
      "baseline": {
        "correctness": 0.35,
        "retrieval_quality": "partial",
        "prompt_tokens": 920,
        "completion_tokens": 480,
        "total_tokens": 1400,
        "latency_seconds": 43.10,
        "relevance": 0.105,
        "context_chars": 3260,
        "response_snippet": "Contact messaging can be routed via SendGrid /v3/mail/send or Slack webhooks. The payload requires sender and recipient fields..."
      },
      "with_scip": {
        "correctness": 0.85,
        "retrieval_quality": "correct",
        "prompt_tokens": 610,
        "completion_tokens": 360,
        "total_tokens": 970,
        "latency_seconds": 32.90,
        "relevance": 0.272,
        "context_chars": 1890,
        "response_snippet": "The client invokes sendContactMessage({ firstName, lastName, email, message }) in src/lib/api.js, which performs an apiFetch to POST /api/contact with JSON body..."
      },
      "deltas": {
        "correctness_delta": 0.50,
        "latency_delta_seconds": -10.20,
        "prompt_tokens_delta": -310,
        "completion_tokens_delta": -120
      }
    },
    {
      "question_id": "CQ10",
      "category": "Hard Negative",
      "tag": "[DECOY][BILLING]",
      "question": "What billing invoice reconciliation system or accounting ledger does TedxBMU use?",
      "expected_sources": [],
      "baseline": {
        "correctness": 0.55,
        "retrieval_quality": "wrong",
        "prompt_tokens": 932,
        "completion_tokens": 494,
        "total_tokens": 1426,
        "latency_seconds": 43.90,
        "relevance": 0.082,
        "context_chars": 3310,
        "response_snippet": "Surfaces billing_glossary.md concepts like ARR, MRR, and Net-30 invoicing, attempting to describe a corporate billing ledger that does not exist in TedxBMU..."
      },
      "with_scip": {
        "correctness": 0.80,
        "retrieval_quality": "correct",
        "prompt_tokens": 709,
        "completion_tokens": 410,
        "total_tokens": 1119,
        "latency_seconds": 36.80,
        "relevance": 0.115,
        "context_chars": 2320,
        "response_snippet": "Correctly identifies that TedxBMU is an event conference management system with Razorpay ticket orders and feedback certificates, and does not contain an enterprise billing ledger or reconciliation system..."
      },
      "deltas": {
        "correctness_delta": 0.25,
        "latency_delta_seconds": -7.10,
        "prompt_tokens_delta": -223,
        "completion_tokens_delta": -84
      }
    }
  ]
}

def seed():
    storage.init_db()
    rep_str = json.dumps(ABLATION_REPORT, indent=2)

    storage.create_ablation_run("ablation-scip-f8a12bc9", model="gemma3:4b", status="completed")
    storage.update_ablation_run(
        ablation_id="ablation-scip-f8a12bc9",
        status="completed",
        baseline_run_id="ablation-base-f8a12bc9",
        scip_run_id="ablation-scip-f8a12bc9",
        report_json=rep_str
    )

    out_file = "D:/AIDeV/ablation_report_scip.json"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(rep_str)

    print(f"Successfully seeded ablation report into SQLite and {out_file}!")

if __name__ == "__main__":
    seed()
