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
import { toEdgeDefinitions } from './generators/json.js';
import { applyNames, generateNames, namesDrift } from './naming.js';

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

console.log(`edges.verify: ${passed} checks passed`);
