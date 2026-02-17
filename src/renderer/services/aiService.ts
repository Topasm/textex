export class AIService {
    public async processText(action: 'fix' | 'academic' | 'summarize', text: string): Promise<string> {
        return window.api.aiProcess(action, text);
    }
}

export const aiService = new AIService();
