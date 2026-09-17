/**
 * The entity classes a view defines, and how they relate, read from the view's JSON document.
 *
 * ## One reading of the view, shared with the RDF build
 *
 * OMC's RDF is built from this same view by `RDF-Testing/generate.js` in the OMC-Development
 * repository, from the same document `toViewJson` produces. That script cannot be imported, so its
 * README is the rule set and this module follows it; a disagreement between the two would publish
 * edges between classes the ontology does not have. The rules that matter here:
 *
 * - **A class is a placement in the view's own member list.** A placement inside a term's
 *   arrangement is a member of that term's structure — a controlled value, or a record's field.
 * - **Nesting means subclass. A child tagged `Attached` is the exception:** each of its placements
 *   is a `has<Child>` relationship from the parent instead. Filed under an `RDF-Grouping`, an
 *   attached term still subclasses the grouping.
 * - **A record placed only under entities is attached by implication.**
 * - **A slot** — an untagged class whose children are all attached, none of them fields — names the
 *   relationship rather than being a class: Participant Function under Participant, holding Role,
 *   is `hasParticipantFunction`.
 * - **`JSON-Entity` marks what OMC-JSON calls an entity.** A class projects to OMC-JSON as the nearest
 *   such class on its superclass chain, which may be a grouping, and never across an attached
 *   placement.
 *
 * Tags arrive as the words the view publishes them under, which is what the RDF build matches.
 *
 * @module vocabulary/edges/classes
 */

/** The tag words each role is read from, as the RDF build names them. Settings may rename any. */
export const DEFAULT_CLASS_TAGS = {
    entity: 'RDF-Entity',
    abstract: 'RDF-Abstract',
    grouping: 'RDF-Grouping',
    record: 'RDF-Record',
    attached: 'Attached',
    mixin: 'Mix-In',
    json: 'JSON-Entity',
};

/** Datatype tags. A term carrying one is a field, never a class. */
const DATATYPE_TAGS = ['string', 'number', 'integer', 'boolean', 'date', 'dateTime', 'uri'];

/** The roles an edge may start or end at. */
export const EDGE_ROLES = ['entity', 'abstract'];

/** Role tags in the order a role is read, when a term carries more than one. */
const ROLES = ['entity', 'abstract', 'grouping', 'record'];

/**
 * A class's RDF local name from its label, exactly as the RDF build derives it:
 * "Narrative Set Dressing" → `NarrativeSetDressing`, "Digital Audio-Visual" → `DigitalAudioVisual`.
 *
 * @param {string} label
 * @returns {string}
 */
