import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { randomUUID } from "node:crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const { rows } = await sql`SELECT * FROM court_queue_watches ORDER BY created_at DESC`;
      return res.json({ watches: rows });
    }
    if (req.method === "POST") {
      const { courtName, courtNumber, itemNumber } = req.body ?? {};
      if (!courtName || !courtNumber || !itemNumber) return res.status(400).json({ error: "courtName, courtNumber and itemNumber are required." });
      const id = randomUUID();
      const boardUrl = process.env.COURT_BOARD_URL;
      const parserRule = process.env.COURT_BOARD_PATTERN ? { pattern: process.env.COURT_BOARD_PATTERN, flags: process.env.COURT_BOARD_PATTERN_FLAGS || "gi" } : null;
      if (!boardUrl || !parserRule) return res.status(503).json({ error: "Court-board polling is not configured. Set COURT_BOARD_URL and COURT_BOARD_PATTERN." });
      const { rows } = await sql`INSERT INTO court_queue_watches (id, court_name, court_number, user_item_number, status, board_url, parser_rule) VALUES (${id}, ${courtName}, ${courtNumber}, ${Number(itemNumber)}, 'armed', ${boardUrl}, ${JSON.stringify(parserRule)}) RETURNING *`;
      return res.status(201).json({ watch: rows[0] });
    }
    return res.status(405).json({ error: "Unsupported method" });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Database unavailable. Configure DATABASE_URL." }); }
}
