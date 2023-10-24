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
    Task:
    1. You're asked to write a Wikipedia-like article for the page \`${this.pageName}\`. 
    2. You'll be provided text from Wikipedia pages that contain a link to this page. 
    3. This provided text will be clustered into three district section.
    4. This clustering was done through k-means, so they are the optimal clustering

    Article Guidelines:

    1. Your article should have three sections, one for each cluster in the provided text.
    2. 
    2. The purpose of the article is to outline the differences between the clusters.
    3. Ensure each section has its own consistent theme.
    4. Maintain a neutral, informative tone, avoiding calls to action.
    5. Instead of just listing links or ideas, provide in-depth analysis.   
    6. Every section should have two paragraphs.
    7. Include at least four wiki-style links in each section. These links refer to the titles in the provided text.Use the format [[link]].
    8. Each section needs a unique, relevant title, formatted as ==header==.
    

    Example Format:

    ==Article Header==
    This is the first paragraph, which includes a [[link]].
    Here's more detail...

    The next paragraph might use another link type, [[link|display text]].
    And even more detail...
    `;
    let prompt = this.prompt;

    if (this.superText.length !== 0) {
      prompt += `The article should extend this provided article: ${this.superText}`;
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
            const childSuperText = this.superText + text.trim(); 
            await collection.updateOne({ _id: uniqueId }, { $set: {superText: childSuperText} });
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

  async resetArticle() {
    const db = getDb();
    const collection = db.collection("datuCluster");

    const uniqueId = this.pageName + this.position.join("-");

    await collection.updateOne({ _id: uniqueId }, { $set: {hasArticle: false} });
  }
}

module.exports = ArticleGenerator;
