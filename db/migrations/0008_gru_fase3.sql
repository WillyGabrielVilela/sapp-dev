-- SAPP · Fase 3: a Gerência Jurídica gera a GRU da multa (processo assinado pelo Presidente).
-- O SAPP NÃO emite a guia oficial: registra a GRU emitida (nº, vencimento), calcula o valor com o desconto
-- à vista (30% por padrão, ajustável) e produz um "espelho" para preencher a guia oficial.
-- Fica para a fase 4: envio ao autuado (Correios), recurso (instância superior do Inmetro), cobrança e dívida ativa.

alter type situacao_processo add value if not exists 'gru_gerada';
alter type tipo_evento add value if not exists 'GRU_REGISTRADA';

create table parametros (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into parametros (chave, valor) values
  ('desconto_vista_percentual', '30'),
  ('gru_codigo_recolhimento', ''),
  ('gru_unidade_gestora', ''),
  ('gru_instrucoes', '');

create function definir_parametro(_chave text, _valor text) returns void language plpgsql as $$
declare v text := trim(coalesce(_valor, ''));
begin
  perform exigir_papel('admin');
  if _chave not in ('desconto_vista_percentual', 'gru_codigo_recolhimento', 'gru_unidade_gestora', 'gru_instrucoes') then
    raise exception 'Parâmetro desconhecido';
  end if;
  if _chave = 'desconto_vista_percentual' and (v !~ '^\d{1,2}$' or v::int > 90) then
    raise exception 'O desconto deve ser um número inteiro de 0 a 90';
  end if;
  if length(v) > 1000 then raise exception 'Texto longo demais'; end if;
  update parametros set valor = v, atualizado_em = now(), atualizado_por = app_uid() where chave = _chave;
end $$;

create table grus (
  processo_id uuid primary key references processos(id),
  numero_gru text not null,
  valor numeric(12, 2) not null,
  desconto_percentual int not null,
  valor_com_desconto numeric(12, 2) not null,
  vencimento date not null,
  emitida_em timestamptz not null default now(),
  emitida_por uuid not null
);
create unique index grus_numero_uq on grus (lower(numero_gru));

create function registrar_gru(_processo_id uuid, _numero_gru text, _vencimento date, _obs text default null)
returns void language plpgsql as $$
declare p processos; j julgamentos; num text := trim(coalesce(_numero_gru, '')); pct int; v numeric; vd numeric;
begin
  perform exigir_papel('juridico');
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
