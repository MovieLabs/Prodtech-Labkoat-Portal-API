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

        const br = dict.getRelated(omc.id, 'broader');
        concept['skos:broader'] = [];
        br.forEach((id) => {
            concept['skos:broader'].push({
                '@id': id,
            });
        });

        const nr = dict.getRelated(omc.id, 'narrower');
        concept['skos:narrower'] = [];
        nr.forEach((id) => {
            concept['skos:narrower'].push({
                '@id': id,
            });
        });

        const al = dict.getRelated(omc.id, 'altLabel');
        concept['skos:altLabel'] = [];
        concept['skosxl:altLabel'] = [];
        al.forEach((id) => {
            const label = dict.getNode(id);
            concept['skos:altLabel'].push({
                '@value': label.value,
                '@language': label.language,
            });
            concept['skosxl:altLabel'].push({
                '@id': id,
            });
        });

        const is = dict.getRelated(omc.id, 'inScheme');
        concept['skos:inScheme'] = [];
        is.forEach((id) => {
            concept['skos:inScheme'].push({
                '@id': id,
            });
        });

        const tc = dict.getRelated(omc.id, 'topConceptOf');
        concept['skos:topConceptOf'] = [];
        tc.forEach((id) => {
            concept['skos:topConceptOf'].push({
                '@id': id,
            });
        });

        concept['vmc:hasAcronym'] = [];

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
            const pl = dict.getRelated(omc.id, 'prefLabel');
            scheme['skosxl:prefLabel'] = [
                {
                    '@id': pl[0],
                },
            ];
        }
        if (omc.definition) {
            scheme['skos:definition'] = [
                {
                    '@value': omc.definition,
                    '@language': omc.language,
                },
            ];
        }

        const tc = dict.getRelated(omc.id, 'hasTopConcept');
        scheme['skos:hasTopConcept'] = [];
        tc.forEach((id) => {
            scheme['skos:hasTopConcept'].push({
                '@id': id,
            });
        });
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
;
    console.log('Created JSON-LD file');
    return header;
}

export default createJsonLd;
