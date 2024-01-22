const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();
const { getDb, getDbGlobal } = require("../APIs/MongoAPI");
const createPCA = require("../DatuPageHandlers/PCA");
var pca;
(async () => {
  pca = await createPCA();
})();
class DatuChat {
  static async generateInitialMessage(pageName) {
    return await openai.gpt4Stream(
      `You are Datupedia, a chatbot which specializes in a specific page on Wikipedia. The page you specialize in is '${pageName}', meaning for each query you receive from the user you will also be provided extra context.`,
      "Generate a simplified intro message, which states your name, what you specialize in, and some potential questions the user can ask. This intro message must be less than 100 words"
    );
  }

  static async generateGlobalMessage(chatLog) {
    console.log(chatLog);
    let attempts = 0;

    while (attempts < 5) {
      try {
        return await this.ragGlobalResponse(chatLog.slice(-8), 3);
      } catch (error) {
        console.error("Attempt failed:", attempts, error);
        attempts++;

        if (attempts >= 5) {
          throw error; // Re-throw the error if all attempts fail
        }
      }
    }
  }

  static async ragGlobalResponse(chatLog, k) {
    const chatIndex = chatLog.length / 2;
    const convertedChat = chatLog.map((message) => {
      const role = Object.keys(message)[0];
      const content = message[role];
      return { role, content };
    });
    console.log(`ragGlobalResponse ${k}`);
    const nearestText = await this.findGlobalNearestTexts(
      convertedChat,
      chatIndex,
      k
    );
    const nearestTextforGPT = this.parseforGPT(nearestText);
    console.log(nearestTextforGPT);
    const systemPrompt = `
    "What you know": '${nearestTextforGPT}'
    Response Guidlines: 
    Construct an accurate and neutral response to the user's query by utilizing only "what you know". 
    Utilize as much of "what you know" by being detailed and thorough, while being interesting and exciting. 
    Use html to format your response using tags such as <h>, <p>, <b>, and so on. 
    Use citations at the end of sentences by referencing the index in "what you know".
    This is done by inserting a span tag with an attribute "citation"=Knowledge Index, the text of the span should be the second value in the array in brackets.
    Here is an example for Knowledge Index = 6, 12
    <p>This text is in a p tag and will end with a citation, this citation must be before the p tag ends.<span citation="[6,12]">[12]</span></p>
    If multiple citations are needed for at the end of a sentence, use seperate spans, for example:
    DO THIS: <span citation="[2,1]">[1]</span><span citation="[2,4]">[4]</span><span citation="[2,11]">[11]</span>
    `;
    const messageStream = await openai.gpt4StreamChatLog(
      systemPrompt,
      convertedChat
    );
    return { messageStream, nearestText };
  }

  static parseforGPT(nearestText) {
    const text = [];
    nearestText.forEach((nearest) => {
      const stringToAdd = `
Knowledge Index = ${nearest.index}
Titles = ${nearest.headings}
Text = "${nearest.paragraph}"
Links = ${nearest.links}
Knowledge End
        `;
      text.push(stringToAdd);
    });
    return text.join("");
  }
  /*
  These are some notes on how to improve the prompt
  There needs to be a way for the model to understand the context of the chat to better develop article titles, stuff like "general wikipedia pages will be slow to load"
  also the model should be stricter wrt knowledge in the 
  */

