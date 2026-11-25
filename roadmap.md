- [x] Pedir confirmação antes de descartar uma linha.
- [x] Permitir iniciar a confirmação e informar o total ausente sem ignorar a conferência do relatório.
- [x] Verificar cancelamento, descarte e encaminhamento com dados fictícios.
- [x] Conferir e completar recebimento e indicação de fiscal pela CPMA.
- [x] Verificar fluxo CPMA com processo fictício.
- [x] Corrigir leitura do total por posição no PDF e testar números fora de ordem.
- [x] Permitir reconciliar totais divergentes com registro no histórico e verificar a importação.
- [x] Separar o recebimento do Jurídico das ações da CPMA, inclusive em contas com os dois perfis (testes automáticos; conferência com sessão pendente).

## Migração para PostgreSQL próprio
- [x] Esquema portável (`db/migrations`), login próprio, armazenamento local/S3, build Node.
- [x] Testes de integração do fluxo CCA → CPMA → Jurídico contra PostgreSQL real.
- [ ] Testar S3 e Dockerfile no ambiente real; conferir as telas no navegador.
- [ ] Paginação e busca no servidor (volume real ~8,6 mil processos/ano).

## Jurídico
- [x] Fase 1: protocolo, lista de saída, desfecho da entrega, prazo de defesa, defesa / sem defesa.
- [ ] Validar com a GEJUR as hipóteses de `docs/juridico-fase1.md`.
- [x] Fase 2A: advogado julga → homologador → Presidente → volta à Ger. Jurídica; prazo de defesa vencido segue sozinho.
- [x] Fase 3: registro da GRU pela Ger. Jurídica (desconto à vista 30% parametrizável, espelho imprimível).
- [x] Fase 4A: classificação das GRUs (pago / em recurso / não pago) e listagem de dívida ativa para recobrança.
- [ ] Fase 4B: envio ao autuado (Correios), prazo e resultado do recurso, regras do desconto à vista.
- [ ] Conferir com o Inmetro o mapeamento SGI (`sgiEsperado`).
