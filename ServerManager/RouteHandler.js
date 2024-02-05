const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const DatuChat = require("../DatuPageHandlers/DatuChat");
const WikipediaAPI = require("../APIs/WikipediaAPI");

class RouteHandler {
  constructor(app) {
    this.app = app;
    this.wikipediaAPI = new WikipediaAPI();
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.get("/", this.handleRoot.bind(this));
    this.app.get("/chat", this.handleChat.bind(this));
    this.app.get("/openapi.yaml", this.handleOpenApi.bind(this));
    this.app.get("/.well-known/ai-plugin.json", this.handleAiPlugin.bind(this));
    this.app.post("/api/stringsearch", this.textBasedFilteredSearch.bind(this));
    this.app.post(
      "/api/stringsearchglobal",
      this.textBasedGlobalSearch.bind(this)
    );
    this.app.post("/api/getRandom", this.getRandom.bind(this));
    this.app.post("/api/enrichSimpleQuery", this.enrichSimpleQuery.bind(this));
  }

  handleRoot(req, res) {
    fs.readFile(
      path.join(__dirname, "../public/Home.html"),
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
  }

  async handleChat(req, res) {
    try {
      const filePath = path.join(__dirname, "../public/DatuChat.html");
      const fileContent = fs.readFileSync(filePath, "utf-8");
      let renderedHtml = fileContent.replace(/{{userID}}/g, uuidv4());
      renderedHtml = renderedHtml.replace(/{{wss}}/g, process.env.WSS);
      res.send(renderedHtml);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }

  async textBasedFilteredSearch(req, res) {
    const searchString = req.body.searchString; // A text string
    const articleFilters = req.body.articleFilters; // Array of strings, sent as comma-separated values
    const k = parseInt(req.body.k, 10); // A number
  
    // Check for missing arguments
    if (!searchString) {
      return res.status(400).json({ error: "Missing argument: searchString" });
    }
    if (!articleFilters) {
      return res.status(400).json({ error: "Missing argument: articleFilters" });
    }
    if (isNaN(k)) { // Using isNaN to check if k is not a number after parsing
      return res.status(400).json({ error: "Missing or invalid argument: k" });
    }
  
    try {
      const searchResults = await DatuChat.textBasedFilteredSearch(
        searchString,
        articleFilters,
        k
      );
      res.status(200).json(searchResults);
    } catch (error) {
      console.error("Error during text-based filtered search:", error);
      if (error.statusCode === 500) {
        res.status(500).json({ error: "Server error with valid input" });
      } else {
        res.status(error.statusCode || 500).json({ error: error.message || "Internal server error" });
      }
    }
  }
  

  async textBasedGlobalSearch(req, res) {
    const searchString = req.body.searchString; // A text string
    const k = parseInt(req.body.k, 10); // A number
    res.json(await DatuChat.textBasedSearch(searchString, k));
  }

  async enrichSimpleQuery(req, res) {
    const simpleQuery = req.body.simpleQuery; // A text string
    res.json(await DatuChat.enrichQuery(simpleQuery));
  }

  handleOpenApi(req, res) {
    const filePath = path.join(__dirname, "../public/openapi.yaml"); // Update the path to where your openapi.yaml file is located
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
        return;
      }
      res.type("yaml").send(data);
    });
  }

  handleAiPlugin(req, res) {
    const filePath = path.join(__dirname, "../public/ai-plugin.json"); // Update the path to where your openapi.yaml file is located
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
        return;
      }
      res.type("yaml").send(data);
    });
  }

  async getRandom(req, res) {
    const n = parseInt(req.body.n, 10); // A number
    res.json(await DatuChat.getRandom(n));
  }
}

module.exports = RouteHandler;
