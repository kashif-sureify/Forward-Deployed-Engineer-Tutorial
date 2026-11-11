"""The chat transcript, and streaming a new reply live."""

from __future__ import annotations

from typing import Any

import streamlit as st

from core.agent import record_step, run_agent
from core.search import SEARCH_TOOL_NAME
from core.weather import WEATHER_TOOL_NAME
from ui.components import (
    BOT_AVATAR, USER_AVATAR, describe_call, describe_result, render_sources, render_step,
    render_weather_card, search_results, steps_label,
)


def render_answer(answer: str, steps: list[dict[str, Any]]) -> None:
    """Final answer text, then weather cards, then web sources."""
    st.markdown(answer.replace("$", r"\$"))  # stop "$5 … $10" turning into LaTeX

    for step in steps:
        if step["name"] == WEATHER_TOOL_NAME and step.get("artifact"):
            render_weather_card(step["artifact"])

    sources = [r for step in steps if step["name"] == SEARCH_TOOL_NAME for r in search_results(step)]
    if sources:
        render_sources(sources)


def render_history() -> None:
    for message in st.session_state.history:
        if message["role"] == "user":
            with st.chat_message("user", avatar=USER_AVATAR):
                st.markdown(message["content"])
        else:
            with st.chat_message("assistant", avatar=BOT_AVATAR):
                if steps := message.get("steps"):
                    with st.expander(f"✅ {steps_label(steps)}"):
                        for step in steps:
                            render_step(step)
                render_answer(message["content"], message.get("steps", []))


def respond(agent, prompt: str) -> None:
    """Show the user's message, stream the agent's work live, then store the turn."""
    st.session_state.history.append({"role": "user", "content": prompt})
    with st.chat_message("user", avatar=USER_AVATAR):
        st.markdown(prompt)

    with st.chat_message("assistant", avatar=BOT_AVATAR):
        status_slot = st.empty()
        status = status_slot.status("🤔 Thinking…", expanded=True)
        steps: dict[str, dict[str, Any]] = {}
        answer = ""

        try:
            for event in run_agent(agent, prompt, st.session_state.thread_id):
                if event["type"] == "tool_call":
                    record_step(steps, event)
                    status.update(label=describe_call(event["name"], event["args"]).replace("**", "") + "…")
                    with status:
                        st.markdown(describe_call(event["name"], event["args"]))
                elif event["type"] == "tool_result":
                    step = record_step(steps, event)
                    with status:
                        st.caption(describe_result(step))
                    status.update(label="🤔 Thinking…")
                elif event["type"] == "answer":
                    answer = event["text"] or "_(The model returned an empty answer.)_"
        except Exception as exc:  # show API / network errors in the chat instead of crashing
            status.update(label="Something went wrong", state="error", expanded=False)
            answer = f"⚠️ **Error:** {exc}"
        else:
            if steps:
                status.update(label=f"✅ {steps_label(list(steps.values()))}", state="complete", expanded=False)
            else:
                status_slot.empty()

        render_answer(answer, list(steps.values()))

    st.session_state.history.append(
        {"role": "assistant", "content": answer, "steps": list(steps.values())}
    )
