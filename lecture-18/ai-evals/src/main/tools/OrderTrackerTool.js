export class OrderTrackerTool {
  constructor(toolTracker) {
    this.toolTracker = toolTracker;
  }

  static description =
    "Get the current status of an order.\n" +
    "Use this only when the user asks whether the order\n" +
    "is shipped, delivered, cancelled or its current status.\n" +
    "Do not use this for expected delivery dates.";

  getOrderStatus(orderId) {
    const normalizedOrderId = orderId.trim().toUpperCase();
    const orderStatus = {
      "ORD-101":
        "Order ORD-101 status is SHIPPED. It has not been delivered yet.",
      "ORD-102":
        "Order ORD-102 status is DELIVERED. It was delivered 20 days ago.",
      "ORD-103":
        "Order ORD-103 status is DELIVERED. A refund has been approved.",
    };
    const result =
      orderStatus[normalizedOrderId] ?? `Order ${normalizedOrderId} not found.`;
    this.toolTracker.record(
      "OrderTrackerTool",
      { orderId: normalizedOrderId },
      result,
    );
    return result;
  }
}