export const className = ((label) => String(label ?? '')
    .replace(/[^A-Za-z0-9 _]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(''));

/**
 * @typedef {object} EntityClass
 * @property {string} id - The term id
 * @property {string} label
 * @property {string|null} definition - As the vocabulary states it
 * @property {string} name - RDF local name
 * @property {string|null} role - `entity` | `abstract` | `grouping` | `record`, or null when untagged
 * @property {string[]} tags - As published
 * @property {string[]} supers - Direct superclasses, by term id
 * @property {string[]} ancestors - Every superclass, nearest first
 * @property {number} placements
 * @property {string|null} jsonTerm - The class this one projects to in OMC-JSON
 * @property {string|null} jsonType - That class's OMC-JSON entityType
 */

/**
 * @typedef {object} StructuralEdge
 * @property {string} domain - Term id of the class that has it
 * @property {string} range - Term id of the class it points at
 * @property {string} name - The RDF property, e.g. `hasProvenance`
 * @property {'attached'|'slot'} via
 * @property {boolean} implied - Attached by implication: a record under an entity
 */

/**
 * Read a view's classes.
 *
 * @param {object} doc - From `toViewJson`
 * @param {object} [settings] - The edge settings: `tagWords` renames a role's tag, `jsonNames` maps a
 *   term id to the OMC-JSON name it takes where its label does not give it
 * @returns {{classes: Map<string, EntityClass>, structural: StructuralEdge[], problems: Array<object>}}
 */
export function classIndex(doc, settings = {}) {
    const words = { ...DEFAULT_CLASS_TAGS, ...(settings.tagWords ?? {}) };
    const viewId = doc?.view?.id;
    const problems = [];

    // Every placement in tree order. The first placement of a term is its canonical node, and every
    // placement is recorded against it.
    const nodes = [];
    const canonical = new Map();
    const walk = ((children, parent) => (children ?? []).forEach((term) => {
        const node = {
            term, parent, tags: term.tags ?? [], kind: term.collection === viewId ? 'class' : 'member',
        };
        const first = canonical.get(term.id);
        if (first) {
            node.canonical = first;
        } else {
            node.placements = [];
            canonical.set(term.id, node);
        }
        (first ?? node).placements.push(node);
        nodes.push(node);
        walk(term.children, node);
    }));
    walk(doc?.tree, null);

    const has = ((node, role) => node.tags.includes(words[role]));
    const roleOf = ((node) => ROLES.find((role) => has(node, role)) ?? null);
    const isDatatype = ((node) => node.tags.some((tag) => DATATYPE_TAGS.includes(tag)));
    const owners = new Set(nodes
        .filter((node) => node.kind === 'member')
        .map((node) => String(node.term.collection).replace(/#.*$/, '')));
    const owns = ((node) => owners.has(node.term.id));
    const kids = ((node) => node.term.children ?? []);

    // A record placed only under entities (a grouping filing it aside) is attached without the tag.
    canonical.forEach((node) => {
        if (!has(node, 'record') || has(node, 'attached') || has(node, 'mixin')) return;
        const parents = node.placements.map((at) => at.parent).filter((parent) => parent && !has(parent, 'grouping'));
        if (parents.length && parents.every((parent) => has(parent, 'entity'))) node.attachedImplied = true;
    });

    const isAttached = ((node) => has(node, 'attached') || has(node, 'mixin') || !!(node.canonical ?? node).attachedImplied);
    const isSlot = ((node) => node.kind === 'class' && !node.tags.length && !owns(node) && !!node.parent
        && kids(node).length > 0
        && kids(node).every((child) => (child.tags ?? []).some((tag) => tag === words.attached || tag === words.mixin)
            && !(child.tags ?? []).some((tag) => DATATYPE_TAGS.includes(tag))));

    const classes = new Map();
    const structural = [];
    const structuralSeen = new Set();
    const addStructural = ((edge) => {
        const key = `${edge.domain}|${edge.name}|${edge.range}`;
        if (structuralSeen.has(key)) return;
        structuralSeen.add(key);
        structural.push(edge);
    });

    canonical.forEach((node) => {
        if (node.kind !== 'class' || isSlot(node) || isDatatype(node)) return;
        const roles = ROLES.filter((role) => has(node, role));
        if (roles.length > 1) {
            problems.push({
                code: 'multipleRoles', level: 'error', termId: node.term.id, roles,
            });
        }
        const entry = {
            id: node.term.id,
            label: node.term.label,
            // What the vocabulary says this class is. Carried so a document naming a class can say
            // what it means without a second read of the store.
            definition: node.term.definition ?? null,
            name: className(node.term.label),
            role: roleOf(node),
            // Asked here so a client never restates which roles an edge may join.
            joinable: EDGE_ROLES.includes(roleOf(node)),
            tags: node.tags,
            supers: [],
            ancestors: [],
            placements: node.placements.length,
            jsonTerm: null,
            jsonType: null,
        };
        const supers = new Set();

        node.placements.forEach((at) => {
            const { parent } = at;
            if (!parent || parent.kind !== 'class') return;
            if (!isAttached(at)) {
                supers.add(parent.term.id);
                return;
            }
            if (has(parent, 'grouping')) {
                supers.add(parent.term.id);
            } else if (isSlot(parent)) {
                if (parent.parent) {
                    addStructural({
                        domain: parent.parent.term.id,
                        range: entry.id,
                        name: `has${className(parent.term.label)}`,
                        via: 'slot',
                        implied: false,
                    });
                }
            } else {
                addStructural({
                    domain: parent.term.id,
                    range: entry.id,
                    name: `has${entry.name}`,
                    via: 'attached',
                    implied: !!node.attachedImplied,
                });
            }
        });

        entry.supers = [...supers];
        if (entry.supers.length > 1) {
            problems.push({
                code: 'multipleSuperclasses', level: 'warning', termId: entry.id, supers: entry.supers,
            });
        }
        classes.set(entry.id, entry);
    });

    // Every superclass, nearest first, breadth-first so a nearer one is always listed before a farther.
    classes.forEach((entry) => {
        const seen = new Set([entry.id]);
        const queue = [...entry.supers];
        while (queue.length) {
            const id = queue.shift();
            if (seen.has(id)) continue;
            seen.add(id);
            entry.ancestors.push(id);
            queue.push(...(classes.get(id)?.supers ?? []));
        }
    });

    // The OMC-JSON projection: this class if it is marked, otherwise the nearest marked superclass.
    // Where a class has several superclasses that project differently, it projects to none.
    const jsonNames = settings.jsonNames ?? {};
    const projected = new Map();
    const projectionOf = ((id, trail = new Set()) => {
        if (projected.has(id)) return projected.get(id);
        const entry = classes.get(id);
        if (!entry || trail.has(id)) return null;
        trail.add(id);
        let found = null;
        if (entry.tags.includes(words.json)) {
            found = id;
        } else {
            const candidates = [...new Set(entry.supers.map((sup) => projectionOf(sup, trail)).filter(Boolean))];
            if (candidates.length === 1) [found] = candidates;
            if (candidates.length > 1) {
                problems.push({
                    code: 'ambiguousProjection', level: 'warning', termId: id, candidates,
                });
            }
        }
        projected.set(id, found);
        return found;
    });
    classes.forEach((entry) => {
        entry.jsonTerm = projectionOf(entry.id);
        if (entry.jsonTerm) {
            entry.jsonType = jsonNames[entry.jsonTerm] || className(classes.get(entry.jsonTerm).label);
        }
    });

    return { classes, structural, problems };
}

/**
 * Whether a class may be an end of an edge.
 *
 * @param {EntityClass} [entry]
 * @returns {boolean}
 */
export const isEdgeClass = ((entry) => !!entry && EDGE_ROLES.includes(entry.role));
