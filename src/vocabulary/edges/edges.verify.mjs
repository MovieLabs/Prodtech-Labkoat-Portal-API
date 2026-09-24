/**
 * Checks on the edge modules that need no database: reading classes from a view document, naming,
 * the staleness check, and the two projections the export document carries.
 *
 * ```
 * node src/vocabulary/edges/edges.verify.mjs
 * ```
 *
 * Exits non-zero on the first failure.
 *
 * @module vocabulary/edges/edges.verify
 */

import assert from 'node:assert/strict';

import { checkEdges, namesNow } from './check.js';
import { classIndex, className } from './classes.js';
import { toEdgeDocument } from './generators/document.js';
import { toEdgeDefinitions } from './generators/json.js';
import { toEdgeMarkdown } from './generators/markdown.js';
import { toEdgeMatrix } from './generators/matrix.js';
import { edgeProperties, toRdfBundle } from './generators/rdfBundle.js';
import { applyNames, generateNames, namesDrift } from './naming.js';
import { validateEdge, validatePair } from './validate.js';

let passed = 0;
const check = ((name, run) => {
    try {
        run();
        passed += 1;
    } catch (err) {
        console.error(`edges.verify: ${name}\n`, err.message);
        process.exit(1);
    }
});

const VIEW = 'view:entity-structure';
const term = ((id, label, tags, children = [], collection = VIEW) => ({
    id, label, tags, children, collection,
}));

// A small view in the shape `toViewJson` produces, covering each reading rule.
const doc = {
    view: { id: VIEW },
    tree: [
        term('c:asset', 'Asset', ['RDF-Entity', 'JSON-Entity'], [
            term('c:group', 'Asset Group', ['RDF-Entity']),
            term('c:prov', 'Provenance', ['RDF-Entity', 'Attached', 'JSON-Entity']),
            term('c:function', 'Asset Function', ['Attached', 'RDF-Record'], [
                term('c:audio', 'Audio', ['Ctrl-Value'], [], 'c:function#f1'),
                term('c:script', 'Script', ['RDF-Record'], [], 'c:function#f1'),
                term('c:prodobject', 'Production Object', ['RDF-Record'], [
                    term('c:setdressing', 'Production Set Dressing', ['RDF-Record'], [], 'c:function#f1'),
                ], 'c:function#f1'),
            ]),
        ]),
        term('c:narr', 'Narrative Entity', ['RDF-Abstract'], [
            term('c:portrayable', 'Portrayable Narrative Entity', ['RDF-Grouping'], [
                term('c:character', 'Character', ['RDF-Entity', 'JSON-Entity'], [term('c:extra', 'Extra', ['RDF-Entity'])]),
            ]),
            // Written inside Narrative Styling, which is how one branch comes to be placed under two
            // parents: the same class, the same children, in both places.
            term('c:styling', 'Narrative Styling', ['RDF-Abstract', 'JSON-Entity'], [
                term('c:hair', 'Narrative Hair', ['RDF-Entity'], [], 'c:styling'),
            ]),
        ]),
        term('c:realizable', 'Realizable Narrative Entity', ['RDF-Abstract'], [
            term('c:styling', 'Narrative Styling', ['RDF-Abstract', 'JSON-Entity'], [
                term('c:hair', 'Narrative Hair', ['RDF-Entity'], [], 'c:styling'),
            ], 'c:realizable'),
        ]),
        term('c:realization', 'Realization', ['RDF-Entity', 'JSON-Entity'], [
            term('c:depiction', 'Depiction', ['RDF-Entity'], [term('c:portrayal', 'Portrayal', ['RDF-Entity'])]),
        ]),
        term('c:participant', 'Participant', ['RDF-Entity', 'JSON-Entity'], [
            term('c:pfunction', 'Participant Function', [], [term('c:role', 'Role', ['RDF-Entity', 'Attached'])]),
        ]),
        term('c:structure', 'Asset Structure', ['RDF-Abstract', 'JSON-Entity'], [
            term('c:prov', 'Provenance', ['RDF-Entity', 'Attached', 'JSON-Entity']),
            term('c:digital', 'Digital Audio-Visual', ['RDF-Entity']),
        ]),
    ],
};

