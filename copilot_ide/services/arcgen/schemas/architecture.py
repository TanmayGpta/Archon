"""Architecture graph representation schemas.

Defines the structured, parseable graph format for nodes (components),
edges (relations/data flows), and citation tracking.
"""

from enum import Enum
from typing import List, Optional, Dict, Set
from pydantic import BaseModel, Field, model_validator


class NodeType(str, Enum):
    SERVICE = "service"
    MODULE = "module"
    DATASTORE = "datastore"
    GATEWAY = "gateway"
    EXTERNAL = "external"
    QUEUE = "queue"
    CACHE = "cache"


class EdgeType(str, Enum):
    SYNC_REST = "sync_rest"
    SYNC_GRPC = "sync_grpc"
    ASYNC_PUBSUB = "async_pubsub"
    DB_READ = "db_read"
    DB_WRITE = "db_write"
    CACHE_LOOKUP = "cache_lookup"
    DIRECT_CALL = "direct_call"


class ArchNode(BaseModel):
    """An architectural component (service, module, store, gateway)."""
    node_id: str = Field(..., description="Unique node identifier, e.g., 'COMP-001'")
    name: str = Field(..., description="Human-readable component name, e.g., 'OrderService'")
    node_type: NodeType = Field(..., description="Component classification")
    layer: Optional[str] = Field(None, description="Architectural tier (e.g., Presentation, Application, Domain, Infrastructure)")
    description: str = Field(..., description="Summary of component's purpose and boundary")
    responsibilities: List[str] = Field(default_factory=list, description="Explicit functional responsibilities")
    traced_requirements: List[str] = Field(
        default_factory=list, 
        description="Requirement IDs (e.g. ['FR-001', 'ASR-003']) this component satisfies"
    )
    kb_citations: List[str] = Field(
        default_factory=list,
        description="Pattern/tactic IDs from the knowledge base (e.g. ['PAT-MICROSERVICES'])"
    )


class ArchEdge(BaseModel):
    """A directed dependency, invocation, or data flow between components."""
    edge_id: str = Field(..., description="Unique edge identifier, e.g., 'EDGE-001'")
    source: str = Field(..., description="Source node_id initiating call or publishing data")
    target: str = Field(..., description="Target node_id receiving call or consuming data")
    edge_type: EdgeType = Field(..., description="Interaction pattern")
    protocol: Optional[str] = Field(None, description="Communication protocol (e.g. 'REST/JSON', 'gRPC', 'Kafka topic')")
    payload_description: Optional[str] = Field(None, description="Data schema or message payload passing over this edge")
    traced_requirements: List[str] = Field(
        default_factory=list,
        description="Requirement IDs justifying why this communication exists"
    )
    kb_citations: List[str] = Field(
        default_factory=list,
        description="Knowledge base pattern/tactic citation justifying this interaction"
    )
    justification: str = Field(
        ...,
        description="Explicit architectural rationale for why this coupling is necessary"
    )


class ArchitectureGraph(BaseModel):
    """A complete, formal directed graph representing the generated architecture."""
    project_name: str
    style: str = Field(..., description="Primary architectural style (e.g., 'Modular Monolith', 'Microservices')")
    nodes: List[ArchNode] = Field(default_factory=list)
    edges: List[ArchEdge] = Field(default_factory=list)
    plantuml: Optional[str] = Field(None, description="Rendered PlantUML component diagram")

    @model_validator(mode="after")
    def validate_edge_endpoints(self):
        """Ensure all edges connect valid node_ids."""
        node_ids = {n.node_id for n in self.nodes}
        for edge in self.edges:
            if edge.source not in node_ids:
                raise ValueError(f"Edge {edge.edge_id} has invalid source '{edge.source}'. Known nodes: {node_ids}")
            if edge.target not in node_ids:
                raise ValueError(f"Edge {edge.edge_id} has invalid target '{edge.target}'. Known nodes: {node_ids}")
        return self

    @property
    def node_map(self) -> Dict[str, ArchNode]:
        return {n.node_id: n for n in self.nodes}

    @property
    def orphan_nodes(self) -> List[str]:
        """Nodes that have zero incoming and zero outgoing edges."""
        connected: Set[str] = set()
        for e in self.edges:
            connected.add(e.source)
            connected.add(e.target)
        return [n.node_id for n in self.nodes if n.node_id not in connected]

    @property
    def orphan_ratio(self) -> float:
        """Ratio of orphan nodes to total nodes."""
        if not self.nodes:
            return 0.0
        return len(self.orphan_nodes) / len(self.nodes)

    def to_plantuml(self) -> str:
        """Generate universal PlantUML component diagram (compatible with all versions/online tools)."""
        lines = ["@startuml", "skinparam componentStyle uml2", ""]
        lines.append(f"title Architecture: {self.project_name} ({self.style})\n")

        # Group by layer if present
        layers: Dict[str, List[ArchNode]] = {}
        no_layer: List[ArchNode] = []
        for n in self.nodes:
            if n.layer:
                layers.setdefault(n.layer, []).append(n)
            else:
                no_layer.append(n)

        for layer_name, layer_nodes in layers.items():
            lines.append(f'package "{layer_name}" {{')
            for node in layer_nodes:
                type_tag = f"<<{node.node_type.value}>>"
                lines.append(f'  [{node.name}] as {node.node_id} {type_tag}')
            lines.append("}")
            lines.append("")

        for node in no_layer:
            type_tag = f"<<{node.node_type.value}>>"
            lines.append(f'[{node.name}] as {node.node_id} {type_tag}')

        lines.append("")
        for e in self.edges:
            arrow = "-->"
            if e.edge_type in (EdgeType.ASYNC_PUBSUB,):
                arrow = "..>"
            label = f": {e.protocol or e.edge_type.value}"
            lines.append(f"{e.source} {arrow} {e.target} {label}")

        lines.append("")
        lines.append("@enduml")
        return "\n".join(lines)

    def to_mermaid(self) -> str:
        """Generate native Mermaid.js flowchart representation (for GitHub, VS Code, mermaid.live)."""
        lines = ["flowchart TD"]

        layers: Dict[str, List[ArchNode]] = {}
        no_layer: List[ArchNode] = []
        for n in self.nodes:
            if n.layer:
                layers.setdefault(n.layer, []).append(n)
            else:
                no_layer.append(n)

        for layer_name, layer_nodes in layers.items():
            safe_id = layer_name.replace(" ", "_")
            lines.append(f'    subgraph {safe_id}["{layer_name}"]')
            for node in layer_nodes:
                clean_name = node.name.replace('"', '')
                if node.node_type == NodeType.DATASTORE:
                    lines.append(f'        {node.node_id}[(" {clean_name} ")]')
                elif node.node_type in (NodeType.QUEUE, NodeType.CACHE):
                    lines.append(f'        {node.node_id}{{" {clean_name} "}}')
                else:
                    lines.append(f'        {node.node_id}[" {clean_name} "]')
            lines.append("    end")
            lines.append("")

        for node in no_layer:
            clean_name = node.name.replace('"', '')
            lines.append(f'    {node.node_id}[" {clean_name} "]')

        lines.append("")
        for e in self.edges:
            arrow = "-->"
            if e.edge_type in (EdgeType.ASYNC_PUBSUB,):
                arrow = "-.->"
            label = f'|"{e.protocol or e.edge_type.value}"|' if (e.protocol or e.edge_type.value) else ""
            lines.append(f"    {e.source} {arrow}{label} {e.target}")

        return "\n".join(lines)

