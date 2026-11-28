CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid REFERENCES users ON DELETE CASCADE, name text, created_at timestamptz DEFAULT now());
CREATE TABLE sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES workspaces ON DELETE CASCADE, type text NOT NULL, config_enc text, last_sync_at timestamptz, status text DEFAULT 'idle');
CREATE TABLE notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES workspaces ON DELETE CASCADE, source_id uuid REFERENCES sources ON DELETE SET NULL,
 source_type text NOT NULL, source_ref text NOT NULL, title text, content_text text, source_url text, checksum text, embedding_version text, status text DEFAULT 'pending',
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(workspace_id, source_type, source_ref));
CREATE TABLE chunks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_id uuid REFERENCES notes ON DELETE CASCADE, idx int, text text, token_count int, created_at timestamptz DEFAULT now());
CREATE INDEX notes_ws ON notes(workspace_id);
