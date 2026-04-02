/**
 * This module is used to replace the Yamdu Depictor identifiers with the FX-DMZ identifiers
 */

const depictionMap = {
    "com.yamdu.app.role.824366": { identifierScope: "FX-DMZ", identifierValue: "916a89eb-db5b-4128-8bc1-e17c9ab46144" },
    // "com.yamdu.app.role.824367": { identifierScope: "FX-DMZ", identifierValue: "Spaceship" },
    "com.yamdu.app.role.824369": { identifierScope: "FX-DMZ", identifierValue: "3a493d0f-9044-4b99-934a-f44fae4e5e0a" },
    "com.yamdu.app.role.824372": { identifierScope: "FX-DMZ", identifierValue: "35d05ef0-a58a-460e-bbd0-aa2a49f11906" },
    // "com.yamdu.app.role.824373": { identifierScope: "FX-DMZ", identifierValue: "Ocean" },
    "com.yamdu.app.role.824374": { identifierScope: "FX-DMZ", identifierValue: "b36c6e37-60fb-4b74-a1bb-328f1312a951" },
    "com.yamdu.app.role.824375": { identifierScope: "FX-DMZ", identifierValue: "6f79c7a2-c41c-4997-a562-3909b53de2ee" },
}

// Replace the Yamdu Depictor identifiers with the FX-DMZ identifiers
export function depiction(yamduOmc) {
    yamduOmc.Depiction.forEach((ent) => {
        const { Depicts } = ent;
        const characterIdValue = Depicts.identifier[0].identifierValue;
        const depictorId = depictionMap[characterIdValue] || null;
        ent.Depictor = depictorId ? { identifier: [depictorId] } : null;
    })
}
