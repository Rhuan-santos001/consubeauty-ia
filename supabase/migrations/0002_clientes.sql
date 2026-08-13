-- ============================================================
-- Consultor de Atendimento — clientes (cadastro por apelido)
-- Rode DEPOIS de 0001_init.sql
-- ============================================================

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  apelido text not null unique,
  nome text not null default '',
  observacoes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists clientes_apelido_idx on clientes (apelido);

alter table atendimentos
  add column if not exists cliente_id uuid references clientes(id) on delete set null;

alter table clientes enable row level security;

drop policy if exists "clientes_all" on clientes;
create policy "clientes_all" on clientes
  for all using (true) with check (true);
