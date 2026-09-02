import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { packCrx, crxId, publicKeyDer } from "../scripts/pack-crx.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" });

// Minimal protobuf reader: yields [fieldNumber, bytes] for length-delimited fields.
function* fields(buf) {
  let i = 0;
  const varint = () => { let r = 0, s = 0; for (;;) { const b = buf[i++]; r += (b & 0x7f) * 2 ** s; s += 7; if (b < 0x80) return r; } };
  while (i < buf.length) {
    const tag = varint();
    const num = Math.floor(tag / 8), wire = tag % 8;
    if (wire !== 2) throw new Error(`unexpected wire type ${wire}`);
    const len = varint();
    yield [num, buf.subarray(i, i + len)];
    i += len;
  }
}

test("the ID is 32 letters a-p derived from the public key", () => {
  const id = crxId(publicKeyDer(pem));
  assert.match(id, /^[a-p]{32}$/);
  assert.equal(crxId(publicKeyDer(pem)), id, "stable for the same key");
});

test("packCrx writes a CRX3 whose signature verifies and whose payload is the zip", () => {
  const zip = Buffer.from("PK not really a zip but the packer does not care");
  const crx = packCrx(zip, pem);

  assert.equal(crx.subarray(0, 4).toString("latin1"), "Cr24");
  assert.equal(crx.readUInt32LE(4), 3);
  const headerLength = crx.readUInt32LE(8);
  const header = crx.subarray(12, 12 + headerLength);
  assert.deepEqual(crx.subarray(12 + headerLength), zip);

  const parsed = Object.fromEntries([...fields(header)]);   // { 2: proof, 10000: signedHeaderData }
  const proof = Object.fromEntries([...fields(parsed[2])]);  // { 1: publicKey, 2: signature }
  const signedHeaderData = parsed[10000];
  const idBytes = Object.fromEntries([...fields(signedHeaderData)])[1];
  assert.equal(idBytes.length, 16);
  assert.deepEqual(proof[1], publicKeyDer(pem));

  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(signedHeaderData.length);
  const signed = Buffer.concat([Buffer.from("CRX3 SignedData\0"), lengthPrefix, signedHeaderData, zip]);
  const pub = createPublicKey({ key: proof[1], format: "der", type: "spki" });
  assert.equal(verify("sha256", signed, pub, proof[2]), true);
});
