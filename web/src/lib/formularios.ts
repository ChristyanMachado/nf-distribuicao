export type EstadoFormulario = {
  erro?: string;
};

export const ESTADO_FORMULARIO_INICIAL: EstadoFormulario = {};

/** Erro seguro, curto e apropriado para exibição ao usuário final. */
export class ErroFormulario extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroFormulario";
  }
}

export function falhaFormulario(
  erro: unknown,
  mensagemGenerica: string,
): EstadoFormulario {
  return {
    erro: erro instanceof ErroFormulario ? erro.message : mensagemGenerica,
  };
}
