const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const REQUEST_TIMEOUT_MS = 10_000;

export const weatherTool = {
  definition: {
    type: "function",
    name: "currentWeather",
    description:
      "Get the current weather conditions for a city. Use this for any question about present weather, temperature or rain.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description:
            "Name of the city, optionally with country, for example 'Hyderabad, India' or 'Paris, France'",
        },
      },
      required: ["city"],
      additionalProperties: false,
    },
  },

  async handler({ city }) {
    console.log("Weather tool invoked:", { city });
    if (typeof city !== "string" || !city.trim()) {
      throw new TypeError("A city name is required");
    }

    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
      throw new Error("OPENWEATHERMAP_API_KEY is not set in the environment");
    }

    const url = new URL(WEATHER_URL);
    url.searchParams.set("q", city.trim());
    url.searchParams.set("units", "metric");
    url.searchParams.set("appid", apiKey);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404) {
      throw new Error(`Could not find a city named "${city}"`);
    }
    if (response.status === 401) {
      throw new Error(
        "OpenWeatherMap rejected the API key. A newly created key can take up to a couple of hours to activate.",
      );
    }
    if (!response.ok) {
      throw new Error(`Weather lookup failed with status ${response.status}`);
    }

    const { name, sys, weather, main, wind, dt } = await response.json();

    return {
      location: [name, sys?.country].filter(Boolean).join(", "),
      observedAt: new Date(dt * 1000).toISOString(),
      conditions: weather?.[0]?.description ?? "Unknown conditions",
      temperature: `${main.temp}°C`,
      feelsLike: `${main.feels_like}°C`,
      humidity: `${main.humidity}%`,
      windSpeed: `${wind?.speed ?? "unknown"} m/s`,
    };
  },
};
