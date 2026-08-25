/**
 * Report what a SKOS validator would say about a view, naming the terms.
 *
 * ```
 * node src/vocabulary/skosCheck.js --view view:media-creation
 * node src/vocabulary/skosCheck.js --view view:media-creation --check oc,tchbc
 * ```
 *
 * qSKOS and its kin answer in identifiers, and `vmc:c-00044e` says nothing about what is wrong or
 * whether it matters. The same checks are computed here from the resolution the generators read, so
 * every finding comes back as a name — and, where the shape of the problem is a relationship, the
 * name of the thing at the other end of it.
 *
 * **This is not a SKOS validator and does not try to be.** It reproduces the handful of checks that
 * have actually found something in this vocabulary, against our own model rather than by parsing the
 * Turtle back. The counts match: run it beside the real report and the numbers should agree, and a
 * disagreement is worth understanding before either is trusted.
 *
 * @module vocabulary/skosCheck
 */

import { awsSecrets } from 'mlHelpers';

import config from '../config.js';

import { broaderOf, resolveView, schemeHeads } from './resolve.js';
import { closeVocabMongo, initializeVocabMongo } from './store/mongoConnection.js';
import { localised, otherLabels, prefLabel } from './store/read.js';

const arg = ((name, fallback = null) => {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
});

const VIEW = arg('view', 'view:media-creation');
const ONLY = arg('check');

/**
 * Everything the checks are computed from, gathered once.
 *
 * @param {object} resolution
 * @returns {object}
 */
function readGraph(resolution) {
    const heads = schemeHeads(resolution);
    const name = ((id) => {
        const term = resolution.terms.get(id);
        return term ? prefLabel(term) : id;
    });

    // A scheme head publishes no concept of its own unless it is placed somewhere else too.
    const concepts = new Set();
    const broader = new Map();
    const tops = new Map();

    resolution.placements.forEach((placement) => {
        const isHeadItself = heads.has(placement.termId) && !placement.path.length;
        if (isHeadItself) return;
        concepts.add(placement.termId);

        const above = broaderOf(placement);
        if (above) {
            if (!broader.has(placement.termId)) broader.set(placement.termId, new Set());
            broader.get(placement.termId).add(above);
        }
        placement.path.forEach((entry, at) => {
            if (!entry.scheme) return;
            if (placement.path.slice(at + 1).some((later) => !later.scheme)) return;
            if (!tops.has(placement.termId)) tops.set(placement.termId, new Set());
            tops.get(placement.termId).add(entry.id);
        });
    });

    const narrower = new Set();
    broader.forEach((set) => set.forEach((id) => narrower.add(id)));

    return {
        heads, name, concepts, broader, tops, narrower,
    };
}

/** Concepts with no `broader` and no `narrower`. */
function orphans(g) {
    return [...g.concepts]
        .filter((id) => !g.broader.has(id) && !g.narrower.has(id))
        .map((id) => ({ id, label: g.name(id) }));
}

/** Groups of concepts joined by broader/narrower but joined to nothing else. */
function clusters(g) {
    const adjacent = new Map();
    g.concepts.forEach((id) => adjacent.set(id, new Set()));
    g.broader.forEach((set, id) => set.forEach((above) => {
        if (!adjacent.has(above)) return;
        adjacent.get(id).add(above);
        adjacent.get(above).add(id);
    }));

    const seen = new Set();
    const found = [];
    g.concepts.forEach((id) => {
        if (seen.has(id)) return;
        const members = [];
        const queue = [id];
        seen.add(id);
        while (queue.length) {
            const at = queue.pop();
            members.push(at);
            adjacent.get(at).forEach((next) => {
                if (seen.has(next)) return;
                seen.add(next);
                queue.push(next);
            });
        }
        if (members.length > 1) found.push(members.map((one) => ({ id: one, label: g.name(one) })));
    });
    return found;
}

/** Concepts that are a top concept of a scheme and also have a broader. */
function topsWithBroader(g) {
    return [...g.concepts]
        .filter((id) => g.tops.has(id) && g.broader.has(id))
        .map((id) => ({
            id,
            label: g.name(id),
            topOf: [...g.tops.get(id)].map((one) => g.name(one)),
            under: [...g.broader.get(id)].map((one) => g.name(one)),
        }));
}

