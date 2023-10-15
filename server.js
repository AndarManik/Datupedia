require("dotenv").config();
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
const OpenaiApi = require("./OpenaiAPI");
const openai = new OpenaiApi(process.env.OPENAI_API_KEY);
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const wikipediaAPI = new WikipediaAPI();
const textExtractor = new TextExtractor();

const users = [];

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
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

app.get("/datu/:pagename", async (req, res) => {
  try {
    const pagename = decodeURIComponent(
      req.params.pagename.replaceAll("_", " ")
    );
    const filePath = path.join(__dirname, "public/Datupage.html");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
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
    const page = await wikipediaAPI.get_page_content(pagename);
    res.send(page);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

wss.on("connection", (ws) => {
  ws.on("message", async (message) => {
    const parsedMessage = JSON.parse(message);
    user = users[parsedMessage.userId];
    switch (parsedMessage.type) {
      case "InitializeDatuPage":
        const datuPageInstance = await initializeDatuPage(
          parsedMessage.pageId,
          ws
        );
        user = {
          connection: ws,
          datuPageInstance,
        };
        users[parsedMessage.userId] = user;
        ws.send(
          JSON.stringify({
            status: "success",
            message: "New DatuPage created.",
          })
        );
        break;
      case "GetClusterData":
        if (user && user.datuPageInstance) {
          console.log("GetClusterData");
          user.datuPageInstance.position = parsedMessage.position;
          const isLargeEnough = await user.datuPageInstance.generatePage();
          if (isLargeEnough) {
            ws.send(
              JSON.stringify({
                status: "success",
                message: `generating page`,
              })
            );
            break;
          }
          ws.send(
            JSON.stringify({
              status: "success",
              message: `Cluster data finished`,
              clusterData: "Cluster too small to generate page.",
            })
          );
        }
        break;
      case "Cluster data stream":
        const wikitext = user.datuPageInstance.getWikiText();
        if (user.datuPageInstance.isFinished()) {
          
          const parsedText = user.datuPageInstance.getProcessedWikiText();
          console.log(parsedText)
          ws.send(
            JSON.stringify({
              status: "success",
              message: "Cluster data finished",
              clusterData: `${parsedText}`,
            })
          );
          break;
        }
        ws.send(
          JSON.stringify({
            status: "Processing",
            message: `Cluster data stream`,
            clusterData: `${wikitext}`,
          })
        );
        break;

      default:
        ws.send(JSON.stringify({ status: "error", message: "Invalid type." }));
        break;
    }
  });
});

const initializeDatuPage = async (pagename, ws) => {
  try {
    const datuPage = new DatuPage(
      pagename,
      getDb(),
      wikipediaAPI,
      textExtractor,
      openai,
      ws
    );
    await datuPage.fetchData();
    await datuPage.clusterData();
    return datuPage;
  } catch (err) {
    console.error(err);
    return null;
  }
};

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});
