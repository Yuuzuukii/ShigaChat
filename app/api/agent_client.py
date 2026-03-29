import os
import json
from typing import Optional, Tuple

import httpx

AGENT_API_BASE_URL = os.getenv("AGENT_API_BASE_URL", "http://agent:8001")


def _parse_sse_chunk(raw_event: str) -> Tuple[Optional[str], dict]:
    event_name = None
    data_lines: list[str] = []
    for line in raw_event.splitlines():
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())

    if not event_name:
        return None, {}

    payload = {}
    if data_lines:
        try:
            payload = json.loads("\n".join(data_lines))
        except Exception:
            payload = {}
    return event_name, payload


async def generate_answer_via_agent(
    question_text: str,
    thread_id: int,
    chat_history: list[list[str]],
) -> dict:
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{AGENT_API_BASE_URL}/chat/stream",
            json={
                "question": question_text,
                "thread_id": thread_id,
                "chat_history": chat_history,
            },
        ) as response:
            response.raise_for_status()
            buffer = ""
            answer_parts: list[str] = []
            final_payload: dict = {}

            async for chunk in response.aiter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    raw_event, buffer = buffer.split("\n\n", 1)
                    event_name, payload = _parse_sse_chunk(raw_event)
                    if event_name == "token":
                        token = payload.get("content", "")
                        if token:
                            answer_parts.append(token)
                    elif event_name == "end":
                        final_payload = payload

            return {
                "answer": final_payload.get("answer", "".join(answer_parts).strip()),
                "ref_qa": final_payload.get("ref_qa", []),
            }
