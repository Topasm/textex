import type { AiProcessRequest } from '../../shared/types'

export class AIService {
  public async processText(request: AiProcessRequest): Promise<string> {
    return window.api.aiProcess(request)
  }
}

export const aiService = new AIService()
