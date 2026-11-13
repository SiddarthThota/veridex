"use client";

/**
 * Human Approvals Review Queue & Governance Gateway (Phase 9.4).
 *
 * Route: /approvals
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR
 * Action Access: ADMIN, SECURITY_ANALYST (canDecideApproval)
 *
 * All operations interface strictly through same-origin Next.js BFF routes:
 * - GET  /api/bff/governance/approvals
 * - GET  /api/bff/governance/approvals/{id}
 * - POST /api/bff/governance/approvals/{id}/decide
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useApprovals } from "@/lib/approvals/use-approvals";
import { ApprovalsHeader } from "@/components/approvals/approvals-header";
import { ApprovalsFilters } from "@/components/approvals/approvals-filters";
import { ApprovalsQueueTable } from "@/components/approvals/approvals-queue-table";
import { ApprovalDetailDrawer } from "@/components/approvals/approval-detail-drawer";

export default function ApprovalsPage() {
  const {
    items,
    total,
    totalPages,
    page,
    pageSize,
    statusFilter,
    loading,
    error,
    lastUpdated,
    selectedApproval,
    submitting,
    decisionError,
    decisionSuccess,
    autoRefreshInterval,
    setStatusFilter,
    setPage,
    setPageSize,
    setAutoRefreshInterval,
    selectApproval,
    submitDecision,
    clearDecisionState,
    refresh,
  } = useApprovals({
    initialStatus: "PENDING",
    initialPageSize: 25,
    initialAutoRefreshSeconds: 0,
  });

  // Calculate pending count from current items or filter status
  const pendingCount =
    statusFilter === "PENDING"
      ? total
      : items.filter((item) => item.status === "PENDING").length;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Metrics & Actions */}
        <ApprovalsHeader
          pendingCount={pendingCount}
          totalCount={total}
          loading={loading}
          lastUpdated={lastUpdated}
          autoRefreshInterval={autoRefreshInterval}
          onAutoRefreshChange={setAutoRefreshInterval}
          onRefresh={refresh}
        />

        {/* Status Filter Tabs & Pagination Bar */}
        <ApprovalsFilters
          currentStatus={statusFilter}
          onStatusChange={setStatusFilter}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />

        {/* Main Queue Table */}
        <ApprovalsQueueTable
          items={items}
          loading={loading}
          error={error}
          statusFilter={statusFilter}
          selectedApprovalId={selectedApproval?.id}
          onSelectApproval={selectApproval}
          onResetFilter={() => setStatusFilter("ALL")}
          onRetry={refresh}
        />

        {/* Slide-over Detail Drawer */}
        <ApprovalDetailDrawer
          approval={selectedApproval}
          submitting={submitting}
          decisionError={decisionError}
          decisionSuccess={decisionSuccess}
          onDecision={submitDecision}
          onClose={() => selectApproval(null)}
          onClearDecisionState={clearDecisionState}
        />
      </div>
    </AppShell>
  );
}
