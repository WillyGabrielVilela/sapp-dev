-- SAPP · Jurídico, fase 1: protocolo → notificação → ciência → prazo de defesa.
--
-- Origem: fluxograma CPMA × Gerência Jurídica (rascunho) e Relatório nº 002/RC 2026 (Diretoria Técnica).
-- O que o relatório pede e como entra aqui:
--   * nº completo do processo, nunca "número/ano"  → o processo é escolhido no sistema, não digitado;
--   * AI (auto de infração) separado do nº do processo → coluna numero_ai, única, 7 dígitos;
--   * razão social + nome fantasia + CPF/CNPJ + bairro  → colunas em processos (+ lista de saída impressa);
--   * entrega registrada (data e quem recebeu)          → notificacoes.data_resultado / recebedor;
--   * legenda E/D/R/M                                   → resultado_notificacao (entregue/devolvido/recusado/mudou_se);
--   * uma lista por data, numerada, com total           → listas_saida (data + nº do dia);
--   * reenvio controlado                                → só reentra em lista quem teve notificação frustrada.

alter type situacao_processo add value if not exists 'protocolado_juridico';
alter type situacao_processo add value if not exists 'notificacao_enviada';
alter type situacao_processo add value if not exists 'notificacao_frustrada';
alter type situacao_processo add value if not exists 'aguardando_defesa';
alter type situacao_processo add value if not exists 'com_defesa';
alter type situacao_processo add value if not exists 'sem_defesa';

alter type tipo_evento add value if not exists 'PROTOCOLADO';
alter type tipo_evento add value if not exists 'NOTIFICADO';
alter type tipo_evento add value if not exists 'CIENCIA_REGISTRADA';
alter type tipo_evento add value if not exists 'NOTIFICACAO_FRUSTRADA';
alter type tipo_evento add value if not exists 'DEFESA_REGISTRADA';
alter type tipo_evento add value if not exists 'PRAZO_ENCERRADO';

create type canal_notificacao as enum ('correios','whatsapp','doe','em_maos');
create type resultado_notificacao as enum ('pendente','entregue','devolvido','recusado','mudou_se');

alter table processos
  add column numero_ai text,
  add column documento_autuado text,
  add column nome_fantasia text,
  add column bairro text,
  add column protocolo_juridico text unique,
  add column protocolado_em timestamptz,
  add column protocolado_por uuid,
  add column ciencia_em date,
  add column vencimento_defesa date,
  add column defesa_em date,
  add constraint processos_ai_formato check (numero_ai is null or numero_ai ~ '^\d{7}$'),
  add constraint processos_documento_formato check (documento_autuado is null or documento_autuado ~ '^(\d{11}|[A-Z0-9]{12}\d{2})$');
create unique index processos_numero_ai_uq on processos (numero_ai) where numero_ai is not null;

create table protocolo_seq (ano int primary key, ultimo int not null);

create table listas_saida (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  numero_dia int not null,
  canal canal_notificacao not null,
  titulo text,
  criada_por uuid not null,
  criada_em timestamptz not null default now(),
  unique (data, numero_dia)
);

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos(id),
  lista_id uuid not null references listas_saida(id),
  canal canal_notificacao not null,
  data_saida date not null,
  resultado resultado_notificacao not null default 'pendente',
  data_resultado date,
  recebedor text,
  observacao text,
  criada_por uuid not null,
  criada_em timestamptz not null default now(),
  resultado_por uuid,
  resultado_em timestamptz
);
create index notificacoes_processo_idx on notificacoes (processo_id);
create index notificacoes_lista_idx on notificacoes (lista_id);
-- no máximo uma notificação em aberto por processo: impede notificar duas vezes sem desfecho
create unique index notificacoes_uma_pendente on notificacoes (processo_id) where resultado = 'pendente';

-- ===== apoio =====
create function hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Recife')::date
$$;

-- HIPÓTESE A VALIDAR COM A GEJUR: 10 dias corridos a partir do dia seguinte à ciência
-- (dia do começo excluído, dia do vencimento incluído); se cair em sábado ou domingo, vai para a segunda.
-- Ainda não considera feriados. É o único lugar onde a regra do prazo está escrita.
create function prazo_defesa(_ciencia date) returns date language sql immutable as $$
  select case extract(dow from (_ciencia + 10))
    when 6 then _ciencia + 12
    when 0 then _ciencia + 11
    else _ciencia + 10 end
