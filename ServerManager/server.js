require("dotenv").config();
const express = require("express");
const path = require("path");
const http = require("http");
const app = express();
const server = http.createServer(app);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
const RouteHandler = require("./RouteHandler");
const WebSocketHandler = require("./WebSocketHandler");
const { connectToDb } = require("../APIs/MongoAPI");

new RouteHandler(app);
new WebSocketHandler(server);
connectToDb()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server is running on port http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
  });

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});
