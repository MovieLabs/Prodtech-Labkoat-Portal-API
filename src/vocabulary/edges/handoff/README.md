# OMC edge properties for the ontology build

Two files, to be integrated into the build that already produces OMC's RDF and SHACL:

| File | What it is |
|---|---|
| `omc-edges.json` | The edge definitions, published whole. One document, several sections; this build reads `rdf`. |
| `omcEdgesToTurtle.mjs` | A standalone, dependency-free Node script that writes `omc-edges.ttl` and `omc-edge-shapes.ttl` from it. |

```bash
node omcEdgesToTurtle.mjs omc-edges.json --out-dir ontology/
```

Node 18 or newer. No install, no dependencies. Importing the file instead gives you
`owlTurtle(document)`, `shaclTurtle(document)` and `checkBundle(document)` if you would rather call it
than shell out.

## The document

One file carries every projection of the same relationships, because two files that have to agree
eventually will not, and a consumer reading one would have no way to tell:

```jsonc
{
  "generated": { "format": "omc-edges", "version": 1, "viewId": "view:entity-structure",
                 "edges": 124, "rows": 172, "verbs": 41, "properties": 105 },
  "namespace": { "prefix": "omc", "base": "https://movielabs.com/omc/rdf/schema/v3.0#" },
  "json": { "edgeDefinitions": { /* the OMC-JSON edge table, for omc-util */ } },
  "rdf":  { "verbs": [ /* … */ ], "properties": [ /* … */ ] }
}
```

**Read `rdf` and ignore the rest.** The `json` section is the OMC-JSON edge table: its domains and
ranges are OMC-JSON entityTypes, so every subclass has already been folded into the class it projects
to — `Portrayal` and `Depiction` both arrive as `Realization` — and the RDF names survive only as
opaque `const:omc:…` tokens. It cannot produce RDF, and nothing here tries to. A section added later
(the classes, say) will not disturb either reader.

---

## What these edges are

They are the relationships between OMC entity classes — `Asset usedBy Portrayal`, `Character
featuresIn NarrativeScene` — authored in the vocabulary's Edge Editor and published from there. They
are **not** in the ontology today, so this is additive: no existing file changes, and nothing here
redeclares a class.

Every class named in the JSON is named by its RDF local name, derived from its preferred label the
same way the ontology derives them (`Narrative Set Dressing` → `NarrativeSetDressing`). If a class in
here does not exist in the ontology, that is a real mismatch and worth reporting back rather than
papering over — see *Checking it fits*, below.

## If you are handed `omc-edge-definitions.json`

That is an older export holding the OMC-JSON edge table alone, and it cannot produce RDF for the
reason above. `omcEdgesToTurtle.mjs` refuses it by name rather than producing something plausible and
wrong. Ask for `omc-edges.json` instead.

## What it writes

### `omc-edges.ttl` — declarations

```turtle
omc:uses
    rdf:type owl:ObjectProperty ;
    rdfs:label "uses"@en ;
    owl:inverseOf omc:usedIn .

omc:usesAsset
    rdf:type owl:ObjectProperty ;
    rdfs:label "uses asset"@en ;
    rdfs:subPropertyOf omc:uses ;
    schema:domainIncludes omc:ProductionScene ;
    schema:rangeIncludes omc:Asset .
```

### `omc-edge-shapes.ttl` — where each may be used

```turtle
omc:usesAssetShape
    rdf:type sh:NodeShape ;
    sh:targetSubjectsOf omc:usesAsset ;
    rdfs:label "uses asset usage shape"@en ;
    sh:class omc:ProductionScene ;
    sh:property [ sh:path omc:usesAsset ; sh:class omc:Asset ] .
```

## The four conventions behind that output

These match the decisions the existing RDF build already follows. They are stated here so a reviewer
can check the output rather than infer the rules from it.

**1. No `rdfs:domain`, no `rdfs:range`.** Both are inference rules rather than restrictions: a
property used on an unexpected subject silently re-types that subject instead of failing. Each
property declares its intent with `schema:domainIncludes` / `schema:rangeIncludes`, which infer
nothing, and the SHACL shape does the enforcing. `sh:class` follows `rdfs:subClassOf` in the data
graph, so a subclass passes where its superclass is named.

**2. A verb property, with the specific ones beneath it.** `omc:featuresCharacter` is
`rdfs:subPropertyOf omc:features`. The specific name carries the class it points at, which is what
lets a shape say exactly where the property belongs; the verb is what a query uses to find everything
of a kind. This mirrors the `has<X>Name` ⊆ `hasEntityName` pattern already in the ontology.

**3. `owl:inverseOf` is stated once, between verbs.** The specific names are not one-to-one in
reverse — `featuresInNarrativeScene` answers `featuresCharacter` and `featuresEffect` alike — so
asserting an inverse between specific properties would have a reasoner conclude those two are the
same property. An asset `usedInProductionScene` a scene therefore entails, via the verbs, that the
scene `uses` the asset.

**4. An inverse expression where a verb cannot carry one.** A verb may belong to more than one pair:
`usedBy` against `realizedBy` for one class and `depictedBy` for another. Two `owl:inverseOf`
statements about `omc:usedBy` would make `realizedBy` and `depictedBy` equivalent, so those pairs
state the inverse on the specific property instead:

```turtle
omc:usedByComposition
    rdfs:subPropertyOf omc:usedBy ;
    rdfs:subPropertyOf [ owl:inverseOf omc:depictedBy ] ;
    rdfs:subPropertyOf [ owl:inverseOf omc:realizedBy ] .
```

Both entailments hold and nothing is asserted equivalent. **This is why a property may legitimately
appear with several `rdfs:subPropertyOf [ owl:inverseOf … ]` statements** — it is not a duplicate,
and it should not be collapsed into a single `owl:inverseOf`.

**A note on what is absent.** Some relationships exist only in OMC-JSON — a named property of an
entity, such as `Realization.RealizationOf`. Those publish no inverse here at all: their reverse
"verb" is a JSON field name, not a relationship RDF makes. The properties are still declared and
still carry shapes.

## Integrating

1. Put `omc-edges.ttl` and `omc-edge-shapes.ttl` beside the ontology's other Turtle, and add them to
   whatever list the build loads. They are ordinary Turtle with no import statements.
2. Keep the generation step, rather than committing the output alone: the JSON is regenerated from the
   vocabulary whenever the edges change, and the script is deterministic, so a diff of the Turtle is a
   readable record of what changed.
3. The namespace comes from the JSON (`namespace.prefix` / `namespace.base`). Confirm it matches the
   ontology's; if the ontology uses a different base for these terms, change it at the source rather
   than rewriting the output.

## Checking it fits

Worth doing once, on the first integration, and cheap to keep in the build:

- **Every class named exists.** Collect every `schema:domainIncludes` / `schema:rangeIncludes` /
  `sh:class` object and check each is declared as a class in the ontology. A missing one means the
  vocabulary and the ontology disagree about a class, which is worth reporting back — it is a finding,
  not something to fix in the output.
- **No property is declared twice.** These names should not already exist. A clash means the same
  relationship is being stated in two places, and which one wins is a decision, not a merge.
- **The Turtle parses, and the shapes load.** Any RDF parser; then a SHACL processor over a sample
  graph.
- **Nothing here asserts `owl:inverseOf` more than once about the same property.** That is the failure
  mode this design exists to avoid, and a one-line check catches any regression.

## Reporting back

The generating side keeps a check over the same data, so if something here looks wrong it is usually
visible there too. Useful things to send back: a class that does not exist in the ontology, a property
name that already does, and any place where the inverse structure reads as wrong for what the
relationship means.
