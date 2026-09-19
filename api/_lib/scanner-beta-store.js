import { getSupabase } from './supabase.js';

function checked(result, code) {
  if (result?.error) throw new Error(`${code}_${result.error.code || 'ERROR'}`);
  return Array.isArray(result?.data) ? result.data[0] : result?.data;
}

export function createScannerBetaSupabaseStore(client = getSupabase()) {
  return Object.freeze({
    async putScan({ snapshot, snapshotHash, metadata }) {
      return checked(await client.rpc('submit_scanner_beta_scan', {
        p_snapshot: snapshot, p_snapshot_hash: snapshotHash, p_metadata: metadata
      }), 'SCANNER_BETA_SCAN');
    },
    async getScan(scanId) {
      return checked(await client.from('scanner_beta_scans').select('scan_id,snapshot,snapshot_hash,image_storage_reference').eq('scan_id', scanId).maybeSingle(), 'SCANNER_BETA_SCAN_READ');
    },
    async putFeedback({ feedback, payloadHash }) {
      return checked(await client.rpc('submit_scanner_beta_feedback', {
        p_feedback: feedback, p_payload_hash: payloadHash
      }), 'SCANNER_BETA_FEEDBACK');
    },
    async putImage({ imageHash, bytes, contentType }) {
      const key = `${imageHash.slice(0, 2)}/${imageHash}`;
      const result = await client.storage.from('scanner-beta-images').upload(key, bytes, {
        contentType, upsert: false, cacheControl: '0'
      });
      if (result.error && result.error.statusCode !== '409') throw new Error(`SCANNER_BETA_IMAGE_${result.error.statusCode || 'ERROR'}`);
      return `supabase://scanner-beta-images/${key}`;
    }
  });
}
