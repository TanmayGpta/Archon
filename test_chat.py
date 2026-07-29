import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=os.environ.get("OPENROUTER_API_KEY")
)

HTML_CONTENT = """
<!DOCTYPE html>
<html>
<head>
    <title>Archon Chat</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        
        body {
            background-color: #000;
            color: #33ff00;
            font-family: 'Press Start 2P', monospace;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            height: 100vh;
            box-sizing: border-box;
            font-size: 14px;
        }
        #chat-box {
            flex: 1;
            overflow-y: auto;
            border: 4px solid #33ff00;
            padding: 10px;
            margin-bottom: 20px;
            background-color: #111;
            display: flex;
            flex-direction: column;
        }
        .message {
            margin-bottom: 15px;
            line-height: 1.5;
            max-width: 80%;
            word-wrap: break-word;
        }
        .user { 
            color: #ff00ff; /* Neon Pink */
            align-self: flex-end;
            text-align: right;
        }
        .bot { 
            color: #00ffff; /* Neon Cyan */
            align-self: flex-start;
            text-align: left;
        }
        .model-info {
            font-size: 8px;
            color: #888;
            display: block;
            margin-top: 5px;
        }
        
        #input-area {
            display: flex;
            gap: 10px;
        }
        input[type="text"] {
            flex: 1;
            background-color: #000;
            color: #33ff00;
            border: 4px solid #33ff00;
            font-family: 'Press Start 2P', monospace;
            padding: 10px;
            font-size: 14px;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: #ff00ff;
        }
        button {
            background-color: #33ff00;
            color: #000;
            border: none;
            font-family: 'Press Start 2P', monospace;
            padding: 10px 20px;
            cursor: pointer;
            font-weight: bold;
        }
        button:hover {
            background-color: #ff00ff;
            color: #fff;
        }
    </style>
</head>
<body>
    <div id="chat-box">
        <div class="message bot">> SYSTEM ONLINE. ARCHON READY.</div>
    </div>
    <div id="input-area">
        <input type="text" id="user-input" placeholder="ENTER COMMAND..." autocomplete="off" autofocus>
        <button onclick="sendMessage()">SEND</button>
    </div>

    <script>
        const chatBox = document.getElementById('chat-box');
        const userInput = document.getElementById('user-input');
        
        // Memory persistence
        let chatHistory = [{"role": "system", "content": "You are Archon, a highly intelligent AI assistant. Be concise."}];

        userInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });

        async function sendMessage() {
            const text = userInput.value.trim();
            if (!text) return;

            // Add user message to UI
            chatBox.innerHTML += `<div class="message user">${text} :USER <</div>`;
            userInput.value = '';
            
            // Efficient Memory: Keep only last 10 messages (plus system prompt) to save tokens
            if (chatHistory.length > 11) {
                chatHistory.splice(1, 2); 
            }
            chatHistory.push({"role": "user", "content": text});
            
            // Add loading placeholder
            const botId = 'bot-' + Date.now();
            chatBox.innerHTML += `<div class="message bot" id="${botId}">> ARCHON: <span class="cursor">_</span></div>`;
            chatBox.scrollTop = chatBox.scrollHeight;

            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: chatHistory })
                });
                
                const data = await response.json();
                const botMsgElement = document.getElementById(botId);
                
                if (data.error) {
                    botMsgElement.innerHTML = `> SYSTEM ERROR: ${data.error}`;
                    chatHistory.pop();
                } else {
                    const formattedReply = data.reply.replace(/\\n/g, '<br>');
                    botMsgElement.innerHTML = `> ARCHON: ${formattedReply} <span class="model-info">[Model: ${data.model}]</span>`;
                    chatHistory.push({"role": "assistant", "content": data.reply});
                }
            } catch (err) {
                document.getElementById(botId).innerHTML = `> SYSTEM ERROR: CONNECTION FAILED`;
                chatHistory.pop();
            }
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    </script>
</body>
</html>
"""

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(HTML_CONTENT.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/chat':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req_json = json.loads(post_data.decode('utf-8'))
            messages = req_json.get('messages', [])

            # Call OpenRouter LLM
            try:
                completion = client.chat.completions.create(
                    model="nvidia/nemotron-3-nano-30b-a3b:free",
                    messages=messages,
                    temperature=0.7,
                    top_p=1,
                    max_tokens=2048,
                    seed=42,
                    stream=False
                )
                reply = completion.choices[0].message.content
                actual_model = getattr(completion, "model", "Unknown")
                
                response_data = {"reply": reply, "model": actual_model}
            except Exception as e:
                response_data = {"error": str(e)}

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))

def run(server_class=HTTPServer, handler_class=RequestHandler, port=8081):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Starting Archon 8-bit chat server on http://localhost:{port} ...")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
