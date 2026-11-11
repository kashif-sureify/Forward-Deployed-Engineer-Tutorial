"""Web-search tool backed by Tavily (the ``langchain-tavily`` package)."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import BaseTool
from langchain_tavily import TavilySearch

SEARCH_TOOL_NAME = "tavily_search"  # TavilySearch's built-in tool name


def make_search_tool(api_key: str, max_results: int = 2) -> BaseTool:
    return TavilySearch(max_results=max_results, tavily_api_key=api_key)


def parse_search_results(content: Any) -> list[dict[str, Any]]:
    """Pull the result list out of a TavilySearch output.

    TavilySearch returns the raw API response (``{"query", "results": [...], ...}``)
    as a JSON string in the tool message, so decode it first.
    """
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except json.JSONDecodeError:
            return []
    if not isinstance(content, dict):
        return []
    return [r for r in content.get("results", []) if isinstance(r, dict)]