/** One string naming more than one concept, whatever kind of label it is. */
function overlappingLabels(resolution, g) {
    const byValue = new Map();
    g.concepts.forEach((id) => {
        const term = resolution.terms.get(id);
        if (!term) return;
        const entries = [
            { value: prefLabel(term), kind: 'prefLabel' },
            ...otherLabels(term).map((one) => ({ value: one.value, kind: one.labelType })),
        ];
        entries.forEach(({ value, kind }) => {
            if (!value) return;
            if (!byValue.has(value)) byValue.set(value, []);
            byValue.get(value).push({ id, kind });
        });
    });
    return [...byValue.entries()]
        .filter(([, uses]) => new Set(uses.map((one) => one.id)).size > 1)
        .map(([value, uses]) => ({ value, uses }));
}

/** Concepts carrying no definition, note or example. */
function undocumented(resolution, g) {
    return [...g.concepts]
        .filter((id) => {
            const term = resolution.terms.get(id);
            if (!term) return false;
            return !localised(term.definition) && !term.note?.length && !term.example?.length;
        })
        .map((id) => ({ id, label: g.name(id) }));
}

/** A concept whose broader is also reachable from it through another broader. */
function redundantHierarchy(g) {
    const found = [];
    g.broader.forEach((set, id) => {
        set.forEach((direct) => {
            const seen = new Set([id]);
            const queue = [...set].filter((one) => one !== direct);
            while (queue.length) {
                const at = queue.pop();
                if (seen.has(at)) continue;
                seen.add(at);
                if (at === direct) {
                    found.push({ id, label: g.name(id), redundant: g.name(direct) });
                    return;
                }
                (g.broader.get(at) ?? new Set()).forEach((next) => queue.push(next));
            }
        });
    });
    return found;
}

const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({
    username: secrets.FMAM.FMAM_MONGO_USER,
    password: secrets.FMAM.FMAM_MONGO_PASSWORD,
    mongoUrl: config.VOCAB_MONGO_URL,
});

const resolution = await resolveView({ viewId: VIEW });
const graph = readGraph(resolution);

const wanted = ONLY ? new Set(ONLY.split(',')) : null;
const run = ((key) => !wanted || wanted.has(key));

console.log(`${VIEW} — ${graph.concepts.size} concepts, ${graph.heads.size} schemes\n`);

if (run('ol')) {
    const found = overlappingLabels(resolution, graph);
    console.log(`ol   Overlapping Labels — ${found.length}`);
    found.forEach((row) => {
        console.log(`  "${row.value}"`);
        row.uses.forEach((use) => console.log(`      ${graph.name(use.id).padEnd(34)} ${use.kind.padEnd(12)} ${use.id}`));
    });
    console.log('');
}

if (run('tchbc')) {
    const found = topsWithBroader(graph);
    console.log(`tchbc Top Concepts Having Broader Concepts — ${found.length}`);
    found.forEach((row) => {
        console.log(`  ${row.label.padEnd(30)} ${row.id.padEnd(14)} top of ${row.topOf.join(', ').padEnd(22)} but under ${row.under.join(', ')}`);
    });
    console.log('');
}

if (run('hr')) {
    const found = redundantHierarchy(graph);
    console.log(`hr   Hierarchical Redundancy — ${found.length}`);
    found.forEach((row) => console.log(`  ${row.label} is directly under ${row.redundant}, and under it again through another route`));
    console.log('');
}

if (run('uc')) {
    const found = undocumented(resolution, graph);
    console.log(`uc   Undocumented Concepts — ${found.length}`);
    found.forEach((row) => console.log(`  ${row.label.padEnd(34)} ${row.id}`));
    console.log('');
}

if (run('oc')) {
    const found = orphans(graph);
    console.log(`oc   Orphan Concepts — ${found.length}  (no broader and no narrower)`);
    const asHead = found.filter((row) => graph.heads.has(row.id));
    if (asHead.length) console.log(`     ${asHead.length} of them are scheme heads placed elsewhere as a leaf`);
    found.forEach((row) => console.log(`  ${row.label.padEnd(34)} ${row.id}`));
    console.log('');
}

if (run('dcc')) {
    const found = clusters(graph);
    console.log(`dcc  Disconnected Concept Clusters — ${found.length}`);
    found
        .sort((a, b) => b.length - a.length)
        .forEach((group) => {
            const names = group.map((one) => one.label);
            console.log(`  ${String(group.length).padStart(4)} concepts — ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''}`);
        });
    console.log('');
}

await closeVocabMongo();
