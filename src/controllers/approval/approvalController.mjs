/**
 Methods for interfacing with the Okta API
 */

const dummyData = [
    {
        user: '00u55sz1a81S9Bavw697',
        name: 'Scene 1, clip 1',
        description: 'Blah Blah',
        status: 'Pending',
        action: 'Review',
        omc: [{
            identifierScope: 'labkoat',
            identifierValue: 'astsc/12345',
        }],
    },
    {
        user: '00u3bk41ua3xnzqGT696',
        name: 'Scene 2, clip 1',
        description: 'Blah Blah',
        status: 'Approved',
        action: 'Review',
        omc: [{
            identifierScope: 'labkoat',
            identifierValue: 'astsc/67890',
        }],
    },
];

const eventForUser = ((user, events) => events.filter((e) => (e.user === user)))

async function approvalEvent(req, res) {
    console.log('Path: approval/event');
    const { auth } = req;
    const user = `${auth.uid}`; // Use the email address as the primary identifier, held in the sub claim
    console.log(user);
    const responseData = eventForUser(user, dummyData); // Filter the events for this user
    res.json(responseData);
}

export default approvalEvent;
