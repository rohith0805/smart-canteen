import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB_NAME || "smart_canteen";
const runningOnNetlify = Boolean(process.env.NETLIFY);

let clientPromise;

function createDatabaseError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}

async function createClient() {
  if (runningOnNetlify && /127\.0\.0\.1|localhost/.test(mongoUri)) {
    throw createDatabaseError("Netlify cannot connect to local MongoDB. Use MongoDB Atlas and set MONGODB_URI in Netlify environment variables.");
  }

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await client.connect();
    return client;
  } catch {
    throw createDatabaseError("Database connection failed. Check MONGODB_URI, MONGODB_DB_NAME, and your MongoDB network access settings.");
  }
}

export async function getDatabase() {
  if (!clientPromise) {
    clientPromise = createClient();
  }

  const client = await clientPromise;
  return client.db(dbName);
}

export async function closeDatabase() {
  if (!clientPromise) {
    return;
  }

  const client = await clientPromise;
  await client.close();
  clientPromise = null;
}
