import { supabase } from "./supabaseClient.js";
import { melhorarResposta } from "./aiService.js";

// ------------------------------------------------------------
// Elementos
// ------------------------------------------------------------
const els = {
  navBtns: document.querySelectorAll(".nav-btn"),
  views: {
    atendimento: document.getElementById("view-atendimento"),
    historico: document.getElementById("view-historico"),
    clientes: document.getElementById("view-clientes"),
  },

  selectCliente: document.getElementById("select-cliente"),
  mensagemCliente: document.getElementById("mensagem-cliente"),
  minhaResposta: document.getElementById("minha-resposta"),
  tipoAtendimento: document.getElementById("tipo-atendimento"),
  btnMelhorar: document.getElementById("btn-melhorar"),
  erroForm: document.getElementById("erro-form"),

  resultEmpty: document.getElementById("result-empty"),
  resultLoading: document.getElementById("result-loading"),
  resultContent: document.getElementById("result-content"),
  respostaSugerida: document.getElementById("resposta-sugerida"),
  btnCopiar: document.getElementById("btn-copiar"),
  btnRefazer: document.getElementById("btn-refazer"),
  btnLimpar: document.getElementById("btn-limpar"),
  copiadoMsg: document.getElementById("copiado-msg"),

  btnConfig: document.getElementById("btn-config"),
  btnFecharConfig: document.getElementById("btn-fechar-config"),
  configOverlay: document.getElementById("config-overlay"),
  configDrawer: document.getElementById("config-drawer"),
  cfgNomeEmpresa: document.getElementById("cfg-nome-empresa"),
  cfgFormaTratamento: document.getElementById("cfg-forma-tratamento"),
  cfgTom: document.getElementById("cfg-tom"),
  cfgRegras: document.getElementById("cfg-regras"),
  btnSalvarConfig: document.getElementById("btn-salvar-config"),
  configSalvoMsg: document.getElementById("config-salvo-msg"),

  historicoVazio: document.getElementById("historico-vazio"),
  historicoTable: document.getElementById("historico-table"),
  historicoTbody: document.getElementById("historico-tbody"),

  cliApelido: document.getElementById("cli-apelido"),
  cliNome: document.getElementById("cli-nome"),
  cliObservacoes: document.getElementById("cli-observacoes"),
  btnSalvarCliente: document.getElementById("btn-salvar-cliente"),
  clienteErro: document.getElementById("cliente-erro"),
  clienteSalvoMsg: document.getElementById("cliente-salvo-msg"),
  clientesVazio: document.getElementById("clientes-vazio"),
  clientesTable: document.getElementById("clientes-table"),
  clientesTbody: document.getElementById("clientes-tbody"),
};

// ------------------------------------------------------------
// Estado local (evita reconsultar o banco toda hora)
// ------------------------------------------------------------
let configuracoesAtuais = {
  nomeEmpresa: "",
  formaTratamento: "",
  tomAtendimento: "Cordial",
  regras: "",
};

let ultimaSubmissao = null; // usado pelo botão "Refazer"
let historicoCarregado = false;
let clientesCarregados = false;
let listaClientes = [];

// ------------------------------------------------------------
// Navegação entre views
// ------------------------------------------------------------
els.navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.navBtns.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    const alvo = btn.dataset.view;
    Object.entries(els.views).forEach(([nome, el]) => {
      el.classList.toggle("is-active", nome === alvo);
    });

    if (alvo === "historico" && !historicoCarregado) {
      carregarHistorico();
    }
    if (alvo === "clientes" && !clientesCarregados) {
      carregarClientes();
    }
  });
});

// ------------------------------------------------------------
// Configurações (drawer)
// ------------------------------------------------------------
async function carregarConfiguracoes() {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("nome_empresa, forma_tratamento, tom_atendimento, regras")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar configurações:", error);
    return;
  }

  if (data) {
    configuracoesAtuais = {
      nomeEmpresa: data.nome_empresa ?? "",
      formaTratamento: data.forma_tratamento ?? "",
      tomAtendimento: data.tom_atendimento ?? "Cordial",
      regras: data.regras ?? "",
    };
  }

  preencherFormularioConfig();
}

function preencherFormularioConfig() {
  els.cfgNomeEmpresa.value = configuracoesAtuais.nomeEmpresa;
  els.cfgFormaTratamento.value = configuracoesAtuais.formaTratamento;
  els.cfgTom.value = configuracoesAtuais.tomAtendimento;
  els.cfgRegras.value = configuracoesAtuais.regras;
}

function abrirConfig() {
  els.configOverlay.hidden = false;
  els.configDrawer.hidden = false;
}

function fecharConfig() {
  els.configOverlay.hidden = true;
  els.configDrawer.hidden = true;
}

