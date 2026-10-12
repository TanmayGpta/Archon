import urllib.request
import json

url = 'https://omnikey-ai-unified-key-manager.onrender.com/v1beta/models/gemini-2.5-flash:generateContent?key=omnikey-g-3b917034df4b4d587d751288802bf6c3b223d53976f0e21d'
payload = {
    'contents': [{'parts': [{'text': 'Return JSON only with suggested_files list: {"suggested_files": [{"path": "services/rag_service/app/search_engine.py", "reason": "Handles search ranking", "confidence": 0.95}]}'}]}],
    'generationConfig': {'temperature': 0.1}
}
req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode('utf-8'))
    print("Raw output:", data)
    text = data['candidates'][0]['content']['parts'][0]['text']
    print("Inner text:", text)
except Exception as e:
    print("Error:", e)
