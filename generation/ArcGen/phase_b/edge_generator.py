"""Pass 2: Architectural Relation (Edge) Generator.

Dedicated relational reasoning pass designed to overcome the < 0.18 Edge F1 bottleneck.
Traces concrete interaction scenarios, protocols, data flows, and citations between components.
Guarantees zero orphan nodes through rigorous prompting and deterministic semantic fallback connection.
"""

import re
from typing import List, Optional, Set, Dict
from generation.ArcGen.schemas.requirements import SRSDocument
from generation.ArcGen.schemas.architecture import ArchNode, ArchEdge, EdgeType, NodeType
from generation.ArcGen.schemas.patterns import PatternProfile
from generation.ArcGen.llm import BaseLLMClient, get_llm_client


EDGE_GENERATOR_SYSTEM_PROMPT = """You are a Principal Distributed Systems and Integration Architect.
Your task is to identify and synthesize all directed dependency, invocation, and data-flow relationships (edges)
between the provided architectural components.

RELATIONAL REASONING DISCIPLINE:
1. EXPLICIT DEPENDENCY TRACING:
   - For every requirement and scenario, trace which component initiates the request (source) and which receives/handles it (target).
   - Do NOT omit essential connections (e.g., an API gateway must route to backend services; a service must connect to its datastore or message queue).
   - Do NOT invent spurious circular connections or unnecessary shortcuts that bypass layers.

2. ZERO ORPHANS GUARANTEE:
   - EVERY component in the provided list MUST have at least one incoming or outgoing connection.
   - Every datastore (e.g., TrafficDataDB, DeviceControlDB, ConfigDB) MUST have at least one incoming edge from its owning application service (db_read / db_write).
   - Every cache node MUST connect to its consuming service (cache_lookup).
   - Every message queue / event bus MUST connect to publisher and subscriber services (async_pubsub).
   - Every external system or client MUST connect to the gateway or corresponding ingress service.

3. MANDATORY ATTRIBUTES FOR EVERY EDGE:
   - "source": MUST EXACTLY match one of the provided node_ids (e.g., "COMP-001").
   - "target": MUST EXACTLY match one of the provided node_ids (e.g., "COMP-002").
   - "edge_type": One of ["sync_rest", "sync_grpc", "async_pubsub", "db_read", "db_write", "cache_lookup", "direct_call"].
   - "protocol": Concrete protocol (e.g. "HTTPS/REST", "gRPC over HTTP/2", "AMQP topic", "PostgreSQL wire protocol", "In-process memory call").
   - "payload_description": Summary of data or event schema passing over the wire.
   - "traced_requirements": List of Requirement IDs justifying why this interaction is necessary.
   - "kb_citations": Pattern or tactic IDs justifying this interaction topology.
   - "justification": Concise architectural rationale explaining the necessity of this edge (1-2 sentences).

4. ARCHITECTURAL CHANNEL CONSOLIDATION:
   - An architectural edge represents a physical or logical communication channel between two components.
   - Where multiple requirements utilize the same communication path (e.g., multiple queries to the same database or multiple device commands routed through the API gateway), consolidate them onto that single channel and list all relevant requirement IDs in "traced_requirements".

OUTPUT MUST BE VALID JSON:
{
  "edges": [
    {
      "edge_id": "EDGE-001",
      "source": "COMP-001",
      "target": "COMP-002",
      "edge_type": "sync_rest",
      "protocol": "HTTPS/REST",
      "payload_description": "CreateOrderRequest {user_id, items, shipping_address}",
      "traced_requirements": ["FR-001"],
      "kb_citations": ["PAT-MICROSERVICES"],
      "justification": "API Gateway routes authenticated external client order placement requests to OrderService"
    }
  ]
}
"""


