/**
 * The RDF facts as data, for a build elsewhere to write the Turtle itself.
 *
 * ## Why this is not the OMC-JSON export
 *
 * `json.edgeDefinitions` in the same document is the OMC-JSON edge table: its domains and ranges are
 * OMC-JSON entityTypes, so every subclass has already been folded into the class it projects to —
 * `Portrayal` and `Depiction` both arrive as `Realization` — and the RDF names survive only as opaque
 * `const:omc:…` tokens. Turtle derived from it would lose exactly the distinctions the RDF exists to
 * make. This section carries the other half: the properties as RDF has them, before any projection.
 *
 * ## What it holds, and what it does not
 *
 * The properties, the verbs they sit under and the narrowings they carry — and nothing about how any
 * of it is serialised. The syntax is the consumer's: `RDF-Testing` in `OMC-Development` reads this
 * section and writes the ontology's Turtle and SHACL from it.
 *
 * ## The conventions the facts carry
 *
 * An edge property is named for its verb and the class it points at — `featuresCharacter`,
 * `featuresInNarrativeScene` — which is what lets a shape say exactly where it belongs. That naming
 * is not one-to-one in reverse: `featuresInNarrativeScene` answers `featuresCharacter` and
 * `featuresEffect` alike, and an `owl:inverseOf` between them would have a reasoner conclude those
 * two are the same property. So each specific property sits under a property for its verb, and the
 * inverse is stated once, between the verbs.
 *
 * A verb may belong to several pairs — `usedBy` against `realizedBy` for one class and `depictedBy`
 * for another. Its verb property then cannot carry the inverse, since two statements about one
 * property say those two verbs are the same. Such pairs put the inverse on each specific property
 * instead, as `inverseOf`, which entails the reverse without asserting equivalence — so one property
 * may answer several others, and nothing about that is a defect to report.
 *
 * **An intrinsic pair states no inverse at all.** It names a property of an entity in OMC-JSON, and
 * its reverse verb is a field name rather than a relationship RDF makes; pairing the two would put a
 * JSON artefact in the ontology. Its properties are still declared and still carry their ranges.
 *
 * **A narrowed end publishes as `rangeOf`.** An edge pointing at `Asset(Script)` declares
 * `ranges: ['omc:Asset']` and narrows it beside — the declared range asserts rather than restricts,
 * so naming the narrow class there would change what the ontology says instead of what it checks.
 * The narrowing does decide the property's name: `hasScript`, not `hasAsset`.
 *
 * @module vocabulary/edges/generators/rdfBundle
 */

import { DIRECTIONS, carries, sideOf } from '../check.js';
import { qualifierFor } from '../classes.js';

const lowerFirst = ((word) => word.charAt(0).toLowerCase() + word.slice(1));

const sorted = ((set) => [...set].sort());

/**
 * Every RDF property the edges publish, merged across the edges that use each name, and the verb
 * properties they sit under.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{properties: Array<object>, verbs: Array<object>, skipped: Array<object>, verbConflicts: Array<object>}}
 */
