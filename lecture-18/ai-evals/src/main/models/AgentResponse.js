export class AgentResponse {
  constructor({
    answer,
    retrievedDocuments,
    toolUsed,
    toolArguments,
    toolResults,
    context,
  }) {
    Object.assign(this, {
      answer,
      retrievedDocuments,
      toolUsed,
      toolArguments,
      toolResults,
      context,
    });
  }
}
