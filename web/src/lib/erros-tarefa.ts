export const CODIGOS_REPROCESSAVEIS = [
  "FALHA_AUTENTICACAO",
  "FALHA_NAVEGACAO",
  "FALHA_PREENCHIMENTO",
  "FALHA_TECNICA",
] as const;

export type CodigoErroReprocessavel = (typeof CODIGOS_REPROCESSAVEIS)[number];

type DiagnosticoTarefa = {
  titulo: string;
  descricao: string;
  orientacao: string;
  podeTentarNovamente: boolean;
  deveCriarNovaDistribuicao: boolean;
};

const DIAGNOSTICOS: Record<string, Omit<DiagnosticoTarefa, "podeTentarNovamente">> = {
  CONTRATO_INVALIDO: {
    titulo: "Dados da distribuição incompatíveis",
    descricao: "O Worker não conseguiu confirmar a integridade dos dados desta tarefa.",
    orientacao: "Crie uma nova distribuição. Se o problema continuar, chame o suporte técnico.",
    deveCriarNovaDistribuicao: true,
  },
  AMBIENTE_INCORRETO: {
    titulo: "Configuração de ambiente incompatível",
    descricao: "A tarefa não pertence ao ambiente seguro usado pelo Worker.",
    orientacao: "Chame o suporte técnico. Não tente alterar a tarefa manualmente.",
    deveCriarNovaDistribuicao: false,
  },
  CREDENCIAL_INCOMPLETA: {
    titulo: "Configuração segura do emitente incompleta",
    descricao: "O Worker não encontrou todas as confirmações necessárias para usar este emitente.",
    orientacao: "Chame o suporte técnico. Nunca envie a senha fiscal pelo Web ou por mensagem.",
    deveCriarNovaDistribuicao: false,
  },
  EMITENTE_DIVERGENTE: {
    titulo: "Emitente diferente do cadastro atual",
    descricao: "Esta distribuição foi criada com um identificador NFP-e diferente do configurado no Worker.",
    orientacao: "Corrija o emitente e crie uma nova distribuição. Os dados desta tarefa são preservados e não podem ser trocados.",
    deveCriarNovaDistribuicao: true,
  },
  FALHA_AUTENTICACAO: {
    titulo: "Não foi possível entrar na Receita",
    descricao: "O portal não confirmou o acesso do emitente.",
    orientacao: "Tente novamente uma vez. Se o erro continuar, chame o suporte para conferir a credencial e o portal.",
    deveCriarNovaDistribuicao: false,
  },
  FALHA_NAVEGACAO: {
    titulo: "A tela de emissão não abriu",
    descricao: "A Receita não apresentou uma das etapas esperadas antes do preenchimento.",
    orientacao: "Tente novamente uma vez. Se continuar, chame o suporte; o portal pode ter mudado ou estar indisponível.",
    deveCriarNovaDistribuicao: false,
  },
  FALHA_PREENCHIMENTO: {
    titulo: "Não foi possível preencher a nota",
    descricao: "Um dado da distribuição não foi aceito ou um campo do portal mudou.",
    orientacao: "Revise cliente e produtos. Se algum cadastro mudou, crie uma nova distribuição. Se os dados estão corretos ou o suporte ajustou o portal, tente novamente.",
    deveCriarNovaDistribuicao: true,
  },
  FALHA_TECNICA: {
    titulo: "Falha técnica antes da emissão",
    descricao: "O processamento foi interrompido antes de enviar a nota à Receita.",
    orientacao: "É seguro tentar novamente. Se o problema se repetir, chame o suporte técnico.",
    deveCriarNovaDistribuicao: false,
  },
  RESULTADO_FISCAL_INCERTO: {
    titulo: "A emissão precisa ser conferida",
    descricao: "O Worker perdeu a confirmação depois de iniciar a emissão. A nota pode ter sido autorizada.",
    orientacao: "Não tente novamente. Chame o suporte para conferir a Receita e evitar uma nota duplicada.",
    deveCriarNovaDistribuicao: false,
  },
};

export function obterDiagnosticoTarefa(
  status: string,
  codigoErro: string | null,
  mensagem: string | null,
): DiagnosticoTarefa | null {
  if (status !== "ERRO" && status !== "AGUARDANDO_CONFERENCIA") return null;

  const conhecido = codigoErro ? DIAGNOSTICOS[codigoErro] : undefined;
  if (conhecido) {
    return {
      ...conhecido,
      podeTentarNovamente:
        status === "ERRO"
        && CODIGOS_REPROCESSAVEIS.some((codigo) => codigo === codigoErro),
    };
  }

  return {
    titulo: status === "AGUARDANDO_CONFERENCIA"
      ? "A emissão precisa ser conferida"
      : "A tarefa precisa de atenção",
    descricao: mensagem || "O Worker interrompeu esta tarefa de forma segura.",
    orientacao: status === "AGUARDANDO_CONFERENCIA"
      ? "Não tente novamente. Chame o suporte para conferir a Receita."
      : "Chame o suporte técnico e informe o número da distribuição.",
    podeTentarNovamente: false,
    deveCriarNovaDistribuicao: false,
  };
}
