// Inlink Class to represent the data structure for inlinks
class Inlink {
  constructor(title, paragraph) {
    this.title = title;
    this.paragraph = paragraph;
  }
}

// DatuPage Class for fetching and displaying Wikipedia data
class DatuPage {
  constructor(pageName, db, wikipediaAPI, textExtractor) {
    this.pageName = pageName;
    this.db = db;
    this.wikipediaAPI = wikipediaAPI;
    this.textExtractor = textExtractor;
    this.inlinkData = [];
    this.MAX_CONCURRENT_REQUESTS = 100;
    this.DELAY_TIME = 100;
  }

  // Private method for fetching individual paragraphs
  async _fetchParagraph(inlink) {
    try {
      const pageContent = await this.wikipediaAPI.get_page_content(inlink);
      const paragraph = await this.textExtractor.get_paragraph_with_link(
        pageContent,
        this.pageName
      );
      return paragraph != null ? new Inlink(inlink, paragraph) : null;
    } catch (error) {
      console.error(`Failed to fetch for ${inlink}: ${error}`);
      return null;
    }
  }

  // Fetches paragraphs in a batch and returns Inlink objects or nulls
  async _fetchParagraphsBatch(inlinks) {
    return Promise.allSettled(
      inlinks.map((inlink) => this._fetchParagraph(inlink))
    );
  }

  // Fetches all data for the page
  async fetchData() {
    const startTime = Date.now();
    let nullCount = 0;
    let notNullCount = 0;

    const inlinks = await this.wikipediaAPI.get_inlinks(this.pageName);

    for (let i = 0; i < inlinks.length; i += this.MAX_CONCURRENT_REQUESTS) {
      const batch = inlinks.slice(i, i + this.MAX_CONCURRENT_REQUESTS);
      const results = await this._fetchParagraphsBatch(batch);

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          if (result.value !== null) {
            this.inlinkData.push(result.value);
            notNullCount++;
          } else {
            nullCount++;
          }
        }
      });

      await this._delay(this.DELAY_TIME);
    }

    this._logPerformanceMetrics(startTime, nullCount, notNullCount);
  }

  // Utility function to implement a delay
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Logs performance metrics
  _logPerformanceMetrics(startTime, nullCount, notNullCount) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`Fetch finished in ${duration} seconds`);
    console.log(`Number of null paragraphs: ${nullCount}`);
    console.log(`Number of not-null paragraphs: ${notNullCount}`);
    console.log(`Pages/s: ${(nullCount + notNullCount) / duration}`);
  }

  // Displays fetched data
  displayFetchedData() {
    let htmlContent = "<h2>Inlinks</h2>";
    this.inlinkData.forEach((inlink) => {
      if (inlink !== null) {
        htmlContent += `<p>Title: ${inlink.title}</p>`;
        htmlContent += `<p>Paragraph: ${inlink.paragraph}</p>`;
      }
    });
    console.log("Data fetch return");
    return htmlContent;
  }
}

module.exports = DatuPage;
