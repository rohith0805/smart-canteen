import { menuItems } from "../data/menu.js";

export async function seedDatabase(db) {
  const menuCollection = db.collection("menu");
  const ordersCollection = db.collection("orders");
  const usersCollection = db.collection("users");
  const existingMenuCount = await menuCollection.countDocuments();

  if (existingMenuCount === 0) {
    await menuCollection.insertMany(
      menuItems.map((item) => ({
        ...item,
        inStock: true,
        stockCount: 20,
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    );
  }

  const existingOrdersCount = await ordersCollection.countDocuments();
  if (existingOrdersCount === 0) {
    await ordersCollection.insertMany([
      {
        orderCode: "ORD-1001",
        studentName: "Aarav",
        pickupTime: "12:20",
        status: "Preparing",
        estimatedPrepMinutes: 11,
        totalAmount: 135,
        orderTime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          { itemId: "veg-thali", quantity: 1 },
          { itemId: "cold-coffee", quantity: 1 }
        ]
      },
      {
        orderCode: "ORD-1002",
        studentName: "Diya",
        pickupTime: "12:25",
        status: "Queued",
        estimatedPrepMinutes: 8,
        totalAmount: 70,
        orderTime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          { itemId: "paneer-wrap", quantity: 1 }
        ]
      }
    ]);
  }

  await menuCollection.updateMany(
    { inStock: { $exists: false } },
    {
      $set: {
        inStock: true,
        stockCount: 20,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }
  );

  await menuCollection.updateMany(
    { stockCount: { $exists: false } },
    {
      $set: {
        stockCount: 20,
        updatedAt: new Date()
      }
    }
  );

  await menuCollection.updateMany(
    { imageHint: { $exists: false } },
    {
      $set: {
        imageHint: "Freshly prepared meal",
        updatedAt: new Date()
      }
    }
  );

  await Promise.all([
    menuCollection.createIndex({ id: 1 }, { unique: true }),
    ordersCollection.createIndex({ orderCode: 1 }, { unique: true }),
    usersCollection.createIndex({ email: 1, role: 1 }, { unique: true })
  ]);

  const existingCanteenUser = await usersCollection.findOne({ email: "canteen@college.edu", role: "canteen" });
  if (!existingCanteenUser) {
    await usersCollection.insertOne({
      name: "Campus Canteen",
      email: "canteen@college.edu",
      studentId: "CANTEEN001",
      role: "canteen",
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}
