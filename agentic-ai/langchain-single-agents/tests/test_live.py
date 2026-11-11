"""Live smoke tests against the real APIs. Skipped unless RUN_LIVE_TESTS=1.

    RUN_LIVE_TESTS=1 pytest -m live
"""

from __future__ import annotations

import os
import uuid

import pytest

from core import agent as core_agent
from core import config as core_config
from core.search import SEARCH_TOOL_NAME
from core.weather import WEATHER_TOOL_NAME

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.environ.get("RUN_LIVE_TESTS") != "1", reason="set RUN_LIVE_TESTS=1 to call real APIs"),
]


@pytest.fixture(scope="module")
def live_agent():
    return core_agent.build_agent(core_config.load_config())


def ask(agent, prompt: str, thread: str) -> list[dict]:
    return list(core_agent.run_agent(agent, prompt, thread))


def answer_of(events: list[dict]) -> str:
    return next(e["text"] for e in reversed(events) if e["type"] == "answer")


def test_weather_aqi_and_memory(live_agent):
    thread = uuid.uuid4().hex
    events = ask(live_agent, "Find the capital of Pakistan and then find its current weather and AQI.", thread)
    weather = [e for e in events if e["type"] == "tool_result" and e["name"] == WEATHER_TOOL_NAME]
    assert weather and weather[0]["artifact"], events
    assert weather[0]["artifact"]["city"] == "Islamabad"
    assert weather[0]["artifact"]["aqi"]["label"]

    follow_up = ask(live_agent, "Whatever I asked earlier give me the answer.", thread)
    assert "islamabad" in answer_of(follow_up).lower()
    assert len(core_agent.load_history(live_agent, thread)) == 4


def test_ambiguous_city_resolves_with_country(live_agent):
    events = ask(live_agent, "What's the AQI in Delhi right now?", uuid.uuid4().hex)
    weather = [e for e in events if e["type"] == "tool_result" and e["name"] == WEATHER_TOOL_NAME]
    assert weather and weather[0]["artifact"]["country"] == "India"


def test_web_search_returns_sources(live_agent):
    events = ask(live_agent, "Search the web for the latest LangChain news.", uuid.uuid4().hex)
    searches = [e for e in events if e["type"] == "tool_result" and e["name"] == SEARCH_TOOL_NAME]
    assert searches, events
    assert searches[0]["artifact"]["results"][0]["url"].startswith("http")
