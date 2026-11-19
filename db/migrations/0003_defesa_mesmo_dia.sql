-- A defesa pode ser protocolada no mesmo dia da ciência (a 0002 exigia data posterior, o que
-- impedia registrar a defesa de quem recebeu a notificação hoje). Continua proibido: data anterior
-- à ciência e data futura.
create or replace function registrar_defesa(_processo_id uuid, _data date, _obs text default null) returns void language plpgsql as $$
declare p processos; fora boolean;
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'aguardando_defesa' then raise exception 'O processo não está no prazo de defesa'; end if;
  if _data is null or _data > hoje() then raise exception 'Informe a data de protocolo da defesa (não pode ser futura)'; end if;
  if _data < p.ciencia_em then raise exception 'A defesa não pode ser anterior à ciência (%)', _dmy(p.ciencia_em); end if;
  fora := _data > p.vencimento_defesa;
  update processos set defesa_em = _data, situacao = 'com_defesa', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'DEFESA_REGISTRADA', 'JURIDICO', null,
    'Defesa protocolada em ' || _dmy(_data) || (case when fora then ' — FORA DO PRAZO (venceu em ' || _dmy(p.vencimento_defesa) || ')' else '' end)
    || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;
