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
            description: 'No reflection in Sven\'s mask',
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
    input2: [
        {
            entityType: 'Task',
            identifier: [{
                identifierScope: 'labkoat',
                identifierValue: 'pub-2',
            }],
            name: 'Scene 1 Clip 1',
            description: 'No reflection in Sven\'s mask',
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
                                    identifierValue: 'ptc/3AE1ybCWJXJFxKhWhF0qd',
                                },
                            ],
                            name: 'Herman Malinalli',
                            description: 'Does a bit of this and a lot of that',
                            structuralCharacteristics: {
                                structuralType: 'person',
                                Person: {
                                    entityType: 'Person',
                                    identifier: [
                                        {
                                            identifierScope: 'labkoat',
                                            identifierValue: 'ptsc/iX7B9lnq14SUfTe_swwAy',
                                        },
                                        {
                                            identifierScope: 'okta',
                                            identifierValue: '00u3bk42mac7miomA696',
                                        },
                                    ],
                                    name: 'Herman Malinalli',
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
                                                identifierValue: 'rol/7EdFxI0xaHHruB97KA9Ni',
                                            },
                                        ],
                                        roleType: 'director',
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
            description: 'No reflection in Sven\'s mask',
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
            description: 'No reflection in Sven\'s mask',
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
    input3: [
        {
            entityType: 'Task',
            identifier: [{
                identifierScope: 'labkoat',
                identifierValue: 'pub-3',
            }],
            name: 'Scene 2 Clip 1',
            description: 'Do a description here',
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
                                    identifierValue: 'asset/Js89IRCQjW-N975X-UrNl',
                                },
                            ],
                            name: 'JRUN_SINGLE_4_1_Tuesday_56ccebe2-201c-11ee-8f6d-eec82ca92fed.otio',
                            AssetSC: {
                                entityType: 'AssetSC',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'assetsc/BI3djCCyHOQG5PPsqR1er',
                                    },
                                ],
                                structuralType: 'digital.structuredDocument',
                                structuralProperties: {
                                    assetGroup: {
                                        isOrdered: false,
                                    },
                                    linkset: {
                                        recordType: 'item',
                                        mediaType: 'application/json',
                                    },
                                    fileDetails: {
                                        fileExtension: 'otio',
                                        fileName: 'JRUN_SINGLE_4_1_Tuesday_56ccebe2-201c-11ee-8f6d-eec82ca92fed.otio',
                                        filePath: '',
                                    },
                                },
                            },
                            AssetFC: {
                                functionalType: 'sequenceChronology',
                            },
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/SSoy-UpO9goQ6vK8s3et6',
                                },
                            ],
                            name: 'JRUN_0010_anim_v004_4fc51364-e904-11ed-aeac-16351306dd60_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/w6pL3ERhshpENkpktmah4',
                                    },
                                ],
                                structuralProperties: {
                                    linkset: {
                                        recordType: 'item',
                                        mediaType: 'video/h264',
                                    },
                                    fileDetails: {
                                        fileExtension: 'mp4',
                                        fileName: 'JRUN_0010_anim_v004_4fc51364-e904-11ed-aeac-16351306dd60_proxy.mp4',
                                        filePath: 'CG/anim/JRUN',
                                    },
                                },
                                structuralType: 'digital.movingImage',
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                            },
                            Context: {
                                entityType: 'Context',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'cxt/J2KLAM7obk0WUWazYnp7U',
                                    },
                                ],
                            },
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/piGCaslzMwPMJkZ-BEjUS',
                                },
                            ],
                            name: 'JRUN_0020_anim_v002_51534156-e904-11ed-a781-46ee464269e2_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/OFuF5k72muok0vHRuK_i2',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                                functionalProperties: null,
                            },
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/Nah7P8Zseo5j7PRD9dF8Q',
                                },
                            ],
                            name: 'JRUN_0030_anim_v003_52af9aea-e904-11ed-b907-d2dd591e3244_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/UsFQrOPOCNhP0J9B0YJyq',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                                functionalProperties: null,
                            },
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/8pl08poCdJ8nEn0oa4qhn',
                                },
                            ],
                            name: 'JRUN_0040_anim_v003_542356f0-e904-11ed-aa14-a26fa50536f0_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/01PInCR_i1x4sKTj4_E0A',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                                functionalProperties: null,
                            },
                        },
                        {
                            entityType: 'Asset',
                            identifier: [
                                {
                                    identifierScope: 'labkoat',
                                    identifierValue: 'ast/M0KyrTS2NkbbMHJsOno8Z',
                                },
                            ],
                            name: 'JRUN_0050_anim_v002_552e1e4a-e904-11ed-b004-ee25e889fafa_proxy.mp4',
                            description: ' ',
                            AssetSC: {
                                structuralType: 'digital.movingImage',
                                identifier: [
                                    {
                                        identifierScope: 'labkoat',
                                        identifierValue: 'astsc/TvRYE3Tvui7NDCt8Sd_sf',
                                    },
                                ],
                                structuralProperties: {
                                    assetGroup: null,
                                },
                            },
                            AssetFC: {
                                functionalType: 'proxy',
                                functionalProperties: null,
                            },
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
};

module.exports = omcTaskInput;
