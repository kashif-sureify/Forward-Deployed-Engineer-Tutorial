export class EvalCase {
  constructor({ id, question, expectedAnswer, expectedBehavior, expectedTool, expectedToolArgument, expectedSource }) {
    Object.assign(this, { id, question, expectedAnswer, expectedBehavior, expectedTool, expectedToolArgument, expectedSource });
  }
}