const index = classIndex(doc, { qualifiers: ['c:function'] });
const cls = ((id) => index.classes.get(id));

check('className matches the RDF build', () => {
    assert.equal(className('Digital Audio-Visual'), 'DigitalAudioVisual');
    assert.equal(className('fileName'), 'FileName');
});

check('nesting is subclass, through a grouping', () => {
    assert.deepEqual(cls('c:extra').supers, ['c:character']);
    assert.deepEqual(cls('c:character').ancestors, ['c:portrayable', 'c:narr']);
});

check('an attached placement gives a relationship, never a superclass', () => {
    assert.deepEqual(cls('c:prov').supers, []);
    const named = index.structural.filter((edge) => edge.name === 'hasProvenance').map((edge) => edge.domain).sort();
    assert.deepEqual(named, ['c:asset', 'c:structure']);
});

check('a slot names the relationship', () => {
    const slot = index.structural.find((edge) => edge.via === 'slot');
    assert.deepEqual([slot.domain, slot.name, slot.range], ['c:participant', 'hasParticipantFunction', 'c:role']);
    assert.equal(cls('c:pfunction'), undefined);
});

check('members of a term\'s arrangement are not classes', () => {
    assert.equal(cls('c:audio'), undefined);
});

check('a class written inside another term is still a class, under each parent placing it', () => {
    assert.deepEqual(cls('c:styling').supers, ['c:narr', 'c:realizable']);
    assert.deepEqual(cls('c:hair').supers, ['c:styling']);
    assert.equal(cls('c:hair').jsonType, 'NarrativeStyling');
});

check('OMC-JSON projection is the nearest marked superclass', () => {
    assert.equal(cls('c:portrayal').jsonType, 'Realization');
    assert.equal(cls('c:extra').jsonType, 'Character');
    assert.equal(cls('c:digital').jsonType, 'AssetStructure');
    assert.equal(cls('c:narr').jsonType, null);
    assert.equal(cls('c:role').jsonType, null);
});

const pair = {
    _id: 'p:uses',
    kind: 'pair',
    forward: { verb: 'realizedBy', json: { placement: 'edges' } },
    reverse: { verb: 'realizes', json: { placement: 'edges' } },
    modified: 't1',
};

check('names come from the verb, the projected range and the actual class', () => {
    const names = generateNames({ side: pair.forward, domain: cls('c:character'), range: cls('c:portrayal') });
    assert.deepEqual(names, {
        placement: 'edges', predicate: 'realizedBy', path: 'edges.realizedBy.Realization', rdfName: 'realizedByPortrayal',
    });
    const property = generateNames({ side: { verb: 'director', json: { placement: 'property' } }, domain: cls('c:asset'), range: cls('c:participant') });
    assert.equal(property.predicate, 'Director');
    assert.equal(property.path, 'Director');
});

check('a verb that names what it points at takes the RDF name alone', () => {
    const side = { verb: 'portrayedBy', json: { placement: 'edges' }, rdf: { template: '{verb}' } };
    const names = generateNames({ side, domain: cls('c:character'), range: cls('c:portrayal') });
    assert.equal(names.rdfName, 'portrayedBy');
    assert.equal(names.path, 'edges.portrayedBy.Realization');
});

check('an override that matches the generated name is not an override', () => {
    const generated = generateNames({ side: pair.forward, domain: cls('c:character'), range: cls('c:realization') });
    const names = applyNames({ rdfName: { override: generated.rdfName } }, generated);
    assert.equal(names.rdfName.override, null);
    assert.equal(names.rdfName.value, generated.rdfName);
    assert.deepEqual(namesDrift(names, generated), []);
});

check('an override stands, and is never drift', () => {
    const generated = generateNames({ side: pair.forward, domain: cls('c:character'), range: cls('c:realization') });
    const names = applyNames({ rdfName: { override: 'isRealizedBy' } }, generated);
    assert.equal(names.rdfName.value, 'isRealizedBy');
    assert.deepEqual(namesDrift(names, generated).map((one) => [one.field, one.overridden]), [['rdfName', true]]);
});