export function edgeProperties({
    edges, pairs, index, settings,
}) {
    const { prefix } = settings.rdf;
    const properties = new Map();
    const verbs = new Map();
    const skipped = [];

    const pairsPerVerb = new Map();
    [...pairs.values()].forEach((pair) => {
        ['forward', 'reverse'].forEach((direction) => {
            const verb = sideOf(pair, direction)?.verb;
            if (!verb) return;
            const held = pairsPerVerb.get(lowerFirst(verb)) ?? new Set();
            held.add(pair._id);
            pairsPerVerb.set(lowerFirst(verb), held);
        });
    });
    // A pair declaring no inverse has no reverse side, so the verb asked for is often absent — and a
    // verb nothing names is not shared with anything.
    const verbAlone = ((verb) => (verb ? (pairsPerVerb.get(lowerFirst(verb))?.size ?? 0) < 2 : true));

    // Which pairs may state `owl:inverseOf` between their verbs.
    //
    // **A verb may appear in at most one such statement.** Two of them about one verb have a reasoner
    // conclude its two partners are the same property: three pairs naming `usedBy` would collapse
    // `realizedBy`, `depictedBy` and `portrayedBy` into one. Everything else states the entailment on
    // the specific properties instead, which says the same thing without asserting equivalence.
    //
    // A verb commonly serves several pairs in different roles — `usedIn` is the reverse of `uses` and
    // the forward of three more — and that reverse is the one genuine pair among them. So the question
    // is asked per role, and then checked: any verb still named twice loses the statement everywhere,
    // which is what keeps a crossed pair from slipping through.
    const asserting = (() => {
        const candidates = [...pairs.values()]
            .filter((pair) => pair.kind === 'pair' && pair.forward?.verb && pair.reverse?.verb
                && pair.forward?.json?.placement !== 'property')
            .map((pair) => ({
                id: pair._id,
                forward: lowerFirst(pair.forward.verb),
                reverse: lowerFirst(pair.reverse.verb),
            }));

        const tally = ((list) => list.reduce((held, verb) => held.set(verb, (held.get(verb) ?? 0) + 1), new Map()));
        const asForward = tally(candidates.map((one) => one.forward));
        const asReverse = tally(candidates.map((one) => one.reverse));

        const inRole = candidates.filter((one) => asForward.get(one.forward) === 1 && asReverse.get(one.reverse) === 1);

        // A verb still named twice here leads one pair and answers another — `usedIn` answering
        // `uses` while leading `usedIn ↔ depictionOf`. The pair it answers is the reciprocal one, so
        // that keeps the statement and the pair it leads gives it up.
        const named = tally(inRole.flatMap((one) => [one.forward, one.reverse]));
        const twice = new Set([...named.entries()].filter(([, count]) => count > 1).map(([verb]) => verb));
        const kept = inRole.filter((one) => !twice.has(one.forward));

        // Whatever survives, no verb may be named more than once: that is the whole safety condition.
        const remaining = tally(kept.flatMap((one) => [one.forward, one.reverse]));
        return new Set(kept
            .filter((one) => remaining.get(one.forward) === 1 && remaining.get(one.reverse) === 1)
            .map((one) => one.id));
    })();

    const verbProperty = ((pair, direction) => {
        const side = sideOf(pair, direction);
        if (!side?.verb) return null;
        const id = `${prefix}:${lowerFirst(side.verb)}`;
        if (!verbs.has(id)) {
            const other = direction === 'forward' ? sideOf(pair, 'reverse') : pair.forward;
            // An intrinsic pair names a property of an entity in OMC-JSON. Its reverse verb is a
            // field name — `RealizationOf`, `AssetStructure` — not a relationship RDF states, so
            // pairing the two here would put a JSON artefact in the ontology.
            const intrinsic = pair.forward?.json?.placement === 'property';
            verbs.set(id, {
                id,
                name: lowerFirst(side.verb),
                definition: side.definition?.en ?? null,
                symmetric: pair.kind === 'symmetric' && verbAlone(side.verb) && !intrinsic,
                inverse: asserting.has(pair._id) && other?.verb ? `${prefix}:${lowerFirst(other.verb)}` : null,
            });
        }
        return id;
    });

    /** The inverse each specific property takes, where its verb cannot carry one. */
    const inverses = new Map();
    const noteInverse = ((from, to) => {
        if (!inverses.has(from)) inverses.set(from, new Set());
        inverses.get(from).add(to);
    });

    edges.forEach((edge) => {
        const pair = pairs.get(edge.pair);
        DIRECTIONS.filter(({ direction }) => carries(edge, direction)).forEach(({ direction, from, to }) => {
            const stored = edge[direction];
            if (stored?.rdf?.include === false) return;
            const name = stored?.names?.rdfName?.value;
            const domain = index.classes.get(edge[from]?.term);
            const range = index.classes.get(edge[to]?.term);
            if (!name || !domain || !range || !pair) {
                skipped.push({ edgeId: edge._id, direction });
                return;
            }
            const id = `${prefix}:${name}`;
            if (!properties.has(id)) {
                properties.set(id, {
                    id, name, domains: new Set(), ranges: new Set(), verbs: new Set(), rangeOf: new Map(),
                });
            }
            const property = properties.get(id);
            property.domains.add(`${prefix}:${domain.name}`);
            property.ranges.add(`${prefix}:${range.name}`);

            // A narrowed end says what the property points at more exactly than its class does: an
            // Asset whose Asset Function is a Script. The declared range stays the broad class,
            // because `schema:rangeIncludes` asserts rather than restricts — writing the narrow class
            // there would change what the ontology says, not only what it checks. So the narrowing is
            // carried beside it and enforced in SHACL.
            const narrowed = qualifierFor(index.qualifiers, edge[to]?.qualifier);
            if (narrowed) {
                const entry = {
                    class: `${prefix}:${range.name}`,
                    function: { path: `${prefix}:${narrowed.tree.path}`, class: `${prefix}:${narrowed.value.name}` },
                };
                property.rangeOf.set(JSON.stringify(entry), entry);
            }
            const verb = verbProperty(pair, direction);
            if (verb) property.verbs.add(verb);

            // Both directions of one edge are each other's inverse. Stated here only where the verbs
            // cannot state it, and only between names that answer each other one to one.
            const other = direction === 'forward' ? 'reverse' : 'forward';
            const otherName = carries(edge, other) && edge[other]?.rdf?.include !== false
                ? edge[other]?.names?.rdfName?.value
                : null;
            // Whatever the verbs could not state, the properties do.
            const intrinsic = pair.forward?.json?.placement === 'property';
            const stated = asserting.has(pair._id);
            if (otherName && pair.kind === 'pair' && !stated && !intrinsic) noteInverse(id, `${prefix}:${otherName}`);
        });
    });

    // A property may answer more than one other — `usedByCharacter` answering both `realizedBy` and
    // `depictedBy` — and each is stated as its own inverse expression. Nothing is dropped, and there
    // is nothing left to report: it is only `owl:inverseOf` that cannot be said twice.
    const propertyInverses = [...inverses.entries()]
        .flatMap(([from, to]) => sorted(to).map((one) => ({ from, to: one })));

    const verbConflicts = [...properties.values()]
        .filter((property) => property.verbs.size > 1)
        .map((property) => ({ property: property.id, verbs: sorted(property.verbs) }));

    return {
        properties: [...properties.values()].sort((a, b) => a.name.localeCompare(b.name)),
        verbs: [...verbs.values()].sort((a, b) => a.name.localeCompare(b.name)),
        propertyInverses: propertyInverses.sort((a, b) => a.from.localeCompare(b.from)),
        skipped,
        verbConflicts,
    };
}

