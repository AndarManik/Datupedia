require("dotenv").config();
const express = require("express");

const WikipediaAPI = require("./APIs/WikipediaAPI");
const DatuPage = require("./DatuPageHandlers/DatuPage");
const { connectToDb } = require("./APIs/MongoAPI");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const wikipediaAPI = new WikipediaAPI();
const { v4: uuidv4 } = require("uuid");
const {removeEditSpans} = require("./DatuPageHandlers/DatuParser");
const users = [];

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
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

app.get("/datu/:pagename", async (req, res) => {
  try {
    const pagename = decodeURIComponent(
      req.params.pagename.replaceAll("_", " ")
    );
    const filePath = path.join(__dirname, "public/Datupage.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
    renderedHtml = renderedHtml.replace(/{{userID}}/g, uuidv4());
    renderedHtml = renderedHtml.replace(/{{wss}}/g, process.env.WSS)
    res.send(renderedHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/wiki/:pagename", async (req, res) => {
  try {
    const pagename = decodeURIComponent(
      req.params.pagename.replaceAll("_", " ")
    );
    const page = await wikipediaAPI.getContent(pagename);
    res.send(page);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    ws.send(JSON.stringify({ status: "ping" }));
  });
}, 10000); // Send "ping" every 10 seconds

wss.on("connection", (ws) => {
  ws.on("message", async (message) => {
    const parsedMessage = JSON.parse(message);
    user = users[parsedMessage.userId];

    switch (parsedMessage.type) {
      case "InitializeDatuPage":
        initializeDatuPage(ws, parsedMessage, user);
        break;
      case "Loading data stream":
        loadingDataStream(ws, user);
        break;
      case "GetClusterData":
        await getClusterData(ws, parsedMessage, user);
        break;
      case "Cluster data stream":
        clusterDataStream(ws, user);
        break;
      case "Get recommendation":
        await getRecommendation(ws, parsedMessage, user);
        break;
      case "RegenerateArticle":
        await regenerateArticle(ws, user);
        break;
      case "pong":
        break;
    }
  });
});

function initializeDatuPage(ws, parsedMessage, user) {
  const datuPageInstance = new DatuPage(parsedMessage.pageId);
  user = {
    connection: ws,
    datuPageInstance,
  };
  users[parsedMessage.userId] = user;
  datuPageInstance.fetchData();
  ws.send(
    JSON.stringify({
      status: "success",
      message: "Loading state",
      state: "Loading...",
    })
  );
}

function loadingDataStream(ws, user) {
  const state = user.datuPageInstance.getState();
  if (user.datuPageInstance.isFetchDone()) {
    if (user.datuPageInstance.isLargeEnough()) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "New DatuPage created",
        })
      );
      return;
    } else {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Not large enough",
        })
      );
      return;
    }
  }
  ws.send(
    JSON.stringify({
      status: "success",
      message: "Loading state",
      state,
    })
  );
}

async function getClusterData(ws, parsedMessage, user) {
  if (user && user.datuPageInstance) {
    if (!(await user.datuPageInstance.has(parsedMessage.position))) {
      return;
    }
    if (user.datuPageInstance.isGenerating()) {
      return;
    }
    user.datuPageInstance.position = parsedMessage.position;
    await user.datuPageInstance.generatePage();

    ws.send(
      JSON.stringify({
        status: "success",
        message: `generating page`,
      })
    );
  }
}

function clusterDataStream(ws, user) {
  const wikitext = user.datuPageInstance.getWikiText();
  if (user.datuPageInstance.isClusterFinished()) {
    const parsedText = user.datuPageInstance.getProcessedWikiText();
    ws.send(
      JSON.stringify({
        status: "success",
        message: "Cluster data finished",
        clusterData: `${parsedText}`,
      })
    );
    return;
  }
  ws.send(
    JSON.stringify({
      status: "Processing",
      message: `Cluster data stream`,
      clusterData: `${wikitext}`,
    })
  );
}

async function getRecommendation(ws, parsedMessage, user) {
  const pageName = parsedMessage.pageId;
  const recommendation = removeEditSpans(await wikipediaAPI.getContent(pageName)).replace(/\/wiki\//g, '/datu/');
  console.log(recommendation);
  ws.send(
    JSON.stringify({
      status: "success",
      message: "Recommendations",
      clusterData: recommendation,
    })
  );
}

async function regenerateArticle(ws, user) {
  if (user && user.datuPageInstance) {
    if (user.datuPageInstance.isGenerating()) {
      return;
    }
    await user.datuPageInstance.resetArticle();
    await user.datuPageInstance.generatePage();

    ws.send(
      JSON.stringify({
        status: "success",
        message: `generating page`,
      })
    );
  }
}

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});