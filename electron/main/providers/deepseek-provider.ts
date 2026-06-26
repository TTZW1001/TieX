import { OpenAICompatibleProvider } from './openai-compatible-provider'

/**
 * DeepSeek API Provider 实现
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super({ providerName: 'DeepSeek' })
  }
}