/**
 * The bundle.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{body: object, problems: object}}
 */
export function toRdfBundle(ctx) {
    const found = edgeProperties(ctx);

    // Each property's inverse expressions, gathered from the flat list the generator works in.
    const answering = new Map();
    found.propertyInverses.forEach(({ from, to }) => {
        answering.set(from, [...(answering.get(from) ?? []), to]);
    });

    const body = {
        generated: {
            format: 'omc-edge-rdf',
            version: 1,
            viewId: ctx.settings.viewId,
            verbs: found.verbs.length,
            properties: found.properties.length,
        },
        namespace: { prefix: ctx.settings.rdf.prefix, base: ctx.settings.rdf.base },
        // A verb every specific property below sits under. `inverse` is stated here only where this
        // verb belongs to one pair and that pair is not an OMC-JSON intrinsic; otherwise the specific
        // properties carry `inverseOf` expressions instead.
        verbs: found.verbs.map((verb) => ({
            id: verb.id,
            name: verb.name,
            definition: verb.definition,
            symmetric: verb.symmetric,
            inverse: verb.inverse,
        })),
        // `rangeOf` narrows a declared range: an Asset whose Asset Function is a Script. It is there
        // only where an edge says so, so a property that narrows nothing carries exactly what it
        // always did. `ranges` is never touched by it — that stays the class the property points at,
        // since `schema:rangeIncludes` asserts rather than restricts, and the narrowing is enforced
        // in SHACL instead.
        properties: found.properties.map((property) => ({
            id: property.id,
            name: property.name,
            verbs: [...property.verbs].sort(),
            domains: [...property.domains].sort(),
            ranges: [...property.ranges].sort(),
            inverseOf: answering.get(property.id) ?? [],
            ...(property.rangeOf.size ? { rangeOf: [...property.rangeOf.values()] } : {}),
        })),
    };

    return {
        body,
        problems: {
            ...(found.skipped.length ? { skipped: found.skipped } : {}),
            ...(found.verbConflicts.length ? { verbConflicts: found.verbConflicts } : {}),
        },
    };
}
