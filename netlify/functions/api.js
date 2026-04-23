import { getDatabase } from "../../src/db/mongo.js";
import { seedDatabase } from "../../src/db/seed.js";
import { loginOrRegisterUser } from "../../src/services/authService.js";
import {
  cancelOrderByCanteen,
  cancelOrderByStudent,
  confirmArrival,
  confirmPickup,
  createOrder,
  getDashboardData,
  getMenu,
  predictQueue,
  updateOrderStatus
} from "../../src/services/canteenService.js";

let seededPromise;

async function ensureDatabaseReady() {
  if (!seededPromise) {
    seededPromise = (async () => {
      const db = await getDatabase();
      await seedDatabase(db);
      return db;
    })();
  }

  return seededPromise;
}

function sendJson(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function getFunctionSubPath(request) {
  const url = new URL(request.url);
  const marker = "/.netlify/functions/api";
  let pathname = url.pathname.startsWith(marker) ? url.pathname.slice(marker.length) : url.pathname;
  if (pathname.startsWith("/api/")) {
    pathname = pathname.slice(4);
  } else if (pathname === "/api") {
    pathname = "/";
  }
  return pathname || "/";
}

function getOrderIdFromPath(pathname, suffix) {
  const parts = pathname.split("/").filter(Boolean);
  return suffix ? parts[1] || "" : parts[parts.length - 1] || "";
}

export default async (request) => {
  try {
    const db = await ensureDatabaseReady();
    const pathname = getFunctionSubPath(request);

    if (request.method === "GET" && pathname === "/menu") {
      return sendJson(200, { items: await getMenu(db) });
    }

    if (request.method === "GET" && pathname === "/health") {
      return sendJson(200, { ok: true, database: "connected" });
    }

    if (request.method === "GET" && pathname === "/dashboard") {
      return sendJson(200, await getDashboardData(db));
    }

    if (request.method === "POST" && pathname === "/auth/login") {
      return sendJson(200, await loginOrRegisterUser(db, await request.json()));
    }

    if (request.method === "POST" && pathname === "/predict-queue") {
      return sendJson(200, await predictQueue(db, await request.json()));
    }

    if (request.method === "POST" && pathname === "/orders") {
      return sendJson(201, await createOrder(db, await request.json()));
    }

    if (request.method === "PATCH" && /^\/orders\/[^/]+\/cancel$/.test(pathname)) {
      const body = await request.json();
      return sendJson(200, await cancelOrderByStudent(db, getOrderIdFromPath(pathname, true), body.reason));
    }

    if (request.method === "PATCH" && /^\/orders\/[^/]+\/canteen-cancel$/.test(pathname)) {
      const body = await request.json();
      return sendJson(200, await cancelOrderByCanteen(db, getOrderIdFromPath(pathname, true), body.reason, body.unavailableItemId));
    }

    if (request.method === "PATCH" && /^\/orders\/[^/]+\/status$/.test(pathname)) {
      const body = await request.json();
      return sendJson(200, await updateOrderStatus(db, getOrderIdFromPath(pathname, true), body.status));
    }

    if (request.method === "PATCH" && /^\/orders\/[^/]+\/arrival$/.test(pathname)) {
      const body = await request.json();
      return sendJson(200, await confirmArrival(db, getOrderIdFromPath(pathname, true), body.reached));
    }

    if (request.method === "PATCH" && /^\/orders\/[^/]+\/pickup-confirm$/.test(pathname)) {
      return sendJson(200, await confirmPickup(db, getOrderIdFromPath(pathname, true)));
    }

    return sendJson(404, { error: "Not found" });
  } catch (error) {
    return sendJson(error.statusCode || 500, { error: error.message || "Internal server error" });
  }
};