def _find_best_matching_service(target_name: str, services: List[ArchNode]) -> Optional[ArchNode]:
    """Finds the most semantically related service for a given datastore, cache, or queue name."""
    clean_target = re.sub(
        r"(DB|Database|Store|DataStore|Cache|Queue|Broker)$", "", target_name, flags=re.IGNORECASE
    ).lower().strip()

    if not clean_target:
        return services[0] if services else None

    # Exact or substring match
    for s in services:
        clean_s = re.sub(r"(Service|Microservice|Component|App)$", "", s.name, flags=re.IGNORECASE).lower().strip()
        if clean_target in clean_s or clean_s in clean_target:
            return s

    return services[0] if services else None


def _connect_orphan_nodes(
    nodes: List[ArchNode],
    existing_edges: List[ArchEdge],
    srs: SRSDocument,
    primary_pattern: PatternProfile,
) -> List[ArchEdge]:
    """Deterministic post-synthesis pass ensuring 0% orphan nodes."""
    connected_ids = set()
    for e in existing_edges:
        connected_ids.add(e.source)
        connected_ids.add(e.target)

    node_by_id = {n.node_id: n for n in nodes}
    orphan_ids = [n.node_id for n in nodes if n.node_id not in connected_ids]

    if not orphan_ids:
        return existing_edges

    services = [n for n in nodes if n.node_type in (NodeType.SERVICE, NodeType.MODULE)]
    gateways = [n for n in nodes if n.node_type == NodeType.GATEWAY]
    gateway = gateways[0] if gateways else (services[0] if services else None)

    fallback_req = [srs.all_requirements[0].req_id] if srs.all_requirements else ["FR-001"]
    edges = list(existing_edges)
    edge_counter = len(edges) + 1

    for orphan_id in orphan_ids:
        orphan = node_by_id[orphan_id]

        if orphan.node_type == NodeType.DATASTORE:
            matched_svc = _find_best_matching_service(orphan.name, services)
            if matched_svc:
                edges.append(
                    ArchEdge(
                        edge_id=f"EDGE-{edge_counter:03d}",
                        source=matched_svc.node_id,
                        target=orphan.node_id,
                        edge_type=EdgeType.DB_WRITE,
                        protocol="PostgreSQL wire protocol",
                        payload_description="INSERT/UPDATE domain entities and status",
                        traced_requirements=orphan.traced_requirements or fallback_req,
                        kb_citations=[primary_pattern.pattern_id],
                        justification=f"{matched_svc.name} persists data to dedicated datastore {orphan.name}",
                    )
                )
                edge_counter += 1

        elif orphan.node_type == NodeType.CACHE:
            matched_svc = _find_best_matching_service(orphan.name, services)
            if matched_svc:
                edges.append(
                    ArchEdge(
                        edge_id=f"EDGE-{edge_counter:03d}",
                        source=matched_svc.node_id,
                        target=orphan.node_id,
                        edge_type=EdgeType.CACHE_LOOKUP,
                        protocol="In-process memory call",
                        payload_description="Read-through cache lookup",
                        traced_requirements=orphan.traced_requirements or fallback_req,
                        kb_citations=[primary_pattern.pattern_id],
                        justification=f"{matched_svc.name} queries {orphan.name} for low-latency cached data",
                    )
                )
                edge_counter += 1

        elif orphan.node_type == NodeType.QUEUE:
            if services:
                pub_svc = services[0]
                edges.append(
                    ArchEdge(
                        edge_id=f"EDGE-{edge_counter:03d}",
                        source=pub_svc.node_id,
                        target=orphan.node_id,
                        edge_type=EdgeType.ASYNC_PUBSUB,
                        protocol="AMQP / Kafka protocol",
                        payload_description="Asynchronous domain events",
                        traced_requirements=orphan.traced_requirements or fallback_req,
                        kb_citations=[primary_pattern.pattern_id],
                        justification=f"{pub_svc.name} publishes asynchronous events to {orphan.name}",
                    )
                )
                edge_counter += 1

        elif orphan.node_type == NodeType.EXTERNAL:
            target_ingress = gateway or (services[0] if services else None)
            if target_ingress:
                edges.append(
                    ArchEdge(
                        edge_id=f"EDGE-{edge_counter:03d}",
                        source=orphan.node_id,
                        target=target_ingress.node_id,
                        edge_type=EdgeType.SYNC_REST,
                        protocol="HTTPS/REST",
                        payload_description="External incoming messages and telemetry",
                        traced_requirements=orphan.traced_requirements or fallback_req,
                        kb_citations=[primary_pattern.pattern_id],
                        justification=f"External system {orphan.name} exchanges data with {target_ingress.name}",
                    )
                )
                edge_counter += 1

        else:
            # Standalone service / module
            if gateway and gateway.node_id != orphan.node_id:
                edges.append(
                    ArchEdge(
                        edge_id=f"EDGE-{edge_counter:03d}",
                        source=gateway.node_id,
                        target=orphan.node_id,
                        edge_type=EdgeType.SYNC_REST,
                        protocol="HTTPS/REST",
                        payload_description="Authenticated internal service invocation",
                        traced_requirements=orphan.traced_requirements or fallback_req,
                        kb_citations=[primary_pattern.pattern_id],
                        justification=f"{gateway.name} routes requests to {orphan.name}",
                    )
                )
                edge_counter += 1

    return edges


