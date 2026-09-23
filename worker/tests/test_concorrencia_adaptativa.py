from src.concorrencia_adaptativa import (
    GIB,
    ControllerState,
    Mode,
    Policy,
    QueueState,
    Sample,
    decide_capacity,
)


def samples(cpu=20, memory=8 * GIB, count=24):
    return [Sample(cpu, memory) for _ in range(count)]


def auto_policy(**kwargs):
    valores = {"auto_min": 1, "auto_max": 3, "local_limit": 3, "admin_limit": 3}
    valores.update(kwargs)
    return Policy(mode=Mode.AUTOMATICO, **valores)


def test_manual_capacity_is_not_restricted_by_auto_max():
    policy = Policy(mode=Mode.MANUAL, manual_capacity=3, auto_max=1, local_limit=3, admin_limit=3)
    decision = decide_capacity(policy, ControllerState(), [], QueueState(3, 3))
    assert (decision.capacity, decision.reason) == (3, "MANUAL")


def test_manual_capacity_is_limited_by_local_admin_and_available_work():
    policy = Policy(mode=Mode.MANUAL, manual_capacity=3, local_limit=2, admin_limit=3)
    decision = decide_capacity(policy, ControllerState(), [], QueueState(1, 1))
    assert decision.capacity == 1


def test_auto_requires_two_healthy_windows_and_promotes_one_level():
    decision = decide_capacity(auto_policy(), ControllerState(previous_cycle_clean=True), samples(), QueueState(3, 3))
    assert decision.capacity == 2
    assert decision.reason == "HEALTHY_TWO_WINDOWS_PROMOTE_ONE"


def test_auto_single_window_is_not_enough():
    decision = decide_capacity(auto_policy(), ControllerState(), samples(count=12), QueueState(3, 3))
    assert decision.capacity == 1
    assert decision.reason == "METRICS_UNAVAILABLE"


def test_auto_keeps_capacity_bounded_by_admin_local_and_credentials():
    policy = auto_policy(local_limit=3, admin_limit=2)
    decision = decide_capacity(policy, ControllerState(effective_capacity=2, previous_cycle_clean=True), samples(), QueueState(3, 3))
    assert decision.capacity == 2


def test_auto_will_not_parallelize_same_credential():
    decision = decide_capacity(auto_policy(), ControllerState(), samples(), QueueState(3, 1))
    assert decision.capacity == 1
    assert decision.reason == "INSUFFICIENT_DISTINCT_CREDENTIALS"


def test_unhealthy_lease_and_uncertain_result_force_one():
    decision = decide_capacity(auto_policy(), ControllerState(effective_capacity=2, previous_cycle_clean=True), samples(), QueueState(3, 3, lease_healthy=False))
    assert (decision.capacity, decision.reason) == (1, "LEASE_UNHEALTHY")
    decision = decide_capacity(auto_policy(), ControllerState(effective_capacity=2, previous_cycle_clean=True), samples(), QueueState(3, 3, fiscal_result_uncertain=True))
    assert (decision.capacity, decision.reason) == (1, "FISCAL_RESULT_UNCERTAIN")


def test_failed_cycle_or_invalid_metrics_force_one():
    decision = decide_capacity(auto_policy(), ControllerState(effective_capacity=2, previous_cycle_clean=False), samples(), QueueState(3, 3))
    assert (decision.capacity, decision.reason) == (1, "PREVIOUS_CYCLE_FAILED")
    decision = decide_capacity(auto_policy(), ControllerState(), samples(memory=None), QueueState(3, 3))
    assert decision.capacity == 1


def test_pressure_or_critical_memory_fall_back_to_one():
    decision = decide_capacity(auto_policy(), ControllerState(effective_capacity=2, previous_cycle_clean=True), samples(cpu=80), QueueState(3, 3))
    assert (decision.capacity, decision.reason) == (1, "RESOURCE_PRESSURE_REDUCE_ONE")
    decision = decide_capacity(auto_policy(), ControllerState(effective_capacity=3, previous_cycle_clean=True), samples(memory=int(1.4 * GIB)), QueueState(3, 3))
    assert (decision.capacity, decision.reason) == (1, "CRITICAL_MEMORY")


def test_auto_fails_closed_when_resources_are_marginal():
    decision = decide_capacity(auto_policy(), ControllerState(effective_capacity=3, previous_cycle_clean=True), samples(cpu=60), QueueState(3, 3))
    assert decision.capacity == 3
    assert decision.reason == "MARGINAL_RESOURCES_HOLD"


def test_invalid_auto_bounds_fail_closed():
    policy = auto_policy(auto_min=3, auto_max=2)
    decision = decide_capacity(policy, ControllerState(), samples(), QueueState(3, 3))
    assert (decision.capacity, decision.reason) == (1, "INVALID_POLICY")


def test_auto_pressure_requires_two_windows_and_steps_down_once():
    observations = samples(count=12) + samples(cpu=80, count=12)
    state = ControllerState(effective_capacity=3, previous_cycle_clean=True)
    decision = decide_capacity(auto_policy(), state, observations, QueueState(3, 3), now_monotonic=1000)
    assert (decision.capacity, decision.reason) == (3, "SINGLE_PRESSURE_WINDOW_HOLD")
    decision = decide_capacity(auto_policy(), state, samples(cpu=80), QueueState(3, 3), now_monotonic=1000)
    assert (decision.capacity, decision.reason) == (2, "RESOURCE_PRESSURE_REDUCE_ONE")


def test_auto_cooldown_prevents_flapping():
    state = ControllerState(effective_capacity=1, previous_cycle_clean=True, last_change_at=100)
    decision = decide_capacity(auto_policy(), state, samples(), QueueState(3, 3), now_monotonic=200)
    assert (decision.capacity, decision.reason) == (1, "PROMOTION_COOLDOWN")
