/**
 * Vercel Serverless Function: POST /api/library/push
 *
 * Upserts positions and collections from the client to the cloud.
 * Also processes deletions for items removed locally.
 * Body: { positions: [...], collections: [...], deletions: [...] }
 * Returns: { synced: { positions, collections, deletions }, serverTime }
 */

import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';

const MAX_ITEMS_PER_PUSH = 200;

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { positions, collections, deletions } = req.body || {};

    try {
        const supabase = getSupabase();

        // Resolve user UUID from clerk_id
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('id')
            .eq('clerk_id', auth.userId)
            .single();

        if (userErr || !user) {
            logError('library_push', 'User not found', { userId: auth.userId });
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = user.id;
        let syncedPositions = 0;
        let syncedCollections = 0;
        let syncedDeletions = 0;

        // Upsert positions
        if (Array.isArray(positions) && positions.length > 0) {
            const batch = positions.slice(0, MAX_ITEMS_PER_PUSH).map(p => ({
                user_id: userId,
                local_id: p.id || p.localId,
                fen: p.fen,
                fen_hash: p.fenHash || null,
                title: p.title || null,
                author: p.author || null,
                source: p.source || null,
                tags: p.tags || [],
                themes: p.themes || [],
                collection_local_id: p.collectionId || null,
                engine_report: p.engineReport || null,
                annotations: p.annotations || [],
                is_favorite: p.isFavorite || false,
                is_archived: p.isArchived || false,
                game_context: p.gameContext || null,
                local_created_at: p.dateAdded || p.localCreatedAt || null,
                local_updated_at: p.dateModified || p.localUpdatedAt || null,
                synced_at: new Date().toISOString()
            }));

            const { error } = await supabase
                .from('library_positions')
                .upsert(batch, { onConflict: 'user_id,local_id', ignoreDuplicates: false });

            if (error) {
                logError('library_push_positions', error, { userId: auth.userId });
            } else {
                syncedPositions = batch.length;
            }
        }

        // Upsert collections
        if (Array.isArray(collections) && collections.length > 0) {
            const batch = collections.slice(0, MAX_ITEMS_PER_PUSH).map(c => ({
                user_id: userId,
                local_id: c.id || c.localId,
                name: c.name,
                description: c.description || null,
                type: c.type || 'manual',
                game_metadata: c.gameMetadata || null,
                is_default: c.isDefault || false,
                local_created_at: c.dateCreated || c.localCreatedAt || null,
                local_updated_at: c.dateModified || c.localUpdatedAt || null,
                synced_at: new Date().toISOString()
            }));

            const { error } = await supabase
                .from('library_collections')
                .upsert(batch, { onConflict: 'user_id,local_id', ignoreDuplicates: false });

            if (error) {
                logError('library_push_collections', error, { userId: auth.userId });
            } else {
                syncedCollections = batch.length;
            }
        }

        // Process deletions
        if (Array.isArray(deletions) && deletions.length > 0) {
            for (const del of deletions.slice(0, MAX_ITEMS_PER_PUSH)) {
                const table = del.type === 'collection' ? 'library_collections' : 'library_positions';
                const { error } = await supabase
                    .from(table)
                    .delete()
                    .eq('user_id', userId)
                    .eq('local_id', del.localId || del.local_id);

                if (!error) syncedDeletions++;
            }
        }

        // Log sync action
        if (syncedPositions > 0 || syncedCollections > 0 || syncedDeletions > 0) {
            await supabase.from('library_sync_log').insert({
                user_id: userId,
                action: 'push',
                item_type: 'mixed',
                item_count: syncedPositions + syncedCollections + syncedDeletions
            });
        }

        logAction('library_push', {
            userId: auth.userId,
            detail: { positions: syncedPositions, collections: syncedCollections, deletions: syncedDeletions }
        });

        return res.status(200).json({
            synced: { positions: syncedPositions, collections: syncedCollections, deletions: syncedDeletions },
            serverTime: new Date().toISOString()
        });

    } catch (err) {
        logError('library_push', err, { userId: auth.userId });
        return res.status(500).json({ error: 'Failed to sync library data' });
    }
}
