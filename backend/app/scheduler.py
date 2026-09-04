from __future__ import annotations

import math
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

from ortools.sat.python import cp_model

from app.database import SessionLocal, ManualOverride, SqlAlchemyPlanStore, seed_db


DEMO_START = datetime(2026, 8, 25, 6, 0)
HORIZON_MINUTES = 14 * 24 * 60
OPEN_MINUTES_PER_DAY = 18 * 60
REGULAR_MINUTES_PER_DAY = 16 * 60
OVERTIME_COST_PER_HOUR = 950
CHANGEOVER_COST_PER_HOUR = 550
STABILITY_COST_PER_MOVE = 175

WorkCenter = Literal["TURN", "MILL", "HOB", "DRILL", "HEAT", "GRIND", "QC"]
Strategy = Literal["cheapest", "on_time", "robust"]


@dataclass(frozen=True)
class Machine:
    id: str
    name: str
    center: WorkCenter
    capabilities: tuple[WorkCenter, ...]


@dataclass(frozen=True)
class Operator:
    id: str
    name: str
    skills: tuple[WorkCenter, ...]


@dataclass(frozen=True)
class Order:
    id: str
    customer: str
    part: str
    family: str
    quantity: int
    release_minute: int
    due_minute: int
    penalty_per_hour: int
    priority: int


@dataclass(frozen=True)
class Operation:
    id: str
    order_id: str
    sequence: int
    center: WorkCenter
    name: str
    family: str
    quantity: int
    duration: int
    setup: int
    eligible_machines: tuple[str, ...]
    eligible_operators: tuple[str, ...]


@dataclass(frozen=True)
class BlockWindow:
    resource_type: Literal["machine", "operator", "all_machines"]
    resource_id: str
    start: int
    end: int
    reason: str


@dataclass
class Disruption:
    preset: str = "combined_grinding_breakdown_operator_absence"
    machine_id: str = "GRIND-G02"
    operator_id: str = "OP-GRIND-2"
    start_minute: int = 5 * 60
    downtime_minutes: int = 8 * 60
    material_delay_minutes: int = 0
    rework_quantity: int = 0


@dataclass
class DemoData:
    machines: list[Machine]
    operators: list[Operator]
    orders: list[Order]
    operations: list[Operation]
    setup_matrix: dict[str, dict[str, int]]
    maintenance: list[BlockWindow]
    breakdown_history: list[dict[str, Any]]
    quality_events: list[dict[str, Any]]
    material_constraints: dict[str, int]


@dataclass
class DemoState:
    baseline: dict[str, Any] | None = None
    current: dict[str, Any] | None = None
    disruption: Disruption | None = None
    scenario_history: list[dict[str, Any]] = field(default_factory=list)
    version_counter: int = 1


