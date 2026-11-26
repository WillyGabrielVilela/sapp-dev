-- SAPP · Segregação do Jurídico em duas áreas + assinatura do Presidente informada pelos homologadores.
--
--   Jurídico administrativo (perfil "juridico"): receber, protocolar, notificar (listas de saída), desfecho da
--     entrega, prazo de defesa / sem defesa — tudo ANTES do julgamento.
--   Jurídico advogados (perfil "advogado"): julgar, atribuir a multa, registrar a GRU e classificar
--     (pago / em recurso / não pago → dívida ativa) — do julgamento em diante.
--   Homologadores (perfil "homologador"): homologam e REGISTRAM a assinatura do Presidente, que não usa o
--     sistema (é apenas um informe). O perfil "presidente" fica em desuso (o valor do enum permanece no banco).

alter table julgamentos add column assinatura_data date;

drop function assinar_presidente(uuid, text);
create function assinar_presidente(_processo_id uuid, _obs text default null, _data date default null)
returns void language plpgsql as $$
declare p processos; j julgamentos; d date := coalesce(_data, hoje());
begin
  perform exigir_papel('homologador');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'homologado' then
    raise exception 'O processo só pode ser assinado pelo Presidente depois da homologação';
  end if;
  select * into j from julgamentos where processo_id = _processo_id;
  if d > hoje() then raise exception 'A data da assinatura não pode ser futura'; end if;
  if d < (j.homologado_em at time zone 'America/Recife')::date then
    raise exception 'A assinatura não pode ser anterior à homologação (%)', _dmy((j.homologado_em at time zone 'America/Recife')::date);
  end if;
  update julgamentos set assinado_por = app_uid(), assinado_em = now(), assinatura_data = d where processo_id = _processo_id;
  update processos set updated_at = now(),
    situacao = case when j.decisao = 'arquivamento' then 'arquivado'::situacao_processo else 'assinado_presidente'::situacao_processo end
   where id = _processo_id;
  perform _evento(_processo_id, 'ASSINADO_PRESIDENTE', 'JURIDICO', null,
    'Assinatura do Presidente registrada pelo homologador (assinou em ' || _dmy(d) || '). '
    || coalesce(nullif(trim(_obs), '') || '. ', '')
    || (case when j.decisao = 'arquivamento' then 'Arquivamento: processo encerrado, sem GRU.'
             else 'Segue para os advogados gerarem a GRU.' end));
end $$;

-- Antes da assinatura informada, quem devolve ao julgamento é o homologador (nas duas etapas).
create or replace function devolver_julgamento(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos;
begin
  if _obs is null or length(trim(_obs)) < 5 then raise exception 'A devolução exige uma justificativa'; end if;
  select * into p from processos where id = _processo_id for update;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if p.situacao not in ('julgado', 'homologado') then
    raise exception 'O processo não está em etapa de homologação ou assinatura';
  end if;
  perform exigir_papel('homologador');
  update julgamentos set assinado_por = null, assinado_em = null, assinatura_data = null, homologado_por = null, homologado_em = null
   where processo_id = _processo_id;
  update processos set situacao = 'julgamento_devolvido', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'DEVOLVIDO', 'JURIDICO', 'JURIDICO', 'Devolvido ao julgamento: ' || trim(_obs));
end $$;

-- GRU e classificação passam a ser dos ADVOGADOS (antes eram do perfil "juridico").
create or replace function registrar_gru(_processo_id uuid, _numero_gru text, _vencimento date, _obs text default null)
returns void language plpgsql as $$
declare p processos; j julgamentos; num text := trim(coalesce(_numero_gru, '')); pct int; v numeric; vd numeric;
begin
  perform exigir_papel('advogado');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'assinado_presidente' then
    raise exception 'O processo não está aguardando a GRU (precisa estar assinado pelo Presidente)';
  end if;
  select * into j from julgamentos where processo_id = _processo_id;
  if j.decisao <> 'multa' or j.valor_multa is null then raise exception 'Só há GRU para decisão de multa'; end if;
  if length(num) < 3 then raise exception 'Informe o número da GRU'; end if;
  if exists (select 1 from grus where lower(numero_gru) = lower(num)) then raise exception 'Este número de GRU já está registrado em outro processo'; end if;
  if _vencimento is null or _vencimento < hoje() then raise exception 'O vencimento da GRU não pode ser anterior a hoje'; end if;
  select valor::int into pct from parametros where chave = 'desconto_vista_percentual';
  v := j.valor_multa;
  vd := round(v * (100 - pct) / 100.0, 2);
  insert into grus (processo_id, numero_gru, valor, desconto_percentual, valor_com_desconto, vencimento, emitida_por)
  values (_processo_id, num, v, pct, vd, _vencimento, app_uid());
  update processos set situacao = 'gru_gerada', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'GRU_REGISTRADA', 'JURIDICO', null,
    'GRU ' || num || ' · valor ' || _brl(v) || ' · à vista com ' || pct || '% de desconto: ' || _brl(vd)
    || ' · vencimento ' || _dmy(_vencimento) || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;

