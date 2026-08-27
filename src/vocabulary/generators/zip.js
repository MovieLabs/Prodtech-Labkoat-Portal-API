/**
 * Several documents as one download.
 *
 * A view publishes more than one vocabulary, and CSV and Markdown are each one document. A profile
 * that splits per scheme therefore produces a handful of files, and a response can carry one thing —
 * so they arrive zipped, and the generator overrides its own extension to say so.
 *
 * XLSX does not come through here: a workbook already holds many tables, which is the whole reason
 * to reach for one.
 *
 * @module vocabulary/generators/zip
 */

import JSZip from 'jszip';

/**
 * Pack documents into a zip.
 *
 * Synchronous by signature and asynchronous underneath, which is why it returns a promise the
 * caller must await. `generate` awaits whatever a generator hands back for exactly this.
 *
 * The date on every entry is fixed. Zip records a modification time per file, so stamping "now"
 * makes two exports of an unchanged vocabulary differ byte for byte — which defeats the one check
 * that tells somebody whether a published artifact actually changed.
 *
 * @param {Array<{name: string, body: string|Buffer}>} files
 * @returns {Promise<Buffer>}
 */
export async function toZip(files) {
    const zip = new JSZip();
    const date = new Date(0);

    // A scheme can legitimately share a name with another — two vocabularies may each hold a
    // `Camera` — and a zip with two identical entry names is a file that loses one of them
    // silently, in the unzipper rather than here.
    const used = new Map();
    files.forEach((file) => {
        const seen = used.get(file.name) ?? 0;
        used.set(file.name, seen + 1);
        const name = seen ? file.name.replace(/(\.[^.]+)$/, `-${seen + 1}$1`) : file.name;
        zip.file(name, file.body, { date });
    });

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
