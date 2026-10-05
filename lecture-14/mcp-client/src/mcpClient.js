import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function createMcpClient() {
  const client = new Client({ name: "taskClient", version: "1.0.0" });

  await client.connect(
    new StreamableHTTPClientTransport(new URL(process.env.TASK_SERVER_URL))
  );

  const { tools } = await client.listTools();
  console.log("Connected to MCP server. Tools:", tools.map((t) => t.name).join(", "));

  return client;
}