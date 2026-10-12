import os
import sys

# Ensure ingestion service app can be imported
sys.path.insert(0, os.path.abspath('services/ingestion_service/app'))
from chunker import chunk_file_content

dataset_dir = 'dataset'
new_files = [
    'order_management_api.yaml',
    'checkout_architecture_guide.md',
    'alerting_service_api.yaml',
    'incident_response_workflow.md',
    'github_webhooks_api.yaml',
    'ci_cd_deployment_guide.md',
    'zendesk_tickets_api.yaml',
    'customer_support_workflow.md',
    'global_security_policies.md',
    'api_gateway_routing.md',
    'api_error_codes.md',
    'billing_glossary.md'
]

print("=== VALIDATION OF CHUNKER ON DATASET FILES ===\n")
all_passed = True

for fname in sorted(os.listdir(dataset_dir)):
    fpath = os.path.join(dataset_dir, fname)
    if os.path.isdir(fpath):
        continue
    with open(fpath, 'rb') as f:
        content = f.read()
    chunks = chunk_file_content(content, fname)
    is_new = fname in new_files
    prefix = "[NEW]" if is_new else "[EXISTING]"
    print(f"{prefix} {fname:35} | Chunks: {len(chunks)}")

    if is_new and fname.endswith(('.yaml', '.yml')):
        endpoints = [c['endpoint'] for c in chunks]
        if len(chunks) < 4:
            print(f"  [FAIL] Expected at least 4 chunks, got {len(chunks)}")
            all_passed = False
        else:
            print(f"  [PASS] Endpoints ({len(chunks)}): {endpoints}")

    elif is_new and fname.endswith('.md'):
        with open(fpath, 'r', encoding='utf-8') as f:
            text = f.read()
        h2_count = text.count('\n## ')
        if text.startswith('## '):
            h2_count += 1
        headers = [c['endpoint'] for c in chunks]
        if len(chunks) != h2_count:
            print(f"  [FAIL] Section count mismatch: chunks={len(chunks)} vs ## count={h2_count}")
            all_passed = False
        else:
            print(f"  [PASS] All {len(chunks)} sections cleanly chunked:")
            for h in headers:
                print(f"         - {h}")

        if fname == 'billing_glossary.md':
            http_methods = ['GET ', 'POST ', 'PUT ', 'DELETE ', 'PATCH ']
            decoy_fail = False
            for c in chunks:
                for m in http_methods:
                    if m in c['text']:
                        print(f"  [FAIL] Decoy document contains HTTP method: {m}")
                        decoy_fail = True
                        all_passed = False
            if not decoy_fail:
                print("  [PASS] Decoy document contains NO HTTP methods (verified hard-negative).")

print(f"\nOVERALL RESULT: {'ALL PASSED' if all_passed else 'SOME CHECKS FAILED'}")
