"""Mines public Clean-Architecture-style Python repos into a labelled, masked dataset.

    python mine.py --max-repos 400            # search + clone + extract -> data/dataset.jsonl

Cloned code is only parsed (ast), never executed. Clones live outside the repo so
`archon self-check` never scans them.
"""
import argparse
import ast
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

from conformance.extraction import extract_imports_from_file  # noqa: E402  same import extraction as production
from vocab import LAYERS, SKIP_DIRS, label_for, mask_dotted, mask_source, _DOTTED  # noqa: E402

TOPICS = ["clean-architecture", "hexagonal-architecture", "onion-architecture", "ports-and-adapters",
          "domain-driven-design", "ddd", "ddd-architecture", "cqrs", "clean-code-architecture"]
CACHE = Path(os.getenv("CLF_CACHE", Path.home() / ".cache" / "archon_clf"))
MAX_FILES_PER_REPO = 200
TEST_FILES_PER_REPO = 20
SOURCE_CHARS = 8000


def github_search(topic, page):
    q = urllib.parse.quote(f"topic:{topic} language:Python")
    url = f"https://api.github.com/search/repositories?q={q}&sort=stars&order=desc&per_page=100&page={page}"
    req = urllib.request.Request(url, headers={"User-Agent": "archon-classifier-eval",
                                               "Accept": "application/vnd.github+json"})
    if os.getenv("GITHUB_TOKEN"):
        req.add_header("Authorization", f"Bearer {os.environ['GITHUB_TOKEN']}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("items", [])


def find_repos(max_repos):
    seen = {}
    delay = 2 if os.getenv("GITHUB_TOKEN") else 7  # unauthenticated search: 10 req/min
    for topic in TOPICS:
        for page in (1, 2, 3):
            try:
                items = github_search(topic, page)
            except Exception as e:
                print(f"  search {topic} p{page}: {e}")
                items = []
            for it in items:
                if it["fork"] or it["archived"] or it["size"] > 50_000 or not it.get("license"):
                    continue
                seen.setdefault(it["full_name"], {
                    "repo": it["full_name"], "clone_url": it["clone_url"], "stars": it["stargazers_count"],
                    "license": it["license"]["spdx_id"],
                })
            print(f"  topic:{topic} p{page} -> {len(items)} hits, {len(seen)} unique")
            time.sleep(delay)
            if len(items) < 100:
                break
    return sorted(seen.values(), key=lambda r: -r["stars"])[:max_repos]


def clone(repo):
    dest = CACHE / "repos" / repo["repo"].replace("/", "__")
    if (dest / ".git").exists():
        return dest
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_LFS_SKIP_SMUDGE="1")
    try:
        subprocess.run(["git", "-c", "core.symlinks=false", "clone", "-q", "--depth", "1", "--no-tags",
                        repo["clone_url"], str(dest)], env=env, timeout=180, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return dest
    except Exception:
        return None


def mask_expr(s):
    return _DOTTED.sub(lambda d: mask_dotted(d.group(0)) if "." in d.group(0) else d.group(0), s)


def skeleton(tree):
    """Class/function signatures, decorators and first docstring lines; no bodies."""
    out = []

    def doc(node, indent):
        d = (ast.get_docstring(node) or "").strip()
        if d:
            out.append(f'{indent}    """{d.strip().splitlines()[0][:120]}"""')

    def fn(node, indent):
        for dec in node.decorator_list:
            out.append(f"{indent}@{mask_expr(ast.unparse(dec))[:80]}")
        ret = f" -> {mask_expr(ast.unparse(node.returns))}" if node.returns else ""
        kw = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
        out.append(f"{indent}{kw} {node.name}({mask_expr(ast.unparse(node.args))[:160]}){ret}")
        doc(node, indent)

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            for dec in node.decorator_list:
                out.append(f"@{mask_expr(ast.unparse(dec))[:80]}")
            bases = ", ".join(mask_expr(ast.unparse(b)) for b in node.bases)
            out.append(f"class {node.name}({bases}):" if bases else f"class {node.name}:")
            doc(node, "")
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    fn(sub, "    ")
                elif isinstance(sub, ast.AnnAssign) and isinstance(sub.target, ast.Name):
                    out.append(f"    {sub.target.id}: {mask_expr(ast.unparse(sub.annotation))[:80]}")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            fn(node, "")
    return "\n".join(out)


def is_test_file(name):
    return name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"


def extract_repo(repo, path):
    rows = []
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS and not d.startswith(".")]
        for f in files:
            if not f.endswith(".py") or f == "__init__.py" or is_test_file(f):
                continue
            fp = Path(root) / f
            rel = fp.relative_to(path)
            label = label_for(rel.parts[:-1])
            if label is None or fp.stat().st_size > 200_000:
                continue
            try:
                text = fp.read_text(encoding="utf-8")
                skel = skeleton(ast.parse(text))
            except Exception:
                continue
            if sum(1 for line in text.splitlines() if line.strip()) < 5:
                continue
            module = ".".join(rel.with_suffix("").parts)
            rows.append({
                "id": f"{repo['repo']}:{module}",
                "repo": repo["repo"], "license": repo["license"], "stars": repo["stars"],
                "module": module, "label": label,
                "module_masked": mask_dotted(module),
                "imports": sorted({mask_dotted(m) for m in extract_imports_from_file(str(fp))}),
                "skeleton": skel,
                "source": mask_source(text)[:SOURCE_CHARS],
                "sha": hashlib.sha1(" ".join(text.split()).encode()).hexdigest(),
            })
    return rows


