/**
 * The initial JSON used to set up the tasks and task lists in the UI
 * At a later date, we might expect these to be sent to the backend by another process
 */

const omcTaskInput = {
    input1: [
        {
            entityType: 'Task',
            identifier: [{
                identifierScope: 'labkoat',
                identifierValue: 'pub-1',
            }],
            name: 'Scene 1 Clip 1',
            description: "No reflection in Sven's mask",
            functionalCharacteristics: {
                functionalType: 'publish',
                functionalProperties: {
                    action: {
                        button: 'Publish',
                    },
                    Asset: [
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/ROlTluTu4MnHBR-VX4PIF',
                                },
                            ],
                            name: 'HSM_project_7b71fc0c-e904-11ed-8916-d6ccebc81510_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/5wUxN5vhMLV43tWU1SAIK',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                            },
                            Asset: null,
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/Lk76CEHqfCs5q3o-73m2S',
                                },
                            ],
                            name: 'SATL_0230_anim_v006_7a4ae33e-e904-11ed-a72c-d2dd591e3244_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/9D9fQ0Q-fLuJgot0gbzUE',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                            },
                            Asset: null,
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/O9FA8CN8YD-h4IpjzqP7u',
                                },
                            ],
                            name: 'SATL_0220_anim_v005_78a2b548-e904-11ed-9904-2a7b0734cd6b_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/Nhh8d-4fJsTm8r0KxF-Ma',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                            },
                            Asset: null,
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/Gg7bhP51makLUcj3rv-5q',
                                },
                            ],
                            name: 'premiere_example_foo_57b8af10-e871-11ed-887e-7e5d05e19b8d.otio',
                            description: 'None',
                            AssetSC: {
                                structuralType: 'digital.structuredDocument',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/i8baZCWRp6ltMmjvvuUst',
                                    },
                                ],
                                structuralProperties: null,
                            },
                            AssetFC: {
                                functionalType: 'sequenceChronology',
                            },
                            Asset: null,
                        },
                    ],
                    Participant: [
                        {
                            entityType: 'Participant',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ptc/yt0hGNOOZu8OS769kAyWK',
                                },
                            ],
                            name: 'Daniel Lucas',
                            description: 'Does a bit of this and a lot of that',
                            structuralCharacteristics: {
                                structuralType: 'person',
                                Person: {
                                    entityType: 'Person',
                                    identifier: [
                                        {
                                            identifierScope: 'labkoat',
                                            identifierValue: 'ptsc/OoaPids5WraVqVdqhDhf9',
                                        },
                                        {
                                            identifierScope: 'okta',
                                            identifierValue: '00u3bk41ua3xnzqGT696',
                                        },
                                    ],
                                    name: 'Daniel Lucas',
                                },
                            },
                            functionalCharacteristics: {
                                functionalType: null,
                                Role: [
                                    {
                                        entityType: 'Role',
                                        identifier: [
                                            {
                                                identifierScope: 'labkoat',
                                                identifierValue: 'rol/9MLbKNfnaUVj7u3n1Z4E6',
                                            },
                                        ],
                                        roleType: 'admin',
                                    },
                                    {
                                        entityType: 'Role',
                                        identifier: [
                                            {
                                                identifierScope: 'labkoat',
                                                identifierValue: 'rol/WE7aIODtF4wnsXkT8CYjU',
                                            },
                                        ],
                                        roleType: 'producer',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        },
    ],
    '00u667lv8xYGbtcrv697': [
        {
            entityType: 'Task',
            identifier: [{
                identifierScope: 'labkoat',
                identifierValue: 'rev-1',
            }],
            name: 'Scene 1 Clip 1',
            description: "No reflection in Sven's mask",
            functionalCharacteristics: {
                functionalType: 'review',
                functionalProperties: {
                    action: {
                        button: 'Review',
                    },
                    Asset: [
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'ast/ROlTluTu4MnHBR-VX4PIF',
                            }],
                        },
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'ast/Lk76CEHqfCs5q3o-73m2S',
                            }],
                        },
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'ast/O9FA8CN8YD-h4IpjzqP7u',
                            }],
                        },
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'astsc/i8baZCWRp6ltMmjvvuUst',
                            }],
                        },
                    ],
                    Participant: [
                        {
                            entityType: 'Participant',
                        },
                    ],
                },
            },
        },
    ],
    '00u55sz1a81S9Bavw697': [
        {
            entityType: 'Task',
            identifier: [{
                identifierScope: 'labkoat',
                identifierValue: 'rev-1',
            }],
            name: 'Scene 1 Clip 1',
            description: "No reflection in Sven's mask",
            functionalCharacteristics: {
                functionalType: 'review',
                functionalProperties: {
                    action: {
                        button: 'Review',
                    },
                    Asset: [
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'ast/ROlTluTu4MnHBR-VX4PIF',
                            }],
                        },
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'ast/Lk76CEHqfCs5q3o-73m2S',
                            }],
                        },
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'ast/O9FA8CN8YD-h4IpjzqP7u',
                            }],
                        },
                        {
                            entityType: 'Asset',
                            identifier: [{
                                identifierScope: 'labkoat',
                                identifierValue: 'astsc/i8baZCWRp6ltMmjvvuUst',
                            }],
                        },
                    ],
                    Participant: [
                        {
                            entityType: 'Participant',
                        },
                    ],
                },
            },
        },
    ],
};

module.exports = omcTaskInput;
