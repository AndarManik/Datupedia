const WebSocket = require("ws");
const { removeEditSpans } = require("../DatuPageHandlers/DatuParser");
const ArticleGenerator = require("../DatuPageHandlers/ArticleGenerator");
const DatuChat = require("../DatuPageHandlers/DatuChat");
const InlinkRetreival = require("../DatuPageHandlers/InlinkRetreival");
const InlinkCluster = require("../DatuPageHandlers/InlinkCluster");
const { getDb, getInlinkData } = require("../APIs/MongoAPI");
const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();
class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.users = new Map();
    this.inlinkRetreivers = new Map();
    this.articleGenerators = new Map();
    this.inlinkClusters = new Map();

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
      case "Initialize Home":
        await this.initializeHome(ws, parsedMessage.pageId, parsedMessage.userId);
        break;

      case "Get Home State":
        await this.sleep(250);
        await this.getHomeState(ws, user);
        break;

      case "Get Recommendation":
        await this.getRecommendation(ws, parsedMessage.pageId);
        break;

      case "Initialize Cluster":
        await this.initializeCluster(ws, parsedMessage.pageId, parsedMessage.userId);
        break;

      case "Initialize Article":
        await this.initializeArticle(ws, parsedMessage, user);
        break;

      case "Article Data Stream":
        await this.sleep(250);
        await this.clusterDataStream(ws, user);
        break;

      case "RegenerateArticle":
        await this.regenerateArticle(ws, user);
        break;

      case "Initial Message":
        await this.initialMessage(ws, parsedMessage.pageId, parsedMessage.userId);
        break;

      case "Message":
        await this.sleep(250);
        await this.sendMessage(ws, user);
        break;

      case "New Message":
        await this.newMessage(ws, user, parsedMessage.message);
        break;

      case "pong":
        break;

      case "disconnect":
        console.log("disconnect reached");
        this.users.delete(parsedMessage.userId);
        break;
    }
  }


  async initializeHome(ws, pageId, userId) {
    const user = { pageId };
    this.users.set(userId, user);

    if (this.inlinkRetreivers.has(pageId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Home Initialized",
          state: "1",
        })
      );
      return;
    }

    const inlinkRetreivalInstance = new InlinkRetreival(pageId);
    const retreivalPromise = inlinkRetreivalInstance.fetchData();
    this.inlinkRetreivers.set(pageId, inlinkRetreivalInstance);

    ws.send(
      JSON.stringify({
        status: "success",
        message: "Home Initialized",
        state: "1",
      })
    );
    await retreivalPromise;
    this.inlinkRetreivers.delete(pageId);
  }

  async getHomeState(ws, user) {
    if (this.inlinkRetreivers.has(user.pageId)) {
      const inlinkRetreiver = this.inlinkRetreivers.get(user.pageId);
      if (inlinkRetreiver.isFinished) {
        if (inlinkRetreiver.isLargeEnough) {
          ws.send(
            JSON.stringify({
              status: "success",
              message: "Home Complete",
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              status: "success",
              message: "Home Small",
            })
          );
        }
      } else {
        const state = inlinkRetreiver.state;
        ws.send(
          JSON.stringify({
            status: "success",
            message: "Home State",
            state,
          })
        );
      }
    } else {
      if (await InlinkRetreival.isLargeEnough(user.pageId)) {
        ws.send(
          JSON.stringify({
            status: "success",
            message: "Home Complete",
          })
        );
        return;
      } else {
        ws.send(
          JSON.stringify({
            status: "success",
            message: "Home Small",
          })
        );
        return;
      }
    }
  }

  async initializeCluster(ws, pageId, userId) {
    const user = {
      pageId,
    };
    this.users.set(userId, user);

    if (this.inlinkClusters.has(pageId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Loading Cluster",
        })
      );
      return
    }

    if(await this.isClusterDone(pageId)){
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Load Complete",
        })
      );
      return;
    }

    const processPromise = this.inlinkClusterProcess(pageId)
    this.inlinkClusters.set(pageId, processPromise);
    ws.send(
      JSON.stringify({
        status: "success",
        message: "Loading Cluster",
      })
    );

    await processPromise;

    ws.send(
      JSON.stringify({
        status: "success",
        message: "Load Complete",
      })
    );

    this.inlinkClusters.delete(pageId);
  }

  async isClusterDone(pageName) {
    const db = getDb();
    const collection = db.collection("datuCluster");

    const data = await collection.findOne({ _id: pageName + "VERSION"});
    if (data) {
      if(!data.version) {
        console.log("no version");
        return false;
      }
      if(data.version !== 1.3) {
        console.log("wrong version");
        return false;
      }

      return true;
    }
    console.log("no data");
    return false;
  }

  async inlinkClusterProcess(pageId) {
    const data = await getInlinkData(pageId);
    const inlinkClusterInstance = new InlinkCluster(pageId, 6, data);
    await inlinkClusterInstance.saveVersion();
    await inlinkClusterInstance.saveNodeAndChildren();
  }

  async initializeArticle(ws, parsedMessage, user) {
    const clusterId = user.pageId + parsedMessage.position;
    user.clusterId = clusterId;
    user.position = parsedMessage.position;
    if (this.articleGenerators.has(clusterId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: `Generating Article`,
        })
      );
      return;
    }

    const articleGenerator = new ArticleGenerator(
      user.pageId,
      parsedMessage.position
    );
    const generatorPromise = articleGenerator.generatePage();
    this.articleGenerators.set(clusterId, articleGenerator);

    ws.send(
      JSON.stringify({
        status: "success",
        message: `Generating Article`,
      })
    );

    await generatorPromise;

    this.articleGenerators.delete(clusterId);
  }

  async clusterDataStream(ws, user) {
    if (!this.articleGenerators.has(user.clusterId)) {
      const parsedText = await ArticleGenerator.getParsedText(
        user.pageId,
        user.position
      );
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Article Finished",
          clusterData: `${parsedText}`,
        })
      );
      return;
    }

    const generator = this.articleGenerators.get(user.clusterId);
    const wikitext = generator.getWikiText();
    ws.send(
      JSON.stringify({
        status: "Processing",
        message: `Article Data Stream`,
        clusterData: `${wikitext}`,
      })
    );
  }

  async getRecommendation(ws, pageId) {
    const pageName = pageId;
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
    if (this.articleGenerators.has(user.clusterId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: `Generating Article`,
        })
      );
      return;
    }
    const generator = new ArticleGenerator(user.pageId, user.position);
    await generator.resetArticle();

    const generatorPromise = generator.generatePage();
    this.articleGenerators.set(user.clusterId, generator);

    ws.send(
      JSON.stringify({
        status: "success",
        message: `Generating Article`,
      })
    );

    await generatorPromise;

    this.articleGenerators.delete(user.clusterId);
  }

  async initialMessage(ws, pageId, userId) {
    const user = {
      pageId,
      chatLog: [],
      isGenerating: true,
    };
    this.users.set(userId, user);

    const messageStream = await DatuChat.generateInitialMessage(user.pageId);
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
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebSocketHandler;
