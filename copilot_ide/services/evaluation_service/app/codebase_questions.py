"""Codebase-Aware Question Bank for SCIP Ablation Evaluation (10 Questions).

Evaluates retrieval precision, token consumption, latency, and correctness
comparing baseline (specs only) vs treatment (with SCIP code intelligence).
"""

from typing import TypedDict, List

class CodebaseQuestionItem(TypedDict):
    id: str
    category: str
    tag: str
    question: str
    expected_sources: List[str]
    expected_keywords: List[str]
    is_flow_question: bool
    is_decoy: bool

CODEBASE_QUESTION_BANK: List[CodebaseQuestionItem] = [
    # ── Category A: Architecture & Execution Flow ───────────────────────
    {
        "id": "CQ1",
        "category": "Architecture & Flow",
        "tag": "[FLOW][CERTIFICATES]",
        "question": "How do the students receive their certificates?",
        "expected_sources": [
            "backend/src/services/email/email.service.js",
            "backend/src/services/email/templates/certificate.template.js",
            "backend/src/modules/feedback/certificateRecipients.js"
        ],
        "expected_keywords": ["email", "certificate", "designation", "name", "recipient"],
        "is_flow_question": True,
        "is_decoy": False,
    },
    {
        "id": "CQ2",
        "category": "Architecture & Flow",
        "tag": "[FLOW][FEEDBACK]",
        "question": "What is the complete flow when a user submits feedback on the website?",
        "expected_sources": [
            "backend/src/modules/feedback/feedback.service.js",
            "src/lib/api.js"
        ],
        "expected_keywords": ["feedback", "processFeedback", "rating", "phone", "submitFeedback"],
        "is_flow_question": True,
        "is_decoy": False,
    },
    {
        "id": "CQ3",
        "category": "Architecture & Flow",
        "tag": "[FLOW][PAYMENT]",
        "question": "How does payment verification work after a ticket checkout?",
        "expected_sources": [
            "src/lib/api.js"
        ],
        "expected_keywords": ["verifyPayment", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature"],
        "is_flow_question": True,
        "is_decoy": False,
    },
    {
        "id": "CQ4",
        "category": "Architecture & Flow",
        "tag": "[FLOW][ATTENDANCE]",
        "question": "What happens when an admin marks attendance using a QR code?",
        "expected_sources": [
            "src/lib/api.js"
        ],
        "expected_keywords": ["markAttendance", "qr_data", "attendance", "token"],
        "is_flow_question": True,
        "is_decoy": False,
    },

    # ── Category B: Code Symbol Lookup ─────────────────────────────────
    {
        "id": "CQ5",
        "category": "Code Symbol Lookup",
        "tag": "[SYMBOL][TEMPLATE]",
        "question": "What parameters does the generateCertificateEmail function accept and what does it return?",
        "expected_sources": [
            "backend/src/services/email/templates/certificate.template.js"
        ],
        "expected_keywords": ["name", "designation", "generateCertificateEmail", "formatContributionLine", "html"],
        "is_flow_question": False,
        "is_decoy": False,
    },
    {
        "id": "CQ6",
        "category": "Code Symbol Lookup",
        "tag": "[SYMBOL][EMAIL_SERVICE]",
        "question": "What methods and configuration does the EmailService class implement?",
        "expected_sources": [
            "backend/src/services/email/email.service.js"
        ],
        "expected_keywords": ["EmailService", "sendEmail", "from", "to", "subject"],
        "is_flow_question": False,
        "is_decoy": False,
    },
    {
        "id": "CQ7",
        "category": "Code Symbol Lookup",
        "tag": "[SYMBOL][ADMIN_OPS]",
        "question": "What API endpoints and functions are available for administrator operations?",
        "expected_sources": [
            "src/lib/api.js"
        ],
        "expected_keywords": ["loginAdmin", "getAdminStats", "getAdminFeedback", "downloadExcel"],
        "is_flow_question": False,
        "is_decoy": False,
    },

    # ── Category C: Cross-File Dependency ──────────────────────────────
    {
        "id": "CQ8",
        "category": "Cross-File Dependency",
        "tag": "[CROSS][RECIPIENTS]",
        "question": "How is certificate recipient information normalized and matched?",
        "expected_sources": [
            "backend/src/modules/feedback/certificateRecipients.js"
        ],
        "expected_keywords": ["normalizeEmail", "findCertificateRecipient", "email", "name", "recipient"],
        "is_flow_question": False,
        "is_decoy": False,
    },
    {
        "id": "CQ9",
        "category": "Cross-File Dependency",
        "tag": "[CROSS][CONTACT]",
        "question": "How are contact form submissions handled and sent via the client API?",
        "expected_sources": [
            "src/lib/api.js"
        ],
        "expected_keywords": ["sendContactMessage", "/api/contact", "firstName", "lastName", "email", "message"],
        "is_flow_question": False,
        "is_decoy": False,
    },

    # ── Category D: Hard Negative / Decoy Defense ───────────────────────
    {
        "id": "CQ10",
        "category": "Hard Negative",
        "tag": "[DECOY][BILLING]",
        "question": "What billing invoice reconciliation system or accounting ledger does TedxBMU use?",
        "expected_sources": [],
        "expected_keywords": ["not found", "no billing", "none", "not implemented", "does not exist"],
        "is_flow_question": False,
        "is_decoy": True,
    }
]
