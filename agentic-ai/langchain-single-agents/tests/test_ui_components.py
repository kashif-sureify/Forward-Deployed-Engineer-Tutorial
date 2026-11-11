"""Unit tests for the pure helpers in ui/components.py and ui/theme.py."""

from __future__ import annotations

import pytest

from core.search import SEARCH_TOOL_NAME
from core.weather import WEATHER_TOOL_NAME, parse_weather
from ui import components, theme
from ui.styles import AQI_COLORS


def test_weather_card_html(weatherstack_response):
    card = components.weather_card_html(parse_weather(weatherstack_response))
    assert "Islamabad" in card and "19°C" in card and "🌫️" in card
    assert "\n\n" not in card  # a blank line would break Markdown's HTML block


def test_weather_card_escapes_api_text(weatherstack_response):
    weatherstack_response["location"]["name"] = "<script>alert(1)</script>"
    card = components.weather_card_html(parse_weather(weatherstack_response))
    assert "<script>" not in card
    assert "&lt;script&gt;" in card


def test_aqi_html_highlights_current_level():
    html = components.aqi_html({"index": "4", "label": "Unhealthy", "pm2_5": "92.4", "pm10": "105"})
    assert f"--aqi:{AQI_COLORS['4']}" in html
    assert html.count('class="on"') == 1
    assert f'class="on" style="background:{AQI_COLORS["4"]}"' in html


@pytest.mark.parametrize("description, is_day, emoji", [
    ("Moderate or heavy rain with thunder", True, "⛈️"),
    ("Patchy light drizzle", True, "🌧️"),
    ("Smoky haze", True, "🌫️"),
    ("Partly cloudy", True, "⛅"),
    ("Overcast", True, "☁️"),
    ("Clear", False, "🌙"),
    ("Sunny", True, "☀️"),
    ("Something new", True, "🌡️"),
])
def test_weather_emoji(description, is_day, emoji):
    assert components.weather_emoji(description, is_day) == emoji


def test_source_html_escapes_and_rejects_non_http():
    line = components.source_html({"title": "A <b>title</b>", "url": "https://www.example.com/x?a=1&b=2"})
    assert "A &lt;b&gt;title&lt;/b&gt;" in line
    assert 'href="https://www.example.com/x?a=1&amp;b=2"' in line
    assert "example.com" in line and "www." not in line.split("src-domain")[1]
    assert components.source_html({"title": "x", "url": "javascript:alert(1)"}) is None


def test_describe_call_and_result(weatherstack_response):
    weather = parse_weather(weatherstack_response)
    assert "Islamabad" in components.describe_call(WEATHER_TOOL_NAME, {"city": "Islamabad"})
    assert "LangChain" in components.describe_call(SEARCH_TOOL_NAME, {"query": "LangChain"})
    assert components.describe_result({"name": WEATHER_TOOL_NAME, "artifact": weather}) == \
        "✓ 19°C, Smoky haze, AQI 4 (Unhealthy)"
    assert components.describe_result({"name": SEARCH_TOOL_NAME, "artifact": {"results": [{}, {}]}}) == \
        "✓ Found 2 results"
    assert components.describe_result({"name": WEATHER_TOOL_NAME, "artifact": None,
                                       "content": "Could not fetch weather data"}).startswith("⚠")


def test_theme_script_sets_streamlit_theme_and_reloads():
    script = theme.theme_script("dark")
    assert 'setItem(key, "\\"Dark\\"")' in script  # Streamlit stores the JSON string "Dark"
    assert "stActiveTheme-" in script and "app.location.reload()" in script
    assert f"{theme.THEME_COOKIE}=dark" in script
