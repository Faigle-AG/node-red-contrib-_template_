const helper = require('node-red-node-test-helper');
const templateNode = require('../src/_template_.js');

helper.init(require.resolve('node-red'));

describe('example-template Node', function () {
    afterEach(function () {
        return helper.unload();
    });

    it('should load correctly with the given name', function (done) {
        const flow = [{ id: 'n1', type: '_template_', name: 'my template' }];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            n1.should.have.property('name', 'my template');
            done();
        });
    });

    it('should pass the message payload through unmodified', function (done) {
        const flow = [
            { id: 'n1', type: '_template_', wires: [['n2']] },
            { id: 'n2', type: 'helper' },
        ];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            const n2 = helper.getNode('n2');

            n1.on('call:error', function (call) {
                done(call.firstArg);
            });

            n2.on('input', function (msg) {
                msg.should.have.property('payload', 'hello world');
                done();
            });

            n1.receive({ payload: 'hello world' });
        });
    });
});
