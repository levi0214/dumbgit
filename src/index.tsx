import { Hono } from 'hono'

const PORT = 7777

const app = new Hono()

app.get('/', (c) =>
  c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>dumbgit</title>
        <script
          src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"
          defer
        ></script>
      </head>
      <body>
        <p>hello dumbgit</p>
      </body>
    </html>,
    200,
  ),
)

console.log(`http://localhost:${PORT}`)
Bun.serve({
  port: PORT,
  fetch: app.fetch,
})
