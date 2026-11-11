"""The sidebar: new chat, memory info, tools, model, appearance."""

from __future__ import annotations

import streamlit as st

from ui import session, theme
from ui.components import TOOL_DISPLAY, section_label


def render_thread_info(slot) -> None:
    turns = session.question_count()
    slot.markdown(f"Thread `{st.session_state.thread_id[:8]}` · {turns} question{'s' if turns != 1 else ''}")


def render_sidebar(model_name: str):
    """Draw the sidebar. Returns the slot for the thread info so it can be refreshed after a reply."""
    with st.sidebar:
        st.markdown('<div class="mini-title">🌦️ Agent</div>', unsafe_allow_html=True)
        st.button("✨ New chat", key="new-chat", type="primary", width="stretch", on_click=session.new_chat)

        section_label("🧠 Memory")
        thread_slot = st.empty()
        render_thread_info(thread_slot)
        st.caption("Everything in this thread is remembered, even if you reload the page. "
                   "**New chat** starts a fresh thread. Memory lives in the server process "
                   "and resets when the app restarts.")

        section_label("🧰 Tools")
        for name, (icon, label, provider) in TOOL_DISPLAY.items():
            st.markdown(f"{icon} **{label}**  \n<span class='muted'>{provider} · <code>{name}</code></span>",
                        unsafe_allow_html=True)

        section_label("⚙️ Model")
        st.markdown(f"`{model_name}`")

        section_label("🎨 Appearance")
        theme.render_theme_picker()
    return thread_slot
