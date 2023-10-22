const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const { datuParse } = require("./DatuParser");
const { getDb } = require("../APIs/MongoAPI");
class ArticleGenerator {
  constructor(pageName, position) {
    this.pageName = pageName;
    this.position = position;
    this.wikiText = "";
    this.wikiTextFinished = false;
    this.isGenerating = false;
  }

  async generatePage() {
    this.isGenerating = true;
    if(await this.fetchData(this.pageName, this.position)){
        return;
    }
    const system = `
    You're asked to write a Wikipedia-like article about \`${this.pageName}\`. You'll be given text from existing Wikipedia pages that reference to this topic, organized into three sections.

    Guidelines:

    1. Your article should have three sections, each based on one of the provided text clusters.
    2. Every section should have two paragraphs.
    3. Stick to the information in each text cluster without adding outside data.
    4. Include at least four wiki-style links in each section. These links refer to the titles in the provided text.Use the format [[link]].
    5. Each section needs a unique, relevant title, formatted as ==header==.
    6. Ensure each section has a consistent theme.
    7. Maintain a neutral, informative tone, avoiding calls to action.
    8. Instead of just listing links or ideas, provide in-depth analysis.  
    Example Format:
    
    ==Article Header==
    This is the first paragraph, which includes a [[link]].
    Here's more detail...

    The next paragraph might use another link type, [[link|display text]].
    And even more detail...
    `;
    let prompt = this.prompt;

    if (this.superText.length !== 0) {
      prompt += `The article you are task to write will be a sub article for this article section provided: ${this.superText}`;
    }

    prompt += "END OF PROVIDED TEXT";
    console.log(prompt);
    this.wikitextStoreStream(await openai.gpt4Stream(system, prompt));
  }

  async wikitextStoreStream(wikitextStream) {
    let prevChunk = null;
    for await (const chunk of wikitextStream) {
      if (prevChunk !== null) {
        this.wikiText += prevChunk.choices[0].delta.content;
      }
      prevChunk = chunk;
    }
    console.log(this.superText + this.wikiText);
    this.processedWikiText = await datuParse(
      this.superText,
      this.wikiText,
      this.position
    );
    await this.saveArticleInformation();
    this.isGenerating = false;
    this.wikiTextFinished = true;
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
    console.log("articleSaveSucc");
    if (this.childCount !== 0) {
      this.wikiText.match(/==[^=]+==[^=]+/g).forEach(async (text, index) => {
        if (index < this.childCount) {
            const uniqueId = this.pageName + [...this.position, index].join("-");
            await collection.updateOne({ _id: uniqueId }, { $set: {superText: text} });
        }
      });
      console.log("childSaveSucc");
    }

  }

  async fetchData(pageName, position) {
    const db = getDb();
    const collection = db.collection("datuCluster");
    const uniqueId = pageName + position.join("-");
    const data = await collection.findOne({
      _id: uniqueId
    });
    if (!data) {
      throw new Error("Data not found for given pageName and position");
    }
    console.log(data.hasArticle);
    if(data.hasArticle){
        this.processedWikiText = data.article;
        this.wikiTextFinished = true;
        this.isGenerating = false;
    }

    this.prompt = data.prompt;
    this.superText = data.superText ? data.superText : "";
    this.childCount = data.childCount;
    return data.hasArticle;
  }

  getWikiText() {
    return this.wikiText;
  }
}

module.exports = ArticleGenerator;
