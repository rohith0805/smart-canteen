import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDatabase } from "./src/db/mongo.js";
import { seedDatabase } from "./src/db/seed.js";
import { loginOrRegisterUser } from "./src/services/authService.js";
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
} from "./src/services/canteenService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = process.env.PORT || 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

async function serveStatic(request, response) {
  const requestedPath = request.url === "/" ? "/index.html" : request.url;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  const extension = path.extname(filePath);

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extension] || "text/plain; charset=utf-8" });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Resource not found" });
  }
}

function getOrderIdFromUrl(url, suffix) {
  const parts = url.split("/");
  const last = parts[parts.length - 1];
  const orderId = suffix ? parts[parts.length - 2] : last;
  return orderId || "";
}

const server = http.createServer(async (request, response) => {
  try {
    const db = await getDatabase();

    if (request.method === "GET" && request.url === "/api/menu") {
      sendJson(response, 200, { items: await getMenu(db) });
      return;
    }

    if (request.method === "GET" && request.url === "/api/dashboard") {
      sendJson(response, 200, await getDashboardData(db));
      return;
    }

    if (request.method === "POST" && request.url === "/api/predict-queue") {
      const body = await parseBody(request);
      sendJson(response, 200, await predictQueue(db, body));
      return;
    }

    if (request.method === "POST" && request.url === "/api/orders") {
      const body = await parseBody(request);
      const order = await createOrder(db, body);
      sendJson(response, 201, order);
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/login") {
      const body = await parseBody(request);
      sendJson(response, 200, await loginOrRegisterUser(db, body));
      return;
    }

    if (request.method === "PATCH" && request.url?.match(/^\/api\/orders\/[^/]+\/cancel$/)) {
      const body = await parseBody(request);
      const orderId = getOrderIdFromUrl(request.url, true);
      sendJson(response, 200, await cancelOrderByStudent(db, orderId, body.reason));
      return;
    }

    if (request.method === "PATCH" && request.url?.match(/^\/api\/orders\/[^/]+\/canteen-cancel$/)) {
      const body = await parseBody(request);
      const orderId = getOrderIdFromUrl(request.url, true);
      sendJson(response, 200, await cancelOrderByCanteen(db, orderId, body.reason, body.unavailableItemId));
      return;
    }

    if (request.method === "PATCH" && request.url?.match(/^\/api\/orders\/[^/]+\/status$/)) {
      const body = await parseBody(request);
      const orderId = getOrderIdFromUrl(request.url, true);
      sendJson(response, 200, await updateOrderStatus(db, orderId, body.status));
      return;
    }

    if (request.method === "PATCH" && request.url?.match(/^\/api\/orders\/[^/]+\/arrival$/)) {
      const body = await parseBody(request);
      const orderId = getOrderIdFromUrl(request.url, true);
      sendJson(response, 200, await confirmArrival(db, orderId, body.reached));
      return;
    }

    if (request.method === "PATCH" && request.url?.match(/^\/api\/orders\/[^/]+\/pickup-confirm$/)) {
      const orderId = getOrderIdFromUrl(request.url, true);
      sendJson(response, 200, await confirmPickup(db, orderId));
      return;
    }

    if (request.method === "GET") {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, { error: error.message || "Internal server error" });
  }
});

async function startServer() {
  const db = await getDatabase();
  await seedDatabase(db);

  server.listen(port, () => {
    console.log(`Smart Canteen server is running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Smart Canteen server", error);
  process.exit(1);
});
