import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClassic } from "../../../test/helpers/load-classic.mjs";

// The label pass reads the short texts in a feed item's header and decides what
// kind of post it is. It had no test against real markup, and "someone in your
// network likes this" went unmatched for the whole life of the feature: the
// attribution is one span holding a link, a spacer and a bare piece of text,
// and only childless elements were being read. Hand-written test posts put the
// sentence in a span of its own, so it always passed.
//
// The names here are invented. Real ones are not written down.
const SRC = new URL("../src/", import.meta.url);
const content = readFileSync(new URL("content.js", SRC), "utf8");
const helpers = content.slice(content.indexOf("  const FEED_ITEMS ="), content.indexOf("  const MARKED = ["));
const { kindsFor } = loadClassic(new URL("core.js", SRC)).PeaceBeStill;

const { labelsIn } = new Function("PeaceBeStill", `
  const { kindsFor } = PeaceBeStill;
  ${helpers}
  return { labelsIn };
`)(loadClassic(new URL("core.js", SRC)).PeaceBeStill);

function node(tag, ...kids) {
  const self = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    kids,
    children: kids.filter((k) => typeof k !== "string"),
    get childNodes() {
      return kids.map((k) => (typeof k === "string" ? { nodeType: 3, textContent: k } : k));
    },
    get textContent() {
      return kids.map((k) => (typeof k === "string" ? k : k.textContent)).join("");
    },
    querySelectorAll(selector) {
      const want = selector.split(",").map((s) => s.trim().toUpperCase());
      const out = [];
      const walk = (n) => {
        for (const k of n.kids) {
          if (typeof k === "string") continue;
          if (want.includes(k.tagName)) out.push(k);
          walk(k);
        }
      };
      walk(self);
      return out;
    },
  };
  return self;
}

// <p><span><a><strong>Name</strong></a><span> </span>likes this</span></p>
const attribution = (name, verb) =>
  node("p", node("span", node("a", node("strong", name)), node("span", " "), verb));

test("the attribution line is read whole, not one word at a time", () => {
  const labels = labelsIn(attribution("Alex Doe", "likes this"));
  assert.ok(labels.includes("Alex Doe likes this"),
    `the sentence never reached the matcher; all that was read was ${JSON.stringify(labels)}`);
});

test("a post someone in your network liked is marked as such", () => {
  for (const verb of ["likes this", "loves this", "celebrates this", "commented on this", "reposted this"]) {
    const kinds = kindsFor(labelsIn(attribution("Alex Doe", verb)));
    assert.ok(kinds.includes("socialProof"), `"${verb}" was not recognised`);
  }
});

test("the reaction count at the foot of every post is not social proof", () => {
  // This sits on every post, liked by your network or not. Matching it would
  // hide the entire feed.
  const foot = node("p", node("span", node("span", "Alex Doe and 519 others reacted")));
  assert.deepEqual([...kindsFor(labelsIn(foot))], []);
});

test("the body of a post is too long to be mistaken for a label", () => {
  const body = node("p", node("span", "A".repeat(120) + " likes this"));
  assert.deepEqual([...kindsFor(labelsIn(body))], []);
});

// An advert in the feed can be labelled "Promoted by <company>", sitting under
// a real person's name, so the post reads as theirs. The name of the company is
// in a link beside the words, so reading only the two together made the label
// depend on how long that company's name is.
//
// <span>Promoted by<span> </span><a><strong>Company</strong></a></span>
const promoted = (company) =>
  node("p", node("span", "Promoted by", node("span", " "), node("a", node("strong", company))));

test("an advert labelled by its buyer is an advert", () => {
  const kinds = kindsFor(labelsIn(promoted("Some Hospital")));
  assert.ok(kinds.includes("sponsored"), "a promoted post was not recognised as an advert");
});

test("and stays one however long the buyer's name is", () => {
  const long = "The Royal Institute for the Advancement of Very Long Organisational Names Indeed";
  const labels = labelsIn(promoted(long));
  assert.ok(labels.includes("Promoted by"),
    `the words alone were never read; all that was found was ${JSON.stringify(labels)}`);
  assert.ok(kindsFor(labels).includes("sponsored"));
});

test("a post that merely mentions promotion is left alone", () => {
  for (const text of ["Promoted bystander", "Self-Promoted by me", "I was promoted by my boss"]) {
    assert.deepEqual([...kindsFor([text])], [], `${JSON.stringify(text)} was taken for an advert`);
  }
});