def keep_repo(rows):
    counts = Counter(r["label"] for r in rows)
    return sum(1 for layer in LAYERS if counts[layer] >= 2) >= 3


def split_of(repo):
    h = int(hashlib.md5(repo.encode()).hexdigest(), 16) % 10
    return "train" if h < 6 else "dev" if h < 8 else "test"


def eval_subset(rows):
    """Up to TEST_FILES_PER_REPO per repo, round-robin over labels so no layer is starved."""
    by_label = defaultdict(list)
    for r in sorted(rows, key=lambda r: r["sha"]):
        by_label[r["label"]].append(r)
    picked, queues = [], [q for q in by_label.values()]
    while queues and len(picked) < TEST_FILES_PER_REPO:
        for q in list(queues):
            if q and len(picked) < TEST_FILES_PER_REPO:
                picked.append(q.pop(0))
            if not q:
                queues.remove(q)
    return {r["id"] for r in picked}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-repos", type=int, default=400)
    ap.add_argument("--out", default=str(HERE / "data" / "dataset.jsonl"))
    args = ap.parse_args()

    (CACHE / "repos").mkdir(parents=True, exist_ok=True)
    repos_file = CACHE / "repos.json"
    if repos_file.exists():
        repos = json.loads(repos_file.read_text())
        print(f"Using cached search: {len(repos)} repos ({repos_file})")
    else:
        print("Searching GitHub...")
        repos = find_repos(args.max_repos)
        repos_file.write_text(json.dumps(repos, indent=1))

    print(f"Cloning {len(repos)} repos into {CACHE / 'repos'} ...")
    with ThreadPoolExecutor(8) as pool:
        paths = list(pool.map(clone, repos))

    demo = {"repo": "archon/ecommerce_platform", "license": "internal", "stars": 0}
    candidates = [(r, p) for r, p in zip(repos, paths) if p] + [(demo, ROOT / "test_codebases" / "ecommerce_platform")]

    seen_sha, dataset, kept = set(), [], []
    for repo, path in candidates:
        rows = [r for r in extract_repo(repo, path) if r["sha"] not in seen_sha]  # drops template copies
        if not keep_repo(rows):
            continue
        rows = sorted(rows, key=lambda r: r["sha"])[:MAX_FILES_PER_REPO]
        split = "test" if repo["repo"].startswith("archon/") else split_of(repo["repo"])
        subset = eval_subset(rows) if split == "test" else set()
        for r in rows:
            r["split"], r["eval"] = split, r["id"] in subset
            seen_sha.add(r["sha"])
        dataset += rows
        kept.append(repo["repo"])

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        for r in dataset:
            fh.write(json.dumps(r) + "\n")

    print(f"\nKept {len(kept)}/{len(candidates)} repos, {len(dataset)} files -> {out}")
    for split in ("train", "dev", "test"):
        rows = [r for r in dataset if r["split"] == split]
        print(f"  {split:5} repos={len({r['repo'] for r in rows}):4} files={len(rows):6}  "
              + "  ".join(f"{k}={v}" for k, v in sorted(Counter(r['label'] for r in rows).items())))
    ev = [r for r in dataset if r["eval"]]
    print(f"  eval subset (test, <= {TEST_FILES_PER_REPO}/repo): {len(ev)} files  "
          + "  ".join(f"{k}={v}" for k, v in sorted(Counter(r['label'] for r in ev).items())))


if __name__ == "__main__":
    main()
