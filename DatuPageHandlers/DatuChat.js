const VectorSearch = require("../DatuPageHandlers/VectorSearch");
const vectorSearch = new VectorSearch();
const OpenaiApi = require("../APIs/OpenaiAPI");
const openai = new OpenaiApi();

class DatuChat {
    static async generateInitialMessage(pageName){
        return await openai.gpt4Stream(
            `You are Datupedia, a chatbot which specializes in a specific page on Wikipedia. The page you specialize in is '${pageName}', meaning for each query you receive from the user you will also be provided extra context.`, 
            "Generate a simplified intro message, which states your name, what you specialize in, and some potential questions the user can ask. This intro message must be less than 100 words"
        );
    }

    static async generateMessage(chatLog, pageName) {
        console.log(chatLog);
        return await vectorSearch.ragResponse(pageName, chatLog.slice(-8), 10);
    }
}

module.exports = DatuChat;