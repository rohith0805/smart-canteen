import { ObjectId } from "mongodb";

import { calculateQueuePrediction } from "../utils/queuePredictor.js";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function toObjectId(orderId) {
  if (!ObjectId.isValid(orderId)) {
    throw createHttpError("Invalid order id", 400);
  }

  return new ObjectId(orderId);
}

function toOrderView(order, menuMap) {
  return {
    id: order._id.toString(),
    orderCode: order.orderCode,
    studentName: order.studentName,
    pickupTime: order.pickupTime,
    status: order.status,
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    totalAmount: order.totalAmount,
    orderTime: order.orderTime,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    arrivalConfirmed: order.arrivalConfirmed || false,
    pickupConfirmed: order.pickupConfirmed || false,
    arrivedAt: order.arrivedAt || null,
    pickedUpAt: order.pickedUpAt || null,
    statusTimeline: order.statusTimeline || {},
    cancellation: order.cancellation || null,
    items: order.items.map((entry) => ({
      ...entry,
      name: menuMap.get(entry.itemId)?.name || entry.itemId,
      price: menuMap.get(entry.itemId)?.price || 0
    }))
  };
}

async function getMenuMap(db) {
  const items = await db.collection("menu").find({}).toArray();
  return new Map(items.map((item) => [item.id, item]));
}

async function getNextOrderCode(db) {
  const orders = await db.collection("orders").find(
    {},
    { projection: { orderCode: 1 } }
  ).toArray();

  const maxOrderNumber = orders.reduce((max, order) => {
    const match = /^ORD-(\d+)$/.exec(order.orderCode || "");
    const current = match ? Number(match[1]) : 1000;
    return Math.max(max, current);
  }, 1000);

  return `ORD-${maxOrderNumber + 1}`;
}

function validateOrderPayload(payload) {
  if (!payload.studentName || !payload.studentName.trim()) {
    throw createHttpError("Student name is required", 400);
  }

  if (!payload.pickupTime || !payload.pickupTime.trim()) {
    throw createHttpError("Pickup time is required", 400);
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw createHttpError("At least one order item is required", 400);
  }
}

async function enrichItems(db, items) {
  const menuMap = await getMenuMap(db);

  return items.map((entry) => {
    const menuItem = menuMap.get(entry.itemId);

    if (!menuItem) {
      throw createHttpError(`Menu item not found: ${entry.itemId}`, 400);
    }

    return {
      itemId: entry.itemId,
      quantity: entry.quantity,
      name: menuItem.name,
      price: menuItem.price,
      prepMinutes: menuItem.prepMinutes,
      inStock: menuItem.inStock,
      stockCount: menuItem.stockCount,
      lineTotal: menuItem.price * entry.quantity
    };
  });
}

async function assertStockAvailable(db, enrichedItems) {
  const outOfStockItem = enrichedItems.find((item) => !item.inStock || item.stockCount < item.quantity);
  if (outOfStockItem) {
    throw createHttpError(`${outOfStockItem.name} is out of stock or has insufficient quantity`, 400);
  }

  const menuCollection = db.collection("menu");
  await Promise.all(
    enrichedItems.map((item) =>
      menuCollection.updateOne(
        { id: item.itemId },
        {
          $inc: { stockCount: -item.quantity },
          $set: {
            updatedAt: new Date(),
            inStock: item.stockCount - item.quantity > 0
          }
        }
      )
    )
  );
}

async function releaseStock(db, order) {
  const menuMap = await getMenuMap(db);
  const menuCollection = db.collection("menu");

  await Promise.all(
    order.items.map(async (entry) => {
      const current = menuMap.get(entry.itemId);
      if (!current) {
        return;
      }

      await menuCollection.updateOne(
        { id: entry.itemId },
        {
          $inc: { stockCount: entry.quantity },
          $set: {
            updatedAt: new Date(),
            inStock: true
          }
        }
      );
    })
  );
}

async function summarizeOrder(db, items, orderTime) {
  const activeOrders = await db.collection("orders").find({
    status: { $in: ["Queued", "Preparing"] }
  }).toArray();
  const enrichedItems = await enrichItems(db, items);
  const totalAmount = enrichedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalPrepMinutes = enrichedItems.reduce((sum, item) => sum + (item.prepMinutes * item.quantity), 0);
  const prediction = calculateQueuePrediction({
    activeOrders,
    orderItems: enrichedItems,
    totalPrepMinutes,
    orderTime
  });

  return {
    enrichedItems,
    totalAmount,
    totalPrepMinutes,
    prediction
  };
}

