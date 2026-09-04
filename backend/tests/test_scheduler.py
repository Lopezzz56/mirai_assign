from __future__ import annotations

from datetime import datetime
import pytest
from app.scheduler import (
    build_demo_data,
    solve_schedule,
    calculate_metrics,
    calculate_changeovers,
    overlaps_any_closed,
    Disruption,
    DemoScheduler,
    overlaps_any_closed,
    DEMO_START
)
from app.database import SessionLocal, ManualOverride


def test_unit_setup_matrix():
    data = build_demo_data()
    # Check setup times between part families
    # Same family setup is low
    assert data.setup_matrix["shaft"]["shaft"] == 12
    # Different family setup is higher
    assert data.setup_matrix["shaft"]["gear"] == 42
    assert data.setup_matrix["gear"]["shaft"] == 44


def test_unit_overlaps_any_closed():
    # Closed hours are usually after 18 hours (18 * 60 = 1080 min) to 1440 min
    # Or D6 (Saturday/Sunday closed day)
    # Check if minute 1100 (which is in closed shift) returns True
    assert overlaps_any_closed(1100, 1150) is True
    # Check if minute 100 (which is in active Shift A) returns False
    assert overlaps_any_closed(100, 200) is False


def test_unit_metrics_calculation():
    data = build_demo_data()
    # Solve standard baseline
    plan = solve_schedule(data, version=1, strategy="cheapest")
    assert plan["feasible"] is True
    assert plan["validated"] is True
    
    kpis = plan["kpis"]
    assert kpis["orders"] == 25
    assert kpis["on_time"] >= 80.0
    assert kpis["total_cost"] > 0
    assert kpis["bottleneck"] == "GRIND"


def test_solver_precedence():
    data = build_demo_data()
    plan = solve_schedule(data, version=1, strategy="cheapest")
    ops = plan["operations"]
    
    # Check that for any order, operations run in correct sequence order
    by_order = {}
    for op in ops:
        by_order.setdefault(op["order_id"], []).append(op)
        
    for order_id, order_ops in by_order.items():
        ordered = sorted(order_ops, key=lambda x: x["sequence"])
        for prev, curr in zip(ordered, ordered[1:]):
            assert curr["start_minute"] >= prev["end_minute"]


def test_solver_machine_capacity_no_overlap():
    data = build_demo_data()
    plan = solve_schedule(data, version=1, strategy="cheapest")
    ops = plan["operations"]
    
    # Check that no machine has overlapping operations
    by_machine = {}
    for op in ops:
        by_machine.setdefault(op["machine_id"], []).append(op)
        
    for machine_id, mach_ops in by_machine.items():
        ordered = sorted(mach_ops, key=lambda x: x["start_minute"])
        for prev, curr in zip(ordered, ordered[1:]):
            assert curr["start_minute"] >= prev["end_minute"]


def test_solver_operator_capacity_no_overlap():
    data = build_demo_data()
    plan = solve_schedule(data, version=1, strategy="cheapest")
    ops = plan["operations"]
    
    # Check that no operator is assigned to overlapping tasks
    by_op = {}
    for op in ops:
        by_op.setdefault(op["operator_id"], []).append(op)
        
    for op_id, operator_ops in by_op.items():
        ordered = sorted(operator_ops, key=lambda x: x["start_minute"])
        for prev, curr in zip(ordered, ordered[1:]):
            assert curr["start_minute"] >= prev["end_minute"]


def test_manual_override_pinning():
    data = build_demo_data()
    # Let's create an override pinning order SPW-002 operation OP01 to CNC-L03
    override = ManualOverride(
        order_id="SPW-002",
        operation_id="SPW-002-OP01",
        pin_type="machine",
        pin_value="CNC-L03",
        active=True
    )
    
    plan = solve_schedule(data, version=2, strategy="cheapest", overrides=[override])
    assert plan["feasible"] is True
    
    # Verify that SPW-002-OP01 was indeed scheduled on CNC-L03
    op = next(o for o in plan["operations"] if o["operation_id"] == "SPW-002-OP01")
    assert op["machine_id"] == "CNC-L03"


def test_solver_infeasibility_reporting():
    data = build_demo_data()
    # Pin operation to invalid machine
    override = ManualOverride(
        order_id="SPW-002",
        operation_id="SPW-002-OP01",
        pin_type="machine",
        pin_value="GRIND-G01",  # OP01 is TURN, not GRIND
        active=True
    )
    
    plan = solve_schedule(data, version=3, strategy="cheapest", overrides=[override])
    assert plan["feasible"] is False
    assert plan["validated"] is False
    assert any("ineligible machine" in issue for issue in plan["validation"]["issues"])


def test_replanning_disruption():
    # Setup baseline
    scheduler = DemoScheduler()
    baseline = scheduler.state.baseline
    assert baseline is not None
    
    # Inject Tuesday 11:00 AM grinding machine breakdown + operator absence
    disruption = Disruption(
        preset="combined_grinding_breakdown_operator_absence",
        machine_id="GRIND-G01",
        operator_id="OP-GRIND-1",
        start_minute=300,
        downtime_minutes=480
    )
    
    # Replan
    replan_res = scheduler.replan({
        "preset": "combined_grinding_breakdown_operator_absence",
        "machine_id": "GRIND-G01",
        "operator_id": "OP-GRIND-1",
        "start_minute": 300,
        "downtime_minutes": 480
    })
    
    assert replan_res["feasible"] is True
    assert replan_res["plan_version"] == "V002"
    
    # Check that completed baseline operations before minute 300 remain frozen
    cutoff = 300
    baseline_ops = {op["operation_id"]: op for op in baseline["operations"] if op["end_minute"] <= cutoff}
    
    for op_id, base_op in baseline_ops.items():
        repl_op = next(o for o in replan_res["operations"] if o["operation_id"] == op_id)
        assert repl_op["start_minute"] == base_op["start_minute"]
        assert repl_op["machine_id"] == base_op["machine_id"]
        assert repl_op["operator_id"] == base_op["operator_id"]
