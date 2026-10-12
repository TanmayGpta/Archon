import json
import re
from openai import OpenAI

PROMPT_TEMPLATE_PATH = "prompt.md"


class ArchScorer:
    def __init__(self, api_key: str, base_url: str, model_name: str):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model_name = model_name
        with open(PROMPT_TEMPLATE_PATH, "r", encoding="utf-8") as f:
            self.prompt_template = f.read()

    def _build_prompt(self, prd_text: str, predicted_puml: str) -> str:
        return (
            self.prompt_template
            .replace("{{INSERT_PRD_HERE}}", prd_text)
            .replace("{{INSERT_CODE_HERE}}", predicted_puml)
        )

    def score(self, prd_text: str, predicted_puml: str) -> dict:
        prompt = self._build_prompt(prd_text, predicted_puml)
        print(f"    -> Calling ArchScorer ({self.model_name}) for rubric scoring...")
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                stream=True,
            )
            chunks = []
            for chunk in response:
                delta = chunk.choices[0].delta
                if hasattr(delta, "content") and delta.content:
                    chunks.append(delta.content)
            raw = "".join(chunks)

            m = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL | re.IGNORECASE)
            json_str = m.group(1) if m else raw

            return json.loads(json_str)
        except Exception as e:
            print(f"    [Error] ArchScorer failed: {e}")
            return {}

    @staticmethod
    def extract_scores(result: dict) -> dict:
        scores = result.get("scores", {})
        return {
            "Score_Completeness": scores.get("completeness", {}).get("score"),
            "Score_Accuracy":     scores.get("accuracy",     {}).get("score"),
            "Score_Rationality":  scores.get("rationality",  {}).get("score"),
            "Score_Readability":  scores.get("readability",  {}).get("score"),
        }
