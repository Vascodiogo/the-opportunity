import { useMemo } from "react";

/**
 * PermissionSteps
 * Sits directly above the Subscribe button on PayPage.jsx.
 * Shows the subscriber exactly what they'll be asked to approve, before they click.
 *
 * Your handleApprove() has three real on-chain paths — this component must
 * match whichever one is actually executing, or it misleads the subscriber:
 *
 *   "permit"  — fresh allowance, permit-capable token (USDC/EURC).
 *               1 free signature, then 1 on-chain tx.
 *   "legacy"  — fresh allowance, non-permit token (USDT), or a permit
 *               attempt that failed and fell back.
 *               2 on-chain txs: approve, then subscribe.
 *   "direct"  — allowance already sufficient (e.g. from an earlier test or a
 *               prior approval), any token.
 *               1 on-chain tx, no signing, no separate approve step.
 *
 * @param {string} tokenSymbol - e.g. 'USDC' | 'EURC' | 'USDT'
 * @param {number} activeStep - 0 = idle (pre-click), then increments per step
 *                              in the mode's step list, final value = done.
 * @param {"permit"|"legacy"|"direct"} mode
 */
export default function PermissionSteps({ tokenSymbol, activeStep = 0, mode = "legacy" }) {
  const { headline, steps } = useMemo(() => {
    if (mode === "direct") {
      return {
        headline: "Already approved — one transaction",
        steps: [
          { label: "Confirm subscription", detail: `${tokenSymbol || "Token"} spending already approved` },
        ],
      };
    }
    if (mode === "permit") {
      return {
        headline: "One signature, one transaction",
        steps: [
          { label: "Sign authorization", detail: "Free, no gas" },
          { label: "Confirm subscription", detail: "One transaction" },
        ],
      };
    }
    return {
      headline: "Two transactions required",
      steps: [
        { label: `Approve ${tokenSymbol || "token"} spending`, detail: "On-chain transaction" },
        { label: "Confirm subscription", detail: "On-chain transaction" },
      ],
    };
  }, [mode, tokenSymbol]);

  return (
    <div
      role="group"
      aria-label="Steps to subscribe"
      style={{
        background: "var(--bg-tag)",
        border: "0.5px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        {headline}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const isDone = activeStep > stepNum;
          const isCurrent = activeStep === stepNum;

          return (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  background: isDone
                    ? "rgba(29,158,117,0.2)"
                    : isCurrent
                    ? "rgba(29,158,117,0.12)"
                    : "var(--bg-card)",
                  border: `1px solid ${
                    isDone ? "rgba(29,158,117,0.5)" : isCurrent ? "rgba(29,158,117,0.4)" : "var(--border)"
                  }`,
                  color: isDone || isCurrent ? "var(--green)" : "var(--text-muted)",
                }}
              >
                {isDone ? "✓" : stepNum}
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isDone || isCurrent ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {step.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{step.detail}</span>
              </div>
              {isCurrent && (
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--green)" }}>In progress</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
