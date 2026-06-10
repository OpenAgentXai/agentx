"""Schema validation tests — no database required."""
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    Anomaly,
    AnomalyResponse,
    BehaviorProfile,
    DetectRequest,
    DetectResponse,
    HealthResponse,
)


def test_health_response():
    h = HealthResponse(status="healthy", service="analytics")
    assert h.status == "healthy"


def test_anomaly_roundtrip():
    a = Anomaly(
        agent_id="c0000000-0000-4000-8000-000000000001",
        agent_name="Monitor-Agent",
        anomaly_type="volume_spike",
        severity="high",
        confidence=0.9,
        description="Request volume 4.2x above baseline",
        detected_at=datetime.now(timezone.utc),
        details={"z_score": 4.2},
    )
    payload = a.model_dump()
    assert payload["severity"] == "high"
    assert payload["confidence"] == 0.9
    assert Anomaly(**payload) == a


def test_anomaly_response_aggregates():
    r = AnomalyResponse(success=True, anomalies=[], lookback_hours=24, total=0)
    assert r.total == 0 and r.anomalies == []


def test_behavior_profile_defaults_are_safe():
    p = BehaviorProfile(
        typical_actions=[],
        typical_resources=[],
        typical_hours=[],
        average_requests_per_hour=0.0,
        average_requests_per_day=0.0,
        error_rate=0.0,
        patterns=[],
        risk_score=0.0,
        last_analyzed=datetime.now(timezone.utc),
    )
    assert p.risk_score == 0.0


def test_detect_request_requires_fields():
    with pytest.raises(ValidationError):
        DetectRequest()  # type: ignore[call-arg]


def test_detect_response_score_bounds():
    r = DetectResponse(
        success=True,
        is_anomalous=False,
        risk_score=12.5,
        confidence=0.4,
        reasons=[],
    )
    assert 0.0 <= r.risk_score <= 100.0
