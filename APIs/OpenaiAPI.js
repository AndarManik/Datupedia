require("dotenv").config();
const OpenAI = require('openai');

class OpenaiAPI {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.maxRetries = 6;
    this.waitTime = 500; // in milliseconds
  }

  async exponentialBackoffRequest(apiCall) {
    let retryCount = 0
    while (retryCount < this.maxRetries) {
      try {
        const result = await apiCall();
        return result;
      } catch (error) {
        this.retryCount++;
        await this.sleep(this.waitTime * Math.pow(2, this.retryCount));
      }
    }
    console.log("call failed");
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async gpt4(system, prompt) {
    return this.exponentialBackoffRequest(async () => {
      const completion = await this.openai.chat.completions.create({
        messages: [{"role": "system", "content": `${system}`},
          {"role": "user", "content": `${prompt}`}],
        model: 'gpt-4',
      });
      return completion.choices[0].message.content;
    });
  }

  async gpt4Stream(system, prompt) {
    return this.exponentialBackoffRequest(async () => {
      return await this.openai.chat.completions.create({
        messages: [{"role": "system", "content": `${system}`},
          {"role": "user", "content": `${prompt}`}],
        model: 'gpt-4',
        stream: true,
      });
    });
  }

  async ada(textInput) {
    return this.exponentialBackoffRequest(async () => {
      const embedding = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: textInput,
      });
      return embedding.data[0].embedding;
    });
  }

  async adaBatch(textInputs) {
    return this.exponentialBackoffRequest(async () => {
      const embeddings = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: textInputs,
      });
      return embeddings.data.map(data => data.embedding);
    });
  }
}

module.exports = OpenaiAPI;
