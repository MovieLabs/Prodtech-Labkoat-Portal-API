import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { wwdoat } from './harness.js';

/**
 * The golden bundle's recorded checksums.
 *
 * The bundle the tests compare against is production data and lives outside every repository, so
 * nothing would show it changing: regenerate it by mistake and the next run agrees with whatever
 * was written. Its checksums are committed here instead, so a change to the golden fails a test
 * until someone accepts it with `npm run fixtures:record`.
 */
export const MANIFEST = path.join(import.meta.dirname, 'golden.sha256.json');

/** The directory the manifest describes. */
export const GOLDEN_DIR = path.join(wwdoat, 'omc');

/**
 * Checksum every file in the golden directory. Line endings are normalised first, so a checkout
 * that converted them is not a change.
 *
 * @returns {Promise<Object.<string, string>>} sha256 by file name, sorted
 */
export async function hashGolden() {
    const names = (await readdir(GOLDEN_DIR, { withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort();
    const entries = await Promise.all(names.map(async (name) => {
        const text = (await readFile(path.join(GOLDEN_DIR, name), 'utf8')).replace(/\r\n/g, '\n');
        return [name, createHash('sha256').update(text).digest('hex')];
    }));
    return Object.fromEntries(entries);
}

/** @returns {Promise<Object.<string, string>>} The recorded checksums */
export async function readManifest() {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
}

// `node pipelines/test/golden.js record` — accept the golden as it now stands.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    if (process.argv[2] !== 'record') {
        console.error('Usage: node pipelines/test/golden.js record');
        process.exit(1);
    }
    const hashes = await hashGolden();
    await writeFile(MANIFEST, `${JSON.stringify(hashes, null, 4)}\n`);
    console.log(`Recorded ${Object.keys(hashes).length} golden file(s) from ${GOLDEN_DIR}`);
}
