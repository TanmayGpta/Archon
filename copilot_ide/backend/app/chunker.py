import yaml
import json
import os

def chunk_openapi(data: dict, file_path: str) -> list:
    """Chunks OpenAPI 3.0 and Swagger 2.0 specs by individual endpoint."""
    chunks = []
    title = data.get('info', {}).get('title', 'API Spec')
    paths = data.get('paths', {})
    
    for path, methods in paths.items():
        for method, details in methods.items():
            if method.lower() not in ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']:
                continue
            chunk_text = f"API Spec: {title}\nEndpoint: {method.upper()} {path}\n"
            chunk_text += f"Summary: {details.get('summary', '')}\n"
            chunk_text += f"Definition: {json.dumps(details)}\n"
            
            chunks.append({
                "text": chunk_text,
                "source": os.path.basename(file_path),
                "endpoint": path,
                "method": method.upper()
            })
    return chunks

def chunk_postman(data: dict, file_path: str) -> list:
    """Chunks Postman collections by individual request item."""
    chunks = []
    title = data.get('info', {}).get('name', 'Postman Collection')
    
    for item in data.get('item', []):
        name = item.get('name', 'Request')
        req = item.get('request', {})
        method = req.get('method', 'GET')
        
        url_obj = req.get('url', {})
        url = url_obj.get('raw', '') if isinstance(url_obj, dict) else str(url_obj)
            
        chunk_text = f"API Spec: {title}\nRequest Name: {name}\n"
        chunk_text += f"Endpoint: {method.upper()} {url}\n"
        chunk_text += f"Headers: {json.dumps(req.get('header', []))}\n"
        chunk_text += f"Body Definition: {json.dumps(req.get('body', {}))}\n"
        
        chunks.append({
            "text": chunk_text,
            "source": os.path.basename(file_path),
            "endpoint": url,
            "method": method.upper()
        })
    return chunks

def chunk_markdown(text: str, file_path: str) -> list:
    """Chunks Markdown documentation semantically by Header (H2)."""
    chunks = []
    sections = text.split('\n## ')
    title = sections[0].replace('# ', '').strip() if sections else 'Documentation'
    
    for section in sections[1:]:
        lines = section.split('\n')
        header = lines[0].strip()
        body = '\n'.join(lines[1:]).strip()
        
        chunk_text = f"Documentation: {title}\nSection: {header}\n\n{body}"
        chunks.append({
            "text": chunk_text,
            "source": os.path.basename(file_path),
            "endpoint": header,
            "method": "DOC"
        })
    return chunks

def chunk_file(file_path: str) -> list:
    """Intelligent router that determines the parsing strategy based on file type and schema."""
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return []
        
    print(f"Parsing spec: {file_path}")
    
    # 1. Markdown documents
    if file_path.endswith('.md'):
        with open(file_path, 'r', encoding='utf-8') as f:
            return chunk_markdown(f.read(), file_path)
            
    # 2. Parse JSON/YAML
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            if file_path.endswith(('.yaml', '.yml')):
                data = yaml.safe_load(f)
            else:
                data = json.load(f)
    except Exception as e:
        print(f"Failed to parse {file_path}: {e}")
        return []
        
    if not isinstance(data, dict):
        return []
        
    # 3. Route based on schema signature
    if 'openapi' in data or 'swagger' in data or 'paths' in data:
        return chunk_openapi(data, file_path)
    elif 'info' in data and 'item' in data:
        return chunk_postman(data, file_path)
    else:
        print(f"Warning: Unknown format for {file_path}. Skipping.")
        return []
