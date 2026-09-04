"""Política de início de novas emissões no serviço persistente."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class JanelaEmissao:
    inicio_hora: int
    fim_hora: int

    def __post_init__(self) -> None:
        if not 0 <= self.inicio_hora <= 23 or not 0 <= self.fim_hora <= 23:
            raise ValueError("As horas da janela devem ficar entre 0 e 23.")
        if self.inicio_hora == self.fim_hora:
            raise ValueError("A janela de emissão não pode ter duração zero.")

    def permite_nova_emissao(self, agora: datetime | None = None) -> bool:
        """Decide antes da reserva; trabalho iniciado nunca é interrompido."""

        instante = agora or datetime.now(timezone.utc)
        local = instante.astimezone(ZoneInfo("America/Sao_Paulo"))
        if self.inicio_hora < self.fim_hora:
            return self.inicio_hora <= local.hour < self.fim_hora
        return local.hour >= self.inicio_hora or local.hour < self.fim_hora
