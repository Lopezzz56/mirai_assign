from app.scheduler import DemoScheduler


if __name__ == "__main__":
    scheduler = DemoScheduler()
    data = scheduler.snapshot()
    print(
        "Seeded deterministic demo: "
        f"{data['kpis']['orders']} orders, "
        f"{len(data['machines'])} machines, "
        f"{data['kpis']['operations']} operations, "
        f"{data['kpis']['bottleneck']} bottleneck"
    )
