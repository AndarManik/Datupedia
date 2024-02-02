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
    Task:
    You are the chat assistant "Datupedia", you assist the user by responding factually. 
    You will be provided information relevant to the users query as "What you know". 
    "What you know" was obtained from quering a vector database containing all of wikipedia.
    This is "What you know": '${nearestTextforGPT}'

    Response Guidlines: 
    Construct an accurate and neutral response to the user's query by utilizing only "what you know". 
    Utilize as much of "what you know" by being detailed and thorough, while being interesting and exciting.\
    The way "What you know" was obtained through querying a vector database contain all of wikipedia.
    Use html to format your response using tags such as <h>, <p>, <b>, and so on. 
    Use citations at the end of sentences by referencing the index in "what you know".
    This is done by inserting a span tag with an attribute "citation"=Knowledge Index, the text of the span should be the second value in the array in brackets.
    Here is an example for Knowledge Index = [6,12]
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
Knowledge Index = [${nearest.index}]
Titles = ${nearest.headings}
Text = "${nearest.paragraph}"
Links = [${nearest.links}]
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
  static async enrichChatQuery(convertedChat) {
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

  static async enrichQuery(convertedChat) {
    const systemPrompt = `Based on the user's query, provide a JSON response that includes two components:
      First, determine a list of 5-10 relevant Wikipedia article titles that supplement the information related to the query. The output for this component should be in JSON format with the key 'articles' and the value being a list of the article titles. 
      Second, answer the user's query with a list of 3-7 short and precise paragraphs, approximately 50-75 words in length each. This response should also be in JSON format, where the key is 'paragraphs' and the value is a list of paragraphs. 
      The final output should be a single JSON object containing both keys: 'articles' and 'paragraphs'.
      Note, the number of article titles does not have to match the number of paragraphs.
      
      The purpose of this JSON output is to query a vector database. The paragraphs will be embedded and used as search vectors, and the article titles will be used to filter the search. Because of the JSON's purpose a few facts should be kept in mind:
      First, the paragraphs should be different as to gather a diverse set of information, this is because if two paragraphs were similar the outputs from the search would be similar and thus a waste of search.
      Second, the article titles should be precise as to target pages that would have fewer entries, this is because general topics, such as "Physics" or "Species", are references heavily and thus would require a larger search space.
      These facts should be kept in mind and used reasonably, if a case requires one of these facts to be broken its ok.
      Example Format:
      { articles: ["title","title"], paragraphs: ["text","text"] }
      `;
    const data = await openai.gpt3JSON(systemPrompt, convertedChat);
    const output = JSON.parse(data);
    output.articles = [...new Set(output.articles)];
    output.articles = output.articles.map((title) => title.toLowerCase());
    console.log(output);
    return output;
  }

  static async textBasedFilteredSearch(searchString, articleFilters, k) {
    const [filters, preReduce] = await Promise.all([
      wikipediaAPI.resolveRedirectsOrSearch(articleFilters),
      openai.ada(searchString),
    ]);
    const embedding = pca(preReduce).slice(0, 250);
    const searchOperation = this.searchWithEmbedding(embedding, filters, k);
    try {
      const results = await searchOperation;

      results.forEach((element, index) => {
        //this does NOT change a value, it creates one
        element.index = index + 1;
      });

      return results.map((data) => {
        //removes the unique identifier from the object
        const { _id, ...rest } = data;
        return rest;
      });
    } catch (error) {
      console.error("Error in findGlobalNearestTexts:", error);
      return [];
    }
  }

  static async textBasedSearch(searchString, k) {
    const preReduce = await openai.ada(searchString);
    const embedding = pca(preReduce).slice(0, 250);
    const searchOperation = this.searchWithEmbeddingGlobal(embedding, k);
    try {
      const results = await searchOperation;

      results.forEach((element, index) => {
        //this does NOT change a value, it creates one
        element.index = index + 1;
      });

      return results.map((data) => {
        //removes the unique identifier from the object
        const { _id, ...rest } = data;
        return rest;
      });
    } catch (error) {
      console.error("Error in findGlobalNearestTexts:", error);
      return [];
    }
  }

  //TODO: modify this so that it accepts the list of strings
  static async findGlobalNearestTexts(convertedChat, chatIndex, k) {
    const searchParam = await this.enrichChatQuery(convertedChat);
    const preReduce = await openai.adaBatch(searchParam.paragraphs);
    const embeddings = preReduce.map((pre) => pca(pre).slice(0, 250));
    const articles = await wikipediaAPI.resolveRedirectsOrSearch(
      searchParam.articles
    );

    // Map each embedding to a search operation
    const searchOperations = embeddings.map((embedding) => {
      return this.searchWithEmbedding(embedding, articles, k);
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

  static async searchWithEmbedding(embedding, articles, k) {
    try {
      const cursor = await getDbGlobal()
        .collection("embeddings")
        .aggregate([
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
              numCandidates: 10 * k,
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

  static async searchWithEmbeddingGlobal(embedding, k) {
    try {
      const cursor = await getDbGlobal()
        .collection("embeddings")
        .aggregate([
          {
            $vectorSearch: {
              index: "vector_index",
              path: "embedding",
              queryVector: embedding,
              numCandidates: 10 * k,
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

  static async findNearestTexts(pageName, convertedChat, k) {
    const db = getDb();
    const embedding = await openai.ada(
      await this.enrichChatQuery(pageName, convertedChat)
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

  static async getRandom(n) {
    try {
      const cursor = await getDbGlobal()
        .collection("embeddings")
        .aggregate([
          { $sample: { size: n } }, // Randomly sample n documents
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
      console.error("Error in getRandom:", error);
      throw error; // Rethrow to be caught in the calling function
    }
  }
}

module.exports = DatuChat;
