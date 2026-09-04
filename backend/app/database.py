from __future__ import annotations

import json
import os
import socket
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/spw_scheduler")

def check_postgres_available(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except Exception:
        return False

import shutil

# Detect Postgres, fallback to SQLite if offline
IS_POSTGRES = check_postgres_available(DATABASE_URL)
if not IS_POSTGRES:
    if os.getenv("VERCEL") == "1":
        src_db = os.path.join(os.path.dirname(__file__), "..", "spw_scheduler.db")
        tmp_db = "/tmp/spw_scheduler.db"
        if os.path.exists(src_db):
            try:
                shutil.copy2(src_db, tmp_db)
            except Exception:
                pass
        DATABASE_URL = f"sqlite:///{tmp_db}"
    else:
        DATABASE_URL = "sqlite:///spw_scheduler.db"

class Base(DeclarativeBase):
    pass

# --- DOMAIN MODELS ---

class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, default=3)

class Part(Base):
    __tablename__ = "parts"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    family: Mapped[str] = mapped_column(String(50), nullable=False)

class PartFamily(Base):
    __tablename__ = "part_families"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

class Machine(Base):
    __tablename__ = "machines"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    center: Mapped[str] = mapped_column(String(50), nullable=False)
    hourly_cost: Mapped[float] = mapped_column(Float, default=150.0)
    overtime_cost: Mapped[float] = mapped_column(Float, default=250.0)
    efficiency: Mapped[float] = mapped_column(Float, default=1.0)
    status: Mapped[str] = mapped_column(String(50), default="active")

class MachineCapability(Base):
    __tablename__ = "machine_capabilities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(String(50), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False)
    work_center: Mapped[str] = mapped_column(String(50), nullable=False)

class Operator(Base):
    __tablename__ = "operators"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    shift: Mapped[str] = mapped_column(String(50), default="A")
    skill_level: Mapped[str] = mapped_column(String(50), default="qualified")
    overtime_eligible: Mapped[bool] = mapped_column(Boolean, default=True)

class OperatorSkill(Base):
    __tablename__ = "operator_skills"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(String(50), ForeignKey("operators.id", ondelete="CASCADE"), nullable=False)
    work_center: Mapped[str] = mapped_column(String(50), nullable=False)

class Shift(Base):
    __tablename__ = "shifts"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_time: Mapped[str] = mapped_column(String(20), nullable=False)
    end_time: Mapped[str] = mapped_column(String(20), nullable=False)

class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(String(50), ForeignKey("operators.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[str] = mapped_column(String(20), nullable=False)
    shift_id: Mapped[str] = mapped_column(String(50), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False)

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    customer: Mapped[str] = mapped_column(String(100), nullable=False)
    part: Mapped[str] = mapped_column(String(100), nullable=False)
    family: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    release_minute: Mapped[int] = mapped_column(Integer, default=0)
    due_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    penalty_per_hour: Mapped[int] = mapped_column(Integer, default=1000)
    priority: Mapped[int] = mapped_column(Integer, default=3)
    status: Mapped[str] = mapped_column(String(50), default="open")

class OrderOperation(Base):
    __tablename__ = "order_operations"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(50), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    work_center: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    setup: Mapped[int] = mapped_column(Integer, nullable=False)

class SetupMatrix(Base):
    __tablename__ = "setup_matrix"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_family: Mapped[str] = mapped_column(String(50), nullable=False)
    to_family: Mapped[str] = mapped_column(String(50), nullable=False)
    setup_time: Mapped[int] = mapped_column(Integer, nullable=False)

class MachineCalendar(Base):
    __tablename__ = "machine_calendars"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(String(50), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False)
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    end_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="open")

class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(String(50), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False)
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    end_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)

class Breakdown(Base):
    __tablename__ = "breakdowns"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(String(50), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False)
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

class MaterialConstraint(Base):
    __tablename__ = "material_constraints"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(String(50), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    material_name: Mapped[str] = mapped_column(String(100), nullable=False)
    arrival_minute: Mapped[int] = mapped_column(Integer, nullable=False)

class QualityEvent(Base):
    __tablename__ = "quality_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(String(50), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    operation_name: Mapped[str] = mapped_column(String(100), nullable=False)
    scrap_ppm: Mapped[int] = mapped_column(Integer, default=0)
    action: Mapped[str] = mapped_column(String(200), nullable=False)

class ReworkOrder(Base):
    __tablename__ = "rework_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    original_order_id: Mapped[str] = mapped_column(String(50), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    rework_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    operation_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")

