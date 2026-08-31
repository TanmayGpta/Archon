import os
import json

INSTRUCTION = "You are an expert Software Architect. Analyze the following Software Requirements Specification (SRS) and propose an architectural decision."

# Mapping of file paths to the reverse-engineered SRS (Input)
SRS_MAPPING = {
    r"C:\Users\gaura\Archon\generation\cosmos-sdk\docs\architecture\adr-002-docs-structure.md": """Software Requirements Specification: Documentation Restructuring
1. Business Need: The current SDK documentation mixes developer tools, FAQ, and API specs, causing maintenance issues and confusing users.
2. Functional Requirements: Developer framework tools must live in their respective GitHub repositories. High-level material must be migrated to the main website. The core SDK /docs folder must be restructured to clearly separate intro, concepts, clients, and modules.
3. Non-Functional Requirements: The restructure must streamline the Vuepress build process and logically separate technical specs from architectural decisions.""",

    r"C:\Users\gaura\Archon\generation\cosmos-sdk\docs\architecture\adr-004-split-denomination-keys.md": """Software Requirements Specification: Coin Denomination Keys
1. Business Need: The current system does not allow efficient iteration over all keys for a specific coin denomination in the store. 
2. Functional Requirements: The system must allow querying of coin balances by denomination. A secondary index must be created or the primary key structure must be updated to group balances by denomination.
3. Non-Functional Requirements: The database structure must remain highly performant, ensuring O(1) or O(log N) lookups for token balances without requiring full table scans.""",

    r"C:\Users\gaura\Archon\generation\cosmos-sdk\docs\architecture\adr-006-secret-store-replacement.md": """Software Requirements Specification: Key Management Store Replacement
1. Business Need: The existing key management store (Secret Store) is deprecated, unmaintained, or poses security risks. A reliable replacement is required for handling cryptographic keys.
2. Functional Requirements: The system must provide a secure keystore for user private keys, signatures, and transaction signing. It must support standard cryptographic algorithms used by the SDK.
3. Non-Functional Requirements: The keystore must be highly secure, modular, and allow easy integration with hardware wallets in the future.""",

    r"C:\Users\gaura\Archon\generation\cosmos-sdk\docs\architecture\adr-013-metrics.md": """Software Requirements Specification: System Metrics and Observability
1. Business Need: Node operators and validators lack visibility into the performance and health of their SDK applications. 
2. Functional Requirements: The system must export application-level metrics, such as transaction processing times, active validators, and memory usage. 
3. Non-Functional Requirements: The metrics system must be compatible with industry standards like Prometheus. It must have minimal performance overhead on the consensus engine.""",

    r"C:\Users\gaura\Archon\generation\cosmos-sdk\docs\architecture\adr-014-proportional-slashing.md": """Software Requirements Specification: Proportional Slashing
1. Business Need: Malicious actors can currently bypass severe penalties by splitting their stake across multiple smaller validators (Sybil attack). 
2. Functional Requirements: The network must calculate slashing penalties dynamically based on the total percentage of voting power that faults within a specific time frame, rather than a flat rate per validator.
3. Non-Functional Requirements: The calculation must be deterministic and executed on-chain without causing consensus bottlenecks.""",

    r"C:\Users\gaura\Archon\generation\architecture-decision-record\locales\en\examples\kubernetes-container-orchestration\index.md": """Software Requirements Specification: Cloud-Native Container Orchestration
1. Business Need: The organization requires a new deployment system for its cloud-native applications because the legacy platform lacks agility.
2. Functional Requirements: The system must provide container scheduling, self-healing, and integrate with existing CI/CD pipelines and registries.
3. Non-Functional Requirements: Must support rapid scaling. Must utilize a decentralized master-worker topology with no single point of failure. Must have a massive open-source ecosystem.""",

    r"C:\Users\gaura\Archon\generation\architecture-decision-record\locales\en\examples\mysql-database\index.md": """Software Requirements Specification: Primary Database Management System
1. Business Need: Project X requires a database management system to store and manage large volumes of data from multiple sources.
2. Functional Requirements: The DBMS must handle ACID transactions, offer high reliability, and provide standard relational querying capabilities.
3. Non-Functional Requirements: Must be easy to use and maintain, have strong community support, and fit within a low-cost or open-source licensing model while remaining compatible with the existing tech stack.""",

    r"C:\Users\gaura\Archon\generation\architecture-decision-record\locales\en\examples\continuous-integration\index.md": """Software Requirements Specification: CI/CD Pipeline Implementation
1. Business Need: Manual testing and build processes are causing frequent delays, errors, and poor software quality.
2. Functional Requirements: The system must automatically build, test, and deploy code changes to the delivery environment upon code commit. 
3. Non-Functional Requirements: Must seamlessly integrate new features into the codebase without manual intervention, reducing time-to-resolution for errors and improving developer collaboration.""",

    r"C:\Users\gaura\Archon\generation\architecture-decision-record\locales\en\examples\api-using-json-v-grpc\index.md": """Software Requirements Specification: Inter-Service API Protocol
1. Business Need: A new high-throughput service is being developed for multiple clients, and the API protocol must be chosen.
2. Functional Requirements: The API must handle large amounts of data transfer efficiently. It must also support bidirectional streaming for future real-time application features.
3. Non-Functional Requirements: The serialization mechanism must be compact and extremely fast. While JSON over HTTP is simple, the solution must prioritize raw performance and scalability over widespread legacy compatibility.""",

    r"C:\Users\gaura\Archon\generation\architecture-decision-record\locales\en\examples\secrets-storage\index.md": """Software Requirements Specification: Secrets Management System
1. Business Need: The system must securely store, access, and distribute sensitive information such as API keys, passwords, and certificates.
2. Functional Requirements: Must provide programmatic access to secrets for applications, support secret rotation, and offer access control lists.
3. Non-Functional Requirements: The storage must be highly secure, encrypted at rest and in transit, and have an audit trail for compliance purposes."""
}

OUTPUT_FILE = r"C:\Users\gaura\Archon\generation\training_dataset.jsonl"

def main():
    print(f"Generating JSONL dataset at {OUTPUT_FILE}...")
    success = 0
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out_f:
        for filepath, srs_input in SRS_MAPPING.items():
            if not os.path.exists(filepath):
                print(f"Warning: File not found {filepath}")
                continue
                
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as in_f:
                    adr_output = in_f.read().strip()
                
                json_record = {
                    "instruction": INSTRUCTION,
                    "input": srs_input,
                    "output": adr_output
                }
                
                out_f.write(json.dumps(json_record) + "\n")
                success += 1
            except Exception as e:
                print(f"Error processing {filepath}: {e}")
                
    print(f"Done! Successfully generated {success} high-quality training pairs.")

if __name__ == "__main__":
    main()
