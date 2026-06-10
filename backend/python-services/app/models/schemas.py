from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class Anomaly(BaseModel):
    agent_id: str
    agent_name: str
    anomaly_type: str  # unusual_volume, unusual_time, unusual_resource, unusual_error_rate
    severity: str  # low, medium, high, critical
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    detected_at: datetime
    details: dict = Field(default_factory=dict)


class AnomalyResponse(BaseModel):
    success: bool
    anomalies: list[Anomaly]
    lookback_hours: int
    total: int


class BehaviorPattern(BaseModel):
    pattern_type: str
    description: str
    frequency: float
    last_seen: Optional[datetime] = None


class BehaviorProfile(BaseModel):
    typical_actions: list[str]
    typical_resources: list[str]
    typical_hours: list[int]  # 0-23
    average_requests_per_hour: float
    average_requests_per_day: float
    error_rate: float
    patterns: list[BehaviorPattern]
    risk_score: float = Field(ge=0.0, le=100.0)
    last_analyzed: datetime


class BehaviorResponse(BaseModel):
    success: bool
    agent_id: str
    profile: BehaviorProfile
    analysis_period_days: int


class DetectRequest(BaseModel):
    agent_id: str
    org_id: str
    action: str
    resource: str
    context: dict = Field(default_factory=dict)


class DetectResponse(BaseModel):
    success: bool
    is_anomalous: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reasons: list[str]
    risk_score: float = Field(ge=0.0, le=100.0)


class ReportSection(BaseModel):
    title: str
    summary: str
    data: dict = Field(default_factory=dict)
    charts: list[dict] = Field(default_factory=list)


class Report(BaseModel):
    generated_at: datetime
    period_start: datetime
    period_end: datetime
    sections: list[ReportSection]
    key_metrics: dict
    recommendations: list[str]


class ReportResponse(BaseModel):
    success: bool
    report_type: str
    report: Report