const edgeOf = ((id, domain, range, extra = {}) => {
    const edge = {
        _id: id,
        pair: 'p:uses',
        domain: { term: domain },
        range: { term: range },
        forward: { mode: 'owned', json: { include: true }, rdf: { include: true } },
        reverse: { mode: 'owned', json: { include: true }, rdf: { include: true } },
        ...extra,
    };
    ['forward', 'reverse'].forEach((direction) => {
        const [from, to] = direction === 'forward' ? [domain, range] : [range, domain];
        const side = direction === 'forward' ? pair.forward : pair.reverse;
        edge[direction].names = applyNames({}, generateNames({ side, domain: cls(from), range: cls(to) }));
    });
    edge.basis = {
        domain: { label: cls(domain).label, jsonTerm: cls(domain).jsonTerm },
        range: { label: cls(range).label, jsonTerm: cls(range).jsonTerm },
        pairModified: 't1',
    };
    return edge;
});

check('a clean edge has no problems', () => {
    const edges = [edgeOf('e:1', 'c:character', 'c:realization')];
    const report = checkEdges({
        edges, pairs: new Map([[pair._id, pair]]), settings: {}, index, terms: new Map([...index.classes.keys()].map((id) => [id, { status: 'published' }])),
    });
    assert.deepEqual(report.summary, { error: 0, warning: 0, info: 0 });
});

check('a moved, renamed or deleted class is reported', () => {
    const edge = edgeOf('e:1', 'c:character', 'c:realization');
    edge.basis.range = { label: 'Realisation', jsonTerm: 'c:elsewhere' };
    const gone = edgeOf('e:2', 'c:character', 'c:realization', { range: { term: 'c:deleted' } });
    const terms = new Map([...index.classes.keys()].map((id) => [id, { status: 'published' }]));
    const report = checkEdges({
        edges: [edge, gone], pairs: new Map([[pair._id, pair]]), settings: {}, index, terms,
    });
    const codes = ((id) => (report.byEdge[id] ?? []).map((problem) => problem.code).sort());
    assert.ok(codes('e:1').includes('classRenamed'));
    assert.ok(codes('e:1').includes('projectionChanged'));
    assert.ok(codes('e:2').includes('missingTerm'));
});

check('an edge the structure already gives is a duplicate', () => {
    const edge = edgeOf('e:3', 'c:asset', 'c:prov');
    const terms = new Map([...index.classes.keys()].map((id) => [id, { status: 'published' }]));
    const report = checkEdges({
        edges: [edge], pairs: new Map([[pair._id, pair]]), settings: {}, index, terms,
    });
    assert.ok(report.byEdge['e:3'].some((problem) => problem.code === 'structuralDuplicate'));
});

check('a symmetric edge between a class and itself is not an RDF conflict', () => {
    const related = {
        _id: 'p:related', kind: 'symmetric', forward: { verb: 'related', json: { placement: 'edges' } }, reverse: null, modified: 't1',
    };
    const edge = edgeOf('e:4', 'c:character', 'c:character', { pair: 'p:related' });
    ['forward', 'reverse'].forEach((direction) => {
        edge[direction].names = applyNames({}, generateNames({ side: related.forward, domain: cls('c:character'), range: cls('c:character') }));
    });
    const terms = new Map([...index.classes.keys()].map((id) => [id, { status: 'published' }]));
    const report = checkEdges({
        edges: [edge], pairs: new Map([[related._id, related]]), settings: {}, index, terms,
    });
    assert.ok(!(report.byEdge['e:4'] ?? []).some((problem) => problem.code === 'rdfConflict'));
});

