'use strict';

const assert = require('node:assert/strict');
const helper = require('node-red-node-test-helper');
const templateNode = require('../src/_template_.js');

helper.init(require.resolve('node-red'));

function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    return { promise, resolve, reject };
}

// Lets awaited continuations and the helper's nextTick call events run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// Replaces a node method (getValidatedProperty, setTypedProperty) with calls the test releases.
function holdCalls(node, method) {
    const held = [];
    node[method] = () => {
        const call = deferred();
        held.push(call);
        return call.promise;
    };
    return held;
}

// Records what the node reports from the moment of the call: completions (done/_complete),
// sends (messages reaching the wired helper node), statuses (other than close's clear) and errors.
function observe(node) {
    const seen = { completions: [], sends: 0, statuses: [], errors: [] };
    const complete = node._complete;
    node._complete = function (msg, err) {
        seen.completions.push(err);
        return complete.call(this, msg, err);
    };
    helper.getNode('out').on('input', () => (seen.sends += 1));
    node.on('call:status', (call) => {
        if (Object.keys(call.args[0] || {}).length) seen.statuses.push(call.args[0]);
    });
    node.on('call:error', (call) => seen.errors.push(call.args[0]));
    return seen;
}

function assertQuiet(seen, completions = 1) {
    assert.deepEqual(seen.completions, new Array(completions).fill(undefined));
    assert.equal(seen.sends, 0);
    assert.deepEqual(seen.statuses, []);
    assert.deepEqual(seen.errors, []);
}

describe('_template_ node: close during in-flight work (2.8)', function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload().then(() => helper.stopServer(done));
    });

    function load() {
        return helper.load(templateNode, [
            {
                id: 'n1',
                type: '_template_',
                source: 'payload',
                sourceType: 'msg',
                target: 'result',
                targetType: 'msg',
                wires: [['out']],
            },
            { id: 'out', type: 'helper' },
        ]);
    }

    it('closing while the source is read writes nothing and completes quietly', async function () {
        await load();
        const n1 = helper.getNode('n1');
        const reads = holdCalls(n1, 'getValidatedProperty');
        const writes = holdCalls(n1, 'setTypedProperty');
        n1.receive({ payload: 'value' });
        await settle();
        await n1.close();
        const seen = observe(n1);
        reads[0].resolve('value');
        await settle();
        assert.equal(writes.length, 0);
        assertQuiet(seen);
    });

    it('a source read rejected after close completes quietly', async function () {
        await load();
        const n1 = helper.getNode('n1');
        const reads = holdCalls(n1, 'getValidatedProperty');
        n1.receive({ payload: 'value' });
        await settle();
        await n1.close();
        const seen = observe(n1);
        reads[0].reject(new Error('context store failed'));
        await settle();
        assertQuiet(seen);
    });

    it('concurrent inputs held at the source read all complete quietly after close', async function () {
        await load();
        const n1 = helper.getNode('n1');
        const reads = holdCalls(n1, 'getValidatedProperty');
        const writes = holdCalls(n1, 'setTypedProperty');
        n1.receive({ payload: 'a' });
        n1.receive({ payload: 'b' });
        await settle();
        assert.equal(reads.length, 2);
        await n1.close();
        const seen = observe(n1);
        reads.forEach((read) => read.resolve('value'));
        await settle();
        assert.equal(writes.length, 0);
        assertQuiet(seen, 2);
    });

    for (const outcome of ['resolves', 'rejects']) {
        it(`a target write that ${outcome} after close reports nothing`, async function () {
            await load();
            const n1 = helper.getNode('n1');
            const writes = holdCalls(n1, 'setTypedProperty');
            n1.receive({ payload: 'value' });
            await settle();
            assert.equal(writes.length, 1);
            await n1.close();
            const seen = observe(n1);
            if (outcome === 'resolves') writes[0].resolve();
            else writes[0].reject(new Error('context store failed'));
            await settle();
            assertQuiet(seen);
        });
    }

    // Control: passes before and after the change.
    it('a message processed before close is sent once', async function () {
        await load();
        const n1 = helper.getNode('n1');
        const seen = observe(n1);
        n1.receive({ payload: 'value' });
        await settle();
        assert.equal(seen.sends, 1);
        assert.deepEqual(seen.completions, [undefined]);
    });
});
