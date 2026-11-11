"""Visual building blocks. The *_html / describe_* helpers are pure functions
(easy to unit-test); the render_* functions draw with Streamlit."""

from __future__ import annotations

import html
from typing import Any
from urllib.parse import urlparse

import streamlit as st

from core.search import SEARCH_TOOL_NAME
from core.weather import WEATHER_TOOL_NAME
from ui.styles import AQI_COLORS, UNKNOWN_AQI_COLOR

APP_TITLE = "Weather & Research Agent"
USER_AVATAR = "🧑‍💻"
BOT_AVATAR = "🤖"

# How each tool is presented: name → (icon, label, provider)
TOOL_DISPLAY: dict[str, tuple[str, str, str]] = {
    SEARCH_TOOL_NAME: ("🔎", "Web search", "Tavily"),
    WEATHER_TOOL_NAME: ("🌤️", "Weather & air quality", "Weatherstack"),
}

# (button label, prompt that gets sent)
EXAMPLE_PROMPTS = [
    ("🇮🇳 Capital of India: weather & AQI",
     "Find the capital of India and then find its current weather and AQI."),
    ("🫁 Compare AQI: Delhi, Mumbai, Bengaluru",
     "Compare the air quality in Delhi, Mumbai and Bengaluru right now."),
    ("🏃 Good day for a run in London?",
     "Is it a good day for a run in London? Check the weather and AQI."),
    ("📰 Latest LangChain news",
     "What's the latest news about LangChain?"),
]

PENDING_PROMPT_KEY = "pending_prompt"


# ── Pure helpers ─────────────────────────────────────────────────────────────────

def esc(value: Any) -> str:
    """HTML-escape API data before putting it into raw HTML."""
    return html.escape(str(value if value is not None else "n/a"))


def weather_emoji(description: str, is_day: bool = True) -> str:
    """Pick an emoji for a weather description such as 'Patchy light rain'."""
    text = description.lower()
    rules = [
        (("thunder",), "⛈️"),
        (("snow", "sleet", "blizzard", "ice"), "🌨️"),
        (("rain", "drizzle", "shower"), "🌧️"),
        (("fog", "mist", "haze", "smoke"), "🌫️"),
        (("partly",), "⛅" if is_day else "☁️"),
        (("cloud", "overcast"), "☁️"),
        (("sun", "clear"), "☀️" if is_day else "🌙"),
    ]
    for keywords, emoji in rules:
        if any(word in text for word in keywords):
            return emoji
    return "🌡️"


# These builders return HTML without blank lines or indentation, so Markdown
# never mistakes part of it for a code block.

def aqi_html(aqi: dict[str, Any]) -> str:
    color = AQI_COLORS.get(aqi["index"], UNKNOWN_AQI_COLOR)
    segments = "".join(
        f'<span class="{"on" if level == aqi["index"] else ""}" style="background:{level_color}"></span>'
        for level, level_color in AQI_COLORS.items()
    )
    return (
        f'<div class="aqi" style="--aqi:{color}">'
        f'<div class="aqi-head"><span><b>AQI {esc(aqi["index"])}</b> · {esc(aqi["label"])}</span>'
        f'<span class="aqi-pm">PM2.5 <b>{esc(aqi["pm2_5"])}</b> · PM10 <b>{esc(aqi["pm10"])}</b> µg/m³</span></div>'
        f'<div class="aqi-scale">{segments}</div>'
        f'<div class="aqi-ends"><span>Good</span><span>Hazardous</span></div>'
        f"</div>"
    )


def weather_card_html(w: dict[str, Any]) -> str:
    place = ", ".join(p for p in (w.get("region"), w.get("country")) if p)
    local_time = (w.get("localtime") or "")[-5:]
    stats = [
        ("🌡️ Feels like", f"{esc(w['feels_like'])}°C"),
        ("💧 Humidity", f"{esc(w['humidity'])}%"),
        ("🍃 Wind", f"{esc(w['wind_speed'])} km/h {esc(w['wind_dir'] or '')}"),
        ("☀️ UV index", esc(w["uv_index"])),
    ]
    stats_html = "".join(f'<div class="wx-stat"><div class="k">{k}</div><div class="v">{v}</div></div>'
                         for k, v in stats)
    return (
        '<div class="wx">'
        '<div class="wx-head">'
        f'<div class="wx-emoji">{weather_emoji(w["description"], w.get("is_day", True))}</div>'
        f'<div><div class="wx-city">{esc(w["city"])}</div>'
        f'<div class="wx-sub">{esc(w["description"])} · {esc(place)} · 🕒 {esc(local_time)} local</div></div>'
        f'<div class="wx-temp">{esc(w["temperature"])}°C</div>'
        "</div>"
        f'<div class="wx-grid">{stats_html}</div>'
        f'{aqi_html(w["aqi"]) if w.get("aqi") else ""}'
        "</div>"
    )


