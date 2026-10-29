'use strict';

const assert = require('node:assert/strict');
const helper = require('node-red-node-test-helper');
const templateNode = require('../src/_template_.js');

helper.init(require.resolve('node-red'));

describe('example-template Node', function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should load correctly with the given name', function (done) {
        const flow = [{ id: 'n1', type: '_template_', name: 'my template' }];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            assert.equal(n1.name, 'my template');
            done();
        });
    });

    it('should read from source and write to target using runtime-utils', function (done) {
        const flow = [
            {
                id: 'n1',
                type: '_template_',
                source: 'payload',
                sourceType: 'msg',
                target: 'result',
                targetType: 'msg',
                wires: [['n2']],
            },
            { id: 'n2', type: 'helper' },
        ];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            const n2 = helper.getNode('n2');

            n1.on('call:error', function (call) {
                done(call.firstArg);
            });

            n2.on('input', function (msg) {
                try {
                    assert.equal(msg.payload, 'hello world');
                    assert.equal(msg.result, 'Input : "hello world"');
                    done();
                } catch (err) {
                    done(err);
                }
            });

            n1.receive({ payload: 'hello world' });
        });
    });

    it('should maintain backward compatibility with legacy exampleIn and exampleOut properties', function (done) {
        const flow = [
            {
                id: 'n1',
                type: '_template_',
                exampleIn: 'payload',
                exampleInType: 'msg',
                exampleOut: 'formattedValue',
                exampleOutType: 'msg',
                wires: [['n2']],
            },
            { id: 'n2', type: 'helper' },
        ];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            const n2 = helper.getNode('n2');

            n1.on('call:error', function (call) {
                done(call.firstArg);
            });

            n2.on('input', function (msg) {
                try {
                    assert.equal(msg.payload, 'legacy test');
                    assert.equal(msg.formattedValue, 'Input : "legacy test"');
                    done();
                } catch (err) {
                    done(err);
                }
            });

            n1.receive({ payload: 'legacy test' });
        });
    });

    it('should handle object payloads and add transformation metadata', function (done) {
        const flow = [
            {
                id: 'n1',
                type: '_template_',
                source: 'payload',
                sourceType: 'msg',
                target: 'formattedValue',
                targetType: 'msg',
                wires: [['n2']],
            },
            { id: 'n2', type: 'helper' },
        ];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            const n2 = helper.getNode('n2');

            n1.on('call:error', function (call) {
                done(call.firstArg);
            });

            n2.on('input', function (msg) {
                try {
                    assert.equal(msg.formattedValue.key, 'value');
                    assert.ok(msg.formattedValue.transformedAt);
                    done();
                } catch (err) {
                    done(err);
                }
            });

            n1.receive({ payload: { key: 'value' } });
        });
    });

    it('should handle flow context output correctly', function (done) {
        const flow = [
            {
                id: 'n1',
                z: 'flow1',
                type: '_template_',
                source: 'payload',
                sourceType: 'msg',
                target: 'savedVal',
                targetType: 'flow',
                wires: [['n2']],
            },
            { id: 'n2', z: 'flow1', type: 'helper' },
        ];

        helper.load(templateNode, flow, function () {
            const n1 = helper.getNode('n1');
            const n2 = helper.getNode('n2');

            n1.on('call:error', function (call) {
                done(call.firstArg);
            });

            n2.on('input', function () {
                try {
                    const saved = n1.context().flow.get('savedVal');
                    assert.equal(saved, 'Input : "context-test"');
                    done();
                } catch (err) {
                    done(err);
                }
            });

            n1.receive({ payload: 'context-test' });
        });
    });
});
