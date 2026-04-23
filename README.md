# Smart Canteen Pre-Order System

This project solves the problem of long canteen waiting times during peak hours. It gives students a simple way to view the menu, predict queue load, place a pre-order, cancel orders when needed, and reduce pickup delays.

The project now uses a Node.js backend with MongoDB and a responsive frontend. The "AI-based" part is represented by a queue prediction engine that estimates waiting time using current active orders, total preparation time, number of ordered items, and time-of-day pressure during peak hours.

## Project Structure

```text
smart-canteen-preorder-system/
|-- package.json
|-- .env.example
|-- server.js
|-- README.md
|-- public/
|   |-- index.html
|   |-- styles.css
|   `-- app.js
|-- src/
|   |-- db/
|   |   |-- mongo.js
|   |   `-- seed.js
|   |-- data/
|   |   `-- menu.js
|   |-- services/
|   |   `-- canteenService.js
|   `-- utils/
|       `-- queuePredictor.js
`-- tests/
    `-- queuePredictor.test.js
```

## How to Run

1. Open a terminal in the project folder.
2. Install MongoDB locally and make sure the MongoDB server is running.
3. Run `npm install`
4. Copy `.env.example` values into your environment if you want custom settings.
5. Run `npm start`
6. Open `http://localhost:3000`

To run tests, use `npm test`.

## Deploy On Netlify

This project is now prepared for Netlify using:

- static frontend from `public`
- Netlify Function backend from `netlify/functions/api.js`
- MongoDB connection through environment variables

### Netlify setup

1. Push the project to GitHub.
2. Import the repo into Netlify.
3. Netlify will use [netlify.toml](C:/Users/G%20ROHITH%20REDDY/OneDrive/Documents/New%20project/smart-canteen-preorder-system/netlify.toml) automatically.
4. In Netlify site settings, add environment variables:
   - `MONGODB_URI`
   - `MONGODB_DB_NAME`
5. Deploy the site.

After deployment:

- frontend will load from Netlify
- backend API will run through `/.netlify/functions/api`
- the app will still use MongoDB for users, orders, and menu data

## Explanation Of Every File

### `package.json`

This file defines project metadata and scripts.

- `type: "module"` enables modern `import` and `export`.
- `dependencies.mongodb` is the official MongoDB Node.js driver.
- `start` runs the app.
- `dev` runs it in watch mode.
- `test` runs Node's built-in test runner.

### `server.js`

This is the backend entry point.

It:

- creates the HTTP server
- serves static frontend files
- exposes API routes
- sends JSON responses

Main helper functions:

- `sendJson(response, statusCode, payload)` sends structured API data.
- `parseBody(request)` reads POST request JSON.
- `serveStatic(request, response)` returns HTML, CSS, and JavaScript files.

Routes:

- `GET /api/menu` returns menu data.
- `GET /api/dashboard` returns order statistics and recent orders.
- `POST /api/predict-queue` calculates expected wait time.
- `POST /api/orders` creates a new pre-order.
- `POST /api/auth/login` logs in an existing MongoDB user or creates one if it does not exist yet.
- `PATCH /api/orders/:id/cancel` lets the student cancel an order.
- `PATCH /api/orders/:id/canteen-cancel` lets the canteen cancel because of out-of-stock items.
- `PATCH /api/orders/:id/status` moves orders through `Preparing`, `Ready`, and `Completed`.

### `src/db/mongo.js`

This file creates the MongoDB connection.

- `MongoClient` connects to MongoDB.
- `getDatabase()` returns the selected database instance.
- `closeDatabase()` is available for cleanup if needed later.

### `src/db/seed.js`

This file inserts starting data into MongoDB.

It seeds:

- menu items with stock quantity
- sample orders for the dashboard
- a default canteen login account
- indexes for menu IDs and order codes

### `src/data/menu.js`

This file stores the starter menu used during database seeding.

Each object contains:

- `id` for unique lookup
- `name` for display
- `category` for grouping
- `price` for billing
- `prepMinutes` for time estimation
- `popularityScore` as an AI-friendly signal for future upgrades
- `imageHint` as a simple descriptive label in the UI

### `src/utils/queuePredictor.js`

