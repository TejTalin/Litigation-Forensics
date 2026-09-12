import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { randomUUID } from "node:crypto";
import { fetchNormalizedBoardText, runParserRule } from "../../server/lib/courtQueueParser.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized" });
  const { rows: watches } = await sql`SELECT * FROM court_queue_watches WHERE status = 'armed'`;
  for (const watch of watches) {
    try {
      // Court board URLs/rules are deliberately persisted per watch so cron instances share no in-memory state.
      const board = await fetchNormalizedBoardText(watch.board_url);
      if (!watch.board_url || !watch.parser_rule) continue;
      const parsed = runParserRule(board, watch.parser_rule, watch.court_number);
      const running = parsed.runningItem;
      const status = running != null && running >= watch.user_item_number ? "triggered" : "armed";
      if (running != null) await sql`INSERT INTO court_queue_observations (id, watch_id, running_item_number) VALUES (${randomUUID()}, ${watch.id}, ${running})`;
      await sql`UPDATE court_queue_watches SET status=${status}, running_item_number=${running}, last_checked_at=NOW(), updated_at=NOW() WHERE id=${watch.id}`;
    } catch { await sql`UPDATE court_queue_watches SET last_checked_at=NOW(), updated_at=NOW() WHERE id=${watch.id}`; }
  }
  return res.json({ processed: watches.length });
}