$$;

create function proximo_protocolo() returns text language plpgsql as $$
declare a int := extract(year from (now() at time zone 'America/Recife'))::int; n int;
begin
  insert into protocolo_seq (ano, ultimo) values (a, 1)
  on conflict (ano) do update set ultimo = protocolo_seq.ultimo + 1
  returning ultimo into n;
  return 'JUR-' || a || '-' || lpad(n::text, 5, '0');
end $$;

create function _dmy(_d date) returns text language sql immutable as $$
  select to_char(_d, 'DD/MM/YYYY')
$$;

-- ===== o Jurídico só pode devolver ao CPMA antes de protocolar =====
create or replace function devolver_processo(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos; dest setor;
begin
  if _obs is null or length(trim(_obs)) < 5 then raise exception 'A devolução exige uma justificativa'; end if;
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_destino is not null then raise exception 'O processo precisa estar recebido pelo setor'; end if;
  if p.setor_atual = 'CPMA' and has_role(app_uid(), 'cpma') then dest := 'CCA';
  elsif p.setor_atual = 'JURIDICO' and has_role(app_uid(), 'juridico') then
    if p.situacao <> 'recebido_juridico' then
      raise exception 'Depois do protocolo o processo não pode ser devolvido ao CPMA';
    end if;
    dest := 'CPMA';
  else raise exception 'Permissão negada para devolver este processo'; end if;
  update processos set setor_destino = dest, updated_at = now(),
    situacao = case dest when 'CCA' then 'aguardando_cca'::situacao_processo else 'aguardando_cpma'::situacao_processo end
  where id = _processo_id;
  perform _evento(_processo_id, 'DEVOLVIDO', p.setor_atual, dest, trim(_obs));
end $$;

-- ===== 1. protocolo (físico) =====
create function protocolar_processo(
  _processo_id uuid, _numero_ai text, _documento text, _nome_fantasia text, _bairro text, _obs text default null
) returns text language plpgsql as $$
declare
  p processos; prot text; outro text;
  ai text := nullif(trim(_numero_ai), '');
  doc text := nullif(upper(regexp_replace(coalesce(_documento, ''), '[^0-9A-Za-z]', '', 'g')), '');
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_atual <> 'JURIDICO' or p.setor_destino is not null or p.situacao <> 'recebido_juridico' then
    raise exception 'O processo precisa estar recebido pelo Jurídico e ainda não protocolado';
  end if;
  if ai is not null and ai !~ '^\d{7}$' then raise exception 'O nº do auto de infração (AI) deve ter 7 dígitos'; end if;
  if ai is not null then
    select numero into outro from processos where numero_ai = ai and id <> _processo_id;
    if outro is not null then raise exception 'O AI % já está vinculado ao processo %', ai, outro; end if;
  end if;
  if doc is not null and doc !~ '^(\d{11}|[A-Z0-9]{12}\d{2})$' then raise exception 'CPF deve ter 11 dígitos e CNPJ, 14 caracteres (os 2 últimos numéricos)'; end if;
  prot := proximo_protocolo();
  update processos set numero_ai = ai, documento_autuado = doc,
    nome_fantasia = nullif(trim(_nome_fantasia), ''), bairro = nullif(trim(_bairro), ''),
    protocolo_juridico = prot, protocolado_em = now(), protocolado_por = app_uid(),
    situacao = 'protocolado_juridico', updated_at = now()
  where id = _processo_id;
  perform _evento(_processo_id, 'PROTOCOLADO', 'JURIDICO', null,
    'Protocolo ' || prot || (case when ai is null then ' — AI não informado' else '; AI ' || ai end)
    || coalesce('. ' || nullif(trim(_obs), ''), ''));
  return prot;
end $$;

-- completar/corrigir os dados usados na notificação (AI, CPF/CNPJ, nome fantasia, bairro), com trilha
create function atualizar_dados_notificacao(
  _processo_id uuid, _numero_ai text, _documento text, _nome_fantasia text, _bairro text
) returns void language plpgsql as $$
declare
  p processos; outro text;
  ai text := nullif(trim(_numero_ai), '');
  doc text := nullif(upper(regexp_replace(coalesce(_documento, ''), '[^0-9A-Za-z]', '', 'g')), '');
  fan text := nullif(trim(_nome_fantasia), '');
  bai text := nullif(trim(_bairro), '');
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_atual <> 'JURIDICO'
     or p.situacao not in ('protocolado_juridico', 'notificacao_frustrada', 'notificacao_enviada', 'aguardando_defesa') then
    raise exception 'Os dados de notificação só podem ser alterados depois do protocolo';
  end if;
  if ai is not null and ai !~ '^\d{7}$' then raise exception 'O nº do auto de infração (AI) deve ter 7 dígitos'; end if;
  if ai is not null then
    select numero into outro from processos where numero_ai = ai and id <> _processo_id;
    if outro is not null then raise exception 'O AI % já está vinculado ao processo %', ai, outro; end if;
  end if;
  if doc is not null and doc !~ '^(\d{11}|[A-Z0-9]{12}\d{2})$' then raise exception 'CPF deve ter 11 dígitos e CNPJ, 14 caracteres (os 2 últimos numéricos)'; end if;

  if p.numero_ai is distinct from ai then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'numero_ai', p.numero_ai, ai, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'JURIDICO', null, 'AI: ' || coalesce(p.numero_ai, '—') || ' → ' || coalesce(ai, '—'));
  end if;
  if p.documento_autuado is distinct from doc then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'documento_autuado', p.documento_autuado, doc, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'JURIDICO', null, 'CPF/CNPJ do autuado alterado');
  end if;
  if p.nome_fantasia is distinct from fan then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'nome_fantasia', p.nome_fantasia, fan, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'JURIDICO', null, 'Nome fantasia alterado');
  end if;
  if p.bairro is distinct from bai then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'bairro', p.bairro, bai, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'JURIDICO', null, 'Bairro: ' || coalesce(p.bairro, '—') || ' → ' || coalesce(bai, '—'));
  end if;
  update processos set numero_ai = ai, documento_autuado = doc, nome_fantasia = fan, bairro = bai, updated_at = now()
  where id = _processo_id;
