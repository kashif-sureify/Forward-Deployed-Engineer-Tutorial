"""Shared fixtures: sample API payloads and a scripted stand-in for the agent."""

from __future__ import annotations

import copy
import itertools
import json
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace

import pytest
import streamlit as st
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from streamlit.testing.v1 import AppTest

from core import agent as core_agent
from core import config as core_config
from core.search import SEARCH_TOOL_NAME
from core.weather import WEATHER_TOOL_NAME, format_weather, parse_weather

APP_FILE = str(Path(__file__).resolve().parent.parent / "main.py")

# Trimmed real Weatherstack response
WEATHERSTACK_RESPONSE = {
    "location": {"name": "Islamabad", "country": "Pakistan", "region": "Islamabad",
                 "localtime": "2026-11-11 20:30"},
    "current": {
        "temperature": 19, "feelslike": 18, "humidity": 53, "uv_index": 0,
        "wind_speed": 5, "wind_dir": "WNW", "is_day": "no",
        "weather_descriptions": ["Smoky haze"],
        "air_quality": {"pm2_5": "92.4", "pm10": "105", "us-epa-index": "4"},
    },
}

# Trimmed real TavilySearch output (it arrives as a JSON string)
SEARCH_RESPONSE = {
    "query": "latest LangChain news",
    "results": [
        {"title": "LangChain <1.0> release", "url": "https://blog.langchain.com/v1", "content": "…", "score": 0.9},
        {"title": "Duplicate", "url": "https://blog.langchain.com/v1", "content": "…", "score": 0.8},
        {"title": "Not a web link", "url": "javascript:alert(1)", "content": "…", "score": 0.1},
    ],
}


@pytest.fixture
def weatherstack_response():
    return copy.deepcopy(WEATHERSTACK_RESPONSE)


class FakeAgent:
    """Stands in for the LangGraph agent: scripted replies plus per-thread memory.

    Implements just what the app uses: ``stream(..., stream_mode="updates")`` and
    ``get_state(config).values["messages"]``.
    """

    def __init__(self, error: Exception | None = None):
        self.error = error
        self.threads: dict[str, list] = defaultdict(list)
        self._ids = itertools.count(1)

    def stream(self, inputs, config, stream_mode):
        assert stream_mode == "updates"
        thread = self.threads[config["configurable"]["thread_id"]]
        prompt = inputs["messages"][0]["content"]
        thread.append(HumanMessage(prompt))
        if self.error:
            raise self.error
        for node, messages in self._script(prompt):
            thread.extend(messages)
            yield {node: {"messages": messages}}
        yield {"some_middleware": None}  # non-dict node outputs must be ignored

    def get_state(self, config):
        return SimpleNamespace(values={"messages": list(self.threads[config["configurable"]["thread_id"]])})

    def _script(self, prompt: str):
        call_id = f"call-{next(self._ids)}"
        if "weather" in prompt.lower():
            weather = parse_weather(copy.deepcopy(WEATHERSTACK_RESPONSE))
            yield "model", [AIMessage("", tool_calls=[
                {"id": call_id, "name": WEATHER_TOOL_NAME, "args": {"city": "Islamabad, Pakistan"}}])]
            yield "tools", [ToolMessage(format_weather(weather), artifact=weather,
                                        name=WEATHER_TOOL_NAME, tool_call_id=call_id)]
            yield "model", [AIMessage("Islamabad is hazy and the air is unhealthy.")]
        elif "news" in prompt.lower():
            yield "model", [AIMessage("", tool_calls=[
                {"id": call_id, "name": SEARCH_TOOL_NAME, "args": {"query": "latest LangChain news"}}])]
            yield "tools", [ToolMessage(json.dumps(SEARCH_RESPONSE), name=SEARCH_TOOL_NAME, tool_call_id=call_id)]
            yield "model", [AIMessage("LangChain shipped v1.")]
        else:
            yield "model", [AIMessage(f"You said: {prompt}")]


@pytest.fixture
def fake_agent(monkeypatch):
    """Swap the real agent (and .env loading) for a FakeAgent inside the app."""
    agent = FakeAgent()
    fake_config = {"GEMINI_API_KEY": "x", "GEMINI_MODEL": "fake-model", "TAVILY_API_KEY": "x", "WEATHER_API_KEY": "x"}
    monkeypatch.setattr(core_config, "load_config", lambda *a, **k: fake_config)
    monkeypatch.setattr(core_agent, "build_agent", lambda *a, **k: agent)
    st.cache_resource.clear()  # main.get_agent is cached across tests
    yield agent
    st.cache_resource.clear()


@pytest.fixture
def app(fake_agent) -> AppTest:
    return AppTest.from_file(APP_FILE, default_timeout=30).run()
