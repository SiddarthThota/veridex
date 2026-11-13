"""Read-only governance anomaly detection engine (Phase 8.3)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.queries import AnalyticsQueries
from app.analytics.schemas import (
    AnomalyFinding,
    AnomalyReport,
    AnomalySeverity,
    AnomalyStatus,
    AnomalyType,
)


class AnomalyDetector:
    """Evaluates deterministic, read-only governance anomaly detection rules."""

    @classmethod
    async def evaluate_anomalies(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        evaluation_time: datetime | None = None,
    ) -> AnomalyReport:
        """Run all approved anomaly rules against current and baseline sliding windows."""
        now = evaluation_time or datetime.now(UTC)
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)

        current_start = now - timedelta(hours=1)
        current_end = now
        baseline_start = now - timedelta(days=7)
        baseline_end = current_start

        findings: list[AnomalyFinding] = []

        # Gather window data via AnalyticsQueries
        current_reqs = await AnalyticsQueries.get_overview_counts(session, organization_id, current_start, current_end)
        baseline_reqs = await AnalyticsQueries.get_overview_counts(
            session, organization_id, baseline_start, baseline_end
        )

        current_requests_count = current_reqs["total_invocations"]
        baseline_requests_count = baseline_reqs["total_invocations"]

        # ----------------------------------------------------------------------
        # Rule A: Denial-Rate Spike
        # ----------------------------------------------------------------------
        if current_requests_count < 20 or baseline_requests_count < 100:
            findings.append(
                AnomalyFinding(
                    anomaly_type=AnomalyType.DENIAL_RATE_SPIKE,
                    severity=AnomalySeverity.INFO,
                    status=AnomalyStatus.INSUFFICIENT_DATA,
                    current_samples=current_requests_count,
                    baseline_samples=baseline_requests_count,
                    explanation=(
                        f"Insufficient request samples for denial-rate analysis "
                        f"(current: {current_requests_count}/20, baseline: {baseline_requests_count}/100)."
                    ),
                    evaluated_at=now,
                )
            )
        else:
            curr_deny_rate = current_reqs["deny_count"] / current_requests_count if current_requests_count > 0 else 0.0
            base_deny_rate = (
                baseline_reqs["deny_count"] / baseline_requests_count if baseline_requests_count > 0 else 0.0
            )
            effective_base_deny_rate = base_deny_rate if base_deny_rate > 0.0 else 0.05
            threshold = 2.5 * effective_base_deny_rate

            if curr_deny_rate >= 0.20 and curr_deny_rate >= threshold:
                findings.append(
                    AnomalyFinding(
                        anomaly_type=AnomalyType.DENIAL_RATE_SPIKE,
                        severity=AnomalySeverity.HIGH,
                        status=AnomalyStatus.TRIGGERED,
                        current_value=round(curr_deny_rate, 4),
                        baseline_value=round(effective_base_deny_rate, 4),
                        threshold=round(threshold, 4),
                        current_samples=current_requests_count,
                        baseline_samples=baseline_requests_count,
                        explanation=(
                            f"Governance denial rate spiked to {curr_deny_rate * 100:.1f}% in the last hour, "
                            f"exceeding the 20% floor and 2.5x effective baseline "
                            f"({effective_base_deny_rate * 100:.1f}%)."
                        ),
                        evaluated_at=now,
                    )
                )
            else:
                findings.append(
                    AnomalyFinding(
                        anomaly_type=AnomalyType.DENIAL_RATE_SPIKE,
                        severity=AnomalySeverity.INFO,
                        status=AnomalyStatus.NORMAL,
                        current_value=round(curr_deny_rate, 4),
                        baseline_value=round(effective_base_deny_rate, 4),
                        threshold=round(threshold, 4),
                        current_samples=current_requests_count,
                        baseline_samples=baseline_requests_count,
                        explanation="Governance denial rate is within normal operating baseline.",
                        evaluated_at=now,
                    )
                )

        # ----------------------------------------------------------------------
        # Rule B: Critical Risk Surge
        # ----------------------------------------------------------------------
        current_risk = await AnalyticsQueries.get_risk_distribution_stats(
            session, organization_id, current_start, current_end
        )
        current_assessments = current_risk["total_assessments"]

        if current_assessments < 20:
            findings.append(
                AnomalyFinding(
                    anomaly_type=AnomalyType.CRITICAL_RISK_SURGE,
                    severity=AnomalySeverity.INFO,
                    status=AnomalyStatus.INSUFFICIENT_DATA,
                    current_samples=current_assessments,
                    baseline_samples=None,
                    explanation=(
                        f"Insufficient risk assessment samples in current window ({current_assessments}/20 required)."
                    ),
                    evaluated_at=now,
                )
            )
        else:
            critical_rate = current_risk["critical_count"] / current_assessments if current_assessments > 0 else 0.0
            critical_threshold = 0.15

            if critical_rate >= critical_threshold:
                findings.append(
                    AnomalyFinding(
                        anomaly_type=AnomalyType.CRITICAL_RISK_SURGE,
                        severity=AnomalySeverity.CRITICAL,
                        status=AnomalyStatus.TRIGGERED,
                        current_value=round(critical_rate, 4),
                        baseline_value=None,
                        threshold=critical_threshold,
                        current_samples=current_assessments,
                        baseline_samples=None,
                        explanation=(
                            f"Critical risk assessment rate surged to {critical_rate * 100:.1f}% "
                            f"in the last hour, exceeding the 15% threshold."
                        ),
                        evaluated_at=now,
                    )
                )
            else:
                findings.append(
                    AnomalyFinding(
                        anomaly_type=AnomalyType.CRITICAL_RISK_SURGE,
                        severity=AnomalySeverity.INFO,
                        status=AnomalyStatus.NORMAL,
                        current_value=round(critical_rate, 4),
                        baseline_value=None,
                        threshold=critical_threshold,
                        current_samples=current_assessments,
                        baseline_samples=None,
                        explanation="Critical risk assessment rate is within normal operational limits.",
                        evaluated_at=now,
                    )
                )

        # ----------------------------------------------------------------------
        # Rule C: Evaluation Latency SLA Degradation
        # ----------------------------------------------------------------------
        current_eval_stats, _ = await AnalyticsQueries.get_latency_stats(
            session, organization_id, current_start, current_end
        )
        baseline_eval_stats, _ = await AnalyticsQueries.get_latency_stats(
            session, organization_id, baseline_start, baseline_end
        )

        curr_lat_samples = current_eval_stats["count"]
        base_lat_samples = baseline_eval_stats["count"]

        if curr_lat_samples < 20 or base_lat_samples < 100:
            findings.append(
                AnomalyFinding(
                    anomaly_type=AnomalyType.LATENCY_SLA_DEGRADATION,
                    severity=AnomalySeverity.INFO,
                    status=AnomalyStatus.INSUFFICIENT_DATA,
                    current_samples=curr_lat_samples,
                    baseline_samples=base_lat_samples,
                    explanation=(
                        f"Insufficient latency samples for SLA degradation evaluation "
                        f"(current: {curr_lat_samples}/20, baseline: {base_lat_samples}/100)."
                    ),
                    evaluated_at=now,
                )
            )
        else:
            curr_p95 = current_eval_stats["p95"]
            base_p95 = baseline_eval_stats["p95"]

            if curr_p95 is None or base_p95 is None:
                findings.append(
                    AnomalyFinding(
                        anomaly_type=AnomalyType.LATENCY_SLA_DEGRADATION,
                        severity=AnomalySeverity.INFO,
                        status=AnomalyStatus.INSUFFICIENT_DATA,
                        current_samples=curr_lat_samples,
                        baseline_samples=base_lat_samples,
                        explanation="Missing percentile data for latency evaluation.",
                        evaluated_at=now,
                    )
                )
            else:
                lat_threshold = max(50.0, 3.0 * base_p95)
                if curr_p95 >= 50.0 and curr_p95 >= 3.0 * base_p95:
                    findings.append(
                        AnomalyFinding(
                            anomaly_type=AnomalyType.LATENCY_SLA_DEGRADATION,
                            severity=AnomalySeverity.HIGH,
                            status=AnomalyStatus.TRIGGERED,
                            current_value=round(curr_p95, 3),
                            baseline_value=round(base_p95, 3),
                            threshold=round(lat_threshold, 3),
                            current_samples=curr_lat_samples,
                            baseline_samples=base_lat_samples,
                            explanation=(
                                f"Governance evaluation p95 latency degraded to {curr_p95:.1f}ms "
                                f"(baseline p95: {base_p95:.1f}ms; threshold: 50.0ms and 3x baseline)."
                            ),
                            evaluated_at=now,
                        )
                    )
                else:
                    findings.append(
                        AnomalyFinding(
                            anomaly_type=AnomalyType.LATENCY_SLA_DEGRADATION,
                            severity=AnomalySeverity.INFO,
                            status=AnomalyStatus.NORMAL,
                            current_value=round(curr_p95, 3),
                            baseline_value=round(base_p95, 3),
                            threshold=round(lat_threshold, 3),
                            current_samples=curr_lat_samples,
                            baseline_samples=base_lat_samples,
                            explanation="Governance evaluation p95 latency meets operational SLA.",
                            evaluated_at=now,
                        )
                    )

        return AnomalyReport(
            organization_id=organization_id,
            evaluated_at=now,
            findings=findings,
        )
