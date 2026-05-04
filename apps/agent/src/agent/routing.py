from schema.dto import State

def _route_by_ref_presence(state: State, no_ref_target: str, has_ref_target: str):
    if not state.ref_qa.ref_qa:
        return no_ref_target

    return has_ref_target

def route_after_vector_search(state: State):
    return _route_by_ref_presence(
        state,
        "build_answer_without_ref_prompt_node",
        "select_ref_node",
    )
    
def route_after_select_ref(state: State):
    return _route_by_ref_presence(
        state,
        "build_answer_without_ref_prompt_node",
        "build_answer_with_ref_prompt_node",
    )

def route_after_vector_search_simple(state: State):
    return _route_by_ref_presence(
        state,
        "build_answer_without_ref_prompt_node",
        "build_simple_answer_prompt_node",
    )

def route_after_ref_input(state: State):
    return _route_by_ref_presence(
        state,
        "build_answer_without_ref_prompt_node",
        "select_ref_node",
    )
