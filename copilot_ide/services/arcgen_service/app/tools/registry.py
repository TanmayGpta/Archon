"""Tool registry: schemas for the OpenAI wire format plus safe dispatch."""

import copy
import json
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Type, Union

from pydantic import BaseModel


@dataclass
class Tool:
    name: str
    description: str
    args_model: Type[BaseModel]
    fn: Callable[[BaseModel], Any]


def _inline_refs(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve local $ref / $defs so providers that choke on them get a self-contained schema."""
    defs = schema.get("$defs", {})

    def walk(node: Any, seen: tuple = ()) -> Any:
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/$defs/"):
                name = ref.split("/")[-1]
                if name in seen or name not in defs:
                    return {"type": "object"}
                merged = walk(copy.deepcopy(defs[name]), seen + (name,))
                extra = {k: walk(v, seen) for k, v in node.items() if k != "$ref"}
                return {**merged, **extra}
            return {k: walk(v, seen) for k, v in node.items() if k != "$defs"}
        if isinstance(node, list):
            return [walk(v, seen) for v in node]
        return node

    return walk(schema)


class ToolRegistry:
    def __init__(self, tools: List[Tool]):
        self.tools: Dict[str, Tool] = {t.name: t for t in tools}

    def __contains__(self, name: str) -> bool:
        return name in self.tools

    def openai_schemas(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": _inline_refs(t.args_model.model_json_schema()),
                },
            }
            for t in self.tools.values()
        ]

    def dispatch(self, name: str, raw_args: Union[str, dict, None]) -> str:
        """Run a tool and return a JSON string. Never raises; errors come back as {"error": ...}."""
        tool = self.tools.get(name)
        if tool is None:
            return json.dumps({"error": f"Unknown tool '{name}'. Available: {sorted(self.tools)}"})
        try:
            if isinstance(raw_args, str):
                args = json.loads(raw_args) if raw_args.strip() else {}
            else:
                args = raw_args or {}
            parsed = tool.args_model.model_validate(args)
        except Exception as e:
            return json.dumps({"error": f"Invalid arguments for '{name}': {e}"})
        try:
            return json.dumps(tool.fn(parsed), default=str)
        except Exception as e:
            return json.dumps({"error": f"Tool '{name}' failed: {e}"})
