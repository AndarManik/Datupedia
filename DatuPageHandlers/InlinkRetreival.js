const fs = require("fs").promises;
const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();
const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const TextExtractor = require("./TextExtractor");
const textExtractor = new TextExtractor();
const { getDb } = require("../APIs/MongoAPI");

class InlinkRetreival {
  static MAX_REQUESTS = 100;
  static DELAY_TIME = 500;
  static MAX_CHUNK_SIZE = 250;
  static MAX_RETREIVE = 1500;
  static MAX_STORE = 500

  constructor(pageName) {
    this.pageName = pageName;
    this.db = getDb();
    this.state = "0";
    this.finished = false;
    this.data = [];
  }

  async fetchData() {

      if (await this._loadFromDb()) {
        this.finished = true;
        return;
      }

    const startTime = Date.now();
    
    const inlinks = await wikipediaAPI.getInlinks(this.pageName, InlinkRetreival.MAX_RETREIVE);

    for (
      let i = 0;
      i < inlinks.length && this.data.length < InlinkRetreival.MAX_STORE;
      i += InlinkRetreival.MAX_REQUESTS
    ) {
      const batch = inlinks.slice(i, i + InlinkRetreival.MAX_REQUESTS);
      const results = await this._fetchParagraphsInBatch(batch);
      this.data.push(...results);
      this._logProgress(
        startTime,
        Math.min(inlinks.length, InlinkRetreival.MAX_STORE),
        (inlinks.length < InlinkRetreival.MAX_STORE) ? i : this.data.length
      );
      await this._delay(InlinkRetreival.DELAY_TIME);
    }

    await this._saveToDb();
    this.finished = true;
  }

  async _fetchParagraphsInBatch(inlinks) {
    const batchContent = await wikipediaAPI.getContentBatch(inlinks);
    const foundParagraphs = batchContent.map((content) =>
      textExtractor.getParagraphHasLink(content, this.pageName)
    );

    const combinedTexts = foundParagraphs
      .map((paragraph, index) => {
        if (paragraph) {
          return {
            title: inlinks[index],
            paragraph: paragraph,
          };
        }
        return null;
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
    const progress = Math.min(100,(dataLength / Math.min(inlinksLength,  InlinkRetreival.MAX_STORE)) * 100); //in percent
    const runTimeSeconds = (Date.now() - startTime) / 1000; // in secionds
    const eta = (runTimeSeconds / dataLength) * (inlinksLength - dataLength);

    this.state = `${progress.toFixed(0)}`;

    console.log(this.state);
  }

  // Utility function to implement a delay
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _saveToDb() {
    try {
      for (const inlink of this.data) {
        await this.db.collection("datuPages").insertOne({
          pageName: this.pageName,
          title: inlink.title,
          paragraph: inlink.paragraph,
          embedding: inlink.embedding
        });
      }
      console.log(`Successful save for ${this.pageName}`);
    } catch (error) {
      console.error(`Failed to save data to DB for page ${this.pageName}: ${error}`);
    }
  }
  

  async _loadFromDb() {
    try {
      const cursor = this.db.collection("datuPages").find({ pageName: this.pageName });
      this.data = await cursor.toArray();
      
      if (this.data.length > 0) {
        return true; // Successfully loaded from DB
      }
      return false; // Data doesn't exist in DB
    } catch (error) {
      console.log(`Error loading data from DB for page ${this.pageName}: ${error}`);
      return false;
    }
  }
  

  async _loadFromLocal() {
    const filename = `./Datupages/${this.pageName}.json`;
    try {
      const data = await fs.readFile(filename, "utf-8");
      this.data = JSON.parse(data);
      return true; // Data successfully loaded from the database (file)
    } catch (err) {
      //console.log(`Failed to load data for ${this.pageName} from the database.`, err);
      return false; // Data not found or other read errors
    }
  }

  async _saveToLocal() {
    const filename = `./Datupages/${this.pageName}.json`;
    try {
      await fs.writeFile(filename, JSON.stringify(this.data, null, 2), "utf-8");
      console.log(
        `Data for ${this.pageName} successfully saved to the database.`
      );
    } catch (err) {
      console.log(
        `Failed to save data for ${this.pageName} to the database.`,
        err
      );
    }
  }

  static async isLargeEnough(pageName) {
     const cursor = getDb().collection("datuPages").find({ pageName: pageName });
      const data = await cursor.toArray();
      
      if (data.length > 21) {
        return true; // Successfully loaded from DB
      }
      return false; // Data doesn't exist in DB
  }
}
class Inlink {
  constructor(title, paragraph, embedding) {
    this.title = title;
    this.paragraph = paragraph;
    this.embedding = embedding;
  }
}
module.exports = InlinkRetreival;