function getTimelineSeed(order) {
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const prepMinutes = Math.max(5, Number(order.estimatedPrepMinutes) || 5);
  const queuedMinutes = Math.max(2, Math.round(prepMinutes * 0.35));
  const preparingMinutes = Math.max(2, prepMinutes - queuedMinutes);
  const preparingAt = new Date(createdAt.getTime() + queuedMinutes * 60000);
  const readyAt = new Date(preparingAt.getTime() + preparingMinutes * 60000);

  return {
    createdAt,
    prepMinutes,
    queuedMinutes,
    preparingAt,
    readyAt
  };
}

async function autoAdvanceOrders(db) {
  const ordersCollection = db.collection("orders");
  const activeOrders = await ordersCollection.find({
    status: { $in: ["Queued", "Preparing", "Ready"] }
  }).toArray();
  const now = new Date();

  await Promise.all(activeOrders.map(async (order) => {
    const seed = getTimelineSeed(order);
    const timeline = order.statusTimeline || {};
    const updateSet = {
      "statusTimeline.queuedAt": timeline.queuedAt || seed.createdAt,
      updatedAt: now
    };
    let nextStatus = order.status;

    if (now >= seed.preparingAt && !timeline.preparingAt) {
      updateSet["statusTimeline.preparingAt"] = seed.preparingAt;
    }

    if (now >= seed.readyAt && !timeline.readyAt) {
      updateSet["statusTimeline.readyAt"] = seed.readyAt;
    }

    if (order.status === "Queued" && now >= seed.preparingAt) {
      nextStatus = "Preparing";
    }

    if (now >= seed.readyAt) {
      nextStatus = "Ready";
    }

    if (nextStatus !== order.status) {
      updateSet.status = nextStatus;
    }

    await ordersCollection.updateOne(
      { _id: order._id },
      { $set: updateSet }
    );
  }));
}

export async function getMenu(db) {
  return db.collection("menu").find({}).sort({ category: 1, name: 1 }).toArray();
}

export async function predictQueue(db, { items = [], orderTime = new Date().toISOString() }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError("Please choose at least one menu item for prediction", 400);
  }

  const { totalPrepMinutes, prediction } = await summarizeOrder(db, items, orderTime);
  return {
    estimatedPrepMinutes: totalPrepMinutes,
    ...prediction
  };
}

