import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
    mkdir, readFile, rm, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
    DeleteObjectsCommand, GetObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import busboy from 'busboy';

import config from '../config.js';
import PayloadTooLarge from '../errors/PayloadTooLarge.js';

import { localStorageRoot } from './projectConfig.js';

/**
 * Object storage for pipeline and ingest source files.
 *
 * Shared by both route namespaces: `/api/pipeline/v1/upload` and `/api/ingest/v1/upload` are
 * different contracts over this one implementation.
 *
 * Credentials come from the default AWS provider chain — the pod's IAM role in the service mesh,
 * `~/.aws/credentials` mounted in the container locally — exactly as StorageOrchestration does.
 * Nothing here reads a secret.
 *
 * @namespace namespace:LabkoatApi.storage
 */

/** One client per region. Clients are cheap to keep and expensive to rebuild per request. */
const clients = new Map();

/**
 * @param {string} region
 * @returns {S3Client}
 */
function clientFor(region) {
    if (!clients.has(region)) clients.set(region, new S3Client({ region }));
    return clients.get(region);
}

/**
 * The storage URL an object is addressed by.
 *
 * `s3://bucket/key` rather than an https URL: it names the object without implying it is fetchable
 * by anyone holding the string, and it is what the pipeline worker resolves.
 *
 * @param {string} bucket
 * @param {string} key
 * @returns {string}
 */
export const storageUrl = (bucket, key) => `s3://${bucket}/${key}`;

/**
 * Split a storage URL back into its bucket and key.
 *
 * @param {string} url - An `s3://bucket/key` URL
 * @returns {{bucket: string, key: string}}
 * @throws {Error} When the URL is not an s3 URL
 */
export function parseStorageUrl(url) {
    const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(url ?? '');
    if (!match) throw new Error(`Not an S3 storage URL: ${url}`);
    return { bucket: match[1], key: match[2] };
}

/**
 * Write a stream to a file under the local root, creating its directory.
 *
 * The local counterpart of an S3 upload, for developing before a bucket exists. `key` is the same
 * path either way, so a `file://` reference and an `s3://` one describe the same layout.
 *
 * @param {Object} params
 * @param {string} params.root - The configured local root
 * @param {string} params.key - Path within the root
 * @param {import('node:stream').Readable} params.body - The bytes
 * @returns {Promise<void>} Resolves once the file is closed
 */
