-- SAPP · Fase 4A: classificação dos processos com GRU registrada.
--   gru_gerada ──► pago            (pagamento registrado)
--              ├─► em_recurso      (recurso à instância superior do Inmetro)
--              └─► nao_pago        (GRU vencida sem pagamento → listagem de dívida ativa para recobrança)
--   em_recurso ──► pago | nao_pago (resultado do recurso: modelo ainda simplificado)
--   nao_pago   ──► pago            (pagamento posterior, sai da listagem)
-- Não modelado ainda: envio da decisão pelos Correios, prazo do recurso (indefinido) e resultado do recurso
-- (mantida/reduzida/cancelada). A inscrição formal em dívida ativa acontece fora do SAPP.

alter type situacao_processo add value if not exists 'pago';
alter type situacao_processo add value if not exists 'em_recurso';
alter type situacao_processo add value if not exists 'nao_pago';
alter type tipo_evento add value if not exists 'PAGAMENTO_REGISTRADO';
alter type tipo_evento add value if not exists 'RECURSO_REGISTRADO';
alter type tipo_evento add value if not exists 'CLASSIFICADO_NAO_PAGO';

alter table grus
  add column pago_em date,
  add column valor_pago numeric(12, 2),
  add column pago_com_desconto boolean,
  add column pagamento_obs text,
  add column pagamento_por uuid;

create table recursos (
  processo_id uuid primary key references processos(id),
  data_recurso date not null,
  observacao text,
  registrado_por uuid not null,
  registrado_em timestamptz not null default now()
);

create function registrar_pagamento_gru(_processo_id uuid, _data date, _valor numeric, _com_desconto boolean, _obs text default null)
returns void language plpgsql as $$
declare p processos; g grus; esperado numeric; aviso text := '';
begin
  perform exigir_papel('juridico');
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

create function registrar_recurso(_processo_id uuid, _data date, _obs text default null) returns void language plpgsql as $$
declare p processos;
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'gru_gerada' then raise exception 'O processo não está aguardando classificação da GRU'; end if;
  if _data is null or _data > hoje() then raise exception 'A data do recurso não pode ser futura'; end if;
  insert into recursos (processo_id, data_recurso, observacao, registrado_por)
  values (_processo_id, _data, nullif(trim(_obs), ''), app_uid());
  update processos set situacao = 'em_recurso', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'RECURSO_REGISTRADO', 'JURIDICO', null,
    'Recurso protocolado em ' || _dmy(_data) || ' — instância superior do Inmetro' || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;

-- Não pago: GRU vencida sem pagamento (ou recurso encerrado sem pagamento, com justificativa) → listagem de dívida ativa.
create function classificar_nao_pago(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos; g grus; mot text := nullif(trim(_obs), '');
begin
  perform exigir_papel('juridico');
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
