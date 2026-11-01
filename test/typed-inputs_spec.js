'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helper = require('node-red-node-test-helper');
const { util } = require('@node-red/util');
const templateNode = require('../src/_template_.js');

helper.init(require.resolve('node-red'));

// Phase 2.9: the typed fields of the template node. T1 pins what the editor offers, T2 checks
// that the runtime allows exactly those types, T3 evaluates every offered type, T4 rejects any
// other type before anything is evaluated, and T5 pins the defaults of flows saved without the
// fields, including the legacy exampleIn/exampleOut ones.

const SOURCE = ['msg', 'flow', 'global', 'str', 'num', 'bool', 'json', 'jsonata', 'env'];
const TARGET = ['msg', 'flow', 'global'];

// What the editor offers: the types in order, the selected default type, and the saved defaults
// of the value and of its type field.
const FIELDS = {
    source: { types: SOURCE, default: 'msg', value: 'payload', type: 'msg' },
    target: { types: TARGET, default: 'msg', value: 'payload', type: 'msg' },
};

// Runs the editor's registration script and its oneditprepare against a recording jQuery stub,
// and returns the registered definition and every typedInput it creates, by field.
function loadEditor() {
    const html = fs.readFileSync(path.join(__dirname, '../src/_template_.html'), 'utf8');
    const registered = new Map();
    const inputs = {};
    const element = (selector) =>
        new Proxy(function () {}, {
            get(target, prop) {
                if (prop === 'selector') return selector;
                if (prop === 'typedInput') {
                    return (options) => {
                        inputs[selector.replace('#node-input-', '')] = {
                            // Copied into this realm: the editor script runs in its own.
                            types: Array.from(options.types),
                            default: options.default,
                            typeField: options.typeField && options.typeField.selector,
                        };
                        return element(selector);
                    };
                }
                if (prop === 'val') return () => '';
                if (prop === 'prop' || prop === 'is') return () => false;
                return () => element(selector);
            },
            apply: () => element(selector),
        });
    const anything = () =>
        new Proxy(function () {}, { get: () => anything(), apply: () => anything() });
    const RED = {
        nodes: { registerType: (type, definition) => registered.set(type, definition) },
        validators: anything(),
        _: (key) => key,
    };
    for (const [, source] of html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g))
        vm.runInNewContext(source, { RED, $: (selector) => element(String(selector)) });
    const definition = registered.get('_template_');
    const self = Object.fromEntries(
        Object.entries(definition.defaults).map(([key, spec]) => [key, spec.value]),
    );
    definition.oneditprepare.call(self);
    return { definition, inputs };
}

// Node-RED's evaluations of typed properties, counted during a test.
let evaluations = null;

function run(node, msg) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 1500);
        helper.getNode('out').once('input', (out) => {
            clearTimeout(timer);
            resolve({ msg: out });
        });
        node.once('call:error', (call) => {
            clearTimeout(timer);
            resolve({ err: call.args[0] });
        });
        node.receive(msg);
    });
}

