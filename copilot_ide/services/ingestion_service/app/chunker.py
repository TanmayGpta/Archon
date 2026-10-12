import json
import yaml
import hashlib
from typing import List, Dict, Any

def compute_chunk_hash(text: str) -> str:
    """Computes a SHA-256 hash fingerprint for chunk deduplication."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

def chunk_openapi_spec(spec_data: Dict[str, Any], source_name: str) -> List[Dict[str, Any]]:
    """Smart parser for OpenAPI 3.x and Swagger 2.0 specifications."""
    chunks = []
    api_title = spec_data.get('info', {}).get('title', 'Unknown API')
    api_version = spec_data.get('info', {}).get('version', '1.0')
    paths = spec_data.get('paths', {})

    for path, methods in paths.items():
        if not isinstance(methods, dict):
            continue
        for method, details in methods.items():
            if method.lower() not in ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']:
                continue
            if not isinstance(details, dict):
                continue

            summary = details.get('summary', 'No summary provided')
            description = details.get('description', '')
            parameters = details.get('parameters', [])
            request_body = details.get('requestBody', {})
            responses = details.get('responses', {})
            tags = details.get('tags', [])

            # Build enriched structured representation
            chunk_content = (
                f"API: {api_title} (v{api_version})\n"
                f"Endpoint: {method.upper()} {path}\n"
                f"Summary: {summary}\n"
            )
            if tags:
                chunk_content += f"Category: {', '.join(tags)}\n"
            if description:
                chunk_content += f"Description: {description}\n"
            if parameters:
                chunk_content += f"Parameters: {json.dumps(parameters)}\n"
            if request_body:
                chunk_content += f"Request Body: {json.dumps(request_body)}\n"
            if responses:
                chunk_content += f"Responses: {json.dumps(responses)}\n"

            chunks.append({
                "source": source_name,
                "api_title": api_title,
                "endpoint": f"{method.upper()} {path}",
                "hash": compute_chunk_hash(chunk_content),
                "text": chunk_content.strip()
            })

    return chunks

def chunk_postman_collection(collection_data: Dict[str, Any], source_name: str) -> List[Dict[str, Any]]:
    """Smart parser for Postman Collection v2.x JSON exports."""
    chunks = []
    collection_name = collection_data.get('info', {}).get('name', 'Postman Collection')

    def parse_items(items: list, folder_name: str = ""):
        for item in items:
            if 'item' in item:
                # Sub-folder
                sub_folder = f"{folder_name}/{item.get('name', '')}" if folder_name else item.get('name', '')
                parse_items(item['item'], sub_folder)
            elif 'request' in item:
                req = item['request']
                method = req.get('method', 'GET')
                url_data = req.get('url', {})
                url_raw = url_data.get('raw', '') if isinstance(url_data, dict) else str(url_data)
                description = req.get('description', item.get('name', ''))
                headers = req.get('header', [])
                body = req.get('body', {})

                chunk_content = (
                    f"Collection: {collection_name}\n"
                    f"Folder: {folder_name if folder_name else 'Root'}\n"
                    f"Name: {item.get('name', 'Endpoint')}\n"
                    f"Method: {method}\n"
                    f"URL: {url_raw}\n"
                )
                if description:
                    chunk_content += f"Description: {description}\n"
                if headers:
                    chunk_content += f"Headers: {json.dumps(headers)}\n"
                if body:
                    chunk_content += f"Body: {json.dumps(body)}\n"

                chunks.append({
                    "source": source_name,
                    "api_title": collection_name,
                    "endpoint": f"{method} {url_raw}",
                    "hash": compute_chunk_hash(chunk_content),
                    "text": chunk_content.strip()
                })

    parse_items(collection_data.get('item', []))
    return chunks

def chunk_markdown_doc(content: str, source_name: str) -> List[Dict[str, Any]]:
    """Smart hierarchical section chunker for API documentation guides."""
    chunks = []
    sections = content.split('\n## ')
    
    for i, section in enumerate(sections):
        if not section.strip():
            continue
        header = f"## {section.splitlines()[0]}" if i > 0 else section.splitlines()[0]
        text = section.strip()
        chunks.append({
            "source": source_name,
            "api_title": source_name,
            "endpoint": header,
            "hash": compute_chunk_hash(text),
            "text": f"[{source_name}] Section:\n{text}"
        })
    return chunks

def chunk_file_content(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """Dispatches parsing based on file content and extension."""
    if filename.endswith(('.yaml', '.yml')):
        try:
            data = yaml.safe_load(file_bytes.decode('utf-8'))
            if isinstance(data, dict) and 'paths' in data:
                return chunk_openapi_spec(data, filename)
        except Exception:
            pass

    if filename.endswith('.json'):
        try:
            data = json.loads(file_bytes.decode('utf-8'))
            if isinstance(data, dict):
                if 'paths' in data:
                    return chunk_openapi_spec(data, filename)
                elif 'info' in data and 'item' in data:
                    return chunk_postman_collection(data, filename)
        except Exception:
            pass

    if filename.endswith(('.md', '.txt')):
        return chunk_markdown_doc(file_bytes.decode('utf-8'), filename)

    # Fallback to plain text split
    return [{
        "source": filename,
        "api_title": filename,
        "endpoint": "General",
        "hash": compute_chunk_hash(file_bytes.decode('utf-8', errors='ignore')),
        "text": file_bytes.decode('utf-8', errors='ignore')
    }]
