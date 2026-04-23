const state = {
  menu: [],
  filteredMenu: [],
  selectedItems: new Map(),
  user: null
};

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const loginRole = document.querySelector("#loginRole");
const menuSearchInput = document.querySelector("#menuSearch");
const logoutButton = document.querySelector("#logoutButton");
const jumpToMenuButton = document.querySelector("#jumpToMenuButton");
const userNameLabel = document.querySelector("#userNameLabel");
const userEmailLabel = document.querySelector("#userEmailLabel");
const menuGrid = document.querySelector("#menuGrid");
const selectedItemsContainer = document.querySelector("#selectedItems");
const predictionResult = document.querySelector("#predictionResult");
const orderResult = document.querySelector("#orderResult");
const manageResult = document.querySelector("#manageResult");
const statsContainer = document.querySelector("#stats");
const recentOrdersContainer = document.querySelector("#recentOrders");
const studentOrdersContainer = document.querySelector("#studentOrders");
const manageOrdersContainer = document.querySelector("#manageOrders");
const studentOrdersPanel = document.querySelector("#studentOrdersPanel");
const canteenOrdersPanel = document.querySelector("#canteenOrdersPanel");
const orderForm = document.querySelector("#orderForm");
const refreshDashboardButton = document.querySelector("#refreshDashboard");
const predictButton = document.querySelector("#predictButton");
const cartTotalLabel = document.querySelector("#cartTotalLabel");
const popupOverlay = document.querySelector("#popupOverlay");
const popupTitle = document.querySelector("#popupTitle");
const popupBody = document.querySelector("#popupBody");
const popupCloseButton = document.querySelector("#popupCloseButton");
const popupOkButton = document.querySelector("#popupOkButton");
const apiBase = "/api";
let refreshIntervalId;
let previousOrderSnapshot = new Map();
const pickupAlertsShown = new Set();

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

function saveUser(user) {
  localStorage.setItem("canteen_user", JSON.stringify(user));
}

function loadUser() {
  const raw = localStorage.getItem("canteen_user");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      role: parsed.role || "student"
    };
  } catch {
    return null;
  }
}

function setMessage(target, html, variant = "default") {
  target.classList.remove("hidden", "success");
  if (variant === "success") {
    target.classList.add("success");
  }
  target.innerHTML = html;
}

function clearMessage(target) {
  target.classList.add("hidden");
  target.innerHTML = "";
}

function showPopup(title, body) {
  popupTitle.textContent = title;
  popupBody.textContent = body;
  popupOverlay.classList.remove("hidden");
}

function closePopup() {
  popupOverlay.classList.add("hidden");
}

function updateAuthUI() {
  if (!state.user) {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    return;
  }

  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  userNameLabel.textContent = state.user.name;
  userEmailLabel.textContent = `${state.user.email} • ${state.user.role === "canteen" ? "Canteen Staff" : "Student"}`;
  document.querySelector("#studentName").value = state.user.name;

  const isCanteen = state.user.role === "canteen";
  canteenOrdersPanel.classList.toggle("hidden", !isCanteen);
  studentOrdersPanel.classList.toggle("hidden", isCanteen);
  orderForm.closest(".panel").classList.toggle("hidden", isCanteen);
}

function getCartSummary() {
  const items = Array.from(state.selectedItems.entries()).map(([itemId, quantity]) => {
    const item = state.menu.find((entry) => entry.id === itemId);
    return item ? { ...item, quantity } : null;
  }).filter(Boolean);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return { items, itemCount, totalAmount };
}

