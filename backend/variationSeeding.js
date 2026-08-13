/**
 * Weight Variation Seeding for mill output items.
 *
 * Every output item gets the 4 default weight variations (5/10/25/50 KG),
 * each with a globally-unique 3-digit GS1 product code. Idempotent: items
 * that already have at least one ACTIVE variation are skipped.
 *
 * Legacy codes: an item's existing `mill_items.GS1_CODE` is preserved on its
 * 25KG variation (the system's de-facto bag weight), so already-printed codes
 * stay valid. The remaining weights (5/10/50 KG) receive the next free codes.
 *
 * IMPORTANT: this module never touches `pool.query`. `MillItemRoutes.js`
 * reassigns the shared `pool.query` to a promisified wrapper at require time.
 * Instead it acquires a dedicated connection and uses `connection.promise()`
 * (connection.query is never reassigned, so the promise wrapper is safe).
 *
 * The `...OnConnection` variants accept any promise-style queryable
 * (mysql2/promise connection, or `connection.promise()`), so seedItems.js can
 * seed with its single connection.
 */

const util = require('util');

const DEFAULT_WEIGHTS = [5, 10, 25, 50];
const LEGACY_WEIGHT = 25;

/**
 * Returns the next free GS1 code as a zero-padded 3-digit string,
 * or null when the code space is exhausted (>= 999). Reads must run on the
 * same connection/transaction as the inserts so uncommitted codes are seen.
 */
async function nextCodeOn(conn) {
    const [rows] = await conn.query(
        'SELECT MAX(CAST(GS1_CODE AS UNSIGNED)) AS maxCode FROM mill_item_variations'
    );
    const maxCode = rows && rows.length ? Number(rows[0].maxCode || 0) : 0;
    if (maxCode >= 999) return null;
    return String(maxCode + 1).padStart(3, '0');
}

/**
 * Core seeding logic against a promise-style queryable (conn).
 */
async function ensureDefaultVariationsOnConnection(conn, { itemId } = {}) {
    const itemWhere = itemId ? 'AND i.ITEM_ID = ?' : '';
    const itemParams = itemId ? [itemId] : [];

    const [items] = await conn.query(
        `SELECT i.ITEM_ID, i.GS1_CODE
         FROM mill_items i
         LEFT JOIN mill_item_variations v
           ON v.ITEM_ID = i.ITEM_ID AND v.IS_ACTIVE = 1
         WHERE i.CATEGORY = 'output' ${itemWhere}
         GROUP BY i.ITEM_ID, i.GS1_CODE
         HAVING COUNT(v.VARIATION_ID) = 0
         ORDER BY i.ITEM_ID ASC`,
        itemParams
    );

    if (!items || items.length === 0) return { created: 0 };

    await conn.query('START TRANSACTION');
    let created = 0;
    try {
        const reserved = new Set();

        // Phase 1: reserve legacy codes on the 25KG variation first, so the
        // next-free allocator in phase 2 can never collide with them.
        // Duplicate/conflicting legacy codes are skipped (their 25KG then gets
        // a fresh code in phase 2) so one bad row can't roll back the whole run.
        for (const item of items) {
            const legacy = (item.GS1_CODE || '').trim();
            item._legacyUsed = false;
            if (!/^\d{3}$/.test(legacy)) continue;
            if (reserved.has(legacy)) continue;
            try {
                await conn.query(
                    `INSERT INTO mill_item_variations
                       (ITEM_ID, WEIGHT_KG, GS1_CODE, BUYING_PRICE, SELLING_PRICE)
                     VALUES (?, ?, ?, 0, 0)`,
                    [item.ITEM_ID, LEGACY_WEIGHT, legacy]
                );
                reserved.add(legacy);
                item._legacyUsed = true;
                created += 1;
            } catch (err) {
                if (err.code !== 'ER_DUP_ENTRY') throw err;
                // legacy code already taken (e.g. a deactivated row holds it) —
                // 25KG will fall back to a fresh code in phase 2
            }
        }

        // Phase 2: fill the remaining weights with the next free codes.
        for (const item of items) {
            const weights = item._legacyUsed
                ? DEFAULT_WEIGHTS.filter((w) => w !== LEGACY_WEIGHT)
                : DEFAULT_WEIGHTS;

            for (const weight of weights) {
                const code = await nextCodeOn(conn);
                if (!code) {
                    console.error(
                        '[VariationSeed] GS1 code space exhausted; skipped weight',
                        weight, 'for item', item.ITEM_ID
                    );
                    break;
                }
                await conn.query(
                    `INSERT INTO mill_item_variations
                       (ITEM_ID, WEIGHT_KG, GS1_CODE, BUYING_PRICE, SELLING_PRICE)
                     VALUES (?, ?, ?, 0, 0)`,
                    [item.ITEM_ID, weight, code]
                );
                created += 1;
            }
        }

        await conn.query('COMMIT');
    } catch (err) {
        await conn.query('ROLLBACK');
        throw err;
    }
    return { created };
}

/**
 * Seeds default variations using a mysql2 pool (callback style, as created in
 * index.js). Acquires a dedicated connection and delegates.
 */
async function ensureDefaultVariations(pool, opts) {
    const getConnection = util.promisify(pool.getConnection.bind(pool));
    const connection = await getConnection();
    try {
        const conn = connection.promise(); // safe: connection.query never reassigned
        return await ensureDefaultVariationsOnConnection(conn, opts);
    } finally {
        connection.release();
    }
}

/**
 * Server-authoritative next-free GS1 code (standalone read, no transaction).
 */
async function getNextGs1Code(pool) {
    return withConnection(pool, (conn) => nextCodeOn(conn));
}

async function withConnection(pool, fn) {
    const getConnection = util.promisify(pool.getConnection.bind(pool));
    const connection = await getConnection();
    try {
        const conn = connection.promise();
        return await fn(conn);
    } finally {
        connection.release();
    }
}

module.exports = {
    ensureDefaultVariations,
    ensureDefaultVariationsOnConnection,
    getNextGs1Code,
    nextCodeOn,
    DEFAULT_WEIGHTS,
    LEGACY_WEIGHT,
};
