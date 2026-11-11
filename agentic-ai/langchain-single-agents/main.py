"""
Weather & Research Agent: Streamlit entry point.

    streamlit run main.py

The code is split in two:
    core/  the agent itself: config, tools, model, memory. No Streamlit,
           so it works from scripts, notebooks and tests too.
    ui/    everything Streamlit: styling, components, sidebar, theme, chat view.

This file only wires them together.
"""

from __future__ import annotations

import streamlit as st

from core import agent as core_agent
from core import config as core_config
from ui import chat, components, session, sidebar, styles, theme

# The UI shows every get_weather result as a card, so the model shouldn't repeat
# every number. It should summarise and add advice instead.
SYSTEM_PROMPT = core_agent.DEFAULT_SYSTEM_PROMPT + (
    " When you use get_weather, the user already sees a weather card with all the "
    "numbers, so summarise the conditions in one or two sentences and add useful "
    "advice (for example about the air quality)."
)


@st.cache_resource(show_spinner="Starting the agent…")
def get_agent():
    """One agent per server process. Each chat has its own thread_id in its memory.

    Returns (agent, model name).
    """
    config = core_config.load_config()
    return core_agent.build_agent(config, system_prompt=SYSTEM_PROMPT), config["GEMINI_MODEL"]


def main() -> None:
    st.set_page_config(page_title=components.APP_TITLE, page_icon="🌦️",
                       layout="centered", initial_sidebar_state="expanded")
    styles.inject_css()
    theme.apply_pending_theme()  # reloads the page if the user just picked a theme

    try:
        agent, model_name = get_agent()
    except RuntimeError as exc:
        st.error(f"**Configuration error:** {exc}")
        st.stop()

    session.init_session(agent)
    thread_slot = sidebar.render_sidebar(model_name)

    # The chat input is always pinned to the bottom, so reading it first is safe.
    # Knowing the prompt up front lets the header switch to compact mode right away.
    prompt = st.chat_input("Ask about the weather, air quality, or anything on the web…")
    prompt = prompt or session.take_pending_prompt()

    if st.session_state.history or prompt:
        components.render_compact_title()
        chat.render_history()
    else:
        components.render_hero()
        components.render_examples()

    if prompt:
        chat.respond(agent, prompt)
        sidebar.render_thread_info(thread_slot)  # refresh the question count


if __name__ == "__main__":
    main()
