"""Per-browser-tab state: which chat thread we're in, its transcript, queued prompts."""

from __future__ import annotations

import re
import uuid

import streamlit as st

from core.agent import load_history
from ui.components import PENDING_PROMPT_KEY

THREAD_ID_PATTERN = re.compile(r"^[0-9a-f]{8,32}$")


def init_session(agent) -> None:
    """Pick the chat thread (from the URL if present) and load its transcript."""
    if "thread_id" not in st.session_state:
        from_url = st.query_params.get("thread", "")
        st.session_state.thread_id = from_url if THREAD_ID_PATTERN.match(from_url) else uuid.uuid4().hex
    st.query_params["thread"] = st.session_state.thread_id  # keeps the chat across reloads
    if "history" not in st.session_state:
        st.session_state.history = load_history(agent, st.session_state.thread_id)


def new_chat() -> None:
    st.session_state.thread_id = uuid.uuid4().hex
    st.session_state.history = []


def take_pending_prompt() -> str | None:
    """A prompt queued by an example button, if any (consumed once)."""
    return st.session_state.pop(PENDING_PROMPT_KEY, None)


def question_count() -> int:
    return sum(1 for m in st.session_state.history if m["role"] == "user")
