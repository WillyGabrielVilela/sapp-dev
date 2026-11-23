-- Registro manual de "sem defesa". Depois do vencimento basta confirmar (na prática o encerramento
-- automático já o faz). ANTES do vencimento é permitido, mas exige o motivo (ex.: renúncia expressa ao
-- prazo), que fica no histórico. Regra a validar com a GEJUR.
create or replace function encerrar_prazo_defesa(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos; antes boolean; mot text := nullif(trim(_obs), '');
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'aguardando_defesa' then raise exception 'O processo não está no prazo de defesa'; end if;
  antes := hoje() <= p.vencimento_defesa;
  if antes and (mot is null or length(mot) < 10) then
    raise exception 'O prazo vai até %. Para registrar sem defesa antes do vencimento, informe o motivo (ex.: renúncia expressa ao prazo)', _dmy(p.vencimento_defesa);
  end if;
  update processos set situacao = 'sem_defesa', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'PRAZO_ENCERRADO', 'JURIDICO', null,
    (case when antes then 'Registrado sem defesa em ' || _dmy(hoje()) || ', antes do vencimento (' || _dmy(p.vencimento_defesa) || ')'
          else 'Prazo encerrado em ' || _dmy(p.vencimento_defesa) || ' sem defesa' end)
    || coalesce('. Motivo: ' || mot, ''));
end $$;