# --- SCHEDULING & PERSISTENCE MODELS ---

class Schedule(Base):
    __tablename__ = "schedules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_version: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[str] = mapped_column(String(50), default="system")
    trigger_event: Mapped[str] = mapped_column(String(100), default="initial")
    status: Mapped[str] = mapped_column(String(50), default="active")
    objective_value: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

class ScheduleOperation(Base):
    __tablename__ = "schedule_operations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False)
    operation_id: Mapped[str] = mapped_column(String(80), nullable=False)
    machine_id: Mapped[str] = mapped_column(String(50), nullable=False)
    operator_id: Mapped[str] = mapped_column(String(50), nullable=False)
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    end_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    setup_duration: Mapped[int] = mapped_column(Integer, default=0)
    production_duration: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="scheduled")

class ScheduleVersion(Base):
    __tablename__ = "schedule_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    trigger_event: Mapped[str] = mapped_column(String(100), default="baseline")
    solver_status: Mapped[str] = mapped_column(String(50), default="FEASIBLE")
    objective_value: Mapped[int] = mapped_column(Integer, default=0)

class DisruptionEvent(Base):
    __tablename__ = "disruption_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    preset: Mapped[str] = mapped_column(String(80), nullable=False)
    machine_id: Mapped[str] = mapped_column(String(50), nullable=True)
    operator_id: Mapped[str] = mapped_column(String(50), nullable=True)
    start_minute: Mapped[int] = mapped_column(Integer, default=0)
    downtime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="pending")

class ScheduleChange(Base):
    __tablename__ = "schedule_changes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False)
    operation_id: Mapped[str] = mapped_column(String(80), nullable=False)
    field_changed: Mapped[str] = mapped_column(String(50), nullable=False)
    old_value: Mapped[str] = mapped_column(String(200), nullable=True)
    new_value: Mapped[str] = mapped_column(String(200), nullable=True)

class CostEvent(Base):
    __tablename__ = "cost_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False)
    cost_type: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=True)

class ManualOverride(Base):
    __tablename__ = "manual_overrides"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(String(50), nullable=False)
    operation_id: Mapped[str] = mapped_column(String(80), nullable=False)
    pin_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "first", "machine", "operator"
    pin_value: Mapped[str] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str] = mapped_column(String(50), default="owner")
    reason: Mapped[str] = mapped_column(String(200), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Text] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user: Mapped[str] = mapped_column(String(50), default="system")


# --- ENGINE SETUP & PLAN STORE ---

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Enable foreign keys constraint for SQLite connection
if not IS_POSTGRES:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

class SqlAlchemyPlanStore:
    def save_plan(self, version: str, scenario: str, payload: dict[str, Any]) -> None:
        with SessionLocal() as session:
            objective = payload.get("solver_health", {}).get("objective", 0)
            schedule = Schedule(
                plan_version=version,
                trigger_event=scenario,
                objective_value=objective,
                payload=json.loads(json.dumps(payload, default=str))
            )
            session.add(schedule)
            session.commit()
            
            session.refresh(schedule)
            
            version_int = int(version.replace("V", ""))
            sched_ver = ScheduleVersion(
                schedule_id=schedule.id,
                version=version_int,
                trigger_event=scenario,
                solver_status=payload.get("solver_status", "FEASIBLE"),
                objective_value=objective
            )
            session.add(sched_ver)
            
            # Insert operations
            for op in payload.get("operations", []):
                session.add(
                    ScheduleOperation(
                        schedule_id=schedule.id,
                        operation_id=op["operation_id"],
                        machine_id=op["machine_id"],
                        operator_id=op["operator_id"],
                        start_minute=op["start_minute"],
                        end_minute=op["end_minute"],
                        setup_duration=op["setup"],
                        production_duration=op["duration"] - op["setup"],
                        status=op["status"]
                    )
                )
            
            # Insert costs
            kpis = payload.get("kpis", {})
            costs = [
                ("overtime", kpis.get("overtime", 0.0), "Overtime labor cost"),
                ("penalty", kpis.get("penalty", 0.0), "Late delivery penalty cost"),
                ("changeover", kpis.get("changeover_hours", 0.0) * 550, "Wasted changeovers"),
            ]
            for cost_type, amount, desc in costs:
                session.add(
                    CostEvent(
                        schedule_id=schedule.id,
                        cost_type=cost_type,
                        amount=float(amount),
                        description=desc
                    )
                )
            
            session.add(
                AuditEvent(
                    event_type="plan_saved",
                    description=f"Plan {version} saved for scenario {scenario}",
                    user="system"
                )
            )
            session.commit()