describe('typed inputs (Phase 2.9)', function () {
    this.timeout(10000);
    let realEvaluate;

    before(function () {
        realEvaluate = util.evaluateNodeProperty;
        util.evaluateNodeProperty = function (value, type, ...rest) {
            if (evaluations) evaluations.push(type);
            return realEvaluate.call(this, value, type, ...rest);
        };
    });

    after(function () {
        util.evaluateNodeProperty = realEvaluate;
    });

    describe('T1 editor pins and T2 runtime parity', function () {
        const { definition, inputs } = loadEditor();

        it('creates exactly the expected typed inputs', function () {
            assert.deepEqual(Object.keys(inputs).sort(), Object.keys(FIELDS).sort());
        });

        for (const [field, expected] of Object.entries(FIELDS)) {
            it(`${field}: offered types, default type, type field and saved defaults`, function () {
                assert.deepEqual(inputs[field].types, expected.types);
                assert.equal(inputs[field].default, expected.default);
                assert.equal(inputs[field].typeField, `#node-input-${field}Type`);
                assert.equal(definition.defaults[field].value, expected.value);
                assert.equal(definition.defaults[`${field}Type`].value, expected.type);
            });

            it(`${field}: the runtime allows exactly the offered types`, function () {
                assert.deepEqual([...templateNode.TYPES[field]].sort(), [...expected.types].sort());
            });
        }
    });

    describe('runtime', function () {
        beforeEach(function (done) {
            evaluations = [];
            helper.startServer(done);
        });

        afterEach(function (done) {
            delete process.env.TYPED_29_VALUE;
            helper.unload().then(() =>
                helper.stopServer(() => {
                    evaluations = null;
                    done();
                }),
            );
        });

        async function load(node, contextValue) {
            await helper.load(templateNode, [
                { id: 'f1', type: 'tab' },
                { id: 'n1', z: 'f1', type: '_template_', wires: [['out']], ...node },
                { id: 'out', z: 'f1', type: 'helper' },
            ]);
            const n1 = helper.getNode('n1');
            n1.context().flow.set('p', contextValue);
            n1.context().global.set('p', contextValue);
            evaluations.length = 0;
            return n1;
        }

        // For each offered source type: the configured value, the message, and what the node
        // writes, given msg.p, flow and global p, and the environment variable.
        const sourceCases = {
            msg: ['p', { p: 'hello' }, 'Input : "hello"'],
            flow: ['p', {}, 'Input : "hello"'],
            global: ['p', {}, 'Input : "hello"'],
            str: ['hello', {}, 'Input : "hello"'],
            num: ['5', {}, 'Input : 5'],
            bool: ['true', {}, 'Input : true'],
            json: ['{"a":1}', {}, { a: 1 }],
            jsonata: ['p', { p: 'hello' }, 'Input : "hello"'],
            env: ['TYPED_29_VALUE', {}, 'Input : "hello"'],
        };

        describe('T3 every offered type works', function () {
            it('every offered source type has a case', function () {
                assert.deepEqual(Object.keys(sourceCases).sort(), [...SOURCE].sort());
            });

            for (const [type, [source, msg, expected]] of Object.entries(sourceCases)) {
                it(`source of type ${type} is transformed into the target`, async function () {
                    process.env.TYPED_29_VALUE = 'hello';
                    const n1 = await load({ source, sourceType: type, target: 'out' }, 'hello');
                    const result = await run(n1, msg);
                    if (typeof expected === 'string') assert.equal(result.msg.out, expected);
                    else {
                        assert.equal(result.msg.out.a, expected.a);
                        assert.equal(typeof result.msg.out.transformedAt, 'string');
                    }
                    // The counter sees the node's own evaluation.
                    assert.ok(evaluations.includes(type), `evaluations: ${evaluations}`);
                });
            }

            for (const type of TARGET) {
                it(`target of type ${type} receives the result`, async function () {
                    const n1 = await load({
                        source: 'payload',
                        sourceType: 'msg',
                        target: 'out',
                        targetType: type,
                    });
                    const result = await run(n1, { payload: 'hello' });
                    const written = type === 'msg' ? result.msg.out : n1.context()[type].get('out');
                    assert.equal(written, 'Input : "hello"');
                });
            }
        });

        describe('T4 any other type fails before anything is evaluated', function () {
            for (const type of ['bin', 'foo']) {
                it(`source of type ${type}`, async function () {
                    const n1 = await load({ source: 'payload', sourceType: type });
                    const result = await run(n1, { payload: 'hello' });
                    assert.equal(result.err.code, 'INVALID_CONFIGURATION');
                    assert.equal(result.err.message, `Source type '${type}' is not supported`);
                    assert.deepEqual(evaluations, []);
                });
            }

            for (const type of ['str', 'foo']) {
                it(`target of type ${type} fails with the setter's message`, async function () {
                    const n1 = await load({
                        source: 'payload',
                        sourceType: 'msg',
                        targetType: type,
                    });
                    const result = await run(n1, { payload: 'hello' });
                    assert.equal(result.err.code, undefined);
                    assert.equal(result.err.message, `Unsupported target property type: ${type}`);
                    assert.deepEqual(evaluations, []);
                });
            }
        });

        describe('T5 flows saved without the fields', function () {
            it('reads msg.payload and writes msg.payload', async function () {
                const n1 = await load({});
                const result = await run(n1, { payload: 'legacy' });
                assert.equal(result.msg.payload, 'Input : "legacy"');
            });

            it('the legacy exampleIn/exampleOut fields still apply', async function () {
                const n1 = await load({ exampleIn: 'p', exampleInType: 'msg', exampleOut: 'q' });
                const result = await run(n1, { p: 'old' });
                assert.equal(result.msg.q, 'Input : "old"');
            });
        });
    });
});
