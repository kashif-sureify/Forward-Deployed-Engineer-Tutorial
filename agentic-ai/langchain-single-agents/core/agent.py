"""The agent (Gemini + tools + per-thread memory) and helpers that turn its
messages into simple events a UI, script or test can consume."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import InMemorySaver

from core.search import SEARCH_TOOL_NAME, make_search_tool, parse_search_results
from core.weather import make_weather_tool

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful assistant. Use the tools when you need real data. "
    "Always reply in English."
)


def build_agent(config: dict[str, str], system_prompt: str = DEFAULT_SYSTEM_PROMPT, checkpointer=None):
    """Create the Gemini agent with both tools and conversation memory."""
    # Bounded timeout/retries: if Gemini rate-limits us, callers get an error
    # instead of waiting indefinitely.
    llm = ChatGoogleGenerativeAI(api_key=config["GEMINI_API_KEY"], model=config["GEMINI_MODEL"],
                                 timeout=60, max_retries=2)
    tools = [
        make_search_tool(config["TAVILY_API_KEY"]),
        make_weather_tool(config["WEATHER_API_KEY"]),
    ]
    return create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
        checkpointer=InMemorySaver() if checkpointer is None else checkpointer,
    )


def thread_config(thread_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": thread_id}}


def message_events(message: BaseMessage) -> Iterator[dict[str, Any]]:
    """Translate one LangChain message into simple events.

    Events:
        {"type": "user",        "text"}
        {"type": "tool_call",   "id", "name", "args"}
        {"type": "tool_result", "id", "name", "content", "artifact"}
        {"type": "answer",      "text"}

    For the search tool, ``artifact`` is ``{"results": [...]}`` (decoded from the
    message text); for get_weather it is the parsed weather dict (or None on error).
    """
    if isinstance(message, HumanMessage):
        yield {"type": "user", "text": message.text}
    elif isinstance(message, AIMessage):
        for call in message.tool_calls:
            yield {"type": "tool_call", "id": call["id"], "name": call["name"], "args": call["args"]}
        if not message.tool_calls:
            yield {"type": "answer", "text": message.text}
    elif isinstance(message, ToolMessage):
        artifact = message.artifact
        if artifact is None and message.name == SEARCH_TOOL_NAME:
            artifact = {"results": parse_search_results(message.text)}
        yield {"type": "tool_result", "id": message.tool_call_id, "name": message.name,
               "content": message.text, "artifact": artifact}


def record_step(steps: dict[str, dict[str, Any]], event: dict[str, Any]) -> dict[str, Any]:
    """Fold a tool_call / tool_result event into `steps` (keyed by tool-call id)."""
    if event["type"] == "tool_call":
        steps[event["id"]] = {"name": event["name"], "args": event["args"]}
    else:
        steps.setdefault(event["id"], {"name": event["name"], "args": {}}).update(
            content=event["content"], artifact=event["artifact"])
    return steps[event["id"]]


def run_agent(agent, prompt: str, thread_id: str) -> Iterator[dict[str, Any]]:
    """Run one user turn and yield events (see message_events) as the agent works."""
    inputs = {"messages": [{"role": "user", "content": prompt}]}
    for update in agent.stream(inputs, thread_config(thread_id), stream_mode="updates"):
        for node_output in update.values():
            if isinstance(node_output, dict):
                for message in node_output.get("messages", []):
                    yield from message_events(message)


def load_history(agent, thread_id: str) -> list[dict[str, Any]]:
    """Rebuild a thread's transcript from the agent's memory.

    Returns ``[{"role": "user", "content"}, {"role": "assistant", "content", "steps"}, ...]``.
    """
    messages = agent.get_state(thread_config(thread_id)).values.get("messages", [])
    history: list[dict[str, Any]] = []
    steps: dict[str, dict[str, Any]] = {}
    for message in messages:
        for event in message_events(message):
            if event["type"] == "user":
                history.append({"role": "user", "content": event["text"]})
            elif event["type"] == "answer":
                history.append({"role": "assistant", "content": event["text"], "steps": list(steps.values())})
                steps = {}
            else:
                record_step(steps, event)
    return history