def seed_db(session: Any, data: Any) -> None:
    session.query(AuditEvent).delete()
    session.query(CostEvent).delete()
    session.query(ScheduleChange).delete()
    session.query(ScheduleOperation).delete()
    session.query(ScheduleVersion).delete()
    session.query(Schedule).delete()
    session.query(ManualOverride).delete()
    session.query(ReworkOrder).delete()
    session.query(QualityEvent).delete()
    session.query(MaterialConstraint).delete()
    session.query(Breakdown).delete()
    session.query(MaintenanceWindow).delete()
    session.query(MachineCalendar).delete()
    session.query(SetupMatrix).delete()
    session.query(OrderOperation).delete()
    session.query(Order).delete()
    session.query(ShiftAssignment).delete()
    session.query(Shift).delete()
    session.query(OperatorSkill).delete()
    session.query(Operator).delete()
    session.query(MachineCapability).delete()
    session.query(Machine).delete()
    session.query(PartFamily).delete()
    session.query(Part).delete()
    session.query(Customer).delete()
    session.commit()

    customer_ids = set()
    for o in data.orders:
        customer_ids.add(o.customer)
    for c_id in customer_ids:
        tier = 1 if "Apex" in c_id else (2 if "Rane" in c_id or "Metro" in c_id else 3)
        session.add(Customer(id=c_id, name=c_id, tier=tier))

    families = set(o.family for o in data.orders)
    for f in families:
        session.add(PartFamily(id=f, name=f.capitalize()))

    parts_seen = set()
    for o in data.orders:
        if o.part not in parts_seen:
            session.add(Part(id=o.part, name=o.part, family=o.family))
            parts_seen.add(o.part)

    for m in data.machines:
        session.add(
            Machine(
                id=m.id,
                name=m.name,
                center=m.center,
                hourly_cost=150.0,
                overtime_cost=250.0,
                efficiency=1.0,
                status="active"
            )
        )
        for cap in m.capabilities:
            session.add(MachineCapability(machine_id=m.id, work_center=cap))

    for op in data.operators:
        shift_val = "A" if hash(op.id) % 2 == 0 else "B"
        session.add(
            Operator(
                id=op.id,
                name=op.name,
                shift=shift_val,
                skill_level="qualified",
                overtime_eligible=True
            )
        )
        for skill in op.skills:
            session.add(OperatorSkill(operator_id=op.id, work_center=skill))

    session.add(Shift(id="A", name="Shift A", start_time="06:00", end_time="14:00"))
    session.add(Shift(id="B", name="Shift B", start_time="14:00", end_time="22:00"))
    session.flush()

    for from_fam, targets in data.setup_matrix.items():
        for to_fam, setup_t in targets.items():
            session.add(SetupMatrix(from_family=from_fam, to_family=to_fam, setup_time=setup_t))

    for mw in data.maintenance:
        if mw.resource_type == "machine":
            session.add(MaintenanceWindow(machine_id=mw.resource_id, start_minute=mw.start, end_minute=mw.end, reason=mw.reason))

    for b in data.breakdown_history:
        session.add(Breakdown(machine_id=b["machine_id"], start_minute=0, duration=int(b["mttr_hours"] * 60), resolved=True))

    for qe in data.quality_events:
        session.add(
            QualityEvent(
                order_id=qe["order_id"],
                operation_name=qe["operation"],
                scrap_ppm=qe.get("scrap_ppm", 0),
                action=qe["action"]
            )
        )

    for o in data.orders:
        session.add(
            Order(
                id=o.id,
                customer=o.customer,
                part=o.part,
                family=o.family,
                quantity=o.quantity,
                release_minute=o.release_minute,
                due_minute=o.due_minute,
                penalty_per_hour=o.penalty_per_hour,
                priority=o.priority,
                status="open"
            )
        )
    session.flush()

    for op in data.operations:
        session.add(
            OrderOperation(
                id=op.id,
                order_id=op.order_id,
                sequence=op.sequence,
                work_center=op.center,
                name=op.name,
                duration=op.duration,
                setup=op.setup
            )
        )

    for order_id, delay_m in data.material_constraints.items():
        if delay_m > 0:
            session.add(MaterialConstraint(order_id=order_id, material_name="Raw Material", arrival_minute=delay_m))

    session.commit()
