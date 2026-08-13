import type { AiProvider, MelhorarRespostaInput } from "./types.ts";
import { montarPrompt } from "./prompt.ts";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements AiProvider {
  nome = "groq";
  constructor(private apiKey: string) {}

  async melhorarResposta(input: MelhorarRespostaInput): Promise<string> {
    const prompt = montarPrompt(input);

    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.4,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Groq API retornou erro ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const texto = data?.choices?.[0]?.message?.content;
    const finishReason = data?.choices?.[0]?.finish_reason;

    if (!texto || typeof texto !== "string") {
      throw new Error(`Groq API não retornou texto utilizável (finish_reason: ${finishReason ?? "desconhecido"}).`);
    }

    if (finishReason === "length") {
      throw new Error(`Groq cortou a resposta por limite de tokens. Texto parcial: "${texto.trim()}"`);
    }

    return texto.trim();
  }
}
