const WebSocket = require("ws");
const DatuPage = require("../DatuPageHandlers/DatuPage");
const { removeEditSpans } = require("../DatuPageHandlers/DatuParser");
const ArticleGenerator = require("../DatuPageHandlers/ArticleGenerator");
const DatuChat = require("../DatuPageHandlers/DatuChat");

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.users = new Map();
    this.datuPages = new Map();
    this.generators = new Map();
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on("connection", (ws) => {
      ws.on("message", (message) => this.handleMessage(ws, message));
    });

    this.setupPingInterval();
  }

  async handleMessage(ws, message) {
    const parsedMessage = JSON.parse(message);
    const user = this.users.get(parsedMessage.userId);

    switch (parsedMessage.type) {
      case "InitializeDatuPage":
        this.initializeDatuPage(ws, parsedMessage);
        break;
      case "Loading data stream":
        await this.loadingDataStream(ws, user);
        break;
      case "GetClusterData":
        await this.getClusterData(ws, parsedMessage, user);
        break;
      case "Cluster data stream":
        await this.clusterDataStream(ws, user);
        break;
      case "Get recommendation":
        await this.getRecommendation(ws, parsedMessage, user);
        break;
      case "RegenerateArticle":
        await this.regenerateArticle(ws, user);
        break;
      case "Initial Message":
        console.log("Initial Message");
        await this.initialMessage(ws, parsedMessage.pageId, parsedMessage.userId);
        break;
      case "Message":
        await this.sendMessage(ws, user);
        break;
      case "New Message":
        console.log("New Message");
        await this.newMessage(ws, user, parsedMessage.message);
        break;
      case "pong":
        break;
      case "disconnect":
        this.users.delete(parsedMessage.userId);
        break;
    }
  }

  initializeDatuPage(ws, parsedMessage) {
    const user = {
      pageId: parsedMessage.pageId,
    };
    this.users.set(parsedMessage.userId, user);

    if (!this.datuPages.has(parsedMessage.pageId)) {
      const datuPageInstance = new DatuPage(parsedMessage.pageId);
      datuPageInstance.fetchData(this.datuPages);
      this.datuPages.set(parsedMessage.pageId, datuPageInstance);
    }

    ws.send(
      JSON.stringify({
        status: "success",
        message: "Loading state",
        state: "0",
      })
    );
  }

  async loadingDataStream(ws, user) {
    if (this.datuPages.has(user.pageId)) {
      const state = this.datuPages.get(user.pageId).getState();
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

  async getClusterData(ws, parsedMessage, user) {
    const clusterId = user.pageId + parsedMessage.position;
    user.clusterId = clusterId;
    user.position = parsedMessage.position;
    if (
      !(await ArticleGenerator.hasInData(user.pageId, parsedMessage.position))
    ) {
      return;
    }

    if (!this.generators.has(clusterId)) {
      const generator = new ArticleGenerator(
        user.pageId,
        parsedMessage.position
      );
      generator.generatePage(this.generators);
      this.generators.set(clusterId, generator);
    }
    ws.send(
      JSON.stringify({
        status: "success",
        message: `generating page`,
      })
    );
  }

  async clusterDataStream(ws, user) {
    if (!this.generators.has(user.clusterId)) {
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

    const generator = this.generators.get(user.clusterId);
    const wikitext = generator.getWikiText();
    ws.send(
      JSON.stringify({
        status: "Processing",
        message: `Cluster data stream`,
        clusterData: `${wikitext}`,
      })
    );
  }

  async getRecommendation(ws, parsedMessage, user) {
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

  async regenerateArticle(ws, user) {
    const generator = new ArticleGenerator(user.pageId, user.position);
    await generator.resetArticle();

    generator.generatePage(this.generators);
    this.generators.set(user.clusterId, generator);

    ws.send(
      JSON.stringify({
        status: "success",
        message: `generating page`,
      })
    );
  }

  async initialMessage(ws, pageId, userId) {
    const user = {
      pageId,
      chatLog: [],
      isGenerating: true,
    };
    this.users.set(userId, user);

    const messageStream = await DatuChat.generateInitialMessage(user.pageId);
    console.log("here");
    const message = { assistant: "" };
    user.chatLog.push(message);

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

  async sendMessage(ws, user) {
    if (!user.isGenerating) {
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

  async newMessage(ws, user, content) {
    user.isGenerating = true;
    const userMessage = {};
    userMessage.user = content;
    user.chatLog.push(userMessage);

    const messageStream = await DatuChat.generateMessage(
      user.chatLog,
      user.pageId
    );
    const botMessage = {};
    botMessage.assistant = "";
    user.chatLog.push(botMessage);

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

  setupPingInterval() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        ws.send(JSON.stringify({ status: "ping" }));
      });
    }, 10000); // Send "ping" every 10 seconds
  }
}

module.exports = WebSocketHandler;
