from domain.conversation.models import ChatTurn


def format_history_for_agent(turns: list[ChatTurn]) -> str:
    lines: list[str] = []
    for turn in turns:
        if turn.user_message:
            lines.append(f"human: {turn.user_message}")
        if turn.assistant_message:
            lines.append(f"ai: {turn.assistant_message}")
        for idx, ref in enumerate(turn.refs, 1):
            if ref.question:
                lines.append(f"ref_qa[{idx}].question: {ref.question}")
            if ref.answer:
                lines.append(f"ref_qa[{idx}].answer: {ref.answer}")
    return "\n".join(lines)
