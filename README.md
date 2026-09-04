# SPW Manufacturing Scheduling Simulator

![SPW Scheduling Simulator](https://img.shields.io/badge/Status-Active-success) ![Vite](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-blue) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green) ![OR-Tools](https://img.shields.io/badge/Solver-OR--Tools%20CP--SAT-orange)

A complete, interactive manufacturing scheduling simulator for Sridhar Precision Works (SPW). This project demonstrates a production-grade approach to dynamic job-shop scheduling, designed to handle real-world manufacturing disruptions seamlessly.

## The Problem

In modern manufacturing environments, the shop floor is rarely static. Traditional scheduling tools generate fixed plans that immediately become obsolete when real-world disruptions occur—such as sudden machine breakdowns, operator absences, material delays, or urgent customer escalations. When these disruptions happen, supervisors are often forced to make sub-optimal, reactive decisions, leading to cascading delays, increased overtime costs, and missed delivery deadlines.

## The Solution

This system provides a dynamic, adaptive scheduling engine powered by Google's OR-Tools CP-SAT solver. Rather than relying on a brittle static plan, the system recalculates optimized job sequences on the fly in response to real-time events. 

It is designed to:
- Absorb Disruptions: Automatically adapt to breakdowns, delays, and absences while minimizing late delivery penalties and maximizing machine utilization.
- Provide Explainability (XAI): Manufacturing planners need to trust the system. The built-in explanation engine translates complex mathematical solver decisions into human-readable explanations.
- Bridge the Gap to the Shop Floor: A multilingual, offline-capable tablet interface ensures shop floor supervisors can report issues instantly, regardless of network connectivity or language barriers.

## Software Architecture & Highlights

This project was built focusing on robustness, scalability, and clean separation of concerns:

- Constraint Optimization Modeling: The backend utilizes advanced CP-SAT constraints to model complex, real-world manufacturing constraints such as shift schedules, setup times matrix, overlapping machine capabilities, and material delays.
- Decoupled Full-Stack Architecture: A strict separation between the React frontend and the FastAPI backend ensures that the heavy computational load of the OR-Tools solver does not impact the UI responsiveness.
- Explainable AI Integration: The system bridges the gap between black-box optimization algorithms and human operators by proactively calculating and displaying the critical path and resource bottlenecks for any delayed order.
- Resilient State Management: The frontend employs robust React hooks to manage complex concurrent states, including optimistic UI updates, offline action queuing, and conflict resolution if the schedule is updated simultaneously by another user.
- Offline-First Tablet View: Demonstrates a robust Progressive Web App (PWA) approach by caching supervisor disruption reports locally when offline, and automatically synchronizing them with the backend once connectivity is restored.

## Setup & Installation

The application is split into a Frontend (React + Vite) and a Backend (FastAPI + Python). You will need to run both concurrently.

### 1. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   # Windows
   python -m venv .venv
   .venv\Scripts\activate
   
   # macOS/Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the server:
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
   *(Note: Initializing the database and solving the first baseline schedule takes a bit of time due to the complexity of the OR-Tools constraints. Please be patient when running for the first time or clicking "Reset Demo".)*

### 2. Frontend Setup
1. In a separate terminal, from the root directory, install Node dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

## How to Use the Simulator

The simulator provides several distinct views and interactive features to demonstrate the capability of the OR-Tools solver:

1. Initializing the Demo
Click the "Reset Demo" button in the sidebar. This drops the database, seeds it with 25 realistic manufacturing orders, 14 machines, and generates the initial baseline schedule.

2. Interactive Control Room
Explore the Gantt chart and the Order Control Board. 
- Why?: Click this on any scheduled order to understand the solver's logic (e.g., waiting for material, waiting for a previous operation, or resource bottlenecks).
- Pin (Manual Overrides): Allows planners to force specific jobs onto specific machines, blending human intuition with algorithmic optimization.

3. Simulating Disruptions
Use the Disruption Panel to simulate various factory floor issues:
- Machine Breakdowns
- Operator Absences
- Material Delays
- Sudden Rework Requirements
- Power Cuts
Watch as the system automatically replans and adapts instantly to these disruptions.

4. Guided Defense Walk-through
Navigate through the strategic defense feature, which compares three different solver strategies (e.g., Cheapest vs. Fastest) and recommends the best path forward after a major disruption.

5. Multilingual Supervisor Tablet & Offline Mode
Switch to the tablet view to act as a shop floor supervisor. 
- You can toggle the UI between English, Kannada, and Tamil. 
- Use the network toggle to simulate losing Wi-Fi on the shop floor. Any disruptions reported will be queued locally and sent to the server automatically once the network is restored.
