## SAPP
- Banco: PostgreSQL puro (`db/migrations/*.sql`, `npm run db:migrar`). Nunca edite uma migração já aplicada; crie a próxima. Sem dependência de Supabase/Lovable.
- O navegador não acessa o banco. Toda leitura/escrita passa por server functions (`src/lib/*.functions.ts`) com `exigirSessao`; código de servidor fica em `src/server/*.server.ts` e é importado dinamicamente dentro dos handlers.
- Mudanças de estado do processo só pelas funções SQL (checam papel e situação). O usuário logado chega ao banco por `app_uid()` (`comUsuario` em `src/server/db.server.ts`).
- `eventos`, `correcoes`, `acesso_logs` são somente-inclusão (triggers bloqueiam update/delete): trilha de auditoria imutável é requisito central.
- Admin gerencia usuários/cadastros mas não vê processos.
- A leitura do PDF JR5260 roda no navegador (`src/lib/jr5260.ts`); o servidor recalcula o SHA-256 e guarda o original (`STORAGE_DRIVER`).
- Fila do CPMA e do Jurídico usam avaliadores testados (`src/lib/cpma.ts`, `src/lib/triagem.ts`); links de filas preservam a área nos parâmetros de busca.
- Testes de integração: `DATABASE_URL_TESTE` apontando para banco `*_test`.
- Jurídico fase 1: ver `docs/juridico-fase1.md`.