export async function createOrder(db, payload) {
  validateOrderPayload(payload);
  const { enrichedItems, totalAmount, totalPrepMinutes, prediction } = await summarizeOrder(db, payload.items, payload.orderTime);
  await assertStockAvailable(db, enrichedItems);

  const order = {
    orderCode: await getNextOrderCode(db),
    studentName: payload.studentName.trim(),
    pickupTime: payload.pickupTime,
    status: "Queued",
    estimatedPrepMinutes: prediction.predictedWaitMinutes,
    totalAmount,
    orderTime: payload.orderTime ? new Date(payload.orderTime) : new Date(),
    arrivalConfirmed: false,
    pickupConfirmed: false,
    statusTimeline: {
      queuedAt: new Date(),
      preparingAt: null,
      readyAt: null,
      completedAt: null
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    items: enrichedItems.map(({ itemId, quantity }) => ({ itemId, quantity }))
  };

  const result = await db.collection("orders").insertOne(order);

  return {
    message: "Pre-order placed successfully",
    order: {
      ...order,
      id: result.insertedId.toString(),
      items: enrichedItems
    },
    prediction: {
      ...prediction,
      estimatedPrepMinutes: totalPrepMinutes
    }
  };
}

export async function cancelOrderByStudent(db, orderId, reason = "Cancelled by student") {
  const ordersCollection = db.collection("orders");
  const order = await ordersCollection.findOne({ _id: toObjectId(orderId) });

  if (!order) {
    throw createHttpError("Order not found", 404);
  }

  if (["CancelledByStudent", "CancelledByCanteen", "Completed"].includes(order.status)) {
    throw createHttpError("This order can no longer be cancelled by the student", 400);
  }

  await ordersCollection.updateOne(
    { _id: order._id },
    {
      $set: {
        status: "CancelledByStudent",
        updatedAt: new Date(),
        cancellation: {
          actor: "Student",
          reason,
          cancelledAt: new Date()
        }
      }
    }
  );

  await releaseStock(db, order);
  return { message: "Order cancelled by student" };
}

export async function cancelOrderByCanteen(db, orderId, reason, unavailableItemId = "") {
  if (!reason || !reason.trim()) {
    throw createHttpError("Canteen cancellation reason is required", 400);
  }

  const ordersCollection = db.collection("orders");
  const order = await ordersCollection.findOne({ _id: toObjectId(orderId) });

  if (!order) {
    throw createHttpError("Order not found", 404);
  }

  if (["CancelledByStudent", "CancelledByCanteen", "Completed"].includes(order.status)) {
    throw createHttpError("This order can no longer be cancelled by the canteen", 400);
  }

  await ordersCollection.updateOne(
    { _id: order._id },
    {
      $set: {
        status: "CancelledByCanteen",
        updatedAt: new Date(),
        cancellation: {
          actor: "Canteen",
          reason,
          unavailableItemId: unavailableItemId || null,
          cancelledAt: new Date()
        }
      }
    }
  );

  await releaseStock(db, order);
  return { message: "Order cancelled by canteen due to stock issue" };
}

export async function updateOrderStatus(db, orderId, status) {
  const allowedStatuses = new Set(["Queued", "Preparing", "Ready", "Completed"]);
  if (!allowedStatuses.has(status)) {
    throw createHttpError("Invalid status update", 400);
  }

  const ordersCollection = db.collection("orders");
  const objectId = toObjectId(orderId);
  const order = await ordersCollection.findOne({ _id: objectId });

  if (!order) {
    throw createHttpError("Order not found", 404);
  }

  if (order.status.startsWith("Cancelled")) {
    throw createHttpError("Cancelled orders cannot be updated", 400);
  }

  const timelineUpdates = {};
  if (status === "Preparing" && !order.statusTimeline?.preparingAt) {
    timelineUpdates["statusTimeline.preparingAt"] = new Date();
  }
  if (status === "Ready" && !order.statusTimeline?.readyAt) {
    timelineUpdates["statusTimeline.readyAt"] = new Date();
  }
  if (status === "Completed" && !order.statusTimeline?.completedAt) {
    timelineUpdates["statusTimeline.completedAt"] = new Date();
  }

  await ordersCollection.updateOne(
    { _id: objectId },
    {
      $set: {
        status,
        updatedAt: new Date(),
        ...timelineUpdates
      }
    }
  );

  return { message: `Order marked as ${status}` };
}

export async function confirmArrival(db, orderId, reached) {
  const ordersCollection = db.collection("orders");
  const objectId = toObjectId(orderId);
  const order = await ordersCollection.findOne({ _id: objectId });

  if (!order) {
    throw createHttpError("Order not found", 404);
  }

  if (order.status.startsWith("Cancelled")) {
    throw createHttpError("Cancelled orders cannot confirm arrival", 400);
  }

  await ordersCollection.updateOne(
    { _id: objectId },
    {
      $set: {
        arrivalConfirmed: Boolean(reached),
        arrivedAt: reached ? new Date() : null,
        updatedAt: new Date()
      }
    }
  );

  return {
    message: reached ? "Arrival confirmed. The canteen knows you have reached." : "Arrival confirmation removed."
  };
}

export async function confirmPickup(db, orderId) {
  const ordersCollection = db.collection("orders");
  const objectId = toObjectId(orderId);
  const order = await ordersCollection.findOne({ _id: objectId });

  if (!order) {
    throw createHttpError("Order not found", 404);
  }

  if (order.status.startsWith("Cancelled")) {
    throw createHttpError("Cancelled orders cannot be picked up", 400);
  }

  await ordersCollection.updateOne(
    { _id: objectId },
    {
      $set: {
        status: "Completed",
        pickupConfirmed: true,
        pickedUpAt: new Date(),
        updatedAt: new Date(),
        "statusTimeline.completedAt": new Date()
      }
    }
  );

  return { message: "Pickup confirmed successfully." };
}

export async function getDashboardData(db) {
  await autoAdvanceOrders(db);

  const [menuMap, orders] = await Promise.all([
    getMenuMap(db),
    db.collection("orders").find({}).sort({ createdAt: -1 }).toArray()
  ]);

  const queuedOrders = orders.filter((order) => order.status === "Queued").length;
  const preparingOrders = orders.filter((order) => order.status === "Preparing").length;
  const readyOrders = orders.filter((order) => order.status === "Ready").length;
  const completedOrders = orders.filter((order) => order.status === "Completed").length;
  const cancelledOrders = orders.filter((order) => order.status.startsWith("Cancelled")).length;
  const averageWaitBase = orders.filter((order) => ["Queued", "Preparing", "Completed"].includes(order.status));
  const averageWait = averageWaitBase.length === 0
    ? 0
    : Math.round(averageWaitBase.reduce((sum, order) => sum + order.estimatedPrepMinutes, 0) / averageWaitBase.length);

  return {
    stats: {
      totalOrders: orders.length,
      queuedOrders,
      preparingOrders,
      readyOrders,
      completedOrders,
      cancelledOrders,
      averageWait
    },
    recentOrders: orders.map((order) => toOrderView(order, menuMap))
  };
}
