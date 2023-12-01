require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const client = new MongoClient(process.env.MONGO_API_KEY, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  }
});

let db;

async function connectToDb() {
  try {
    await client.connect();
    db = client.db("datupedia");
    console.log("Successfully connected to MongoDB!");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
}

function getDb() {
  return db;
}

module.exports = { connectToDb, getDb };
