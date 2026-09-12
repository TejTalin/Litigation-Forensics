import assert from "node:assert/strict";
import test from "node:test";
import { GroqError } from "./groqClient.js";
import { parsePartyRadarPayload } from "./partyRadar.js";

const sureshFlag = {
  party_role: "Mr. Suresh Verma - co-owner holding an undivided one-half share",
  paragraph_reference: "para 2; prayer clause (c)",
  explanation: "Suresh Verma is a co-owner of the Suit Property and the injunction expressly affects his undivided share. An effective decree cannot bind that share in his absence.",
  legal_basis: "Order 1 Rule 10, CPC, 1908 - a person whose property interest is directly affected is necessary for effective adjudication.",
  party_type: "necessary",
  confidence: "explicit",
};

test("keeps the Suresh Verma necessary-party finding", () => {
  const result = parsePartyRadarPayload(JSON.stringify({ flags: [sureshFlag], defects: [], clean: false }));
  assert.equal(result.clean, false);
  assert.equal(result.flags.length, 1);
  assert.match(result.flags[0]?.party_role ?? "", /Suresh Verma/);
});

test("fails loudly instead of silently dropping a proper-party flag", () => {
  assert.throws(
    () => parsePartyRadarPayload(JSON.stringify({ flags: [{ ...sureshFlag, party_type: "proper" }], defects: [], clean: true })),
    GroqError,
  );
});
