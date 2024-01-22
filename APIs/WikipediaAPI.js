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
    const promises = titles.map((title) => this.getContent(title));
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
      return data.query.search.map((item) => item.title);
    } else {
      console.log("An error occurred while fetching 'more like' results");
      return [];
    }
  }

  async getRandom() {
    const params = {
      action: "query",
      format: "json",
      list: "random",
      rnnamespace: 0, // namespace 0 refers to Wikipedia articles
      rnlimit: 1, // number of random articles to fetch
    };

    const data = await this._apiCall(params);
    if (
      data &&
      data.query &&
      data.query.random &&
      data.query.random.length > 0
    ) {
      return data.query.random[0].title; // returns the title of the random article
    } else {
      console.log("An error occurred while fetching a random page");
      return null;
    }
  }

  async searchWikipedia(title) {
    const params = {
      action: "query",
      list: "search",
      srsearch: title,
      format: "json",
    };
    const data = await this._apiCall(params);
    return data.query.search;
  }

  async resolveRedirectsOrSearch(titles) {
    const resolvedTitles = [];

    const joinedTitles = titles.join("|");
    const params = {
      action: "query",
      titles: joinedTitles,
      redirects: "",
      format: "json",
    };
    const data = await this._apiCall(params);

    const redirects = data.query.redirects || [];
    const normalized = data.query.normalized || [];
    const redirectMap = Object.fromEntries(
      redirects.map((r) => [r.from, r.to])
    );
    const normalizeMap = Object.fromEntries(
      normalized.map((n) => [n.from, n.to])
    );

    for (const title of titles) {
      let resolvedTitle = normalizeMap[title] || title;
      resolvedTitle = redirectMap[resolvedTitle] || resolvedTitle;

      if (!(resolvedTitle in data.query.pages)) {
        const searchResults = await this.searchWikipedia(title);
        resolvedTitle =
          searchResults.length > 0
            ? searchResults[0].title.toLowerCase()
            : null;
      }

      resolvedTitles.push(resolvedTitle);
    }

    return [...new Set(resolvedTitles)];
  }
}

module.exports = WikipediaAPI;
