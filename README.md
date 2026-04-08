# tornjak

Tornjak is a Turnstile-aware proxy that loads YAML configs and forwards requests to the configured destination URLs.

## Run With Docker

Build the image:

```bash
docker build -t tornjak .
```

Run the container with your configs mounted into `/app/configs`:

```bash
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/configs:/app/configs:z" \
  tornjak
```

After startup, the proxy listens on the configured port and logs a summary of the loaded configs. Tornjak watches the configs directory and automatically reloads the config set when a YAML file changes.

### Environment Variables

- `CONFIGS_DIR`: directory to watch and load YAML configs from. Defaults to `configs`.

- `PORT`: port to bind the HTTP server to. Defaults to `3000`

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
  - methods:
      - GET
    paths:
      - /api/*
    mode: turnstile
  - methods:
      - POST
    paths:
      - /admin/*
    mode: block
```

### Fields

- `slug`: URL prefix used to match the proxy, for example `http://localhost:3000/app-proxy/...`
- `destinationUrl`: base URL that receives proxied requests
- `headers`: headers added to every proxied request. Defaults to `{}` when omitted
- `turnstileSecret`: required when any route uses `turnstile`. If no route uses `turnstile`, it can be omitted
- `defaultMode`: fallback mode when no route matches. Allowed values are `bypass`, `block`, and `turnstile`. Defaults to `bypass`
- `routes`: list of path rules.
  - `methods`: optional HTTP method filters, one or more of `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`. If omitted, the route applies to all methods
  - `paths`: optional glob patterns that match the request path. If omitted, the route matches any path
  - `mode`: behavior for matching requests, one of `bypass`, `block`, or `turnstile`
  - At least one of `methods` or `paths` must be provided

Tornjak reads every `*.yml` and `*.yaml` file in `configs/`, so you can split proxies across multiple files.

## Frontend Usage

Point your frontend at the proxy route instead of the upstream destination when you want Tornjak to mediate the request.

For the example config above, requests that would normally go to:

```text
https://example.com/api/users
```

should be sent through Tornjak as:

```text
http://localhost:3000/app-proxy/api/users
```

Use the `slug` as the path prefix, then append the upstream path after it. Tornjak will match the request against the configured route rules, apply any proxy headers, and forward it to the `destinationUrl`.

If a route is configured with `mode: turnstile`, Tornjak enforces the Turnstile check before the request reaches the destination. The Turnstile response token must be provided in the `cf-turnstile-response` header.

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
