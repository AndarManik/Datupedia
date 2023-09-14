const express = require("express");
const rateLimit = require("express-rate-limit");
const WikipediaAPI = require("./WikipediaAPI");
const TextExtractor = require("./TextExtractor");
const DatuPage = require("./DatuPage");
const { connectToDb, getDb } = require("./MongoAPI");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const wikipediaAPI = new WikipediaAPI();
const textExtractor = new TextExtractor();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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

app.get("/", (req, res) => {
  fs.readFile(
    path.join(__dirname, "public/search.html"),
    "utf8",
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
        return;
      }
      res.send(data);
    }
  );
});

app.get("/suggestions", async (req, res) => {
  const query = req.query.query;
  const suggestions = await wikipediaAPI.searchSuggestions(query);
  res.json(suggestions);
});

app.get("/:pagename/home", async (req, res) => {
  try {
    const pagename = req.params.pagename;

    // Read the Datupage.html file
    const filePath = path.join(__dirname, "public/Datupage.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Replace placeholder with the actual page name
    const renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);

    // Send the HTML file to the client
    res.write(renderedHtml);

    // Notify WebSocket clients that fetching has started
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(`Fetching data for ${pagename}...`);
      }
    });

    const datuPage = new DatuPage(
      pagename,
      getDb(),
      wikipediaAPI,
      textExtractor
    );
    await datuPage.fetchData();
    console.log("fetchfinished");
    // Notify WebSocket clients that fetching is complete
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(`Data fetched: ${datuPage.displayFetchedData()}`);
      }
    });

    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});