def minutes(dt: datetime) -> int:
    return int((dt - DEMO_START).total_seconds() // 60)


def iso(minute: int) -> str:
    return (DEMO_START + timedelta(minutes=int(minute))).isoformat()


def day_hour(day: int, hour: int, minute: int = 0) -> int:
    return day * 1440 + (hour - 6) * 60 + minute


def human_time(minute: int) -> str:
    return (DEMO_START + timedelta(minutes=int(minute))).strftime("%a %H:%M")


def build_demo_data(disruption: Disruption | None = None) -> DemoData:
    machines = [
        Machine("CNC-L01", "CNC Lathe 01", "TURN", ("TURN",)),
        Machine("CNC-L02", "CNC Lathe 02", "TURN", ("TURN",)),
        Machine("CNC-L03", "CNC Lathe 03", "TURN", ("TURN",)),
        Machine("MILL-M01", "VMC Mill 01", "MILL", ("MILL",)),
        Machine("MILL-M02", "VMC Mill 02", "MILL", ("MILL",)),
        Machine("MILL-M03", "VMC Mill 03", "MILL", ("MILL",)),
        Machine("GRIND-G01", "Cylindrical Grinder 01", "GRIND", ("GRIND",)),
        Machine("GRIND-G02", "Cylindrical Grinder 02", "GRIND", ("GRIND",)),
        Machine("GRIND-G03", "Surface Grinder 03", "GRIND", ("GRIND",)),
        Machine("HOB-H01", "Gear Hobber 01", "HOB", ("HOB",)),
        Machine("HOB-H02", "Gear Hobber 02", "HOB", ("HOB",)),
        Machine("DRILL-D01", "Radial Drill 01", "DRILL", ("DRILL",)),
        Machine("HEAT-T01", "Heat Treat Furnace", "HEAT", ("HEAT",)),
        Machine("QC-Q01", "Final Inspection Bench", "QC", ("QC",)),
    ]
    operators = [
        Operator("OP-TURN-1", "Ramesh", ("TURN", "MILL")),
        Operator("OP-TURN-2", "Suresh", ("TURN",)),
        Operator("OP-TURN-3", "Arun", ("TURN", "DRILL")),
        Operator("OP-MILL-1", "Meena", ("MILL", "DRILL")),
        Operator("OP-MILL-2", "Kavitha", ("MILL",)),
        Operator("OP-MILL-3", "Balaji", ("MILL", "HOB")),
        Operator("OP-GRIND-1", "Ravi", ("GRIND",)),
        Operator("OP-GRIND-2", "Imran", ("GRIND",)),
        Operator("OP-GRIND-3", "Nandini", ("GRIND", "QC")),
        Operator("OP-HOB-1", "Dinesh", ("HOB",)),
        Operator("OP-HOB-2", "Prakash", ("HOB", "TURN")),
        Operator("OP-DRILL-1", "Selvi", ("DRILL",)),
        Operator("OP-HEAT-1", "Murugan", ("HEAT",)),
        Operator("OP-QC-1", "Farida", ("QC",)),
        Operator("OP-QC-2", "Naveen", ("QC", "GRIND")),
        Operator("OP-FLEX-1", "Anita", ("TURN", "MILL", "QC")),
    ]

    customers = [
        ("SPW-001", "Apex Auto", "Steering Shaft", "shaft", 520, 0, day_hour(3, 12), 2800, 5),
        ("SPW-002", "Veda Pumps", "Impeller Sleeve", "sleeve", 380, 0, day_hour(4, 10), 1700, 3),
        ("SPW-003", "Kaveri Motors", "Rotor Hub", "housing", 260, 0, day_hour(5, 16), 1350, 2),
        ("SPW-004", "Apex Auto", "Pinion Gear", "gear", 430, 0, day_hour(4, 16), 2200, 4),
        ("SPW-005", "Metro Hydraulics", "Valve Body", "valve", 250, 60, day_hour(6, 12), 1300, 2),
        ("SPW-006", "Rane Systems", "Brake Sleeve", "sleeve", 610, 0, day_hour(3, 18), 1900, 4),
        ("SPW-007", "Nila Robotics", "Servo Shaft", "shaft", 310, 0, day_hour(5, 12), 1600, 3),
        ("SPW-008", "Kaveri Motors", "Rotor Hub", "housing", 420, 120, day_hour(6, 16), 1200, 2),
        ("SPW-009", "Apex Auto", "Output Shaft", "shaft", 690, 0, day_hour(4, 8), 2500, 5),
        ("SPW-010", "Veda Pumps", "Pump Coupler", "sleeve", 340, 180, day_hour(7, 12), 1200, 2),
        ("SPW-011", "Metro Hydraulics", "Spool Valve", "valve", 210, 0, day_hour(5, 10), 1550, 3),
        ("SPW-012", "Rane Systems", "Guide Pin", "shaft", 730, 0, day_hour(6, 18), 1300, 2),
        ("SPW-013", "Nila Robotics", "Timing Gear", "gear", 180, 0, day_hour(7, 16), 1900, 3),
        ("SPW-014", "Apex Auto", "Brake Sleeve", "sleeve", 600, 60, day_hour(3, 14), 3100, 5),
        ("SPW-015", "Veda Pumps", "Pump Shaft", "shaft", 460, 0, day_hour(8, 12), 1150, 2),
        ("SPW-016", "Kaveri Motors", "Bearing Housing", "housing", 290, 0, day_hour(8, 16), 1100, 1),
        ("SPW-017", "Rane Systems", "Sector Gear", "gear", 320, 90, day_hour(6, 14), 1800, 3),
        ("SPW-018", "Metro Hydraulics", "Valve Seat", "valve", 560, 0, day_hour(5, 18), 1700, 3),
        ("SPW-019", "Apex Auto", "Valve Body", "valve", 280, 0, day_hour(4, 18), 2400, 4),
        ("SPW-020", "Nila Robotics", "Robot Joint Sleeve", "sleeve", 150, 240, day_hour(9, 12), 1000, 1),
        ("SPW-021", "Apex Auto", "Shaft Assembly", "shaft", 1000, 0, day_hour(0, 18), 4200, 6),
        ("SPW-022", "Veda Pumps", "Wear Ring", "sleeve", 500, 0, day_hour(7, 18), 1250, 2),
        ("SPW-023", "Kaveri Motors", "Gear Carrier", "gear", 240, 180, day_hour(9, 18), 1450, 2),
        ("SPW-024", "Metro Hydraulics", "Control Block", "valve", 330, 0, day_hour(8, 18), 1500, 2),
        ("SPW-025", "Rane Systems", "Clutch Shaft", "shaft", 410, 0, day_hour(7, 10), 1850, 3),
    ]
    material_constraints = {row[0]: row[5] for row in customers}
    if disruption and disruption.material_delay_minutes:
        delayed_orders = {"SPW-014", "SPW-021", "SPW-019"}
        for order_id in delayed_orders:
            material_constraints[order_id] += disruption.material_delay_minutes

    orders = [
        Order(order_id, customer, part, family, qty, material_constraints[order_id], due, penalty, priority)
        for order_id, customer, part, family, qty, _, due, penalty, priority in customers
    ]

    by_center = defaultdict(list)
    for machine in machines:
        for center in machine.capabilities:
            by_center[center].append(machine.id)
    operators_by_center = defaultdict(list)
    for operator in operators:
        for skill in operator.skills:
            operators_by_center[skill].append(operator.id)

    route_templates: dict[str, list[tuple[WorkCenter, str, int, int]]] = {
        "shaft": [("TURN", "Rough turn", 82, 26), ("HEAT", "Stress relieve", 96, 14), ("GRIND", "Finish grind", 238, 48), ("QC", "Final inspection", 24, 8)],
        "sleeve": [("TURN", "Turn sleeve", 70, 24), ("DRILL", "Cross drill", 45, 16), ("GRIND", "Bore grind", 218, 42), ("QC", "Final inspection", 22, 8)],
        "gear": [("TURN", "Turn blank", 62, 24), ("HOB", "Hob teeth", 110, 36), ("HEAT", "Case harden", 120, 16), ("GRIND", "Tooth grind", 258, 50), ("QC", "Gear inspection", 26, 10)],
        "housing": [("MILL", "Mill datum", 95, 26), ("DRILL", "Bolt pattern", 48, 15), ("QC", "CMM inspection", 26, 10)],
        "valve": [("MILL", "Mill body", 92, 28), ("DRILL", "Port drilling", 58, 18), ("GRIND", "Seat grind", 232, 44), ("QC", "Leak inspection", 26, 10)],
    }

    operations: list[Operation] = []
    for order in orders:
        for index, (center, name, base_duration, setup) in enumerate(route_templates[order.family], start=1):
            quantity_factor = math.ceil(order.quantity / 120)
            priority_factor = max(0, 5 - order.priority)
            duration = base_duration + quantity_factor * 7 + priority_factor * 2
            op_id = f"{order.id}-OP{index:02d}"
            operations.append(
                Operation(
                    op_id,
                    order.id,
                    index,
                    center,
                    name,
                    order.family,
                    order.quantity,
                    duration,
                    setup,
                    tuple(by_center[center]),
                    tuple(operators_by_center[center]),
                )
            )

    quality_events = [
        {"order_id": "SPW-006", "operation": "Bore grind", "scrap_ppm": 800, "action": "extra inspection sample"},
        {"order_id": "SPW-018", "operation": "Seat grind", "scrap_ppm": 1200, "action": "tool offset check"},
        {"order_id": "SPW-021", "operation": "Finish grind", "scrap_ppm": 500, "action": "critical dimension audit"},
    ]
    if disruption and disruption.rework_quantity:
        order = next(item for item in orders if item.id == "SPW-014")
        operations.append(
            Operation(
                "SPW-014-RWK01",
                order.id,
                90,
                "GRIND",
                f"Rework {disruption.rework_quantity} pcs",
                order.family,
                disruption.rework_quantity,
                95,
                35,
                tuple(by_center["GRIND"]),
                tuple(operators_by_center["GRIND"]),
            )
        )
        quality_events.append(
            {"order_id": "SPW-014", "operation": "Bore grind", "rework_qty": disruption.rework_quantity, "action": "regrind and reinspect"}
        )

    setup_matrix = {
        "shaft": {"shaft": 12, "sleeve": 28, "gear": 42, "housing": 26, "valve": 30},
        "sleeve": {"shaft": 25, "sleeve": 10, "gear": 38, "housing": 24, "valve": 22},
        "gear": {"shaft": 44, "sleeve": 36, "gear": 16, "housing": 40, "valve": 34},
        "housing": {"shaft": 26, "sleeve": 24, "gear": 42, "housing": 8, "valve": 18},
        "valve": {"shaft": 30, "sleeve": 20, "gear": 36, "housing": 18, "valve": 9},
    }
    maintenance = [
        BlockWindow("machine", "MILL-M03", day_hour(1, 10), day_hour(1, 12), "planned spindle service"),
        BlockWindow("machine", "GRIND-G02", day_hour(2, 14), day_hour(2, 16), "wheel balancing"),
        BlockWindow("machine", "HEAT-T01", day_hour(4, 8), day_hour(4, 11), "furnace calibration"),
        BlockWindow("operator", "OP-QC-1", day_hour(1, 12), day_hour(1, 14), "customer audit"),
    ]
    breakdown_history = [
        {"machine_id": "GRIND-G01", "events_90d": 4, "mttr_hours": 7.6, "last_event": "wheelhead bearing"},
        {"machine_id": "MILL-M02", "events_90d": 2, "mttr_hours": 3.1, "last_event": "tool changer"},
        {"machine_id": "HEAT-T01", "events_90d": 1, "mttr_hours": 5.0, "last_event": "burner relay"},
    ]
    return DemoData(machines, operators, orders, operations, setup_matrix, maintenance, breakdown_history, quality_events, material_constraints)


def disruption_windows(disruption: Disruption | None) -> list[BlockWindow]:
    if not disruption:
        return []
    start = disruption.start_minute
    end = start + disruption.downtime_minutes
    windows: list[BlockWindow] = []
    if disruption.preset == "power_outage":
        windows.append(BlockWindow("all_machines", "*", start, min(end, start + 180), "power outage"))
        return windows
    if "machine" in disruption.preset or "grinding" in disruption.preset or "breakdown" in disruption.preset:
        windows.append(BlockWindow("machine", disruption.machine_id, start, end, "simulated grinding breakdown"))
    if "operator" in disruption.preset or "absence" in disruption.preset:
        windows.append(BlockWindow("operator", disruption.operator_id, start, end, "simulated operator absence"))
    return windows


def closed_windows() -> list[tuple[int, int, str]]:
    windows: list[tuple[int, int, str]] = []
    for day in range(14):
        day_start = day * 1440
        if day % 7 == 5:
            windows.append((day_start, day_start + 1440, "weekly closed day"))
            continue
        windows.append((day_start + OPEN_MINUTES_PER_DAY, day_start + 1440, "closed shift"))
    return windows


def interval_overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> int:
    return max(0, min(end_a, end_b) - max(start_a, start_b))


def open_capacity_minutes(machine_count: int) -> int:
    open_minutes = 0
    for day in range(14):
        open_minutes += 0 if day % 7 == 5 else OPEN_MINUTES_PER_DAY
    return open_minutes * machine_count


def solve_schedule(
    data: DemoData,
    *,
    disruption: Disruption | None = None,
    baseline: dict[str, Any] | None = None,
    version: int = 1,
    strategy: Strategy = "cheapest",
    overrides: list[Any] | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    model = cp_model.CpModel()
    operation_by_id = {operation.id: operation for operation in data.operations}
    order_by_id = {order.id: order for order in data.orders}
    baseline_ops = {item["operation_id"]: item for item in (baseline or {}).get("operations", [])}
    machine_intervals: dict[str, list[Any]] = defaultdict(list)
    operator_intervals: dict[str, list[Any]] = defaultdict(list)
    selected_by_op: dict[str, list[tuple[str, str, Any]]] = {}
    starts: dict[str, Any] = {}
    ends: dict[str, Any] = {}

    progress = [
        "Seeded deterministic demo factory",
        f"Loaded {len(data.machines)} machines, {len(data.orders)} orders, {len(data.operations)} operations",
    ]

    for operation in data.operations:
        start_var = model.NewIntVar(0, HORIZON_MINUTES, f"start_{operation.id}")
        end_var = model.NewIntVar(0, HORIZON_MINUTES, f"end_{operation.id}")
        starts[operation.id] = start_var
        ends[operation.id] = end_var
        model.Add(end_var == start_var + operation.duration)
        alternatives: list[Any] = []
        selected_by_op[operation.id] = []
        for machine_id in operation.eligible_machines:
            for operator_id in operation.eligible_operators:
                presence = model.NewBoolVar(f"use_{operation.id}_{machine_id}_{operator_id}")
                interval = model.NewOptionalFixedSizeIntervalVar(start_var, operation.duration, presence, f"int_{operation.id}_{machine_id}_{operator_id}")
                alternatives.append(presence)
                selected_by_op[operation.id].append((machine_id, operator_id, presence))
                machine_intervals[machine_id].append(interval)
                operator_intervals[operator_id].append(interval)
        model.AddExactlyOne(alternatives)

    ops_by_order = defaultdict(list)
    for operation in data.operations:
        ops_by_order[operation.order_id].append(operation)
    for order_id, operations in ops_by_order.items():
        ordered = sorted(operations, key=lambda item: item.sequence)
        model.Add(starts[ordered[0].id] >= order_by_id[order_id].release_minute)
        for previous, current in zip(ordered, ordered[1:]):
            model.Add(starts[current.id] >= ends[previous.id])

    windows = list(data.maintenance) + disruption_windows(disruption)
    for start, end, reason in closed_windows():
        duration = end - start
        for machine in data.machines:
            machine_intervals[machine.id].append(model.NewFixedSizeIntervalVar(start, duration, f"closed_{machine.id}_{start}_{reason}"))
        for operator in data.operators:
            operator_intervals[operator.id].append(model.NewFixedSizeIntervalVar(start, duration, f"closed_{operator.id}_{start}_{reason}"))
    for window in windows:
        fixed = model.NewFixedSizeIntervalVar(window.start, window.end - window.start, f"block_{window.resource_id}_{window.start}")
        if window.resource_type == "all_machines":
            for machine in data.machines:
                machine_intervals[machine.id].append(fixed)
        elif window.resource_type == "machine":
            machine_intervals[window.resource_id].append(fixed)
        else:
            operator_intervals[window.resource_id].append(fixed)

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)
    for intervals in operator_intervals.values():
        model.AddNoOverlap(intervals)

    # 1. Enforce sequence-dependent setup times
    for m in data.machines:
        m_ops = [op for op in data.operations if m.id in op.eligible_machines]
        for i in range(len(m_ops)):
            for j in range(i + 1, len(m_ops)):
                op_i = m_ops[i]
                op_j = m_ops[j]
                
                pres_i_m = [presence for m_id, _, presence in selected_by_op[op_i.id] if m_id == m.id]
                pres_j_m = [presence for m_id, _, presence in selected_by_op[op_j.id] if m_id == m.id]
                
                if not pres_i_m or not pres_j_m:
                    continue
                
                use_i_m = model.NewBoolVar(f"use_{op_i.id}_{m.id}")
                model.Add(use_i_m == sum(pres_i_m))
                
                use_j_m = model.NewBoolVar(f"use_{op_j.id}_{m.id}")
                model.Add(use_j_m == sum(pres_j_m))
                
                before_i_j_m = model.NewBoolVar(f"before_{op_i.id}_{op_j.id}_{m.id}")
                
                setup_i_j = data.setup_matrix.get(op_i.family, {}).get(op_j.family, 0)
                setup_j_i = data.setup_matrix.get(op_j.family, {}).get(op_i.family, 0)
                
                model.Add(starts[op_j.id] >= ends[op_i.id] + setup_i_j).OnlyEnforceIf([use_i_m, use_j_m, before_i_j_m])
                model.Add(starts[op_i.id] >= ends[op_j.id] + setup_j_i).OnlyEnforceIf([use_i_m, use_j_m, before_i_j_m.Not()])

    # 2. Freezing completed and disrupted in-progress work
    cutoff = disruption.start_minute if disruption else 0
    if baseline and disruption:
        for operation in data.operations:
            prev = baseline_ops.get(operation.id)
            if not prev:
                continue
            if prev["end_minute"] <= cutoff:
                # Completed
                model.Add(starts[operation.id] == prev["start_minute"])
                for m_id, o_id, presence in selected_by_op[operation.id]:
                    if m_id == prev["machine_id"] and o_id == prev["operator_id"]:
                        model.Add(presence == 1)
            elif prev["start_minute"] < cutoff < prev["end_minute"]:
                # In progress
                is_disrupted_machine = (
                    "machine" in disruption.preset or "grinding" in disruption.preset or "breakdown" in disruption.preset
                ) and prev["machine_id"] == disruption.machine_id
                is_disrupted_operator = (
                    "operator" in disruption.preset or "absence" in disruption.preset
                ) and prev["operator_id"] == disruption.operator_id
                
                if is_disrupted_machine or is_disrupted_operator:
                    model.Add(starts[operation.id] >= cutoff + disruption.downtime_minutes)
                else:
                    model.Add(starts[operation.id] == prev["start_minute"])
                    for m_id, o_id, presence in selected_by_op[operation.id]:
                        if m_id == prev["machine_id"] and o_id == prev["operator_id"]:
                            model.Add(presence == 1)

    # 3. Enforce Manual Overrides (pinning)
    if overrides:
        for ov in overrides:
            if not ov.active:
                continue
            op = next((o for o in data.operations if o.id == ov.operation_id), None)
            if not op:
                continue
            if ov.pin_type == "first":
                if op.sequence == 1:
                    model.Add(starts[op.id] == order_by_id[op.order_id].release_minute)
                else:
                    prev_op = next((o for o in data.operations if o.order_id == op.order_id and o.sequence == op.sequence - 1), None)
                    if prev_op:
                        model.Add(starts[op.id] == ends[prev_op.id])
            elif ov.pin_type == "machine":
                for m_id, o_id, presence in selected_by_op[op.id]:
                    if m_id != ov.pin_value:
                        model.Add(presence == 0)
            elif ov.pin_type == "operator":
                for m_id, o_id, presence in selected_by_op[op.id]:
                    if o_id != ov.pin_value:
                        model.Add(presence == 0)

    order_completions = {}
    tardiness_vars = []
    weighted_tardiness_terms = []
    for order in data.orders:
        completion = model.NewIntVar(0, HORIZON_MINUTES, f"completion_{order.id}")
        model.AddMaxEquality(completion, [ends[operation.id] for operation in ops_by_order[order.id]])
        tardiness = model.NewIntVar(0, HORIZON_MINUTES, f"tardy_{order.id}")
        model.Add(tardiness >= completion - order.due_minute)
        model.Add(tardiness >= 0)
        order_completions[order.id] = completion
        tardiness_vars.append(tardiness)
        weighted_tardiness_terms.append(tardiness * order.penalty_per_hour * order.priority)

    makespan = model.NewIntVar(0, HORIZON_MINUTES, "makespan")
    model.AddMaxEquality(makespan, list(ends.values()))
    move_terms = []
    if baseline:
        for operation in data.operations:
            previous = baseline_ops.get(operation.id)
            if not previous:
                continue
            for machine_id, operator_id, presence in selected_by_op[operation.id]:
                if machine_id != previous["machine_id"]:
                    move_terms.append(presence * STABILITY_COST_PER_MOVE)
                if operator_id != previous["operator_id"]:
                    move_terms.append(presence * (STABILITY_COST_PER_MOVE // 2))
            shift = model.NewIntVar(0, HORIZON_MINUTES, f"shift_{operation.id}")
            model.AddAbsEquality(shift, starts[operation.id] - int(previous["start_minute"]))
            move_terms.append(shift)

    load_terms_by_machine = {}
    for machine in data.machines:
        terms = []
        for operation in data.operations:
            for machine_id, _, presence in selected_by_op[operation.id]:
                if machine_id == machine.id:
                    terms.append(presence * operation.duration)
        load = model.NewIntVar(0, HORIZON_MINUTES, f"load_{machine.id}")
        model.Add(load == sum(terms) if terms else 0)
        load_terms_by_machine[machine.id] = load
    max_machine_load = model.NewIntVar(0, HORIZON_MINUTES, "max_machine_load")
    model.AddMaxEquality(max_machine_load, list(load_terms_by_machine.values()))

    weights = {
        "cheapest": (9, 2, 1, 1),
        "on_time": (20, 1, 1, 1),
        "robust": (12, 2, 7, 8),
    }[strategy]
    objective = (
        weights[0] * sum(weighted_tardiness_terms)
        + weights[1] * makespan
        + weights[2] * (sum(move_terms) if move_terms else 0)
        + weights[3] * max_machine_load
    )
    model.Minimize(objective)
    progress.append("Built CP-SAT interval model with machine, operator, precedence, material, shift, maintenance and disruption constraints")

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0 if strategy != "robust" else 12.0
    solver.parameters.random_seed = 11
    status_code = solver.Solve(model)
    status = solver.StatusName(status_code)
    progress.append(f"Solver returned {status}")

    if status_code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        issues = explain_infeasibility(data, overrides or [], disruption)
        validation = {"valid": False, "checks": {k: False for k in ("precedence", "machine_capacity", "operators", "shifts", "maintenance", "downtime", "material", "quantities", "no_overlaps")}, "issues": issues}
        return {
            "plan_version": f"V{version:03d}",
            "schedule_version": version,
            "strategy": strategy,
            "solver": "CP-SAT",
            "solver_status": status,
            "solve_time": round(time.perf_counter() - started, 3),
            "objective": 0,
            "feasible": False,
            "validated": False,
            "validation": validation,
            "operations": [],
            "orders": [],
            "machines": [machine.__dict__ for machine in data.machines],
            "operators": [operator.__dict__ for operator in data.operators],
            "kpis": {
                "orders": len(data.orders),
                "operations": len(data.operations),
                "on_time": 0.0,
                "late_orders": len(data.orders),
                "late_minutes": 0,
                "overtime_minutes": 0,
                "overtime": 0,
                "penalty": 0,
                "total_cost": 0,
                "utilization": 0.0,
                "grinding_utilization": 0.0,
                "bottleneck": "-",
                "at_risk": len(data.orders),
                "changeover_minutes": 0,
                "changeover_hours": 0.0,
                "robustness_score": 0.0,
                "capacity_by_center": {},
            },
            "changes": empty_changes(),
            "recommendation": {
                "recommended_schedule": "Solver Infeasible",
                "why": issues,
                "financial_impact": 0,
                "affected_customer": "-",
                "owner_action": "Resolve manual override conflicts and rerun the replanner.",
                "phone_call_recommendation": {
                    "call_required": False,
                    "customer": "-",
                    "reason": "Solver is infeasible due to conflicting constraints."
                }
            },
            "solver_health": {
                "solver": "CP-SAT",
                "status": status,
                "solve_time": time.perf_counter() - started,
                "objective": 0,
                "constraints": len(str(model.Proto().constraints).split("\n")),
                "decision_variables": len(model.Proto().variables),
                "operations": len(data.operations),
                "machines": len(data.machines),
                "orders": len(data.orders),
                "validation": validation,
                "schedule_changes": 0,
                "baseline_objective": 0,
                "replanned_objective": 0,
            },
            "progress": progress + [f"Solver failed: {issues}"],
        }

    scheduled = []
    for operation in data.operations:
        selected_machine = ""
        selected_operator = ""
        for machine_id, operator_id, presence in selected_by_op[operation.id]:
            if solver.BooleanValue(presence):
                selected_machine = machine_id
                selected_operator = operator_id
                break
        start_minute = int(solver.Value(starts[operation.id]))
        end_minute = int(solver.Value(ends[operation.id]))
        order = order_by_id[operation.order_id]
        scheduled.append(
            {
                "operation_id": operation.id,
                "order_id": operation.order_id,
                "sequence": operation.sequence,
                "operation": operation.name,
                "part": order.part,
                "customer": order.customer,
                "family": operation.family,
                "quantity": operation.quantity,
                "work_center": operation.center,
                "machine_id": selected_machine,
                "operator_id": selected_operator,
                "operator": next(item.name for item in data.operators if item.id == selected_operator),
                "start_minute": start_minute,
                "end_minute": end_minute,
                "start": iso(start_minute),
                "end": iso(end_minute),
                "duration": operation.duration,
                "setup": operation.setup,
                "due_minute": order.due_minute,
                "due": iso(order.due_minute),
                "status": "scheduled",
            }
        )
    scheduled.sort(key=lambda item: (item["start_minute"], item["machine_id"], item["operation_id"]))

    validation = validate_schedule(data, scheduled, disruption)
    metrics = calculate_metrics(data, scheduled)
    changes = compare_schedules((baseline or {}).get("operations", []), scheduled, data) if baseline else empty_changes()
    solve_time = time.perf_counter() - started
    solver_health = {
        "solver": "CP-SAT",
        "status": status,
        "solve_time": solve_time,
        "objective": int(solver.ObjectiveValue()) if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0,
        "constraints": len(str(model.Proto().constraints).split("\n")),
        "decision_variables": len(model.Proto().variables),
        "operations": len(data.operations),
        "machines": len(data.machines),
        "orders": len(data.orders),
        "validation": validation,
        "schedule_changes": changes["operations_moved"],
        "baseline_objective": (baseline or {}).get("solver_health", {}).get("objective", 0),
        "replanned_objective": int(solver.ObjectiveValue()) if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0,
    }
    version_label = f"V{version:03d}"
    progress.append(f"Validated schedule {version_label}: {'valid' if validation['valid'] else 'invalid'}")
    recommendation = build_recommendation(data, metrics, changes, scheduled, baseline, disruption)
    return {
        "plan_version": version_label,
        "schedule_version": version,
        "strategy": strategy,
        "solver": "CP-SAT",
        "solver_status": status,
        "solve_time": round(solve_time, 3),
        "objective": solver_health["objective"],
        "feasible": status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE),
        "validated": validation["valid"],
        "validation": validation,
        "operations": scheduled,
        "orders": serialize_orders(data.orders, scheduled),
        "machines": [machine.__dict__ for machine in data.machines],
        "operators": [operator.__dict__ for operator in data.operators],
        "kpis": metrics,
        "changes": changes,
        "recommendation": recommendation,
        "solver_health": solver_health,
        "progress": progress,
        "demo_data": {
            "maintenance_windows": [window.__dict__ for window in data.maintenance],
            "historical_breakdowns": data.breakdown_history,
            "quality_events": data.quality_events,
            "material_constraints": data.material_constraints,
            "setup_matrix": data.setup_matrix,
        },
    }


def serialize_orders(orders: list[Order], scheduled: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_order = defaultdict(list)
    for operation in scheduled:
        by_order[operation["order_id"]].append(operation)
    result = []
    for order in orders:
        completion = max(item["end_minute"] for item in by_order[order.id])
        late_minutes = max(0, completion - order.due_minute)
        result.append(
            {
                "id": order.id,
                "customer": order.customer,
                "part": order.part,
                "family": order.family,
                "quantity": order.quantity,
                "due": iso(order.due_minute),
                "completion": iso(completion),
                "late_minutes": late_minutes,
                "penalty": penalty_for_order(order, completion),
                "priority": order.priority,
            }
        )
    return sorted(result, key=lambda item: (-item["late_minutes"], item["due"]))


def penalty_for_order(order: Order, completion_minute: int) -> int:
    late_minutes = max(0, completion_minute - order.due_minute)
    return math.ceil(late_minutes / 60) * order.penalty_per_hour


def calculate_metrics(data: DemoData, scheduled: list[dict[str, Any]]) -> dict[str, Any]:
    order_by_id = {order.id: order for order in data.orders}
    machine_by_id = {machine.id: machine for machine in data.machines}
    by_order = defaultdict(list)
    by_center_duration = defaultdict(int)
    for operation in scheduled:
        by_order[operation["order_id"]].append(operation)
        by_center_duration[operation["work_center"]] += operation["duration"]
    completions = {order_id: max(item["end_minute"] for item in items) for order_id, items in by_order.items()}
    late_orders = [order_id for order_id, completion in completions.items() if completion > order_by_id[order_id].due_minute]
    total_late_minutes = sum(max(0, completion - order_by_id[order_id].due_minute) for order_id, completion in completions.items())
    penalties = sum(penalty_for_order(order_by_id[order_id], completion) for order_id, completion in completions.items())
    overtime_minutes = sum(overtime_overlap(item["start_minute"], item["end_minute"]) for item in scheduled)
    overtime_cost = math.ceil(overtime_minutes / 60) * OVERTIME_COST_PER_HOUR
    capacity = open_capacity_minutes(len(data.machines))
    utilization = round(sum(item["duration"] for item in scheduled) / capacity * 100, 1)
    grind_machines = [machine.id for machine in data.machines if machine.center == "GRIND"]
    grind_capacity = open_capacity_minutes(len(grind_machines))
    grinding_utilization = round(
        sum(item["duration"] for item in scheduled if item["machine_id"] in grind_machines) / grind_capacity * 100,
        1,
    )
    center_capacities = {
        center: open_capacity_minutes(len([machine for machine in data.machines if machine.center == center]))
        for center in {machine.center for machine in data.machines}
    }
    center_utils = {center: by_center_duration[center] / capacity for center, capacity in center_capacities.items() if capacity}
    bottleneck_center = max(center_utils.items(), key=lambda item: item[1])[0]
    changeover_minutes = calculate_changeovers(data, scheduled)
    total_cost = penalties + overtime_cost + math.ceil(changeover_minutes / 60) * CHANGEOVER_COST_PER_HOUR
    at_risk = [
        order_id
        for order_id, completion in completions.items()
        if completion > order_by_id[order_id].due_minute - 12 * 60
    ]
    slack_minutes = [order_by_id[order_id].due_minute - completion for order_id, completion in completions.items()]
    robustness = max(0, min(100, round((sum(max(-720, min(1440, slack)) for slack in slack_minutes) / len(slack_minutes) + 720) / 21.6, 1)))
    return {
        "orders": len(data.orders),
        "operations": len(scheduled),
        "on_time": round((len(data.orders) - len(late_orders)) / len(data.orders) * 100, 1),
        "late_orders": len(late_orders),
        "late_minutes": total_late_minutes,
        "overtime_minutes": overtime_minutes,
        "overtime": overtime_cost,
        "penalty": penalties,
        "total_cost": total_cost,
        "utilization": utilization,
        "grinding_utilization": grinding_utilization,
        "bottleneck": bottleneck_center,
        "at_risk": len(at_risk),
        "changeover_minutes": changeover_minutes,
        "changeover_hours": round(changeover_minutes / 60, 1),
        "robustness_score": robustness,
        "capacity_by_center": {center: round(value * 100, 1) for center, value in center_utils.items()},
    }


def overtime_overlap(start: int, end: int) -> int:
    total = 0
    for day in range(14):
        if day % 7 == 5:
            continue
        day_start = day * 1440
        total += interval_overlap(start, end, day_start + REGULAR_MINUTES_PER_DAY, day_start + OPEN_MINUTES_PER_DAY)
    return total


def calculate_changeovers(data: DemoData, scheduled: list[dict[str, Any]]) -> int:
    by_machine = defaultdict(list)
    for operation in scheduled:
        by_machine[operation["machine_id"]].append(operation)
    total = 0
    for operations in by_machine.values():
        ordered = sorted(operations, key=lambda item: item["start_minute"])
        for previous, current in zip(ordered, ordered[1:]):
            total += data.setup_matrix[previous["family"]][current["family"]]
    return total


def validate_schedule(data: DemoData, scheduled: list[dict[str, Any]], disruption: Disruption | None = None) -> dict[str, Any]:
    checks = {
        "precedence": True,
        "machine_capacity": True,
        "operators": True,
        "shifts": True,
        "maintenance": True,
        "downtime": True,
        "material": True,
        "quantities": True,
        "no_overlaps": True,
    }
    issues: list[str] = []
    by_order = defaultdict(list)
    by_machine = defaultdict(list)
    by_operator = defaultdict(list)
    order_by_id = {order.id: order for order in data.orders}
    for item in scheduled:
        by_order[item["order_id"]].append(item)
        by_machine[item["machine_id"]].append(item)
        by_operator[item["operator_id"]].append(item)
        if item["quantity"] <= 0:
            checks["quantities"] = False
            issues.append(f"{item['operation_id']} has invalid quantity")
        if overlaps_any_closed(item["start_minute"], item["end_minute"]):
            checks["shifts"] = False
            issues.append(f"{item['operation_id']} overlaps closed shift time")
    for order_id, operations in by_order.items():
        ordered = sorted(operations, key=lambda item: item["sequence"])
        if ordered[0]["start_minute"] < order_by_id[order_id].release_minute:
            checks["material"] = False
            issues.append(f"{order_id} starts before material release")
        for previous, current in zip(ordered, ordered[1:]):
            if current["start_minute"] < previous["end_minute"]:
                checks["precedence"] = False
                issues.append(f"{order_id} breaks operation precedence")
    for resource_name, grouped, check_name in (("machine", by_machine, "machine_capacity"), ("operator", by_operator, "operators")):
        for resource_id, operations in grouped.items():
            ordered = sorted(operations, key=lambda item: item["start_minute"])
            for previous, current in zip(ordered, ordered[1:]):
                if current["start_minute"] < previous["end_minute"]:
                    checks[check_name] = False
                    checks["no_overlaps"] = False
                    issues.append(f"{resource_name} {resource_id} has overlap")
    block_windows = list(data.maintenance) + disruption_windows(disruption)
    for item in scheduled:
        for window in block_windows:
            applies = (
                window.resource_type == "all_machines"
                or (window.resource_type == "machine" and window.resource_id == item["machine_id"])
                or (window.resource_type == "operator" and window.resource_id == item["operator_id"])
            )
            if applies and interval_overlap(item["start_minute"], item["end_minute"], window.start, window.end):
                check = "maintenance" if window in data.maintenance else "downtime"
                checks[check] = False
                issues.append(f"{item['operation_id']} overlaps {window.reason}")
    return {"valid": all(checks.values()), "checks": checks, "issues": issues}


def overlaps_any_closed(start: int, end: int) -> bool:
    return any(interval_overlap(start, end, closed_start, closed_end) for closed_start, closed_end, _ in closed_windows())


def empty_changes() -> dict[str, Any]:
    return {
        "operations_moved": 0,
        "machines_changed": 0,
        "operators_changed": 0,
        "jobs_delayed": 0,
        "jobs_pulled_forward": 0,
        "additional_overtime": 0,
        "additional_changeovers": 0,
        "penalty_difference": 0,
        "total_cost_difference": 0,
        "cost_delta": 0,
        "moved_operations": [],
    }


def compare_schedules(old_operations: list[dict[str, Any]], new_operations: list[dict[str, Any]], data: DemoData) -> dict[str, Any]:
    if not old_operations:
        return empty_changes()
    old = {item["operation_id"]: item for item in old_operations}
    new = {item["operation_id"]: item for item in new_operations}
    moved = []
    machines_changed = 0
    operators_changed = 0
    jobs_delayed = 0
    jobs_pulled = 0
    for operation_id, current in new.items():
        previous = old.get(operation_id)
        if not previous:
            moved.append({"operation_id": operation_id, "reason": "added operation", "delta_minutes": current["duration"]})
            jobs_delayed += 1
            continue
        delta = current["start_minute"] - previous["start_minute"]
        machine_changed = current["machine_id"] != previous["machine_id"]
        operator_changed = current["operator_id"] != previous["operator_id"]
        if abs(delta) >= 15 or machine_changed or operator_changed:
            moved.append(
                {
                    "operation_id": operation_id,
                    "order_id": current["order_id"],
                    "part": current["part"],
                    "from": human_time(previous["start_minute"]),
                    "to": human_time(current["start_minute"]),
                    "delta_minutes": delta,
                    "machine_from": previous["machine_id"],
                    "machine_to": current["machine_id"],
                    "operator_from": previous["operator"],
                    "operator_to": current["operator"],
                }
            )
        if machine_changed:
            machines_changed += 1
        if operator_changed:
            operators_changed += 1
        if delta > 15:
            jobs_delayed += 1
        elif delta < -15:
            jobs_pulled += 1
    old_metrics = calculate_metrics(data, old_operations)
    new_metrics = calculate_metrics(data, new_operations)
    disruption_execution_cost = len(moved) * STABILITY_COST_PER_MOVE
    cost_difference = new_metrics["total_cost"] - old_metrics["total_cost"] + disruption_execution_cost
    return {
        "operations_moved": len(moved),
        "machines_changed": machines_changed,
        "operators_changed": operators_changed,
        "jobs_delayed": jobs_delayed,
        "jobs_pulled_forward": jobs_pulled,
        "additional_overtime": new_metrics["overtime"] - old_metrics["overtime"],
        "additional_changeovers": round((new_metrics["changeover_minutes"] - old_metrics["changeover_minutes"]) / 60, 1),
        "penalty_difference": new_metrics["penalty"] - old_metrics["penalty"],
        "execution_cost": disruption_execution_cost,
        "total_cost_difference": cost_difference,
        "cost_delta": cost_difference,
        "moved_operations": moved[:18],
    }


def analyze_disruption_impact(baseline: dict[str, Any], data: DemoData, disruption: Disruption) -> dict[str, Any]:
    impacted = [dict(item) for item in baseline["operations"]]
    block_windows = disruption_windows(disruption)
    order_available = defaultdict(int)
    machine_available = defaultdict(int)
    operator_available = defaultdict(int)
    affected_operation_ids = set()
    affected_order_ids = set()
    for operation in sorted(impacted, key=lambda item: item["start_minute"]):
        start = operation["start_minute"]
        for window in block_windows:
            applies = (
                window.resource_type == "all_machines"
                or (window.resource_type == "machine" and window.resource_id == operation["machine_id"])
                or (window.resource_type == "operator" and window.resource_id == operation["operator_id"])
            )
            if applies and interval_overlap(start, operation["end_minute"], window.start, window.end):
                start = max(start, window.end)
                affected_operation_ids.add(operation["operation_id"])
                affected_order_ids.add(operation["order_id"])
        start = max(start, order_available[operation["order_id"]], machine_available[operation["machine_id"]], operator_available[operation["operator_id"]])
        if start != operation["start_minute"]:
            affected_operation_ids.add(operation["operation_id"])
            affected_order_ids.add(operation["order_id"])
        operation["start_minute"] = start
        operation["end_minute"] = start + operation["duration"]
        operation["start"] = iso(operation["start_minute"])
        operation["end"] = iso(operation["end_minute"])
        order_available[operation["order_id"]] = operation["end_minute"]
        machine_available[operation["machine_id"]] = operation["end_minute"]
        operator_available[operation["operator_id"]] = operation["end_minute"]
    before = baseline["kpis"]
    after = calculate_metrics(data, impacted)
    affected_centers = defaultdict(int)
    for operation in impacted:
        if operation["operation_id"] in affected_operation_ids:
            affected_centers[operation["work_center"]] += operation["duration"]
    bottleneck_impact = max(affected_centers.items(), key=lambda item: item[1])[0] if affected_centers else baseline["kpis"]["bottleneck"]
    return {
        "headline": "If we do nothing...",
        "affected_orders": len(affected_order_ids),
        "affected_order_ids": sorted(affected_order_ids),
        "affected_operations": len(affected_operation_ids),
        "expected_late_orders": after["late_orders"],
        "expected_late_minutes": after["late_minutes"],
        "expected_penalties": after["penalty"],
        "expected_overtime": after["overtime"],
        "bottleneck_impact": bottleneck_impact,
        "penalty_delta": after["penalty"] - before["penalty"],
        "overtime_delta": after["overtime"] - before["overtime"],
        "do_nothing_total_cost": after["total_cost"],
        "simulated_schedule": impacted,
    }


def build_recommendation(
    data: DemoData,
    metrics: dict[str, Any],
    changes: dict[str, Any],
    scheduled: list[dict[str, Any]],
    baseline: dict[str, Any] | None,
    disruption: Disruption | None,
) -> dict[str, Any]:
    orders = serialize_orders(data.orders, scheduled)
    most_expensive = max(orders, key=lambda item: item["penalty"])
    affected_customer = most_expensive["customer"] if most_expensive["penalty"] else orders[0]["customer"]
    phone_call = most_expensive["penalty"] > 0 or changes["penalty_difference"] > 0
    why = [
        f"{metrics['bottleneck']} remains the capacity constraint",
        f"{changes['operations_moved']} operations moved to avoid {metrics['late_minutes']} late minutes",
        f"Validated against machines, operators, materials, downtime, maintenance and precedence",
    ]
    if disruption:
        why.insert(0, f"Disruption blocks {disruption.machine_id} from {human_time(disruption.start_minute)} to {human_time(disruption.start_minute + disruption.downtime_minutes)}")
    owner_action = "Authorize controlled overtime and release the validated replanned dispatch list."
    if metrics["penalty"] > 0:
        owner_action = "Approve overtime on grinding and personally align the highest-risk customer delivery window."
    return {
        "recommended_schedule": "Use the replanned schedule" if baseline else "Use the generated baseline schedule",
        "why": why,
        "financial_impact": changes["total_cost_difference"] if baseline else metrics["total_cost"],
        "affected_customer": affected_customer,
        "owner_action": owner_action,
        "phone_call_recommendation": {
            "call_required": phone_call,
            "customer": affected_customer,
            "reason": (
                f"{most_expensive['id']} carries Rs {most_expensive['penalty']:,} penalty exposure after replanning"
                if phone_call
                else "No customer escalation is needed because all high-priority orders remain inside their promise window"
            ),
        },
    }


def explain_infeasibility(data: DemoData, overrides: list[Any], disruption: Disruption | None) -> list[str]:
    issues = []
    for ov in overrides:
        if not ov.active:
            continue
        op = next((o for o in data.operations if o.id == ov.operation_id), None)
        if not op:
            continue
        if ov.pin_type == "machine" and ov.pin_value not in op.eligible_machines:
            issues.append(f"Operation {op.id} pinned to ineligible machine {ov.pin_value}. Eligible: {op.eligible_machines}")
        if ov.pin_type == "operator" and ov.pin_value not in op.eligible_operators:
            issues.append(f"Operation {op.id} pinned to unqualified operator {ov.pin_value}. Qualified: {op.eligible_operators}")
        
        if ov.pin_type == "first" and op.sequence == 1:
            order = next((ord for ord in data.orders if ord.id == op.order_id), None)
            if order and order.release_minute > 0:
                issues.append(f"Order {order.id} is pinned first but material is delayed until {human_time(order.release_minute)}")
                
        if disruption:
            windows = disruption_windows(disruption)
            for window in windows:
                if window.resource_type == "machine" and ov.pin_type == "machine" and ov.pin_value == window.resource_id:
                    issues.append(f"Operation {op.id} pinned to machine {ov.pin_value} which is down from {human_time(window.start)} to {human_time(window.end)}")
                if window.resource_type == "operator" and ov.pin_type == "operator" and ov.pin_value == window.resource_id:
                    issues.append(f"Operation {op.id} pinned to operator {ov.pin_value} who is absent from {human_time(window.start)} to {human_time(window.end)}")
    
    if not issues:
        issues.append("Solver infeasible: conflicting manual overrides or extreme capacity constraint overlap.")
    return issues


def explain_order_schedule(order_id: str, scheduled: list[dict[str, Any]], data: DemoData) -> dict[str, Any]:
    order = next((o for o in data.orders if o.id == order_id), None)
    if not order:
        return {"order_id": order_id, "explanation": ["Order not found."]}
        
    ops = [op for op in scheduled if op["order_id"] == order_id]
    ops.sort(key=lambda x: x["sequence"])
    
    explanation_steps = []
    tier_desc = "Tier-1 JIT customer" if "Apex" in order.customer else "Standard customer"
    explanation_steps.append(f"{tier_desc} order with priority level {order.priority}/6.")
    explanation_steps.append(f"Released at {human_time(order.release_minute)} and due at {human_time(order.due_minute)}.")
    
    for op in ops:
        explanation_steps.append(
            f"OP{op['sequence']:02d} ({op['operation']}) scheduled on {op['machine_id']} under {op['operator']} "
            f"from {human_time(op['start_minute'])} to {human_time(op['end_minute'])}."
        )
        
        mach_ops = [x for x in scheduled if x["machine_id"] == op["machine_id"] and x["start_minute"] < op["start_minute"]]
        if mach_ops:
            prev_job = max(mach_ops, key=lambda x: x["start_minute"])
            if prev_job["family"] == op["family"]:
                explanation_steps.append(
                    f"  - Setup savings: Runs after {prev_job['order_id']} (same family: {op['family']}), saving setup time."
                )
            else:
                explanation_steps.append(
                    f"  - Setup needed: Runs after {prev_job['order_id']} (different family), requiring setup changeover."
                )
        else:
            explanation_steps.append(f"  - First job on machine {op['machine_id']}.")
            
        if op["work_center"] == "GRIND":
            explanation_steps.append(
                f"  - Bottleneck step: Grinding is the critical cell (utilization is high). Scheduled as early as possible."
            )
            
    completion_minute = max(x["end_minute"] for x in ops) if ops else 0
    total_penalty = penalty_for_order(order, completion_minute)
    if total_penalty > 0:
        explanation_steps.append(f"Suffer Rs {total_penalty:,} penalty because of machine/operator capacity bottleneck constraints.")
    else:
        explanation_steps.append("Completed before due date. High-risk penalty avoided.")
        
    return {
        "order_id": order_id,
        "customer": order.customer,
        "part": order.part,
        "due": human_time(order.due_minute),
        "completion": human_time(max(x["end_minute"] for x in ops)) if ops else "-",
        "explanation": explanation_steps
    }


class DemoScheduler:
    def __init__(self) -> None:
        self.state = DemoState()
        self.reset()

    def reset(self) -> dict[str, Any]:
        data = build_demo_data()
        with SessionLocal() as session:
            seed_db(session, data)
        baseline = solve_schedule(data, version=1, strategy="cheapest")
        
        # Save baseline to DB
        store = SqlAlchemyPlanStore()
        store.save_plan("V001", "baseline", baseline)
        
        self.state = DemoState(baseline=baseline, current=baseline, disruption=None, scenario_history=[], version_counter=1)
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        return {
            **(self.state.current or self.state.baseline or {}),
            "mode": "demo",
            "disruption": self.state.disruption.__dict__ if self.state.disruption else None,
            "scenario_history": self.state.scenario_history,
        }

    def make_disruption(self, payload: dict[str, Any] | None = None) -> Disruption:
        payload = payload or {}
        preset = payload.get("preset", "combined_grinding_breakdown_operator_absence")
        duration_by_preset = {
            "grinding_down_8": 8 * 60,
            "grinding_down_12": 12 * 60,
            "grinding_operator_absent": 8 * 60,
            "material_delayed_12": 0,
            "rework_50": 0,
            "power_outage": 180,
            "combined_grinding_breakdown_operator_absence": 8 * 60,
        }
        return Disruption(
            preset=preset,
            machine_id=payload.get("machine_id", "GRIND-G02"),
            operator_id=payload.get("operator_id", "OP-GRIND-2"),
            start_minute=int(payload.get("start_minute", 5 * 60)),
            downtime_minutes=int(payload.get("downtime_minutes", duration_by_preset.get(preset, 8 * 60))),
            material_delay_minutes=12 * 60 if preset == "material_delayed_12" else int(payload.get("material_delay_minutes", 0)),
            rework_quantity=50 if preset == "rework_50" else int(payload.get("rework_quantity", 0)),
        )

    def impact(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        disruption = self.make_disruption(payload)
        data = build_demo_data(disruption)
        assert self.state.baseline is not None
        impact = analyze_disruption_impact(self.state.baseline, data, disruption)
        self.state.disruption = disruption
        return {"disruption": disruption.__dict__, "impact": impact}

    def replan(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        disruption = self.make_disruption(payload) if payload else self.state.disruption or self.make_disruption()
        data = build_demo_data(disruption)
        assert self.state.baseline is not None
        
        # Fetch active overrides
        with SessionLocal() as session:
            overrides = session.query(ManualOverride).filter(ManualOverride.active == True).all()
            session.expunge_all()
            
        self.state.version_counter += 1
        plan = solve_schedule(
            data,
            disruption=disruption,
            baseline=self.state.baseline,
            version=self.state.version_counter,
            strategy=payload.get("strategy", "cheapest") if payload else "cheapest",
            overrides=overrides,
        )
        
        # Save plan to DB if feasible
        if plan["feasible"]:
            store = SqlAlchemyPlanStore()
            store.save_plan(plan["plan_version"], disruption.preset, plan)
            
        impact = analyze_disruption_impact(self.state.baseline, data, disruption)
        self.state.current = plan
        self.state.disruption = disruption
        
        if plan["feasible"]:
            self.state.scenario_history.append(
                {
                    "plan_version": plan["plan_version"],
                    "preset": disruption.preset,
                    "cost_delta": plan["changes"]["total_cost_difference"],
                    "validated": plan["validated"],
                }
            )
        return {**plan, "impact": impact, "mode": "demo", "disruption": disruption.__dict__, "scenario_history": self.state.scenario_history}

    def validate_current(self) -> dict[str, Any]:
        data = build_demo_data(self.state.disruption)
        current = self.state.current or self.state.baseline
        assert current is not None
        return validate_schedule(data, current["operations"], self.state.disruption)

    def compare_strategies(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        disruption = self.make_disruption(payload) if payload else self.state.disruption or self.make_disruption()
        data = build_demo_data(disruption)
        assert self.state.baseline is not None
        
        # Fetch active overrides
        with SessionLocal() as session:
            overrides = session.query(ManualOverride).filter(ManualOverride.active == True).all()
            session.expunge_all()
            
        plans = [
            solve_schedule(data, disruption=disruption, baseline=self.state.baseline, version=90 + index, strategy=strategy, overrides=overrides)
            for index, strategy in enumerate(("cheapest", "on_time", "robust"), start=1)
        ]
        summary = []
        for plan in plans:
            summary.append(
                {
                    "strategy": plan["strategy"],
                    "total_cost": plan["kpis"]["total_cost"],
                    "penalties": plan["kpis"]["penalty"],
                    "overtime": plan["kpis"]["overtime"],
                    "on_time": plan["kpis"]["on_time"],
                    "changeover_hours": plan["kpis"]["changeover_hours"],
                    "bottleneck_utilization": plan["kpis"]["grinding_utilization"],
                    "robustness_score": plan["kpis"]["robustness_score"],
                    "solver_status": plan["solver_status"],
                    "validated": plan["validated"],
                }
            )
        cheapest = min(summary, key=lambda item: item["total_cost"])
        best_service = max(summary, key=lambda item: (item["on_time"], -item["penalties"]))
        robust = max(summary, key=lambda item: item["robustness_score"])
        recommendation = (
            "Choose Most On-Time when Apex Auto delivery confidence is the business priority."
            if best_service["strategy"] != cheapest["strategy"]
            else "Choose Cheapest when cash cost is the priority; it also preserves the best service level in this scenario."
        )
        if robust["robustness_score"] - cheapest["robustness_score"] > 8:
            recommendation = "Choose Most Robust if another grinding interruption is likely; it buys slack at a visible cost."
        return {"disruption": disruption.__dict__, "plans": plans, "summary": summary, "recommendation": recommendation}
