const axios = require('axios');

class WikipediaAPI {
  constructor(lang = 'en') {
    this.lang = lang;
    this.base_url = `https://${lang}.wikipedia.org/w/api.php`;
  }

  async _api_call(params) {
    try {
      const response = await axios.get(this.base_url, { params });
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

  async get_inlinks(title, limit = 5000) {
    const params = {
      action: 'query',
      format: 'json',
      list: 'backlinks',
      bltitle: title,
      bllimit: limit,
      blnamespace: 0,
      continue: ''
    };
    let inlinks = [];
    while (true) {
      const data = await this._api_call(params);
      const inlink_pages = data.query.backlinks;
      inlinks = inlinks.concat(inlink_pages.map(page => page.title));
      if (!data.continue) {
        break;
      }
      params.continue = data.continue.continue;
      params.blcontinue = data.continue.blcontinue;
    }
    return inlinks;
  }

  async get_page_content(title) {
    const params = {
      action: 'parse',
      page: title,
      format: 'json',
      prop: 'text',
      contentmodel: 'wikitext'
    };
    const data = await this._api_call(params);
    return data.parse.text['*'];
  }

  async get_page_intro(title) {
    const params = {
      action: 'query',
      format: 'json',
      prop: 'extracts',
      exintro: '',
      explaintext: '',
      redirects: 1,
      titles: title
    };
    const data = await this._api_call(params);
    const pages = data.query.pages;
    for (const page_id in pages) {
      return pages[page_id].extract;
    }
  }

  async searchSuggestions(query) {
    const params = {
      origin: '*',
      action: 'opensearch',
      format: 'json',
      search: query
    };
  
    const data = await this._api_call(params);
    if (data) {
      return data[1];
    } else {
      console.log('An error occurred while fetching search suggestions');
      return [];
    }
  }
}

module.exports = WikipediaAPI;
