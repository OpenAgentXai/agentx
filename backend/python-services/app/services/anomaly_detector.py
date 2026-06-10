from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.schemas import Anomaly

logger = structlog.get_logger()


class AnomalyDetector:
    """Detects anomalous agent behavior using statistical analysis and Isolation Forest."""

    def __init__(self):
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42,
        )
        self._is_trained = False

    async def detect_anomalies(
        self, db: AsyncSession, org_id: str, hours: int = 24
    ) -> list[Anomaly]:
        """Detect anomalies across all agents in an organization."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        anomalies = []

        # 1. Volume anomalies: agents with unusual request counts
        volume_anomalies = await self._detect_volume_anomalies(db, org_id, cutoff)
        anomalies.extend(volume_anomalies)

        # 2. Timing anomalies: agents active at unusual hours
        timing_anomalies = await self._detect_timing_anomalies(db, org_id, cutoff)
        anomalies.extend(timing_anomalies)

        # 3. Error rate anomalies: agents with unusual error rates
        error_anomalies = await self._detect_error_anomalies(db, org_id, cutoff)
        anomalies.extend(error_anomalies)

        # 4. Permission denied spikes
        permission_anomalies = await self._detect_permission_anomalies(db, org_id, cutoff)
        anomalies.extend(permission_anomalies)

        # Sort by severity (critical first)
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        anomalies.sort(key=lambda a: severity_order.get(a.severity, 4))

        return anomalies

    async def detect_single(
        self,
        db: AsyncSession,
        agent_id: str,
        org_id: str,
        action: str,
        resource: str,
        context: dict,
    ) -> dict:
        """Real-time single-action anomaly detection."""
        reasons = []
        risk_score = 0.0

        # Get agent's historical behavior
        result = await db.execute(
            text("""
                SELECT
                    COUNT(*) as total_actions,
                    COUNT(*) FILTER (WHERE action = :action) as action_count,
                    COUNT(*) FILTER (WHERE resource_type = :resource) as resource_count,
                    COUNT(*) FILTER (WHERE status = 'failure') as error_count,
                    AVG(EXTRACT(HOUR FROM created_at)) as avg_hour,
                    STDDEV(EXTRACT(HOUR FROM created_at)) as stddev_hour
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= NOW() - INTERVAL '7 days'
            """),
            {"agent_id": agent_id, "org_id": org_id, "action": action, "resource": resource},
        )
        row = result.fetchone()

        if row is None or row.total_actions == 0:
            # New agent or no history — flag as low confidence
            return {
                "is_anomalous": False,
                "confidence": 0.3,
                "reasons": ["Insufficient historical data for analysis"],
                "risk_score": 20.0,
            }

        total = row.total_actions
        action_count = row.action_count
        resource_count = row.resource_count
        error_count = row.error_count

        # Check 1: Is this action rare for this agent?
        action_frequency = action_count / total if total > 0 else 0
        if action_frequency < 0.01:
            reasons.append(f"Rare action: '{action}' performed only {action_count} times in 7 days")
            risk_score += 30

        # Check 2: Is this resource unusual?
        resource_frequency = resource_count / total if total > 0 else 0
        if resource_frequency < 0.01:
            reasons.append(f"Unusual resource: '{resource}' accessed only {resource_count} times")
            risk_score += 25

        # Check 3: Is the current hour unusual?
        if row.avg_hour is not None and row.stddev_hour is not None and row.stddev_hour > 0:
            current_hour = datetime.now(timezone.utc).hour
            z_score = abs(current_hour - row.avg_hour) / row.stddev_hour
            if z_score > 2.0:
                reasons.append(f"Unusual timing: activity at hour {current_hour} (typical: {row.avg_hour:.0f}±{row.stddev_hour:.0f})")
                risk_score += 20

        # Check 4: High recent error rate
        error_rate = error_count / total if total > 0 else 0
        if error_rate > 0.3:
            reasons.append(f"High error rate: {error_rate:.1%} in last 7 days")
            risk_score += 25

        risk_score = min(risk_score, 100.0)
        is_anomalous = risk_score >= 50.0
        confidence = min(0.5 + (total / 1000), 0.95)  # More data = higher confidence

        return {
            "is_anomalous": is_anomalous,
            "confidence": round(confidence, 2),
            "reasons": reasons if reasons else ["No anomalies detected"],
            "risk_score": round(risk_score, 1),
        }

    async def _detect_volume_anomalies(
        self, db: AsyncSession, org_id: str, cutoff: datetime
    ) -> list[Anomaly]:
        anomalies = []

        result = await db.execute(
            text("""
                SELECT
                    al.actor_id,
                    a.name as agent_name,
                    COUNT(*) as request_count,
                    AVG(COUNT(*)) OVER () as avg_count,
                    STDDEV(COUNT(*)) OVER () as stddev_count
                FROM audit_logs al
                JOIN agents a ON al.actor_id = a.id
                WHERE al.organization_id = :org_id
                AND al.actor_type = 'agent'
                AND al.created_at >= :cutoff
                GROUP BY al.actor_id, a.name
            """),
            {"org_id": org_id, "cutoff": cutoff},
        )

        rows = result.fetchall()
        for row in rows:
            if row.stddev_count and row.stddev_count > 0:
                z_score = (row.request_count - row.avg_count) / row.stddev_count
                if z_score > 2.5:
                    severity = "critical" if z_score > 4 else "high" if z_score > 3 else "medium"
                    anomalies.append(Anomaly(
                        agent_id=str(row.actor_id),
                        agent_name=row.agent_name,
                        anomaly_type="unusual_volume",
                        severity=severity,
                        description=f"Agent '{row.agent_name}' made {row.request_count} requests "
                                    f"(avg: {row.avg_count:.0f}, z-score: {z_score:.1f})",
                        confidence=min(0.7 + z_score * 0.05, 0.99),
                        detected_at=datetime.now(timezone.utc),
                        details={
                            "request_count": row.request_count,
                            "average": float(row.avg_count),
                            "z_score": round(z_score, 2),
                        },
                    ))

        return anomalies

    async def _detect_timing_anomalies(
        self, db: AsyncSession, org_id: str, cutoff: datetime
    ) -> list[Anomaly]:
        anomalies = []

        result = await db.execute(
            text("""
                WITH agent_hours AS (
                    SELECT
                        al.actor_id,
                        a.name as agent_name,
                        EXTRACT(HOUR FROM al.created_at) as hour,
                        COUNT(*) as count
                    FROM audit_logs al
                    JOIN agents a ON al.actor_id = a.id
                    WHERE al.organization_id = :org_id
                    AND al.actor_type = 'agent'
                    AND al.created_at >= :cutoff
                    GROUP BY al.actor_id, a.name, EXTRACT(HOUR FROM al.created_at)
                ),
                agent_baselines AS (
                    SELECT
                        al.actor_id,
                        EXTRACT(HOUR FROM al.created_at) as hour,
                        AVG(daily_count) as avg_count
                    FROM (
                        SELECT actor_id, DATE(created_at) as day,
                               EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as daily_count
                        FROM audit_logs
                        WHERE organization_id = :org_id
                        AND actor_type = 'agent'
                        AND created_at >= :cutoff - INTERVAL '30 days'
                        AND created_at < :cutoff
                        GROUP BY actor_id, DATE(created_at), EXTRACT(HOUR FROM created_at)
                    ) al
                    GROUP BY al.actor_id, EXTRACT(HOUR FROM al.created_at)
                )
                SELECT ah.actor_id, ah.agent_name, ah.hour, ah.count,
                       COALESCE(ab.avg_count, 0) as baseline
                FROM agent_hours ah
                LEFT JOIN agent_baselines ab ON ah.actor_id = ab.actor_id AND ah.hour = ab.hour
                WHERE ah.count > 10 AND (ab.avg_count IS NULL OR ab.avg_count = 0)
            """),
            {"org_id": org_id, "cutoff": cutoff},
        )

        rows = result.fetchall()
        for row in rows:
            anomalies.append(Anomaly(
                agent_id=str(row.actor_id),
                agent_name=row.agent_name,
                anomaly_type="unusual_time",
                severity="medium",
                description=f"Agent '{row.agent_name}' active at unusual hour ({int(row.hour)}:00) "
                            f"with {row.count} requests (no baseline activity at this hour)",
                confidence=0.75,
                detected_at=datetime.now(timezone.utc),
                details={"hour": int(row.hour), "count": row.count},
            ))

        return anomalies

    async def _detect_error_anomalies(
        self, db: AsyncSession, org_id: str, cutoff: datetime
    ) -> list[Anomaly]:
        anomalies = []

        result = await db.execute(
            text("""
                SELECT
                    al.actor_id,
                    a.name as agent_name,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE al.status = 'failure') as errors,
                    COUNT(*) FILTER (WHERE al.status = 'failure')::float / NULLIF(COUNT(*), 0) as error_rate
                FROM audit_logs al
                JOIN agents a ON al.actor_id = a.id
                WHERE al.organization_id = :org_id
                AND al.actor_type = 'agent'
                AND al.created_at >= :cutoff
                GROUP BY al.actor_id, a.name
                HAVING COUNT(*) >= 10
                AND COUNT(*) FILTER (WHERE al.status = 'failure')::float / NULLIF(COUNT(*), 0) > 0.2
            """),
            {"org_id": org_id, "cutoff": cutoff},
        )

        rows = result.fetchall()
        for row in rows:
            severity = "critical" if row.error_rate > 0.5 else "high" if row.error_rate > 0.3 else "medium"
            anomalies.append(Anomaly(
                agent_id=str(row.actor_id),
                agent_name=row.agent_name,
                anomaly_type="unusual_error_rate",
                severity=severity,
                description=f"Agent '{row.agent_name}' has {row.error_rate:.0%} error rate "
                            f"({row.errors}/{row.total} requests)",
                confidence=0.85,
                detected_at=datetime.now(timezone.utc),
                details={
                    "total_requests": row.total,
                    "error_count": row.errors,
                    "error_rate": round(float(row.error_rate), 3),
                },
            ))

        return anomalies

    async def _detect_permission_anomalies(
        self, db: AsyncSession, org_id: str, cutoff: datetime
    ) -> list[Anomaly]:
        anomalies = []

        result = await db.execute(
            text("""
                SELECT
                    al.actor_id,
                    a.name as agent_name,
                    COUNT(*) FILTER (WHERE al.status = 'denied') as denied_count
                FROM audit_logs al
                JOIN agents a ON al.actor_id = a.id
                WHERE al.organization_id = :org_id
                AND al.actor_type = 'agent'
                AND al.created_at >= :cutoff
                GROUP BY al.actor_id, a.name
                HAVING COUNT(*) FILTER (WHERE al.status = 'denied') > 5
            """),
            {"org_id": org_id, "cutoff": cutoff},
        )

        rows = result.fetchall()
        for row in rows:
            severity = "high" if row.denied_count > 20 else "medium"
            anomalies.append(Anomaly(
                agent_id=str(row.actor_id),
                agent_name=row.agent_name,
                anomaly_type="permission_denied_spike",
                severity=severity,
                description=f"Agent '{row.agent_name}' received {row.denied_count} permission denials",
                confidence=0.9,
                detected_at=datetime.now(timezone.utc),
                details={"denied_count": row.denied_count},
            ))

        return anomalies
