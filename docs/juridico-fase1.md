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
