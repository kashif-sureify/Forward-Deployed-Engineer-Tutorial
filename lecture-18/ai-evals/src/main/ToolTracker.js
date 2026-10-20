import { AsyncLocalStorage } from "node:async_hooks";

export class ToolTracker {
  storage = new AsyncLocalStorage();

  run(callback) {
    return this.storage.run(
      { toolUsed: [], toolArguments: {}, toolResults: {} },
      callback,
    );
  }

  get state() {
    const state = this.storage.getStore();
    if (!state) {
      throw new Error("ToolTracker state is not available");
    }
    return state;
  }

  clear() {
    Object.assign(this.state, {
      toolUsed: [],
      toolArguments: {},
      toolResults: {},
    });
  }

  record(toolName, args, result) {
    if (!this.state.toolUsed.includes(toolName)) {
      this.state.toolUsed.push(toolName);
    }
    this.state.toolArguments[toolName] = args;
    this.state.toolResults[toolName] = result;
  }

  getToolsUsed() {
    return [...this.state.toolUsed];
  }

  getToolArguments() {
    return { ...this.state.toolArguments };
  }

  getToolResults() {
    return { ...this.state.toolResults };
  }
}
