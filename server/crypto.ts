import crypto from 'node:crypto';

/** Deriva uma chave de 32 bytes a partir do segredo configurado. */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw || 'stream-command-dev-token-key').digest();
}

/** Criptografa tokens de terceiros (AES-256-GCM) antes de gravar no banco. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), enc.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  const [version, ivB64, dataB64, tagB64] = payload.split('.');
  if (version !== 'v1' || !ivB64 || !dataB64 || !tagB64) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const pkcePair = () => {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};
