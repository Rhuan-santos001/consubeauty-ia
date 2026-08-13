// ============================================================
// VERSÃO ÚNICO-ARQUIVO — use esta se for colar direto no editor
// do Supabase Dashboard (ele não resolveu bem os imports relativos
// entre providers/*.ts). Se você for fazer deploy via CLI, pode
// usar a versão modular (index.ts + providers/) em vez desta.
//
// Trocar de provedor de IA aqui: edite só a função criarProvider()
// lá embaixo — o resto do arquivo não muda.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIPOS_VALIDOS = [
  "Dúvida",
  "Reclamação",
  "Solicitação",
  "Prazo",
  "Orçamento",
  "Pós-venda",
  "Outro",
];

const LIMITE_CARACTERES = 4000;
const RATE_LIMIT_JANELA_MS = 60_000; // 1 minuto
const RATE_LIMIT_MAX_REQS = 15; // por janela, por IP

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ------------------------------------------------------------
// Prompt — regras de fidelidade à resposta original
// ------------------------------------------------------------
interface MelhorarRespostaInput {
  mensagemCliente: string;
  respostaOriginal: string;
  tipoAtendimento: string;
  nomeEmpresa: string;
  formaTratamento: string;
  tomAtendimento: string;
  regras: string;
}

function montarPrompt(input: MelhorarRespostaInput): string {
  const {
    mensagemCliente,
    respostaOriginal,
    tipoAtendimento,
    nomeEmpresa,
    formaTratamento,
    tomAtendimento,
    regras,
  } = input;

  return `Você é um assistente de apoio ao atendimento ao cliente. Sua função é melhorar a resposta escrita pelo atendente. Preserve integralmente os fatos fornecidos pelo atendente. Nunca invente informações.

REGRAS ABSOLUTAS (nunca violar):
- NÃO invente prazos, preços, datas, políticas ou qualquer dado que não esteja na resposta do atendente.
- NÃO prometa nada que o atendente não tenha dito.
- NÃO altere o sentido da resposta original.
- Se a resposta do atendente estiver incompleta, mantenha a informação limitada ao que foi fornecido — não preencha lacunas.
- Se o atendente não souber uma informação, oriente que irá verificar, sem inventar quando ou o quê.

PRIORIDADES, em ordem:
1. Fidelidade à resposta original
2. Clareza
3. Cordialidade
4. Profissionalismo
5. Objetividade

CONTEXTO DO ATENDIMENTO:
- Empresa: ${nomeEmpresa || "(não informado)"}
- Forma de tratamento preferida: ${formaTratamento || "(não informado)"}
- Tom desejado: ${tomAtendimento || "Cordial"}
- Tipo de atendimento: ${tipoAtendimento}
${regras ? `- Regras específicas definidas pelo atendente:\n${regras}` : ""}

MENSAGEM DO CLIENTE:
"""
${mensagemCliente}
"""

RESPOSTA DO ATENDENTE (rascunho, pode estar informal ou incompleta — esta é a fonte da verdade):
"""
${respostaOriginal}
"""

Reescreva a resposta do atendente aplicando as regras acima. Responda APENAS com o texto final da resposta ao cliente, sem explicações, sem aspas, sem markdown.`;
}

// ------------------------------------------------------------
// Provedores de IA
// ------------------------------------------------------------
interface AiProvider {
  nome: string;
  melhorarResposta(input: MelhorarRespostaInput): Promise<string>;
}

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

class GeminiProvider implements AiProvider {
  nome = "gemini";
  constructor(private apiKey: string) {}

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

    const texto = partes
      .filter((p: any) => !p.thought && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("")
      .trim();

    if (!texto) {
      throw new Error(`Gemini API não retornou texto utilizável (finishReason: ${finishReason ?? "desconhecido"}).`);
    }

    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `Gemini cortou a resposta por limite de tokens (MAX_TOKENS). Texto parcial recebido: "${texto}"`,
      );
    }

    return texto;
  }
}

// ------------------------------------------------------------
// Groq — alternativa gratuita, sem os problemas de "thinking" do Gemini 3.x
// ------------------------------------------------------------
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

class GroqProvider implements AiProvider {
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

// Ponto único de troca de provedor. Pra trocar no futuro:
// crie uma nova classe implementando AiProvider acima, e mude o
// case abaixo (mais a secret AI_PROVIDER correspondente).
function criarProvider(): AiProvider {
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

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisição inválido (JSON esperado)." }, 400);
  }

  const mensagemCliente = String(body.mensagemCliente ?? "").trim();
  const respostaOriginal = String(body.respostaOriginal ?? "").trim();
  const tipoAtendimento = String(body.tipoAtendimento ?? "").trim();
  const nomeEmpresa = String(body.nomeEmpresa ?? "").trim();
  const formaTratamento = String(body.formaTratamento ?? "").trim();
  const tomAtendimento = String(body.tomAtendimento ?? "Cordial").trim();
  const regras = String(body.regras ?? "").trim();
  const clienteId = body.clienteId ? String(body.clienteId) : null;

  if (!mensagemCliente || !respostaOriginal) {
    return jsonResponse({ error: "Informe a mensagem do cliente e a sua resposta." }, 400);
  }

  if (!TIPOS_VALIDOS.includes(tipoAtendimento)) {
    return jsonResponse({ error: "Tipo de atendimento inválido." }, 400);
  }

  if (
    mensagemCliente.length > LIMITE_CARACTERES ||
    respostaOriginal.length > LIMITE_CARACTERES ||
    regras.length > LIMITE_CARACTERES
  ) {
    return jsonResponse(
      { error: `Textos muito longos (limite de ${LIMITE_CARACTERES} caracteres cada).` },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const clientKey =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";

  const desde = new Date(Date.now() - RATE_LIMIT_JANELA_MS).toISOString();
  const { count, error: countError } = await supabase
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("client_key", clientKey)
    .gte("created_at", desde);

  if (!countError && (count ?? 0) >= RATE_LIMIT_MAX_REQS) {
    return jsonResponse(
      { error: "Muitas requisições em pouco tempo. Aguarde um instante e tente novamente." },
      429,
    );
  }

  await supabase.from("rate_limit_log").insert({ client_key: clientKey });

  let respostaSugerida: string;
  let provider: AiProvider;
  try {
    provider = criarProvider();
    respostaSugerida = await provider.melhorarResposta({
      mensagemCliente,
      respostaOriginal,
      tipoAtendimento,
      nomeEmpresa,
      formaTratamento,
      tomAtendimento,
      regras,
    });
  } catch (err) {
    console.error("Erro ao chamar provedor de IA:", err);
    return jsonResponse(
      { error: "Não foi possível gerar a sugestão agora. Tente novamente." },
      502,
    );
  }

  const { data: atendimento, error: insertError } = await supabase
    .from("atendimentos")
    .insert({
      tipo: tipoAtendimento,
      mensagem_cliente: mensagemCliente,
      resposta_original: respostaOriginal,
      resposta_sugerida: respostaSugerida,
      status: "gerado",
      ai_provider: provider.nome,
      cliente_id: clienteId,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Erro ao salvar histórico:", insertError);
  }

  return jsonResponse({
    respostaSugerida,
    atendimentoId: atendimento?.id ?? null,
  });
});
