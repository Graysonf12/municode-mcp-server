# municode-mcp-server

MCP server wrapping the **unofficial, reverse-engineered Municode API** (`api.municode.com`) — the
same JSON API that library.municode.com's own single-page app calls under the hood. This exists to
close the biggest, most-repeated blocker in the Hutton SIR agent's Jurisdiction Portal Registry:
Municode showing up as ❌ JS-rendered across nearly every jurisdiction (Wildwood, Royal Palm Beach,
Orlando, St. Johns, Sumter, Indian River, Jefferson County).

## ⚠️ Important: this is unofficial and partially unverified

Unlike the FEMA NFHL server (a documented, official government API), **Municode does not publish or
support this API.** Everything here is built from:
- A publicly documented (but currently offline — 502 error) reverse-engineering project
- Multiple independent, working open-source MCP/scraper projects using the same endpoints
- One real, working, MIT-licensed reference implementation whose source code was read directly to
  confirm exact endpoint URLs and parameter names

**What IS confirmed:** the endpoint URLs, parameter names, and the jurisdiction/product lookup field
names (`ClientID`, `ClientName`, `ProductID`, `ProductName`, `Id`/jobId) — these were read from real,
working production code, not guessed.

**What is NOT confirmed:** the exact response *shape* of the `CodesContent` (section text) and
`search` endpoints. The reference implementation this was built from simply dumps whatever JSON comes
back without asserting a schema. This server's `municode_get_section_text` and
`municode_search_ordinances` tools make a best-effort guess at common field names (`Content`, `Html`,
`Text`, `Results`, `Title`, `Snippet`, etc.) and **fall back to returning raw JSON, clearly labeled,
if the guess doesn't match** — so nothing is silently dropped, but the output may need adjustment
once you see a real response.

**The build/test environment used to build this server has no network route to `api.municode.com`,**
so no live call has actually been made or observed. The first real test happens on live deployment.

## Tools

### `municode_find_jurisdiction`
Always call this first. Looks up a municipality/county by name + state, returns its Client ID and
list of code products (Code of Ordinances, Zoning Ordinance, etc.) with the job_id/product_id pairs
every other tool needs.

### `municode_get_table_of_contents`
Browse a code's chapter/section tree one level at a time — mirrors the Setback Retrieval Routine's
"name the exact chapter/table" step.

### `municode_get_section_text`
Read the actual text of a specific section once you have its node_id. **Response-shape caveat above
applies here.**

### `municode_search_ordinances`
Full-text search across a jurisdiction's ordinances. **Response-shape caveat above applies here.**

## What this does NOT solve

If a dimensional table (setback, parking ratio, etc.) is a scanned image embedded in the original
PDF, Municode's own copy is very likely the same image — this server can't OCR it. The §0B
upload/rasterize workflow is still the right path for graphics-embedded tables specifically. This
server's value is in the narrative ordinance *text* — chapter structure, use tables, definitions —
which is most of what's currently blocked, but not 100% of it.

## Deploying — Render (same pattern as the FEMA server)

This repo includes `render.yaml` for one-click Blueprint deploy:

1. Push this repo to GitHub.
2. On [render.com](https://render.com), **New > Blueprint**, connect your GitHub account, select this repo.
3. Render detects `render.yaml` and pre-fills everything (free plan, build/start commands, health check).
4. Click **Deploy**. Render auto-generates an `MCP_API_TOKEN` — copy it from the Environment tab if you want to keep auth on, or delete the variable to run the endpoint open (same tradeoff as the FEMA server).
5. Endpoint: `https://<your-service-name>.onrender.com/mcp`
6. In claude.ai: **Customize > Connectors > "+" > Add custom connector**, paste the URL, add the bearer token under Advanced settings if you kept `MCP_API_TOKEN` set.

## First live-run checklist (do this before trusting it in a real SIR)

1. Run `municode_find_jurisdiction` against a jurisdiction you already know uses Municode (e.g. one
   from your own Jurisdiction Portal Registry) and confirm it resolves correctly.
2. Run `municode_get_table_of_contents` with no `node_id` and confirm real chapter headings come back.
3. Run `municode_get_section_text` on a known section and check the `extraction_confidence` field in
   the JSON output — if it says "unrecognized shape," inspect the raw JSON in the response and update
   `CANDIDATE_TEXT_FIELDS` in `src/tools/getSectionText.ts` to match the real field name, then redeploy.
4. Do the same for `municode_search_ordinances` and `CANDIDATE` fields in `src/tools/searchOrdinances.ts`.
5. Cross-check one retrieved section's text against the same section viewed manually on
   library.municode.com, to confirm content accuracy (not just that *something* came back).
6. Confirm rate-limit / reliability behavior under repeated calls — this is an unsupported API with
   no published limits or uptime guarantee.
