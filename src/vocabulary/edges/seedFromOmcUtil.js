/**
 * Seed the edge definitions from omc-util's hand-written edges.js.
 *
 * ```
 * node src/vocabulary/edges/seedFromOmcUtil.js --edges ../omcUtil/src/templates/v3-0/edges.js
 *     [--json-name mlv:c-000002=Context]...   # a class whose label is not its OMC-JSON name
 *     [--report seed-report.md]               # the report, as a file as well as on screen
 *     [--candidate edge-definitions.json]     # what publishing would produce, for omc-util's parity check
 *     [--rehearse-unmatched]                  # stand in a class for every entityType the view does not
 *                                             #   mark, so the candidate covers all of edges.js
 *     [--write]                               # save the settings, pairs and edges
 * ```
 *
 * Dry run by default. `--write` refuses unless both edge collections are empty, every planned pair
 * and edge validates, and nothing was stood in, so it cannot run twice or leave half a seed behind
 * a refusal. edges.js is read by path and never imported as a package: this service does not depend
 * on omc-util. Delete this file once the seed has been written.
 *
 * @module vocabulary/edges/seedFromOmcUtil
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_EDGES, VOCAB_EDGE_PREDICATES, vocabCollection } from '../store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';

import { toEdgeDefinitions } from './generators/json.js';
import { entityTypesOf, planSeed } from './seed.js';
import {
    createEdges, createPairs, getSettings, loadEdgeContext, saveSettings, withNames,
} from './store.js';
import { validateEdge, validatePair } from './validate.js';

const ACTOR = 'seedFromOmcUtil.js';

/** The value after a flag, or null. */
function option(name) {
    const at = process.argv.indexOf(name);
    const value = at >= 0 ? process.argv[at + 1] : null;
    return value && !value.startsWith('--') ? value : null;
}

/** Every value after a repeatable flag. */
const options = ((name) => process.argv
    .map((arg, at, all) => (arg === name ? all[at + 1] : null))
    .filter((value) => value && !value.startsWith('--')));

async function connect() {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    return initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });
}

/**
 * The context with a stand-in class for every entityType no class is marked as.
 *
 * @param {object} context - From `loadEdgeContext`
 * @param {Set<string>} types
 * @returns {{context: object, stoodIn: string[]}}
 */
function withStandIns(context, types) {
    const marked = new Set([...context.index.classes.values()]
        .filter((entry) => entry.jsonTerm === entry.id)
        .map((entry) => entry.jsonType));
    const stoodIn = [...types].filter((type) => !marked.has(type)).sort();
    const classes = new Map(context.index.classes);
    stoodIn.forEach((type) => classes.set(`standin:${type}`, {
        id: `standin:${type}`,
        label: type,
        name: type,
        role: 'entity',
        tags: [],
        supers: [],
        ancestors: [],
        placements: 1,
        jsonTerm: `standin:${type}`,
        jsonType: type,
    }));
    return { context: { ...context, index: { ...context.index, classes } }, stoodIn };
}

/**
 * The plan with provisional ids, names generated, and every refusal a write would meet.
 *
 * @param {object} plan - From `planSeed`
 * @param {object} context - From `loadEdgeContext`
 * @returns {{pairs: Map<string, object>, edges: Array<object>, errors: string[], warnings: string[]}}
 */
function rehearse(plan, context) {
    const pairs = new Map(plan.pairs.map((pair) => [pair.key, {
        _id: pair.key, ...pair, modified: null,
    }]));
    const errors = [];
    const warnings = [];
    [...pairs.values()].forEach((pair) => {
        validatePair(pair, [...pairs.values()]).errors
            .forEach((message) => errors.push(`pair ${pair.forward.verb}: ${message}`));
    });

    const rehearsal = { ...context, pairs };
    const edges = plan.edges.map((edge, at) => withNames({
        _id: `seed-${String(at + 1).padStart(4, '0')}`, ...edge, pair: edge.pairKey,
    }, rehearsal));
    edges.forEach((edge) => {
        const checked = validateEdge(edge, {
            ...rehearsal, classes: context.index.classes, edges,
        });
        const where = `${context.index.classes.get(edge.domain.term)?.label} → ${context.index.classes.get(edge.range.term)?.label}`;
        checked.errors.forEach((message) => errors.push(`edge ${where}: ${message}`));
        checked.warnings.forEach((message) => warnings.push(`edge ${where}: ${message}`));
    });
    return {
        pairs, edges, errors, warnings,
    };
}

/**
 * The report, as markdown.
 *
 * @param {object} plan
 * @param {object} rehearsal
 * @param {string[]} stoodIn
 * @returns {string}
 */
