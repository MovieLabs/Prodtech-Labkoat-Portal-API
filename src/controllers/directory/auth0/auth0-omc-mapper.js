const jsonata = require('jsonata');

async function omcToAuth0User(input) {
    const expression = jsonata(
        `
    $.(
        $person := $.structuralCharacteristics.Person;
        $role := $.functionalCharacteristics.Role;
        $oktaId := $filter($person.identifier, function($scp) {$scp.identifierScope = "okta"}).$map($, function($id) {$id.identifierValue});
        $oktaId != '' ?
        $role.{
        "user": 'user:' & $oktaId,
        "relation": 'hasRole',
        "object": 'role:' & $.roleType
        }
        : ()
    )
    `,
    );
    return expression.evaluate(input);
}

async function omcToAuth0Organization(input) {
    const expression = jsonata(
        `
    $.(
        $person := $.structuralCharacteristics.Person;
        $role := $.functionalCharacteristics.Role;
        $oktaId := $filter($person.identifier, function($scp) {$scp.identifierScope = "okta"}).$map($, function($id) {$id.identifierValue});
        (
            $oktaId != '' ?
            $role.{
            "user": 'user:' & $oktaId,
            "relation": 'member',
            "object": 'organization:labkoat.media'
            }
        )
    )
    `,
    );
    return expression.evaluate(input);
}

/**
 * Return on the members of the Labkoat organization
 * @param participants
 * @return {Promise<void>}
 */
function labkoatMembers(participants) {
    const labkoatId = ((p) => (
        p.identifier.filter((i) => i.identifierScope === 'labkoat')
            .map((i) => i.identifierValue)
    )[0]);

    const orgs = participants.filter((p) => p.structuralCharacteristics.structuralType === 'organization');
    const labkoatOrg = orgs.filter((o) => (
        o.structuralCharacteristics.Organization.organizationName.altName === 'labkoat'
    ))[0];

    const labkoatMemberId = labkoatOrg.Participant.flatMap((p) => (
        p.identifier.filter((i) => i.identifierScope === 'labkoat')
            .map((i) => i.identifierValue)
    ));
    console.log(labkoatMemberId);
    return participants.filter((p) => (labkoatMemberId.includes(labkoatId(p))));
}

module.exports = {
    omcToAuth0User,
    omcToAuth0Organization,
    labkoatMembers,
};
