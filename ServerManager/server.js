require("dotenv").config();
const express = require("express");
const WikipediaAPI = require("../APIs/WikipediaAPI");
const DatuPage = require("../DatuPageHandlers/DatuPage");
const { connectToDb } = require("../APIs/MongoAPI");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const wikipediaAPI = new WikipediaAPI();
const { v4: uuidv4 } = require("uuid");
const { removeEditSpans } = require("../DatuPageHandlers/DatuParser");
const ArticleGenerator = require("../DatuPageHandlers/ArticleGenerator");
const VectorSearch = require("../DatuPageHandlers/VectorSearch");
const DatuChat = require("../DatuPageHandlers/DatuChat");

const vectorSearch = new VectorSearch();
const users = new Map();
const datuPages = new Map();
const generators = new Map();

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

app.get("/", (req, res) => {
  fs.readFile(
    path.join(__dirname, "../public/search.html"),
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

app.get("/test/", async (req, res) => {
  const results = await vectorSearch.ragResponse("Ventriloquism", "Who are some notable ventriloquists?", 7);
  console.log(results);
  res.json(results);  // Send the results back as a response
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
    const filePath = path.join(__dirname, "../public/Datuhome.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
    renderedHtml = renderedHtml.replace(/{{userID}}/g, uuidv4());
    renderedHtml = renderedHtml.replace(/{{wss}}/g, process.env.WSS);
    res.send(renderedHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/datu/:pagename/article", async (req, res) => {
  try {
    const pagename = decodeURIComponent(
      req.params.pagename.replaceAll("_", " ")
    );
    const filePath = path.join(__dirname, "../public/Datupage.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
    renderedHtml = renderedHtml.replace(/{{userID}}/g, uuidv4());
    renderedHtml = renderedHtml.replace(/{{wss}}/g, process.env.WSS);
    res.send(renderedHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/datu/:pagename/chat", async (req, res) => {
  try {
    const pagename = decodeURIComponent(
      req.params.pagename.replaceAll("_", " ")
    );
    const filePath = path.join(__dirname, "../public/Datuchat.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
    renderedHtml = renderedHtml.replace(/{{userID}}/g, uuidv4());
    renderedHtml = renderedHtml.replace(/{{wss}}/g, process.env.WSS);
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
    const filePath = path.join(__dirname, "../public/Wikipage.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
    const page = await wikipediaAPI.getContent(pagename);
    renderedHtml = renderedHtml.replace(/{{content}}/g, page);
    res.send(renderedHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/how-it-works", async (req, res) => {
  fs.readFile(
    path.join(__dirname, "../public/how.html"),
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

app.get("/about", async (req, res) => {
  fs.readFile(
    path.join(__dirname, "../public/about.html"),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findRandomPageWithInlinks(minInlinks = 350) {
  const randomPage = await wikipediaAPI.getRandom();
  const inlinks = await wikipediaAPI.getInlinks(randomPage);
  if (inlinks.length >= minInlinks) {
    return randomPage;
  } else {
    await sleep(500); // Waits for 2 seconds before the next recursive call
    return findRandomPageWithInlinks(minInlinks);
  }
}

app.get("/random", async (req, res) => {
  try {
    const suitablePage = await findRandomPageWithInlinks();
    res.redirect(`/datu/${encodeURIComponent(suitablePage)}`);
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
    user = users.get(parsedMessage.userId);

    switch (parsedMessage.type) {
      case "InitializeDatuPage":
        initializeDatuPage(ws, parsedMessage);
        break;
      case "Loading data stream":
        await loadingDataStream(ws, user);
        break;
      case "GetClusterData":
        await getClusterData(ws, parsedMessage, user);
        break;
      case "Cluster data stream":
        await clusterDataStream(ws, user);
        break;
      case "Get recommendation":
        await getRecommendation(ws, parsedMessage, user);
        break;
      case "RegenerateArticle":
        await regenerateArticle(ws, user);
        break;
      case "Initial Message":
        console.log("Initial Message");
        await initialMessage(ws, parsedMessage.pageId, parsedMessage.userId);
        break;
      case "Message":
        await sendMessage(ws, user);  
        break;
      case "New Message":
        console.log("New Message");
        await newMessage(ws, user, parsedMessage.message) ;
        break;
      case "pong":
        break;
      case "disconnect":
        users.delete(parsedMessage.userId);
        break;
    }
  });
});

function initializeDatuPage(ws, parsedMessage) {
  user = {
    pageId: parsedMessage.pageId,
  };
  users.set(parsedMessage.userId, user);

  if (!datuPages.has(parsedMessage.pageId)) {
    const datuPageInstance = new DatuPage(parsedMessage.pageId);
    datuPageInstance.fetchData(datuPages);
    datuPages.set(parsedMessage.pageId, datuPageInstance);
  }

  ws.send(
    JSON.stringify({
      status: "success",
      message: "Loading state",
      state: "0",
    })
  );
}

async function loadingDataStream(ws, user) {
  if (datuPages.has(user.pageId)) {
    const state = datuPages.get(user.pageId).getState();
    ws.send(
      JSON.stringify({
        status: "success",
        message: "Loading state",
        state,
      })
    );
  } else {
    if (await DatuPage.isLargeEnough(user.pageId)) {
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
}

async function getClusterData(ws, parsedMessage, user) {
  const clusterId = user.pageId + parsedMessage.position;
  user.clusterId = clusterId;
  user.position = parsedMessage.position;
  if (
    !(await ArticleGenerator.hasInData(user.pageId, parsedMessage.position))
  ) {
    return;
  }

  if (!generators.has(clusterId)) {
    const generator = new ArticleGenerator(user.pageId, parsedMessage.position);
    generator.generatePage(generators);
    generators.set(clusterId, generator);
  }
  ws.send(
    JSON.stringify({
      status: "success",
      message: `generating page`,
    })
  );
}

async function clusterDataStream(ws, user) {
  if (!generators.has(user.clusterId)) {
    const parsedText = await ArticleGenerator.getParsedText(
      user.pageId,
      user.position
    );
    ws.send(
      JSON.stringify({
        status: "success",
        message: "Cluster data finished",
        clusterData: `${parsedText}`,
      })
    );
    return;
  }

  const generator = generators.get(user.clusterId);
  const wikitext = generator.getWikiText();
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
  const recommendation = removeEditSpans(
    await wikipediaAPI.getContent(pageName)
  ).replace(/\/wiki\//g, "/datu/");
  ws.send(
    JSON.stringify({
      status: "success",
      message: "Recommendations",
      clusterData: recommendation,
    })
  );
}

async function regenerateArticle(ws, user) {
  const generator = new ArticleGenerator(user.pageId, user.position);
  await generator.resetArticle();

  generator.generatePage(generators);
  generators.set(user.clusterId, generator);

  ws.send(
    JSON.stringify({
      status: "success",
      message: `generating page`,
    })
  );
}

async function initialMessage(ws, pageId, userId) {
  const user = {
    pageId,
    chatLog:  [],
    isGenerating: true,
  };
  users.set(userId, user);

  const messageStream = await DatuChat.generateInitialMessage(user.pageId);
  console.log("here");
  const message = {assistant: ""};
  user.chatLog.push(message)
  
  ws.send(
    JSON.stringify({
      status: "success",
      message: `Message`,
      content: message.assistant,
    })
  );

  let prevChunk = null;
  for await (const chunk of messageStream) {
    if (prevChunk !== null) {
      message.assistant += prevChunk.choices[0].delta.content;
    }
    prevChunk = chunk;
  }
  user.isGenerating = false;
}

async function sendMessage(ws, user) {
  if(!user.isGenerating) {
    ws.send(
      JSON.stringify({
        status: "success",
        message: `End Message`,
        content: user.chatLog[user.chatLog.length - 1].assistant,
      })
    );
    return;
  }
  ws.send(
    JSON.stringify({
      status: "success",
      message: `Message`,
      content: user.chatLog[user.chatLog.length - 1].assistant,
    })
  );
}

async function newMessage(ws, user, content) {
  user.isGenerating = true;
  const userMessage = {};
  userMessage.user = content;
  user.chatLog.push(userMessage);

  const messageStream = await DatuChat.generateMessage(user.chatLog, user.pageId);
  const botMessage = {};
  botMessage.assistant = "";
  user.chatLog.push(botMessage)
  
  ws.send(
    JSON.stringify({
      status: "success",
      message: `Message`,
      content: "",
    })
  );

  let prevChunk = null;
  for await (const chunk of messageStream) {
    if (prevChunk !== null) {
      botMessage.assistant += prevChunk.choices[0].delta.content;
    }
    prevChunk = chunk;
  }
  user.isGenerating = false;
}

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});
