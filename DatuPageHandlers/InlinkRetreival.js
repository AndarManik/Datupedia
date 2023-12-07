const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();
const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const TextExtractor = require("./TextExtractor");
const textExtractor = new TextExtractor();
const { getDb, getInlinkData } = require("../APIs/MongoAPI");

class Inlink {
  constructor(title, paragraph, embedding) {
    this.title = title;
    this.paragraph = paragraph;
    this.embedding = embedding;
  }
}

class InlinkRetreival {
  //Rate limiting for WikipediaAPI
  static MAX_REQUESTS = 100;
  static DELAY_TIME = 500;

  //Limiting for number of linkings queried and stored
  static MAX_RETREIVE = 1000;
  static MAX_STORE = 500;

  constructor(pageName) {
    this.pageName = pageName;
    this.db = getDb();
    this.state = "0";

    //These two variables are used for signaling when and how fetchData() finishes
    this.isLargeEnough = false;
    this.isFinished = false;

    this.inlinkData = [];
  }

  async fetchData() {
    this.inlinkData = await getInlinkData(this.pageName);
    if (this.inlinkData.length > 0) {//The data has already been fetched
        this.isLargeEnough = this.inlinkData.length > 21;
        this.isFinished = true;
        return;
    }

    const startTime = Date.now();

    const fetchFuture = this._fetchPageData();
    const inlinks = await wikipediaAPI.getInlinks(this.pageName, InlinkRetreival.MAX_RETREIVE);


    for (let i = 0; i < inlinks.length && this.inlinkData.length < InlinkRetreival.MAX_STORE; i += InlinkRetreival.MAX_REQUESTS) {
        const batch = inlinks.slice(i, i + InlinkRetreival.MAX_REQUESTS);
        const results = await this._fetchParagraphsInBatch(batch);
        this.inlinkData.push(...results);
        this._logProgress(startTime, Math.min(inlinks.length, InlinkRetreival.MAX_STORE), inlinks.length < InlinkRetreival.MAX_STORE ? i : this.inlinkData.length);
        const delayFuture = this._delay(InlinkRetreival.DELAY_TIME);
        await this._saveToDb(results);
        await delayFuture;
    }

    await fetchFuture;
    this.isLargeEnough = this.inlinkData.length > 21;
    this.isFinished = true;
}


  async _fetchPageData() {
    const data = []
    const paragraphs = textExtractor
      .getParagraphList(await wikipediaAPI.getContent(this.pageName))
      .filter((paragraph) => paragraph.trim() !== "");
    const embeddings = await openai.adaBatch(paragraphs);

    paragraphs.forEach((paragraph, index) => {
      const embedding = embeddings[index];
      data.push(new Inlink(this.pageName + index, paragraph, embedding));
    });

    await this._saveToDb(data);
  }

  async _fetchParagraphsInBatch(inlinks) {
    const batchContent = await wikipediaAPI.getContentBatch(inlinks);
    const foundParagraphs = batchContent.map((content) =>
      textExtractor.getParagraphWithLink(content, this.pageName)
    );

    const combinedTexts = foundParagraphs
      .map((paragraph, index) => {
        if (!paragraph) {
          return null;
        }
        return {
          title: inlinks[index],
          paragraph: paragraph,
        };
      })
      .filter((item) => item !== null);

    if (combinedTexts.length === 0) {
      return [];
    }

    const filteredParagraphs = combinedTexts.map((tuple) => tuple.paragraph);
    const batchEmbeddings = await openai.adaBatch(filteredParagraphs);

    return combinedTexts.map((tuple, index) => {
      return new Inlink(tuple.title, tuple.paragraph, batchEmbeddings[index]);
    });
  }

  _logProgress(startTime, inlinksLength, dataLength) {
    const progress = Math.min(
      100,
      (dataLength / Math.min(inlinksLength, InlinkRetreival.MAX_STORE)) * 100
    ); //in percent
    const runTimeSeconds = (Date.now() - startTime) / 1000; // in seconds
    const eta = (runTimeSeconds / dataLength) * (inlinksLength - dataLength);

    this.state = `${progress.toFixed(0)}`;

    console.log(
      `${progress} ${runTimeSeconds} ${eta} ${inlinksLength} ${dataLength}`
    );
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _saveToDb(data) {
    try {
      for (const inlink of data) {
        await this.db.collection("datuPages").insertOne({
          pageName: this.pageName,
          title: inlink.title,
          paragraph: inlink.paragraph,
          embedding: inlink.embedding,
        });
      }
      console.log(`Successful save for ${this.pageName}`);
    } catch (error) {
      console.error(
        `Failed to save data to DB for page ${this.pageName}: ${error}`
      );
    }
  }

  static async isLargeEnough(pageName) {
    const data = await getInlinkData(pageName);
    return (data.length > 21) 
  }
}
module.exports = InlinkRetreival;
