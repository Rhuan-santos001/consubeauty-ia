import type { AiProvider, MelhorarRespostaInput } from "./types.ts";
import { montarPrompt } from "./prompt.ts";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiProvider implements AiProvider {
  nome = "gemini";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async melhorarResposta(input: MelhorarRespostaInput): Promise<string> {
    const prompt = montarPrompt(input);

    const resp = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini API retornou erro ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const candidato = data?.candidates?.[0];
    const partes = candidato?.content?.parts ?? [];
    const finishReason = candidato?.finishReason;

    // Com thinking ativado, o Gemini pode devolver mais de uma "parte":
    // uma de raciocínio interno (thought: true) e outra com a resposta final.
    // Pegamos só as partes que NÃO são raciocínio e juntamos o texto delas.
    const texto = partes
      .filter((p: any) => !p.thought && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("")
      .trim();

    if (!texto) {
      throw new Error(`Gemini API não retornou texto utilizável (finishReason: ${finishReason ?? "desconhecido"}).`);
    }

    // Se cortou por limite de tokens, é melhor avisar claramente do que
    // devolver uma resposta pela metade sem dizer nada.
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `Gemini cortou a resposta por limite de tokens (MAX_TOKENS). Texto parcial recebido: "${texto}"`,
      );
    }

    return texto;
  }
}
