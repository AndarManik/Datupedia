const WebSocket = require("ws");
const { removeEditSpans } = require("../DatuPageHandlers/DatuParser");
const ArticleGenerator = require("../DatuPageHandlers/ArticleGenerator");
const DatuChat = require("../DatuPageHandlers/DatuChat");
const InlinkRetreival = require("../DatuPageHandlers/InlinkRetreival");
const InlinkCluster = require("../DatuPageHandlers/InlinkCluster");
const {
  getDb,
  getInlinkData,
  getInlinkDataLimit,
} = require("../APIs/MongoAPI");
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
        if (
          parsedMessage.pageId !== undefined &&
          parsedMessage.userId !== undefined
        ) {
          await this.initializeHome(
            ws,
            parsedMessage.pageId,
            parsedMessage.userId
          );
        }
        break;

      case "Get Home State":
        if (user && user.pageId !== undefined) {
          await this.sleep(250);
          await this.getHomeState(ws, user.pageId);
        }
        break;

      case "Get Recommendation":
        if (parsedMessage.pageId !== undefined) {
          await this.getRecommendation(ws, parsedMessage.pageId);
        }
        break;

      case "Initialize Cluster":
        if (
          parsedMessage.pageId !== undefined &&
          parsedMessage.userId !== undefined
        ) {
          await this.initializeCluster(
            ws,
            parsedMessage.pageId,
            parsedMessage.userId
          );
        }
        break;

      case "Initialize Article":
        if (parsedMessage.position !== undefined && user) {
          await this.initializeArticle(ws, parsedMessage.position, user);
        }
        break;

      case "Article Data Stream":
        if (
          user &&
          user.clusterId !== undefined &&
          user.pageId !== undefined &&
          user.position !== undefined
        ) {
          await this.sleep(250);
          await this.clusterDataStream(
            ws,
            user.clusterId,
            user.pageId,
            user.position
          );
        }
        break;

      case "RegenerateArticle":
        if (
          user &&
          user.clusterId !== undefined &&
          user.pageId !== undefined &&
          user.position !== undefined
        ) {
          await this.regenerateArticle(
            ws,
            user.clusterId,
            user.pageId,
            user.position
          );
        }
        break;

      case "Initialize Global Message":
        if (parsedMessage.userId !== undefined) {
          await this.initializeGlobalChat(ws, parsedMessage.userId);
        }
        break;
      case "Initial Message":
        if (
          parsedMessage.pageId !== undefined &&
          parsedMessage.userId !== undefined
        ) {
          await this.initialMessage(
            ws,
            parsedMessage.pageId,
            parsedMessage.userId
          );
        }
        break;

      case "Global Message":
          if (
            user &&
            user.isGenerating !== undefined &&
            user.chatLog !== undefined
          ) {
            await this.sendGlobalMessage(ws, user.isGenerating, user.chatLog);
            await this.sleep(350);
          }
          break;  

      case "Message":
        if (
          user &&
          user.isGenerating !== undefined &&
          user.chatLog !== undefined
        ) {
          await this.sleep(250);
          await this.sendMessage(ws, user.isGenerating, user.chatLog);
        }
        break;
      case "New Global Message":
          if (user && parsedMessage.message !== undefined) {
            await this.newGlobalMessage(ws, user, parsedMessage.message);
          }
          break;

      case "New Message":
        if (user && parsedMessage.message !== undefined) {
          await this.newMessage(ws, user, parsedMessage.message);
        }
        break;

      case "pong":
        break;

      case "disconnect":
        console.log("disconnect reached");
        if (parsedMessage.userId !== undefined) {
          this.users.delete(parsedMessage.userId);
        }
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

    const sizeTest = await getInlinkDataLimit(pageId, 22);

    if (sizeTest.length > 21) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Home Complete",
        })
      );
      return;
    }

    if (sizeTest.length !== 0) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Home Small",
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
        state: "5",
      })
    );
    await retreivalPromise;
    this.inlinkRetreivers.delete(pageId);
  }

  async getHomeState(ws, pageId) {
    if (this.inlinkRetreivers.has(pageId)) {
      const inlinkRetreiver = this.inlinkRetreivers.get(pageId);
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
      if (await InlinkRetreival.isLargeEnough(pageId)) {
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
      return;
    }

    if (await this.isClusterDone(pageId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Load Complete",
        })
      );
      return;
    }

    const processPromise = this.inlinkClusterProcess(pageId);
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

    const data = await collection.findOne({ _id: pageName + "VERSION" });
    if (data) {
      if (!data.version) {
        console.log("no version");
        return false;
      }
      if (data.version !== 1.3) {
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

  async initializeArticle(ws, position, user) {
    const clusterId = user.pageId + position;
    user.clusterId = clusterId;
    user.position = position;
    if (this.articleGenerators.has(clusterId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: `Generating Article`,
        })
      );
      return;
    }

    const articleGenerator = new ArticleGenerator(user.pageId, position);
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

  async clusterDataStream(ws, clusterId, pageId, position) {
    if (!this.articleGenerators.has(clusterId)) {
      const parsedText = await ArticleGenerator.getParsedText(pageId, position);
      ws.send(
        JSON.stringify({
          status: "success",
          message: "Article Finished",
          clusterData: `${parsedText}`,
        })
      );
      return;
    }

    const generator = this.articleGenerators.get(clusterId);
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

  async regenerateArticle(ws, clusterId, pageId, position) {
    if (this.articleGenerators.has(clusterId)) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: `Generating Article`,
        })
      );
      return;
    }
    const generator = new ArticleGenerator(pageId, position);
    await generator.resetArticle();

    const generatorPromise = generator.generatePage();
    this.articleGenerators.set(clusterId, generator);

    ws.send(
      JSON.stringify({
        status: "success",
        message: `Generating Article`,
      })
    );

    await generatorPromise;

    this.articleGenerators.delete(clusterId);
  }

  async initializeGlobalChat(ws, userId) {
    const user = {
      chatLog: [],
      isGenerating: false,
    };
    this.users.set(userId, user);

    const message = { assistant: `<p>Hello! I'm Datupedia, your go-to chatbot for reasoning with facts. I have access to Wikipedia to ensure that my responses are factual and well-informed. Feel free to ask me anything!<span citation="[0,1]">[1]</span><span citation="[0,2]">[2]</span></p>` };
    user.chatLog.push(message);

    ws.send(
      JSON.stringify({
        status: "success",
        message: "Global Message",
        content: message.assistant,
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

  async sendGlobalMessage(ws, isGenerating, chatLog) {
    if (!isGenerating) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: `End Global Message`,
          content: chatLog[chatLog.length - 1].assistant,
        })
      );
      return;
    }
    ws.send(
      JSON.stringify({
        status: "success",
        message: `Global Message`,
        content: chatLog[chatLog.length - 1].assistant,
      })
    );
  }

  async sendMessage(ws, isGenerating, chatLog) {
    if (!isGenerating) {
      ws.send(
        JSON.stringify({
          status: "success",
          message: `End Message`,
          content: chatLog[chatLog.length - 1].assistant,
        })
      );
      return;
    }
    ws.send(
      JSON.stringify({
        status: "success",
        message: `Message`,
        content: chatLog[chatLog.length - 1].assistant,
      })
    );
  }

  async newGlobalMessage(ws, user, content) {
    user.isGenerating = true;
    const userMessage = {};
    userMessage.user = content;
    user.chatLog.push(userMessage);

    const {messageStream, nearestText} = await DatuChat.generateGlobalMessage(
      user.chatLog
    );
    const botMessage = {};
    botMessage.assistant = ``;
    user.chatLog.push(botMessage);

    ws.send(
      JSON.stringify({
        status: "success",
        message: `Citations`,
        citations: nearestText,
      })
    )

    ws.send(
      JSON.stringify({
        status: "success",
        message: `Global Message`,
        content: "",
      })
    );

    let prevChunk = null;
    console.log(messageStream);
    for await (const chunk of messageStream) {
      if (prevChunk !== null) {
        botMessage.assistant += prevChunk.choices[0].delta.content;
      }
      prevChunk = chunk;
    }
    user.isGenerating = false;
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = WebSocketHandler;
