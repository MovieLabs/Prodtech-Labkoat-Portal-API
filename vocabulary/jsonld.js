/**
 * Create JSON-LD for the OMC-SKOS dictionary
 * @param dict
 */

const status = ['published'];

function createJsonLd(dict) {
    const header = {
        '@context': {
            vmc: 'https://mc.movielabs.com/vmc#',
            skos: 'http://www.w3.org/2004/02/skos/core#',
            skosxl: 'http://www.w3.org/2008/05/skos-xl#',
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            owl: 'http://www.w3.org/2002/07/owl#',
        },
        '@graph': [],
    };

    const omcNamespace = {
        '@id': 'https://mc.movielabs.com/vmc',
        '@type': [
            'owl:Ontology',
        ],
    };

    const relation = ((omcId, predicate) => {
        const term = dict.getRelated(omcId, predicate); // Find the related terms
        const schemeId = term.filter((id) => status.includes((dict.getNode(id)).status));
        return schemeId.map((sId) => ({
            '@id': sId,
        }));
    });

    const createConcept = ((omc) => {
        const concept = {
            '@id': omc.id,
            '@type': [
                'skos:Concept',
            ],
        };
        if (omc.prefLabel) {
            concept['skos:prefLabel'] = [
                {
                    '@value': omc.prefLabel,
                    '@language': omc.language,
                },
            ];
            concept['skosxl:prefLabel'] = relation(omc.id, 'prefLabel');
        }

        if (omc.definition) {
            concept['skos:definition'] = [
                {
                    '@value': omc.definition,
                    '@language': omc.language,
                },
            ];
        }

        if (omc.example) {
            concept['skos:example'] = [
                {
                    '@value': omc.example,
                    '@language': 'en',
                },
            ];
        }

        if (omc.editorialNote) {
            concept['skos:editorialNote'] = [
                {
                    '@value': omc.editorialNote,
                    '@language': 'en',
                },
            ];
        }

        const br = relation(omc.id, 'broader');
        if (br.length) concept['skos:broader'] = br;

        const nr = relation(omc.id, 'narrower');
        if (nr.length) concept['skos:narrower'] = nr;

        const al = relation(omc.id, 'altLabel');
        if (al.length) concept['skos:altLabel'] = al;

        const is = relation(omc.id, 'inScheme');
        if (is.length) concept['skos:inScheme'] = is;

        const tc = relation(omc.id, 'topConceptOf');
        if (tc.length) concept['skos:topConceptOf'] = tc;

        return concept;
    });

    const createConceptScheme = ((omc) => {
        const scheme = {
            '@id': omc.id,
            '@type': [
                'skos:ConceptScheme',
            ],
        };
        if (omc.prefLabel) {
            scheme['skos:prefLabel'] = [
                {
                    '@value': omc.prefLabel,
                    '@language': omc.language,
                },
            ];
            scheme['skosxl:prefLabel'] = relation(omc.id, 'prefLabel');
        }
        if (omc.definition) {
            scheme['skos:definition'] = [
                {
                    '@value': omc.definition,
                    '@language': omc.language,
                },
            ];
        }
        const tc = relation(omc.id, 'hasTopConcept');
        if (tc.length) scheme['skos:hasTopConcept'] = tc;
        return scheme;
    });

    const createLabel = ((omc) => ({
        '@id': omc.id,
        '@type': ['skosxl:Label'],
        'skosxl:literalForm': [
            {
                '@value': omc.value,
                '@language': omc.language,
            },
        ],
    }));

    const labelId = dict.getType('skosxl:Label');
    const label = labelId.map((id) => createLabel(dict.getNode(id)));
    const conceptId = dict.getType('skos:Concept');
    const publishedConcept = (conceptId.map((id) => dict.getNode(id)))
        .filter((n) => n.status === 'published');
    const concept = publishedConcept.map((n) => createConcept(n));
    const schemeId = dict.getType('skos:ConceptScheme');
    const publishedScheme = schemeId.map((id) => dict.getNode(id));
    const scheme = publishedScheme.map((n) => createConceptScheme(n));

    header['@graph'] = [omcNamespace, ...scheme, ...concept, ...label];

    // console.log(header);
    return header;
}

module.exports = createJsonLd;
