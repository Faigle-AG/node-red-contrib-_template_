module.exports = function (RED) {
    const { extendStatus, extendProperties } = require('@faigle/node-red-runtime-utils')(RED);

    function ExampleTemplateNode(config) {
        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.enableLogging = config.enableLogging;

        const node = this;

        extendStatus(node);
        extendProperties(node);

        node.on('input', function (msg, send, done) {
            send =
                send ||
                function () {
                    node.send.apply(node, arguments);
                };

            try {
                if (node.enableLogging) {
                    node.log('Received payload: ' + JSON.stringify(msg.payload));
                }

                node.status.processing('processing message');

                send(msg);

                if (done) done();
            } catch (err) {
                if (done) done(err);
                else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType('_template_', ExampleTemplateNode);
};
