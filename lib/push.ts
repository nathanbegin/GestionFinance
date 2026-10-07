import webpush from "web-push";
import { createECDH, createHash, createHmac } from "node:crypto";
import { q } from "./db";

/**
 * Clés VAPID dérivées de AUTH_SECRET : aucune variable d'environnement supplémentaire à configurer.
 * (Changer AUTH_SECRET invalide les abonnements : les appareils devront réactiver les notifications.)
 */
function vapidKeys() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET manquant ou trop court");
  let d = createHmac("sha256", secret).update("gestionfinance-vapid-v1").digest();
  for (;;) {
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(d);
      return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: d.toString("base64url") };
    } catch {
      d = createHash("sha256").update(d).digest(); // scalaire hors plage (extrêmement rare)
    }
  }
}

export function vapidPublicKey(): string {
  return vapidKeys().publicKey;
}

function subject(): string {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "https://localhost";
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Envoie une notification aux autres participants du compte (jamais à l'auteur de l'action). */
export async function notifyLedger(ledgerId: number, actorId: number, payload: PushPayload) {
  try {
    const subs = await q<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT DISTINCT s.endpoint, s.p256dh, s.auth
       FROM push_subscriptions s JOIN ledger_members m ON m.user_id = s.user_id
       WHERE m.ledger_id = $1 AND s.user_id <> $2`,
      [ledgerId, actorId],
    );
    if (!subs.length) return;
    const keys = vapidKeys();
    webpush.setVapidDetails(subject(), keys.publicKey, keys.privateKey);
    const body = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60 * 24,
          });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // 404 / 410 : l'abonnement n'existe plus (application désinstallée, permission retirée)
          if (code === 404 || code === 410) await q("DELETE FROM push_subscriptions WHERE endpoint = $1", [s.endpoint]);
        }
      }),
    );
  } catch (e) {
    console.error("notifyLedger:", e);
  }
}
