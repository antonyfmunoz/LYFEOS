import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiResponseError, apiRequest, queryClient } from "@/lib/queryClient";

type ApprovalChoice = "allow_once" | "always_allow" | "deny";

type ApprovalRequest = {
  id: string;
  app: string;
  title: string;
  summary: string;
  capability: "read" | "import" | "write";
  risk: "low" | "medium" | "important" | "high";
  expiresAt: string | null;
  choices: ApprovalChoice[];
};

type ApprovalErrorPayload = {
  code?: string;
  approvalRequest?: ApprovalRequest;
};

type PendingApproval = {
  request: ApprovalRequest;
  retry: (approvalId: string) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type ApprovalContextValue = {
  runWithApproval: <T>(request: (approvalId?: string) => Promise<T>) => Promise<T>;
};

export class IntegrationActionDeniedError extends Error {
  constructor() {
    super("Connected-app action cancelled");
    this.name = "IntegrationActionDeniedError";
  }
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

function approvalRequestFrom(error: unknown): ApprovalRequest | null {
  if (!(error instanceof ApiResponseError) || error.status !== 428) return null;
  const payload = error.payload as ApprovalErrorPayload | null;
  return payload?.code === "integration_action_approval_required" && payload.approvalRequest
    ? payload.approvalRequest
    : null;
}

export function IntegrationActionApprovalProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [submitting, setSubmitting] = useState<ApprovalChoice | null>(null);

  const runWithApproval = useCallback(async <T,>(request: (approvalId?: string) => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      const approvalRequest = approvalRequestFrom(error);
      if (!approvalRequest) throw error;
      return await new Promise<T>((resolve, reject) => {
        setPending((current) => {
          if (current) {
            reject(new Error("Finish the current connected-app approval first."));
            return current;
          }
          return {
            request: approvalRequest,
            retry: request as (approvalId: string) => Promise<unknown>,
            resolve: resolve as (value: unknown) => void,
            reject,
          };
        });
      });
    }
  }, []);

  const decide = useCallback(async (decision: ApprovalChoice) => {
    if (!pending || submitting) return;
    setSubmitting(decision);
    try {
      await apiRequest(`/api/google/approvals/${pending.request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/google/action-receipts"] });
      if (decision === "deny") {
        pending.reject(new IntegrationActionDeniedError());
      } else {
        if (decision === "always_allow") {
          await queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
        }
        pending.resolve(await pending.retry(pending.request.id));
        await queryClient.invalidateQueries({ queryKey: ["/api/google/action-receipts"] });
      }
      setPending(null);
    } catch (error) {
      pending.reject(error);
      setPending(null);
    } finally {
      setSubmitting(null);
    }
  }, [pending, submitting]);

  const value = useMemo<ApprovalContextValue>(() => ({ runWithApproval }), [runWithApproval]);
  const riskLabel = pending?.request.risk === "high" ? "High risk"
    : pending?.request.risk === "important" ? "Important action"
      : pending?.request.risk === "medium" ? "Changes LyfeOS"
        : "Read action";

  return (
    <ApprovalContext.Provider value={value}>
      {children}
      <AlertDialog open={Boolean(pending)}>
        <AlertDialogContent aria-describedby="integration-approval-description" className="max-w-md">
          <AlertDialogHeader>
            <div className="mb-1 flex items-center gap-2 text-primary">
              {pending?.request.risk === "high" ? <TriangleAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              <span className="text-xs font-mono uppercase tracking-wider">Connected app approval</span>
            </div>
            <AlertDialogTitle>{pending?.request.title}</AlertDialogTitle>
            <AlertDialogDescription id="integration-approval-description" className="space-y-3">
              <span className="block">{pending?.request.summary}</span>
              <span className="block rounded-md border border-primary/15 bg-primary/5 p-3 text-left">
                <span className="block text-xs font-medium text-foreground">{pending?.request.app}</span>
                <span className="mt-1 block text-xs">{riskLabel} · {pending?.request.capability} permission</span>
              </span>
              <span className="block text-xs">Allow once authorizes only this exact request. Always allow changes this app’s approval setting; high-risk actions can still require confirmation.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" disabled={Boolean(submitting)} onClick={() => void decide("deny")}>
              {submitting === "deny" ? "Denying…" : "Deny"}
            </Button>
            <Button type="button" variant="secondary" disabled={Boolean(submitting)} onClick={() => void decide("allow_once")}>
              {submitting === "allow_once" ? "Allowing…" : "Allow once"}
            </Button>
            <Button type="button" disabled={Boolean(submitting)} onClick={() => void decide("always_allow")}>
              {submitting === "always_allow" ? "Saving…" : "Always allow"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ApprovalContext.Provider>
  );
}

export function useIntegrationActionApproval(): ApprovalContextValue {
  const context = useContext(ApprovalContext);
  if (!context) throw new Error("useIntegrationActionApproval must be used within IntegrationActionApprovalProvider");
  return context;
}
