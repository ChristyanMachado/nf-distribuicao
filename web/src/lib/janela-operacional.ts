import { ErroFormulario } from "./formularios";

export type JanelaOperacional = {
  inicioHora: number;
  fimHora: number;
};

function lerHora(valor: FormDataEntryValue | string | null, campo: string): number {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(texto)) {
    throw new ErroFormulario(`${campo} deve ser uma hora inteira entre 0 e 23.`);
  }
  return Number(texto);
}

export function validarJanelaOperacional(
  inicio: FormDataEntryValue | string | null,
  fim: FormDataEntryValue | string | null,
): JanelaOperacional {
  const inicioHora = lerHora(inicio, "Horário inicial");
  const fimHora = lerHora(fim, "Horário final");
  if (inicioHora === fimHora) {
    throw new ErroFormulario("Os horários inicial e final precisam ser diferentes.");
  }
  return { inicioHora, fimHora };
}

export function descreverJanela({ inicioHora, fimHora }: JanelaOperacional): string {
  const hora = (valor: number) => `${String(valor).padStart(2, "0")}:00`;
  return `${hora(inicioHora)} até ${hora(fimHora)}`;
}
