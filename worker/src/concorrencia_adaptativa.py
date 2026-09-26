"""Decisão conservadora de concorrência; módulo puro, sem I/O."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Sequence

GIB = 1024**3
WINDOW_SIZE = 12
MIN_VALID_SAMPLES = 10
MAX_CAPACITY = 3


class Mode(StrEnum):
    MANUAL = "MANUAL"
    AUTOMATICO = "AUTOMATICO"


@dataclass(frozen=True)
class Policy:
    mode: Mode = Mode.MANUAL
    manual_capacity: int = 1
    auto_min: int = 1
    auto_max: int = 1
    local_limit: int = 1
    admin_limit: int = 1


@dataclass(frozen=True)
class Sample:
    cpu_percent: float | None
    memory_available_bytes: int | None


@dataclass(frozen=True)
class QueueState:
    eligible_tasks: int
    distinct_credentials: int
    lease_healthy: bool = True
    fiscal_result_uncertain: bool = False


@dataclass(frozen=True)
class ControllerState:
    effective_capacity: int = 1
    previous_cycle_clean: bool = False
    last_change_at: float | None = None


@dataclass(frozen=True)
class Decision:
    capacity: int
    reason: str


def _valid_policy(policy: Policy) -> bool:
    return (
        1 <= policy.manual_capacity <= MAX_CAPACITY
        and 1 <= policy.auto_min <= policy.auto_max <= MAX_CAPACITY
        and 1 <= policy.local_limit <= MAX_CAPACITY
        and 1 <= policy.admin_limit <= MAX_CAPACITY
    )


def _window_health(samples: Sequence[Sample]) -> str:
    if len(samples) < WINDOW_SIZE:
        return "INSUFFICIENT_SAMPLES"
    window = samples[-WINDOW_SIZE:]
    valid = [
        sample for sample in window
        if sample.cpu_percent is not None
        and sample.memory_available_bytes is not None
        and 0 <= sample.cpu_percent <= 100
        and sample.memory_available_bytes >= 0
    ]
    if len(valid) < MIN_VALID_SAMPLES:
        return "METRICS_UNAVAILABLE"
    if min(s.memory_available_bytes for s in valid) < int(1.5 * GIB):
        return "CRITICAL_MEMORY"
    cpu_average = sum(s.cpu_percent for s in valid) / len(valid)
    minimum_memory = min(s.memory_available_bytes for s in valid)
    if cpu_average >= 75 or minimum_memory < 3 * GIB:
        return "RESOURCE_PRESSURE"
    if cpu_average <= 55 and max(s.cpu_percent for s in valid) < 80 and minimum_memory >= 4 * GIB:
        return "HEALTHY"
    return "MARGINAL"


def decide_capacity(
    policy: Policy,
    state: ControllerState,
    samples: Sequence[Sample],
    queue: QueueState,
    now_monotonic: float = 0.0,
) -> Decision:
    """Choose the next cycle limit; it never cancels work already in progress."""
    if not _valid_policy(policy):
        return Decision(1, "INVALID_POLICY")
    if not queue.lease_healthy:
        return Decision(1, "LEASE_UNHEALTHY")
    if queue.fiscal_result_uncertain:
        return Decision(1, "FISCAL_RESULT_UNCERTAIN")
    if queue.eligible_tasks <= 0:
        return Decision(1, "NO_ELIGIBLE_TASKS")

    hard_limit = min(policy.local_limit, policy.admin_limit, MAX_CAPACITY)
    if policy.mode == Mode.MANUAL:
        return Decision(
            min(policy.manual_capacity, hard_limit, queue.eligible_tasks),
            "MANUAL",
        )

    # Automatic never runs concurrent sessions against the same fiscal login.
    eligible_parallel = min(queue.eligible_tasks, queue.distinct_credentials)
    if eligible_parallel < 2:
        return Decision(1, "INSUFFICIENT_DISTINCT_CREDENTIALS")

    first = _window_health(samples[:-WINDOW_SIZE])
    second = _window_health(samples)
    reasons = (first, second)
    if "CRITICAL_MEMORY" in reasons:
        return Decision(1, "CRITICAL_MEMORY")
    if "METRICS_UNAVAILABLE" in reasons or "INSUFFICIENT_SAMPLES" in reasons:
        return Decision(1, "METRICS_UNAVAILABLE")
    if not state.previous_cycle_clean:
        return Decision(1, "PREVIOUS_CYCLE_FAILED")

    current = max(1, min(state.effective_capacity, hard_limit))
    if reasons == ("RESOURCE_PRESSURE", "RESOURCE_PRESSURE"):
        if current == 1:
            return Decision(1, "RESOURCE_PRESSURE")
        if state.last_change_at is not None and now_monotonic - state.last_change_at < 300:
            return Decision(current, "REDUCTION_COOLDOWN")
        return Decision(current - 1, "RESOURCE_PRESSURE_REDUCE_ONE")
    if "RESOURCE_PRESSURE" in reasons:
        return Decision(current, "SINGLE_PRESSURE_WINDOW_HOLD")
    if first == second == "HEALTHY":
        if state.last_change_at is not None and now_monotonic - state.last_change_at < 120:
            return Decision(current, "PROMOTION_COOLDOWN")
        target = min(policy.auto_max, hard_limit, eligible_parallel, current + 1)
        if target > current:
            return Decision(target, "HEALTHY_TWO_WINDOWS_PROMOTE_ONE")
        return Decision(min(current, policy.auto_max), "HEALTHY_AT_CEILING")
    return Decision(current, "MARGINAL_RESOURCES_HOLD")
