-- ============================================================
-- Consultor de Atendimento — schema inicial
-- Rode este arquivo no SQL Editor do Supabase (ou via supabase db push)
-- ============================================================

-- Extensão usada para gerar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabela: configuracoes
-- Guarda UMA linha com as preferências do atendente/empresa.
-- Simples de propósito: não é multi-empresa, é o seu copiloto pessoal.
-- ------------------------------------------------------------
create table if not exists configuracoes (
  id uuid primary key default gen_random_uuid(),
  nome_empresa text not null default '',
  forma_tratamento text not null default 'Olá, tudo bem?',
  tom_atendimento text not null default 'Cordial'
    check (tom_atendimento in ('Profissional','Cordial','Direto','Amigável','Técnico')),
  regras text not null default '',
  updated_at timestamptz not null default now()
);

-- Garante que só existe 1 linha de configuração
create unique index if not exists configuracoes_singleton
  on configuracoes ((true));

-- Já cria a linha padrão, se não existir nenhuma
insert into configuracoes (nome_empresa, forma_tratamento, tom_atendimento, regras)
select '', 'Olá, tudo bem?', 'Cordial', ''
where not exists (select 1 from configuracoes);

-- ------------------------------------------------------------
-- Tabela: atendimentos
-- Histórico de cada melhoria gerada.
-- ------------------------------------------------------------
create table if not exists atendimentos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null
    check (tipo in ('Dúvida','Reclamação','Solicitação','Prazo','Orçamento','Pós-venda','Outro')),
  mensagem_cliente text not null,
  resposta_original text not null,
  resposta_sugerida text not null default '',
  status text not null default 'gerado'
    check (status in ('gerado','editado','copiado')),
  ai_provider text
);

create index if not exists atendimentos_created_at_idx
  on atendimentos (created_at desc);

-- ------------------------------------------------------------
-- Tabela: rate_limit_log
-- Suporte para o limite básico de requisições feito na Edge Function.
-- Guarda só um carimbo de tempo por chamada; linhas antigas podem
-- ser limpas periodicamente (não é crítico manter histórico aqui).
-- ------------------------------------------------------------
create table if not exists rate_limit_log (
  id bigint generated always as identity primary key,
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_log_key_time_idx
  on rate_limit_log (client_key, created_at desc);

-- ------------------------------------------------------------
-- RLS (Row Level Security)
-- Este projeto não tem login de usuário (é uma ferramenta pessoal
-- do atendente). Por isso liberamos acesso via chave anônima, mas
-- deixamos a estrutura pronta para restringir depois caso você
-- adicione autenticação.
-- ------------------------------------------------------------
alter table configuracoes enable row level security;
alter table atendimentos enable row level security;
alter table rate_limit_log enable row level security;

drop policy if exists "configuracoes_all" on configuracoes;
create policy "configuracoes_all" on configuracoes
  for all using (true) with check (true);

drop policy if exists "atendimentos_all" on atendimentos;
create policy "atendimentos_all" on atendimentos
  for all using (true) with check (true);

-- rate_limit_log só é escrito/lido pela Edge Function (service role),
-- então não precisa de policy pública. A service role ignora RLS.
