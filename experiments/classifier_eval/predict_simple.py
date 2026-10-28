"""Floor baselines any candidate must clear: majority class and an import-keyword rule."""
import json
from collections import Counter

from features import HERE, load

INFRA = ("sqlalchemy", "redis", "boto3", "requests", "httpx", "psycopg", "pymongo", "motor", "kafka",
         "aiokafka", "pika", "celery", "elasticsearch", "aiohttp", "sqlite3", "databases", "tortoise")
PRES = ("fastapi", "flask", "django", "starlette", "click", "typer", "argparse", "aiogram", "telegram",
        "graphene", "strawberry", "rest_framework", "uvicorn")
APP = ("abc",)


def rule(r):
    roots = {i.lstrip(".").split(".")[0] for i in r["imports"]}
    if roots & set(PRES):
        return "Presentation"
    if roots & set(INFRA):
        return "Infrastructure"
    if roots & set(APP) and "pkg" in roots:
        return "Application"
    return "Domain"


def main():
    majority = Counter(r["label"] for r in load(split="train")).most_common(1)[0][0]
    rows = load(eval_only=True)
    (HERE / "preds").mkdir(exist_ok=True)
    for name, fn in (("majority", lambda r: majority), ("import-rule", rule)):
        with (HERE / "preds" / f"{name}.jsonl").open("w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps({"id": r["id"], "pred": fn(r), "conf": 1.0}) + "\n")
        print(f"wrote preds/{name}.jsonl")


if __name__ == "__main__":
    main()
