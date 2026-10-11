import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createTask, listTasks, completeTask } from "./TaskTool.js";
import { getGuidelines } from "./TaskResources.js";
import { planDay } from "./TaskPrompts.js";

export function createMcpServer() {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || "task-mcp-server",
    version: process.env.MCP_SERVER_VERSION || "1.0.0",
  });

  // @McpTool(name = "create_task", description = "Create a new task")
  server.registerTool(
    "create_task",
    {
      description: "Create a new task",
      inputSchema: {
        // @McpToolParam(description = "Title of the task", required = true)
        title: z.string().describe("Title of the task"),
      },
    },
    async ({ title }) => ({
      content: [{ type: "text", text: createTask(title) }],
    })
  );

  // @McpTool(name = "list_tasks", description = "List all tasks")
  server.registerTool(
    "list_tasks",
    {
      description: "List all tasks",
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(listTasks()) }],
    })
  );

  // @McpTool(name = "complete_task", description = "Mark a task as completed")
  server.registerTool(
    "complete_task",
    {
      description: "Mark a task as completed",
      inputSchema: {
        // @McpToolParam(description = "Title of the task to complete", required = true)
        title: z.string().describe("Title of the task to complete"),
      },
    },
    async ({ title }) => ({
      content: [{ type: "text", text: completeTask(title) }],
    })
  );

  server.registerResource(
    "task_guidelines",
    "task://guidelines",
    {
      description: "Guidelines for managing and prioritizing tasks",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: getGuidelines() }],
    })
  );

  // @McpPrompt(name = "plan_day", description = "Plan the day's tasks based on available hours")
  server.registerPrompt(
    "plan_day",
    {
      description: "Plan the day's tasks based on available hours",
      argsSchema: {
        // @McpArg(description = "Number of hours available today", required = true)
        availableHours: z.string().describe("Number of hours available today"),
      },
    },
    async ({ availableHours }) => ({
      description: "Plan for the day's tasks based on available hours",
      messages: [
        {
          role: "user",
          content: { type: "text", text: planDay(availableHours) },
        },
      ],
    })
  );

  return server;
}
