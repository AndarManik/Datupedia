const fs = require("fs").promises;
const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();
const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();
const TextExtractor = require("./TextExtractor");
const textExtractor = new TextExtractor();
const { getDb } = require("../APIs/MongoAPI");

class InlinkAnalysis {
  static MAX_REQUESTS = 100;
  static DELAY_TIME = 500;
  static MAX_CHUNK_SIZE = 250;

  constructor(pageName) {
    this.pageName = pageName;
    this.db = getDb();
    this.state = "Initializing Load";
    this.finished = false;
    this.data = [];
  }

  async fetchData() {
    if (await this._loadFromDb()) {
      console.log("fetch");
      this.finished = true;
      return;
    }
    const startTime = Date.now();
    const inlinks = (await wikipediaAPI.getInlinks(this.pageName)).slice(0, 5000);
    const totalBatches = Math.ceil(
      inlinks.length / InlinkAnalysis.MAX_REQUESTS
    );

    for (let i = 0; i < inlinks.length; i += InlinkAnalysis.MAX_REQUESTS) {
      const batch = inlinks.slice(i, i + InlinkAnalysis.MAX_REQUESTS);
      const results = await this._fetchParagraphsInBatch(batch);
      this.data.push(...results);
      this._logProgress(i, batch, startTime, totalBatches, inlinks.length);
      await this._delay(InlinkAnalysis.DELAY_TIME);
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

  _logProgress(i, batch, startTime, totalBatches, totalInlinks) {
    const batchesProcessed = i / InlinkAnalysis.MAX_REQUESTS + 1;
    const currentTime = Date.now();
    const timePerBatch = (currentTime - startTime) / batchesProcessed;
    const estimatedTimeRemaining =
      ((totalBatches - batchesProcessed) * timePerBatch) / 1000; // in seconds
    const progress = ((i + batch.length) / totalInlinks) * 100; // in percentage
    this.state = `Loading:${progress.toFixed(
      2
    )}% ETA:${estimatedTimeRemaining.toFixed(2)} seconds Found ${
      this.data.length
    }`;
    console.log(this.state);
  }

  // Utility function to implement a delay
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _saveToDb() {
    try {
      const numChunks = Math.ceil(
        this.data.length / InlinkAnalysis.MAX_CHUNK_SIZE
      );

      for (let i = 0; i < numChunks; i++) {
        const chunkData = this.data.slice(
          i * InlinkAnalysis.MAX_CHUNK_SIZE,
          (i + 1) * InlinkAnalysis.MAX_CHUNK_SIZE
        );

        await this.db
          .collection("datuPages")
          .updateOne(
            { pageName: this.pageName, chunkNumber: i },
            { $set: { inlinkData: chunkData } },
            { upsert: true }
          );
      }
      console.log(`Successful save for ${this.pageName}`);
    } catch (error) {
      console.error(
        `Failed to save data to DB for page ${this.pageName}: ${error}`
      );
    }
  }

  async _loadFromDb() {
    try {
      this.data = [];
      let chunkExists = true;
      let chunkNumber = 0;
      while (chunkExists) {
        const doc = await this.db
          .collection("datuPages")
          .findOne({ pageName: this.pageName, chunkNumber: chunkNumber });
        if (doc) {
          this.data.push(...doc.inlinkData);
          chunkNumber++;
        } else {
          chunkExists = false;
        }
      }
      if (this.data.length > 0) {
        return true; // Successfully loaded from DB
      }
      return false; // Data doesn't exist in DB
    } catch (error) {
      console.log(error);
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

  isLargeEnough(){
    return this.data.length > 21;
  }
}
class Inlink {
  constructor(title, paragraph, embedding) {
    this.title = title;
    this.paragraph = paragraph;
    this.embedding = embedding;
  }
}
module.exports = InlinkAnalysis;
