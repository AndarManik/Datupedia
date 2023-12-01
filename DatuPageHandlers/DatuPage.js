const InlinkRetreival = require("./InlinkRetreival");
const InlinkCluster = require("./InlinkCluster");
const ArticleGenerator = require("./ArticleGenerator");
const { getDb } = require("../APIs/MongoAPI");
class DatuPage {
  constructor(pageName, position = []) {
    this.inlinks = new InlinkRetreival(pageName);
    this.pageName = pageName;
    this.position = position;
    this.fetchDone = false;
    this.isAnalysing = false;
  }

  async fetchData(datuPages) {
    if (!(await this.isClusterDone())) {
      this.isAnalysing = true;
      await this.inlinks.fetchData();
      this.isAnalysing = false;
      this.rootCluster = new InlinkCluster(this.pageName, 6, this.inlinks.data);
    } 
    datuPages.delete(this.pageName);
  }

  async generatePage() {
    console.log("article generate");
    this.article = new ArticleGenerator(this.pageName, this.position);
    this.article.generatePage();
  }

  static async isLargeEnough(pageName) {
    return await InlinkRetreival.isLargeEnough(pageName);
  }

  async has(position) {
    const db = getDb();
    const collection = db.collection("datuCluster");

    const uniqueId = this.pageName + position.join("-");

    if (await collection.findOne({ _id: uniqueId })) {
      return true;
    }
    return false;
  }

  isGenerating() {
    if (!this.article) {
      return false;
    }
    return this.article.isGenerating;
  }

  getWikiText() {
    return this.article.wikiText;
  }
  getProcessedWikiText() {
    return this.article.processedWikiText;
  }
  isClusterFinished() {
    return this.article.wikiTextFinished;
  }
  getState() {
    if(this.isAnalysing){
      return this.inlinks.state;
    }
    else{
      return "Organizing the information, this task can't really be estimated.";
    }
  }

  isFetchDone() {
    return this.fetchDone;
  }

  async isClusterDone() {
    const db = getDb();
    const collection = db.collection("datuCluster");

    // Use the position as the unique identifier

    // Insert or update the document in the database
    const data = await collection.findOne({ _id: this.pageName + "VERSION"});
    if (data) {
      if(!data.version) {
        console.log("no version");
        return false;
      }
      if(data.version !== 1.3) {
        console.log("wrong version");
        return false;
      }

      return true;
    }
    console.log("no data");
    return false;
  }

  async isAnalysisDone() {
    if (
      await getDb()
      .collection("datuPages")
      .findOne({ pageName: this.pageName, type: "length" })
    ) {
      return true;
    }
    console.log("no analysis");
    return false;
  }

  async resetArticle() {
    await this.article.resetArticle();
  }
}

module.exports = DatuPage;
