import test from "node:test";
import assert from "node:assert/strict";
import { tokenRequest, checkUpload, checkPublish } from "../scripts/publish-cws.mjs";

test("the token request posts the refresh grant as form data", () => {
  const { url, init } = tokenRequest({ clientId: "id", clientSecret: "secret", refreshToken: "refresh" });
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
    client_id: "id", client_secret: "secret", refresh_token: "refresh", grant_type: "refresh_token",
  });
});

// The store answers a rejected upload with HTTP 200 and the reason in the
// body, so this is the check that stands between a bad package and a release
// that claims to have published one.
test("an upload is only a success when the body says so, and the reason survives", () => {
  assert.doesNotThrow(() => checkUpload({ uploadState: "SUCCESS" }));
  assert.throws(() => checkUpload({}), /not accepted/);
  assert.throws(
    () => checkUpload({ uploadState: "FAILURE", itemError: [{ error_detail: "update_url is not allowed" }] }),
    /FAILURE: update_url is not allowed/,
  );
});

test("publishing tolerates a review queue but not a refusal", () => {
  assert.deepEqual(checkPublish({ status: ["OK"] }), ["OK"]);
  assert.deepEqual(checkPublish({ status: ["ITEM_PENDING_REVIEW"] }), ["ITEM_PENDING_REVIEW"]);
  assert.throws(
    () => checkPublish({ status: ["ITEM_NOT_UPDATABLE"], statusDetail: ["still in review"] }),
    /ITEM_NOT_UPDATABLE: still in review/,
  );
});
