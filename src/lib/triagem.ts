import { REGEX_NUMERO } from "./jr5260";

type ItemTriagem = { numero: string | null; abertura: string | null; situacao: string };

export function avaliarTriagem(itens: ItemTriagem[], totalRodape: number | null) {
  const pendentes = itens.filter((i) => i.situacao === "pendente");
  const contagem = new Map<string, number>();
  pendentes.forEach((i) => {
    if (i.numero) contagem.set(i.numero, (contagem.get(i.numero) ?? 0) + 1);
  });
  const invalidos = pendentes.filter((i) => !i.numero || !REGEX_NUMERO.test(i.numero) || !i.abertura || (contagem.get(i.numero) ?? 0) > 1);
  const totalOk = totalRodape === itens.length;
  return {
    pendentes, contagem, invalidos, totalOk,
    bloqueado: !totalOk || invalidos.length > 0 || pendentes.length === 0,
    podeIniciar: pendentes.length > 0 && invalidos.length === 0 && (totalRodape === null || totalOk),
  };
}