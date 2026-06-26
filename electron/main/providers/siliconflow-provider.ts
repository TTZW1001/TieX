import { OpenAICompatibleProvider } from './openai-compatible-provider'

/**
 * SiliconFlow API Provider 实现
 */
export class SiliconFlowProvider extends OpenAICompatibleProvider {
  constructor() {
    super({ providerName: 'SiliconFlow' })
  }
}
