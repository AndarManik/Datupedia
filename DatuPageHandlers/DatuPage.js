const InlinkAnalysis = require("./InlinkAnalysis");
const InlinkCluster = require("./InlinkCluster");
const ArticleGenerator = require("./ArticleGenerator");
const { getDb } = require("../APIs/MongoAPI");
class DatuPage {
  constructor(pageName, position = []) {
    this.inlinks = new InlinkAnalysis(pageName);
    this.pageName = pageName;
    this.position = position;
    this.fetchDone = false;
  }

  async fetchData() {
    await this.inlinks.fetchData();
    console.log("fetchFinishd");
    console.log("clusterStart");
    if (!(await this.checkIfDone())) {
      this.rootCluster = new InlinkCluster(this.pageName, 6, this.inlinks.data);
    }
    this.fetchDone = true;
    console.log("clusterfinished");
  }

  async generatePage() {
    console.log("article generate");
    this.article = new ArticleGenerator(this.pageName, this.position);
    this.article.generatePage();
  }

  isLargeEnough() {
    return this.inlinks.isLargeEnough();
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

  async checkIfDone() {
    const db = getDb();
    const collection = db.collection("datuCluster");

    // Use the position as the unique identifier
    const uniqueId = this.pageName + [].join("-");

    // Insert or update the document in the database
    if (await collection.findOne({ _id: uniqueId })) {
      return true;
    }
    return false;
  }
}

module.exports = DatuPage;
