'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlContent = fs.readFileSync(path.join(__dirname, '../src/_template_.html'), 'utf8');

function mockEditorEnvironment() {
    const registeredTypes = new Map();
    const mockElements = new Map();

    const $ = function (selector) {
        if (!mockElements.has(selector)) {
            mockElements.set(selector, {
                value: '',
                val(v) {
                    if (arguments.length) {
                        this.value = v;
                        return this;
                    }
                    return this.value;
                },
                typedInput(options) {
                    this.options = options;
                    return this;
                },
                on() {
                    return this;
                },
                trigger() {
                    return this;
                },
            });
        }
        return mockElements.get(selector);
    };

    const RED = {
        nodes: {
            registerType: (name, definition) => {
                registeredTypes.set(name, definition);
            },
        },
        validators: {
            typedInput: () => {
                return function (val) {
                    return typeof val === 'string' && val.trim().length > 0;
                };
            },
        },
    };

    return { RED, $, registeredTypes, mockElements };
}

describe('_template_ editor registration & contracts', function () {
    let scriptBlock;

    before(function () {
        const match = htmlContent.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/i);
        assert.ok(match, 'HTML must contain a <script type="text/javascript"> block');
        scriptBlock = match[1];
    });

    it('registers _template_ type with Node-RED', function () {
        const env = mockEditorEnvironment();
        const context = vm.createContext({
            RED: env.RED,
            $: env.$,
            console,
        });

        vm.runInContext(scriptBlock, context);

        assert.ok(env.registeredTypes.has('_template_'), 'Must register "_template_" node type');
        const def = env.registeredTypes.get('_template_');

        assert.equal(def.category, 'function');
        assert.equal(def.inputs, 1);
        assert.equal(def.outputs, 1);
        assert.equal(def.paletteLabel, '_template_');
    });

    it('defines valid defaults with typedInput validators', function () {
        const env = mockEditorEnvironment();
        const context = vm.createContext({
            RED: env.RED,
            $: env.$,
            console,
        });

        vm.runInContext(scriptBlock, context);
        const def = env.registeredTypes.get('_template_');

        assert.ok(def.defaults.source);
        assert.ok(def.defaults.sourceType);
        assert.ok(def.defaults.target);
        assert.ok(def.defaults.targetType);

        // Test source validator
        const sourceVal = def.defaults.source.validate;
        assert.equal(typeof sourceVal, 'function');
        assert.equal(sourceVal.call({ sourceType: 'msg' }, 'payload'), true);
        assert.equal(sourceVal.call({ sourceType: 'msg' }, ''), false);

        // Test target validator
        const targetVal = def.defaults.target.validate;
        assert.equal(typeof targetVal, 'function');
        assert.equal(targetVal.call({ targetType: 'msg' }, 'payload'), true);
        assert.equal(targetVal.call({ targetType: 'msg' }, ''), false);
    });

    it('links runtime-utils editor.css stylesheet without inline style pollution', function () {
        assert.match(
            htmlContent,
            /<link rel="stylesheet" href="resources\/@faigle\/node-red-runtime-utils\/editor\.css" \/>/,
            'Must link shared editor.css from runtime-utils',
        );
        assert.doesNotMatch(
            htmlContent,
            /<style>/i,
            'Must not contain redundant inline <style> tags',
        );
        assert.match(
            htmlContent,
            /<div class="faigle-node-editor">/,
            'Template markup must be wrapped in faigle-node-editor container',
        );
    });
});
