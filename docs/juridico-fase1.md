# Jurídico — fase 1: protocolo → notificação → ciência → prazo de defesa

Fontes: fluxograma CPMA × Gerência Jurídica (rascunho) e Relatório nº 002/RC 2026 (Diretoria Técnica, 13/10/2026).

## Estados (`situacao`)
`recebido_juridico` → **Protocolar** → `protocolado_juridico` → **Lista de saída** → `notificacao_enviada` → **Desfecho**:
- Entregue → `aguardando_defesa` (prazo corre a partir da data da entrega) → **Registrar defesa** → `com_defesa`, ou, vencido o prazo, **Encerrar sem defesa** → `sem_defesa`.
- Devolvido / recusado / mudou-se → `notificacao_frustrada` → volta a uma nova lista de saída.

Depois do protocolo o Jurídico não devolve mais ao CPMA. Julgamento, "divide por espécie", homologação (Presidente), guia GRU, recurso e cobrança são as próximas fases.

## Como o sistema responde aos problemas do relatório
| Relatório | No SAPP |
|---|---|
| 1 número sem "sobrenome"; 2 ano trocado; 3 um número, dois autuados | O processo é escolhido no sistema, nunca digitado; a lista mostra razão social e CNPJ |
| 4 AI chamado de "processo" | `numero_ai` (7 dígitos) separado, único; busca por AI no painel e no Jurídico |
| 5 números quase iguais | Conferência visual com razão social/CPF-CNPJ na lista |
| 6 nome da loja × empresa | Colunas razão social, nome fantasia e CPF/CNPJ (inclui CNPJ alfanumérico) |
| 7 entregue, mas não registrado | Fila "Entregas a registrar"; o prazo só corre com data + recebedor lançados |
| Modelo de linha / lista única por dia | Lista numerada por data, com título, total e legenda E/D/R/M; impressão pela página da lista |
| Reenvios | Só entra em lista quem está protocolado ou com notificação frustrada |

## Hipóteses a validar com a GEJUR
1. Prazo: 10 dias **corridos** a partir do dia seguinte à ciência; se cair em sábado/domingo, vai para a segunda; **sem feriados**. Função `prazo_defesa()` (migração 0002), único lugar a alterar.
2. AI e CPF/CNPJ são opcionais (o sistema avisa).
3. Entrega por DOE dispensa o nome do recebedor.
4. "Protocolo interno automático" do rascunho foi lido como o nº gerado no protocolo (`JUR-AAAA-NNNNN`).
5. Recusa (R) não conta como ciência: gera notificação frustrada.
6. Defesa fora do prazo é registrada e marcada "FORA DO PRAZO" no histórico; a decisão é do julgamento.
7. O desfecho de uma notificação não pode ser editado depois de registrado (não há "corrigir desfecho" ainda).

## Pendências conhecidas
- Listagem de processos carrega tudo no navegador. Com ~8,6 mil processos/ano, paginar e filtrar no servidor é o próximo ajuste.
- Sem tabela de feriados; sem alerta automático de prazo vencendo.

---

# Fase 2A — julgamento → assinatura do Presidente → homologação

Regras confirmadas pelo IPEM-PE: o **advogado** julga, decide e atribui o **valor da multa**; encaminha ao **homologador**, que homologa; depois o **Presidente assina** e o processo **volta à Gerência Jurídica**, que gera a GRU (fase 3). (Uma conversa anterior havia indicado Presidente antes do homologador; a ordem final, igual à do rascunho, é a acima — migração 0006.)

## Fluxo
`com_defesa` / `sem_defesa` → **Julgar** (usuário com perfil **Advogado**; julga todas as espécies por padrão, salvo restrição definida pelos homologadores: multa + valor, ou arquivamento; fundamentação obrigatória) → `julgado` → **Homologador homologa** → `homologado` → **Presidente assina** → `assinado_presidente` (com a Ger. Jurídica, para gerar a GRU). Decisão de **arquivamento** assinada pelo Presidente vai a `arquivado` (encerrado, sem GRU).
Homologador (antes de homologar) e Presidente (antes de assinar) podem **devolver ao julgamento** com justificativa → `julgamento_devolvido` → o advogado rejulga. Cada decisão, inclusive as revisadas, fica no histórico imutável.

## Perfis novos
`advogado` (quem julga), `presidente` e `homologador`, atribuídos em *Usuários e perfis*. O perfil `juridico` continua sendo o do setor (receber, protocolar, notificar) e **não** julga.
**Designação por espécie:** por padrão cada advogado julga **todas** as espécies. Os **homologadores** (que também são advogados) restringem cada advogado a certas espécies na página *Julgamento e assinatura* ("Quem julga cada espécie"); nenhuma marcada = todas.
Controle: **quem julgou o processo não pode homologá-lo**.
Quem já tinha só `juridico` e julgava na versão anterior precisa receber o perfil `advogado`.

## Premissas a confirmar
- Com defesa e sem defesa seguem o mesmo caminho de julgamento (o rascunho não tem seta saindo de "Com defesa").
- Decisões possíveis: multa ou arquivamento.
- Processo sem espécie não pode ser julgado.

## Conferência com o SGI
Cada processo mostra "No SGI deve constar em": Processos cadastrados (digitalização pelo CPMA) → Processos analisados (visto pelo Jurídico, vira carta de autuação) → Processos aptos para julgamento (ciência dada e rito de defesa concluído). O mapeamento de `sgiEsperado()` (`src/lib/rotulos.ts`) é **hipótese a confirmar com o Inmetro**.

## Próximas fases (informações já recebidas)
- GRU: **30% de desconto à vista** (o valor com desconto já aparece no julgamento, só como informação).
- Recurso: julgado pela **instância superior do Inmetro**; **prazo indefinido** — precisa ser definido antes de implementar.
- Cobrança: **dívida ativa** é a etapa seguinte.

## Prazo de defesa automático
Vencido o prazo de defesa sem defesa registrada, o processo passa **sozinho** para `sem_defesa`, com evento "automático" atribuído ao ator **Sistema**. Não há agendador: a rotina `encerrar_prazos_vencidos()` roda sempre que o sistema lista ou abre processos (o que acontece em toda sessão de trabalho). Se uma defesa chegar depois (ex.: pelos Correios) e o processo ainda não tiver sido julgado, ela pode ser registrada e fica marcada "FORA DO PRAZO". O botão manual "Encerrar prazo sem defesa" foi removido da tela.

## Fase 3 (a implementar): GRU pela Gerência Jurídica
Hoje o processo assinado aparece na fila "A gerar a GRU". Faltam os dados da guia (código de recolhimento, unidade gestora, vencimento, número de referência etc.), definição do desconto de 30% à vista e do fluxo Correios → recurso (instância superior do Inmetro; prazo indefinido) → dívida ativa.