els.btnConfig.addEventListener("click", abrirConfig);
els.btnFecharConfig.addEventListener("click", fecharConfig);
els.configOverlay.addEventListener("click", fecharConfig);

els.btnSalvarConfig.addEventListener("click", async () => {
  const payload = {
    nome_empresa: els.cfgNomeEmpresa.value.trim(),
    forma_tratamento: els.cfgFormaTratamento.value.trim(),
    tom_atendimento: els.cfgTom.value,
    regras: els.cfgRegras.value.trim(),
    updated_at: new Date().toISOString(),
  };

  els.btnSalvarConfig.disabled = true;

  // upsert na "linha única" de configurações
  const { data: existente } = await supabase
    .from("configuracoes")
    .select("id")
    .limit(1)
    .maybeSingle();

  const { error } = existente
    ? await supabase.from("configuracoes").update(payload).eq("id", existente.id)
    : await supabase.from("configuracoes").insert(payload);

  els.btnSalvarConfig.disabled = false;

  if (error) {
    console.error("Erro ao salvar configurações:", error);
    alert("Não foi possível salvar as configurações. Tente novamente.");
    return;
  }

  configuracoesAtuais = {
    nomeEmpresa: payload.nome_empresa,
    formaTratamento: payload.forma_tratamento,
    tomAtendimento: payload.tom_atendimento,
    regras: payload.regras,
  };

  els.configSalvoMsg.hidden = false;
  setTimeout(() => (els.configSalvoMsg.hidden = true), 2500);
});

// ------------------------------------------------------------
// Fluxo principal: melhorar resposta
// ------------------------------------------------------------
function setResultState(state) {
  els.resultEmpty.hidden = state !== "empty";
  els.resultLoading.hidden = state !== "loading";
  els.resultContent.hidden = state !== "content";
}

async function executarMelhoria() {
  const mensagemCliente = els.mensagemCliente.value.trim();
  const respostaOriginal = els.minhaResposta.value.trim();
  const tipoAtendimento = els.tipoAtendimento.value;

  els.erroForm.hidden = true;

  if (!mensagemCliente || !respostaOriginal) {
    els.erroForm.textContent = "Preencha a mensagem do cliente e sua resposta antes de continuar.";
    els.erroForm.hidden = false;
    return;
  }

  const clienteId = els.selectCliente.value || null;

  ultimaSubmissao = { mensagemCliente, respostaOriginal, tipoAtendimento, clienteId };

  els.btnMelhorar.disabled = true;
  setResultState("loading");

  try {
    const { respostaSugerida } = await melhorarResposta({
      mensagemCliente,
      respostaOriginal,
      tipoAtendimento,
      clienteId,
      configuracoes: configuracoesAtuais,
    });

    els.respostaSugerida.value = respostaSugerida;
    setResultState("content");
    historicoCarregado = false; // força recarregar na próxima vez que o usuário abrir o histórico
  } catch (err) {
    console.error(err);
    els.erroForm.textContent = err.message || "Não foi possível gerar a sugestão. Tente novamente.";
    els.erroForm.hidden = false;
    setResultState("empty");
  } finally {
    els.btnMelhorar.disabled = false;
  }
}

els.btnMelhorar.addEventListener("click", executarMelhoria);

els.btnRefazer.addEventListener("click", () => {
  if (ultimaSubmissao) executarMelhoria();
});

els.btnLimpar.addEventListener("click", () => {
  els.selectCliente.value = "";
  els.mensagemCliente.value = "";
  els.minhaResposta.value = "";
  els.tipoAtendimento.selectedIndex = 0;
  els.respostaSugerida.value = "";
  els.erroForm.hidden = true;
  setResultState("empty");
});

els.btnCopiar.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.respostaSugerida.value);
    els.copiadoMsg.hidden = false;
    setTimeout(() => (els.copiadoMsg.hidden = true), 2000);
  } catch {
    alert("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
  }
});

// ------------------------------------------------------------
// Histórico
// ------------------------------------------------------------
async function carregarHistorico() {
  const { data, error } = await supabase
    .from("atendimentos")
    .select(
      "id, created_at, tipo, mensagem_cliente, resposta_original, resposta_sugerida, status, cliente_id, clientes(apelido)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Erro ao carregar histórico:", error);
    return;
  }

  historicoCarregado = true;
  els.historicoTbody.innerHTML = "";

  if (!data || data.length === 0) {
    els.historicoVazio.hidden = false;
    els.historicoTable.hidden = true;
    return;
  }

  els.historicoVazio.hidden = true;
  els.historicoTable.hidden = false;

  data.forEach((item) => {
    const tr = document.createElement("tr");

    const dataFormatada = new Date(item.created_at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const apelido = item.clientes?.apelido ?? "—";

    tr.innerHTML = `
      <td>${dataFormatada}</td>
      <td>${escapeHtml(apelido)}</td>
      <td><span class="badge">${item.tipo}</span></td>
      <td class="truncate">${escapeHtml(item.mensagem_cliente)}</td>
      <td>${item.status}</td>
    `;

    tr.addEventListener("click", () => abrirAtendimentoDoHistorico(item));
    els.historicoTbody.appendChild(tr);
  });
}

