import re


class UMLParser:
    def __init__(self):

        self.boundary_start_pattern = re.compile(
    r'(?i)^\s*(package|folder|frame|cloud|component|rectangle|database|interface|node)\s+'
    r'(?:\"[^\"]+\"|\[[^\]]+\])\s*(?:as\s+\w+)?[^{]*\{'
)
        self.boundary_end_pattern = re.compile(r'^\s*\}\s*$')
        

        # ========= Leaf Node Patterns =========
        self.leaf_patterns = {
            "rectangle": re.compile(
                r'(?i)^\s*rectangle\s+"([^"]+)"'
                r'(?:\s+as\s+(\w+))?'
                r'(?:\s+<<([^>]+)>>)?\s*$'
            ),
            "database": re.compile(
                r'(?i)^\s*database\s+"([^"]+)"'
                r'(?:\s+as\s+(\w+))?'
                r'(?:\s+<<([^>]+)>>)?\s*$'
            ),
            "interface": re.compile(
                r'(?i)^\s*interface\s+"([^"]+)"'
                r'(?:\s+as\s+(\w+))?'
                r'(?:\s+<<([^>]+)>>)?\s*$'
            ),
            "node": re.compile(
                r'(?i)^\s*node\s+"([^"]+)"'
                r'(?:\s+as\s+(\w+))?'
                r'(?:\s+<<([^>]+)>>)?\s*$'
            ),
            "component": re.compile(
                r'(?i)^\s*component\s+'
                r'(?:\"([^\"]+)\"|\[([^\]]+)\])'
                r'(?:\s+as\s+(\w+))?'
                r'(?:\s+<<([^>]+)>>)?\s*$'
            ),
            "component_shorthand": re.compile(
                r'(?i)^\s*\[([^\]]+)\]'
                r'(?:\s+as\s+(\w+))?'
                r'(?:\s+<<([^>]+)>>)?\s*$'
            )
        }

        self.edge_pattern = re.compile(
            r'(?i)(.*?)\s*(?:-+(?:up|down|left|right)?-*>|\.+>|<-+>|<-+-|<\.+|-+)\s*(.*)'
        )

    def parse(self, puml_code: str):
        nodes = set()
        explicit_nodes = set() 
        edges = []
        aliases = {}

        boundary_stack = []

        puml_code = re.sub(r"'.*$", "", puml_code, flags=re.MULTILINE)
        puml_code = re.sub(r"/'(.*?)'/", "", puml_code, flags=re.DOTALL)

        lines = puml_code.strip().split("\n")
        if not any("@startuml" in line for line in lines):
            return {"nodes": [], "edges": []}

        def full_name(name: str):
            prefix = "::".join(boundary_stack) if boundary_stack else "Global"
            return f"{prefix}::{name}"

        for line in lines:
            line = line.strip()
            if not line or line.startswith("@") or "skinparam" in line:
                continue

            # ---------- boundary ----------
            if self.boundary_start_pattern.match(line):
                name = re.findall(r'\"([^\"]+)\"|\[([^\]]+)\]', line)
                if name:
                    pkg_name = name[0][0] or name[0][1]
                    fn = full_name(pkg_name)
                    nodes.add(fn)
                    aliases[pkg_name] = fn
                    aliases[f'"{pkg_name}"'] = fn
                    alias_m = re.search(r'\bas\s+(\w+)', line, re.IGNORECASE)
                    if alias_m:
                        aliases[alias_m.group(1)] = fn
                    boundary_stack.append(pkg_name)
                continue

            if self.boundary_end_pattern.match(line):
                if boundary_stack:
                    boundary_stack.pop()
                continue

            # ---------- leaf node ----------
            matched_leaf = False
            for node_type, pattern in self.leaf_patterns.items():
                m = pattern.match(line)
                if not m:
                    continue

                if node_type == "component":
                    name = m.group(1) or m.group(2)
                    alias = m.group(3)
                elif node_type == "component_shorthand":
                    name = m.group(1)
                    alias = m.group(2)
                else:
                    name, alias, _ = m.groups()

                fn = full_name(name)
                nodes.add(fn)
                explicit_nodes.add(fn)

                aliases[name] = fn
                aliases[f'"{name}"'] = fn
                aliases[f'[{name}]'] = fn
                if alias:
                    aliases[alias] = fn

                matched_leaf = True
                break

            if matched_leaf:
                continue

            # ---------- edge ----------
            edge_match = self.edge_pattern.search(line)
            if edge_match:
                src_raw = edge_match.group(1).split(":")[0].strip()
                dst_raw = edge_match.group(2).split(":")[0].strip()

                for raw in (src_raw, dst_raw):
                    if raw not in aliases:
                        clean = raw.strip(' "[]()')
                        fn = full_name(clean)
                        nodes.add(fn)
                        aliases[raw] = fn

                edges.append((src_raw, dst_raw))

        # ---------- resolve edges ----------
        resolved_edges = []
        strip_chars = ' "[]()'
        for s, d in edges:
            rs = aliases.get(s, f"Global::{s.strip(strip_chars)}")
            rd = aliases.get(d, f"Global::{d.strip(strip_chars)}")
            resolved_edges.append((rs, rd))

        def get_true_leaf_nodes(all_nodes_set, explicit_set):
            leaf_nodes_list = []
            for node in all_nodes_set:
                if node not in explicit_set:
                    continue
                
                parent_prefix = f"{node}::"
                
                is_parent = any(other.startswith(parent_prefix) for other in all_nodes_set)
                
                if not is_parent:
                    leaf_nodes_list.append(node)
                    
            return leaf_nodes_list

        leaf_nodes = get_true_leaf_nodes(nodes, explicit_nodes)

        return {
            "nodes": list(nodes),
            "leafnodes": leaf_nodes,
            "edges": resolved_edges
        }