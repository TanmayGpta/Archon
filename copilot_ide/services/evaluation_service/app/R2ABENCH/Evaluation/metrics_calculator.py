import networkx as nx
import pandas as pd
import json



class MetricsCalculator:
    def __init__(self):
        self.results = []
        self.weights = {
            'miss_node': 1.0, 
            'hallu_node': 0.8,
            'contains_err': 2.0, 
            'miss_dep': 1.0, 
            'hallu_dep': 1.2 
        }
        
    def _calculate_node_metrics(self, alignment_data):
        matched_pairs = alignment_data.get("matched_pairs", [])
        unmatched_pred = alignment_data.get("unmatched_predicted_nodes", [])
        unmatched_gt = alignment_data.get("unmatched_gt_nodes", [])
        
        tp_v = 0
        if isinstance(matched_pairs, list):
            for pair in matched_pairs:
                if isinstance(pair, dict):
                    preds = pair.get("predicted_nodes", [])
                    if isinstance(preds, list):
                        tp_v += len(preds)
        
        fp_v = len(unmatched_pred) if isinstance(unmatched_pred, list) else 0
        fn_v = len(unmatched_gt) if isinstance(unmatched_gt, list) else 0
        
        precision = tp_v / (tp_v + fp_v) if (tp_v + fp_v) > 0 else 0
        recall = tp_v / (tp_v + fn_v) if (tp_v + fn_v) > 0 else 0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        return precision, recall, f1

    def _calculate_edge_metrics(self, alignment_data, gt_edges, pred_edges, gt_all_nodes=None):
        pred_to_gt_map = {}
        matched_pairs = alignment_data.get("matched_pairs", [])

        if isinstance(matched_pairs, list):
            for pair in matched_pairs:
                if isinstance(pair, dict):
                    gt_nodes = pair.get("gt_nodes", [])
                    pred_nodes = pair.get("predicted_nodes", [])
                    if isinstance(gt_nodes, list) and isinstance(pred_nodes, list):
                        for p_node in pred_nodes:
                            pred_to_gt_map[p_node.replace("\n", "\\n")] = gt_nodes

        gt_nodes_set = set(gt_all_nodes) if gt_all_nodes else set()

        def get_node_and_ancestors(node_name):
            result = {node_name}
            parts = node_name.split("::")
            for i in range(1, len(parts)):
                prefix = "::".join(parts[:i])
                if prefix in gt_nodes_set:
                    result.add(prefix)
                global_prefix = f"Global::{prefix}"
                if global_prefix in gt_nodes_set:
                    result.add(global_prefix)
            return result

        gt_edges_set = set(gt_edges)
        tp_pred_edges = 0
        tp_gt_edges_covered = set()

        for src_p, dst_p in pred_edges:
            mapped_srcs = pred_to_gt_map.get(src_p, [])
            mapped_dsts = pred_to_gt_map.get(dst_p, [])

            is_edge_matched = False
            for g_src in mapped_srcs:
                if is_edge_matched:
                    break
                src_candidates = get_node_and_ancestors(g_src)
                for g_dst in mapped_dsts:
                    dst_candidates = get_node_and_ancestors(g_dst)
                    for a_src in src_candidates:
                        for a_dst in dst_candidates:
                            if (a_src, a_dst) in gt_edges_set:
                                is_edge_matched = True
                                tp_gt_edges_covered.add((a_src, a_dst))
                                break
                        if is_edge_matched:
                            break
                    if is_edge_matched:
                        break

            if is_edge_matched:
                tp_pred_edges += 1

        precision = tp_pred_edges / len(pred_edges) if len(pred_edges) > 0 else 0
        recall = len(tp_gt_edges_covered) / len(gt_edges) if len(gt_edges) > 0 else 0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

        return precision, recall, f1

    def _calculate_ged_and_accuracy(self, gt_nodes, gt_edges, pred_nodes, pred_edges, alignment_data):
        matched_pairs = alignment_data.get("matched_pairs", [])
        gt_to_pred_map = {}
        mapped_gt_nodes = set()
        mapped_pred_nodes = set()
        boundary_errors_count = 0

        for match in matched_pairs:
            preds = match.get("predicted_nodes", [])
            gts = match.get("gt_nodes", [])
            is_boundary = match.get("is_boundary_correct", False)
            
            pred_target = preds[0].replace("\n", "\\n") if preds else None

            for gt in gts:
                mapped_gt_nodes.add(gt)
                if pred_target:
                    gt_to_pred_map[gt] = pred_target
                    mapped_pred_nodes.add(pred_target)
            
            if not is_boundary and pred_target:
                boundary_errors_count += len(gts)

        unmapped_gt = set(gt_nodes) - mapped_gt_nodes
        unmapped_pred = set(pred_nodes) - mapped_pred_nodes
        
        miss_node_count = len(unmapped_gt)
        hallu_node_count = len(unmapped_pred)

        translated_gt_edges = set()
        for u, v in gt_edges:
            t_u = gt_to_pred_map.get(u, u)
            t_v = gt_to_pred_map.get(v, v)
            translated_gt_edges.add((t_u, t_v))
            
        pred_edges_set = set(pred_edges)
        missing_depends = translated_gt_edges - pred_edges_set
        hallucinated_depends = pred_edges_set - translated_gt_edges

        miss_dep_count = len(missing_depends)
        hallu_dep_count = len(hallucinated_depends)

        ged = (
            miss_node_count * self.weights['miss_node'] +
            hallu_node_count * self.weights['hallu_node'] +
            boundary_errors_count * self.weights['contains_err'] +
            miss_dep_count * self.weights['miss_dep'] +
            hallu_dep_count * self.weights['hallu_dep']
        )

        max_possible_ged = (
            len(gt_nodes) * self.weights['miss_node'] +
            len(pred_nodes) * self.weights['hallu_node'] +
            len(gt_nodes) * self.weights['contains_err'] +
            len(gt_edges) * self.weights['miss_dep'] +
            len(pred_edges) * self.weights['hallu_dep']
        )

        if max_possible_ged == 0:
            accuracy_score = 100.0
        else:
            accuracy_score = max(0.0, 100.0 * (1.0 - (ged / max_possible_ged)))

        report = {
            "accuracy_score": round(accuracy_score, 2),
            "absolute_ged": round(ged, 2),
            "details": {
                "missing_nodes": list(unmapped_gt),
                "hallucinated_nodes": list(unmapped_pred),
                "boundary_errors_count": boundary_errors_count,
                "missing_depends_edges": list(missing_depends),
                "hallucinated_depends_edges": list(hallucinated_depends)
            }
        }
        return report

    def _calculate_antipatterns(self, pred_nodes, pred_edges):

        all_nodes = set(pred_nodes)
        leaf_nodes = [n for n in all_nodes
                      if not any(other.startswith(f"{n}::") for other in all_nodes)]

        if not leaf_nodes:
            return 0.0, 0.0

        degree = {n: 0 for n in leaf_nodes}
        leaf_set = set(leaf_nodes)
        for src, dst in pred_edges:
            if src in leaf_set:
                degree[src] += 1
            if dst in leaf_set:
                degree[dst] += 1

        # Orphan_Ratio
        orphan_count = sum(1 for d in degree.values() if d == 0)
        orphan_ratio = orphan_count / len(leaf_nodes)

        degrees = list(degree.values())
        if len(degrees) < 2:
            god_ratio = 0.0
        else:
            mean_d = sum(degrees) / len(degrees)
            variance = sum((d - mean_d) ** 2 for d in degrees) / len(degrees)
            std_d = variance ** 0.5
            threshold = mean_d + 2 * std_d
            god_count = sum(1 for d in degrees if d > threshold)
            god_ratio = god_count / len(leaf_nodes)

        return round(orphan_ratio, 4), round(god_ratio, 4)

    def _calculate_boundary_accuracy(self, alignment_data, gt_nodes, pred_nodes):
        matched_pairs = alignment_data.get("matched_pairs", [])
        if not matched_pairs:
            return 0.0

        correct_boundaries = 0
        total_matched = len(matched_pairs)

        for pair in matched_pairs:
            if not isinstance(pair, dict):
                continue
            if pair.get("is_boundary_correct", False):
                correct_boundaries += 1

        return correct_boundaries / total_matched if total_matched > 0 else 0.0

    def evaluate_project(self, project_name, gt_parsed, pred_parsed, alignment_data):
        if not pred_parsed['nodes']:
            self.results.append({
                "Project": project_name,
                "Node_Precision": 0, "Node_Recall": 0, "Node_F1": 0,
                "Edge_Precision": 0, "Edge_Recall": 0, "Edge_F1": 0,
                "Boundary_Accuracy": 0,
                "GED": -1, "Orphan_Ratio": 0, "God_Ratio": 0
            })
            return

        p_node, r_node, f1_node = self._calculate_node_metrics(alignment_data)
        p_edge, r_edge, f1_edge = self._calculate_edge_metrics(alignment_data, gt_parsed['edges'], pred_parsed['edges'], gt_parsed['nodes'])
        GED_report = self._calculate_ged_and_accuracy(
            pred_nodes=pred_parsed['nodes'], pred_edges=pred_parsed['edges'],
            gt_nodes=gt_parsed['nodes'], gt_edges=gt_parsed['edges'], alignment_data=alignment_data
        )
        orphan_ratio, god_ratio = self._calculate_antipatterns(pred_parsed['nodes'], pred_parsed['edges'])
        self.results.append({
            "Project": project_name,
            "Node_Precision": round(p_node, 4),
            "Node_Recall": round(r_node, 4),
            "Node_F1": round(f1_node, 4),
            "Edge_Precision": round(p_edge, 4),
            "Edge_Recall": round(r_edge, 4),
            "Edge_F1": round(f1_edge, 4),
            "Boundary_Accuracy": round(self._calculate_boundary_accuracy(alignment_data, gt_parsed['nodes'], pred_parsed['nodes']), 4),
            "GED": GED_report['accuracy_score'],
            "Orphan_Ratio": orphan_ratio,
            "God_Ratio": god_ratio,
        })
        print(f"Node F1: {f1_node:.2f} | Edge F1: {f1_edge:.2f} | GED: {GED_report['accuracy_score']} | Orphan: {orphan_ratio} | God: {god_ratio}")

    def add_scores(self, project_name: str, dim_scores: dict):
        for row in self.results:
            if row["Project"] == project_name:
                row.update(dim_scores)
                values = [v for v in dim_scores.values() if v is not None]
                row["Score_Avg"] = round(sum(values) / len(values), 4) if values else None
                return

    def export_to_csv(self, output_filename):
        if not self.results:
            print("[Warning] No data available to export.")
            return
        df = pd.DataFrame(self.results)
        df.to_csv(output_filename, index=False, encoding='utf-8-sig')
        print(f"\n[Success] Evaluation metrics have been exported to: {output_filename}")
        print("Data Overview:")
        print(df.to_string())