check('RDF edges projecting to one OMC-JSON row publish it once', () => {
    const edges = [edgeOf('e:1', 'c:character', 'c:realization'), edgeOf('e:2', 'c:extra', 'c:portrayal')];
    const { body } = toEdgeDefinitions({
        edges, pairs: new Map([[pair._id, pair]]), index, settings: { viewId: VIEW, rdf: { prefix: 'omc' } },
    });
    assert.deepEqual(body.edgeDefinitions.realizedBy.connects.map((one) => [one.domain, one.range]), [[['Character'], ['Realization']]]);
    assert.equal(body.edgeDefinitions.realizedBy.inverse, 'realizes');
    assert.equal(body.generated.rows, 2);
});

check('a direction not published to RDF claims no RDF property', () => {
    const edge = edgeOf('e:5', 'c:character', 'c:realization');
    edge.forward.rdf = { include: false };
    edge.reverse.rdf = { include: false };
    edge.reverse.names.placement = { value: 'property', override: 'property' };
    edge.reverse.names.predicate = { value: 'RealizationUsedBy', override: 'RealizationUsedBy' };
    edge.reverse.names.path = { value: 'RealizationUsedBy', override: 'RealizationUsedBy' };
    const { body } = toEdgeDefinitions({
        edges: [edge], pairs: new Map([[pair._id, pair]]), index, settings: { viewId: VIEW, rdf: { prefix: 'omc' } },
    });
    assert.equal(body.edgeDefinitions.realizedBy.rdf, 'tentative');
    assert.equal(body.edgeDefinitions.RealizationUsedBy.rdf, 'intrinsic');
});

// `usedBy` against two different verbs: distinct properties, because each is named for the class it
// points at, so the inverses are stated between those rather than between the verbs.
const shared = {
    used: {
        _id: 'p:used', kind: 'pair', forward: { verb: 'realizedBy', json: { placement: 'edges' } }, reverse: { verb: 'usedBy', json: { placement: 'edges' } }, modified: 't1',
    },
    depicted: {
        _id: 'p:depicted', kind: 'pair', forward: { verb: 'depictedBy', json: { placement: 'edges' } }, reverse: { verb: 'usedBy', json: { placement: 'edges' } }, modified: 't1',
    },
};

check('a verb may belong to more than one pair, with a warning', () => {
    const found = validatePair(shared.depicted, [shared.used]);
    assert.equal(found.ok, true);
    assert.equal(found.warnings.length, 1);
    assert.match(found.warnings[0], /usedBy/);
});

const sharedEdge = ((id, pairId, side, domain, range) => {
    const edge = {
        _id: id,
        pair: pairId,
        domain: { term: domain },
        range: { term: range },
        forward: { mode: 'owned', json: { include: true }, rdf: { include: true } },
        reverse: { mode: 'owned', json: { include: true }, rdf: { include: true } },
    };
    ['forward', 'reverse'].forEach((direction) => {
        const [from, to] = direction === 'forward' ? [domain, range] : [range, domain];
        const verbSide = direction === 'forward' ? side.forward : side.reverse;
        edge[direction].names = applyNames({}, generateNames({ side: verbSide, domain: cls(from), range: cls(to) }));
    });
    return edge;
});

check('a shared verb states its inverses between the properties, not the verbs', () => {
    const edges = [
        sharedEdge('e:6', 'p:used', shared.used, 'c:character', 'c:realization'),
        sharedEdge('e:7', 'p:depicted', shared.depicted, 'c:participant', 'c:depiction'),
    ];
    const found = edgeProperties({
        edges,
        pairs: new Map([['p:used', shared.used], ['p:depicted', shared.depicted]]),
        index,
        settings: { rdf: { prefix: 'omc' } },
    });
    assert.equal(found.verbs.find((verb) => verb.name === 'usedBy')?.inverse, null);
    const stated = found.propertyInverses.map((one) => [one.from, one.to]).sort();
    assert.deepEqual(stated, [
        ['omc:depictedByDepiction', 'omc:usedByParticipant'],
        ['omc:realizedByRealization', 'omc:usedByCharacter'],
        ['omc:usedByCharacter', 'omc:realizedByRealization'],
        ['omc:usedByParticipant', 'omc:depictedByDepiction'],
    ]);
});

