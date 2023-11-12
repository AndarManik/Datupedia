const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const { datuParse } = require("./DatuParser");
const { getDb } = require("../APIs/MongoAPI");
const NUMCLUSTERS = 3;
class ArticleGenerator {
  constructor(pageName, position) {
    this.pageName = pageName;
    this.position = position;
    this.wikiText = "";
  }

  async generatePage(generators) {
    if (await this.fetchData(this.pageName, this.position)) {
      generators.delete(this.pageName + this.position);
      return;
    }
    let system = `
Task:
1. You're asked to write a hyperlinked article for the wikipedia page \`${this.pageName}\`. 
2. You'll be provided text from Wikipedia pages that contain a link to this page. 
3. This provided text will be clustered into ${NUMCLUSTERS} district section.
4. This clustering was done through k-means, so they are the optimal clustering

Article Guidelines:

1. The purpose of the article is to outline ${NUMCLUSTERS} different ways \`${this.pageName}\` is understood.
2. Your article should have ${NUMCLUSTERS} sections, one for each cluster in the provided text.
3. Ensure each section has its own consistent theme. 
4. Maintain a neutral, informative tone, avoiding calls to action.
5. Instead of listing, provide in-depth analysis.
6. If two sections are similar, consider focusing on what differentiates the two.   
7. Every section should have two paragraphs.
8. Include at least four wiki-style links in each section. These links refer to the links in the provided text. Use the format [[link]].
9. Each section needs a unique, relevant title, formatted as ==header==.
10. Avoid starting paragraphs with "In this cluster", "In this section", "The second cluster"... or anything similar. Instead start with something related to \`${this.pageName}\`. 
Example Format:

==Article header==
This is the first paragraph, which includes a [[link]].
Here's more detail...

The next paragraph might use another link type, [[link|display text]].
And even more detail...`;
    if (this.superText.length !== 0) {
      system += `The article should extend this provided article: ${this.superText}`;
    }
    let prompt =
      "\nSTART OF PROVIDED TEXT\n" + this.prompt + "\nEND OF PROVIDED TEXT";

    this.wikitextStoreStream(
      await openai.gpt4Stream(system, prompt),
      generators
    );
  }

  async wikitextStoreStream(wikitextStream, generators) {
    let prevChunk = null;
    for await (const chunk of wikitextStream) {
      if (prevChunk !== null) {
        this.wikiText += prevChunk.choices[0].delta.content;
      }
      prevChunk = chunk;
    }
    this.processedWikiText = await datuParse(
      this.superText,
      this.wikiText,
      this.position
    );
    await this.saveArticleInformation();
    generators.delete(this.pageName + this.position);
  }

  async saveArticleInformation() {
    const db = getDb();
    const collection = db.collection("datuCluster");

    const dataToSave = {
      article: this.processedWikiText,
      wikiText: this.wikiText,
      hasArticle: true,
    };

    const uniqueId = this.pageName + this.position.join("-");

    await collection.updateOne({ _id: uniqueId }, { $set: dataToSave });
    if (this.childCount !== 0) {
      this.wikiText.match(/==[^=]+==[^=]+/g).forEach(async (text, index) => {
        if (index < this.childCount) {
          const uniqueId = this.pageName + [...this.position, index].join("-");
          const childSuperText = this.superText + text.trim();
          await collection.updateOne(
            { _id: uniqueId },
            { $set: { superText: childSuperText } }
          );
        }
      });
    }
  }

  async fetchData(pageName, position) {
    const db = getDb();
    const collection = db.collection("datuCluster");
    const uniqueId = pageName + position.join("-");
    const data = await collection.findOne({
      _id: uniqueId,
    });
    if (!data) {
      throw new Error("Data not found for given pageName and position");
    }
    if (data.hasArticle) {
      this.processedWikiText = data.article;
      this.wikiTextFinished = true;
      this.isGenerating = false;
    }

    this.prompt = data.prompt;
    this.superText = data.superText ? data.superText : "";
    this.childCount = data.childCount;
    return data.hasArticle;
  }

  static async getParsedText(pageName, position) {
    const db = getDb();
    const collection = db.collection("datuCluster");
    const uniqueId = pageName + position.join("-");
    const data = await collection.findOne({
      _id: uniqueId,
    });
    return data.article;
  }

  getWikiText() {
    return this.wikiText;
  }

  async resetArticle() {
    const db = getDb();
    const collection = db.collection("datuCluster");

    const uniqueId = this.pageName + this.position.join("-");

    await collection.updateOne(
      { _id: uniqueId },
      { $set: { hasArticle: false } }
    );
  }
}

module.exports = ArticleGenerator;
