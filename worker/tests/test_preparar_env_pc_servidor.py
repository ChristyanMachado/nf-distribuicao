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
            for campo in ("LOGIN", "SENHA", "EMITENTE")
        },
    }
    arquivo = tmp_path / "origem.env"
    arquivo.write_text(
        "".join(f"{nome}='{valor}'\n" for nome, valor in valores.items()),
        encoding="utf-8",
    )
    return arquivo


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