def source_html(result: dict[str, Any]) -> str | None:
    """One 'Sources' line, or None if the URL isn't a plain http(s) link."""
    url = result.get("url", "")
    if not url.startswith(("http://", "https://")):
        return None
    domain = esc(urlparse(url).netloc.removeprefix("www."))
    return (f'<div class="src">🔗 <a href="{html.escape(url, quote=True)}" target="_blank">'
            f'{esc(result.get("title") or url)}</a><span class="src-domain">{domain}</span></div>')


def search_results(step: dict[str, Any]) -> list[dict[str, Any]]:
    """The result list of a search step (core puts it in the artifact as {'results': [...]})."""
    artifact = step.get("artifact")
    return artifact.get("results", []) if isinstance(artifact, dict) else []


def describe_call(name: str, args: dict[str, Any]) -> str:
    """Status line for a tool call, e.g. 'Checking weather in Islamabad'."""
    if name == WEATHER_TOOL_NAME:
        return f"🌤️ Checking weather in **{args.get('city', '?')}**"
    if name == SEARCH_TOOL_NAME:
        return f"🔎 Searching the web for *“{args.get('query', '?')}”*"
    return f"🛠️ Calling `{name}`"


def describe_result(step: dict[str, Any]) -> str:
    """One-line summary of a tool result."""
    artifact = step.get("artifact")
    if step["name"] == WEATHER_TOOL_NAME and artifact:
        aqi = artifact.get("aqi") or {}
        aqi_text = f", AQI {aqi['index']} ({aqi['label']})" if aqi else ""
        return f"✓ {artifact['temperature']}°C, {artifact['description']}{aqi_text}"
    if step["name"] == SEARCH_TOOL_NAME and (results := search_results(step)):
        return f"✓ Found {len(results)} result{'s' if len(results) != 1 else ''}"
    content = step.get("content") or "no output"
    failed = "could not" in content.lower() or "error" in content.lower()
    return f"{'⚠' if failed else '✓'} {content[:200]}"


def steps_label(steps: list[dict[str, Any]]) -> str:
    return f"Used {len(steps)} tool call{'s' if len(steps) != 1 else ''}"


# ── Streamlit renderers ──────────────────────────────────────────────────────────

def render_hero() -> None:
    st.markdown(
        f'<div class="hero"><div class="hero-title">🌦️ {APP_TITLE}</div>'
        '<div class="hero-sub">Ask me anything. I can search the web, check live weather '
        "and air quality for any city, and I remember our conversation.</div>"
        '<div class="chips"><span>🔎 Web search</span><span>🌤️ Live weather</span>'
        "<span>🫁 Air quality (AQI)</span><span>🧠 Memory</span></div></div>",
        unsafe_allow_html=True,
    )


def render_compact_title() -> None:
    st.markdown(f'<div class="mini-title">🌦️ {APP_TITLE}</div>', unsafe_allow_html=True)


def section_label(text: str) -> None:
    st.markdown(f'<div class="section-label">{text}</div>', unsafe_allow_html=True)


def queue_prompt(prompt: str) -> None:
    """Button callback: send an example prompt as if the user typed it."""
    st.session_state[PENDING_PROMPT_KEY] = prompt


def render_examples() -> None:
    section_label("Try asking")
    columns = st.columns(2)
    for i, (label, prompt) in enumerate(EXAMPLE_PROMPTS):
        columns[i % 2].button(label, key=f"example-{i}", help=prompt, width="stretch",
                              on_click=queue_prompt, args=(prompt,))


def render_weather_card(weather: dict[str, Any]) -> None:
    st.markdown(weather_card_html(weather), unsafe_allow_html=True)


def render_sources(results: list[dict[str, Any]]) -> None:
    lines, seen = [], set()
    for result in results:
        url = result.get("url")
        if url in seen or (line := source_html(result)) is None:
            continue
        seen.add(url)
        lines.append(line)
    if lines:
        section_label("Sources")
        for line in lines:
            st.markdown(line, unsafe_allow_html=True)


def render_step(step: dict[str, Any]) -> None:
    st.markdown(describe_call(step["name"], step.get("args", {})))
    if "content" in step:
        st.caption(describe_result(step))
