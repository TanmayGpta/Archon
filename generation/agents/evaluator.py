import os
from langchain_core.prompts import ChatPromptTemplate
from generation.llm import get_llm
from generation.state import GenerationState

def evaluator_node(state: GenerationState) -> GenerationState:
    llm = get_llm()
    
    # Check iterations to prevent infinite loops
    current_iterations = state.get("iterations", 0)
    state["iterations"] = current_iterations + 1
    
    if current_iterations >= 3:
        state["feedback"] = "APPROVED"
        print("Evaluator forced approval due to max iterations.")
        return state

    evaluator_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert Software Architecture Reviewer. Your job is to review an architecture design against the provided requirements. Review the PlantUML diagram and the Ruleset structure. Check for logical inconsistencies (like circular dependencies) or unfulfilled requirements. If the architecture is robust and correct, output exactly 'APPROVED'. Otherwise, provide detailed feedback on what needs to be fixed. Do not output anything else if you approve it."),
        ("user", "Requirements:\n{requirements}\n\nPlantUML:\n{plantuml}\n\nRuleset:\n{ruleset}\n\nPlease review.")
    ])
    
    eval_chain = evaluator_prompt | llm
    
    response = eval_chain.invoke({
        "requirements": state.get("extracted_requirements", ""),
        "plantuml": state.get("plantuml_diagram", ""),
        "ruleset": str(state.get("ruleset", "None"))
    })
    
    feedback = response.content.strip()
    
    # If the LLM says anything containing "APPROVED" (case-insensitive) near the start, consider it approved
    if feedback.upper().startswith("APPROVED"):
        state["feedback"] = "APPROVED"
    else:
        state["feedback"] = feedback
        
    return state
