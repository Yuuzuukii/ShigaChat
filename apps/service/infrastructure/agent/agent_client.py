from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from typing import Optional, Tuple

import httpx


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
    try:
        return event_name, json.loads("\n".join(data_lines)) if data_lines else {}
    except json.JSONDecodeError:
        return event_name, {}


class AgentClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or os.getenv("AGENT_API_BASE_URL", "http://agent:8001")

    async def generate(self, question: str, thread_id: int, chat_history_text: str) -> dict:
        answer_parts: list[str] = []
        final_payload: dict = {}
        async for event_name, payload in self.stream(question, thread_id, chat_history_text):
            if event_name == "token":
                answer_parts.append(payload.get("content", ""))
            elif event_name == "end":
                final_payload = payload
        return {
            "answer": final_payload.get("answer", "".join(answer_parts).strip()),
            "ref_qa": final_payload.get("ref_qa", []),
        }

    async def stream(self, question: str, thread_id: int, chat_history_text: str) -> AsyncIterator[tuple[str, dict]]:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/stream",
                json={
                    "question": question,
                    "thread_id": thread_id,
                    "chat_history_text": chat_history_text,
                },
            ) as response:
                response.raise_for_status()
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        raw_event, buffer = buffer.split("\n\n", 1)
                        event_name, payload = _parse_sse_chunk(raw_event)
                        if event_name:
                            yield event_name, payload
