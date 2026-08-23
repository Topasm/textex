# Open-Source Licenses

TextEx is distributed under the MIT license. Bundled third-party notices are
generated into `resources/licenses/` and are available from the application.

Major bundled components include Tauri, React, Monaco Editor, PDF.js, Tectonic,
Tokio, and their locked dependency graphs. The Tectonic notice and full license
text are stored separately alongside the generated JavaScript and Rust notice
files.

Pandoc is optional and is not bundled. A user-installed Pandoc copy is governed
by its own license terms.

After any dependency change run:

```bash
npm ci
npm run licenses:generate
git diff -- resources/licenses
```

The generator reads production npm dependencies and the locked Cargo runtime
and build graph. Development-only dependencies are not represented as bundled
application code.
