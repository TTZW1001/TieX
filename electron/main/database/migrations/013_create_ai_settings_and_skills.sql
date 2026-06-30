CREATE TABLE IF NOT EXISTS ai_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  provider_id TEXT,
  model_name TEXT,
  temperature REAL,
  top_p REAL,
  max_tokens INTEGER,
  context_message_limit INTEGER,
  context_token_limit INTEGER,
  stream_enabled INTEGER,
  tools_enabled INTEGER,
  attachments_enabled INTEGER,
  custom_params_json TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES model_providers(id)
);

CREATE TABLE IF NOT EXISTS conversation_ai_settings (
  conversation_id TEXT PRIMARY KEY,
  provider_id TEXT,
  model_name TEXT,
  temperature REAL,
  top_p REAL,
  max_tokens INTEGER,
  context_message_limit INTEGER,
  context_token_limit INTEGER,
  stream_enabled INTEGER,
  tools_enabled INTEGER,
  attachments_enabled INTEGER,
  override_mask_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES model_providers(id)
);

CREATE TABLE IF NOT EXISTS installed_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  source TEXT,
  version TEXT,
  path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  install_type TEXT NOT NULL DEFAULT 'local',
  content_hash TEXT,
  summary TEXT,
  token_estimate INTEGER,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_market_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  tags_json TEXT,
  bundled_path TEXT,
  installed_skill_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (installed_skill_id) REFERENCES installed_skills(id)
);

CREATE TABLE IF NOT EXISTS message_skill_refs (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'explicit',
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES installed_skills(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_presets_scope ON ai_presets(scope);
CREATE INDEX IF NOT EXISTS idx_ai_presets_default ON ai_presets(is_default);
CREATE INDEX IF NOT EXISTS idx_installed_skills_enabled ON installed_skills(enabled);
CREATE INDEX IF NOT EXISTS idx_message_skill_refs_message ON message_skill_refs(message_id);
CREATE INDEX IF NOT EXISTS idx_message_skill_refs_conversation ON message_skill_refs(conversation_id);
