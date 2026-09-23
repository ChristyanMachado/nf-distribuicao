from pathlib import Path

import pytest
from dotenv import dotenv_values

from scripts.preparar_env_pc_servidor import preparar


def _origem(tmp_path: Path) -> Path:
    valores = {
        "SUPABASE_URL": "https://kcukzbszakwrfhbsiihw.supabase.co",
        "SUPABASE_SECRET_KEY": "segredo-de-teste",
        **{
            f"CLIENTE_{cliente}_{campo}": f"valor-{cliente}-{campo}"
            for cliente in "ABC"
            for campo in ("LOGIN", "SENHA", "IDENTIDADE_ESPERADA", "EMITENTE")
        },
    }
    arquivo = tmp_path / "origem.env"
    arquivo.write_text(
        "".join(f"{nome}='{valor}'\n" for nome, valor in valores.items()),
        encoding="utf-8",
    )
    return arquivo


def _adicionar_credencial(arquivo: Path, referencia: str) -> None:
    with arquivo.open("a", encoding="utf-8") as destino:
        for campo in ("LOGIN", "SENHA", "IDENTIDADE_ESPERADA", "EMITENTE"):
            destino.write(f"{referencia}_{campo}='valor-{campo}'\n")


def test_preserva_defaults_do_pc_servidor(tmp_path: Path) -> None:
    destino = tmp_path / "destino.env"
    preparar(_origem(tmp_path), destino)
    valores = dotenv_values(destino, interpolate=False)
    assert valores["WORKER_ID"] == "pc-servidor-01"
    assert valores["AMBIENTE_EMISSAO"] == "teste"
    assert valores["TESTAR_EMISSAO_HOMOLOGACAO"] == "true"
    assert valores["HABILITAR_PRODUCAO_FISCAL"] == "false"


def test_gera_contingencia_coordenada_de_producao(tmp_path: Path) -> None:
    destino = tmp_path / "destino.env"
    resultado = preparar(
        _origem(tmp_path), destino,
        worker_id="pc-contingencia-local",
        ambiente_emissao="normal",
        producao_fiscal=True,
    )
    valores = dotenv_values(destino, interpolate=False)
    assert resultado["segredosExibidos"] is False
    assert valores["WORKER_ID"] == "pc-contingencia-local"
    assert valores["AMBIENTE_EMISSAO"] == "normal"
    assert valores["TESTAR_EMISSAO_HOMOLOGACAO"] == "false"
    assert valores["HABILITAR_PRODUCAO_FISCAL"] == "true"


@pytest.mark.parametrize("worker_id", ["", "com espaço", "x" * 65])
def test_recusa_worker_id_invalido(tmp_path: Path, worker_id: str) -> None:
    with pytest.raises(ValueError):
        preparar(_origem(tmp_path), tmp_path / "destino.env", worker_id=worker_id)


def test_recusa_producao_no_ambiente_de_teste(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        preparar(_origem(tmp_path), tmp_path / "destino.env", producao_fiscal=True)


def test_descobre_e_preserva_quantidade_dinamica_de_emitentes(tmp_path: Path) -> None:
    origem = _origem(tmp_path)
    _adicionar_credencial(origem, "CLIENTE_NOVO")
    _adicionar_credencial(origem, "EMITENTE_JOAO")

    destino = tmp_path / "destino.env"
    resultado = preparar(origem, destino)
    valores = dotenv_values(destino, interpolate=False)

    assert resultado["clientes"] == 5
    assert valores["CLIENTES_ATIVOS"] == "CLIENTE_A,CLIENTE_B,CLIENTE_C,CLIENTE_NOVO,EMITENTE_JOAO"
    assert valores["CLIENTE_NOVO_LOGIN"] == "valor-LOGIN"
    assert valores["CLIENTE_NOVO_SENHA"] == "valor-SENHA"
    assert valores["EMITENTE_JOAO_LOGIN"] == "valor-LOGIN"
    assert valores["EMITENTE_JOAO_SENHA"] == "valor-SENHA"


def test_recusa_bloco_dinamico_incompleto(tmp_path: Path) -> None:
    origem = _origem(tmp_path)
    with origem.open("a", encoding="utf-8") as arquivo:
        arquivo.write("CLIENTE_NOVO_LOGIN='login'\n")

    with pytest.raises(RuntimeError, match="origem está incompleta"):
        preparar(origem, tmp_path / "destino.env")


def test_recusa_bloco_sem_login(tmp_path: Path) -> None:
    origem = _origem(tmp_path)
    with origem.open("a", encoding="utf-8") as arquivo:
        arquivo.write("CLIENTE_NOVO_SENHA='senha'\n")

    with pytest.raises(RuntimeError, match="origem está incompleta"):
        preparar(origem, tmp_path / "destino.env")


def test_recusa_credencial_generica_incompleta(tmp_path: Path) -> None:
    origem = _origem(tmp_path)
    with origem.open("a", encoding="utf-8") as arquivo:
        arquivo.write("EMITENTE_JOAO_SENHA='senha-de-teste'\n")

    with pytest.raises(RuntimeError, match="origem está incompleta"):
        preparar(origem, tmp_path / "destino.env")
