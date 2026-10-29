'use strict';

module.exports = function (RED) {
    const { extendNode } = require('@faigle/node-red-runtime-utils')(RED);

    function createError(message, code, cause) {
        const err = new Error(message);
        if (code) err.code = code;
        if (cause) err.cause = cause;
        return err;
    }

    function ExampleTemplateNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        extendNode(node);

        node.name = config.name;
        node.enableLogging = config.enableLogging === true;

        // Support both modern (source/target) and legacy (exampleIn/exampleOut) configuration
        node.source = config.source || config.exampleIn || 'payload';
        node.sourceType = config.sourceType || config.exampleInType || 'msg';
        node.target = config.target || config.exampleOut || 'payload';
        node.targetType = config.targetType || config.exampleOutType || 'msg';

        node.on('input', async function (msg, send, done) {
            send =
                send ||
                function () {
                    node.send.apply(node, arguments);
                };

            try {
                node.status.processing('processing');

                if (!node.source) {
                    throw createError('Source property configuration is missing', 'CONFIG_MISSING');
                }

                if (node.enableLogging) {
                    node.log(`Processing input from [${node.sourceType}] ${node.source}`);
                }

                // 1. Resolve typed input property via runtime-utils getValidatedProperty
                const input = await node.getValidatedProperty(
                    node.source,
                    node.sourceType,
                    msg,
                    'Source property',
                );

                // 2. Business logic (Boilerplate example: wrap/format the value)
                const output =
                    typeof input === 'object' && input !== null
                        ? { ...input, transformedAt: new Date().toISOString() }
                        : 'Input : ' + JSON.stringify(input);

                // 3. Write result to configured output target via runtime-utils
                await node.setTypedProperty(node.target, node.targetType, msg, output);

                node.status.succeeded('done', {
                    next: () => node.status.waiting('waiting for input'),
                });

                send(msg);
                if (done) done();
            } catch (err) {
                node.status.failed(err.message || 'Processing error');
                if (done) done(err);
                else node.error(err, msg);
            }
        });

        node.on('close', function (removed, done) {
            node.status.clear();
            if (done) done();
        });
    }

    RED.nodes.registerType('_template_', ExampleTemplateNode);
};