async function writeLocal({ root, key, body }) {
    const full = path.resolve(root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await pipeline(body, createWriteStream(full));
}

/**
 * Read bytes back from a reference.
 *
 * Handles `s3://` always, and `file://` only when `PIPELINE_LOCAL_ROOT` is configured — which it
 * is in the `local` environment alone. That switch exists so the whole upload → run → poll path
 * can be exercised before any bucket is provisioned; a deployed service will read a path a client
 * named only if someone deliberately turns it on, and even then only inside the configured root.
 *
 * @param {Object} params
 * @param {string} params.url - An `s3://bucket/key` or (locally) `file://relative/path` reference
 * @param {string} params.region
 * @param {string|null} [params.localRoot] - Root for `file://` refs. Passed explicitly because a
 *   worker thread has its own `process.argv` and so resolves `config` to the default environment,
 *   not the one the service was started in — a worker is told its configuration, never left to
 *   re-derive it.
 * @returns {Promise<Buffer>} The bytes
 * @throws {Error} When a `file://` reference is used without a root, or escapes it
 */
export async function readObject({ url, region, localRoot = localStorageRoot() }) {
    if (String(url).startsWith('file://')) {
        const root = localRoot;
        if (!root) throw new Error('file:// inputs are not enabled on this service');
        const relative = String(url).slice('file://'.length);
        const full = path.resolve(root, relative);
        const bounds = path.resolve(root);
        if (full !== bounds && !full.startsWith(bounds + path.sep)) {
            throw new Error(`Input "${relative}" resolves outside the configured root`);
        }
        return readFile(full);
    }

    const { bucket, key } = parseStorageUrl(url);
    const res = await clientFor(region).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/** S3 accepts at most this many keys in one DeleteObjects call. */
const DELETE_BATCH = 1000;

/**
 * Delete everything under a prefix, including every non-current version and delete marker.
 *
 * A hard purge, deliberately: it backs "reset project" and "delete project", where the point is
 * that the data is gone. Bucket versioning otherwise means a plain delete only writes a delete
 * marker and the bytes remain — billed, and still holding whatever the project held.
 *
 * Listing is the only complete enumeration. Keys are derivable now, but nothing records which files
 * a project ever had, and the sidecars are objects too.
 *
 * @param {Object} params
 * @param {Object} params.destination - Resolved destination, whose `prefix` bounds the purge
 * @returns {Promise<{deleted: number, errors: Array<{key: string, message: string}>}>} What went
 */
export async function purgePrefix({ destination }) {
    if (destination.kind === 'local') {
        const full = path.resolve(destination.root, destination.prefix);
        const bounds = path.resolve(destination.root);
        if (full !== bounds && !full.startsWith(bounds + path.sep)) {
            throw new Error(`Refusing to purge ${full}: outside the configured root`);
        }
        await rm(full, { recursive: true, force: true });
        return { deleted: 0, errors: [] };
    }

    const client = clientFor(destination.region);
    const errors = [];
    let deleted = 0;
    let keyMarker;
    let versionIdMarker;

    do {
        // Paginated by definition: a project with thousands of files exceeds one page, and every
        // version of every object has to be named individually to remove it.
        const page = await client.send(new ListObjectVersionsCommand({
            Bucket: destination.bucket,
            Prefix: destination.prefix,
            KeyMarker: keyMarker,
            VersionIdMarker: versionIdMarker,
        }));

        const objects = [...page.Versions ?? [], ...page.DeleteMarkers ?? []]
            .map(({ Key, VersionId }) => ({ Key, VersionId }));

        for (let i = 0; i < objects.length; i += DELETE_BATCH) {
            const batch = objects.slice(i, i + DELETE_BATCH);
            const res = await client.send(new DeleteObjectsCommand({
                Bucket: destination.bucket,
                Delete: { Objects: batch, Quiet: true },
            }));
            deleted += batch.length - (res.Errors?.length ?? 0);
            for (const e of res.Errors ?? []) errors.push({ key: e.Key, message: e.Message });
        }

        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker || versionIdMarker);

    return { deleted, errors };
}

/** The sidecar recording what is known about a stored file, beside the file itself. */
const sidecarKey = (key) => `${key}.omc.json`;

/**
 * Read the sidecar written by the previous upload of a key, if there was one.
 *
 * A missing sidecar is the normal first-upload case, not a fault — every "not found" shape the two
 * backends produce resolves to null rather than throwing.
 *
 * @param {Object} params
 * @param {Object} params.destination - Resolved destination
 * @param {string} params.key - The object's key, without the sidecar suffix
 * @returns {Promise<Object|null>} The parsed sidecar, or null
 */
export async function readSidecar({ destination, key }) {
    try {
        const raw = destination.kind === 'local'
            ? await readFile(path.resolve(destination.root, sidecarKey(key)), 'utf8')
            : await readObject({
                url: storageUrl(destination.bucket, sidecarKey(key)),
                region: destination.region,
            }).then((b) => b.toString('utf8'));
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Write the sidecar for a stored file.
 *
 * It carries the content hash, which is the only durable record of it: the key cannot contain the
 * hash (the destination is named before the bytes are read), object metadata is fixed at write
 * time, and an S3 ETag is a hash of part hashes for anything uploaded multipart — which is most
 * real deliveries. `omc` carries the entity pair on the ingest route and is null for pipeline
 * uploads, where OMC comes from the run rather than from the file.
 *
 * @param {Object} params
 * @param {Object} params.destination - Resolved destination
 * @param {Object} params.file - The stored file's facts, as returned by {@link receiveUpload}
 * @param {string} params.project
 * @param {string} [params.pipelineId]
 * @param {Array<Object>} [params.omc] - Entities minted for this file, where there are any
 * @returns {Promise<Object>} The sidecar as written
 */
export async function writeSidecar({
    destination, file, project, pipelineId = null, omc = null,
}) {
    const sidecar = {
        file: {
            fileName: file.fileName,
            md5: file.md5,
            size: file.size,
            contentType: file.contentType,
            uploadedAt: new Date().toISOString(),
            project,
            pipelineId,
        },
        omc,
    };
    const body = `${JSON.stringify(sidecar, null, 2)}\n`;
    const key = sidecarKey(file.key);

    if (destination.kind === 'local') {
        const full = path.resolve(destination.root, key);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, body, 'utf8');
    } else {
        await clientFor(destination.region).send(new PutObjectCommand({
            Bucket: destination.bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
        }));
    }
    return sidecar;
}

/**
 * Consume a `multipart/form-data` request, streaming its single file into object storage while
 * hashing it, and collecting the other fields.
 *
 * The bytes pass through `crypto.createHash('md5')` on their way to S3, so identity costs one pass
 * and no buffering — Node's hash is a Transform stream. **MD5 is for identity and accidental
 * collision detection only, never security.**
 *
 * **The key is deterministic** — `<project>/<pipelineId>/<filename>` — so re-uploading a file
 * overwrites it in place instead of accumulating copies nobody can tell apart. That also means a
 * re-run produces a byte-identical reference, so unchanged data yields unchanged OMC rather than a
 * diff in `filePath` alone. Bucket versioning is what makes overwriting safe.
 *
 * Whether the bytes actually changed is answered afterwards, from the sidecar: the previous hash is
 * read before the write and compared with the new one, and the result comes back as `changed`.
 *
 * **Every non-file field must be appended before the file.** A multipart body is read in wire
 * order, and the destination has to be known before the first byte is written — so `project`
 * arrives as a field only if the client sent it first. `resolveDestination` is handed the fields
 * seen so far, and callers fall back to the query string for a client that got the order wrong.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req - The incoming request
 * @param {function(Object): Promise<{kind: 'local'|'s3', root?: string, bucket?: string,
 *   region: string, prefix: string}|null>} params.resolveDestination - Given the fields read so
 *   far, where to write. `local` writes to disk and yields a `file://` reference, for developing
 *   before any bucket exists. Returning null refuses the upload
 * @param {number} [params.maxBytes] - Refuse anything larger
 * @returns {Promise<{fields: Object, file: Object|null}>} The form fields, and the stored file
 * @throws {PayloadTooLarge} When the file exceeds `maxBytes`
 */
export function receiveUpload({ req, resolveDestination, maxBytes = config.PIPELINE_MAX_UPLOAD_BYTES }) {
    return new Promise((resolve, reject) => {
        let bb;
        try {
            bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes } });
        } catch (err) {
            reject(err);
            return;
        }

        const fields = {};
        let pending = null;
        let settled = false;

        const fail = (err) => {
            if (settled) return;
            settled = true;
            req.unpipe(bb);
            reject(err);
        };

        bb.on('field', (name, value) => {
            fields[name] = value;
        });

        bb.on('file', (name, stream, info) => {
            const { filename, mimeType } = info;
            const hash = crypto.createHash('md5');
            let size = 0;
            let truncated = false;

            // There is exactly one chance to read the stream, and both the hash and the write need
            // every byte, so the bytes are observed on their way through rather than read twice.
            // `pipe` handles backpressure for both: it pauses the source when the destination is
            // not keeping up, which pauses this listener with it.
            const body = new PassThrough();
            stream.on('data', (chunk) => {
                hash.update(chunk);
                size += chunk.length;
            });
            stream.on('limit', () => {
                truncated = true;
                body.destroy(new PayloadTooLarge(`${filename} exceeds ${maxBytes} bytes`));
            });
            // Bytes go into the PassThrough immediately and buffer there while the destination is
            // resolved, so nothing is lost and backpressure still reaches the socket.
            stream.pipe(body);

            pending = (async () => {
                const destination = await resolveDestination(fields);
                if (!destination) {
                    body.destroy();
                    stream.resume(); // Drain the rest of the request rather than stalling it
                    return null;
                }

                const key = `${destination.prefix}${filename}`;

                // What the last upload of this exact key recorded, read before it is overwritten.
                // Absent on a first upload, which is why `changed` is null rather than false.
                const previous = await readSidecar({ destination, key });

                await (destination.kind === 'local'
                    ? writeLocal({ root: destination.root, key, body })
                    : new Upload({
                        client: clientFor(destination.region),
                        params: {
                            Bucket: destination.bucket,
                            Key: key,
                            Body: body,
                            ContentType: mimeType || 'application/octet-stream',
                        },
                    }).done());

                if (truncated) throw new PayloadTooLarge(`${filename} exceeds ${maxBytes} bytes`);

                const md5 = hash.digest('hex');
                return {
                    fileName: filename,
                    key,
                    ref: destination.kind === 'local'
                        ? `file://${key}`
                        : storageUrl(destination.bucket, key),
                    md5,
                    size,
                    contentType: mimeType || 'application/octet-stream',
                    replaced: Boolean(previous),
                    changed: previous ? previous.file?.md5 !== md5 : null,
                };
            })();
        });

        bb.on('error', fail);

        bb.on('close', () => {
            if (settled) return;
            settled = true;
            if (!pending) {
                resolve({ fields, file: null });
                return;
            }
            pending.then((file) => resolve({ fields, file })).catch(reject);
        });

        req.pipe(bb);
    });
}
