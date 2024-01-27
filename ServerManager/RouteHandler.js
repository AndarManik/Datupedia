const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const DatuChat = require("../DatuPageHandlers/DatuChat");

class RouteHandler {
  constructor(app, wikipediaAPI) {
    this.app = app;
    this.wikipediaAPI = wikipediaAPI;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.get("/", this.handleRoot.bind(this));
    this.app.get("/suggestions", this.handleSuggestions.bind(this));
    this.app.get("/random", this.handleRandom.bind(this));
    this.app.get("/datu/:pagename", this.handleDatuPageHome.bind(this));
    this.app.get(
      "/datu/:pagename/article",
      this.handleDatuPageArticle.bind(this)
    );
    this.app.get("/datu/:pagename/chat", this.handleDatuPageChat.bind(this));
    this.app.get("/wiki/:pagename/article", this.handleWikiPage.bind(this));
    this.app.get("/wiki/:pagename", this.handleWikiPage.bind(this));
    this.app.get("/how-it-works", this.handleHow.bind(this));
    this.app.get("/about", this.handleAbout.bind(this));
    this.app.get("/random", this.handleRandom.bind(this));
    this.app.get("/sitemap.xml", this.handleSiteMap.bind(this));
    this.app.get("/chat", this.handleChat.bind(this));
    this.app.post("/api/stringsearch", this.textBasedFilteredSearch.bind(this));
    this.app.post("/api/stringsearchglobal", this.textBasedGlobalSearch.bind(this));
    this.app.get("/openapi.yaml", this.handleOpenApi.bind(this));
  }

  handleRoot(req, res) {
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
  }

  async handleSuggestions(req, res) {
    const query = req.query.query;
    const suggestions = await this.wikipediaAPI.searchSuggestions(query);
    res.json(suggestions);
  }

  async handleDatuPageHome(req, res) {
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
  }

  async handleDatuPageArticle(req, res) {
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
  }

  async handleDatuPageChat(req, res) {
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
  }

  async handleWikiPage(req, res) {
    try {
      const pagename = decodeURIComponent(
        req.params.pagename.replaceAll("_", " ")
      );
      const filePath = path.join(__dirname, "../public/Wikipage.html");
      const fileContent = fs.readFileSync(filePath, "utf-8");
      let renderedHtml = fileContent.replace(/{{pagename}}/g, pagename);
      const page = await this.wikipediaAPI.getContent(pagename);
      renderedHtml = renderedHtml.replace(/{{content}}/g, page);
      res.send(renderedHtml);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }

  handleSiteMap(req, res) {
    fs.readFile(
      path.join(__dirname, "../public/sitemap.xml"),
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

  handleHow(req, res) {
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
  }

  handleAbout(req, res) {
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
  }

  async handleRandom(req, res) {
    try {
      const suitablePage = await this.findRandomPageWithInlinks();
      res.redirect(`/datu/${encodeURIComponent(suitablePage)}`);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
  async findRandomPageWithInlinks(minInlinks = 350) {
    const randomPage = await this.wikipediaAPI.getRandom();
    const inlinks = await this.wikipediaAPI.getInlinks(randomPage);
    if (inlinks.length >= minInlinks) {
      return randomPage;
    } else {
      await this.sleep(100);
      return this.findRandomPageWithInlinks(minInlinks);
    }
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async handleChat(req, res) {
    try {
      const filePath = path.join(__dirname, "../public/GlobalChat.html");
      const fileContent = fs.readFileSync(filePath, "utf-8");
      let renderedHtml = fileContent.replace(/{{userID}}/g, uuidv4());
      renderedHtml = renderedHtml.replace(/{{wss}}/g, process.env.WSS);
      res.send(renderedHtml);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }

  async textBasedFilteredSearch(req, res) {;
    const searchString = req.body.searchString; // A text string
    const articleFilters = req.body.articleFilters; // Array of strings, sent as comma-separated values
    const k = parseInt(req.body.k, 10); // A number
    res.json(await DatuChat.textBasedFilteredSearch(searchString, articleFilters,k));
  }

  async textBasedGlobalSearch(req, res) {;
    const searchString = req.body.searchString; // A text string
    const k = parseInt(req.body.k, 10); // A number
    res.json(await DatuChat.textBasedSearch(searchString,k));
  }

  handleOpenApi(req, res) {
    const filePath = path.join(__dirname, "../public/openapi.yaml"); // Update the path to where your openapi.yaml file is located
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
        return;
      }
      res.type('yaml').send(data);
    });
  }
}

module.exports = RouteHandler;
