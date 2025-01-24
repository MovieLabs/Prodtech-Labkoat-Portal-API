/**
 Methods for interfacing with the Okta API
 */
const fetch = require('node-fetch');

const matchOmcIdentifiers = require('../../helpers/matchOmcIdentifiers');

const dummyData = {
    original: {
        schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
        entityType: 'Character',
        testField: 'Text',
        identifier: [
            {
                identifierScope: 'labkoat',
                identifierValue: 'chr/HNvHjXqJY9wv1IwjG-Hf1',
            },
        ],
        characterName: {
            fullName: 'Sven',
            firstGivenName: 'Sven',
            scriptName: 'SVEN',
        },
        profile: {
            physicalCharacteristics: {
                species: 'Human',
                height: '1m90cm',
                weight: '80kg',
                hairColor: 'Brown',
                hairLength: 'Short',
                eyeColor: 'Green',
            },
            background: [
                {
                    author: null,
                    title: 'likes',
                    text: 'Kiera, Space, Nature',
                },
                {
                    author: null,
                    title: 'dislikes',
                    text: 'War, Big space cities, Conflict',
                },
                {
                    author: null,
                    title: 'habits',
                    text: 'Sven is a bit of a sloth, happy to be far from prying eyes as he does his work at his pace. He is also a bit of a coward and has avoided the space navy at all cost. He is kind and patient and caring for the people in his life like Kiera.',
                },
                {
                    author: null,
                    title: 'traits',
                    text: 'Sven is a helpful unassuming character who likes to be alone. He connects with his handlers like Kiera but is happy to be engrossed in his work. He is generally scared of all things and not a hero.',
                },
            ],
            gender: {
                gender: 'male',
                genderPronoun: 'he/him',
            },
        },
        name: 'SVEN',
        arrayTest: [1, 'item1', 'item2', 'item3', 'item1', true, false, 2],
        description: 'Sven is an unassuming Satellite repair man. He spends his time alone in his ship traveling to remote planets on the outskirt of the galaxy maintaining a network of exploration satellites. He is more of a lover than a fighter.',
        Depiction: [
            {
                schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
                entityType: 'Depiction',
                identifier: [
                    {
                        identifierScope: 'labkoat',
                        identifierValue: 'dep-HNvGRn9JY9wv1IwjG8Gff',
                    },
                ],
            },
            {
                schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
                entityType: 'Depiction',
                identifier: [
                    {
                        identifierScope: 'labkoat',
                        identifierValue: 'dep-chdjecnc',
                    },
                ],
            },
        ],
        Context: [
            {
                identifier: [
                    {
                        identifierScope: 'labkoat',
                        identifierValue: 'cxt/377RXIREHUj5MPzsl-Sba',
                    },
                ],
            },
        ],
    },
    updated: {
        schemaVersion: 'https://movielabs.com/omc/json/schema/v2.0',
        entityType: 'Character',
        identifier: [
            {
                identifierScope: 'labkoat',
                identifierValue: 'chr/HNvHjXqJY9wv1IwjG-Hf1',
            },
        ],
        characterName: {
            fullName: 'Sven',
            firstGivenName: 'Sven',
            moniker: 'Svenski',
            scriptName: 'SVEN',
        },
        profile: {
            // physicalCharacteristics: {
            //     species: 'Human',
            //     height: '1m90cm',
            //     weight: '80kg',
            //     hairColor: 'Brown',
            //     hairLength: 'Short',
            //     eyeColor: 'Green',
            // },
            // background: [
            //     {
            //         author: null,
            //         title: 'likes',
            //         text: 'Kiera, Space, Nature',
            //     },
            //     {
            //         author: null,
            //         title: 'dislikes',
            //         text: 'War, Big space cities, Conflict',
            //     },
            //     {
            //         author: null,
            //         title: 'habits',
            //         text: 'Sven is a bit of a sloth, happy to be far from prying eyes as he does his work at his pace. He is also a bit of a coward and has avoided the space navy at all cost. He is kind and patient and caring for the people in his life like Kiera.',
            //     },
            //     {
            //         author: null,
            //         title: 'traits',
            //         text: 'Sven is a helpful unassuming character who likes to be alone. He connects with his handlers like Kiera but is happy to be engrossed in his work. He is generally scared of all things and not a hero.',
            //     },
            // ],
            gender: {
                gender: 'female',
                genderPronoun: 'he/him',
            },
        },
        name: 'SVEN',
        // arrayTest: ['item1', 'item2', 'item3', 'item4', true, 2],
        description: 'Sven is an unassuming Satellite repair man. He spends his time alone in his ship traveling to remote planets on the outskirt of the galaxy maintaining a network of exploration satellites. He is more of a lover than a fighter.',
        Depiction: [
            {
                schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
                entityType: 'Depiction',
                identifier: [
                    {
                        identifierScope: 'labkoat',
                        identifierValue: 'dep-HNvGRn9JY9wv1IwjG8Gff',
                    },
                ],
            },
        ],
        Context: [
            {
                identifier: [
                    {
                        identifierScope: 'labkoat',
                        identifierValue: 'cxt/377RXIREHUj5MPzsl-Sba',
                    },
                ],
            },
        ],
        testField: 'New Stuff',
    },
};

const yamduKey = '93ED8C16638C1F8234C921A8737174D788A1C454A5E3A2F48D97AEFC7E042B32';
const yamduProject = '119374'; // 119374 (Europa with Revisions)
const yamduRoute = 'allCharacters';
const yamduUrl = 'https://app.yamdu.com/thirdpartyapi/v1/omc/';

async function yamduFetch() {
    try {
        // Test the token against a test endpoint on the Labkoat API
        const url = `${yamduUrl}${yamduRoute}?key=${yamduKey}&project=${yamduProject}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                // Authorization: `Basic ${exchangeToken}`,
                // 'content-type': 'application/x-www-form-urlencoded',
            },
        };
        console.log(url);
        const res = await fetch(url, options);
        return res.json();
    } catch (err) {
        console.log(err);
        return null;
    }
}

const fMamProject = 'Yamdu';
const fMamUrl = 'http://localhost:4001/api/fmam/omc/query/';

async function fMamFetch(fMamRoute) {
    try {
        // Test the token against a test endpoint on the Labkoat API
        const url = `${fMamUrl}${fMamRoute}?project=${fMamProject}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        };
        console.log(url);
        const res = await fetch(url, options);
        if (res.status === 200) return res.json();
        console.log('Error:', res.statusText, res.status);
        return [];
    } catch (err) {
        console.log(err);
        return null;
    }
}

async function yamduEvent(req, res) {
    console.log('Path: approval/yamdu');

    const fMamData = fMamFetch('allCharacters');
    const yamduData = yamduFetch();
    const originalData = await fMamData;
    const updatedData = await yamduData;
    const matchedData = matchOmcIdentifiers(originalData, updatedData, 'com.yamdu.app');
    res.json(matchedData);
}

module.exports = yamduEvent;
