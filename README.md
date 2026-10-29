# @faigle/node-red-contrib-_template_

Canonical template repository for creating new `@faigle/node-red-contrib-*` custom nodes, preconfigured with:

- Standard runtime integration via `@faigle/node-red-runtime-utils`
- Standard shared editor styles via `resources/@faigle/node-red-runtime-utils/editor.css`
- Fail-closed pre-commit branch guard and version bumping
- GitHub Actions CI workflow
- Mocha unit and integration tests

---

## 🚀 Creating a New Node from this Template

To create a new functional custom node from this template:

1. **Create Repository:** Use _Use this template_ on GitHub to create your new repository (e.g. `node-red-contrib-example`).
2. **Rename Files:**
    - `src/_template_.js` ➔ `src/<your-node>.js`
    - `src/_template_.html` ➔ `src/<your-node>.html`
    - `test/_template_spec.js` ➔ `test/<your-node>_spec.js`
3. **Update `package.json`:**
    - Update `"name"` to `@faigle/node-red-contrib-<your-node>`
    - Update `"description"`
    - Map node registration: `"node-red": { "nodes": { "<your-node>": "src/<your-node>.js" } }`
4. **Update Code Identifiers:**
    - In `src/<your-node>.js`: rename `ExampleTemplateNode` and `RED.nodes.registerType('<your-node>', ...)`
    - In `src/<your-node>.html`: rename `RED.nodes.registerType('<your-node>', ...)` and `<script data-template-name="<your-node>">`
5. **Update Documentation:**
    - Update `PROJECT.md` and `README.md` to describe your node's mission and configuration properties.

---

## ⚙️ Standard Runtime Integration

This node uses `@faigle/node-red-runtime-utils` for consistent Node-RED lifecycle management:

```javascript
const { extendNode } = require('@faigle/node-red-runtime-utils')(RED);

function MyNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Extends node with status and typed property helpers
    extendNode(node);

    node.on('input', async function (msg, send, done) {
        try {
            node.status.processing('processing');

            // Resolve input property
            const value = await node.getTypedProperty(config.source, config.sourceType, msg);

            // Execute logic
            const result = processValue(value);

            // Set output property
            await node.setTypedProperty(config.target, config.targetType, msg, result);

            node.status.succeeded('done');
            send(msg);
            if (done) done();
        } catch (err) {
            node.status.failed(err.message || 'Error');
            if (done) done(err);
            else node.error(err, msg);
        }
    });

    node.on('close', function (removed, done) {
        node.status.clear();
        if (done) done();
    });
}
```

---

## 🎨 Standard UI Styling

All custom node dialogs link to the shared `editor.css` stylesheet provided by `node-red-runtime-utils`:

```html
<link rel="stylesheet" href="resources/@faigle/node-red-runtime-utils/editor.css" />

<script type="text/html" data-template-name="my-node">
    <div class="faigle-node-editor">
        <!-- Standard form rows and fieldsets -->
    </div>
</script>
```

---

## 🧪 Testing

Run test suite:

```bash
npm test
```

Includes:

- Node lifecycle and execution tests (`test/_template_spec.js`)
- Editor registration and validator tests (`test/editor_spec.js`)
- Pre-commit branch guard verification (`test/pre-commit_spec.js`)

---

## 🛠️ Code Quality & Hygiene

- **Linting:** `npm run lint` (ESLint flat config covering JS, HTML, JSON, Markdown)
- **Formatting:** `npm run format` (Prettier)
- **Format Check:** `npm run format:check`
- **Pre-commit Guard:** Prevents direct commits on `main`/`master` and automatically bumps patch version on feature branches.
