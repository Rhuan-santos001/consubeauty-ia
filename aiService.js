// ============================================================
// aiService — única porta de entrada para "melhorar uma resposta".
// O frontend nunca fala com Gemini/Groq/Claude/OpenAI diretamente;
// ele fala com esta função, que fala com a Edge Function, que
// decide qual provedor de IA usar. Trocar de provedor no backend
// não exige nenhuma mudança aqui.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, EDGE_FUNCTION_NAME } from "./config.js";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`;

/**
 * @param {object} params
 * @param {string} params.mensagemCliente
 * @param {string} params.respostaOriginal
 * @param {string} params.tipoAtendimento
 * @param {string|null} [params.clienteId]
 * @param {object} params.configuracoes  { nomeEmpresa, formaTratamento, tomAtendimento, regras }
 * @returns {Promise<{ respostaSugerida: string, atendimentoId: string|null }>}
 */
export async function melhorarResposta({
  mensagemCliente,
  respostaOriginal,
  tipoAtendimento,
  clienteId,
  configuracoes,
}) {
  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      mensagemCliente,
      respostaOriginal,
      tipoAtendimento,
      clienteId: clienteId || null,
      nomeEmpresa: configuracoes?.nomeEmpresa ?? "",
      formaTratamento: configuracoes?.formaTratamento ?? "",
      tomAtendimento: configuracoes?.tomAtendimento ?? "Cordial",
      regras: configuracoes?.regras ?? "",
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data?.error || `Erro inesperado (${resp.status}).`);
  }

  return data;
}
