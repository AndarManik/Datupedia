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
  }

  async fetchData(datuPages) {
    if (!(await this.isAnalysisDone()) || !(await this.isClusterDone())) {
      await this.inlinks.fetchData();
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
    return this.inlinks.state;
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
        return false;
      }
      if(data.version !== 1.2) {
        return false;
      }

      return true;
    }
    return false;
  }

  async isAnalysisDone() {
    const db = getDb();
    if (
      await getDb()
      .collection("datuPages")
      .findOne({ pageName: this.pageName, type: "length" })
    ) {
      return true;
    }
    return false;
  }

  async resetArticle() {
    await this.article.resetArticle();
  }
}

module.exports = DatuPage;