function getOrderPayload() {
  const studentName = document.querySelector("#studentName").value.trim();
  const pickupTime = document.querySelector("#pickupTime").value;
  const orderTimeRaw = document.querySelector("#orderTime").value;
  const items = Array.from(state.selectedItems.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
  const parsedOrderTime = orderTimeRaw ? new Date(orderTimeRaw) : new Date();

  return {
    studentName,
    pickupTime,
    orderTime: Number.isNaN(parsedOrderTime.getTime()) ? new Date().toISOString() : parsedOrderTime.toISOString(),
    items
  };
}

function formatPickupDisplay(timeValue, pickedUpAt = null, status = "") {
  if (status === "Completed" && pickedUpAt) {
    return new Date(pickedUpAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (!timeValue) {
    return "Pickup time not selected";
  }

  return timeValue;
}

function getReadableStatus(status) {
  const labels = {
    Queued: "Queued",
    Preparing: "Preparing",
    Ready: "Ready for Pickup",
    Completed: "Picked Up",
    CancelledByStudent: "Cancelled by Student",
    CancelledByCanteen: "Cancelled by Canteen"
  };

  return labels[status] || status;
}

function formatDuration(start, end) {
  if (!start || !end) {
    return "Not available";
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) {
    return "Not available";
  }

  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function getTrackingHtml(order) {
  const timeline = order.statusTimeline || {};
  const now = new Date();
  const queuedEnd = timeline.preparingAt || timeline.readyAt || timeline.completedAt || now;
  const preparingEnd = timeline.readyAt || timeline.completedAt || (order.status === "Preparing" ? now : null);
  const readyEnd = timeline.completedAt || (order.status === "Ready" || order.status === "Completed" ? now : null);
  const preparingText = timeline.preparingAt ? formatDuration(timeline.preparingAt, preparingEnd || now) : (order.status === "Queued" ? "Pending" : "0 min");
  const readyText = timeline.readyAt ? formatDuration(timeline.readyAt, readyEnd || now) : (["Queued", "Preparing"].includes(order.status) ? "Pending" : "0 min");

  return `
    <div class="tracking-timeline">
      <div class="timeline-row"><span>Queued</span><strong>${formatDuration(timeline.queuedAt || order.createdAt, queuedEnd)}</strong></div>
      <div class="timeline-row"><span>Preparing</span><strong>${preparingText}</strong></div>
      <div class="timeline-row"><span>Ready</span><strong>${readyText}</strong></div>
      <div class="timeline-row"><span>Completed At</span><strong>${timeline.completedAt ? new Date(timeline.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Pending"}</strong></div>
    </div>
  `;
}

function getCoverGradient(category) {
  const gradients = {
    Breakfast: "linear-gradient(135deg, #f59e0b, #ef4444)",
    Lunch: "linear-gradient(135deg, #fb7185, #e11d48)",
    Snacks: "linear-gradient(135deg, #f97316, #ef4444)",
    Beverages: "linear-gradient(135deg, #0ea5e9, #2563eb)",
    Healthy: "linear-gradient(135deg, #22c55e, #14b8a6)"
  };

  return gradients[category] || "linear-gradient(135deg, #fb7185, #f97316)";
}

function renderMenu() {
  const menuToRender = state.filteredMenu;

  if (menuToRender.length === 0) {
    menuGrid.innerHTML = "<p class='cart-empty'>No dishes matched your search. Try another keyword.</p>";
    return;
  }

  menuGrid.innerHTML = menuToRender.map((item) => `
    <article class="menu-card">
      <div class="menu-cover" style="background:${getCoverGradient(item.category)}">
        <div>
          <strong>${item.name}</strong>
          <p>${item.category}</p>
        </div>
      </div>
      <div class="menu-body">
        <div class="menu-meta">
          <span class="pill">Prep ${item.prepMinutes} mins</span>
          <strong>${formatCurrency(item.price)}</strong>
        </div>
        <p>${item.imageHint}</p>
        <button data-item-id="${item.id}">Add to cart</button>
      </div>
    </article>
  `).join("");

  menuGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => addItem(button.dataset.itemId));
  });
}

function renderSelectedItems() {
  const { items, itemCount, totalAmount } = getCartSummary();
  cartTotalLabel.textContent = itemCount === 0 ? "0 items" : `${itemCount} items • ${formatCurrency(totalAmount)}`;

  if (items.length === 0) {
    selectedItemsContainer.innerHTML = "<p class='cart-empty'>Your cart is empty. Add dishes from the menu to start ordering.</p>";
    return;
  }

  selectedItemsContainer.innerHTML = items.map((item) => `
    <div class="selected-row">
      <div>
        <strong>${item.name}</strong>
        <p>${formatCurrency(item.price)} each</p>
      </div>
      <div class="quantity-controls">
        <button data-action="decrease" data-item-id="${item.id}">-</button>
        <span>${item.quantity}</span>
        <button data-action="increase" data-item-id="${item.id}">+</button>
      </div>
    </div>
  `).join("");

  selectedItemsContainer.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const { action, itemId } = button.dataset;
      updateQuantity(itemId, action === "increase" ? 1 : -1);
    });
  });
}

function getStatusClass(status) {
  if (status.startsWith("Cancelled")) {
    return "status-cancelled";
  }

  if (status === "Ready") {
    return "status-ready";
  }

  if (status === "Completed") {
    return "status-completed";
  }

  return "";
}

