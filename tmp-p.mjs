import { readFileSync } from "node:fs";
import { linkedInTab } from "./tmp-rdp.mjs";
const core = readFileSync("extensions/linkedin/src/core.js", "utf8");
const { evaluate, goTo, close } = await linkedInTab();

const chainOf = `((el, stop) => { const out=[]; for(let p=el,i=0;p&&p!==document.body&&i<9;p=p.parentElement,i++){
  const a=p.getAttribute("aria-label"); out.push({i,tag:p.tagName.toLowerCase(),
    role:p.getAttribute("role"), testid:p.getAttribute("data-testid"),
    aria:(a&&a.length<50&&!a.includes(","))?a:(a?"(personal)":null),
    sibs:p.parentElement?p.parentElement.childElementCount:0}); } return out; })`;

await goTo("https://www.linkedin.com/feed/");
await new Promise(r => setTimeout(r, 2500));
console.log("=== FEED: news module + socialProof ===");
console.log(await evaluate(core + `;JSON.stringify((() => {
  const { kindsFor } = globalThis.PeaceBeStill;
  const labelsIn = (item) => [...item.querySelectorAll("span,p")].slice(0,80)
    .filter(e=>!e.children.length).map(e=>(e.textContent||"").trim()).filter(t=>t&&t.length<90);
  const items=[...document.querySelectorAll('[data-testid="mainFeed"] [role="listitem"]')];
  const tally={}; for(const it of items){ for(const k of kindsFor(labelsIn(it))) tally[k]=(tally[k]||0)+1; }
  // Any social-proof-looking line at all, to see if the regex or the harvest is at fault.
  const socialLines=[...document.querySelectorAll('[data-testid="mainFeed"] span,[data-testid="mainFeed"] p')]
    .filter(e=>!e.children.length && /\\b(likes|loves|celebrates|supports|commented on|reposted)\\b/.test(e.textContent||""))
    .map(e=>(e.textContent||"").trim().replace(/^[^\\s]+(\\s[^\\s]+)?/,"<name>").slice(0,44)).slice(0,5);
  const news=[...document.querySelectorAll('aside[aria-label="Aside"] *')]
    .find(e=>!e.children.length && /^(LinkedIn News|Top stories)$/.test((e.textContent||"").trim()));
  return { items: items.length, tally, socialLines, newsChain: news? ${chainOf}(news):null };
})())`));

await goTo("https://www.linkedin.com/jobs/");
await new Promise(r => setTimeout(r, 2500));
console.log("\n=== JOBS: a promoted card ===");
console.log(await evaluate(`JSON.stringify((() => {
  const p=[...document.querySelectorAll("span,p,div")].find(e=>!e.children.length && (e.textContent||"").trim()==="Promoted");
  return { found: !!p, chain: p? ${chainOf}(p):null };
})())`));

await goTo("https://www.linkedin.com/in/me/");
await new Promise(r => setTimeout(r, 2500));
console.log("\n=== PROFILE: people you may know / suggested ===");
console.log(await evaluate(`JSON.stringify((() => {
  const hit=(t)=>[...document.querySelectorAll("span,p,h2,h3")].find(e=>!e.children.length && (e.textContent||"").trim()===t);
  const a=hit("People you may know"), b=hit("Suggested for you");
  return { pymk: a? ${chainOf}(a):null, suggested: b? ${chainOf}(b):null };
})())`));
close();