This file contains the AI-inspired queue prediction logic.

#### `getTimePressure(orderTime)`

This checks the hour of the order:

- peak hours get a higher multiplier
- medium traffic hours get a moderate multiplier
- quiet hours get a lower multiplier

#### `calculateQueuePrediction(...)`

This is the core prediction function.

It combines:

- selected item count
- current active orders
- average preparation load
- rush-hour effect
- total preparation time

It returns:

- `predictedWaitMinutes`
- `queueStatus`
- `confidence`
- `factors`

### `src/services/canteenService.js`

This file holds the business logic.

It is responsible for:

- validating orders
- converting item IDs into complete item details
- calculating total amount
- calculating preparation time
- calling the queue predictor
- storing and reading orders from MongoDB
- updating stock in MongoDB
- supporting student cancellation
- supporting canteen cancellation for out-of-stock situations
- building dashboard statistics

Important functions:

- `getMenu()` returns all menu items.
- `predictQueue(payload)` validates menu selection and predicts wait time.
- `createOrder(payload)` validates and stores a new order.
- `cancelOrderByStudent(...)` cancels a queued order from the student side.
- `cancelOrderByCanteen(...)` cancels an order with a stock-related reason from the canteen side.
- `updateOrderStatus(...)` supports a realistic kitchen flow.
- `getDashboardData()` prepares summary statistics and recent orders.

### `public/index.html`

This is the main UI layout.

It contains:

- a hero section showing the purpose of the project
- a live queue snapshot section
- a menu display section
- a pre-order form
- an order management area for cancellations

Important elements:

- `#stats` shows summary cards
- `#recentOrders` shows recent order activity
- `#menuGrid` shows the dynamic menu
- `#selectedItems` shows the student's selected items
- `#predictionResult` shows queue prediction output
- `#orderResult` shows the final order success message
- `#manageOrders` shows orders with cancel actions
- `#manageOrders` shows live order controls for queued, preparing, ready, and completed states
- `#manageResult` shows cancellation results

### `public/styles.css`

This file controls the full visual appearance.

It includes:

- CSS variables for theme colors
- responsive layout grids
- card-based sections
- button styling
- mobile-friendly layout behavior

### `public/app.js`

This file controls frontend behavior.

Main parts:

- `state` stores menu data and selected items.
- `formatCurrency(amount)` formats Indian prices.
- `getOrderPayload()` collects form data for the backend.
- `renderMenu()` draws menu cards.
- `renderSelectedItems()` updates the current cart.
- `renderDashboard(data)` updates live queue information.
- `fetchJson(...)` is a reusable API helper.
- `predictQueue()` requests queue prediction from the backend.
- `placeOrder(event)` submits the final order.
- `cancelOrder(...)` sends student or canteen cancellation requests.
- `updateOrderStatus(...)` moves the order through the kitchen lifecycle.
- `bootstrap()` loads the app at startup.

### `src/services/authService.js`

This file handles backend login using MongoDB.

- if the user exists, it validates login details
- if the user does not exist, it creates the account in the `users` collection
- it returns the saved MongoDB-backed user profile to the frontend

### `tests/queuePredictor.test.js`

This file tests the queue prediction logic.

It checks:

- peak-hour time pressure works correctly
- high-load queue prediction gives a realistic result

## How The System Works

1. The browser loads `index.html`.
2. `app.js` calls backend APIs.
3. The server responds with menu and dashboard data.
4. The student selects menu items and fills in the form.
5. The student clicks `Predict Queue`.
6. The backend predicts waiting time.
7. The student submits the pre-order.
8. The server stores the order in MongoDB and updates dashboard data.
9. If needed, the student or canteen can cancel the order.

## How It Matches The Problem Statement

Problem: Students face long waiting times in canteens during peak hours.

Solution provided by this project:

- Menu display: implemented
- Queue prediction: implemented
- Order placement: implemented
- Student cancellation: implemented
- Canteen cancellation for out-of-stock items: implemented
- Improved dining efficiency: achieved through pre-ordering and predicted wait awareness

## Future Improvements

You can extend this project later with:

- MongoDB or MySQL database support
- student login system
- QR pickup verification
- staff dashboard
- real machine learning with historical order data
