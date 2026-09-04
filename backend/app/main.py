from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.database import SessionLocal, ManualOverride, Schedule, CostEvent
from app.scheduler import DemoScheduler, build_demo_data, explain_order_schedule


app = FastAPI(title="Sridhar Precision Works Scheduling Simulator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = DemoScheduler()


class DisruptionRequest(BaseModel):
    preset: str = "combined_grinding_breakdown_operator_absence"
    machine_id: str = "GRIND-G02"
    operator_id: str = "OP-GRIND-2"
    start_minute: int = 5 * 60
    downtime_minutes: int | None = None
    material_delay_minutes: int = 0
    rework_quantity: int = 0
    strategy: str = "cheapest"
    schedule_version: int | None = None


class OverrideRequest(BaseModel):
    order_id: str
    operation_id: str
    pin_type: str  # "first", "machine", "operator"
    pin_value: str | None = None
    reason: str = "Owner escalation"
    schedule_version: int | None = None


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    return scheduler.snapshot()


@app.post("/api/demo/reset")
@app.post("/api/reset")
def reset_demo() -> dict[str, Any]:
    return scheduler.reset()


@app.post("/api/disruptions/impact")
def disruption_impact(payload: DisruptionRequest) -> dict[str, Any]:
    return scheduler.impact(payload.model_dump(exclude_none=True))


@app.post("/api/replan")
def replan(payload: DisruptionRequest) -> dict[str, Any]:
    # Concurrency check
    if payload.schedule_version is not None and payload.schedule_version < scheduler.state.version_counter:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "SCHEDULE_UPDATED",
                "current_version": f"V{scheduler.state.version_counter:03d}",
                "updated_ago_seconds": 12,
            }
        )
    
    return scheduler.replan(payload.model_dump(exclude_none=True))


@app.post("/api/validate")
def validate() -> dict[str, Any]:
    return scheduler.validate_current()


@app.post("/api/strategies")
def strategies(payload: DisruptionRequest) -> dict[str, Any]:
    return scheduler.compare_strategies(payload.model_dump(exclude_none=True))


@app.get("/api/orders/{id}/explanation")
def order_explanation(id: str) -> dict[str, Any]:
    snap = scheduler.snapshot()
    data = build_demo_data(scheduler.state.disruption)
    return explain_order_schedule(id, snap.get("operations", []), data)


@app.post("/api/manual-overrides")
def add_override(payload: OverrideRequest) -> dict[str, Any]:
    # Concurrency check
    if payload.schedule_version is not None and payload.schedule_version < scheduler.state.version_counter:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "SCHEDULE_UPDATED",
                "current_version": f"V{scheduler.state.version_counter:03d}",
                "updated_ago_seconds": 12,
            }
        )

    with SessionLocal() as session:
        # Deactivate previous active overrides for this operation
        session.query(ManualOverride).filter(
            ManualOverride.operation_id == payload.operation_id,
            ManualOverride.active == True
        ).update({"active": False})
        
        # Insert new override
        ov = ManualOverride(
            order_id=payload.order_id,
            operation_id=payload.operation_id,
            pin_type=payload.pin_type,
            pin_value=payload.pin_value,
            reason=payload.reason,
            active=True
        )
        session.add(ov)
        session.commit()
    
    # Run a replan automatically after adding the override
    # Pass the last disruption settings if any
    disruption_args = scheduler.state.disruption.__dict__ if scheduler.state.disruption else {}
    return scheduler.replan(disruption_args)


@app.get("/api/schedule/{version}/diff")
def schedule_diff(version: str) -> dict[str, Any]:
    with SessionLocal() as session:
        target_sched = session.query(Schedule).filter(Schedule.plan_version == version).first()
        baseline_sched = session.query(Schedule).filter(Schedule.plan_version == "V001").first()
        
        if not target_sched or not baseline_sched:
            raise HTTPException(status_code=404, detail="Schedule version not found")
            
        # Extract payload operations
        target_ops = target_sched.payload.get("operations", [])
        baseline_ops = baseline_sched.payload.get("operations", [])
        
        # Return plan version details
        return {
            "version": version,
            "target": target_sched.payload.get("kpis", {}),
            "baseline": baseline_sched.payload.get("kpis", {}),
            "changes": target_sched.payload.get("changes", {}),
        }


@app.get("/api/schedule/{version}/cost")
def schedule_costs(version: str) -> dict[str, Any]:
    with SessionLocal() as session:
        target_sched = session.query(Schedule).filter(Schedule.plan_version == version).first()
        if not target_sched:
            raise HTTPException(status_code=404, detail="Schedule version not found")
            
        costs = session.query(CostEvent).filter(CostEvent.schedule_id == target_sched.id).all()
        return {
            "version": version,
            "costs": [
                {
                    "cost_type": c.cost_type,
                    "amount": c.amount,
                    "description": c.description
                }
                for c in costs
            ]
        }


@app.post("/api/disruptions/machine-breakdown")
def machine_breakdown(payload: DisruptionRequest) -> dict[str, Any]:
    payload.preset = "grinding_down_8"
    return replan(payload)


@app.post("/api/disruptions/operator-absence")
def operator_absence(payload: DisruptionRequest) -> dict[str, Any]:
    payload.preset = "grinding_operator_absent"
    return replan(payload)


@app.post("/api/disruptions/material-delay")
def material_delay(payload: DisruptionRequest) -> dict[str, Any]:
    payload.preset = "material_delayed_12"
    return replan(payload)


@app.post("/api/disruptions/rework")
def rework(payload: DisruptionRequest) -> dict[str, Any]:
    payload.preset = "rework_50"
    return replan(payload)


@app.post("/api/disruptions/power-cut")
def power_cut(payload: DisruptionRequest) -> dict[str, Any]:
    payload.preset = "power_outage"
    return replan(payload)
