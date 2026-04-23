import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB_NAME || "smart_canteen";

let clientPromise;

function createClient() {
  const client = new MongoClient(mongoUri);
  return client.connect();
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
