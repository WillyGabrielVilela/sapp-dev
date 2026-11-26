import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { baixarCsv, gerarCsv, type Coluna } from "@/lib/csv";

/** Exporta as linhas exibidas (já filtradas pela busca) para CSV. */
export function BotaoCsv<T>({ nome, colunas, linhas }: { nome: string; colunas: Coluna<T>[]; linhas: T[] }) {
  return (
    <Button size="sm" variant="outline" disabled={!linhas.length} onClick={() => baixarCsv(nome, gerarCsv(colunas, linhas))} title="Exportar esta lista em CSV (abre no Excel)">
      <Download /> CSV
    </Button>
  );
}
