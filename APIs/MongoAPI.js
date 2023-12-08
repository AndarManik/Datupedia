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

async function getInlinkData(pageName) {
  try {
    const cursor = db
      .collection("datuPages")
      .find({ pageName: pageName });

    return await cursor.toArray();
  } catch (error) {
    console.log(
      `Error loading data from DB for page ${pageName}: ${error}`
    );
    return false;
  }
}

async function getInlinkDataLimit(pageName, numDocuments) {
  try {
    const cursor = db
      .collection("datuPages")
      .find({ pageName: pageName })
      .limit(numDocuments); // Apply the limit here

    return await cursor.toArray();
  } catch (error) {
    console.log(
      `Error loading data from DB for page ${pageName}: ${error}`
    );
    return false;
  }
}

module.exports = { connectToDb, getDb, getInlinkData, getInlinkDataLimit };
