// Transactional confirmation email (plain-text + HTML). No marketing content.

export const buildVerifyUrl = (siteUrl: string, rawToken: string): string => {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/claim/verify?token=${encodeURIComponent(rawToken)}`;
};

export const confirmationSubject = (username: string): string =>
  `Confirm your shadercn orb: @${username}`;

export const confirmationText = (username: string, verifyUrl: string): string =>
  [
    `Hi @${username},`,
    ``,
    `Confirm your shadercn orb claim by opening this link (expires in 15 minutes):`,
    ``,
    verifyUrl,
    ``,
    `If you didn't request this, you can ignore this email.`,
    `This is a transactional message — you're not subscribed to anything.`,
  ].join("\n");

export const confirmationHtml = (
  username: string,
  verifyUrl: string
): string => {
  const safeUser = username.replaceAll(
    /[<>&"]/g,
    (c) => `&#${c.codePointAt(0)};`
  );
  return [
    `<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">`,
    `<p>Hi @${safeUser},</p>`,
    `<p>Confirm your shadercn orb claim. This link expires in 15 minutes:</p>`,
    `<p><a href="${verifyUrl}">Verify @${safeUser}</a></p>`,
    `<p style="color:#666;font-size:13px">If you didn't request this, ignore this email. Transactional only — no subscription added.</p>`,
    `</div>`,
  ].join("");
};
