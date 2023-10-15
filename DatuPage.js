const InlinkCluster = require("./InlinkCluster");
const fs = require("fs").promises;
class Inlink {
  constructor(title, paragraph, embedding) {
    this.title = title;
    this.paragraph = paragraph;
    this.embedding = embedding;
  }
}
class DatuPage {
  static MAX_CONCURRENT_REQUESTS = 100;
  static DELAY_TIME = 500;
  static MAX_CHUNK_SIZE = 500;

  constructor(pageName, db, wikipediaAPI, textExtractor, openai, ws, position = []) {
    this.pageName = pageName;
    this.db = db;
    this.wikipediaAPI = wikipediaAPI;
    this.textExtractor = textExtractor;
    this.openai = openai;
    this.ws = ws;
    this.inlinkData = [];
    this.position = position;
  }

  async fetchData() {
    if (await this._loadFromLocal()) {
      return;
    }

    const startTime = Date.now();

    const inlinks = await this.wikipediaAPI.get_inlinks(this.pageName);
    const totalBatches = Math.ceil(
      inlinks.length / DatuPage.MAX_CONCURRENT_REQUESTS
    );

    for (let i = 0; i < inlinks.length; i += DatuPage.MAX_CONCURRENT_REQUESTS) {
      const batch = inlinks.slice(i, i + DatuPage.MAX_CONCURRENT_REQUESTS);
      const results = await this._fetchParagraphsInBatch(batch);

      results.forEach((inlink) => this.inlinkData.push(inlink));

      // Logging progress and estimated time remaining
      const batchesProcessed = i / DatuPage.MAX_CONCURRENT_REQUESTS + 1;
      const currentTime = Date.now();
      const timePerBatch = (currentTime - startTime) / batchesProcessed;
      const estimatedTimeRemaining =
        ((totalBatches - batchesProcessed) * timePerBatch) / 1000; // in seconds
      const progress = ((i + batch.length) / inlinks.length) * 100; // in percentage
      const state = `Loading:${progress.toFixed(
        2
      )}% ETA:${estimatedTimeRemaining.toFixed(
        2
      )} seconds Found ${this.inlinkData.length}`;
      this.ws.send(
        JSON.stringify({ status: "progress", message: "Loading state", state })
      );
      await this._delay(DatuPage.DELAY_TIME);
    }
    // Store the fetched data to the database
    await this._saveToLocal();
  }