check('one property may answer two others, each stated as its own inverse expression', () => {
    const ctx = {
        edges: [
            sharedEdge('e:8', 'p:used', shared.used, 'c:character', 'c:realization'),
            // The same reverse name, `usedByCharacter`, answering a second forward property.
            sharedEdge('e:9', 'p:depicted', shared.depicted, 'c:character', 'c:depiction'),
        ],
        pairs: new Map([['p:used', shared.used], ['p:depicted', shared.depicted]]),
        index,
        settings: { rdf: { prefix: 'omc' } },
    };
    const found = edgeProperties(ctx);
    const answered = found.propertyInverses
        .filter((one) => one.from === 'omc:usedByCharacter')
        .map((one) => one.to)
        .sort();
    assert.deepEqual(answered, ['omc:depictedByDepiction', 'omc:realizedByRealization']);
    // Nothing to report: `owl:inverseOf` is what cannot be said twice, and this does not say it.
    assert.equal(found.inverseConflicts, undefined);

    // Both reach the published bundle, gathered onto the property that answers them.
    const { body } = toRdfBundle(ctx);
    assert.deepEqual(body.properties.find((one) => one.id === 'omc:usedByCharacter').inverseOf,
        ['omc:depictedByDepiction', 'omc:realizedByRealization']);
});

check('a verb shared on one side takes the inverse off both its verbs', () => {
    // `usedBy` is the forward of two pairs, so neither may state an inverse — not even from the
    // reverse side, whose verb is named once. Three such statements would collapse the reverses.
    const ctx = {
        edges: [
            sharedEdge('e:18', 'p:used', shared.used, 'c:character', 'c:realization'),
            sharedEdge('e:19', 'p:depicted', shared.depicted, 'c:participant', 'c:depiction'),
        ],
        pairs: new Map([['p:used', shared.used], ['p:depicted', shared.depicted]]),
        index,
        settings: { rdf: { prefix: 'omc' } },
    };
    const found = edgeProperties(ctx);
    ['usedBy', 'realizedBy', 'depictedBy'].forEach((name) => {
        assert.equal(found.verbs.find((verb) => verb.name === name)?.inverse, null, `${name} states an inverse`);
    });
    // Published, no verb carries one either, so a consumer has none to write.
    assert.deepEqual(toRdfBundle(ctx).body.verbs.filter((verb) => verb.inverse), []);
});

check('a genuine pair keeps its verb inverse though its reverse verb leads other pairs', () => {
    // `usedIn` is the reverse of `uses` and the forward of another pair. Only the first may state it.
    const uses = {
        _id: 'p:uses', kind: 'pair', forward: { verb: 'uses', json: { placement: 'edges' } }, reverse: { verb: 'usedIn', json: { placement: 'edges' } }, modified: 't1',
    };
    const usedInOf = {
        _id: 'p:usedInOf', kind: 'pair', forward: { verb: 'usedIn', json: { placement: 'edges' } }, reverse: { verb: 'depictionOf', json: { placement: 'edges' } }, modified: 't1',
    };
    const found = edgeProperties({
        edges: [
            sharedEdge('e:20', 'p:uses', uses, 'c:participant', 'c:asset'),
            sharedEdge('e:21', 'p:usedInOf', usedInOf, 'c:asset', 'c:depiction'),
        ],
        pairs: new Map([['p:uses', uses], ['p:usedInOf', usedInOf]]),
        index,
        settings: { rdf: { prefix: 'omc' } },
    });
    assert.equal(found.verbs.find((verb) => verb.name === 'uses')?.inverse, 'omc:usedIn');
    assert.equal(found.verbs.find((verb) => verb.name === 'depictionOf')?.inverse, null);
    // And `usedIn` itself is named by exactly one statement, which is the whole safety condition.
    assert.equal(found.verbs.filter((verb) => verb.inverse === 'omc:usedIn').length, 1);
});

