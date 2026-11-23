# SAPP — Sistema de Acompanhamento de Processos (IPEM-PE)

Controle interno do trâmite CCA → CPMA → Jurídico. Complementa o SGI do Inmetro: o sistema só lê o PDF do relatório JR5260, não se integra ao SGI.

Stack: TanStack Start (React + SSR em Node), PostgreSQL puro, login próprio. Sem dependência de Lovable, Supabase ou de qualquer provedor.

## Rodar localmente

```sh
cp .env.example .env        # ajuste DATABASE_URL
npm install --legacy-peer-deps
npm run db:migrar           # cria/atualiza o esquema (db/migrations/*.sql)
npm run db:seed             # opcional: espécies e fiscais FICTÍCIOS (nunca em produção)
npm run dev
```

O primeiro usuário cadastrado vira **administrador**. Depois disso o administrador cria as contas em *Usuários e perfis* (ou habilite `PERMITIR_CADASTRO=true`).

## Banco de dados

- PostgreSQL 13+. Só `DATABASE_URL` importa; funciona com Neon (inclusive pooler), RDS ou servidor da ATI-PE.
- Esquema em `db/migrations/*.sql`, aplicado em ordem por `scripts/migrar.mjs` (uma transação por arquivo, controle em `_migracoes`). Nova mudança = novo arquivo `000N_*.sql`; nunca edite um já aplicado.
- Regras de tramitação ficam em funções SQL (`receber_processo`, `protocolar_processo`…). O usuário logado chega ao banco por `set_config('app.user_id', …)` dentro de cada transação (`app_uid()`).
- **Não há RLS**: o navegador nunca acessa o banco. O controle de acesso está em `src/server/guarda.server.ts` e nas próprias funções SQL.

### Migrar do Neon para a ATI-PE / AWS
1. `pg_dump -Fc "$URL_NEON" > sapp.dump` e `pg_restore -d "$URL_NOVA" --no-owner sapp.dump`.
2. Troque `DATABASE_URL` (e `DATABASE_SSL_REJECT_UNAUTHORIZED=false` só se a CA for interna).
3. Se usar S3: copie os PDFs (chave = `<sha256>.pdf`) para o novo armazenamento e ajuste `STORAGE_DRIVER`.
Nada no código muda.

## Arquivos originais (PDF)
`STORAGE_DRIVER=local` (pasta `STORAGE_LOCAL_DIR`, precisa de volume persistente) ou `s3` (AWS ou compatível; veja `.env.example`). A chave é o SHA-256 do arquivo, recalculado no servidor.

## Implantação
`npm run build` gera `.output/` (servidor Node). `npm start` sobe na porta `PORT`. Há um `Dockerfile` de partida (não testado). Atrás de proxy HTTPS o cookie de sessão é `Secure` em produção.

## Autenticação
Senhas com scrypt, sessão opaca em cookie HttpOnly (só o hash fica no banco), bloqueio de 15 min após 5 erros, CSRF nas server functions. Sem e-mail: a redefinição de senha é feita pelo administrador. Para SSO da ATI-PE, só `src/server/auth.server.ts` e `src/lib/auth.functions.ts` mudam.

## Testes
- `npm test` — unitários (os de integração são ignorados sem banco).
- Integração contra PostgreSQL real (o banco **precisa** terminar em `_test`/`_teste`; o teste apaga os dados):
  `DATABASE_URL=… npm run db:migrar && DATABASE_URL_TESTE=postgres://…/sapp_test npm test`

## Jurídico
Veja `docs/juridico-fase1.md`.

## Modo de teste
Com `MODO_TESTE=true`, o Jurídico vê em processos "aguardando defesa" o botão **Teste: vencer o prazo (−15 dias)**, que recua as datas para permitir testar "encerrar sem defesa" sem esperar. O ajuste fica no histórico com o prefixo `TESTE:`. **Não ligue em produção.**

## Vercel
O build detecta a Vercel (`VERCEL=1`) e gera `.vercel/output`; o `vercel.json` já define "Other" como framework (sem pasta `dist`). Configure as variáveis do `.env.example` em *Project Settings → Environment Variables*.
**Limitações na Vercel:** o disco é efêmero, então use `STORAGE_DRIVER=s3` (o modo `local` perde os PDFs); e o corpo de uma requisição em função serverless é limitado (~4,5 MB), então PDFs maiores do JR5260 podem falhar no envio. Rode `npm run db:migrar` do seu computador (o deploy não aplica migrações).
