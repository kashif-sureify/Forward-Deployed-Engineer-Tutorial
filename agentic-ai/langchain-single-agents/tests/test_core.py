"""Offline tests for core/ (no API keys or network needed)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
import requests
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from core import agent as core_agent
from core import config as core_config
from core import weather as core_weather
from core.search import SEARCH_TOOL_NAME, make_search_tool, parse_search_results
from core.weather import WEATHER_TOOL_NAME

from tests.conftest import SEARCH_RESPONSE, FakeAgent


# ── config ──────────────────────────────────────────────────────────────────────

def test_load_config_reports_missing_keys(monkeypatch, tmp_path):
    for name in core_config.REQUIRED_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("GEMINI_MODEL", "m")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY, TAVILY_API_KEY, WEATHER_API_KEY"):
        core_config.load_config(tmp_path / "missing.env")


def test_load_config_reads_env_file(monkeypatch, tmp_path):
    for name in core_config.REQUIRED_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    env = tmp_path / ".env"
    env.write_text("GEMINI_API_KEY=g\nGEMINI_MODEL=m\nTAVILY_API_KEY=t\nWEATHER_API_KEY=w\n")
    assert core_config.load_config(env) == {
        "GEMINI_API_KEY": "g", "GEMINI_MODEL": "m", "TAVILY_API_KEY": "t", "WEATHER_API_KEY": "w"}


# ── weather ─────────────────────────────────────────────────────────────────────

def test_parse_weather(weatherstack_response):
    w = core_weather.parse_weather(weatherstack_response)
    assert (w["city"], w["country"], w["temperature"], w["description"]) == ("Islamabad", "Pakistan", 19, "Smoky haze")
    assert w["is_day"] is False
    assert w["aqi"] == {"index": "4", "label": "Unhealthy", "pm2_5": "92.4", "pm10": "105"}


def test_parse_weather_without_air_quality(weatherstack_response):
    del weatherstack_response["current"]["air_quality"]
    weatherstack_response["current"]["weather_descriptions"] = []
    w = core_weather.parse_weather(weatherstack_response)
    assert w["aqi"] is None
    assert w["description"] == "n/a"
    assert "Air Quality" not in core_weather.format_weather(w)


def test_format_weather_includes_aqi(weatherstack_response):
    text = core_weather.format_weather(core_weather.parse_weather(weatherstack_response))
    assert "City: Islamabad, Pakistan" in text
    assert "Air Quality (US EPA index): 4 - Unhealthy" in text
    assert "PM2.5: 92.4 µg/m³" in text


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code, self._body = status_code, body

    def json(self):
        return self._body


def fake_get_sequence(monkeypatch, responses):
    calls = []

    def fake_get(url, params, timeout):
        calls.append(params)
        return responses[len(calls) - 1]

    monkeypatch.setattr(core_weather.requests, "get", fake_get)
    monkeypatch.setattr(core_weather.time, "sleep", lambda s: None)
    return calls


def test_fetch_weather_retries_rate_limits(monkeypatch, weatherstack_response):
    rate_limited = FakeResponse(429, {"success": False, "error": {"code": 106, "info": "rate limit"}})
    calls = fake_get_sequence(monkeypatch, [rate_limited, rate_limited, FakeResponse(200, weatherstack_response)])
    assert core_weather.fetch_weather(" Islamabad ", "KEY") == weatherstack_response
    assert len(calls) == 3
    assert calls[0] == {"access_key": "KEY", "query": "Islamabad"}


def test_fetch_weather_treats_error_106_with_http_200_as_rate_limit(monkeypatch, weatherstack_response):
    body_error = FakeResponse(200, {"success": False, "error": {"code": 106}})
    calls = fake_get_sequence(monkeypatch, [body_error, FakeResponse(200, weatherstack_response)])
    assert "current" in core_weather.fetch_weather("Islamabad", "KEY")
    assert len(calls) == 2


def test_fetch_weather_gives_up_after_max_retries(monkeypatch):
    rate_limited = FakeResponse(429, {"error": {"code": 106, "info": "rate limit"}})
    calls = fake_get_sequence(monkeypatch, [rate_limited] * 3)
    assert core_weather.fetch_weather("x", "KEY", max_retries=2)["error"]["info"] == "rate limit"
    assert len(calls) == 3


def test_fetch_weather_network_error_does_not_leak_api_key(monkeypatch):
    def boom(url, params, timeout):
        raise requests.ConnectionError(f"failed: {url}?access_key={params['access_key']}")

    monkeypatch.setattr(core_weather.requests, "get", boom)
    result = core_weather.fetch_weather("x", "SECRET-KEY")
    assert result == {"error": {"info": "request failed (ConnectionError)"}}


def test_weather_tool_returns_text_and_artifact(monkeypatch, weatherstack_response):
    monkeypatch.setattr(core_weather, "fetch_weather", lambda city, key: weatherstack_response)
    tool = core_weather.make_weather_tool("KEY")
    message = tool.invoke({"type": "tool_call", "id": "1", "name": WEATHER_TOOL_NAME, "args": {"city": "Islamabad"}})
    assert tool.name == WEATHER_TOOL_NAME
    assert "Unhealthy" in message.content
    assert message.artifact["city"] == "Islamabad"


def test_weather_tool_error_has_no_artifact(monkeypatch):
    monkeypatch.setattr(core_weather, "fetch_weather", lambda city, key: {"error": {"info": "invalid key"}})
    message = core_weather.make_weather_tool("KEY").invoke(
        {"type": "tool_call", "id": "1", "name": WEATHER_TOOL_NAME, "args": {"city": "Nowhere"}})
    assert message.content == "Could not fetch weather data for Nowhere: invalid key"
    assert message.artifact is None


# ── search ──────────────────────────────────────────────────────────────────────

def test_search_tool_is_langchain_tavily():
    tool = make_search_tool("KEY", max_results=3)
    assert type(tool).__module__.startswith("langchain_tavily")
    assert tool.name == SEARCH_TOOL_NAME
    assert tool.max_results == 3
    assert tool.api_wrapper.tavily_api_key.get_secret_value() == "KEY"


@pytest.mark.parametrize("content, expected", [
    (json.dumps(SEARCH_RESPONSE), 3),
    (SEARCH_RESPONSE, 3),
    ("not json", 0),
    ('["a list"]', 0),
    ({"results": ["not a dict", {"url": "https://x"}]}, 1),
])
def test_parse_search_results(content, expected):
    assert len(parse_search_results(content)) == expected


# ── agent events / history ──────────────────────────────────────────────────────

def test_message_events():
    weather = {"city": "Islamabad"}
    messages = [
        HumanMessage("hi"),
        AIMessage("", tool_calls=[{"id": "a", "name": WEATHER_TOOL_NAME, "args": {"city": "Islamabad"}}]),
        ToolMessage("text", artifact=weather, name=WEATHER_TOOL_NAME, tool_call_id="a"),
        ToolMessage(json.dumps(SEARCH_RESPONSE), name=SEARCH_TOOL_NAME, tool_call_id="b"),
        AIMessage([{"type": "text", "text": "done"}]),  # Gemini-style content blocks
    ]
    events = [e for m in messages for e in core_agent.message_events(m)]
    assert [e["type"] for e in events] == ["user", "tool_call", "tool_result", "tool_result", "answer"]
    assert events[2]["artifact"] is weather
    assert len(events[3]["artifact"]["results"]) == 3  # search output decoded from JSON
    assert events[4]["text"] == "done"


def test_record_step_merges_call_and_result():
    steps = {}
    core_agent.record_step(steps, {"type": "tool_call", "id": "a", "name": "t", "args": {"q": 1}})
    step = core_agent.record_step(steps, {"type": "tool_result", "id": "a", "name": "t",
                                          "content": "c", "artifact": {"x": 1}})
    assert step == {"name": "t", "args": {"q": 1}, "content": "c", "artifact": {"x": 1}}
    orphan = core_agent.record_step(steps, {"type": "tool_result", "id": "b", "name": "t",
                                            "content": "c", "artifact": None})
    assert orphan["args"] == {}


def test_run_agent_streams_events_and_load_history_rebuilds_turns():
    agent = FakeAgent()
    events = list(core_agent.run_agent(agent, "weather in Islamabad?", "t1"))
    assert [e["type"] for e in events] == ["tool_call", "tool_result", "answer"]
    list(core_agent.run_agent(agent, "thanks", "t1"))

    history = core_agent.load_history(agent, "t1")
    assert [h["role"] for h in history] == ["user", "assistant", "user", "assistant"]
    assert history[1]["steps"][0]["artifact"]["aqi"]["label"] == "Unhealthy"
    assert history[3] == {"role": "assistant", "content": "You said: thanks", "steps": []}
    assert core_agent.load_history(agent, "other-thread") == []


def test_load_history_handles_empty_state():
    agent = SimpleNamespace(get_state=lambda config: SimpleNamespace(values={}))
    assert core_agent.load_history(agent, "t") == []


def test_build_agent_wires_both_tools():
    config = {"GEMINI_API_KEY": "x", "GEMINI_MODEL": "gemini-test", "TAVILY_API_KEY": "x", "WEATHER_API_KEY": "x"}
    agent = core_agent.build_agent(config)
    assert {"model", "tools"} <= set(agent.get_graph().nodes)
    tools_node = agent.get_graph().nodes["tools"].data
    assert set(tools_node.tools_by_name) == {SEARCH_TOOL_NAME, WEATHER_TOOL_NAME}
