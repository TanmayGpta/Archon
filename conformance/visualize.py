import os
import json
import networkx as nx
from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph

def generate_interactive_html(
    G: nx.DiGraph, 
    output_file: str = "dependency_graph.html", 
    mapping: dict = None,
    violations: list = None
):
    """
    Takes a NetworkX graph and generates a standalone interactive HTML file.
    - If 'mapping' is provided, internal files are colored by architecture layer.
    - If 'violations' is provided, violating edges are rendered as bold red dashed lines!
    """
    nodes = []
    edges = []

    # Pre-defined layer colors (Infrastructure is now Teal, freeing Red for Violations)
    LAYER_COLORS = {
        "Presentation": "#3498db",  # Blue
        "Domain": "#2ecc71",        # Green
        "Application": "#9b59b6",   # Purple
        "Infrastructure": "#1abc9c",# Teal
        "unclassified": "#95a5a6",  # Grey
    }

    TYPE_STYLE = {
        "internal": {"size": 20, "font": "#ffffff", "shape": "dot", "borderWidth": 1},
        "stdlib":   {"color": "#7f8c8d", "size": 15, "font": "#aaaaaa", "shape": "hexagon", "borderWidth": 1},
        "external": {"color": "#e67e22", "size": 20, "font": "#dddddd", "shape": "dot", "borderWidth": 1},
    }

    # Map violations by (source, target) for fast edge lookup
    violation_map = {}
    if violations:
        for v in violations:
            s = getattr(v, "source_module", None) or (v.get("source_module") if isinstance(v, dict) else None)
            t = getattr(v, "target_module", None) or (v.get("target_module") if isinstance(v, dict) else None)
            if s and t:
                violation_map[(s, t)] = v

    # Track layer counts for the dynamic legend
    layer_counts = {}

    for node, data in G.nodes(data=True):
        node_type = data.get("node_type", "external")
        style = TYPE_STYLE.get(node_type, TYPE_STYLE["external"])
        
        # Determine the color and group based on AI mapping
        if node_type == "internal":
            if mapping and node in mapping:
                layer_name = mapping[node]
                color = LAYER_COLORS.get(layer_name, "#16a085")
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
        is_violation = (source, target) in violation_map
        
        if is_violation:
            v = violation_map[(source, target)]
            v_reason = getattr(v, "reason", "Architectural violation")
            v_s_layer = getattr(v, "source_layer", "Source")
            v_t_layer = getattr(v, "target_layer", "Target")
            v_line = getattr(v, "line_number", None)
            v_snippet = getattr(v, "code_snippet", None)
            v_exp = getattr(v, "explanation", None) or v_reason
            v_rem = getattr(v, "remediation", None) or "Decouple modules through an intermediary service."

            edges.append({
                "from": source,
                "to": target,
                "arrows": {"to": {"scaleFactor": 1.2}},
                "color": {"color": "#ff4757", "highlight": "#ff6b81", "opacity": 1.0},
                "width": 3.5,
                "dashes": [6, 6],
                "title": f"⚠️ VIOLATION: {source} ({v_s_layer}) ➔ {target} ({v_t_layer})<br>👉 <b>Click edge to inspect code & fix!</b>",
                "is_violation": True,
                "violation_info": {
                    "source": source,
                    "target": target,
                    "source_layer": v_s_layer,
                    "target_layer": v_t_layer,
                    "line_number": v_line,
                    "code_snippet": v_snippet,
                    "explanation": v_exp,
                    "remediation": v_rem
                }
            })
        else:
            edge_color = "#555555" if target_type == "internal" else "#333333"
            edges.append({
                "from": source,
                "to": target,
                "arrows": "to",
                "color": {"color": edge_color, "opacity": 0.45},
                "width": 1.2
            })

    nodes_json = json.dumps(nodes)
    edges_json = json.dumps(edges)

    stdlib_count   = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "stdlib")
    external_count = sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == "external")

    # Build the dynamic legend HTML
    legend_html = "<h3>Archon Reality Graph</h3>"
    
    if violations:
        legend_html += f"""
        <div class="legend-item" style="color: #ff4757; font-weight: bold; margin-bottom: 8px;">
            <span style="display:inline-block; width:20px; border-top: 3px dashed #ff4757; margin-right: 8px; vertical-align: middle;"></span>
            Violations ({len(violations)})
        </div>
        <hr style="border-color:#444; margin: 8px 0;">
        """

    if mapping:
        legend_html += "<small style='color: #aaa;'>Architectural Layers</small><br><br>"
        for layer, count in layer_counts.items():
            color = LAYER_COLORS.get(layer, "#16a085")
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

            /* Superimposed XAI Modal Popup */
            #violation-modal-backdrop {{
                display: none;
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.72);
                backdrop-filter: blur(4px);
                z-index: 99999;
                align-items: center;
                justify-content: center;
            }}
            #violation-modal-card {{
                background: #181b24;
                color: #f1f2f6;
                width: 90%;
                max-width: 660px;
                border-radius: 12px;
                border: 1px solid #2f3542;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.75);
                padding: 24px 28px;
                position: relative;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: popIn 0.18s ease-out;
            }}
            @keyframes popIn {{
                from {{ opacity: 0; transform: scale(0.96); }}
                to {{ opacity: 1; transform: scale(1); }}
            }}
            .modal-close-btn {{
                position: absolute;
                top: 14px; right: 18px;
                font-size: 20px;
                color: #a4b0be;
                cursor: pointer;
                border: none;
                background: transparent;
                line-height: 1;
                transition: color 0.15s;
            }}
            .modal-close-btn:hover {{
                color: #ff4757;
            }}
            .modal-badge-row {{
                display: flex; gap: 10px; margin: 12px 0; font-size: 13px;
            }}
            .badge-source {{
                background: rgba(52, 152, 219, 0.2); border: 1px solid #3498db; color: #70a1ff; padding: 4px 10px; border-radius: 6px;
            }}
            .badge-target {{
                background: rgba(255, 71, 87, 0.2); border: 1px solid #ff4757; color: #ff6b81; padding: 4px 10px; border-radius: 6px;
            }}
            .code-box {{
                background: #0c0e14; border: 1px solid #222736; border-radius: 8px; padding: 10px 14px; font-family: 'Consolas', monospace; font-size: 13px; color: #e2e8f0; margin: 8px 0 14px 0; overflow-x: auto;
            }}
            .box-hazard {{
                background: rgba(230, 126, 34, 0.12); border-left: 4px solid #e67e22; padding: 10px 14px; border-radius: 4px; font-size: 13.5px; line-height: 1.5; color: #dfe4ea; margin-bottom: 12px;
            }}
            .box-remediation {{
                background: rgba(46, 204, 113, 0.12); border-left: 4px solid #2ecc71; padding: 10px 14px; border-radius: 4px; font-size: 13.5px; line-height: 1.5; color: #dfe4ea;
            }}
        </style>
    </head>
    <body>
        <div id="legend">
            {legend_html}
        </div>
        <div id="mynetwork"></div>

        <!-- Superimposed Modal Dialog on Graph -->
        <div id="violation-modal-backdrop">
            <div id="violation-modal-card">
                <button class="modal-close-btn" onclick="closeViolationModal()">✕</button>
                <div style="font-size: 18px; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                    <span>⚠️</span> Architectural Violation Analysis
                </div>
                <div id="modal-sub" class="modal-badge-row"></div>

                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #a4b0be; font-weight: 600; margin-top: 10px;">📍 Offending Source Code</div>
                <div id="modal-code"></div>

                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #e67e22; font-weight: 600; margin-top: 8px;">🧠 Architectural Hazard (XAI)</div>
                <div id="modal-hazard" class="box-hazard"></div>

                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #2ecc71; font-weight: 600;">💡 Remediation Strategy (How to Fix)</div>
                <div id="modal-remediation" class="box-remediation"></div>
            </div>
        </div>

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

            // Click listener on edges to open the superimposed modal
            network.on("click", function(params) {{
                if (params.edges.length > 0 && params.nodes.length === 0) {{
                    var clickedEdgeId = params.edges[0];
                    var edgeObj = edges.get(clickedEdgeId);
                    if (edgeObj && edgeObj.is_violation && edgeObj.violation_info) {{
                        openViolationModal(edgeObj.violation_info);
                    }}
                }}
            }});

            function openViolationModal(info) {{
                document.getElementById("modal-sub").innerHTML = 
                    '<span class="badge-source">Source: <b>' + escapeHtml(info.source) + '</b> (' + escapeHtml(info.source_layer) + ')</span>' +
                    '<span class="badge-target">Target: <b>' + escapeHtml(info.target) + '</b> (' + escapeHtml(info.target_layer) + ')</span>';

                var codeHtml = '';
                if (info.line_number && info.code_snippet) {{
                    codeHtml = '<div class="code-box">' +
                               '<span style="color:#747d8c; margin-right:12px; font-weight:bold;">Line ' + info.line_number + '</span>' +
                               '<span style="color:#ff6b81;">' + escapeHtml(info.code_snippet) + '</span>' +
                               '</div>';
                }} else {{
                    codeHtml = '<div style="color:#747d8c; font-size:13px; margin:6px 0 12px 0;">Direct module-level dependency detected.</div>';
                }}
                document.getElementById("modal-code").innerHTML = codeHtml;
                document.getElementById("modal-hazard").innerText = info.explanation;
                document.getElementById("modal-remediation").innerText = info.remediation;

                document.getElementById("violation-modal-backdrop").style.display = "flex";
            }}

            function closeViolationModal() {{
                document.getElementById("violation-modal-backdrop").style.display = "none";
            }}

            function escapeHtml(text) {{
                if (!text) return '';
                return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }}

            // Close modal when clicking outside card
            document.getElementById("violation-modal-backdrop").addEventListener("click", function(e) {{
                if (e.target === this) {{
                    closeViolationModal();
                }}
            }});

            // Close on Escape key
            document.addEventListener("keydown", function(e) {{
                if (e.key === "Escape") {{
                    closeViolationModal();
                }}
            }});
        </script>
    </body>
    </html>
    """

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"[OK] Interactive graph generated: {os.path.abspath(output_file)}")