function renderDashboard(data) {
  statsContainer.innerHTML = `
    <div class="stat-tile"><span>Total Orders</span><strong>${data.stats.totalOrders}</strong></div>
    <div class="stat-tile"><span>Queued</span><strong>${data.stats.queuedOrders}</strong></div>
    <div class="stat-tile"><span>Preparing</span><strong>${data.stats.preparingOrders}</strong></div>
    <div class="stat-tile"><span>Ready</span><strong>${data.stats.readyOrders}</strong></div>
    <div class="stat-tile"><span>Completed</span><strong>${data.stats.completedOrders}</strong></div>
    <div class="stat-tile"><span>Cancelled</span><strong>${data.stats.cancelledOrders}</strong></div>
    <div class="stat-tile"><span>Avg Wait</span><strong>${data.stats.averageWait} mins</strong></div>
  `;

  recentOrdersContainer.innerHTML = data.recentOrders.slice(0, 6).map((order) => `
    <article class="order-card">
      <div class="order-topline">
        <strong>${order.orderCode}</strong>
        <span class="pill ${getStatusClass(order.status)}">${getReadableStatus(order.status)}</span>
      </div>
      <p>${order.studentName} • Pickup ${formatPickupDisplay(order.pickupTime, order.pickedUpAt, order.status)}</p>
      <p>${order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</p>
      ${order.cancellation ? `<p>Reason: ${order.cancellation.reason}</p>` : ""}
      ${order.arrivalConfirmed ? "<p>Student has reached the canteen.</p>" : ""}
      ${getTrackingHtml(order)}
    </article>
  `).join("");

  notifyOrderChanges(data.recentOrders);
  renderStudentOrders(data.recentOrders);
  renderManageOrders(data.recentOrders);
}

function renderStudentOrders(orders) {
  if (state.user?.role === "canteen") {
    studentOrdersContainer.innerHTML = "";
    return;
  }

  const myOrders = orders.filter((order) => order.studentName === state.user?.name).slice(0, 8);

  if (myOrders.length === 0) {
    studentOrdersContainer.innerHTML = "<p class='cart-empty'>You have not placed any orders yet.</p>";
    return;
  }

  studentOrdersContainer.innerHTML = myOrders.map((order) => `
    <article class="order-card">
      <div class="order-topline">
        <strong>${order.orderCode}</strong>
        <span class="pill ${getStatusClass(order.status)}">${getReadableStatus(order.status)}</span>
      </div>
      <p>${order.items.map((item) => item.name).join(", ")}</p>
      <p>Pickup ${formatPickupDisplay(order.pickupTime, order.pickedUpAt, order.status)}</p>
      ${order.arrivalConfirmed ? "<p>Arrival confirmed.</p>" : ""}
      ${order.cancellation ? `<p>Reason: ${order.cancellation.reason}</p>` : ""}
      ${getTrackingHtml(order)}
      <div class="order-actions">
        <button class="secondary-button" data-action="student-cancel" data-order-id="${order.id}" ${order.status !== "Queued" ? "disabled" : ""}>Cancel Order</button>
        <button class="ghost-button" data-action="confirm-arrival" data-order-id="${order.id}" ${!["Preparing", "Ready"].includes(order.status) || order.arrivalConfirmed ? "disabled" : ""}>I Reached</button>
        <button class="primary-button" data-action="confirm-pickup" data-order-id="${order.id}" ${order.status !== "Ready" ? "disabled" : ""}>Confirm Pickup</button>
      </div>
    </article>
  `).join("");

  studentOrdersContainer.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        clearMessage(manageResult);
        if (button.dataset.action === "student-cancel") {
          await cancelOrder(button.dataset.orderId, "cancel");
        } else if (button.dataset.action === "confirm-pickup") {
          await confirmPickup(button.dataset.orderId);
        } else {
          await confirmArrival(button.dataset.orderId, true);
        }
      } catch (error) {
        setMessage(manageResult, error.message);
      }
    });
  });
}

