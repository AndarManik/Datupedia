const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const { getDb } = require("../APIs/MongoAPI");
class VectorSearch {

  async ragResponse(pageName, chatLog, text, k) {
    const nearestText = await this.findNearestTexts(pageName,chatLog, text, k);
    const systemPrompt = 
    `"Previous ChatLog": '${chatLog}' 
    "Provided Text": '${JSON.stringify(nearestText)}' The "Provided Text" is up to date and can be relied on. Use the "Provided Text" to aid in your response for the users query, do not mention that a query is outside of the knowledge cutoff and instead utilize the "Provided Text" for knowledge. You output should be relevant to the "Previous ChatLog". Output your text using standard html markup for styling text. Break up your text into multiple sections using <p> tags.`
    return openai.gpt4Stream(systemPrompt, text);
  }

  async enrichQuery(pageName, chatLog, text) {
    const systemPrompt = `You are the wikipedia page '${pageName}'. Respond to the user query. In 75 words or less. Here is the chat log ${chatLog}`;
    const output =  await openai.gpt4(systemPrompt, text);
    return output;
  }

  async findNearestTexts(pageName, chatLog, text, k) {
    const db = getDb();
    const embedding = await openai.ada(await this.enrichQuery(pageName, chatLog, text));
    try {
      const cursor = await db.collection("datuPages").aggregate([
        {
          "$vectorSearch": {
            "index": "DatuSearch", // Replace with the name of your index
            "path": "embedding",
            "queryVector": embedding,
            "filter": {
              "pageName": {
                "$eq": pageName
              }
            },
            "numCandidates": 100, // Adjust as needed
            "limit": k // Number of nearest results to return
          }
        },
        {
          $project: {
            _id: 0,
            title: "$title",
            paragraph: "$paragraph"
          }
        }
      ]);
      const results = await cursor.toArray();
      console.log(results);
      return results;
    } catch (error) {
      console.error("Error in findNearestTexts:", error);
      return [];
    }
  }
}

module.exports = VectorSearch;
