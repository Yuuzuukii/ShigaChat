"""
Incremental conversation summarizer for thread context.
Generates rolling summaries in English for internal use in RAG prompts.
"""

from __future__ import annotations

import os
from typing import Optional

from openai import OpenAI

from database_utils import get_db_cursor, get_placeholder

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _summarize_call(prompt: str) -> str:
    model = os.getenv("LLM_MODEL", "gpt-5-nano")
    resp = client.responses.create(
        model=model,
        input=prompt,
        reasoning={"effort": "minimal"},
    )
    return (resp.output_text or "").strip()


def create_initial_summary(question: str, answer: str) -> str:
    prompt = (
        "Summarize the following conversation exchange in English in 2-3 concise sentences. "
        "Capture the user's intent and the key facts from the answer.\n\n"
        f"User: {question}\n"
        f"Assistant: {answer}"
    )
    return _summarize_call(prompt)


def update_summary(existing_summary: str, question: str, answer: str) -> str:
    prompt = (
        "Below is a running summary of a conversation, followed by the latest exchange. "
        "Update the summary in English in 2-4 concise sentences to incorporate the new information. "
        "Drop details that are no longer relevant and keep the summary focused.\n\n"
        f"Current summary:\n{existing_summary}\n\n"
        f"New exchange:\n"
        f"User: {question}\n"
        f"Assistant: {answer}"
    )
    return _summarize_call(prompt)


def save_thread_summary(thread_id: int, question: str, answer: str) -> None:
    """Load existing summary, update incrementally, and save back to threads table."""
    ph = get_placeholder()
    try:
        with get_db_cursor() as (cursor, conn):
            cursor.execute(
                f"SELECT summary FROM threads WHERE id = {ph}",
                (thread_id,),
            )
            row = cursor.fetchone()
            existing = row.get("summary") if row else None

        if existing:
            new_summary = update_summary(existing, question, answer)
        else:
            new_summary = create_initial_summary(question, answer)

        with get_db_cursor() as (cursor, conn):
            cursor.execute(
                f"UPDATE threads SET summary = {ph} WHERE id = {ph}",
                (new_summary, thread_id),
            )
            conn.commit()
    except Exception as e:
        print(f"[WARN] Summary generation failed for thread {thread_id}: {e}")
