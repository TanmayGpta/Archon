import os
import re
from dataclasses import dataclass
from typing import List

@dataclass
class PRDSections:
    introduction: str = ""
    goals: str = ""
    features: str = ""
    constraints: str = ""
    non_functional: str = ""
    architecture: str = ""

@dataclass
class ProjectData:
    project_name: str
    prd_sections: PRDSections
    ground_truth_puml: str

class DataLoader:
    def __init__(self, dataset_dir: str):
        """
        Initialize DataLoader
        :param dataset_dir: Root directory path containing project folders
        """
        self.dataset_dir = dataset_dir

    def _parse_prd(self, prd_content: str) -> PRDSections:
        """
        Parse PRD text and split it into 6 core sections based on English headings.
        Uses regex to match titles (supports Markdown headers #, ##, ###).
        """
        sections = PRDSections()
        
        # Define regex patterns for matching each section title according to the new PRD structure
        patterns = {
            'introduction': r'(?i)^#+\s*Introduction.*?$',
            'goals': r'(?i)^#+\s*Goals.*?$',
            'features': r'(?i)^#+\s*Features and Functionalities.*?$',
            'constraints': r'(?i)^#+\s*Technical Constraints.*?$',
            'non_functional': r'(?i)^#+\s*Non-Functional Requirements.*?$',
            'architecture': r'(?i)^#+\s*System Architecture Description.*?$'
        }

        # Record the starting position of each title in the text
        positions = []
        for key, pattern in patterns.items():
            match = re.search(pattern, prd_content, re.MULTILINE)
            if match:
                positions.append((match.start(), key, match.group()))
        
        # Sort by their appearance order in the text
        positions.sort(key=lambda x: x[0])

        # Extract the content between two titles as the body of that section
        for i in range(len(positions)):
            start_idx = positions[i][0]
            key = positions[i][1]
            title = positions[i][2]
            
            # If it's the last title, extract to the end of the text; otherwise, to the start of the next title
            end_idx = positions[i+1][0] if i + 1 < len(positions) else len(prd_content)
            
            # Extract content, remove the title itself, and strip extra whitespaces
            content = prd_content[start_idx:end_idx].replace(title, '', 1).strip()
            setattr(sections, key, content)

        return sections

    def load_dataset(self) -> List[ProjectData]:
        """
        Traverse the directory and load data for all projects
        """
        dataset = []
        if not os.path.exists(self.dataset_dir):
            raise FileNotFoundError(f"Directory {self.dataset_dir} does not exist, please check the path.")

        for project_name in sorted(os.listdir(self.dataset_dir)):
            project_path = os.path.join(self.dataset_dir, project_name)
            
            if not os.path.isdir(project_path):
                continue
                
            prd_file_name = project_name + '_E.md'
            prd_path = os.path.join(project_path, prd_file_name)
            print(prd_path)
            puml_path = os.path.join(project_path, 'AD', 'ad.wsd')
            print(puml_path)
            
            if not os.path.exists(prd_path) or not os.path.exists(puml_path):
                print(f"[Warning] Project {project_name} is missing prd.md or ground_truth.puml, skipped.")
                continue

            # Read file content
            with open(prd_path, 'r', encoding='utf-8') as f:
                prd_content = f.read()
            with open(puml_path, 'r', encoding='utf-8') as f:
                puml_content = f.read()

            # Parse into objects
            prd_sections = self._parse_prd(prd_content)
            project_data = ProjectData(
                project_name=project_name,
                prd_sections=prd_sections,
                ground_truth_puml=puml_content
            )
            dataset.append(project_data)
            
        print(f"[Success] Successfully loaded data for {len(dataset)} projects.")
        return dataset

    def get_prompt_text(self, prd_sections: PRDSections, setting: str = "Full") -> str:
        """
        Assemble the PRD text to be fed to the LLM based on RQ2 ablation study settings.
        :param setting: "Full", "-Arch", or "Min"
        """
        parts = []
        
        if setting == "Setting_Full":
            parts = [
                f"## System Introduction\n{prd_sections.introduction}",
                f"## Core Objectives\n{prd_sections.goals}",
                f"## Functional Features\n{prd_sections.features}",
                f"## Technical Constraints\n{prd_sections.constraints}",
                f"## Non-Functional Requirements\n{prd_sections.non_functional}",
                f"## System Architecture Description\n{prd_sections.architecture}"
            ]
        elif setting == "-Arch":
            # Remove the architecture design section, forcing the model to infer architecture from functional and non-functional requirements
            parts = [
                f"## System Introduction\n{prd_sections.introduction}",
                f"## Core Objectives\n{prd_sections.goals}",
                f"## Functional Features\n{prd_sections.features}",
                f"## Technical Constraints\n{prd_sections.constraints}",
                f"## Non-Functional Requirements\n{prd_sections.non_functional}"
            ]
        elif setting == "Min":
            # Under extreme information deficiency, keep only core objectives and functional features
            parts = [
                f"## Core Objectives\n{prd_sections.goals}",
                f"## Functional Features\n{prd_sections.features}"
            ]
        else:
            raise ValueError("Unsupported setting type, please use 'Full', '-Arch', or 'Min'")
            
        return "\n\n".join(filter(lambda x: x.strip() != "", parts))

# ================= Test Code =================
if __name__ == "__main__":
    # Assume your data is stored in the 'dataset' folder in the current directory
    loader = DataLoader(dataset_dir="/home/user/PRD_benchmark/JAVA")
    
    try:
        projects = loader.load_dataset()
        if projects:
            sample_project = projects[0]
            print(f"\n--- Testing Project: {sample_project.project_name} ---")
            
            # Test assembling Setting Min for RQ2
            min_prd_text = loader.get_prompt_text(sample_project.prd_sections, setting="Min")
            print(f"\n[Setting Min Assembly Result Example]:\n{min_prd_text[:200]}...\n")
            
    except FileNotFoundError as e:
        print(e)