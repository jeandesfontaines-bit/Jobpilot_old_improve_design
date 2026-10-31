import axios from 'axios';

export interface OllamaCloudResponse {
  text: string;
  model: string;
  keyIndex: number;
}

class OllamaCloudRotator {
  private keys: string[] = [];
  private currentKeyIndex = 0;
  private defaultModel = 'gemma4:31b-cloud';

  constructor() {
    this.reloadKeys();
  }

  public reloadKeys(): void {
    const rawKeys = process.env.OLLAMA_API_KEYS || process.env.OLLAMA_API_KEY || '';
    this.keys = rawKeys
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    this.defaultModel = process.env.OLLAMA_CLOUD_MODEL || 'gemma4:31b-cloud';
  }

  public hasKeys(): boolean {
    return this.keys.length > 0;
  }

  public getKeyCount(): number {
    return this.keys.length;
  }

  public async generate(prompt: string, modelOverride?: string): Promise<OllamaCloudResponse> {
    if (!this.hasKeys()) {
      throw new Error('Aucune clé API Ollama Cloud configurée dans OLLAMA_API_KEYS.');
    }

    // N'accepter que les overrides qui ressemblent à des modèles cloud (pas llama3, codellama, etc.)
    // Si l'override est un modèle local typique, on utilise le modèle cloud par défaut
    const localModelPattern = /^(llama\d*|codellama|mistral|phi\d*|vicuna|alpaca|orca)$/i;
    const model = (modelOverride && !localModelPattern.test(modelOverride))
      ? modelOverride
      : this.defaultModel;
    let attempts = 0;
    const maxAttempts = this.keys.length;

    while (attempts < maxAttempts) {
      const activeKey = this.keys[this.currentKeyIndex];
      const maskedKey = `${activeKey.slice(0, 8)}...`;

      try {
        const response = await axios.post(
          'https://ollama.com/api/chat',
          {
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false
          },
          {
            headers: {
              Authorization: `Bearer ${activeKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const content = response.data?.message?.content || response.data?.response || '';
        return {
          text: content,
          model,
          keyIndex: this.currentKeyIndex
        };
      } catch (err: any) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.error || err.message;
        console.warn(`[Ollama Cloud] Échec avec la clé #${this.currentKeyIndex + 1} (${maskedKey}) - Statut: ${status} : ${errMsg}`);

        // Rotate to the next key on 429 (Rate limit) or 5xx server errors
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
        attempts++;

        if (attempts >= maxAttempts) {
          throw new Error(`Toutes les clés API Ollama Cloud (${maxAttempts}) ont échoué : ${errMsg}`);
        }
        console.info(`[Ollama Cloud] Bascule automatique vers la clé #${this.currentKeyIndex + 1}...`);
      }
    }

    throw new Error('Échec imprévu de rotation Ollama Cloud.');
  }
}

export const ollamaCloud = new OllamaCloudRotator();
