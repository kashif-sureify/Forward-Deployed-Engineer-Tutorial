"""Light / Dark / System theme switching.

Streamlit has no Python API for changing the theme. Its own ⋮ → Settings menu
stores the choice in the browser's localStorage and reads it on page load. So
we write that same setting and reload the page. The chat survives the reload
because the thread id is in the URL and the transcript is rebuilt from the
agent's memory (see ui/session.py).

Requires separate [theme.light] / [theme.dark] sections in .streamlit/config.toml.
A plain [theme] section locks the app into one custom theme.
"""

from __future__ import annotations

import json

import streamlit as st

THEME_MODES = {"light": "☀️ Light", "dark": "🌙 Dark", "system": "💻 System"}
THEME_COOKIE = "app_theme"  # remembers the choice so the picker shows it after a reload
_PENDING_KEY = "apply_theme"


def current_theme_mode() -> str:
    mode = st.context.cookies.get(THEME_COOKIE, "system")
    return mode if mode in THEME_MODES else "system"


def _on_change() -> None:
    st.session_state[_PENDING_KEY] = st.session_state.theme_mode


def theme_script(mode: str) -> str:
    """JavaScript (as an HTML page) that saves `mode` as Streamlit's theme and reloads."""
    stored_value = json.dumps(json.dumps(mode.capitalize()))  # JS literal for '"Dark"'
    return f"""<script>
    const app = window.parent;
    // Key format used by Streamlit {st.__version__}: stActiveTheme-<path>-v2
    const prefix = `stActiveTheme-${{app.location.pathname}}-v`;
    const keys = Object.keys(app.localStorage).filter(k => k.startsWith(prefix));
    for (const key of new Set([...keys, prefix + "2"])) app.localStorage.setItem(key, {stored_value});
    app.document.cookie = "{THEME_COOKIE}={mode}; path=/; max-age=31536000; SameSite=Lax";
    app.location.reload();
    </script>"""


def apply_pending_theme() -> None:
    """If the user just picked a theme, apply it (this reloads the page in the browser)."""
    if mode := st.session_state.pop(_PENDING_KEY, None):
        # st.iframe runs the HTML in a same-origin iframe, so the script can reach the
        # app page via window.parent. (st.html's JavaScript option didn't execute here.)
        st.iframe(theme_script(mode), height=1)


def render_theme_picker() -> None:
    st.segmented_control(
        "Theme", options=list(THEME_MODES), format_func=THEME_MODES.get,
        key="theme_mode", default=current_theme_mode(), required=True,
        label_visibility="collapsed", on_change=_on_change, width="stretch",
    )
