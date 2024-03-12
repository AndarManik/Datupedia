const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();
const { getDb } = require("../APIs/MongoAPI");
const createPCA = require("../DatuPageHandlers/PCA");
var pca;
(async () => {
  pca = await createPCA();
})();

class DatuChat {
  static async generateGlobalMessage(chatLog) {
    let attempts = 0;

    while (attempts < 5) {
      try {
        return await this.ragGlobalResponse(chatLog.slice(-8), 5);
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
    const nearestText = await this.findNearestTexts(
      convertedChat,
      chatIndex,
      k
    );
    const nearestTextforGPT = this.parseforGPT(nearestText);
    console.log(nearestTextforGPT);
    const systemPrompt = `Task:
- You are "Datupedia", a chat assistant here to help users with factual answers.
- You'll get knowledge to help answer users' questions, called "What you know".
- "What you know" is the most relevant paragraphs from Wikipedia.

Response Guidelines:
- Your job is to give accurate and fair answers using only "What you know".
- Try to use as much knowledge from "What you know" as you can to give detailed answers.
- Format your answers with HTML. You can use heading tags <h1> to <h6>, paragraphs <p>, bold <b>, and citations <sup>.
- Highlight key words or phrases using <b>.
- When you finish a sentence with knowledge from "What you know", show where it came from. Do this by adding a <sup> tag with "citation" set to where you got it. Inside the <sup>, put the reference number in brackets.
- Here's how to do it for knowledge index [6,12]:
  '<p>This is an example sentence that ends with a citation.<sup citation="[6,12]">[12]</sup></p>'
- If you need to cite more than one source at the end of a sentence, use a <sup> tag for each one. Like this:
  '<sup citation="[2,1]">[1]</sup><sup citation="[2,4]">[4]</sup><sup citation="[2,11]">[11]</sup>'

This is "What you know": 
'${nearestTextforGPT}'`;
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
Titles = [${nearest.headings}]
Text = "${nearest.paragraph}"
Key Words = [${nearest.links}]
Knowledge End
        `;
      text.push(stringToAdd);
    });
    return text.join("");
  }

  static async enrichChatQuery(convertedChat) {
    const systemPrompt = `Based on the user's query, provide a JSON response that includes two components:
- First, determine a list of 5-10 Wikipedia article titles. The output for this component should be in JSON format with the key 'articles' and the value being a list of the article titles. 
- Second, determine a list of 3-5 comprehensive sentences that contain information on the users query. approximately 50-100 words in length each. This response should also be in JSON format, where the key is 'texts' and the value is a list of texts. 
- The final output should be a single JSON object containing both keys: 'articles' and 'texts'.
- Note, the number of article titles does not have to match the number of texts.

The purpose of this JSON is to perform similarity search on the text of wikipedia. The texts will be embedded and used as search vectors. The article titles will be used to filter the search. Here are 2 facts to keep in mind:
- First, the texts should be different as to gather a diverse set of information, this is because if two texts are similar the outputs from the search will be similar and thus a waste of search.
- Second, the article titles should be precise as to target pages that have fewer entries, this is because general topics, such as "Physics", are references heavily and thus require a larger search and slower search.
Example Format:
{ 
articles: ["article","article"], 
texts: ["text","text"] 
}`;
    const data = await openai.gpt3ChatLogJSON(systemPrompt, convertedChat);
    const output = JSON.parse(data);
    output.articles = [...new Set(output.articles)];
    output.articles = output.articles.map((title) => title.toLowerCase());
    return output;
  }

  static async enrichQuery(convertedChat) {
    const systemPrompt = `Based on the user's query, provide a JSON response that includes two components:
      First, determine a list of 5-10 relevant Wikipedia article titles that supplement the information related to the query. The output for this component should be in JSON format with the key 'articles' and the value being a list of the article titles. 
      Second, answer the user's query with a list of 3-7 short and precise texts, approximately 50-75 words in length each. This response should also be in JSON format, where the key is 'texts' and the value is a list of texts. 
      The final output should be a single JSON object containing both keys: 'articles' and 'texts'.
      Note, the number of article titles does not have to match the number of texts.
      
      The purpose of this JSON output is to query a vector database. The texts will be embedded and used as search vectors, and the article titles will be used to filter the search. Because of the JSON's purpose a few facts should be kept in mind:
      First, the texts should be different as to gather a diverse set of information, this is because if two texts were similar the outputs from the search would be similar and thus a waste of search.
      Second, the article titles should be specific rather than general, this is because general topics such as "Physics" or "Species" are references heavily and thus would require a larger search space.
      Example Format:
      { articles: ["title","title"], texts: ["text","text"] }
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

  static async findNearestTexts(convertedChat, chatIndex, k) {
    const searchParam = await this.enrichChatQuery(convertedChat);
    console.log(searchParam);
    const adaBatchPromise = openai
      .adaBatch(searchParam.texts)
      .then((preReduce) => preReduce.map((pre) => pca(pre).slice(0, 250)));
    const wikipediaPromise = wikipediaAPI.resolveRedirectsOrSearch(
      searchParam.articles
    );
    const [embeddings, articles] = await Promise.all([
      adaBatchPromise,
      wikipediaPromise,
    ]);

    console.log(embeddings);
    console.log(articles);

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
      console.log(uniqueResults);
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
      const cursor = await getDb()
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
      const cursor = await getDb()
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

  static async getRandom(n) {
    try {
      const cursor = await getDb()
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

  static async getAllFiltered(filters) {
    const filtersResolved = await wikipediaAPI.resolveRedirectsOrSearch(filters);
    // Construct the query to match documents where the links field contains
    // any of the links provided in the filters array.
    const matchStage =
    filtersResolved && filtersResolved.length > 0 ? { links: { $in: filtersResolved } } : {};

    // Use the aggregation framework to filter documents based on links
    // and then project only the necessary fields.
    const cursor = await getDb()
      .collection("embeddings")
      .aggregate([
        { $match: matchStage }, // Apply the filter condition based on links
        {
          $project: {
            _id: 1,
            headings: 1,
            links: 1,
            paragraph: 1,
          },
        },
      ]);

    // Assuming you want to return the documents as an array
    const results = await cursor.toArray();
    return results;
  }
}

module.exports = DatuChat;
