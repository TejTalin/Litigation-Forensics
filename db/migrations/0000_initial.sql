CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY, name text NOT NULL, case_number text, court text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY, case_id uuid REFERENCES cases(id) ON DELETE CASCADE, filename text NOT NULL, extracted_text text, extraction_method text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scan_results (
  id uuid PRIMARY KEY, document_id uuid REFERENCES documents(id) ON DELETE CASCADE, module text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS court_queue_watches (
  id uuid PRIMARY KEY, court_name text NOT NULL, court_number text NOT NULL, user_item_number integer NOT NULL, status text NOT NULL DEFAULT 'armed', board_url text, parser_rule jsonb, running_item_number integer, last_checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS court_queue_observations (
  id uuid PRIMARY KEY,
  watch_id uuid REFERENCES court_queue_watches(id) ON DELETE CASCADE,
  running_item_number integer NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS court_queue_observations_watch_time_idx ON court_queue_observations (watch_id, observed_at);
