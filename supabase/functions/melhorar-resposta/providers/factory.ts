import type { AiProvider } from "./types.ts";
import { GeminiProvider } from "./gemini.ts";
import { GroqProvider } from "./groq.ts";

/**
 * Ponto único de troca de provedor.
 * Para adicionar Claude/OpenAI no futuro:
 *   1. Crie providers/claude.ts (ou openai.ts) implementando AiProvider.
 *   2. Adicione um `case` abaixo.
 *   3. Mude a variável de ambiente AI_PROVIDER no Supabase — nada mais muda.
 */
export function criarProvider(): AiProvider {
  const provider = (Deno.env.get("AI_PROVIDER") ?? "gemini").toLowerCase();

  switch (provider) {
    case "gemini": {
      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY não configurada nas variáveis de ambiente.");
      }
      return new GeminiProvider(apiKey);
    }

    case "groq": {
      const apiKey = Deno.env.get("GROQ_API_KEY");
      if (!apiKey) {
        throw new Error("GROQ_API_KEY não configurada nas variáveis de ambiente.");
      }
      return new GroqProvider(apiKey);
    }

    // case "claude": return new ClaudeProvider(Deno.env.get("ANTHROPIC_API_KEY")!);
    // case "openai": return new OpenAiProvider(Deno.env.get("OPENAI_API_KEY")!);

    default:
      throw new Error(`Provedor de IA desconhecido: "${provider}"`);
  }
}
