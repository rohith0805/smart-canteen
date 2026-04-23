import assert from "node:assert/strict";

import { calculateQueuePrediction, getTimePressure } from "../src/utils/queuePredictor.js";

function runTest(name, callback) {
  try {
    callback();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

runTest("getTimePressure returns higher weight during peak hour", () => {
  const peak = getTimePressure("2026-04-23T12:15:00");
  const offPeak = getTimePressure("2026-04-23T05:15:00");

  assert.equal(peak, 1.35);
  assert.equal(offPeak, 0.9);
});

runTest("calculateQueuePrediction produces queue summary", () => {
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

if (!process.exitCode) {
  console.log("All tests passed.");
}
