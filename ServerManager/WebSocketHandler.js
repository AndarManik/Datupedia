const WebSocket = require("ws");
const DatuChat = require("../DatuPageHandlers/DatuChat");

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.users = new Map();
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
      case "Initialize Global Message":
        if (parsedMessage.userId !== undefined) {
          await this.initializeGlobalChat(ws, parsedMessage.userId);
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

      case "New Global Message":
        if (user && parsedMessage.message !== undefined) {
          await this.newGlobalMessage(ws, user, parsedMessage.message);
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

  async initializeGlobalChat(ws, userId) {
    const user = {
      chatLog: [],
      isGenerating: false,
    };
    this.users.set(userId, user);

    const message = {
      assistant: `<p>I'm Datupedia, your go-to chatbot for reasoning with facts. I have access to Wikipedia to ensure that my responses are factual and well-informed. Feel free to ask me anything!<sup citation="[0,1]">[1]</sup><sup citation="[0,2]">[2]</sup></p>`,
    };
    user.chatLog.push(message);

    ws.send(
      JSON.stringify({
        status: "success",
        message: "Global Message",
        content: message.assistant,
      })
    );
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

  async newGlobalMessage(ws, user, content) {
    user.isGenerating = true;
    const userMessage = {};
    userMessage.user = content;
    user.chatLog.push(userMessage);

    const { messageStream, nearestText } = await DatuChat.generateGlobalMessage(
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
    );

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
