import { createClient } from "jsr:@supabase/supabase-js@2";
import { criarProvider } from "./providers/factory.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  // --------------------------------------------------------
  // 1. Parse e validação básica do corpo da requisição
  // --------------------------------------------------------
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
    return jsonResponse(
      { error: "Informe a mensagem do cliente e a sua resposta." },
      400,
    );
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

  // --------------------------------------------------------
  // 2. Cliente Supabase (service role — só existe no backend)
  // --------------------------------------------------------
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --------------------------------------------------------
  // 3. Limite básico de requisições (por IP)
  // --------------------------------------------------------
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

  // Registra esta requisição (best-effort; não bloqueia o fluxo se falhar)
  await supabase.from("rate_limit_log").insert({ client_key: clientKey });

  // --------------------------------------------------------
  // 4. Chama o provedor de IA ativo
  // --------------------------------------------------------
  let respostaSugerida: string;
  let provider;
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

  // --------------------------------------------------------
  // 5. Salva no histórico (best-effort)
  // --------------------------------------------------------
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
