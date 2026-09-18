function operand(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`Operand ${label} must be a finite number`);
  }
  return number;
}

export const calculatorTool = {
  definition: {
    type: "function",
    name: "calculator",
    description:
      "Perform an arithmetic calculation. Supported operations: add, subtract, multiply, divide, modulo, power.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["add", "subtract", "multiply", "divide", "modulo", "power"],
          description: "The arithmetic operation to perform",
        },
        a: { type: "number", description: "The first operand" },
        b: { type: "number", description: "The second operand" },
      },
      required: ["operation", "a", "b"],
      additionalProperties: false,
    },
  },

  handler({ operation, a, b }) {
    console.log("Calculator tool invoked:", { operation, a, b });
    const left = operand(a, "a");
    const right = operand(b, "b");

    switch (operation) {
      case "add":
        return left + right;
      case "subtract":
        return left - right;
      case "multiply":
        return left * right;
      case "divide":
        if (right === 0) {
          throw new RangeError("Division by zero is not allowed");
        }
        return left / right;
      case "modulo":
        if (right === 0) {
          throw new RangeError("Division by zero is not allowed");
        }
        return left % right;
      case "power":
        return left ** right;
      default:
        throw new RangeError(`Unsupported operation: ${operation}`);
    }
  },
};
