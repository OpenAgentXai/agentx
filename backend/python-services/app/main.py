from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.services.database import get_db, init_db, close_db
from app.services.anomaly_detector import AnomalyDetector
from app.services.behavior_analyzer import BehaviorAnalyzer
from app.services.report_generator import ReportGenerator
from app.models.schemas import (
    AnomalyResponse,
    BehaviorResponse,
    DetectRequest,
    DetectResponse,
    ReportResponse,
    HealthResponse,
)

logger = structlog.get_logger()

anomaly_detector = AnomalyDetector()
behavior_analyzer = BehaviorAnalyzer()
report_generator = ReportGenerator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("AgentX Analytics Service started")
    yield
    await close_db()
    logger.info("AgentX Analytics Service stopped")


app = FastAPI(
    title="AgentX Analytics Service",
    description="AI-powered analytics for agent behavior monitoring",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="healthy", service="analytics")


@app.get("/analytics/v1/anomalies", response_model=AnomalyResponse)
async def get_anomalies(
    org_id: str = Query(..., description="Organization ID"),
    hours: int = Query(24, ge=1, le=720, description="Lookback period in hours"),
    db=Depends(get_db),
):
    """Detect anomalies in agent behavior over the specified time window."""
    try:
        anomalies = await anomaly_detector.detect_anomalies(db, org_id, hours)
        return AnomalyResponse(
            success=True,
            anomalies=anomalies,
            lookback_hours=hours,
            total=len(anomalies),
        )
    except Exception as e:
        logger.error("anomaly_detection_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Anomaly detection failed: {str(e)}")


@app.get("/analytics/v1/behavior/{agent_id}", response_model=BehaviorResponse)
async def get_behavior_profile(
    agent_id: str,
    org_id: str = Query(...),
    days: int = Query(7, ge=1, le=90),
    db=Depends(get_db),
):
    """Analyze behavioral patterns for a specific agent."""
    try:
        profile = await behavior_analyzer.analyze(db, agent_id, org_id, days)
        return BehaviorResponse(
            success=True,
            agent_id=agent_id,
            profile=profile,
            analysis_period_days=days,
        )
    except Exception as e:
        logger.error("behavior_analysis_failed", agent_id=agent_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Behavior analysis failed: {str(e)}")


@app.post("/analytics/v1/detect", response_model=DetectResponse)
async def detect_realtime(
    request: DetectRequest,
    db=Depends(get_db),
):
    """Real-time anomaly detection for a single agent action."""
    try:
        result = await anomaly_detector.detect_single(
            db, request.agent_id, request.org_id,
            request.action, request.resource, request.context
        )
        return DetectResponse(
            success=True,
            is_anomalous=result["is_anomalous"],
            confidence=result["confidence"],
            reasons=result["reasons"],
            risk_score=result["risk_score"],
        )
    except Exception as e:
        logger.error("realtime_detection_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analytics/v1/reports", response_model=ReportResponse)
async def generate_report(
    org_id: str = Query(...),
    report_type: str = Query("weekly", regex="^(daily|weekly|monthly)$"),
    db=Depends(get_db),
):
    """Generate analytics report for the organization."""
    try:
        report = await report_generator.generate(db, org_id, report_type)
        return ReportResponse(
            success=True,
            report_type=report_type,
            report=report,
        )
    except Exception as e:
        logger.error("report_generation_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