function renderManageOrders(orders) {
  if (state.user?.role !== "canteen") {
    manageOrdersContainer.innerHTML = "";
    return;
  }

  const activeOrders = orders.filter((order) => !order.status.startsWith("Cancelled")).slice(0, 8);

  if (activeOrders.length === 0) {
    manageOrdersContainer.innerHTML = "<p class='cart-empty'>No active orders right now. Place a new order to see live tracking here.</p>";
    return;
  }

  manageOrdersContainer.innerHTML = activeOrders.map((order) => `
    <article class="order-card">
      <div class="order-topline">
        <strong>${order.orderCode}</strong>
        <span class="pill ${getStatusClass(order.status)}">${getReadableStatus(order.status)}</span>
      </div>
      <p>${order.studentName} • ${order.items.map((item) => item.name).join(", ")}</p>
      <p>Pickup ${formatPickupDisplay(order.pickupTime, order.pickedUpAt, order.status)}</p>
      ${order.arrivalConfirmed ? "<p>Arrival confirmed by student.</p>" : ""}
      ${getTrackingHtml(order)}
      <div class="order-actions">
        <button class="secondary-button" data-action="student-cancel" data-order-id="${order.id}" ${order.status !== "Queued" ? "disabled" : ""}>Cancel</button>
        <button class="danger-button" data-action="canteen-cancel" data-order-id="${order.id}" data-item-id="${order.items[0]?.itemId || ""}" ${!["Queued", "Preparing"].includes(order.status) ? "disabled" : ""}>Out of stock</button>
        <button class="ghost-button" data-action="mark-preparing" data-order-id="${order.id}" ${order.status !== "Queued" ? "disabled" : ""}>Preparing</button>
        <button class="ghost-button" data-action="mark-ready" data-order-id="${order.id}" ${order.status !== "Preparing" ? "disabled" : ""}>Ready</button>
        <button class="ghost-button" data-action="confirm-arrival" data-order-id="${order.id}" ${!["Preparing", "Ready"].includes(order.status) || order.arrivalConfirmed ? "disabled" : ""}>I Reached</button>
        <button class="ghost-button" data-action="mark-completed" data-order-id="${order.id}" ${order.status !== "Ready" ? "disabled" : ""}>Picked Up</button>
      </div>
    </article>
  `).join("");

  manageOrdersContainer.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        clearMessage(manageResult);
        if (button.dataset.action === "student-cancel") {
          await cancelOrder(button.dataset.orderId, "cancel");
        } else if (button.dataset.action === "canteen-cancel") {
          await cancelOrder(button.dataset.orderId, "canteen-cancel", button.dataset.itemId);
        } else if (button.dataset.action === "mark-preparing") {
          await updateOrderStatus(button.dataset.orderId, "Preparing");
        } else if (button.dataset.action === "mark-ready") {
          await updateOrderStatus(button.dataset.orderId, "Ready");
        } else if (button.dataset.action === "confirm-arrival") {
          await confirmArrival(button.dataset.orderId, true);
        } else {
          await updateOrderStatus(button.dataset.orderId, "Completed");
        }
      } catch (error) {
        setMessage(manageResult, error.message);
      }
    });
  });
}

function addItem(itemId) {
  updateQuantity(itemId, 1);
}

function updateQuantity(itemId, delta) {
  const current = state.selectedItems.get(itemId) || 0;
  const next = current + delta;

  if (next <= 0) {
    state.selectedItems.delete(itemId);
  } else {
    state.selectedItems.set(itemId, next);
  }

  renderSelectedItems();
}

function notifyOrderChanges(orders) {
  for (const order of orders) {
    const previous = previousOrderSnapshot.get(order.id);
    if (!previous) {
      previousOrderSnapshot.set(order.id, {
        status: order.status,
        arrivalConfirmed: order.arrivalConfirmed,
        pickupConfirmed: order.pickupConfirmed
      });
      continue;
    }

    if (previous.status !== order.status) {
      if (order.status === "CancelledByStudent") {
        showPopup("Order Cancelled", `${order.orderCode} was cancelled by the student.`);
      } else if (order.status === "CancelledByCanteen") {
        showPopup("Canteen Cancelled Order", `${order.orderCode} was cancelled because an item went out of stock.`);
      } else if (order.status === "Ready") {
        showPopup("Order Ready", `${order.orderCode} is ready for pickup.`);
      } else if (order.status === "Completed") {
        showPopup("Pickup Confirmed", `${order.orderCode} has been marked as picked up.`);
      }
    }

    previousOrderSnapshot.set(order.id, {
      status: order.status,
      arrivalConfirmed: order.arrivalConfirmed,
      pickupConfirmed: order.pickupConfirmed
    });
  }

  notifyPickupTimeReached(orders);
}

