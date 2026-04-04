# tornjak

Tornjak is a Turnstile-aware proxy that loads YAML configs and forwards requests to the configured destination URLs.

## Configuration

Create one or more YAML files in `configs/` with this shape:

```yaml
slug: app-proxy
destinationUrl: https://example.com
headers:
  authorization: bearer secret-token
turnstileSecret: secret-basic
defaultMode: bypass
routes:
  - methods: GET
    path:
      - /api/*
    mode: turnstile
  - methods: POST
    path:
      - /admin/*
    mode: blocked
```

### Fields

- `slug`: URL prefix used to match the proxy, for example `http://localhost:3000/app-proxy/...`
- `destinationUrl`: base URL that receives proxied requests
- `headers`: headers added to every proxied request. Defaults to `{}` when omitted
- `turnstileSecret`: required when any route uses `turnstile`. If no route uses `turnstile`, it can be omitted
- `defaultMode`: fallback mode when no route matches. Allowed values are `bypass`, `block`, and `turnstile`. Defaults to `bypass`
- `routes`: list of path rules.
  - `methods`: optional HTTP method filter, one of `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. If omitted, the route applies to all methods
  - `path`: one or more glob patterns that match the request path
  - `mode`: behavior for matching requests, one of `bypass`, `block`, or `turnstile`

Tornjak reads every `*.yml` and `*.yaml` file in `configs/`, so you can split proxies across multiple files.

## Local Development

Required [Bun](https://bun.sh/) as a package manager and JS runtime.

1. Install dependencies:

   ```bash
   bun install
   ```

2. Add at least one config file under `configs/`.

3. Start the app in watch mode:

   ```bash
   bun run dev
   ```

Useful scripts from `package.json`:

- `bun run dev`: run the server with file watching
- `bun run lint`: fix lint issues with `oxlint`
- `bun run format`: format the project with `oxfmt`
- `bun run tscheck`: run TypeScript type checking without emitting files
- `bun test`: run the test suite

Also recommenced: install the `oxlint` and `oxfmt` [extensions in your editor](https://oxc.rs/docs/guide/usage/linter/editors.html)

## Run With Docker

Build the image:

```bash
docker build -t tornjak .
```

Run the container with your configs mounted into `/app/configs`:

```bash
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/configs:/app/configs:ro" \
  tornjak
```

After startup, the proxy listens on the configured port and logs a summary of the loaded configs.
