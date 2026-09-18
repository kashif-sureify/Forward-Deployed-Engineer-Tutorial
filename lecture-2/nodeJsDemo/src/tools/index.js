import { calculatorTool } from "./calculatorTool.js";
import { currencyExchangeTool } from "./currencyExchange.js";
import { weatherTool } from "./weatherTool.js";

// Register a new tool by adding its module here; the definition sent to the
// model and the handler that runs it stay in the tool's own file.
const tools = [calculatorTool, weatherTool, currencyExchangeTool];

export const toolDefinitions = tools.map((tool) => tool.definition);

export const toolHandlers = Object.fromEntries(
  tools.map((tool) => [tool.definition.name, tool.handler]),
);
