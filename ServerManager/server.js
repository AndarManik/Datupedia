require("dotenv").config();
const express = require("express");
const WikipediaAPI = require("../APIs/WikipediaAPI");
const { connectToDb } = require("../APIs/MongoAPI");
const path = require("path");
const http = require("http");
const app = express();
const server = http.createServer(app);
const wikipediaAPI = new WikipediaAPI();

const RouteHandler = require("./RouteHandler"); // Import RouteHandler
const WebSocketHandler = require("./WebSocketHandler"); // Import WebSocketManager


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
// Rate Limiting

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
