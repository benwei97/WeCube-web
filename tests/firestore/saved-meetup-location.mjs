import assert from "node:assert/strict";

// Run with firebase emulators:exec --only firestore --project demo-wecube.
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(host, "This test requires the Firestore emulator.");
const project = "demo-wecube";
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents/users`;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(uid) {
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: uid, user_id: uid, aud: project,
    iss: `https://securetoken.google.com/${project}`,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    email_verified: true, firebase: { sign_in_provider: "google.com" },
  })}.`;
}
const string = (value) => ({ stringValue: value });
const location = { mapValue: { fields: {
  label: string("Seattle, Washington, United States"), city: string("Seattle"),
  region: string("Washington"), country: string("United States"), countryCode: string("US"),
  latitude: { doubleValue: 47.61 }, longitude: { doubleValue: -122.33 },
} } };
async function write(uid, actor, fields, updateOnly = false) {
  const mask = updateOnly ? `?${new URLSearchParams(Object.keys(fields).map((key) => ["updateMask.fieldPaths", key]))}` : "";
  return fetch(`${base}/${uid}${mask}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(actor)}` },
    body: JSON.stringify({ fields }),
  });
}
for (const uid of ["seller", "other"]) {
  const response = await write(uid, uid, {
    email: string(`${uid}@example.test`), firstName: string("Test"), lastName: string("Seller"),
    createdAt: string(new Date().toISOString()),
  });
  assert.equal(response.status, 200, await response.text());
}
let response = await write("seller", "seller", { savedMeetupLocation: location }, true);
assert.equal(response.status, 200, await response.text());
response = await fetch(`${base}/seller`);
const profile = (await response.json()).fields;
assert.deepEqual(profile.savedMeetupLocation, location);
assert.deepEqual(profile.firstName, string("Test"));
response = await write("other", "seller", { savedMeetupLocation: location }, true);
assert.equal(response.status, 403);
response = await write("seller", "seller", {
  savedMeetupLocation: { mapValue: { fields: { ...location.mapValue.fields, latitude: { doubleValue: 100 } } } },
}, true);
assert.equal(response.status, 403);
response = await write("seller", "seller", {
  savedMeetupLocation: { mapValue: { fields: { ...location.mapValue.fields, address: string("private address") } } },
}, true);
assert.equal(response.status, 403);
response = await write("seller", "seller", { savedMeetupLocation: { nullValue: null } }, true);
assert.equal(response.status, 200, await response.text());
response = await write("seller", "seller", { savedListings: { arrayValue: { values: [string("listing-1")] } } }, true);
assert.equal(response.status, 200, await response.text());
const competitions = { arrayValue: { values: [{ mapValue: { fields: {
  id: string("Seattle2027"), name: string("Seattle 2027"),
  startDate: string("2027-01-02"), endDate: string("2027-01-03"),
} } }] } };
response = await write("seller", "seller", { savedMeetupCompetitions: competitions }, true);
assert.equal(response.status, 200, await response.text());
response = await write("other", "seller", { savedMeetupCompetitions: competitions }, true);
assert.equal(response.status, 403);
response = await write("seller", "seller", { savedMeetupCompetitions: string("not a list") }, true);
assert.equal(response.status, 403);
response = await write("seller", "seller", { savedMeetupCompetitions: { arrayValue: { values: Array(101).fill(competitions.arrayValue.values[0]) } } }, true);
assert.equal(response.status, 403);
response = await write("seller", "seller", { savedMeetupCompetitions: { arrayValue: { values: [] } } }, true);
assert.equal(response.status, 200, await response.text());
console.log("Saved meetup rules passed: own location/competition save and clear, preserved profile, rejected cross-user/invalid writes, existing bookmarks.");
