const EXCHANGE_RATE_URL = "https://api.frankfurter.dev/v2/rate";
const REQUEST_TIMEOUT_MS = 10_000;

function currencyCode(value, label) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new TypeError(
      `${label} must be a three-letter currency code, for example USD`,
    );
  }
  return code;
}

export const currencyExchangeTool = {
  definition: {
    type: "function",
    name: "convertCurrency",
    description:
      "Get the latest exchange rate between two currencies and convert an amount from one to the other.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Source currency code, for example USD",
        },
        to: {
          type: "string",
          description: "Target currency code, for example INR",
        },
        amount: {
          type: "number",
          description:
            "Amount in the source currency to convert. Defaults to 1 when the user only asks for the rate.",
        },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },

  async handler({ from, to, amount = 1 }) {
    console.log("Currency exchange tool invoked:", { from, to, amount });
    const source = currencyCode(from, "from");
    const target = currencyCode(to, "to");

    const value = Number(amount);
    if (!Number.isFinite(value)) {
      throw new TypeError("Amount must be a finite number");
    }

    const response = await fetch(`${EXCHANGE_RATE_URL}/${source}/${target}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Exchange rate lookup failed with status ${response.status}`,
      );
    }

    const { rate, date } = await response.json();
    return {
      from: source,
      to: target,
      rate,
      rateDate: date,
      amount: value,
      converted: Number((value * rate).toFixed(4)),
    };
  },
};
