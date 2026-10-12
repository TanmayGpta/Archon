import os
import base64
import httpx
from typing import Dict, Any, List, Optional

GITHUB_API_BASE = "https://api.github.com"

class GitHubWorkspaceClient:
    """
    Client for clone-free remote GitHub exploration, tree browsing,
    file reading, direct committing, permission auditing, and 1-click auto-forking.
    """

    def __init__(self, token: Optional[str] = None):
        self.token = token or os.getenv("GITHUB_TOKEN", "")

    def _headers(self, custom_token: Optional[str] = None) -> Dict[str, str]:
        tok = custom_token or self.token
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Archon-Copilot-IDE"
        }
        if tok:
            headers["Authorization"] = f"token {tok}"
        return headers

    async def get_repo_info(self, owner: str, repo: str, token: Optional[str] = None) -> Dict[str, Any]:
        """Fetches repository metadata, permissions, and default branch."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=self._headers(token))
            if resp.status_code != 200:
                raise Exception(f"GitHub API Error ({resp.status_code}): {resp.text}")
            data = resp.json()
            permissions = data.get("permissions", {})
            can_push = permissions.get("push", False)
            return {
                "owner": owner,
                "repo": repo,
                "full_name": data.get("full_name", f"{owner}/{repo}"),
                "default_branch": data.get("default_branch", "main"),
                "description": data.get("description", ""),
                "can_push": can_push,
                "permissions": permissions,
                "is_fork": data.get("fork", False),
                "stars": data.get("stargazers_count", 0)
            }

    async def get_tree(self, owner: str, repo: str, branch: str, token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetches recursive tree and returns formatted TreeNode[] compatible with IDE Explorer."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=self._headers(token))
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch Git tree: {resp.text}")
            raw_tree = resp.json().get("tree", [])

        # Build hierarchical tree matching TreeNode structure
        # { name, path, type: 'file'|'directory', children: [] }
        root_children: List[Dict[str, Any]] = []
        dir_map: Dict[str, Dict[str, Any]] = {}

        for item in raw_tree:
            path_str = item.get("path", "")
            is_dir = item.get("type") == "tree"
            parts = path_str.split("/")
            name = parts[-1]

            node = {
                "name": name,
                "path": path_str,
                "type": "directory" if is_dir else "file",
                "sha": item.get("sha", ""),
                "size": item.get("size", 0)
            }
            if is_dir:
                node["children"] = []
                dir_map[path_str] = node

            if len(parts) == 1:
                root_children.append(node)
            else:
                parent_path = "/".join(parts[:-1])
                if parent_path in dir_map:
                    dir_map[parent_path].setdefault("children", []).append(node)
                else:
                    root_children.append(node)

        return root_children

    async def get_file_content(self, owner: str, repo: str, path: str, branch: str, token: Optional[str] = None) -> Dict[str, Any]:
        """Fetches file content and blob sha from GitHub Contents API."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=self._headers(token))
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch file content: {resp.text}")
            data = resp.json()
            raw_content = data.get("content", "")
            encoding = data.get("encoding", "")
            if encoding == "base64":
                content_str = base64.b64decode(raw_content).decode("utf-8", errors="replace")
            else:
                content_str = raw_content
            return {
                "path": path,
                "content": content_str,
                "sha": data.get("sha", ""),
                "size": data.get("size", 0)
            }

    async def save_file_content(
        self,
        owner: str,
        repo: str,
        path: str,
        content: str,
        commit_message: str,
        branch: str,
        sha: str,
        token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Directly commits updated file content to GitHub repo without cloning."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
        encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        payload = {
            "message": commit_message or f"Archon Copilot: Update {path}",
            "content": encoded_content,
            "branch": branch
        }
        if sha:
            payload["sha"] = sha

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.put(url, json=payload, headers=self._headers(token))
            if resp.status_code not in [200, 201]:
                raise Exception(f"Commit Failed ({resp.status_code}): {resp.text}")
            data = resp.json()
            return {
                "status": "success",
                "commit_sha": data.get("commit", {}).get("sha", ""),
                "new_file_sha": data.get("content", {}).get("sha", "")
            }

    async def fork_repo(self, owner: str, repo: str, token: Optional[str] = None) -> Dict[str, Any]:
        """Forks repository to user's authenticated account."""
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/forks"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=self._headers(token))
            if resp.status_code not in [200, 202]:
                raise Exception(f"Fork Failed ({resp.status_code}): {resp.text}")
            data = resp.json()
            return {
                "status": "success",
                "fork_full_name": data.get("full_name", ""),
                "fork_owner": data.get("owner", {}).get("login", ""),
                "fork_repo": data.get("name", repo),
                "default_branch": data.get("default_branch", "main")
            }
