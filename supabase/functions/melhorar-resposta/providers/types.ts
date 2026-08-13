// Contrato que QUALQUER provedor de IA precisa cumprir.
// Trocar de Gemini para Groq/Claude/OpenAI = criar um novo arquivo
// nesta pasta que implemente essa interface, e apontar
// AI_PROVIDER para ele. O resto do sistema não muda.

export interface MelhorarRespostaInput {
  mensagemCliente: string;
  respostaOriginal: string;
  tipoAtendimento: string;
  nomeEmpresa: string;
  formaTratamento: string;
  tomAtendimento: string;
  regras: string;
}

export interface AiProvider {
  /** Nome curto do provedor, salvo no histórico para auditoria. */
  nome: string;
  melhorarResposta(input: MelhorarRespostaInput): Promise<string>;
}
