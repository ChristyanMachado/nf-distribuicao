from scripts.verificar_privilegios_banco import avaliar_privilegios


def _resultado_minimo() -> dict[str, bool]:
    return {
        "conectar_banco": True,
        "usar_schema": True,
        "executar_reserva": True,
        "ler_tarefas": True,
        "atualizar_status": True,
        "ler_notas": True,
        "inserir_notas": True,
        "ler_emitentes": False,
        "ler_login_legado": False,
        "ler_senha_legada": False,
        "excluir_tarefas": False,
        "excluir_notas": False,
        "atualizar_notas": False,
    }


def test_papel_minimo_e_aceito():
    assert avaliar_privilegios(_resultado_minimo()) == {
        "papelWorkerSeguro": True,
        "privilegiosObrigatoriosAusentes": [],
        "privilegiosExcessivos": [],
    }


def test_papel_sem_reserva_e_rejeitado():
    resultado = _resultado_minimo()
    resultado["executar_reserva"] = False

    avaliacao = avaliar_privilegios(resultado)

    assert avaliacao["papelWorkerSeguro"] is False
    assert avaliacao["privilegiosObrigatoriosAusentes"] == ["executar_reserva"]


def test_papel_com_acesso_a_senha_legada_e_rejeitado():
    resultado = _resultado_minimo()
    resultado["ler_senha_legada"] = True

    avaliacao = avaliar_privilegios(resultado)

    assert avaliacao["papelWorkerSeguro"] is False
    assert avaliacao["privilegiosExcessivos"] == ["ler_senha_legada"]
