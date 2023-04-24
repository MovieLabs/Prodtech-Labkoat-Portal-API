const jsonata = require('jsonata');

async function omcToOktaProfile(input) {
    const expression = jsonata(
        `
        $.{
            "labkoatId": ($filter(identifier, function($scp) {$scp.identifierScope = "labkoat"}).$map($, function($id) {$id.identifierValue})),
            "id": ($filter(identifier, function($scp) {$scp.identifierScope = "okta"}).$map($, function($id) {$id.identifierValue})),
            "profile": {
                "firstName": $.structuralCharacteristics.Person.personName.firstGivenName,
                "lastName": structuralCharacteristics.Person.personName.familyName,
                "login": $.structuralCharacteristics.Person.contact.email.business,
                "email": $.structuralCharacteristics.Person.contact.email.business,
                "mobilePhone": $.structuralCharacteristics.Person.contact.telephone.business
            }
        }
    `,
    );
    return expression.evaluate(input);
}

async function omcParticipantToPerson(input) {
    const expression = jsonata(
        `
    $.{
        "Person": $.structuralCharacteristics.Person
    }
    `,
    );
    return expression.evaluate(input);
}

module.exports = {
    omcToOktaProfile,
    omcParticipantToPerson,
};