function notifyPickupTimeReached(orders) {
  if (!state.user) {
    return;
  }

  const now = new Date();

  for (const order of orders) {
    if (order.studentName !== state.user.name) {
      continue;
    }

    if (pickupAlertsShown.has(order.id)) {
      continue;
    }

    if (order.status.startsWith("Cancelled") || order.status === "Completed") {
      continue;
    }

    if (!order.pickupTime) {
      continue;
    }

    const [hours, minutes] = order.pickupTime.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      continue;
    }

    const pickupDate = new Date();
    pickupDate.setHours(hours, minutes, 0, 0);

    if (now >= pickupDate) {
      pickupAlertsShown.add(order.id);
      showPopup("Order Ready", `Your order ${order.orderCode} is ready. Please collect it from the canteen.`);
    }
  }
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };

    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }

    return payload;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Unable to reach the backend. Make sure npm start is running.");
    }

    throw error;
  }
}

async function loadMenu() {
  const data = await fetchJson(`${apiBase}/menu`);
  state.menu = data.items;
  filterMenu(menuSearchInput.value.trim());
}

async function loadDashboard() {
  const data = await fetchJson(`${apiBase}/dashboard`);
  renderDashboard(data);
}

function filterMenu(searchTerm) {
  const query = searchTerm.toLowerCase();
  state.filteredMenu = state.menu.filter((item) => {
    if (!query) {
      return true;
    }

    return [item.name, item.category, item.imageHint].some((value) => value.toLowerCase().includes(query));
  });

  renderMenu();
}

async function cancelOrder(orderId, mode, unavailableItemId = "") {
  const body = mode === "cancel"
    ? { reason: "Student changed the plan" }
    : { reason: "Item went out of stock in the canteen", unavailableItemId };
  const endpoint = mode === "cancel"
    ? `${apiBase}/orders/${orderId}/cancel`
    : `${apiBase}/orders/${orderId}/canteen-cancel`;
  const result = await fetchJson(endpoint, {
    method: "PATCH",
    body: JSON.stringify(body)
  });

  setMessage(manageResult, `<strong>${result.message}</strong>`, mode === "cancel" ? "default" : "success");
  showPopup(
    mode === "cancel" ? "Order Cancelled" : "Cancelled by Canteen",
    mode === "cancel" ? "Your order was cancelled successfully." : "The canteen cancelled the order because an item went out of stock."
  );
  await loadDashboard();
}

async function confirmArrival(orderId, reached) {
  const result = await fetchJson(`${apiBase}/orders/${orderId}/arrival`, {
    method: "PATCH",
    body: JSON.stringify({ reached })
  });

  setMessage(manageResult, `<strong>${result.message}</strong>`, "success");
  showPopup("Arrival Confirmed", result.message);
  await loadDashboard();
}

async function confirmPickup(orderId) {
  const result = await fetchJson(`${apiBase}/orders/${orderId}/pickup-confirm`, {
    method: "PATCH"
  });

  setMessage(manageResult, `<strong>${result.message}</strong>`, "success");
  showPopup("Pickup Confirmed", result.message);
  await loadDashboard();
}

