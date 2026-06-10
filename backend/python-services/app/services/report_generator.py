from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.schemas import Report, ReportSection

logger = structlog.get_logger()


class ReportGenerator:
    """Generates analytics reports for organizations."""

    PERIOD_MAP = {
        "daily": 1,
        "weekly": 7,
        "monthly": 30,
    }

    async def generate(
        self, db: AsyncSession, org_id: str, report_type: str = "weekly"
    ) -> Report:
        days = self.PERIOD_MAP.get(report_type, 7)
        now = datetime.now(timezone.utc)
        period_start = now - timedelta(days=days)

        sections = []

        # Section 1: Agent Activity Overview
        activity_section = await self._agent_activity_section(db, org_id, period_start, now)
        sections.append(activity_section)

        # Section 2: Security Overview
        security_section = await self._security_section(db, org_id, period_start, now)
        sections.append(security_section)

        # Section 3: Top Agents
        top_agents_section = await self._top_agents_section(db, org_id, period_start)
        sections.append(top_agents_section)

        # Section 4: Policy Effectiveness
        policy_section = await self._policy_section(db, org_id, period_start)
        sections.append(policy_section)

        # Key metrics summary
        key_metrics = await self._get_key_metrics(db, org_id, period_start)

        # Recommendations
        recommendations = self._generate_recommendations(key_metrics, sections)

        return Report(
            generated_at=now,
            period_start=period_start,
            period_end=now,
            sections=sections,
            key_metrics=key_metrics,
            recommendations=recommendations,
        )

    async def _agent_activity_section(
        self, db: AsyncSession, org_id: str, start: datetime, end: datetime
    ) -> ReportSection:
        result = await db.execute(
            text("""
                SELECT
                    COUNT(*) as total_requests,
                    COUNT(DISTINCT actor_id) FILTER (WHERE actor_type = 'agent') as active_agents,
                    COUNT(*) FILTER (WHERE status = 'success') as successes,
                    COUNT(*) FILTER (WHERE status = 'failure') as failures,
                    COUNT(*) FILTER (WHERE status = 'denied') as denials,
                    COUNT(DISTINCT action) as unique_actions,
                    COUNT(DISTINCT resource_type) as unique_resources
                FROM audit_logs
                WHERE organization_id = :org_id
                AND created_at >= :start AND created_at <= :end
            """),
            {"org_id": org_id, "start": start, "end": end},
        )
        row = result.fetchone()

        total = row.total_requests if row else 0
        successes = row.successes if row else 0
        failures = row.failures if row else 0

        return ReportSection(
            title="Agent Activity Overview",
            summary=f"{total} total requests from {row.active_agents if row else 0} active agents. "
                    f"Success rate: {(successes/total*100) if total > 0 else 0:.1f}%.",
            data={
                "total_requests": total,
                "active_agents": row.active_agents if row else 0,
                "successes": successes,
                "failures": failures,
                "denials": row.denials if row else 0,
                "success_rate": round(successes / total * 100, 1) if total > 0 else 0,
                "unique_actions": row.unique_actions if row else 0,
                "unique_resources": row.unique_resources if row else 0,
            },
            charts=[{
                "type": "pie",
                "title": "Request Status Distribution",
                "data": {
                    "success": successes,
                    "failure": failures,
                    "denied": row.denials if row else 0,
                },
            }],
        )

    async def _security_section(
        self, db: AsyncSession, org_id: str, start: datetime, end: datetime
    ) -> ReportSection:
        # Permission denials
        result = await db.execute(
            text("""
                SELECT
                    al.actor_id,
                    a.name as agent_name,
                    COUNT(*) as denial_count
                FROM audit_logs al
                JOIN agents a ON al.actor_id = a.id
                WHERE al.organization_id = :org_id
                AND al.status = 'denied'
                AND al.created_at >= :start AND al.created_at <= :end
                GROUP BY al.actor_id, a.name
                ORDER BY denial_count DESC
                LIMIT 5
            """),
            {"org_id": org_id, "start": start, "end": end},
        )
        top_denied = [
            {"agent_id": str(r.actor_id), "agent_name": r.agent_name, "count": r.denial_count}
            for r in result.fetchall()
        ]

        # Credential events
        result = await db.execute(
            text("""
                SELECT COUNT(*) as count, action
                FROM audit_logs
                WHERE organization_id = :org_id
                AND resource_type = 'credential'
                AND created_at >= :start AND created_at <= :end
                GROUP BY action
            """),
            {"org_id": org_id, "start": start, "end": end},
        )
        cred_events = {r.action: r.count for r in result.fetchall()}

        total_denials = sum(d["count"] for d in top_denied)

        return ReportSection(
            title="Security Overview",
            summary=f"{total_denials} permission denials detected. "
                    f"{cred_events.get('create_credential', 0)} credentials created, "
                    f"{cred_events.get('revoke_credential', 0)} revoked.",
            data={
                "total_denials": total_denials,
                "top_denied_agents": top_denied,
                "credential_events": cred_events,
            },
        )

    async def _top_agents_section(
        self, db: AsyncSession, org_id: str, start: datetime
    ) -> ReportSection:
        result = await db.execute(
            text("""
                SELECT
                    al.actor_id,
                    a.name as agent_name,
                    a.agent_type,
                    COUNT(*) as total_requests,
                    COUNT(*) FILTER (WHERE al.status = 'success') as successes,
                    COUNT(*) FILTER (WHERE al.status = 'failure') as failures
                FROM audit_logs al
                JOIN agents a ON al.actor_id = a.id
                WHERE al.organization_id = :org_id
                AND al.actor_type = 'agent'
                AND al.created_at >= :start
                GROUP BY al.actor_id, a.name, a.agent_type
                ORDER BY total_requests DESC
                LIMIT 10
            """),
            {"org_id": org_id, "start": start},
        )

        top_agents = []
        for r in result.fetchall():
            error_rate = r.failures / r.total_requests if r.total_requests > 0 else 0
            top_agents.append({
                "agent_id": str(r.actor_id),
                "agent_name": r.agent_name,
                "agent_type": r.agent_type,
                "total_requests": r.total_requests,
                "success_rate": round((r.successes / r.total_requests) * 100, 1) if r.total_requests > 0 else 0,
                "error_rate": round(error_rate * 100, 1),
            })

        return ReportSection(
            title="Top Agents by Activity",
            summary=f"Top {len(top_agents)} most active agents in the period.",
            data={"agents": top_agents},
            charts=[{
                "type": "bar",
                "title": "Top Agents - Request Count",
                "data": {a["agent_name"]: a["total_requests"] for a in top_agents[:5]},
            }],
        )

    async def _policy_section(
        self, db: AsyncSession, org_id: str, start: datetime
    ) -> ReportSection:
        result = await db.execute(
            text("""
                SELECT
                    COUNT(*) as total_policies,
                    COUNT(*) FILTER (WHERE is_active = true) as active_policies
                FROM policies
                WHERE organization_id = :org_id
            """),
            {"org_id": org_id},
        )
        row = result.fetchone()

        result2 = await db.execute(
            text("""
                SELECT COUNT(*) as assignments
                FROM policy_assignments pa
                JOIN policies p ON pa.policy_id = p.id
                WHERE p.organization_id = :org_id
            """),
            {"org_id": org_id},
        )
        row2 = result2.fetchone()

        return ReportSection(
            title="Policy Overview",
            summary=f"{row.total_policies if row else 0} policies configured "
                    f"({row.active_policies if row else 0} active), "
                    f"{row2.assignments if row2 else 0} assignments.",
            data={
                "total_policies": row.total_policies if row else 0,
                "active_policies": row.active_policies if row else 0,
                "total_assignments": row2.assignments if row2 else 0,
            },
        )

    async def _get_key_metrics(
        self, db: AsyncSession, org_id: str, start: datetime
    ) -> dict:
        result = await db.execute(
            text("""
                SELECT
                    COUNT(*) as total_requests,
                    COUNT(DISTINCT actor_id) FILTER (WHERE actor_type = 'agent') as active_agents,
                    COUNT(*) FILTER (WHERE status = 'failure')::float /
                        NULLIF(COUNT(*), 0) as error_rate,
                    COUNT(*) FILTER (WHERE status = 'denied')::float /
                        NULLIF(COUNT(*), 0) as denial_rate
                FROM audit_logs
                WHERE organization_id = :org_id
                AND created_at >= :start
            """),
            {"org_id": org_id, "start": start},
        )
        row = result.fetchone()

        total_agents = await db.execute(
            text("SELECT COUNT(*) as count FROM agents WHERE organization_id = :org_id"),
            {"org_id": org_id},
        )
        agents_row = total_agents.fetchone()

        return {
            "total_requests": row.total_requests if row else 0,
            "active_agents": row.active_agents if row else 0,
            "total_agents": agents_row.count if agents_row else 0,
            "error_rate": round(float(row.error_rate or 0) * 100, 2),
            "denial_rate": round(float(row.denial_rate or 0) * 100, 2),
        }

    def _generate_recommendations(self, metrics: dict, sections: list[ReportSection]) -> list[str]:
        recommendations = []

        error_rate = metrics.get("error_rate", 0)
        denial_rate = metrics.get("denial_rate", 0)
        active = metrics.get("active_agents", 0)
        total = metrics.get("total_agents", 0)

        if error_rate > 5:
            recommendations.append(
                f"High error rate ({error_rate:.1f}%). Investigate agents with frequent failures "
                "and review their configurations."
            )

        if denial_rate > 10:
            recommendations.append(
                f"High permission denial rate ({denial_rate:.1f}%). Review policy assignments — "
                "agents may need broader permissions or policies may be too restrictive."
            )

        if total > 0 and active / total < 0.5:
            inactive = total - active
            recommendations.append(
                f"{inactive} agents are inactive. Consider archiving unused agents to reduce "
                "attack surface."
            )

        if total > 20 and not any("policy" in s.title.lower() for s in sections if s.data.get("total_policies", 0) > 0):
            recommendations.append(
                "Large number of agents with few policies. Implement ABAC policies to enforce "
                "least-privilege access."
            )

        if not recommendations:
            recommendations.append(
                "System operating within normal parameters. Continue monitoring."
            )

        return recommendations
