require("dotenv").config();
const express = require("express");
const path = require("path");
const http = require("http");
const app = express();
const server = http.createServer(app);

const RouteHandler = require("./RouteHandler");
const WebSocketHandler = require("./WebSocketHandler");

const WikipediaAPI = require("../APIs/WikipediaAPI");
const { connectToDb } = require("../APIs/MongoAPI");
const wikipediaAPI = new WikipediaAPI();


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Database connection
connectToDb()
  .then(() => {
    // Only start the server after database connection is established
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server is running on port http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
  });

new RouteHandler(app, wikipediaAPI);

new WebSocketHandler(server);

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});
