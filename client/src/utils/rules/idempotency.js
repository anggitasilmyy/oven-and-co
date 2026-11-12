// utils/rules/idempotency.js
// CR-04a CP3 · BR-31 (Draft 0.8.3 §5.1 – §5.2) — aturan murni idempotensi `request_id`:
//   - format UUID v4 kanonik (huruf kecil); allowlist operasi wajib/opsional; di luar allowlist → 400;
//   - payload kanonik: field operasi tanpa request_id, kunci diurutkan, string di-trim, BigInt/angka → teks, desimal
//     sudah dinormalisasi validator (2 desimal) dan array baris sudah diurutkan per ID item/bahan;
//   - SHA-256 heksadesimal huruf kecil dari UTF-8 (lihat payloadHash di bawah; client: utils/rules/idempotency.js);
//   - duplikat: aktor + operasi + target + hash sama → replay respons asli; berbeda → 409 REQUEST_ID_REUSED.
// Penyimpanan `operation_requests`, nilai sementara 102, dan penanganan kunci (REQUEST_IN_PROGRESS) = CP4.
// Port dari server services/idempotencyRules.service.js — perilaku & pesan identik (uji silang client tests/vitest/purchasingRules.test.mjs).

import { REQUEST_ID_POLICY, LEDGER_ERROR_CODE } from '../../constants/purchasing';

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * @param {string|null} operation — nama operasi allowlist; null = endpoint di luar allowlist
 * @param {unknown} requestId — nilai dari body/query (undefined bila tidak dikirim)
 * @returns {null | {status: 400, message: string}}
 */
function requestIdPolicyError(operation, requestId) {
  const policy = operation ? REQUEST_ID_POLICY[operation] : undefined;
  const sent = requestId !== undefined;
  if (!policy) return sent ? { status: 400, message: 'request_id tidak diterima pada endpoint ini.' } : null;
  if (!sent) return policy === 'required' ? { status: 400, message: 'request_id wajib diisi.' } : null;
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) return { status: 400, message: 'request_id harus UUID v4 huruf kecil.' };
  return null;
}

function canonicalValue(value) {
  if (value === null) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'bigint' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === 'object') {
    return Object.keys(value).filter((k) => k !== 'request_id' && value[k] !== undefined).sort()
      .reduce((out, k) => ({ ...out, [k]: canonicalValue(value[k]) }), {});
  }
  throw new Error(`Tipe payload tidak didukung: ${typeof value}`);
}

/** Payload ter-normalisasi → teks JSON kanonik (kunci urut, tanpa request_id) */
function canonicalJson(payload) {
  return JSON.stringify(canonicalValue(payload));
}

/** SHA-256 heksadesimal huruf kecil dari teks kanonik (UTF-8) — Web Crypto (async) di browser; hasil = server */
async function payloadHash(payload) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(payload)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Keputusan saat request_id sudah tersimpan (§5.2 langkah 4).
 * @param {{actor_id, operation, target_type, target_id, payload_hash, response_status, response_body}} stored
 * @param {{actor_id, operation, target_type, target_id, payload_hash}} incoming
 */
function duplicateRequestDecision(stored, incoming) {
  const same = ['actor_id', 'operation', 'target_type', 'target_id', 'payload_hash']
    .every((k) => String(stored[k] ?? '') === String(incoming[k] ?? ''));
  if (!same) return { action: 'reject', status: 409, code: LEDGER_ERROR_CODE.REQUEST_ID_REUSED, message: 'request_id sudah dipakai untuk permintaan lain.' };
  return { action: 'replay', status: stored.response_status, body: stored.response_body, headers: { 'Idempotent-Replay': 'true' } };
}

export { REQUEST_ID_PATTERN, requestIdPolicyError, canonicalJson, payloadHash, duplicateRequestDecision };
