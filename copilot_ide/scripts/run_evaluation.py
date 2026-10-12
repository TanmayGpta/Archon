import time
import requests
import json
import sys

EVAL_URL = "http://localhost:8003/api/evaluate"
MODELS_TO_RUN = ["gemma3:4b", "codellama:7b", "starcoder2:3b"]
JUDGE_MODEL = "qwen2.5:7b"

def main():
    print("[*] Starting LLM-as-a-Judge Evaluation Run (CoT enabled)...")
    
    # 1. Trigger the run
    start_payload = {
        "models": MODELS_TO_RUN,
        "scoring_mode": "llm",
        "judge_model": JUDGE_MODEL
    }
    
    try:
        resp = requests.post(f"{EVAL_URL}/run", json=start_payload)
        resp.raise_for_status()
        data = resp.json()
        run_id = data["run_id"]
        total = data["total"]
        print(f"[+] Run started! Run ID: {run_id}")
        print(f"[+] Total evaluations to process: {total}")
    except Exception as e:
        print(f"[-] Failed to start run. Is the evaluation-service running on port 8003? Error: {e}")
        sys.exit(1)

    # 2. Poll for completion
    while True:
        try:
            status_resp = requests.get(f"{EVAL_URL}/status/{run_id}")
            status_resp.raise_for_status()
            status_data = status_resp.json()
            
            completed = status_data["completed"]
            percent = status_data["percent"]
            current_q = status_data.get("current_question", "N/A")
            current_m = status_data.get("current_model", "N/A")
            
            sys.stdout.write(f"\r[*] Progress: {percent}% ({completed}/{total}) | Currently judging: {current_m} on {current_q}")
            sys.stdout.flush()
            
            if status_data["status"] == "completed":
                print("\n[+] Evaluation run completed!")
                break
            elif status_data["status"] == "error":
                print(f"\n[-] Run failed: {status_data.get('error_msg')}")
                sys.exit(1)
                
            time.sleep(3)
        except Exception as e:
            print(f"\n[!] Error polling status: {e}")
            time.sleep(5)

    # 3. Download and save the report
    print("\n[*] Downloading comprehensive evaluation report...")
    try:
        report_resp = requests.get(f"{EVAL_URL}/report/{run_id}")
        report_resp.raise_for_status()
        report_data = report_resp.json()
        
        output_file = "evaluation_report_llm_judge.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
            
        print(f"[+] Report successfully saved to: {output_file}")
    except Exception as e:
        print(f"[-] Failed to download report: {e}")

if __name__ == "__main__":
    main()
