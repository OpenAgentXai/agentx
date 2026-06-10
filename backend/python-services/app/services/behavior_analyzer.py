from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.schemas import BehaviorProfile, BehaviorPattern

logger = structlog.get_logger()


class BehaviorAnalyzer:
    """Builds behavioral profiles for agents based on historical activity."""

    async def analyze(
        self, db: AsyncSession, agent_id: str, org_id: str, days: int = 7
    ) -> BehaviorProfile:
        """Build a complete behavioral profile for an agent."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        # Get basic activity stats
        stats = await self._get_activity_stats(db, agent_id, org_id, cutoff)

        # Get typical actions
        typical_actions = await self._get_typical_actions(db, agent_id, org_id, cutoff)

        # Get typical resources
        typical_resources = await self._get_typical_resources(db, agent_id, org_id, cutoff)

        # Get active hours
        typical_hours = await self._get_active_hours(db, agent_id, org_id, cutoff)

        # Detect patterns
        patterns = await self._detect_patterns(db, agent_id, org_id, cutoff)

        # Calculate risk score
        risk_score = self._calculate_risk_score(stats, patterns)

        return BehaviorProfile(
            typical_actions=typical_actions,
            typical_resources=typical_resources,
            typical_hours=typical_hours,
            average_requests_per_hour=stats.get("avg_per_hour", 0.0),
            average_requests_per_day=stats.get("avg_per_day", 0.0),
            error_rate=stats.get("error_rate", 0.0),
            patterns=patterns,
            risk_score=risk_score,
            last_analyzed=datetime.now(timezone.utc),
        )

    async def _get_activity_stats(
        self, db: AsyncSession, agent_id: str, org_id: str, cutoff: datetime
    ) -> dict:
        result = await db.execute(
            text("""
                SELECT
                    COUNT(*) as total_requests,
                    COUNT(DISTINCT DATE(created_at)) as active_days,
                    COUNT(*) FILTER (WHERE status = 'failure') as errors,
                    COUNT(*) FILTER (WHERE status = 'denied') as denials,
                    MIN(created_at) as first_action,
                    MAX(created_at) as last_action,
                    COUNT(DISTINCT action) as unique_actions,
                    COUNT(DISTINCT resource_type) as unique_resources
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        row = result.fetchone()

        if row is None or row.total_requests == 0:
            return {
                "total": 0, "avg_per_hour": 0.0, "avg_per_day": 0.0,
                "error_rate": 0.0, "denial_rate": 0.0,
            }

        active_days = max(row.active_days, 1)
        hours_span = max(
            (row.last_action - row.first_action).total_seconds() / 3600, 1
        ) if row.first_action and row.last_action else 1

        return {
            "total": row.total_requests,
            "active_days": active_days,
            "avg_per_hour": round(row.total_requests / hours_span, 2),
            "avg_per_day": round(row.total_requests / active_days, 2),
            "error_rate": round(row.errors / row.total_requests, 4),
            "denial_rate": round(row.denials / row.total_requests, 4),
            "unique_actions": row.unique_actions,
            "unique_resources": row.unique_resources,
        }

    async def _get_typical_actions(
        self, db: AsyncSession, agent_id: str, org_id: str, cutoff: datetime
    ) -> list[str]:
        result = await db.execute(
            text("""
                SELECT action, COUNT(*) as count
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
                GROUP BY action
                ORDER BY count DESC
                LIMIT 20
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        return [row.action for row in result.fetchall()]

    async def _get_typical_resources(
        self, db: AsyncSession, agent_id: str, org_id: str, cutoff: datetime
    ) -> list[str]:
        result = await db.execute(
            text("""
                SELECT resource_type, COUNT(*) as count
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
                GROUP BY resource_type
                ORDER BY count DESC
                LIMIT 20
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        return [row.resource_type for row in result.fetchall()]

    async def _get_active_hours(
        self, db: AsyncSession, agent_id: str, org_id: str, cutoff: datetime
    ) -> list[int]:
        result = await db.execute(
            text("""
                SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as count
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
                GROUP BY EXTRACT(HOUR FROM created_at)
                HAVING COUNT(*) > 5
                ORDER BY count DESC
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        return [row.hour for row in result.fetchall()]

    async def _detect_patterns(
        self, db: AsyncSession, agent_id: str, org_id: str, cutoff: datetime
    ) -> list[BehaviorPattern]:
        patterns = []

        # Pattern: Burst activity (many requests in short window)
        result = await db.execute(
            text("""
                SELECT
                    DATE_TRUNC('minute', created_at) as minute,
                    COUNT(*) as count
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
                GROUP BY DATE_TRUNC('minute', created_at)
                HAVING COUNT(*) > 20
                ORDER BY count DESC
                LIMIT 5
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        burst_rows = result.fetchall()
        if burst_rows:
            patterns.append(BehaviorPattern(
                pattern_type="burst_activity",
                description=f"Detected {len(burst_rows)} burst periods with >20 requests/minute",
                frequency=len(burst_rows),
                last_seen=burst_rows[0].minute if burst_rows else None,
            ))

        # Pattern: Sequential resource access
        result = await db.execute(
            text("""
                SELECT action, resource_type, COUNT(*) as count
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
                GROUP BY action, resource_type
                ORDER BY count DESC
                LIMIT 5
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        top_combos = result.fetchall()
        for combo in top_combos:
            if combo.count > 10:
                patterns.append(BehaviorPattern(
                    pattern_type="frequent_action_resource",
                    description=f"Frequently performs '{combo.action}' on '{combo.resource_type}' ({combo.count} times)",
                    frequency=combo.count,
                ))

        # Pattern: Error clustering
        result = await db.execute(
            text("""
                SELECT
                    DATE_TRUNC('hour', created_at) as hour,
                    COUNT(*) FILTER (WHERE status = 'failure') as errors,
                    COUNT(*) as total
                FROM audit_logs
                WHERE actor_id = :agent_id
                AND organization_id = :org_id
                AND created_at >= :cutoff
                GROUP BY DATE_TRUNC('hour', created_at)
                HAVING COUNT(*) FILTER (WHERE status = 'failure')::float / NULLIF(COUNT(*), 0) > 0.3
                AND COUNT(*) > 5
            """),
            {"agent_id": agent_id, "org_id": org_id, "cutoff": cutoff},
        )
        error_clusters = result.fetchall()
        if error_clusters:
            patterns.append(BehaviorPattern(
                pattern_type="error_cluster",
                description=f"Found {len(error_clusters)} periods with >30% error rate",
                frequency=len(error_clusters),
                last_seen=error_clusters[0].hour if error_clusters else None,
            ))

        return patterns

    def _calculate_risk_score(self, stats: dict, patterns: list[BehaviorPattern]) -> float:
        """Calculate risk score 0-100 based on stats and patterns."""
        score = 0.0

        # High error rate increases risk
        error_rate = stats.get("error_rate", 0.0)
        if error_rate > 0.1:
            score += min(error_rate * 100, 30)

        # High denial rate increases risk
        denial_rate = stats.get("denial_rate", 0.0)
        if denial_rate > 0.05:
            score += min(denial_rate * 200, 30)

        # Burst activity increases risk
        burst_patterns = [p for p in patterns if p.pattern_type == "burst_activity"]
        if burst_patterns:
            score += min(sum(p.frequency for p in burst_patterns) * 5, 20)

        # Error clusters increase risk
        error_patterns = [p for p in patterns if p.pattern_type == "error_cluster"]
        if error_patterns:
            score += min(sum(p.frequency for p in error_patterns) * 5, 20)

        return round(min(score, 100.0), 1)