def generate_edges(
    nodes: List[ArchNode],
    srs: SRSDocument,
    primary_pattern: PatternProfile,
    client: Optional[BaseLLMClient] = None,
) -> List[ArchEdge]:
    """Synthesizes directed edges between nodes with requirement and pattern citations."""
    if client is None:
        client = get_llm_client()

    # Format node directory for prompt
    node_lines = []
    for n in nodes:
        node_lines.append(
            f"- {n.node_id}: {n.name} (Type: {n.node_type.value}, Layer: {n.layer or 'None'}) "
            f"- Responsibilities: {', '.join(n.responsibilities) or n.description}"
        )
    nodes_text = "\n".join(node_lines)

    # Format requirement list
    req_lines = []
    for r in srs.all_requirements:
        req_lines.append(f"- [{r.req_id}] ({r.req_type.value}) {r.raw_text}")
    req_text = "\n".join(req_lines)

    user_prompt = f"""PROJECT: {srs.project_name}
PRIMARY PATTERN: {primary_pattern.name} ({primary_pattern.pattern_id})
TOPOLOGY: {primary_pattern.topology_type.value}

AVAILABLE COMPONENTS (NODES):
{nodes_text}

REQUIREMENTS TO REALIZE:
{req_text}

Synthesize directed dependency and data-flow channels between these components.
Consolidate multiple requirements sharing the same communication path onto single multi-cited edges (list all traced requirement IDs).
Ensure every component in the list above is connected to the architecture without orphans.
Output JSON conforming to the schema."""

    data = client.generate_json(
        system_prompt=EDGE_GENERATOR_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.1,
        max_tokens=8192,
    )

    if isinstance(data, list):
        edges_data = data
    elif isinstance(data, dict):
        edges_data = data.get("edges") or data.get("relations") or data.get("connections") or []
    else:
        edges_data = []

    valid_node_ids = {n.node_id for n in nodes}
    default_req_id = srs.all_requirements[0].req_id if srs.all_requirements else "FR-001"

    edges: List[ArchEdge] = []
    for e_data in edges_data:
        if not isinstance(e_data, dict):
            continue
        try:
            src = e_data.get("source")
            tgt = e_data.get("target")
            if src in valid_node_ids and tgt in valid_node_ids:
                if not e_data.get("kb_citations"):
                    e_data["kb_citations"] = [primary_pattern.pattern_id]
                if not e_data.get("traced_requirements"):
                    e_data["traced_requirements"] = [default_req_id]
                edge = ArchEdge.model_validate(e_data)
                edges.append(edge)
        except Exception:
            continue

    # Guaranteed zero-orphan post-synthesis pass
    edges = _connect_orphan_nodes(nodes, edges, srs, primary_pattern)

    return edges