check('an intrinsic pair states no inverse, its reverse verb being an OMC-JSON field name', () => {
    const intrinsic = {
        _id: 'p:intrinsic',
        kind: 'pair',
        forward: { verb: 'realizationOf', json: { placement: 'property' } },
        reverse: { verb: 'realizedByTemp', json: { placement: 'edges' } },
        modified: 't1',
    };
    const ctx = {
        edges: [sharedEdge('e:13', 'p:intrinsic', intrinsic, 'c:realization', 'c:character')],
        pairs: new Map([['p:intrinsic', intrinsic]]),
        index,
        settings: { rdf: { prefix: 'omc' } },
    };
    const found = edgeProperties(ctx);
    assert.equal(found.verbs.find((verb) => verb.name === 'realizationOf')?.inverse, null);
    assert.deepEqual(found.propertyInverses, []);
    const { body } = toRdfBundle(ctx);
    assert.deepEqual(body.verbs.filter((verb) => verb.inverse), []);
    assert.deepEqual(body.properties.flatMap((one) => one.inverseOf), []);
});

check('a pair declaring no inverse publishes RDF rather than throwing', () => {
    const alone = {
        _id: 'p:alone', kind: 'none', forward: { verb: 'assetStructure', json: { placement: 'property' } }, reverse: null, modified: 't1',
    };
    const edge = edgeOf('e:12', 'c:asset', 'c:structure', { pair: 'p:alone' });
    edge.reverse = { mode: 'none' };
    edge.forward.names = applyNames({}, generateNames({ side: alone.forward, domain: cls('c:asset'), range: cls('c:structure') }));
    const ctx = {
        edges: [edge], pairs: new Map([['p:alone', alone]]), index, settings: { rdf: { prefix: 'omc' } },
    };
    const found = edgeProperties(ctx);
    assert.deepEqual(found.skipped, []);
    assert.equal(found.verbs.find((verb) => verb.name === 'assetStructure')?.inverse, null);
    assert.deepEqual(found.propertyInverses, []);
    // It reaches the bundle, which is what the export actually serves.
    assert.ok(toRdfBundle(ctx).body.properties.some((one) => one.name === 'assetStructureAssetStructure'));
});

check('one document carries both projections, and the namespace to read them under', () => {
    const ctx = {
        edges: [
            sharedEdge('e:14', 'p:used', shared.used, 'c:character', 'c:realization'),
            sharedEdge('e:15', 'p:depicted', shared.depicted, 'c:participant', 'c:depiction'),
            edgeOf('e:16', 'c:asset', 'c:prov'),
        ],
        pairs: new Map([['p:used', shared.used], ['p:depicted', shared.depicted], [pair._id, pair]]),
        index,
        settings: { viewId: VIEW, rdf: { prefix: 'omc', base: 'https://movielabs.com/omc/rdf/schema/v3.0#' } },
    };
    // Neither projection can be derived from the other, so a consumer of one must find the other
    // beside it rather than in a second file that has to agree.
    const { body: document } = toEdgeDocument(ctx);
    assert.ok(document.json.edgeDefinitions);
    assert.ok(document.rdf.properties.length);
    assert.ok(document.rdf.verbs.length);
    assert.deepEqual(document.namespace, { prefix: 'omc', base: 'https://movielabs.com/omc/rdf/schema/v3.0#' });
    assert.equal(document.generated.format, 'omc-edges');
});

