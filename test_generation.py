import os
from generation.graph import build_generation_graph

def run_test():
    print("Building Graph...")
    app = build_generation_graph()
    
    # Path to one of the requirements datasets
    srs_path = os.path.join("generation", "MAAD", "Requirements dataset", "C2C.txt")
    
    print(f"Reading SRS from: {srs_path}")
    with open(srs_path, "r", encoding="utf-8") as f:
        srs_content = f.read()
        
    initial_state = {
        "srs_content": srs_content,
        "iterations": 0
    }
    
    print("Starting LangGraph Generation Pipeline...")
    
    final_state = None
    for output in app.stream(initial_state):
        # output is a dictionary of the outputs from each node
        for key, value in output.items():
            print(f"--- Finished Node: {key} ---")
            final_state = value
            
    print("\n\n====== FINAL ARCHITECTURE RULES ======\n")
    if final_state and final_state.get("ruleset"):
        print(final_state["ruleset"].model_dump_json(indent=2))
    else:
        print("No ruleset generated.")
        
    print("\n\n====== FINAL PLANTUML DIAGRAM ======\n")
    if final_state and final_state.get("plantuml_diagram"):
        print(final_state["plantuml_diagram"])
    else:
        print("No PlantUML diagram generated.")

if __name__ == "__main__":
    run_test()