function abrirAtendimentoDoHistorico(item) {
  // Leva o atendente de volta para a tela principal com os dados carregados
  els.selectCliente.value = item.cliente_id ?? "";
  els.mensagemCliente.value = item.mensagem_cliente;
  els.minhaResposta.value = item.resposta_original;
  els.tipoAtendimento.value = item.tipo;
  els.respostaSugerida.value = item.resposta_sugerida;

  ultimaSubmissao = {
    mensagemCliente: item.mensagem_cliente,
    respostaOriginal: item.resposta_original,
    tipoAtendimento: item.tipo,
    clienteId: item.cliente_id ?? null,
  };

  setResultState(item.resposta_sugerida ? "content" : "empty");

  document.querySelector('.nav-btn[data-view="atendimento"]').click();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ------------------------------------------------------------
// Clientes (cadastro por apelido)
// ------------------------------------------------------------
async function carregarClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, apelido, nome, observacoes")
    .order("apelido", { ascending: true });

  if (error) {
    console.error("Erro ao carregar clientes:", error);
    return;
  }

  clientesCarregados = true;
  listaClientes = data ?? [];

  renderSelectClientes();
  renderTabelaClientes();
}

function renderSelectClientes() {
  const valorAtual = els.selectCliente.value;
  els.selectCliente.innerHTML = '<option value="">Sem cliente vinculado</option>';

  listaClientes.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.apelido;
    els.selectCliente.appendChild(opt);
  });

  els.selectCliente.value = valorAtual;
}

function renderTabelaClientes() {
  els.clientesTbody.innerHTML = "";

  if (listaClientes.length === 0) {
    els.clientesVazio.hidden = false;
    els.clientesTable.hidden = true;
    return;
  }

  els.clientesVazio.hidden = true;
  els.clientesTable.hidden = false;

  listaClientes.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge">${escapeHtml(c.apelido)}</span></td>
      <td>${escapeHtml(c.nome || "—")}</td>
      <td class="truncate">${escapeHtml(c.observacoes || "—")}</td>
      <td></td>
    `;

    const tdAcao = tr.lastElementChild;
    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn-icon-delete";
    btnExcluir.type = "button";
    btnExcluir.title = "Excluir cliente";
    btnExcluir.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`;
    btnExcluir.addEventListener("click", (ev) => {
      ev.stopPropagation();
      excluirCliente(c.id);
    });
    tdAcao.appendChild(btnExcluir);

    els.clientesTbody.appendChild(tr);
  });
}

els.btnSalvarCliente.addEventListener("click", async () => {
  const apelido = els.cliApelido.value.trim();
  const nome = els.cliNome.value.trim();
  const observacoes = els.cliObservacoes.value.trim();

  els.clienteErro.hidden = true;

  if (!apelido) {
    els.clienteErro.textContent = "Informe um apelido pra continuar.";
    els.clienteErro.hidden = false;
    return;
  }

  els.btnSalvarCliente.disabled = true;

  const { error } = await supabase.from("clientes").insert({
    apelido,
    nome,
    observacoes,
  });

  els.btnSalvarCliente.disabled = false;

  if (error) {
    console.error("Erro ao salvar cliente:", error);
    els.clienteErro.textContent = error.code === "23505"
      ? "Já existe um cliente com esse apelido."
      : "Não foi possível salvar o cliente. Tente novamente.";
    els.clienteErro.hidden = false;
    return;
  }

  els.cliApelido.value = "";
  els.cliNome.value = "";
  els.cliObservacoes.value = "";
  els.clienteSalvoMsg.hidden = false;
  setTimeout(() => (els.clienteSalvoMsg.hidden = true), 2000);

  clientesCarregados = false;
  carregarClientes();
});

async function excluirCliente(id) {
  if (!confirm("Excluir este cliente? Atendimentos antigos ficam sem o vínculo, mas não são apagados.")) return;

  const { error } = await supabase.from("clientes").delete().eq("id", id);

  if (error) {
    console.error("Erro ao excluir cliente:", error);
    alert("Não foi possível excluir o cliente.");
    return;
  }

  clientesCarregados = false;
  carregarClientes();
}

// ------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------
carregarConfiguracoes();
carregarClientes();
