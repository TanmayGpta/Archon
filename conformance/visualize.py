import os
import json
import networkx as nx
from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph

def generate_interactive_html(G: nx.DiGraph, output_file: str = "dependency_graph.html", mapping: dict = None):
    """
    Takes a NetworkX graph and generates a standalone interactive HTML file.
    If 'mapping' is provided, internal project files are color-coded by their AI-classified architecture layer!
    """
    nodes = []
    edges = []

    # Pre-defined layer colors for when AI classification is active
    LAYER_COLORS = {
        "Presentation": "#3498db",  # Blue
        "Domain": "#2ecc71",        # Green
        "Application": "#9b59b6",   # Purple
        "Infrastructure": "#e74c3c",# Red
        "unclassified": "#95a5a6",  # Grey
    }

    TYPE_STYLE = {
        "internal": {"size": 20, "font": "#ffffff", "shape": "dot", "borderWidth": 1},
        "stdlib":   {"color": "#7f8c8d", "size": 15, "font": "#aaaaaa", "shape": "hexagon", "borderWidth": 1},
        "external": {"color": "#e67e22", "size": 20, "font": "#dddddd", "shape": "dot", "borderWidth": 1},
    }

    # Track layer counts for the dynamic legend
    layer_counts = {}

    for node, data in G.nodes(data=True):
        node_type = data.get("node_type", "external")
        style = TYPE_STYLE.get(node_type, TYPE_STYLE["external"])
        
        # Determine the color and group based on AI mapping
        if node_type == "internal":
            if mapping and node in mapping:
                layer_name = mapping[node]
                color = LAYER_COLORS.get(layer_name, "#1abc9c") # Default teal
                group_name = f"Layer: {layer_name}"
                layer_counts[layer_name] = layer_counts.get(layer_name, 0) + 1
            else:
                color = "#2980b9" # Default blue before classification
                group_name = "Internal Module"
        else:
            color = style["color"]
            group_name = node_type.capitalize()

        label = node.split(".")[-1]
        
        # Make internal node labels bold and larger
        font_style = {"color": style["font"], "size": 16 if node_type == "internal" else 12}
        if node_type == "internal":
            font_style["face"] = "Arial Black"
            
        nodes.append({
            "id": node,
            "label": label,
            "title": f"<b>{node}</b><br>Group: {group_name}",  # Tooltip on hover
            "color": {"background": color, "border": color},
            "size": style["size"],
            "shape": style["shape"],
            "borderWidth": style["borderWidth"],
            "font": font_style,
            "shadow": True,
            "group": group_name
        })

    for source, target in G.edges():
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

    stdlib_count   = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "stdlib")
    external_count = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "external")

    # Build the dynamic legend HTML
    legend_html = "<h3>Archon Reality Graph</h3>"
    
    if mapping:
        legend_html += "<small style='color: #aaa;'>Architectural Layers (AI Assigned)</small><br><br>"
        for layer, count in layer_counts.items():
            color = LAYER_COLORS.get(layer, "#1abc9c")
            legend_html += f"""
            <div class="legend-item">
                <div class="legend-dot" style="background:{color};"></div>
                {layer} ({count})
            </div>
            """
    else:
        internal_count = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "internal")
        legend_html += f"""
        <div class="legend-item">
            <div class="legend-dot" style="background:#2980b9;"></div>
            Internal Modules ({internal_count})
        </div>
        """
        
    legend_html += f"""
        <hr style="border-color:#444; margin: 10px 0;">
        <div class="legend-item">
            <div class="legend-dot" style="background:#e67e22;"></div>
            External Packages ({external_count})
        </div>
        <div class="legend-item">
            <div class="legend-dot" style="background:#7f8c8d;"></div>
            Standard Library ({stdlib_count})
        </div>
    """

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
            #legend h3 {{ margin: 0 0 5px 0; font-size: 16px; }}
            .legend-item {{ display: flex; align-items: center; margin: 6px 0; font-size: 13px; }}
            .legend-dot {{ width: 14px; height: 14px; border-radius: 50%; margin-right: 10px; flex-shrink: 0; }}
        </style>
    </head>
    <body>
        <div id="legend">
            {legend_html}
        </div>
        <div id="mynetwork"></div>

        <script type="text/javascript">
            var nodes = new vis.DataSet({nodes_json});
            var edges = new vis.DataSet({edges_json});

            var container = document.getElementById('mynetwork');
            var data = {{ nodes: nodes, edges: edges }};

            var options = {{
                nodes: {{
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