function reportOf(plan, rehearsal, stoodIn) {
    const { report } = plan;
    const kinds = plan.pairs.reduce((counts, pair) => ({ ...counts, [pair.kind]: (counts[pair.kind] ?? 0) + 1 }), {});
    const section = ((title, lines) => (lines.length ? [`## ${title} (${lines.length})`, '', ...lines.map((line) => `- ${line}`), ''] : []));
    return [
        '# Seeding edges from edges.js',
        '',
        `- Rows stated in edges.js: ${report.rows}`,
        `- Joined into ${report.joined} relationships, ${report.agreed} with agreed inverses`,
        `- Edges to write: ${plan.edges.length} (${plan.edges.filter((edge) => edge.status === 'review').length} marked review)`,
        `- Rows skipped for a class the view does not mark: ${report.unmatchedRows}`,
        `- Names kept as overrides: ${report.overrides}`,
        `- Pairs: ${plan.pairs.length} (${Object.entries(kinds).map(([kind, n]) => `${n} ${kind}`).join(', ')})`,
        '',
        ...section('Stood in for this rehearsal — nothing can be written until the view marks them', stoodIn),
        ...section('Pairs', plan.pairs.map((pair) => (pair.reverse
            ? `${pair.forward.verb} ↔ ${pair.reverse.verb}${pair.reverse.json.placement === 'property' ? ' (reverse is a named property)' : ''}`
            : `${pair.forward.verb} (${pair.kind})`))),
        ...section('Named-property verbs taken onto another pair', report.inferences.map((one) => `${one.verb} → the pair of ${one.onto}`)),
        ...section('Inverses only one side names — review', report.oneSided),
        ...section('Inverses naming a row edges.js does not have — review', report.unanswered),
        ...section('entityTypes with no JSON-Entity class — their rows are skipped', report.unmatchedTypes),
        ...section('Duplicates dropped', report.duplicates),
        ...section('Refusals — nothing can be written until these are fixed', rehearsal.errors),
        ...section('Warnings', rehearsal.warnings),
    ].join('\n');
}

async function main() {
    const edgesFile = option('--edges');
    if (!edgesFile) throw new Error('--edges <path to omc-util edges.js> is required');
    await connect();

    const mod = await import(pathToFileURL(path.resolve(edgesFile)).href);
    const jsonNames = Object.fromEntries(options('--json-name').map((pair) => pair.split('=')));
    const loaded = await loadEdgeContext({ jsonNames });
    const { context, stoodIn } = process.argv.includes('--rehearse-unmatched')
        ? withStandIns(loaded, entityTypesOf(mod.edgeDefinitions))
        : { context: loaded, stoodIn: [] };

    const plan = planSeed({
        definitions: mod.edgeDefinitions,
        rdfFunctions: { tentativeRdf: mod.tentativeRdf, intrinsicRdf: mod.intrinsicRdf },
        classes: context.index.classes,
        settings: context.settings,
    });
    const rehearsal = rehearse(plan, context);

    const markdown = reportOf(plan, rehearsal, stoodIn);
    console.log(markdown);
    const reportFile = option('--report');
    if (reportFile) fs.writeFileSync(reportFile, `${markdown}\n`);

    const candidateFile = option('--candidate');
    if (candidateFile) {
        const { body, problems } = toEdgeDefinitions({
            edges: rehearsal.edges, pairs: rehearsal.pairs, index: context.index, settings: context.settings,
        });
        fs.writeFileSync(candidateFile, `${JSON.stringify(body, null, 2)}\n`);
        console.log(`\nWrote ${candidateFile}. Problems: ${JSON.stringify(problems)}`);
    }

    if (!process.argv.includes('--write')) {
        console.log('\nDry run. Pass --write to save.');
        return;
    }
    if (stoodIn.length) throw new Error('Refused: --rehearse-unmatched stands in classes that do not exist. Nothing written.');
    if (rehearsal.errors.length) throw new Error('Refused: the plan has errors, listed above. Nothing written.');
    const [edgeCount, pairCount] = await Promise.all([
        vocabCollection(VOCAB_EDGES).countDocuments(),
        vocabCollection(VOCAB_EDGE_PREDICATES).countDocuments(),
    ]);
    if (edgeCount || pairCount) {
        throw new Error(`Refused: ${edgeCount} edge(s) and ${pairCount} pair(s) already exist. Nothing written.`);
    }

    if (Object.keys(jsonNames).length) {
        const saved = await getSettings();
        await saveSettings({ ...saved, jsonNames: { ...saved.jsonNames, ...jsonNames } }, ACTOR, saved.modified);
    }
    const pairs = await createPairs(plan.pairs.map(({ key: _key, ...pair }) => pair), ACTOR);
    const idOf = new Map(plan.pairs.map((pair, at) => [pair.key, pairs[at]._id]));
    const { edges } = await createEdges(
        plan.edges.map(({ pairKey, ...edge }) => ({ ...edge, pair: idOf.get(pairKey) })),
        ACTOR,
    );
    console.log(`\nWrote ${pairs.length} pair(s) and ${edges.length} edge(s).`);
}

main()
    .then(async () => {
        await closeVocabMongo();
        process.exit(process.exitCode ?? 0);
    })
    .catch(async (err) => {
        console.error(err.message);
        await closeVocabMongo();
        process.exit(1);
    });
