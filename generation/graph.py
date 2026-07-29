from langgraph.graph import StateGraph, END
from generation.state import GenerationState
from generation.agents.analyst import analyst_node
from generation.agents.architect import architect_node
from generation.agents.evaluator import evaluator_node

def should_continue(state: GenerationState):
    """
    Decide whether to go back to the architect based on feedback, 
    or to end the graph.
    """
    feedback = state.get("feedback", "")
    if feedback == "APPROVED":
        return END
    return "architect"

def build_generation_graph():
    # Initialize the graph
    workflow = StateGraph(GenerationState)
    
    # Add nodes
    workflow.add_node("analyst", analyst_node)
    workflow.add_node("architect", architect_node)
    workflow.add_node("evaluator", evaluator_node)
    
    # Define edges
    # Start -> Analyst
    workflow.set_entry_point("analyst")
    
    # Analyst -> Architect
    workflow.add_edge("analyst", "architect")
    
    # Architect -> Evaluator
    workflow.add_edge("architect", "evaluator")
    
    # Evaluator -> Architect (if rejected) OR END (if approved)
    workflow.add_conditional_edges(
        "evaluator",
        should_continue,
        {
            "architect": "architect",
            END: END
        }
    )
    
    # Compile the graph
    return workflow.compile()
