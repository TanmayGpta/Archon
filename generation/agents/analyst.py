import os
from langchain_core.prompts import ChatPromptTemplate
from generation.llm import get_llm
from generation.state import GenerationState

def analyst_node(state: GenerationState) -> GenerationState:
    llm = get_llm()
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert Software Requirements Analyst. Your job is to parse a Software Requirements Specification (SRS) and extract Functional Requirements (FRs), Non-Functional Requirements (NFRs), and Architecturally Significant Requirements (ASRs). Output them in a clear structured markdown format."),
        ("user", "Here is the SRS:\n\n{srs_content}\n\nPlease extract the requirements.")
    ])
    
    chain = prompt | llm
    
    response = chain.invoke({"srs_content": state["srs_content"]})
    
    # Update state
    state["extracted_requirements"] = response.content
    state["iterations"] = state.get("iterations", 0)
    
    return state