check('the matrix puts an edge in the cell for its two classes, and leaves the rest empty', () => {
    const edges = [edgeOf('e:10', 'c:character', 'c:realization')];
    const { body } = toEdgeMatrix({
        edges, index, settings: { viewId: VIEW, rdf: { prefix: 'omc' } },
    });
    const rows = body.trim().split('\n').map((line) => line.split(','));
    const [header] = rows;
    const at = ((rowLabel, columnLabel) => {
        const row = rows.find((one) => one[0].replace(/"/g, '') === rowLabel);
        return row?.[header.findIndex((one) => one.replace(/"/g, '') === columnLabel)]?.replace(/"/g, '') ?? null;
    });
    assert.equal(at('Character', 'Realization'), 'realizedBy ↔ realizes');
    assert.equal(at('Realization', 'Character'), 'realizes ↔ realizedBy');
    // A pair of classes no edge joins is the thing a matrix is read for.
    assert.equal(at('Character', 'Asset'), '');
});

check('the markdown lists a class\'s relationships with the inverse and what it points at', () => {
    const edges = [edgeOf('e:11', 'c:character', 'c:realization')];
    const { body } = toEdgeMarkdown({
        edges, index, settings: { viewId: VIEW, rdf: { prefix: 'omc' } },
    });
    assert.match(body, /^## Character$/m);
    assert.match(body, /^## Realization$/m);
    assert.match(body, /\| realizedBy \/ realizedByRealization → \| ← realizes \/ realizesCharacter \| \*\*Realization\*\*/m);
});

// ---------------------------------------------------------------------------
// Narrowing an edge end: Asset(Script)
// ---------------------------------------------------------------------------

const SETTINGS = { viewId: VIEW, rdf: { prefix: 'omc', base: 'https://movielabs.com/omc/rdf/schema/v3.0#' } };

/** An edge whose ends may each name a class to narrow to, with its names generated accordingly. */
const narrowedEdge = ((id, domain, range, { narrowDomain = null, narrowRange = null } = {}) => {
    const edge = {
        _id: id,
        pair: 'p:uses',
        domain: { term: domain, ...(narrowDomain ? { qualifier: narrowDomain } : {}) },
        range: { term: range, ...(narrowRange ? { qualifier: narrowRange } : {}) },
        forward: { mode: 'owned', json: { include: true }, rdf: { include: true } },
        reverse: { mode: 'owned', json: { include: true }, rdf: { include: true } },
    };
    ['forward', 'reverse'].forEach((direction) => {
        edge[direction].names = applyNames({}, namesNow({
            edge, pair, direction, classes: index.classes, qualifiers: index.qualifiers, settings: {},
        }));
    });
    return edge;
});

const ctxOf = ((edges) => ({
    edges, pairs: new Map([[pair._id, pair]]), index, settings: SETTINGS,
}));

const validationCtx = ((edges) => ({
    classes: index.classes,
    qualifiers: index.qualifiers,
    pairs: new Map([[pair._id, pair]]),
    edges,
    statuses: new Set(['proposed', 'review', 'published']),
}));

check('a qualifier tree is the classes in a term own structure, and nothing else in it', () => {
    const [tree] = index.qualifiers;
    assert.equal(tree.term, 'c:function');
    assert.equal(tree.path, 'hasAssetFunction');
    assert.deepEqual(tree.appliesTo, ['c:asset']);
    // `Audio` is a controlled value, so it is not one of them; a nested record still is.
    assert.deepEqual(tree.values.map((one) => one.name).sort(), ['ProductionObject', 'ProductionSetDressing', 'Script']);
    assert.deepEqual(tree.values.find((one) => one.name === 'ProductionSetDressing').ancestors, ['c:prodobject', 'c:function']);
    // And none of them is a class an edge could be drawn to.
    assert.equal(index.classes.get('c:script'), undefined);
});

check('a narrowed end names the RDF property, and leaves OMC-JSON alone', () => {
    const edge = narrowedEdge('n:1', 'c:character', 'c:asset', { narrowRange: 'c:script' });
    assert.equal(edge.forward.names.rdfName.value, 'realizedByScript');
    assert.equal(edge.forward.names.path.value, 'edges.realizedBy.Asset');
    assert.equal(edge.forward.names.predicate.value, 'realizedBy');
    // The reverse direction points at the Character, which is narrowed by nothing.
    assert.equal(edge.reverse.names.rdfName.value, 'realizesCharacter');
});

check('the narrowing is carried beside the declared range, never written into it', () => {
    const { body } = toRdfBundle(ctxOf([narrowedEdge('n:2', 'c:character', 'c:asset', { narrowRange: 'c:script' })]));
    const property = body.properties.find((one) => one.id === 'omc:realizedByScript');
    assert.deepEqual(property.ranges, ['omc:Asset']);
    assert.deepEqual(property.rangeOf, [{
        class: 'omc:Asset',
        function: { path: 'omc:hasAssetFunction', class: 'omc:Script' },
    }]);
});

check('a property narrowing nothing publishes exactly what it did before', () => {
    const { body } = toRdfBundle(ctxOf([narrowedEdge('n:3', 'c:character', 'c:realization')]));
    body.properties.forEach((property) => assert.ok(!Object.hasOwn(property, 'rangeOf'), `${property.id} gained a rangeOf`));
});

check('narrowing the domain end publishes as the reverse property rangeOf', () => {
    // `Asset(Production Set Dressing) → Character` is qualified on the side the forward direction
    // starts from, which is the side the reverse direction points at.
    const { body } = toRdfBundle(ctxOf([narrowedEdge('n:4', 'c:asset', 'c:character', { narrowDomain: 'c:setdressing' })]));
    const forward = body.properties.find((one) => one.id === 'omc:realizedByCharacter');
    const reverse = body.properties.find((one) => one.id === 'omc:realizesProductionSetDressing');
    assert.ok(!Object.hasOwn(forward, 'rangeOf'));
    assert.deepEqual(reverse.rangeOf, [{
        class: 'omc:Asset',
        function: { path: 'omc:hasAssetFunction', class: 'omc:ProductionSetDressing' },
    }]);
});

check('two edges narrowed the same way merge into one property, stating it once', () => {
    const { body } = toRdfBundle(ctxOf([
        narrowedEdge('n:6', 'c:character', 'c:asset', { narrowRange: 'c:script' }),
        narrowedEdge('n:7', 'c:participant', 'c:asset', { narrowRange: 'c:script' }),
    ]));
    const property = body.properties.find((one) => one.id === 'omc:realizedByScript');
    // Both domains reach it, because the narrowing is what names it and both edges narrow alike.
    assert.deepEqual(property.domains, ['omc:Character', 'omc:Participant']);
    assert.deepEqual(property.rangeOf, [{
        class: 'omc:Asset',
        function: { path: 'omc:hasAssetFunction', class: 'omc:Script' },
    }]);
});

check('a narrowing is checked against the vocabulary before it is written', () => {
    const good = narrowedEdge('n:10', 'c:character', 'c:asset', { narrowRange: 'c:script' });
    assert.equal(validateEdge(good, validationCtx([])).ok, true);

    const invented = narrowedEdge('n:11', 'c:character', 'c:asset', { narrowRange: 'c:screenplay' });
    assert.equal(validateEdge(invented, validationCtx([])).ok, false);

    // A Character carries no Asset Function, so it cannot be an Asset(Script).
    const wrongEnd = narrowedEdge('n:12', 'c:asset', 'c:character', { narrowRange: 'c:script' });
    assert.equal(validateEdge(wrongEnd, validationCtx([])).ok, false);
});

check('two edges differing only in their narrowing are not duplicates', () => {
    const script = narrowedEdge('n:13', 'c:character', 'c:asset', { narrowRange: 'c:script' });
    const object = narrowedEdge('n:14', 'c:character', 'c:asset', { narrowRange: 'c:prodobject' });
    assert.equal(validateEdge(object, validationCtx([script])).ok, true);
    // The same two ends with no narrowing on either still are.
    const bare = narrowedEdge('n:15', 'c:character', 'c:asset');
    assert.equal(validateEdge(narrowedEdge('n:16', 'c:character', 'c:asset'), validationCtx([bare])).ok, false);
});

check('a narrowing the vocabulary no longer offers is reported', () => {
    const edge = narrowedEdge('n:17', 'c:character', 'c:asset', { narrowRange: 'c:script' });
    edge.range.qualifier = 'c:retired';
    const terms = new Map([...index.classes.keys()].map((id) => [id, { status: 'published' }]));
    const report = checkEdges({
        edges: [edge], pairs: new Map([[pair._id, pair]]), settings: {}, index, terms,
    });
    assert.ok(report.byEdge['n:17'].some((problem) => problem.code === 'qualifierGone'));
});

console.log(`edges.verify: ${passed} checks passed`);
