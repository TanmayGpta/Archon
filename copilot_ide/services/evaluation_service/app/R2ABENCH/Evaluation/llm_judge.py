import json
import re
from openai import OpenAI

class LLMJudge:
    def __init__(self, api_key: str, base_url: str = "https://xx", model_name: str = "o3"):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model_name = model_name

    def _build_judge_prompt(self, prd_summary: str, gt_nodes: list, predicted_nodes: list) -> str:
        prompt = (
            "You are a senior software architect. Your task now is to evaluate whether the AI-generated architecture diagram nodes and their 【layer/boundary attribution】 accurately reproduce the real manual design (Ground Truth).\n\n"
            "I will provide you with two lists of nodes (the format convention is \"boundary/package name::node name\"; if there is no boundary, it is \"Global::node name\"): one is a list of manually drawn standard nodes (GT Nodes), and the other is a list of nodes predicted by AI (Predicted Nodes). A system PRD will also be provided as context.\n\n"
            "【Your Task】\n"
            "Identify nodes in the two lists that are semantically and functionally equivalent, and strictly evaluate whether the AI has placed the nodes in the correct system boundaries or architectural layers.\n\n"
            "【Matching Rules - Very Important】\n"
            "1. Exact Matching (1:1): Nodes with different names but referring to the same component are considered a successful match.\n"
            "2. Split/Merged Matching (1:N or N:1):\n"
            "   - A single large node in the GT is split into multiple specific microservices by the AI, and they are mapped together.\n"
            "   - Multiple detailed nodes in the GT are aggregated into one node by the AI, and they are mapped together.\n"
            "3. Boundary/Layer Evaluation (Boundary Check):\n"
            "   - For successfully matched nodes, compare their \"boundary/package names.\"\n"
            "   - For all package names of the node, if there is a case where they are different from the successfully matched GT node's package name but semantically equivalent (e.g., GT is \"Backend::Data Layer::MySQL\", AI is \"Database::MySQL\"), it is judged as `true`.\n"
            "   - If a severe boundary-crossing error or context confusion occurs (e.g., a service belonging to the \"Order Context\" in the GT is placed in the \"User Context\" by the AI, or a backend component is placed in a frontend package), it is judged as `false`.\n"
            "4. Unmatched Nodes: Nodes that are hallucinated by the AI or omitted, placed in the unmatched lists respectively.\n\n"
            "【Input Data】\n"
            f"PRD Background Description: {prd_summary}\n"
            f"GT Nodes: {json.dumps(gt_nodes)}\n"
            f"Predicted Nodes: {json.dumps(predicted_nodes)}\n\n"
            "【Output Format】\n"
            "Please output strictly in JSON format, without including any markdown code block markers or unnecessary explanations. The format is as follows:\n"
            "{\n"
            '  "matched_pairs": [\n'
            "    {\n"
            '      "gt_nodes": ["Backend::Auth Service"],\n'
            '      "predicted_nodes": ["Gateway::Auth Center"],\n'
            '      "match_type": "1:1",\n'
            '      "is_boundary_correct": false,\n'
            '      "reasoning": "The functionality matches (both are authentication), but the boundary is incorrect. In GT, it belongs to the backend microservice layer, while the AI incorrectly placed it in the gateway layer."\n'
            "    },\n"
            "    {\n"
            '      "gt_nodes": ["Data Layer::User DB"],\n'
            '      "predicted_nodes": ["Database::MySQL_User", "Database::Redis_User"],\n'
            '      "match_type": "1:N",\n'
            '      "is_boundary_correct": true,\n'
            '      "reasoning": "The node is split into finer components, but the database boundary attribution is semantically consistent, and the boundary judgment is correct."\n'
            "    }\n"
            "  ],\n"
            '  "unmatched_gt_nodes": ["Global::Payment API"],\n'
            '  "unmatched_predicted_nodes": ["Frontend::Vue Router"]\n'
            "}"
        )
        return prompt

    def evaluate_alignment(self, prd_summary: str, gt_nodes: list, predicted_nodes: list) -> dict:
        prompt = self._build_judge_prompt(prd_summary, gt_nodes, predicted_nodes)
        print(f"    -> Calling Judge ({self.model_name}) for semantic alignment. Please wait...")
        
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0, 
                stream=True
            )
            
            content_chunks = []
            for chunk in response:
                delta = chunk.choices[0].delta
                if hasattr(delta, 'content') and delta.content:
                    content_chunks.append(delta.content)
            
            raw_content = "".join(content_chunks)
            
            json_str = raw_content
            match = re.search(r'```(?:json)?\s*(.*?)\s*```', raw_content, re.DOTALL | re.IGNORECASE)
            if match:
                json_str = match.group(1)
                
            return json.loads(json_str)
            
        except Exception as e:
            print(f"    [Error] Judge API or JSON parsing failed: {e}")
            return {"matched_pairs": [], "unmatched_gt_nodes": gt_nodes, "unmatched_predicted_nodes": predicted_nodes}