import { calculatorTool } from "./calculatorTool.js";
import { currencyExchangeTool } from "./currencyExchange.js";
import { weatherTool } from "./weatherTool.js";
import { websiteTools } from "./websiteTools.js";

// Register a new tool by adding its module here; the definition sent to the
// model and the handler that runs it stay in the tool's own file.
const chatTools = [calculatorTool, weatherTool, currencyExchangeTool];

const definitionsOf = (tools) => tools.map((tool) => tool.definition);
const handlersOf = (tools) =>
  Object.fromEntries(tools.map((tool) => [tool.definition.name, tool.handler]));

export const toolDefinitions = definitionsOf(chatTools);
export const toolHandlers = handlersOf(chatTools);

// The website agent gets its own registry, so the file tools stay out of the
// chat agent and the chat tools stay out of the website agent.
export const websiteToolDefinitions = definitionsOf(websiteTools);
export const websiteToolHandlers = handlersOf(websiteTools);

export { ensureWorkspace, websiteWorkspace } from "./websiteTools.js";