end $$;

-- ===== 2. lista de saída (envio da notificação) =====
create function criar_lista_saida(_processos uuid[], _canal canal_notificacao, _data date, _titulo text default null)
returns uuid language plpgsql as $$
declare lid uuid; n int; p record; feitos int := 0; rotulo text;
begin
  perform exigir_papel('juridico');
  if _processos is null or cardinality(_processos) = 0 then raise exception 'Selecione ao menos um processo'; end if;
  if (select count(distinct x) from unnest(_processos) x) <> cardinality(_processos) then
    raise exception 'Há processos repetidos na seleção';
  end if;
  if _data is null or _data > hoje() then raise exception 'A data de saída não pode ser futura'; end if;
  perform pg_advisory_xact_lock(hashtext('sapp:lista:' || _data::text));
  select coalesce(max(numero_dia), 0) + 1 into n from listas_saida where data = _data;
  insert into listas_saida (data, numero_dia, canal, titulo, criada_por)
  values (_data, n, _canal, nullif(trim(_titulo), ''), app_uid()) returning id into lid;
  rotulo := 'Lista ' || _dmy(_data) || ' nº ' || n || ' — ' ||
    case _canal when 'correios' then 'Correios' when 'whatsapp' then 'WhatsApp institucional'
                when 'doe' then 'Diário Oficial' else 'Entrega em mãos' end;
  for p in select * from processos where id = any(_processos) order by numero for update loop
    if p.setor_atual <> 'JURIDICO' or p.setor_destino is not null
       or p.situacao not in ('protocolado_juridico', 'notificacao_frustrada') then
      raise exception 'O processo % não está apto para notificação (precisa estar protocolado, ou com notificação frustrada)', p.numero;
    end if;
    insert into notificacoes (processo_id, lista_id, canal, data_saida, criada_por)
    values (p.id, lid, _canal, _data, app_uid());
    update processos set situacao = 'notificacao_enviada', updated_at = now() where id = p.id;
    perform _evento(p.id, 'NOTIFICADO', 'JURIDICO', null, rotulo);
    feitos := feitos + 1;
  end loop;
  if feitos <> cardinality(_processos) then raise exception 'Algum processo da seleção não existe'; end if;
  return lid;
