const axios = require("axios");

class WikipediaAPI {
  constructor(lang = "en") {
    this.lang = lang;
    this.baseUrl = `https://${lang}.wikipedia.org/w/api.php`;
  }

  async _apiCall(params) {
    try {
      const response = await axios.get(this.baseUrl, { params });
      const data = response.data;
      if (data.error) {
        console.log(`Error: ${data.error.info}`);
      }
      return data;
    } catch (error) {
      console.log(`An error occurred: ${error.message}`);
      return null;
    }
  }

  async getInlinks(title, limit = 5000) {
    const params = {
      action: "query",
      format: "json",
      list: "backlinks",
      bltitle: title,
      bllimit: limit,
      blnamespace: 0,
      continue: "",
    };
    let inlinks = [];
    while (true) {
      const data = await this._apiCall(params);
      const inlink_pages = data.query.backlinks;
      inlinks = inlinks.concat(inlink_pages.map((page) => page.title));
      if (!data.continue) {
        break;
      }
      params.continue = data.continue.continue;
      params.blcontinue = data.continue.blcontinue;
    }
    return inlinks;
  }

  async getContent(title) {
    const params = {
      action: "parse",
      page: title,
      format: "json",
      prop: "text",
      contentmodel: "wikitext",
    };
    const data = await this._apiCall(params);
    return data.parse.text["*"];
  }

  async getContentBatch(titles) {
    // Map over titles and call getContent for each title
    const promises = titles.map((title) => this.getContent(title));

    // Use Promise.all to wait for all promises to resolve
    const contents = await Promise.all(promises);

    return contents;
  }

  async getIntro(title) {
    const params = {
      action: "query",
      format: "json",
      prop: "extracts",
      exintro: "",
      explaintext: "",
      redirects: 1,
      titles: title,
    };
    const data = await this._apiCall(params);
    const pages = data.query.pages;
    for (const page_id in pages) {
      return pages[page_id].extract;
    }
  }
  async getIntroBatch(titles) {
    const params = {
      action: "query",
      format: "json",
      prop: "extracts",
      exintro: "",
      explaintext: "",
      redirects: 1,
      titles: titles.join("|"),
    };

    const data = await this._apiCall(params);
    const pages = data.query.pages;

    // Construct a map for easy lookup of the introduction by title.
    const titleToIntroMap = {};
    for (const pageID in pages) {
      const page = pages[pageID];
      titleToIntroMap[page.title] = page.extract; // introduction content
    }

    // Use the original titles array to maintain order.
    const orderedIntroductions = titles.map(
      (title) => titleToIntroMap[title] || null
    );

    return orderedIntroductions;
  }

  async searchSuggestions(query) {
    const params = {
      origin: "*",
      action: "opensearch",
      format: "json",
      search: query,
    };

    const data = await this._apiCall(params);
    if (data) {
      return data[1];
    } else {
      console.log("An error occurred while fetching search suggestions");
      return [];
    }
  }

  async parseWikitext(wikitext) {
    const params = {
      action: "parse",
      contentmodel: "wikitext",
      format: "json",
      prop: "text",
      text: wikitext,
    };

    const data = await this._apiCall(params);
    if (data && data.parse && data.parse.text) {
      return data.parse.text["*"];
    } else {
      console.log("An error occurred while parsing wikitext");
      return null;
    }
  }

  async getMoreLike(title, limit = 10) {
    const params = {
      action: "query",
      format: "json",
      list: "search",
      srsearch: `morelike:${title}`,
      srlimit: limit,
    };

    const data = await this._apiCall(params);
    if (data && data.query && data.query.search) {
      return data.query.search.map(item => item.title);
    } else {
      console.log("An error occurred while fetching 'more like' results");
      return [];
    }
  }

}

module.exports = WikipediaAPI;