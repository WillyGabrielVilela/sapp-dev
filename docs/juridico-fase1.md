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

## Ações em lote
Nas filas "Aguardando homologação" (homologador) e "Aguardando assinatura do Presidente" há checkboxes e o botão "Homologar/Assinar selecionados", com confirmação e observação única. Cada processo é conferido individualmente (as mesmas regras de sempre, ex.: quem julgou não homologa): os que não puderem avançar são listados no final e os demais seguem. Cada um gera seu próprio evento no histórico.

## Prazo de defesa automático
Vencido o prazo de defesa sem defesa registrada, o processo passa **sozinho** para `sem_defesa`, com evento "automático" atribuído ao ator **Sistema**. Não há agendador: a rotina `encerrar_prazos_vencidos()` roda sempre que o sistema lista ou abre processos (o que acontece em toda sessão de trabalho). Se uma defesa chegar depois (ex.: pelos Correios) e o processo ainda não tiver sido julgado, ela pode ser registrada e fica marcada "FORA DO PRAZO". Há também o botão **Registrar sem defesa** (processo aguardando defesa): depois do vencimento basta confirmar; **antes do vencimento** exige o motivo (ex.: renúncia expressa ao prazo), que fica no histórico (migração 0007). Regra a validar com a GEJUR.

## Fase 3: GRU
Processo com assinatura do Presidente registrada (decisão de multa) → o **advogado** **registra a GRU** (nº da GRU e vencimento) → `gru_gerada`. O SAPP **não emite a guia oficial**: registra os dados da guia emitida, calcula o **valor à vista com desconto** (30% por padrão; parâmetro `desconto_vista_percentual`, ajustável pelo administrador em *Parâmetros (GRU)*) e mostra o **espelho da GRU** (imprimível) com código de recolhimento, UG e instruções, também parametrizáveis. Número de GRU é único no sistema. Hoje não há edição/cancelamento de uma GRU registrada (precisa ser definido).

## Fase 4A: classificação das GRUs (pago / em recurso / não pago)
Com a GRU registrada (`gru_gerada`) o Jurídico classifica o processo (página *GRUs: pago / recurso / não pago* ou na tela do processo):
- **Pago** → `pago` (data, valor pago, "à vista com desconto"). O valor é conferido com o esperado (multa ou valor com desconto); divergência não bloqueia, mas fica avisada no histórico.
- **Em recurso** → `em_recurso` (data do recurso; instância superior do Inmetro). Daí o processo vai a `pago` ou `nao_pago` (este exige informar o resultado do recurso).
- **Não pago** → `nao_pago`, **só depois do vencimento da GRU**; entra na **listagem de dívida ativa para recobrança** (*Dívida ativa*: busca, total, exportação CSV para Excel e impressão). Classificação em lote por checkboxes (cada GRU conferida individualmente).
- Pagamento posterior de um não pago é registrável e o processo sai da listagem.
Modo de teste (`MODO_TESTE=true`): botão "vencer a GRU (−15 dias)".
A inscrição formal em dívida ativa acontece fora do SAPP (o CSV serve de base).

## Pendente (fase 4B)
Envio da decisão + GRU ao autuado (Correios, com AR/ciência) — hoje a classificação parte direto da GRU registrada; **prazo do recurso** (indefinido; o sistema não calcula prazo até ser definido); **resultado do recurso** (mantida/reduzida/cancelada, hoje simplificado a pago/não pago); regras do desconto à vista (até quando vale; se implica renúncia ao recurso).

---

# Áreas e perfis do Jurídico (migração 0010)

O menu é agrupado por área; cada perfil só vê a sua.

| Área | Perfil | O que faz |
|---|---|---|
| Jurídico administrativo (`/juridico`) | `juridico` | Receber, protocolar, listas de saída, desfecho da entrega, prazo de defesa / sem defesa. Tudo **antes** do julgamento |
| Jurídico — advogados (`/advogados`, GRUs, dívida ativa) | `advogado` | Julgar (decisão + multa), **registrar a GRU**, classificar (pago / em recurso / não pago), dívida ativa |
| Homologação (`/homologacao`) | `homologador` | Homologar; **registrar a assinatura do Presidente** (informe com data); definir quem julga cada espécie |

**O Presidente não usa o sistema.** Ele assina em papel e os homologadores registram a data da assinatura (individualmente ou em lote). O perfil `presidente` ficou em desuso (o valor continua no banco; contas antigas só aparecem rotuladas "em desuso").
Atenção ao atualizar: quem hoje faz GRU/classificação com o perfil `juridico` precisa receber o perfil `advogado`. Observações em processo no Jurídico: `juridico`, `advogado` e `homologador`.

## Exportação CSV
Botão **CSV** em cada fila/tabela (painel, CPMA, Jurídico administrativo, advogados, homologação, classificação das GRUs, dívida ativa e cada lista de saída). Exporta as linhas exibidas (respeita a busca), com ";" , BOM e vírgula decimal (abre direto no Excel). Textos que começam com `= + - @` são neutralizados contra injeção de fórmulas.