end $$;

-- ===== 3. desfecho da entrega (E/D/R/M) =====
create function registrar_resultado_notificacao(
  _notificacao_id uuid, _resultado resultado_notificacao, _data date, _recebedor text, _obs text default null
) returns void language plpgsql as $$
declare n notificacoes; p processos; rec text := nullif(trim(_recebedor), ''); venc date; rotulo text;
begin
  perform exigir_papel('juridico');
  select * into n from notificacoes where id = _notificacao_id for update;
  if n.id is null then raise exception 'Notificação não encontrada'; end if;
  if n.resultado <> 'pendente' then raise exception 'O desfecho desta notificação já foi registrado'; end if;
  if _resultado = 'pendente' then raise exception 'Informe o desfecho: entregue, devolvido, recusado ou mudou-se'; end if;
  if _data is null then raise exception 'Informe a data'; end if;
  if _data > hoje() then raise exception 'A data não pode ser futura'; end if;
  if _data < n.data_saida then raise exception 'A data não pode ser anterior à saída da lista (%)', _dmy(n.data_saida); end if;
  if _resultado = 'entregue' and n.canal <> 'doe' and (rec is null or length(rec) < 3) then
    raise exception 'Informe o nome de quem recebeu';
  end if;
  select * into p from processos where id = n.processo_id for update;
  if p.situacao <> 'notificacao_enviada' then raise exception 'O processo não está aguardando o desfecho da notificação'; end if;

  update notificacoes set resultado = _resultado, data_resultado = _data, recebedor = rec,
    observacao = nullif(trim(_obs), ''), resultado_por = app_uid(), resultado_em = now()
  where id = _notificacao_id;

  if _resultado = 'entregue' then
    venc := prazo_defesa(_data);
    update processos set ciencia_em = _data, vencimento_defesa = venc, situacao = 'aguardando_defesa', updated_at = now()
    where id = p.id;
    perform _evento(p.id, 'CIENCIA_REGISTRADA', 'JURIDICO', null,
      'Entregue em ' || _dmy(_data) || coalesce(' a ' || rec, '') || '. Prazo de defesa até ' || _dmy(venc)
      || coalesce('. ' || nullif(trim(_obs), ''), ''));
  else
    rotulo := case _resultado when 'devolvido' then 'Devolvida' when 'recusado' then 'Recusada' else 'Destinatário mudou-se' end;
    update processos set situacao = 'notificacao_frustrada', updated_at = now() where id = p.id;
    perform _evento(p.id, 'NOTIFICACAO_FRUSTRADA', 'JURIDICO', null,
      rotulo || ' em ' || _dmy(_data) || coalesce('. ' || nullif(trim(_obs), ''), ''));
  end if;
end $$;

-- ===== 4. defesa =====
create function registrar_defesa(_processo_id uuid, _data date, _obs text default null) returns void language plpgsql as $$
declare p processos; fora boolean;
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'aguardando_defesa' then raise exception 'O processo não está no prazo de defesa'; end if;
  if _data is null or _data > hoje() then raise exception 'Informe a data de protocolo da defesa (não pode ser futura)'; end if;
  if _data <= p.ciencia_em then raise exception 'A defesa não pode ser anterior à ciência (%)', _dmy(p.ciencia_em); end if;
  fora := _data > p.vencimento_defesa;
  update processos set defesa_em = _data, situacao = 'com_defesa', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'DEFESA_REGISTRADA', 'JURIDICO', null,
    'Defesa protocolada em ' || _dmy(_data) || (case when fora then ' — FORA DO PRAZO (venceu em ' || _dmy(p.vencimento_defesa) || ')' else '' end)
    || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;

create function encerrar_prazo_defesa(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos;
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'aguardando_defesa' then raise exception 'O processo não está no prazo de defesa'; end if;
  if hoje() <= p.vencimento_defesa then
    raise exception 'O prazo de defesa vai até %. Só é possível encerrar depois dessa data', _dmy(p.vencimento_defesa);
  end if;
  update processos set situacao = 'sem_defesa', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'PRAZO_ENCERRADO', 'JURIDICO', null,
    'Prazo encerrado em ' || _dmy(p.vencimento_defesa) || ' sem defesa' || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;
