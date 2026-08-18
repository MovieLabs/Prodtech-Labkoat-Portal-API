/**
 * The vocabulary's connection to MongoDB.
 *
 * The vocabulary used to live in Neo4j, reached only from this service. It still is reached only
 * from here — what changes is the store beneath it. Nothing about that is visible to a caller.
 *
 * **No new credentials.** `config.SECRET_ARN.FMAM` is already declared in this service and already
 * loaded by `awsSecrets` at boot, because the gateway holds the fMam secret for other reasons. The
 * Mongo user and password live in it, so the vocabulary authenticates as the same user fMam does
 * against the same cluster. A second credential would have been a second thing to rotate for no
 * gain.
 *
 * **No new database.** The four collections sit in `app_config`, beside `projects` and
 * `mappingTemplates`. A vocabulary is editorial tooling rather than a project's production data,
 * which is the same reasoning fMam's `mongo-templates.js` records for mapping templates.
 *
 * @module vocabulary/store/mongoConnection
 */

import dns from 'dns';

import { MongoClient } from 'mongodb';

import config from '../../config.js';

// Both lines match fMam, and both are load-bearing.
//
// Atlas is reached through a `mongodb+srv://` URL, so the driver does an **SRV** lookup before it
// can connect to anything. A resolver that refuses SRV queries — which the default one here does —
// fails with `querySrv ECONNREFUSED` and no amount of retrying helps. Naming public resolvers is
// what fMam does for the same cluster, and it is why fMam can reach it.
//
// The blast radius is smaller than it looks: `setServers` governs the `dns.resolve*` family, which
// is what the driver uses for SRV. Ordinary hostname lookups go through `dns.lookup` and the OS
// resolver, so the gateway's other outbound calls — Okta, AWS, fMam, Neo4j — are unaffected.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

/**
 * The one client for this process.
 *
 * Module-scoped rather than returned to callers because a `MongoClient` carries its own connection
 * pool: building a second one for the same cluster costs sockets and buys nothing. fMam owns its
 * client the same way in `mongo-projects.js`.
 *
 * @type {import('mongodb').MongoClient|null}
 */
let client = null;

/**
 * Open the vocabulary's connection. Called once, at boot.
 *
 * @param {object} options
 * @param {string} options.username - From `secrets.FMAM.FMAM_MONGO_USER`
 * @param {string} options.password - From `secrets.FMAM.FMAM_MONGO_PASSWORD`
 * @param {string} options.mongoUrl - The connection template, with `${username}`/`${password}` in it
 * @returns {Promise<import('mongodb').MongoClient>}
 * @throws {Error} When the cluster cannot be reached — boot should fail loudly rather than serve a
 *   vocabulary that is not there
 */
export async function initializeVocabMongo({ username, password, mongoUrl }) {
    if (client) return client; // Idempotent: a second boot path must not open a second pool

    // The template carries the placeholders literally, so this is a string replace and not an
    // interpolation. Written as `${username}` inside a single-quoted string in config.
    const dbUrl = mongoUrl
        .replace('${username}', encodeURIComponent(username))
        .replace('${password}', encodeURIComponent(password));

    const mongo = new MongoClient(dbUrl, {
        family: 4, // Force IPv4, as fMam does
        serverSelectionTimeoutMS: 5000,
    });

    await mongo.connect();
    client = mongo;
    console.log(`Vocabulary connected to MongoDB (${config.VOCAB_DB})`);
    return client;
}

/**
 * The database the vocabulary collections live in.
 *
 * @returns {import('mongodb').Db}
 * @throws {Error} Before `initializeVocabMongo` has run — a silent `undefined` here would surface
 *   as a confusing failure several layers away
 */
export function vocabDatabase() {
    if (!client) throw new Error('Vocabulary Mongo is not initialised — initializeVocabMongo must run first');
    return client.db(config.VOCAB_DB);
}

/**
 * Close the connection. For tests and for the migration CLI, which must not leave the process open.
 *
 * @returns {Promise<void>}
 */
export async function closeVocabMongo() {
    if (!client) return;
    await client.close();
    client = null;
}
