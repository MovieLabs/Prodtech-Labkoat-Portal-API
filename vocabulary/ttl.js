/**
 * Create JSON-LD for the OMC-SKOS dictionary
 * @param vocab
 */

const status = ['published'];

function createTtl(dict) {
    try {
        const header = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
        @prefix skosxl: <http://www.w3.org/2008/05/skos-xl#> .
        @prefix vmc: <https://mc.movielabs.com/vmc#> .\n\n`;

        const omcNamespace = '<https://mc.movielabs.com/vmc> a owl:Ontology .\n\n';

        const relation = ((omcId, predicate) => {
            const term = dict.getRelated(omcId, predicate); // Find the related terms
            return term.filter((id) => status.includes((dict.getNode(id)).status));
        });

        const createConcept = ((omc) => {
            let concept = `${omc.id} a skos:Concept ;\n`;

            if (omc.prefLabel) {
                concept += `\tskos:prefLabel "${omc.prefLabel}"@${omc.language} ;\n`;
            }

            if (omc.definition) {
                concept += `\tskos:definition "${omc.definition}"@en ;\n`;
            }

            if (omc.example) {
                concept += `\tskos:example "${omc.example}"@en ;\n`;
            }

            if (omc.editorialNote) {
                concept += `\tskos:editorialNote "${omc.editorialNote}"@en ;\n`;
            }

            const br = relation(omc.id, 'broader');
            br.forEach((id) => {
                concept += `\tskos:broader ${id} ;\n`;
            });

            const nr = relation(omc.id, 'narrower');
            nr.forEach((id) => {
                concept += `\tskos:narrower ${id} ;\n`;
            });

            const al = relation(omc.id, 'altLabel');
            al.forEach((id) => {
                concept += `\tskos:altLabel ${id} ;\n`;
            });

            const is = relation(omc.id, 'inScheme');
            is.forEach((id) => {
                concept += `\tskos:inScheme ${id} ;\n`;
            });

            const tc = relation(omc.id, 'topConceptOf');
            tc.forEach((id) => {
                concept += `\tskos:topConceptOf ${id} ;\n`;
            });

            const pl = dict.getRelated(omc.id, 'prefLabel');
            concept += `\tskosxl:prefLabel ${pl[0]} .\n`;

            return concept;
        });

        const createConceptScheme = ((omc) => {
            let scheme = `${omc.id} a skos:ConceptScheme ;\n`;

            if (omc.definition) {
                scheme += `\tskos:definition "${omc.definition}"@en ;\n`;
            }

            const tc = relation(omc.id, 'hasTopConcept');
            tc.forEach((id) => {
                scheme += `\tskos:hasTopConcept ${id} ;\n`;
            });

            if (omc.prefLabel) {
                scheme += `\tskos:prefLabel "${omc.prefLabel}"@en .\n`;
            }

            return scheme;
        });

        const createLabel = ((omc) => {
            let label = `${omc.id} a skosxl:Label ;\n`;
            label += `\tskosxl:literalForm "${omc.value}"@${omc.language} .\n`;
            return `${label}`;
        });

        const labelId = dict.getType('skosxl:Label');
        const label = labelId.map((id) => createLabel(dict.getNode(id)));

        const conceptId = dict.getType('skos:Concept');

        const publishedConcept = (conceptId.map((id) => dict.getNode(id)))
            .filter((n) => n.status === 'published');
        const concept = publishedConcept.map((n) => createConcept(n));

        const schemeId = dict.getType('skos:ConceptScheme');
        const publishedScheme = schemeId.map((id) => dict.getNode(id));
        const scheme = publishedScheme.map((n) => createConceptScheme(n));

        const allLabels = label.join('\n');
        const allConcepts = concept.join('\n');
        const allSchemes = scheme.join('\n');

        const ttl = header + omcNamespace + allSchemes + allConcepts + allLabels;

        // console.log(ttl);
        console.log('Created TTL file');
        return ttl;
    } catch (err) {
        console.log(err);
    }
}

module.exports = createTtl;
