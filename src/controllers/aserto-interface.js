const { ds } = require('@aserto/aserto-node');

async function checkIs() {
    const params = {
        authorizerServiceUrl: process.env.ASERTO_AUTHORIZER_SERVICE_URL,
        policyId: process.env.ASERTO_POLICY_ID,
        policyRoot: process.env.ASERTO_POLICY_ROOT,
        authorizerApiKey: process.env.ASERTO_AUTHORIZER_API_KEY,
        tenantId: process.env.ASERTO_TENANT_ID,
        instanceName: process.env.ASERTO_POLICY_INSTANCE_NAME,
        instanceLabel: process.env.ASERTO_POLICY_INSTANCE_LABEL,
        object: { key: 'euang@acmecorp.com' },
        subject: { key: 'euang@acmecorp.com' },
    };
    try {
        const allowed = await ds(params);
        if (allowed) {
            console.log('Result was true');
        } else {
            console.log('Result was false');
        }
    } catch (err) {
        console.log(err);
    }
}

checkIs();