create or replace function registrar_pagamento_gru(_processo_id uuid, _data date, _valor numeric, _com_desconto boolean, _obs text default null)
returns void language plpgsql as $$
declare p processos; g grus; esperado numeric; aviso text := '';
begin
  perform exigir_papel('advogado');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao not in ('gru_gerada', 'em_recurso', 'nao_pago') then
    raise exception 'O processo não está em etapa de pagamento da GRU';
  end if;
  select * into g from grus where processo_id = _processo_id;
  if g.processo_id is null then raise exception 'Processo sem GRU registrada'; end if;
  if _data is null or _data > hoje() then raise exception 'A data do pagamento não pode ser futura'; end if;
  if _valor is null or _valor <= 0 then raise exception 'Informe o valor pago'; end if;
  esperado := case when coalesce(_com_desconto, false) then g.valor_com_desconto else g.valor end;
  if _valor <> esperado then
    aviso := ' — ATENÇÃO: valor diferente do esperado (' || _brl(esperado) || ')';
  end if;
  update grus set pago_em = _data, valor_pago = _valor, pago_com_desconto = coalesce(_com_desconto, false),
    pagamento_obs = nullif(trim(_obs), ''), pagamento_por = app_uid() where processo_id = _processo_id;
  update processos set situacao = 'pago', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'PAGAMENTO_REGISTRADO', 'JURIDICO', null,
    'GRU ' || g.numero_gru || ' paga em ' || _dmy(_data) || ': ' || _brl(_valor)
    || (case when coalesce(_com_desconto, false) then ' (à vista, com desconto)' else '' end) || aviso
    || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;

create or replace function registrar_recurso(_processo_id uuid, _data date, _obs text default null) returns void language plpgsql as $$
declare p processos;
begin
  perform exigir_papel('advogado');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'gru_gerada' then raise exception 'O processo não está aguardando classificação da GRU'; end if;
  if _data is null or _data > hoje() then raise exception 'A data do recurso não pode ser futura'; end if;
  insert into recursos (processo_id, data_recurso, observacao, registrado_por)
  values (_processo_id, _data, nullif(trim(_obs), ''), app_uid());
  update processos set situacao = 'em_recurso', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'RECURSO_REGISTRADO', 'JURIDICO', null,
    'Recurso protocolado em ' || _dmy(_data) || ' — instância superior do Inmetro' || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;

create or replace function classificar_nao_pago(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos; g grus; mot text := nullif(trim(_obs), '');
begin
  perform exigir_papel('advogado');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao not in ('gru_gerada', 'em_recurso') then
    raise exception 'O processo não está aguardando classificação da GRU';
  end if;
  select * into g from grus where processo_id = _processo_id;
  if p.situacao = 'gru_gerada' and g.vencimento >= hoje() then
    raise exception 'A GRU vence em %. Só é possível classificar como não pago depois do vencimento', _dmy(g.vencimento);
  end if;
  if p.situacao = 'em_recurso' and (mot is null or length(mot) < 5) then
    raise exception 'Informe o resultado do recurso que leva ao não pagamento';
  end if;
  update processos set situacao = 'nao_pago', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'CLASSIFICADO_NAO_PAGO', 'JURIDICO', null,
    'GRU ' || g.numero_gru || ' (vencimento ' || _dmy(g.vencimento) || ') não paga: processo em listagem de dívida ativa para recobrança'
    || coalesce('. ' || mot, ''));
end $$;

-- Observações no Jurídico: qualquer perfil que atua nele (administrativo, advogado, homologador).
create or replace function adicionar_observacao(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos; pode boolean;
begin
  if _obs is null or length(trim(_obs)) = 0 then raise exception 'Observação vazia'; end if;
  select * into p from processos where id = _processo_id;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  pode := case p.setor_atual
    when 'JURIDICO' then has_any_role(app_uid(), array['juridico', 'advogado', 'homologador']::app_role[])
    else app_uid() is not null and has_role(app_uid(), lower(p.setor_atual::text)::app_role) end;
  if not coalesce(pode, false) then raise exception 'Só o setor atual registra observações'; end if;
  perform _evento(_processo_id, 'OBSERVACAO', p.setor_atual, null, trim(_obs));
end $$;
