import type { ExternalRecord } from "@/mandate/adapters";
import { CLAIM_TYPES, type Claim, type ClaimType } from "@/mandate/types";
import type { CloseSummary } from "./ledger";

export type ReportTrendPoint = {
  id: string;
  created_at: number;
  passed_percent: number;
  attention_percent: number;
  inconclusive_percent: number;
  payments: number;
};

export type IssueBreakdownPoint = {
  type: ClaimType;
  count: number;
};

export type DashboardAnalytics = {
  trend: ReportTrendPoint[];
  issues: IssueBreakdownPoint[];
  payment_value_with_issues: number;
  payments_with_issues: number;
};

type CloseHistoryRow = Pick<CloseSummary, "id" | "created_at" | "proven" | "excepted" | "abstained" | "sales">;

/**
 * Derive dashboard charts from signed report outcomes and persisted payment
 * records. This deliberately does not estimate or interpolate missing data.
 */
export function buildDashboardAnalytics(
  latestClaims: Claim[],
  historyNewestFirst: CloseHistoryRow[],
  records: ExternalRecord[]
): DashboardAnalytics {
  const trend = historyNewestFirst.slice(0, 12).reverse().map((report) => {
    const total = report.proven + report.excepted + report.abstained;
    return {
      id: report.id,
      created_at: report.created_at,
      passed_percent: total ? Math.round((report.proven / total) * 100) : 0,
      attention_percent: total ? Math.round((report.excepted / total) * 100) : 0,
      inconclusive_percent: total ? Math.round((report.abstained / total) * 100) : 0,
      payments: report.sales,
    };
  });

  const issues = CLAIM_TYPES.map((type) => ({
    type,
    count: latestClaims.filter((claim) => claim.type === type && claim.status !== "PROVEN").length,
  })).filter((point) => point.count > 0).sort((a, b) => b.count - a.count);

  const affectedSales = new Set(
    latestClaims.filter((claim) => claim.status !== "PROVEN").map((claim) => claim.sale_id)
  );
  const affectedRecords = records.filter((record) =>
    affectedSales.has(record.sale_id || `sale_${record.payment.id}`)
  );

  return {
    trend,
    issues,
    payment_value_with_issues: affectedRecords.reduce((sum, record) => sum + record.payment.amount_minor, 0),
    payments_with_issues: affectedRecords.length,
  };
}
