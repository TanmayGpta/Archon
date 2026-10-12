import os
import json
import argparse
from data_loader import DataLoader
from generator import ArchitectureGenerator
from uml_parser import UMLParser
from llm_judge import LLMJudge
from arch_scorer import ArchScorer
from metrics_calculator import MetricsCalculator

def run_pipeline(dataset_dir, setting, judge_model_name, generate_model_name):
    API_KEY = ""
    BASE_URL = ""
    
    loader = DataLoader(dataset_dir=dataset_dir)
    generator = ArchitectureGenerator(api_key=API_KEY, base_url=BASE_URL, model_name=generate_model_name)
    parser = UMLParser()
    judge = LLMJudge(api_key=API_KEY, base_url=BASE_URL, model_name=judge_model_name)
    scorer = ArchScorer(api_key=API_KEY, base_url=BASE_URL, model_name=judge_model_name)
    calculator = MetricsCalculator()
    
    projects = loader.load_dataset()
    if not projects:
        print("no dataset ")
        return

    print(f"Starting end-to-end Benchmark evaluation (total of {len(projects)} projects)...")
    
    for project in projects:
        print(f"\n{'='*40}")
        print(f"Processing project: {project.project_name}")

        folder_name = "outputs_" + generate_model_name
        output_dir = os.path.join("outputs", folder_name, setting, project.project_name)
        print(output_dir)
        puml_filename = os.path.join(output_dir, 'predicted.puml')
        judge_output_file = os.path.join(output_dir, 'judge_alignment_o3.json')
        scorer_output_file = os.path.join(output_dir, 'arch_score.json')
        
        if os.path.exists(puml_filename):
            print(f"[Skipping generation] Detected that {puml_filename} already exists, reading local file...")
            with open(puml_filename, 'r', encoding='utf-8') as f:
                predicted_puml = f.read()
        else:
            full_prd_text = loader.get_prompt_text(project.prd_sections, setting=setting)
            predicted_puml = generator.generate_architecture(
                prd_text=full_prd_text, project_name=project.project_name, setting_name=setting, output_base_dir=output_dir
            )

        if not predicted_puml:
            print(f"[Failed] Unable to obtain the prediction diagram for project {project.project_name}.")
            continue

        gt_parsed = parser.parse(project.ground_truth_puml)
        pred_parsed = parser.parse(predicted_puml)
        
        print(f"-> Parsing completed: GT node count={len(gt_parsed['nodes'])}, Pred node count={len(pred_parsed['nodes'])}")

        if os.path.exists(judge_output_file):
             print(f"[Skipping alignment] Detected that {judge_output_file} already exists, reading local judgment data...")
             with open(judge_output_file, 'r', encoding='utf-8') as f:
                 alignment_result = json.load(f)
        else:
            prd_summary = f"{project.prd_sections.introduction}\n{project.prd_sections.goals}"
            alignment_result = judge.evaluate_alignment(
                prd_summary=prd_summary, gt_nodes=gt_parsed['leafnodes'], predicted_nodes=pred_parsed['leafnodes']
            )
            with open(judge_output_file, 'w', encoding='utf-8') as f:
                json.dump(alignment_result, f, indent=2, ensure_ascii=False)
            print(f"[Success] Node alignment results have been saved, successfully matched {len(alignment_result.get('matched_pairs', []))} pairs of nodes.")

        with open(judge_output_file, 'w', encoding='utf-8') as f:
            json.dump(alignment_result, f, indent=2, ensure_ascii=False)
        print(f"[Success] Node alignment results have been saved, successfully matched {len(alignment_result.get('matched_pairs', []))} pairs of nodes.")

        calculator.evaluate_project( 
            project_name=project.project_name,
            gt_parsed=gt_parsed,
            pred_parsed=pred_parsed,
            alignment_data=alignment_result
        )

        if os.path.exists(scorer_output_file):
            print(f"[Skipping scoring] Detected that {scorer_output_file} already exists, reading local scoring data...")
            with open(scorer_output_file, 'r', encoding='utf-8') as f:
                score_result = json.load(f)
        else:
            full_prd_text = loader.get_prompt_text(project.prd_sections, setting=setting)
            score_result = scorer.score(prd_text=full_prd_text, predicted_puml=predicted_puml)
            os.makedirs(output_dir, exist_ok=True)
            with open(scorer_output_file, 'w', encoding='utf-8') as f:
                json.dump(score_result, f, indent=2, ensure_ascii=False)

        dim_scores = ArchScorer.extract_scores(score_result)
        calculator.add_scores(project.project_name, dim_scores)
        print(f"-> [Scoring] {dim_scores}")

    output_csv = f"benchmark_results_{setting}.csv"
    calculator.export_to_csv(output_csv)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--setting', type=str, default='Full')
    parser.add_argument('--generate_model', type=str, default='gemini-2.5-pro')
    parser.add_argument('--judge_model', type=str, default='o3')
    parser.add_argument('--dataset_dir', type=str, default='/home/user/PRD_benchmark/JAVA')
    args = parser.parse_args()
    run_pipeline(dataset_dir=args.dataset_dir, setting=args.setting, judge_model_name=args.judge_model, generate_model_name=args.generate_model)