import os
import re
import time
from openai import OpenAI

class ArchitectureGenerator:
    def __init__(self, api_key: str, base_url: str = "https://xx", model_name: str = "gpt-5"):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model_name = model_name

    def _build_prompt(self, prd_text: str) -> str:
        system_prompt = (
            "You are an experienced software architect. Please read the provided Product Requirements Document (PRD) below and transform its content into a system architecture diagram based on the document.\n\n"
            "【Task Requirements - VERY IMPORTANT】\n"
            "1. You MUST generate a layered COMPONENT DIAGRAM  or DEPLOYMENT DIAGRAM). \n"
            "2. STRICTLY PROHIBITED: DO NOT generate Sequence Diagrams , Use Case Diagrams, or Class Diagrams. Do not use actor, participant, or -> for message passing.\n"
            "3. Use standard component diagram syntax, such as `package \"Name\" { [Component] }` or `component \"Name\" as alias`.\n"
            "4. The architecture diagram must comprehensively and accurately reflect the system components (microservices, databases, gateways, etc.) and their structural dependencies.\n"
            "5. 【Strict Format Requirement】: Output ONLY the PlantUML code within a Markdown code block (```plantuml ... ```). Begin with @startuml and end with @enduml.\n\n"
            "【Product Requirements Document (PRD)】\n"
            f"{prd_text}"
        )
        return system_prompt

    def _extract_plantuml(self, raw_response: str) -> str:
        pattern = r"```plantuml\s*(.*?)\s*```"
        match = re.search(pattern, raw_response, re.DOTALL | re.IGNORECASE)
        
        if match:
            puml_code = match.group(1).strip()
            if not puml_code.startswith("@startuml"):
                puml_code = "@startuml\n" + puml_code
            if not puml_code.endswith("@enduml"):
                puml_code = puml_code + "\n@enduml"
            return puml_code
        else:
            fallback_pattern = r"(@startuml.*?@enduml)"
            fallback_match = re.search(fallback_pattern, raw_response, re.DOTALL | re.IGNORECASE)
            if fallback_match:
                return fallback_match.group(1).strip()
            
            print("[Warning] Failed to extract a valid PlantUML code block from the model's response.")
            return ""

    def generate_architecture(self, prd_text: str, project_name: str, setting_name: str, output_base_dir: str = "outputs"):
        prompt = self._build_prompt(prd_text)
        
        print(f"Calling {self.model_name} for {project_name} ({setting_name}). This may take a few minutes for reasoning...")
        
        try:
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = self.client.chat.completions.create(
                        model = self.model_name,
                        messages = [
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.0,
                    )
                    full_raw_text =  response.choices[0].message.content
                    
                except Exception as e:
                    if attempt < max_retries - 1:
                        print(f"\nAPI request failed: {e}, waiting 5 seconds before retrying (Attempt {attempt + 1}/{max_retries})...")
                        time.sleep(5)
                    else:
                        raise e
            
            puml_code = self._extract_plantuml(full_raw_text)
            
            output_dir = output_base_dir
            os.makedirs(output_dir, exist_ok=True)
            
            with open(os.path.join(output_dir, 'raw_response.txt'), 'w', encoding='utf-8') as f:
                f.write(full_raw_text)
                
            puml_filename = os.path.join(output_dir, 'predicted.puml')
            with open(puml_filename, 'w', encoding='utf-8') as f:
                f.write(puml_code)
                
            print(f"[Success] Architecture diagram for {project_name} generated and saved to {puml_filename}")
            return puml_code

        except Exception as e:
            print(f"[Error] Critical error occurred while generating architecture diagram for {project_name}: {e}")
            return ""