import os
from langchain_core.prompts import ChatPromptTemplate
from generation.llm import get_llm
from generation.state import GenerationState
from shared.schema import ArchitectureRuleset

def architect_node(state: GenerationState) -> GenerationState:
    llm = get_llm()
    
    # Generate PlantUML diagram
    plantuml_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert Software Architect. Given the extracted requirements and any past feedback, design a layered software architecture. Output ONLY a valid PlantUML component diagram code block (without any markdown formatting outside of the ```plantuml ... ``` block if possible)."),
        ("user", "Requirements:\n{requirements}\n\nFeedback:\n{feedback}\n\nPlease generate the PlantUML diagram.")
    ])
    
    plantuml_chain = plantuml_prompt | llm
    plantuml_response = plantuml_chain.invoke({
        "requirements": state.get("extracted_requirements", ""),
        "feedback": state.get("feedback", "No feedback yet.")
    })
    
    state["plantuml_diagram"] = plantuml_response.content
    
    # Generate structured Ruleset
    ruleset_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert Software Architect. Given the extracted requirements, the PlantUML architecture you just created, and any past feedback, define the strict architectural layer ruleset. Output it according to the requested schema."),
        ("user", "Requirements:\n{requirements}\n\nPlantUML:\n{plantuml}\n\nFeedback:\n{feedback}\n\nPlease generate the ruleset.")
    ])
    
    structured_llm = llm.with_structured_output(ArchitectureRuleset)
    ruleset_chain = ruleset_prompt | structured_llm
    
    try:
        ruleset_response = ruleset_chain.invoke({
            "requirements": state.get("extracted_requirements", ""),
            "plantuml": state["plantuml_diagram"],
            "feedback": state.get("feedback", "No feedback yet.")
        })
        state["ruleset"] = ruleset_response
    except Exception as e:
        print(f"Warning: Failed to parse structured output for Ruleset: {e}")
        # In a real system, we might add a fallback or retry loop here.
        state["ruleset"] = None
        
    return state
