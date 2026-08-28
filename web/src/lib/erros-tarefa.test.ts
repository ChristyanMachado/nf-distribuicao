import { describe, expect, it } from "vitest";
import { obterDiagnosticoTarefa } from "./erros-tarefa";

describe("diagnóstico seguro de tarefas", () => {
  it("permite repetir falha de portal ocorrida antes da emissão", () => {
    expect(
      obterDiagnosticoTarefa("ERRO", "FALHA_NAVEGACAO", null)?.podeTentarNovamente,
    ).toBe(true);
  });

  it("manda criar nova distribuição quando o snapshot do emitente diverge", () => {
    const diagnostico = obterDiagnosticoTarefa("ERRO", "EMITENTE_DIVERGENTE", null);
    expect(diagnostico?.podeTentarNovamente).toBe(false);
    expect(diagnostico?.deveCriarNovaDistribuicao).toBe(true);
  });

  it("nunca libera repetição quando o resultado fiscal é incerto", () => {
    expect(
      obterDiagnosticoTarefa(
        "AGUARDANDO_CONFERENCIA",
        "RESULTADO_FISCAL_INCERTO",
        null,
      )?.podeTentarNovamente,
    ).toBe(false);
  });

  it("não mostra retry em conferência mesmo com código pré-emissão inconsistente", () => {
    expect(
      obterDiagnosticoTarefa(
        "AGUARDANDO_CONFERENCIA",
        "FALHA_NAVEGACAO",
        null,
      )?.podeTentarNovamente,
    ).toBe(false);
  });

  it("mantém erro legado sem código bloqueado para suporte", () => {
    const diagnostico = obterDiagnosticoTarefa("ERRO", null, "Falha anterior");
    expect(diagnostico?.descricao).toBe("Falha anterior");
    expect(diagnostico?.podeTentarNovamente).toBe(false);
  });
});
