#!/usr/bin/env node
// Uploads a zip to the Chrome Web Store and publishes it, in the three calls
// the store's API takes: swap the long-lived refresh token for an access
// token, PUT the package over the existing item, then POST publish.
//
//   node scripts/publish-cws.mjs --item <itemId> --zip dist/peacebestill-youtube-store.zip
//
// Credentials come from the environment (CWS_CLIENT_ID, CWS_CLIENT_SECRET,
// CWS_REFRESH_TOKEN) so they never appear in a command line. The item has to
// exist already: the store assigns its ID when the listing is first created by
// hand, and that first upload carries the listing text, screenshots and the
// data-use answers, none of which the API can set.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = (item) => `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${item}`;
const PUBLISH_URL = (item) => `https://www.googleapis.com/chromewebstore/v1.1/items/${item}/publish`;

export function tokenRequest({ clientId, clientSecret, refreshToken }) {
  return {
    url: TOKEN_URL,
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    },
  };
}

// The store reports failure in the body with a 200, so a caller that only
// checks response.ok publishes nothing and says it worked.
export function checkUpload(body) {
  if (body?.uploadState !== "SUCCESS") {
    const detail = (body?.itemError ?? []).map((e) => e.error_detail).join("; ");
    throw new Error(`upload was ${body?.uploadState ?? "not accepted"}${detail ? `: ${detail}` : ""}`);
  }
  return body;
}

export function checkPublish(body) {
  const statuses = body?.status ?? [];
  const bad = statuses.filter((s) => s !== "OK" && s !== "ITEM_PENDING_REVIEW");
  if (bad.length) throw new Error(`publish returned ${statuses.join(", ")}: ${(body.statusDetail ?? []).join("; ")}`);
  return statuses;
}

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method} ${url} -> ${response.status} ${JSON.stringify(body)}`);
  return body;
}

export async function publish({ item, zip, clientId, clientSecret, refreshToken }) {
  const { url, init } = tokenRequest({ clientId, clientSecret, refreshToken });
  const { access_token: token } = await json(url, init);
  if (!token) throw new Error("no access token came back; check CWS_CLIENT_ID/SECRET/REFRESH_TOKEN");
  const headers = { authorization: `Bearer ${token}`, "x-goog-api-version": "2" };

  checkUpload(await json(UPLOAD_URL(item), { method: "PUT", headers, body: zip }));
  const statuses = checkPublish(await json(PUBLISH_URL(item), {
    method: "POST",
    headers: { ...headers, "content-length": "0" },
  }));
  return statuses;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const item = arg("--item");
  const zipPath = arg("--zip");
  const { CWS_CLIENT_ID: clientId, CWS_CLIENT_SECRET: clientSecret, CWS_REFRESH_TOKEN: refreshToken } = process.env;
  if (!item || !zipPath) {
    console.error("usage: publish-cws.mjs --item <itemId> --zip package.zip");
    process.exit(2);
  }
  if (!clientId || !clientSecret || !refreshToken) {
    console.error("CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN must all be set");
    process.exit(2);
  }
  const statuses = await publish({ item, zip: readFileSync(zipPath), clientId, clientSecret, refreshToken });
  console.log(`${zipPath} published to ${item} (${statuses.join(", ")})`);
}
