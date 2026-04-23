import test from "node:test";
import assert from "node:assert/strict";

import { calculateQueuePrediction, getTimePressure } from "../src/utils/queuePredictor.js";

test("getTimePressure returns higher weight during peak hour", () => {
  const peak = getTimePressure("2026-04-23T12:15:00.000Z");
  const offPeak = getTimePressure("2026-04-23T05:15:00.000Z");

  assert.equal(peak, 1.35);
  assert.equal(offPeak, 0.9);
});

test("calculateQueuePrediction produces queue summary", () => {
  const result = calculateQueuePrediction({
    activeOrders: [
      { estimatedPrepMinutes: 10 },
      { estimatedPrepMinutes: 8 }
    ],
    orderItems: [
      { itemId: "veg-thali", quantity: 2 }
    ],
    totalPrepMinutes: 16,
    orderTime: "2026-04-23T12:10:00.000Z"
  });

  assert.equal(result.queueStatus, "High");
  assert.ok(result.predictedWaitMinutes >= 20);
  assert.equal(result.confidence, "Moderate");
});
