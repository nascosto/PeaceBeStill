#!/usr/bin/env node
// Packs a zip into a CRX3 with an RSA private key, using only node:crypto.
//
//   node scripts/pack-crx.mjs --key key.pem --zip dist/peacebestill-youtube.zip --out dist/peacebestill-youtube.crx
//   node scripts/pack-crx.mjs --key key.pem --id        # print the extension ID and exit
//
// Format: "Cr24", uint32 LE 3, uint32 LE header length, CrxFileHeader, zip.
// CrxFileHeader { 2: AsymmetricKeyProof { 1: public_key, 2: signature }, 10000: SignedData { 1: crx_id } }
// Signature: RSA PKCS#1 v1.5 SHA-256 over "CRX3 SignedData\0" + uint32 LE len(SignedData) + SignedData + zip.
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function varint(n) {
  const out = [];
  while (n >= 0x80) { out.push((n % 128) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
}

function lengthDelimited(fieldNumber, bytes) {
  return Buffer.concat([varint(fieldNumber * 8 + 2), varint(bytes.length), bytes]);
}

export function publicKeyDer(pem) {
  return createPublicKey(createPrivateKey(pem)).export({ type: "spki", format: "der" });
}

function idBytes(pubDer) {
  return createHash("sha256").update(pubDer).digest().subarray(0, 16);
}

export function crxId(pubDer) {
  return [...idBytes(pubDer).toString("hex")]
    .map((hexDigit) => String.fromCharCode(97 + parseInt(hexDigit, 16)))
    .join("");
}

export function packCrx(zip, pem) {
  const pubDer = publicKeyDer(pem);
  const signedHeaderData = lengthDelimited(1, idBytes(pubDer));
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(signedHeaderData.length);
  const toSign = Buffer.concat([Buffer.from("CRX3 SignedData\0"), lengthPrefix, signedHeaderData, zip]);
  const signature = sign("sha256", toSign, createPrivateKey(pem));
  const proof = Buffer.concat([lengthDelimited(1, pubDer), lengthDelimited(2, signature)]);
  const header = Buffer.concat([lengthDelimited(2, proof), lengthDelimited(10000, signedHeaderData)]);
  const prefix = Buffer.alloc(12);
  prefix.write("Cr24", 0, "latin1");
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, zip]);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keyPath = arg("--key");
  if (!keyPath) {
    console.error("usage: pack-crx.mjs --key key.pem (--id | --zip in.zip --out out.crx)");
    process.exit(2);
  }
  const pem = readFileSync(keyPath, "utf8");
  if (process.argv.includes("--id")) {
    console.log(crxId(publicKeyDer(pem)));
  } else {
    const zipPath = arg("--zip");
    const outPath = arg("--out");
    if (!zipPath || !outPath) {
      console.error("usage: pack-crx.mjs --key key.pem --zip in.zip --out out.crx");
      process.exit(2);
    }
    writeFileSync(outPath, packCrx(readFileSync(zipPath), pem));
    console.log(`${outPath} (id ${crxId(publicKeyDer(pem))})`);
  }
}
