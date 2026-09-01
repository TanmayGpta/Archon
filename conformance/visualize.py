import os
import json
import networkx as nx
from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph

def generate_interactive_html(G: nx.DiGraph, output_file: str = "dependency_graph.html"):
    """
    Takes a NetworkX graph and generates a standalone interactive HTML file
    using vis-network. Nodes are color-coded by type:
      - Blue:   Internal project modules
      - Gray:   Python standard library modules
      - Orange: Third-party external packages
    """
    nodes = []
    edges = []

    # Color palette per node type
    TYPE_STYLE = {
        "internal": {"color": "#3498db", "size": 18, "font": "#ffffff"},
        "stdlib":   {"color": "#7f8c8d", "size": 12, "font": "#cccccc"},
        "external": {"color": "#e67e22", "size": 14, "font": "#ffffff"},
    }

    for node, data in G.nodes(data=True):
        node_type = data.get("node_type", "external")
        style = TYPE_STYLE.get(node_type, TYPE_STYLE["external"])
        label = node.split(".")[-1]  # Show only the last part of the path
        nodes.append({
            "id": node,
            "label": label,
            "title": f"{node} [{node_type}]",  # Tooltip on hover
            "color": {"background": style["color"], "border": style["color"]},
            "size": style["size"],
            "font": {"color": style["font"]}
        })

    for source, target in G.edges():
        # Style edges differently based on what they point to
        target_type = G.nodes[target].get("node_type", "external")
        edge_color = "#555555" if target_type == "internal" else "#333333"
        edges.append({
            "from": source,
            "to": target,
            "arrows": "to",
            "color": {"color": edge_color, "opacity": 0.6}
        })

    nodes_json = json.dumps(nodes)
    edges_json = json.dumps(edges)

    # Count per type for the legend
    internal_count = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "internal")
    stdlib_count   = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "stdlib")
    external_count = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "external")

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Archon - Architecture Dependency Graph</title>
        <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <style type="text/css">
            body {{
                margin: 0; padding: 0;
                background-color: #1e1e1e;
                color: white;
                font-family: 'Segoe UI', sans-serif;
            }}
            #mynetwork {{
                width: 100vw;
                height: 100vh;
            }}
            #legend {{
                position: absolute;
                top: 15px; left: 15px;
                background: rgba(0,0,0,0.75);
                padding: 14px 18px;
                border-radius: 10px;
                border: 1px solid #444;
                z-index: 10;
                min-width: 220px;
            }}
            #legend h3 {{ margin: 0 0 10px 0; font-size: 16px; }}
            .legend-item {{ display: flex; align-items: center; margin: 6px 0; font-size: 13px; }}
            .legend-dot {{ width: 14px; height: 14px; border-radius: 50%; margin-right: 10px; flex-shrink: 0; }}
        </style>
    </head>
    <body>
        <div id="legend">
            <h3>Archon Reality Graph</h3>
            <div class="legend-item">
                <div class="legend-dot" style="background:#3498db;"></div>
                Internal Modules ({internal_count})
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background:#e67e22;"></div>
                External Packages ({external_count})
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background:#7f8c8d;"></div>
                Standard Library ({stdlib_count})
            </div>
            <hr style="border-color:#444; margin: 10px 0;">
            <small>Total Edges: {G.number_of_edges()}</small>
        </div>
        <div id="mynetwork"></div>

        <script type="text/javascript">
            var nodes = new vis.DataSet({nodes_json});
            var edges = new vis.DataSet({edges_json});

            var container = document.getElementById('mynetwork');
            var data = {{ nodes: nodes, edges: edges }};

            var options = {{
                nodes: {{
                    shape: 'dot',
                    borderWidth: 2,
                    shadow: true
                }},
                edges: {{
                    smooth: {{ type: 'continuous' }},
                    width: 1.5
                }},
                physics: {{
                    forceAtlas2Based: {{
                        gravitationalConstant: -50,
                        centralGravity: 0.005,
                        springLength: 230,
                        springConstant: 0.18,
                    }},
                    maxVelocity: 146,
                    solver: 'forceAtlas2Based',
                    timestep: 0.35,
                    stabilization: {{ iterations: 150 }}
                }},
                interaction: {{
                    hover: true,
                    tooltipDelay: 150,
                    navigationButtons: true,
                    keyboard: true
                }}
            }};

            var network = new vis.Network(container, data, options);
        </script>
    </body>
    </html>
    """

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"[OK] Interactive graph generated: {os.path.abspath(output_file)}")
