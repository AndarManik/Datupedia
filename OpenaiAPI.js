const OpenAI = require('openai');
  
class OpenaiAPI {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }
  async gpt4(system, prompt) {
    const completion = await this.openai.chat.completions.create({
      messages: [{"role": "system", "content": `${system}`},
        {"role": "user", "content": `${prompt}`}],
      model: 'gpt-4',
    });

    return completion.choices[0].message.content;
  }

  async gpt4Stream(system, prompt) {
    return await this.openai.chat.completions.create({
      messages: [{"role": "system", "content": `${system}`},
        {"role": "user", "content": `${prompt}`}],
      model: 'gpt-4',
      stream: true,
    });
  }

  async ada(textInput){
    const embedding = await this.openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: textInput,
    });
    return embedding.data[0].embedding
  }

  async adaBatch(textInputs) {
    const embeddings = await this.openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: textInputs,
    });
    return embeddings.data.map(data => data.embedding);
  }
}
module.exports = OpenaiAPI;
