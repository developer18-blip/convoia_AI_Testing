import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import {
  executePython,
  worstCaseWalletTokens,
  SANDBOX_SPEC,
  acquireSlot,
  releaseSlot,
} from '../services/sandboxService.js';
import logger from '../config/logger.js';

/**
 * POST /api/sandbox/execute-python
 * Body: { code: string }
 *
 * Pre-flight wallet check uses WORST-CASE cost (full 30s timeout).
 * Actual deduction is for true elapsed time. This trades off
 * predictability for slight over-reservation — a user with the
 * worst-case balance threshold can always complete a run.
 */
export const executePythonHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const userId = req.user.userId;

  const code = req.body?.code;
  if (typeof code !== 'string' || code.length === 0) {
    throw new AppError('code (string) is required', 400);
  }
  if (code.length > SANDBOX_SPEC.maxCodeChars) {
    throw new AppError(
      `code exceeds ${SANDBOX_SPEC.maxCodeChars}-character limit`,
      400,
    );
  }

  // Concurrency cap — one sandbox per user at a time. Slot is held
  // in sandboxService so the agent-orchestrator execute_python tool
  // shares the same gate.
  if (!acquireSlot(userId)) {
    return res.status(429).json({
      success: false,
      code: 'SANDBOX_BUSY',
      message: 'A previous sandbox run is still active. Please wait for it to finish.',
    });
  }

  // Wallet pre-flight — worst-case cost so we never partial-charge.
  const worstCase = worstCaseWalletTokens();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, organizationId: true },
  });
  if (!user) {
    releaseSlot(userId);
    throw new AppError('User not found', 404);
  }

  const balance = await TokenWalletService.getBalance(userId);
  if (balance.tokenBalance < worstCase) {
    releaseSlot(userId);
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: isOrgMember
        ? `Code Interpreter needs up to ${TokenWalletService.formatTokens(worstCase)} tokens per run. You have ${TokenWalletService.formatTokens(balance.tokenBalance)}. Contact your manager for more tokens.`
        : `Code Interpreter needs up to ${TokenWalletService.formatTokens(worstCase)} tokens per run. You have ${TokenWalletService.formatTokens(balance.tokenBalance)}.`,
      currentBalance: balance.tokenBalance,
      estimatedRequired: worstCase,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }

  let result;
  try {
    // userId enables plot storage partitioning under
    // uploads/sandbox-plots/<userId>/. Attachments live in the agent
    // tool path only — the raw HTTP endpoint has no conversation
    // context to resolve them from.
    result = await executePython(code, { userId });
  } finally {
    releaseSlot(userId);
  }

  // Billing rule:
  //   provision failure → no charge (we ate the cost, no E2B usage)
  //   everything else   → charge for actual elapsed time
  let tokensCharged = 0;
  let balanceAfter = balance.tokenBalance;

  if (result.walletTokensToDeduct > 0 && result.error?.kind !== 'provision') {
    tokensCharged = await TokenWalletService.deductTokens({
      userId,
      tokens: result.walletTokensToDeduct,
      reference: `sandbox-py-${Date.now()}`,
      description: `Python sandbox (${result.executionTimeSec.toFixed(2)}s)`,
      organizationId: user.organizationId || undefined,
    });
    const refreshed = await TokenWalletService.getBalance(userId);
    balanceAfter = refreshed.tokenBalance;
  }

  // Audit trail — Phase 2 §2.4: skip dedicated SandboxLog table,
  // logger.info + TokenTransaction is sufficient for Day 1.
  logger.info(
    `sandbox.execute userId=${userId} success=${result.success} ` +
    `kind=${result.error?.kind || 'ok'} ` +
    `elapsedSec=${result.executionTimeSec.toFixed(2)} ` +
    `dollarCost=${result.dollarCost.toFixed(6)} ` +
    `tokensCharged=${tokensCharged}`,
  );

  // Provision failure → 503 so the caller knows it's a service issue,
  // not their code. Same path the chatbot uses when ANTHROPIC_API_KEY
  // is missing.
  if (result.error?.kind === 'provision') {
    return res.status(503).json({
      success: false,
      code: 'SANDBOX_UNAVAILABLE',
      message: 'Code Interpreter is temporarily unavailable. No tokens were charged.',
    });
  }

  return res.json({
    success: result.success,
    data: {
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error
        ? {
            kind: result.error.kind,
            message: result.error.message,
            traceback: result.error.traceback,
          }
        : null,
      executionTimeSec: Number(result.executionTimeSec.toFixed(2)),
      tokensCharged,
      balanceAfter,
      plots: result.plots ?? [],
    },
  });
});