async function updateOrderStatus(orderId, status) {
  const result = await fetchJson(`${apiBase}/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

  setMessage(manageResult, `<strong>${result.message}</strong>`, "success");
  if (status === "Completed") {
    showPopup("Pickup Confirmed", "The order has been confirmed as picked up.");
  }
  await loadDashboard();
}

async function predictQueue() {
  clearMessage(orderResult);
  const payload = getOrderPayload();
  const result = await fetchJson(`${apiBase}/predict-queue`, {
    method: "POST",
    body: JSON.stringify({
      items: payload.items,
      orderTime: payload.orderTime
    })
  });

  setMessage(
    predictionResult,
    `<strong>Predicted Wait:</strong> ${result.predictedWaitMinutes} minutes<br />
     <strong>Queue Status:</strong> ${result.queueStatus}<br />
     <strong>Confidence:</strong> ${result.confidence}<br />
     <strong>Base Prep Time:</strong> ${result.estimatedPrepMinutes} minutes`
  );
}

async function placeOrder(event) {
  event.preventDefault();
  clearMessage(predictionResult);
  clearMessage(manageResult);

  const payload = getOrderPayload();
  if (!payload.studentName) {
    setMessage(orderResult, "Student name is required.");
    return;
  }

  if (!payload.pickupTime) {
    setMessage(orderResult, "Pickup time is required.");
    return;
  }

  if (payload.items.length === 0) {
    setMessage(orderResult, "Please add at least one item before placing the order.");
    return;
  }

  const now = new Date();
  const pickupDate = new Date(`${now.toISOString().slice(0, 10)}T${payload.pickupTime}`);
  if (pickupDate.getTime() < now.getTime() - 60000) {
    setMessage(orderResult, "Pickup time should be later than the current time.");
    return;
  }

  const result = await fetchJson(`${apiBase}/orders`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  setMessage(
    orderResult,
    `<strong>${result.message}</strong><br />
     Order ID: ${result.order.orderCode || result.order.id}<br />
     Final predicted wait: ${result.prediction.predictedWaitMinutes} minutes<br />
     Total amount: ${formatCurrency(result.order.totalAmount)}`,
    "success"
  );
  showPopup("Order Confirmed", `Your order ${result.order.orderCode || result.order.id} has been placed successfully.`);

  state.selectedItems.clear();
  renderSelectedItems();
  orderForm.reset();
  document.querySelector("#studentName").value = state.user?.name || "";
  document.querySelector("#orderTime").value = new Date().toISOString().slice(0, 16);
  await loadDashboard();
}

async function handleLogin(event) {
  event.preventDefault();
  clearMessage(loginMessage);

  const name = document.querySelector("#loginName").value.trim();
  const email = document.querySelector("#loginEmail").value.trim();
  const studentId = document.querySelector("#loginStudentId").value.trim();
  const role = loginRole.value;

  if (!name || !email || !studentId) {
    setMessage(loginMessage, "Please fill in all login fields.");
    return;
  }

  const result = await fetchJson(`${apiBase}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ name, email, studentId, role })
  });

  state.user = result.user;
  saveUser(state.user);
  updateAuthUI();
  setMessage(loginMessage, result.message, "success");
  await bootstrapApp();
}

function logout() {
  state.user = null;
  localStorage.removeItem("canteen_user");
  window.clearInterval(refreshIntervalId);
  state.selectedItems.clear();
  previousOrderSnapshot = new Map();
  updateAuthUI();
}

async function bootstrapApp() {
  document.querySelector("#studentName").value = state.user?.name || "";
  const now = new Date();
  const pickupDefault = new Date(now.getTime() + 20 * 60000);
  document.querySelector("#orderTime").value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelector("#pickupTime").value = `${String(pickupDefault.getHours()).padStart(2, "0")}:${String(pickupDefault.getMinutes()).padStart(2, "0")}`;
  renderSelectedItems();
  await Promise.all([loadMenu(), loadDashboard()]);
  window.clearInterval(refreshIntervalId);
  refreshIntervalId = window.setInterval(() => {
    loadDashboard().catch((error) => {
      setMessage(manageResult, error.message);
    });
  }, 15000);
}

loginForm.addEventListener("submit", (event) => {
  handleLogin(event).catch((error) => {
    setMessage(loginMessage, error.message);
  });
});

logoutButton.addEventListener("click", logout);

menuSearchInput.addEventListener("input", () => {
  filterMenu(menuSearchInput.value.trim());
});

jumpToMenuButton.addEventListener("click", () => {
  document.querySelector("#menuSection").scrollIntoView({ behavior: "smooth" });
});

predictButton.addEventListener("click", async () => {
  try {
    await predictQueue();
  } catch (error) {
    setMessage(predictionResult, error.message);
  }
});

refreshDashboardButton.addEventListener("click", async () => {
  try {
    refreshDashboardButton.disabled = true;
    await loadDashboard();
    setMessage(manageResult, "<strong>Dashboard refreshed.</strong>", "success");
    showPopup("Refreshed", "Live order activity has been refreshed.");
  } catch (error) {
    setMessage(manageResult, error.message);
  } finally {
    refreshDashboardButton.disabled = false;
  }
});

orderForm.addEventListener("submit", async (event) => {
  try {
    await placeOrder(event);
  } catch (error) {
    setMessage(orderResult, error.message);
  }
});

popupCloseButton.addEventListener("click", closePopup);
popupOkButton.addEventListener("click", closePopup);
popupOverlay.addEventListener("click", (event) => {
  if (event.target === popupOverlay) {
    closePopup();
  }
});

async function init() {
  state.user = loadUser();
  updateAuthUI();
  if (state.user) {
    await bootstrapApp();
  }
}

init().catch((error) => {
  setMessage(loginMessage, error.message);
});