  async _fetchParagraphsInBatch(inlinks) {
    const batchContent = await this.wikipediaAPI.get_page_content_batch(
      inlinks
    );
    const foundParagraphs = batchContent.map((content) =>
      this.textExtractor.get_paragraph_with_link(content, this.pageName)
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
    if(combinedTexts.length === 0){
      return [];
    }  
    const filteredParagraphs = combinedTexts.map((tuple) => tuple.paragraph);
    const batchEmbeddings = await this.openai.adaBatch(filteredParagraphs);
    return combinedTexts.map((tuple, index) => {
      return new Inlink(tuple.title, tuple.paragraph, batchEmbeddings[index]);
    });
  }

  async clusterData() {
    this.rootCluster = new InlinkCluster(6, this.inlinkData);
  }

  getWikiText(){
    return this.rootCluster.getTraverse(this.position).wikiText;
  }
  getProcessedWikiText(){
    return this.rootCluster.getTraverse(this.position).processedWikiText;
  }
  isFinished(){
    return this.rootCluster.getTraverse(this.position).wikiTextFinished;
  }

  async generatePage() {
    const inlinkCluster = this.rootCluster.getTraverse(this.position);
    if(inlinkCluster.wikiTextFinished) {
      return true;
    }
    const system = `
    You are tasked with crafting a Wikipedia-styled article based on the topic of \`${this.pageName}\`. We have provided you with select extracts from existing Wikipedia pages that link to ${this.pageName}. 

    **Instructions:**
    
    1. **Text Clusters**: We have segmented the provided text into three distinct clusters.
    2. **Article Sections**: Your article should have three article sections, correlating with each of the clusters, each article section is of equal importance.
    3. **Sectional Composition**: Each article section should have two paragraphs.
    4. **Information Utilization**: Utilize similar information within a cluster and avoid adding external information.
    5. **Title Links**: Incorporate wiki links throughout your article. Each section should have at least four links. Ensure to format wiki links using the wiki links notation: [[link]].
    6. **Header Differentiation**: Designate a unique and relevant title for each article section. Indicate these using the wikiheader format: ==header==.
    7. **Cluster Interpretation**: The article is to interpret the three distinct understandings of \`${this.pageName}\`. Ensure that each section maintains a consistent thematic flow.
    8. **Tonal Consistency**: Adopt a neutral and informative tone, appropriate for Wikipedia.
    9. **Similarities Focus**: Center your paragraphs around the overarching themes or similarities inherent in each cluster.
    10. **Expressive Narrative**: Favor a detailed and expressive narrative over brevity.
    11. **Considerations**: Avoid Listing or enumerating links, rather, make an indepth analysis based on the provided text with links throughout the text.
    **Reference Format:**
        ==Article header==
        This is the introductory paragraph, which incorporates a [[link]].
        Followed by additional insights and details...
    
        The subsequent paragraph might utilize another link type, [[link|display text]]. 
        Continue elaborating on the topic with further details...
    `;
    let prompt = inlinkCluster.getPrompt();

    if(inlinkCluster.superText.length !== 0){
      prompt += `Your article should be a subarticle for the following section: ${inlinkCluster.superText}`;
    }
    
    console.log(prompt);
    if (prompt) {
      inlinkCluster.wikitextStoreStream(await this.openai.gpt4Stream(system, prompt), this.wikipediaAPI);
      return true;
    }
    return false;
  }

  

  // Utility function to implement a delay
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Fetches paragraphs in a batch and returns Inlink objects or nulls
  

  async _loadFromLocal() {
    const filename = `./Datupages/${this.pageName}.json`;
    try {
      const data = await fs.readFile(filename, "utf-8");
      this.inlinkData = JSON.parse(data);
      return true; // Data successfully loaded from the database (file)
    } catch (err) {
      //console.log(`Failed to load data for ${this.pageName} from the database.`, err);
      return false; // Data not found or other read errors
    }
  }

  async _saveToLocal() {
    const filename = `./Datupages/${this.pageName}.json`;
    try {
      await fs.writeFile(
        filename,
        JSON.stringify(this.inlinkData, null, 2),
        "utf-8"
      );
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

  async _saveToDb() {
    try {
      const numChunks = Math.ceil(
        this.inlinkData.length / DatuPage.MAX_CHUNK_SIZE
      );

      for (let i = 0; i < numChunks; i++) {
        const chunkData = this.inlinkData.slice(
          i * DatuPage.MAX_CHUNK_SIZE,
          (i + 1) * DatuPage.MAX_CHUNK_SIZE
        );

        await this.db
          .collection("datuPages")
          .updateOne(
            { pageName: this.pageName, chunkNumber: i },
            { $set: { inlinkData: chunkData } },
            { upsert: true }
          );
      }
    } catch (error) {
      console.error(
        `Failed to save data to DB for page ${this.pageName}: ${error}`
      );
    }
  }

  async _loadFromDb() {
    try {
      const cursor = this.db
        .collection("datuPages")
        .find({ pageName: this.pageName })
        .sort({ chunkNumber: 1 });

      this.inlinkData = [];
      await cursor.forEach((doc) => {
        this.inlinkData.push(...doc.inlinkData);
      });
      console.log(this.inlinkData.length);
      if (this.inlinkData.length > 0) {
        return true; // Successfully loaded from DB
      }
      return false; // Data doesn't exist in DB
    } catch (error) {
      console.error(
        `Failed to load data from DB for page ${this.pageName}: ${error}`
      );
      return false;
    }
  }

  // Displays fetched data
  displayFetchedData() {
    let htmlContent = "<h2>Inlinks</h2>";
    this.inlinkData.forEach((inlink) => {
      if (inlink) {
        htmlContent += `<p>Title: ${inlink.title}</p>`;
        htmlContent += `<p>Paragraph: ${inlink.paragraph}</p>`;
      }
    });

    console.log("Data fetch return");
    return htmlContent;
  }
}

module.exports = DatuPage;
