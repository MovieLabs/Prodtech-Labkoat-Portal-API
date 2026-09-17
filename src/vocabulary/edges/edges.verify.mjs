/**
 * Checks on the edge modules that need no database: reading classes from a view document, naming,
 * the staleness check, and the OMC-JSON document built from edges.
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

import { checkEdges } from './check.js';
import { classIndex, className } from './classes.js';
import { toEdgeDocument } from './generators/document.js';
import { toEdgeDefinitions } from './generators/json.js';
import { toEdgeMarkdown } from './generators/markdown.js';
import { toEdgeMatrix } from './generators/matrix.js';
import { edgeProperties, toOwlTurtle, toShaclTurtle } from './generators/owl.js';
import { checkBundle, owlTurtle, shaclTurtle } from './handoff/omcEdgesToTurtle.mjs';
import { applyNames, generateNames, namesDrift } from './naming.js';
import { validatePair } from './validate.js';

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
            term('c:function', 'Asset Function', [], [term('c:audio', 'Audio', ['Ctrl-Value'], [], 'c:function#f1')]),
        ]),
        term('c:narr', 'Narrative Entity', ['RDF-Abstract'], [
            term('c:portrayable', 'Portrayable Narrative Entity', ['RDF-Grouping'], [
                term('c:character', 'Character', ['RDF-Entity', 'JSON-Entity'], [term('c:extra', 'Extra', ['RDF-Entity'])]),
            ]),
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

const index = classIndex(doc);
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

    const { body } = toOwlTurtle(ctx);
    assert.match(body, /rdfs:subPropertyOf \[ owl:inverseOf omc:realizedByRealization \]/);
    assert.match(body, /rdfs:subPropertyOf \[ owl:inverseOf omc:depictedByDepiction \]/);
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
    // A verb-level statement is its own line; the blank-node form only ever appears inside brackets,
    // so a substring test would match `[ owl:inverseOf omc:usedByParticipant ]` and prove nothing.
    assert.ok(!/^\s+owl:inverseOf /m.test(toOwlTurtle(ctx).body));
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
    assert.ok(!toOwlTurtle(ctx).body.includes('owl:inverseOf'));
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
    // The shapes read the same properties, and are what the export actually serves.
    assert.match(toShaclTurtle(ctx).body, /sh:targetSubjectsOf/);
});

check('the handoff script writes exactly what this service writes', () => {
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
    // The script is a copy of this logic living in another repository, so the only thing that keeps
    // the two honest is that one document produces the same bytes through both.
    const { body: document } = toEdgeDocument(ctx);
    assert.equal(owlTurtle(document), toOwlTurtle(ctx).body);
    assert.equal(shaclTurtle(document), toShaclTurtle(ctx).body);
    assert.doesNotThrow(() => checkBundle(document));
    // One document, both projections: the OMC-JSON table is in the same file the RDF came from.
    assert.ok(document.json.edgeDefinitions);
});

check('the handoff script refuses a document that is only the OMC-JSON table', () => {
    const { body } = toEdgeDefinitions({
        edges: [edgeOf('e:17', 'c:character', 'c:realization')],
        pairs: new Map([[pair._id, pair]]),
        index,
        settings: { viewId: VIEW, rdf: { prefix: 'omc' } },
    });
    assert.throws(() => checkBundle(body), /omc-edge-definitions/);
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

console.log(`edges.verify: ${passed} checks passed`);
