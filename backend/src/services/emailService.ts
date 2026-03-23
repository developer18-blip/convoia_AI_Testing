import { Resend } from 'resend';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const resend = config.resendApiKey
  ? new Resend(config.resendApiKey)
  : null;

const FROM = 'Convoia AI <onboarding@resend.dev>';
const BRAND_COLOR = '#7C3AED';
const FRONTEND_URL = config.frontendUrl;

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: Inter, -apple-system, sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
  .container { max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .header { background: ${BRAND_COLOR}; padding: 28px 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 18px; font-weight: 600; }
  .body { padding: 28px 32px; }
  .btn { display: inline-block; background: ${BRAND_COLOR}; color: white !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .muted { color: #71717a; font-size: 13px; }
  .footer { text-align: center; padding: 16px 32px; background: #fafafa; font-size: 11px; color: #a1a1aa; }
  .badge { display: inline-block; background: ${BRAND_COLOR}15; color: ${BRAND_COLOR}; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .label { color: #71717a; }
  .value { font-weight: 500; color: #18181b; }
</style>
</head><body>
<div class="container">
  <div class="header"><h1>${title}</h1></div>
  <div class="body">${body}</div>
  <div class="footer">Convoia AI &middot; All rights reserved</div>
</div>
</body></html>`;
}

export class EmailService {
  /**
   * Send email verification OTP code.
   */
  static async sendVerificationCode(params: {
    recipientEmail: string;
    name: string;
    code: string;
  }) {
    const { recipientEmail, name, code } = params;

    // Always log code in dev for testing without real email
    logger.info(`[VERIFICATION] Code for ${recipientEmail}: ${code}`);

    if (!resend) {
      logger.warn('Resend not configured — verification code logged above');
      return;
    }

    const body = `
      <p style="color:#3f3f46; margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
      <p style="color:#3f3f46; margin:0 0 20px;">Enter this verification code to complete your registration:</p>
      <div style="text-align:center; margin:24px 0;">
        <div style="display:inline-block; background:#fafafa; border:2px dashed ${BRAND_COLOR}40; border-radius:12px; padding:16px 40px;">
          <span style="font-size:32px; font-weight:700; letter-spacing:8px; color:${BRAND_COLOR}; font-family:monospace;">${code}</span>
        </div>
      </div>
      <p class="muted" style="text-align:center;">This code expires in <strong>10 minutes</strong>.</p>
      <p class="muted" style="margin-top:20px;">If you didn't create an account on Convoia AI, please ignore this email.</p>
    `;

    try {
      await resend.emails.send({
        from: FROM,
        to: recipientEmail,
        subject: `${code} is your Convoia AI verification code`,
        html: baseTemplate('Verify Your Email', body),
      });
      logger.info(`Verification email sent to ${recipientEmail}`);
    } catch (err) {
      logger.error('Failed to send verification email:', err);
    }
  }

  /**
   * Send organization invite email.
   */
  static async sendInviteEmail(params: {
    recipientEmail: string;
    inviterName: string;
    orgName: string;
    role: string;
    inviteToken: string;
    tokensAllocated?: number;
    expiresAt: Date;
  }) {
    if (!resend) { logger.warn('Resend not configured — skipping invite email'); return; }

    const { recipientEmail, inviterName, orgName, role, inviteToken, tokensAllocated, expiresAt } = params;
    const joinUrl = `${FRONTEND_URL}/join?token=${inviteToken}`;
    const roleLabel = role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    const expiryStr = expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const tokenLine = tokensAllocated && tokensAllocated > 0
      ? `<div class="row"><span class="label">Tokens allocated</span><span class="value">${(tokensAllocated / 1000).toFixed(0)}K tokens</span></div>`
      : '';

    const body = `
      <p style="color:#3f3f46; margin:0 0 16px;">You've been invited to join <strong>${orgName}</strong> on Convoia AI.</p>
      <div style="background:#fafafa; border-radius:10px; padding:16px; margin:0 0 20px;">
        <div class="row"><span class="label">Organization</span><span class="value">${orgName}</span></div>
        <div class="row"><span class="label">Your role</span><span class="badge">${roleLabel}</span></div>
        <div class="row"><span class="label">Invited by</span><span class="value">${inviterName}</span></div>
        ${tokenLine}
        <div class="row" style="border:none;"><span class="label">Expires</span><span class="value">${expiryStr}</span></div>
      </div>
      <div style="text-align:center; margin:24px 0;">
        <a href="${joinUrl}" class="btn">Accept Invitation</a>
      </div>
      <p class="muted" style="text-align:center;">Or paste this link: ${joinUrl}</p>
    `;

    try {
      await resend.emails.send({
        from: FROM,
        to: recipientEmail,
        subject: `${inviterName} invited you to join ${orgName} on Convoia AI`,
        html: baseTemplate('You\'re Invited!', body),
      });
      logger.info(`Invite email sent to ${recipientEmail} for org ${orgName}`);
    } catch (err) {
      logger.error('Failed to send invite email:', err);
    }
  }

  /**
   * Notify the org owner when an invitee joins.
   */
  static async sendMemberJoinedEmail(params: {
    ownerEmail: string;
    ownerName: string;
    newMemberName: string;
    newMemberEmail: string;
    newMemberRole: string;
    orgName: string;
  }) {
    if (!resend) { logger.warn('Resend not configured — skipping join notification'); return; }

    const { ownerEmail, ownerName, newMemberName, newMemberEmail, newMemberRole, orgName } = params;
    const roleLabel = newMemberRole.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

    const body = `
      <p style="color:#3f3f46; margin:0 0 8px;">Hi ${ownerName},</p>
      <p style="color:#18181b; font-size:16px; margin:0 0 20px;">A new member has joined <strong>${orgName}</strong>.</p>
      <div style="background:#fafafa; border-radius:10px; padding:16px; margin:0 0 20px;">
        <div class="row"><span class="label">Name</span><span class="value">${newMemberName}</span></div>
        <div class="row"><span class="label">Email</span><span class="value">${newMemberEmail}</span></div>
        <div class="row" style="border:none;"><span class="label">Role</span><span class="badge">${roleLabel}</span></div>
      </div>
      <div style="text-align:center; margin:24px 0;">
        <a href="${FRONTEND_URL}/team" class="btn">View Team</a>
      </div>
    `;

    try {
      await resend.emails.send({
        from: FROM,
        to: ownerEmail,
        subject: `${newMemberName} joined ${orgName}`,
        html: baseTemplate('New Member Joined', body),
      });
      logger.info(`Join notification sent to owner ${ownerEmail}`);
    } catch (err) {
      logger.error('Failed to send join notification:', err);
    }
  }

  /**
   * Notify a user they received tokens.
   */
  static async sendTokenAssignedEmail(params: {
    recipientEmail: string;
    recipientName: string;
    assignerName: string;
    tokensAllocated: number;
    orgName: string;
  }) {
    if (!resend) { logger.warn('Resend not configured — skipping token email'); return; }

    const { recipientEmail, recipientName, assignerName, tokensAllocated, orgName } = params;
    const tokenLabel = tokensAllocated >= 1_000_000
      ? `${(tokensAllocated / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
      : `${(tokensAllocated / 1000).toFixed(0)}K`;

    const body = `
      <p style="color:#3f3f46; margin:0 0 8px;">Hi ${recipientName},</p>
      <p style="color:#18181b; font-size:16px; margin:0 0 20px;">${assignerName} has assigned you <strong>${tokenLabel} tokens</strong> in ${orgName}.</p>
      <div style="text-align:center; margin:24px 0; font-size:48px; font-weight:700; color:${BRAND_COLOR};">${tokenLabel}</div>
      <p class="muted" style="text-align:center;">These tokens are available for AI queries immediately.</p>
      <div style="text-align:center; margin:24px 0;">
        <a href="${FRONTEND_URL}/chat" class="btn">Start Chatting</a>
      </div>
    `;

    try {
      await resend.emails.send({
        from: FROM,
        to: recipientEmail,
        subject: `You received ${tokenLabel} tokens on Convoia AI`,
        html: baseTemplate('Tokens Assigned', body),
      });
      logger.info(`Token assigned email sent to ${recipientEmail}`);
    } catch (err) {
      logger.error('Failed to send token assigned email:', err);
    }
  }

  /**
   * Send token purchase receipt to the org owner.
   */
  static async sendTokenPurchaseReceipt(params: {
    ownerEmail: string;
    ownerName: string;
    orgName: string;
    amount: number;
    tokensReceived: number;
    transactionId: string;
  }) {
    if (!resend) { logger.warn('Resend not configured — skipping purchase receipt'); return; }

    const { ownerEmail, ownerName, orgName, amount, tokensReceived, transactionId } = params;
    const tokenLabel = tokensReceived >= 1_000_000
      ? `${(tokensReceived / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
      : `${(tokensReceived / 1000).toFixed(0)}K`;

    const body = `
      <p style="color:#3f3f46; margin:0 0 8px;">Hi ${ownerName},</p>
      <p style="color:#18181b; font-size:16px; margin:0 0 20px;">Your token purchase for <strong>${orgName}</strong> was successful.</p>
      <div style="text-align:center; margin:24px 0; font-size:48px; font-weight:700; color:${BRAND_COLOR};">+${tokenLabel}</div>
      <div style="background:#fafafa; border-radius:10px; padding:16px; margin:0 0 20px;">
        <div class="row"><span class="label">Amount paid</span><span class="value">$${amount.toFixed(2)}</span></div>
        <div class="row"><span class="label">Tokens received</span><span class="value">${tokenLabel}</span></div>
        <div class="row"><span class="label">Transaction</span><span class="value" style="font-size:11px;font-family:monospace;">${transactionId.slice(0, 20)}...</span></div>
        <div class="row" style="border:none;"><span class="label">Date</span><span class="value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
      </div>
      <div style="text-align:center; margin:24px 0;">
        <a href="${FRONTEND_URL}/org/billing" class="btn">Manage Tokens</a>
      </div>
    `;

    try {
      await resend.emails.send({
        from: FROM,
        to: ownerEmail,
        subject: `Token purchase confirmed — ${tokenLabel} tokens added`,
        html: baseTemplate('Purchase Confirmed', body),
      });
      logger.info(`Token purchase receipt sent to ${ownerEmail}`);
    } catch (err) {
      logger.error('Failed to send purchase receipt:', err);
    }
  }
}