  static async enrichGlobalQuery(convertedChat) {
    const systemPrompt = `Based on the user's query, provide a JSON response that includes two components:
      First, determine a list of 5-10 relevant Wikipedia article titles that supplement the information related to the query. The output for this component should be in JSON format with the key 'articles' and the value being a list of the article titles. 
      Second, answer the user's query with a list of 3-7 short and precise paragraphs, approximately 50-75 words in length each. This response should also be in JSON format, where the key is 'paragraphs' and the value is a list of paragraphs. 
      The final output should be a single JSON object containing both keys: 'articles' and 'paragraphs'.
      Note, the number of article titles does not have to match the number of paragraphs.
      
      The purpose of this JSON output is to query a vector database. The paragraphs will be embedded and used as search vectors, and the article titles will be used to filter the search. Because of the JSON's purpose a few facts should be kept in mind:
      First, the paragraphs should be different as to gather a diverse set of information, this is because if two paragraphs were similar the outputs from the search would be similar and thus a waste of search.
      Second, the article titles should be precise as to target pages that would have fewer entries, this is because general topics, such as "Physics", are references heavily and thus would require a larger search space.
      These facts should be kept in mind and used reasonably, if a case requires one of these facts to be broken its ok.
      Example Format:
      { articles: ["title","title"], paragraphs: ["text","text"] }
      `;
    const data = await openai.gpt3ChatLogJSON(systemPrompt, convertedChat);
    const output = JSON.parse(data);
    output.articles = [...new Set(output.articles)];
    output.articles = output.articles.map((title) => title.toLowerCase());
    console.log(output);
    return output;
  }

  //TODO: modify this so that it accepts the list of strings
  static async findGlobalNearestTexts(convertedChat, chatIndex, k) {
    const db = getDbGlobal();
    const searchParam = await this.enrichGlobalQuery(convertedChat);
    const preReduce = await openai.adaBatch(searchParam.paragraphs);
    const embeddings = preReduce.map((pre) => pca(pre).slice(0, 250));
    const articles = await wikipediaAPI.resolveRedirectsOrSearch(
      searchParam.articles
    );

    // Map each embedding to a search operation
    const searchOperations = embeddings.map((embedding) => {
      return this.searchWithEmbedding(db, embedding, articles, k);
    });

    try {
      // Run all search operations concurrently and wait for all of them to complete
      const results = await Promise.all(searchOperations);

      // Flatten the array of results
      const flattenedResults = [].concat(...results);
      const uniqueResults = this.removeDuplicates(flattenedResults);

      // Adding an 'index' field to each element in the uniqueResults list
      uniqueResults.forEach((element, index) => {
        element.index = [chatIndex, index + 1];
      });

      return uniqueResults;
    } catch (error) {
      console.error("Error in findGlobalNearestTexts:", error);
      return [];
    }
  }

  static removeDuplicates(results) {
    const unique = new Map();

    results.forEach((item) => {
      if (!unique.has(item._id)) {
        unique.set(item._id, item);
      }
    });

    return Array.from(unique.values()).map(({ _id, ...rest }) => rest);
  }

  static async searchWithEmbedding(db, embedding, articles, k) {
    try {
      const cursor = await db.collection("embeddings").aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: embedding,
            filter: {
              links: {
                $in: articles,
              },
            },
            numCandidates: 100,
            limit: k,
          },
        },
        {
          $project: {
            _id: 1,
            headings: 1,
            links: 1,
            paragraph: 1,
          },
        },
      ]);
      return await cursor.toArray();
    } catch (error) {
      console.error("Error in searchWithEmbedding:", error);
      throw error; // Rethrow to be caught in the calling function
    }
  }

  static async generateMessage(chatLog, pageName) {
    return await this.ragResponse(pageName, chatLog.slice(-8), 5);
  }

  static async ragResponse(pageName, chatLog, k) {
    const convertedChat = chatLog.map((message) => {
      const role = Object.keys(message)[0];
      const content = message[role];
      return { role, content };
    });

    const nearestText = await this.findNearestTexts(pageName, convertedChat, k);
    const systemPrompt = `
    "What you know": '${JSON.stringify(nearestText)}'
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
        if (result.title.startsWith(pageName)) {
          result.title = `None`;
        } else {
          result.title = `/datu/${encodeURIComponent(result.title)}`;
        }
      });
      console.log(results);
      return results;
    } catch (error) {
      console.error("Error in findNearestTexts:", error);
      return [];
    }
  }
}

module.exports = DatuChat;
