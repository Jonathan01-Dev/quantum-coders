import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        if (!apiKey || apiKey === 'your_api_key_here') {
            throw new Error("Invalid Gemini API Key provided to GeminiService.");
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Using gemini-1.5-flash-latest which is the more stable ID for this tier
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    }

    async generateResponse(prompt: string, history: any[] = []): Promise<string> {
        try {
            console.log(`[GEMINI] Generating response for prompt: "${prompt.slice(0, 20)}..."`);
            const chat = this.model.startChat({ history });
            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            const text = response.text();
            console.log(`[GEMINI] Success. Response length: ${text.length}`);
            return text;
        } catch (error) {
            console.error("Gemini API Error DETAILS:", JSON.stringify(error, null, 2));
            throw error;
        }
    }

    async summarizeContent(content: string): Promise<string> {
        const prompt = `Please provide a concise summary of the following content:\n\n${content}`;
        return this.generateResponse(prompt);
    }
}
