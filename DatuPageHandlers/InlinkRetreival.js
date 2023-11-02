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
    const inlinks = await wikipediaAPI.getInlinks(this.pageName, MAX_RETREIVE);

    for (
      let i = 0;
      i < inlinks.length && this.data.length < MAX_STORE;
      i += InlinkRetreival.MAX_REQUESTS
    ) {
      const batch = inlinks.slice(i, i + InlinkRetreival.MAX_REQUESTS);
      const results = await this._fetchParagraphsInBatch(batch);
      this.data.push(...results);
      this._logProgress(
        startTime,
        Math.min(inlinks.length, MAX_STORE),
        (inlinks.length < MAX_STORE) ? i : this.data.length
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
    const progress = (dataLength / inlinksLength) * 100; //in percent
    const runTimeSeconds = (Date.now() - startTime) / 1000; // in secionds
    const eta = (runTimeSeconds / dataLength) * (inlinksLength - dataLength);

    this.state = `
    Loading:${progress.toFixed(2)}%
    ETA:${eta.toFixed(2)} seconds 
    Run Time: ${runTimeSeconds.toFixed(2)} 
    Found: ${this.data.length}
    `;

    console.log(this.state);
  }

  // Utility function to implement a delay
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _saveToDb() {
    try {
      const numChunks = Math.ceil(
        this.data.length / InlinkRetreival.MAX_CHUNK_SIZE
      );

      await this.db
        .collection("datuPages")
        .updateOne(
          { pageName: this.pageName, type: "length" },
          { $set: { inlinkLength: this.data.length } },
          { upsert: true }
        );

      for (let i = 0; i < numChunks; i++) {
        const chunkData = this.data.slice(
          i * InlinkRetreival.MAX_CHUNK_SIZE,
          (i + 1) * InlinkRetreival.MAX_CHUNK_SIZE
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
      if (
        !await getDb()
        .collection("datuPages")
        .findOne({ pageName: pageName, type: "length" })
      ) {
        return false;
      }

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

  static async isLargeEnough(pageName) {
    const doc = await getDb()
      .collection("datuPages")
      .findOne({ pageName: pageName, type: "length" });
    return (doc) ? doc.inlinkLength > 21: false;
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
