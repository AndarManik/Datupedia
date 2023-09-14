const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = "mongodb+srv://Datupedia:Datupedia@cluster0.n7xs4hq.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
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
