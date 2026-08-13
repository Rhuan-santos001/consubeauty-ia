# Consultor de Atendimento

Copiloto de resposta: cola mensagem do cliente, escreve rascunho, IA melhora. IA nunca inventa dado — só reforça o que você escreveu.

## Estrutura

```
consultor-atendimento/
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js        ← único arquivo que você edita
│       ├── supabaseClient.js
│       ├── aiService.js     ← camada que abstrai o provedor de IA
│       └── app.js
├── supabase/
│   ├── functions/melhorar-resposta/
│   │   ├── index.ts         ← Edge Function principal
│   │   └── providers/       ← Gemini hoje, troca fácil amanhã
│   └── migrations/0001_init.sql
└── README.md
```

## 1. Configurar Supabase

1. Crie projeto em supabase.com.
2. SQL Editor → cole conteúdo de `supabase/migrations/0001_init.sql` → Run.
   Cria tabelas `configuracoes`, `atendimentos`, `rate_limit_log` + policies.
2b. Rode também `supabase/migrations/0002_clientes.sql` → Run.
   Cria a tabela `clientes` (cadastro por apelido) e a coluna `cliente_id` em `atendimentos`.
3. Project Settings → API → copie `Project URL` e `anon public key`.

## 2. Configurar API de IA

Duas opções prontas — escolha uma:

### Opção A — Groq (recomendado, gratuito, sem cortes)
1. Crie conta em console.groq.com/keys e gere uma API key (grátis).
2. Modelo usado: `llama-3.3-70b-versatile`, sem "thinking" — não tem o problema de resposta cortada que o Gemini 3.x apresenta.
3. Secrets: `GROQ_API_KEY=sua_chave` e `AI_PROVIDER=groq`.

### Opção B — Gemini
1. Pegue chave em aistudio.google.com/apikey.
2. O projeto usa `gemini-2.5-flash-lite` (thinking desligado por padrão). ⚠️ A Google avisou que esse modelo será desativado em outubro de 2026.
3. Secrets: `GEMINI_API_KEY=sua_chave` e `AI_PROVIDER=gemini`.

Em ambos os casos, a chave **não** vai no frontend — só na Edge Function (passo 3).

## 3. Deploy da Edge Function

Instale Supabase CLI (`npm install -g supabase`), depois:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy melhorar-resposta
```

Defina os secrets (chave do Gemini nunca fica no código):

```bash
supabase secrets set GEMINI_API_KEY=sua_chave_aqui
supabase secrets set AI_PROVIDER=gemini
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente dentro de toda Edge Function — não precisa setar.

## 4. Configurar frontend

Edite `frontend/js/config.js`:

```js
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "sua_chave_anon_aqui";
```

Essas duas são públicas por natureza (chave anon), problema zero deixar no frontend. Chave do Gemini é a única secreta — essa fica só no backend.

## 5. Rodar localmente

Pasta `frontend` é HTML/CSS/JS puro, sem build. Sirva com qualquer servidor estático:

```bash
cd frontend
python3 -m http.server 8080
# ou: npx serve .
```

Abra `http://localhost:8080`.

## 6. Publicar

Suba a pasta `frontend/` inteira em qualquer host estático: Vercel, Netlify, Cloudflare Pages, GitHub Pages. Nenhuma variável de ambiente de build necessária — `config.js` já tem os valores direto.

## Trocar provedor de IA no futuro (Gemini → Groq/Claude/OpenAI)

1. Crie `supabase/functions/melhorar-resposta/providers/novo-provedor.ts` implementando a interface em `types.ts`.
2. Adicione um `case` em `providers/factory.ts`.
3. `supabase secrets set AI_PROVIDER=novo-provedor` + novo secret de API key.

Frontend não muda uma linha — ele só conhece `aiService.js`, nunca o provedor real.

## Segurança — o que já está feito

- Chave do Gemini só existe como secret da Edge Function, nunca no HTML/JS.
- Edge Function valida entrada (campos obrigatórios, tipo válido, limite de 4000 caracteres).
- Rate limit básico: 15 requisições/minuto por IP (tabela `rate_limit_log`).
- Erros da IA tratados, nunca vazam stack trace pro cliente.

## Segurança — o que fica pra depois (avise se quiser já incluído)

- Não há autenticação de usuário: qualquer pessoa com a `anon key` acessa `configuracoes` e `atendimentos` (policies RLS estão abertas de propósito, pensado pra uso pessoal/single-user). Se for expor publicamente ou usar em equipe, adicionar Supabase Auth + policies por `user_id` é o próximo passo natural.
