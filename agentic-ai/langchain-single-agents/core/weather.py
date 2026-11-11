"""Weather + air-quality tool backed by the Weatherstack API."""

from __future__ import annotations

import random
import time
from typing import Any

import requests
from langchain.tools import tool
from langchain_core.tools import BaseTool

WEATHERSTACK_URL = "http://api.weatherstack.com/current"  # free plan is HTTP-only
WEATHER_TOOL_NAME = "get_weather"

# US EPA air-quality index (as Weatherstack reports it) → label
EPA_AQI_LABELS: dict[str, str] = {
    "1": "Good",
    "2": "Moderate",
    "3": "Unhealthy for Sensitive Groups",
    "4": "Unhealthy",
    "5": "Very Unhealthy",
    "6": "Hazardous",
}


def fetch_weather(city: str, api_key: str, max_retries: int = 3) -> dict[str, Any]:
    """Call Weatherstack and return its JSON body.

    The free plan allows roughly one request per second, so rate-limited calls
    (HTTP 429 / error code 106) are retried with a short, jittered back-off. That
    matters when the agent checks several cities in parallel.
    """
    params = {"access_key": api_key, "query": city.strip()}
    data: dict[str, Any] = {}
    for attempt in range(max_retries + 1):
        try:
            response = requests.get(WEATHERSTACK_URL, params=params, timeout=15)
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            # Don't include str(exc): it can contain the URL, and with it the API key.
            return {"error": {"info": f"request failed ({type(exc).__name__})"}}

        rate_limited = response.status_code == 429 or data.get("error", {}).get("code") == 106
        if not rate_limited or attempt == max_retries:
            return data
        time.sleep(1.5 * (attempt + 1) + random.uniform(0, 1))
    return data


def parse_weather(data: dict[str, Any]) -> dict[str, Any]:
    """Extract the fields the agent and the UI need from a Weatherstack response."""
    current = data["current"]
    location = data.get("location", {})
    air = current.get("air_quality") or {}

    aqi = None
    if air:
        index = air.get("us-epa-index")
        aqi = {"index": index, "label": EPA_AQI_LABELS.get(index, "Unknown"),
               "pm2_5": air.get("pm2_5"), "pm10": air.get("pm10")}

    return {
        "city": location.get("name"),
        "region": location.get("region"),
        "country": location.get("country"),
        "localtime": location.get("localtime"),
        "temperature": current.get("temperature"),
        "feels_like": current.get("feelslike"),
        "description": (current.get("weather_descriptions") or ["n/a"])[0],
        "humidity": current.get("humidity"),
        "wind_speed": current.get("wind_speed"),
        "wind_dir": current.get("wind_dir"),
        "uv_index": current.get("uv_index"),
        "is_day": current.get("is_day") != "no",
        "aqi": aqi,
    }


def format_weather(weather: dict[str, Any]) -> str:
    """Turn parsed weather into the plain-text observation the LLM reads."""
    lines = [
        f"City: {weather['city']}, {weather['country']}",
        f"Temperature: {weather['temperature']}°C (feels like {weather['feels_like']}°C)",
        f"Weather: {weather['description']}",
        f"Humidity: {weather['humidity']}%",
        f"Wind: {weather['wind_speed']} km/h {weather['wind_dir']}",
        f"UV index: {weather['uv_index']}",
    ]
    if aqi := weather["aqi"]:
        lines += [
            f"Air Quality (US EPA index): {aqi['index']} - {aqi['label']}",
            f"PM2.5: {aqi['pm2_5']} µg/m³",
            f"PM10: {aqi['pm10']} µg/m³",
        ]
    return "\n".join(lines)


def make_weather_tool(api_key: str) -> BaseTool:
    """Build the get_weather tool.

    It returns (text for the LLM, structured dict for the UI's weather card).
    """

    @tool(WEATHER_TOOL_NAME, response_format="content_and_artifact")
    def get_weather(city: str) -> tuple[str, dict[str, Any] | None]:
        """Get the current weather and air quality (AQI, PM2.5, PM10) for a given city.

        Always include the country in `city` (e.g. "Delhi, India", "London, UK"),
        because bare names are ambiguous ("Delhi" alone can resolve to Delhi, Canada).
        """
        data = fetch_weather(city, api_key)
        if "current" not in data:
            error = data.get("error", {}).get("info", "unknown error")
            return f"Could not fetch weather data for {city}: {error}", None
        weather = parse_weather(data)
        return format_weather(weather), weather

    return get_weather
