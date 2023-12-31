const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const { getDb } = require("../APIs/MongoAPI");

class DatuChat {

  static async generateInitialMessage(pageName) {
    return await openai.gpt4Stream(
      `You are Datupedia, a chatbot which specializes in a specific page on Wikipedia. The page you specialize in is '${pageName}', meaning for each query you receive from the user you will also be provided extra context.`,
      "Generate a simplified intro message, which states your name, what you specialize in, and some potential questions the user can ask. This intro message must be less than 100 words"
    );
  }

  static async generateMessage(chatLog, pageName) {
    console.log(chatLog);
    return await this.ragResponse(pageName, chatLog.slice(-8), 10);
  }

  static async ragResponse(pageName, chatLog, k) {
    const convertedChat = chatLog.map((message) => {
      const role = Object.keys(message)[0];
      const content = message[role];
      return { role, content };
    });

    const nearestText = await this.findNearestTexts(
      pageName,
      convertedChat,
      k
    );
    const systemPrompt = `
    "What you know": '${JSON.stringify(
      nearestText
    )}'
    Response Guidlines:

    1. "What you know" is up to date and can be relied on. 
    2. Use only "What you know" to aid your response for the users query, do not mention that a query is outside of the knowledge cutoff and instead utilize "What you know". 
    3. Output your text using html tags for styling text such as <p> <strong> <i> <h1> <li> and so on. 
    4. If no styling is needed place the output inside of a <p> tag. Break up long text into multiple <p> tags
    5. Add <a> tags as hyperlinks in your response. These should link to the titles in "What you know", these tags should have target="_blank". 
    6. Keep your responses short at around 2-3 paragraphs worth of words or approx. 175 words, unless the user specifies otherwise.`;
    return openai.gpt4StreamChatLog(systemPrompt, convertedChat);
  }

  static async enrichQuery(pageName, convertedChat) {
    const systemPrompt = `You are the wikipedia page '${pageName}'. Respond to the user query. In 75 words or less.`;
    const output = await openai.gpt3ChatLog(systemPrompt, convertedChat);
    console.log(output);
    return output;
  }

  static async findNearestTexts(pageName, convertedChat, k) {
    const db = getDb();
    const embedding = await openai.ada(
      await this.enrichQuery(pageName, convertedChat)
    );
    try {
      const cursor = await db.collection("datuPages").aggregate([
        {
          $vectorSearch: {
            index: "DatuSearch",
            path: "embedding",
            queryVector: embedding,
            filter: {
              pageName: {
                $eq: pageName,
              },
            },
            numCandidates: 100,
            limit: k,
          },
        },
        {
          $project: {
            _id: 0,
            title: "$title",
            paragraph: "$paragraph",
          },
        },
      ]);
      const results = await cursor.toArray();
      results.forEach((result) => {
        if(result.title.startsWith(pageName)){
          result.title = `None`
        }
        else{
          result.title = `/datu/${encodeURIComponent(result.title)}`
        }
      })
      console.log(results);
      return results;
    } catch (error) {
      console.error("Error in findNearestTexts:", error);
      return [];
    }
  }
}

module.exports = DatuChat;
