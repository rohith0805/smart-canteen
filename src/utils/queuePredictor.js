const peakHours = new Set([8, 9, 12, 13, 16, 17]);

export function getTimePressure(orderTime) {
  const fallback = new Date();
  const date = orderTime ? new Date(orderTime) : fallback;
  const hour = Number.isNaN(date.getTime()) ? fallback.getHours() : date.getHours();

  if (peakHours.has(hour)) {
    return 1.35;
  }

  if (hour >= 10 && hour <= 15) {
    return 1.15;
  }

  return 0.9;
}

export function calculateQueuePrediction({ activeOrders, orderItems, totalPrepMinutes, orderTime }) {
  const itemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const averagePrepLoad = activeOrders.length === 0
    ? 0
    : activeOrders.reduce((sum, order) => sum + order.estimatedPrepMinutes, 0) / activeOrders.length;

  const timePressure = getTimePressure(orderTime);
  const congestionFactor = activeOrders.length * 1.8;
  const complexityFactor = itemCount * 1.2;
  const aiAdjustedMinutes = (totalPrepMinutes + averagePrepLoad + congestionFactor + complexityFactor) * timePressure;
  const predictedWaitMinutes = Math.max(5, Math.round(aiAdjustedMinutes));
  const queueStatus = predictedWaitMinutes <= 10 ? "Low" : predictedWaitMinutes <= 18 ? "Medium" : "High";

  return {
    predictedWaitMinutes,
    queueStatus,
    confidence: activeOrders.length < 3 ? "Moderate" : "High",
    factors: {
      activeOrders: activeOrders.length,
      itemCount,
      averagePrepLoad: Math.round(averagePrepLoad),
      timePressure
    }
  };
}
