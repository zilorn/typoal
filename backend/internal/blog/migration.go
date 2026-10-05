package blog

// Preserve existing IDs and data when upgrading the initial slug-based schema.
// New databases never have a slug column or preloaded articles.
func (s *Store) migrateLegacyLinks() error {
	var legacy int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('articles') WHERE name='slug'").Scan(&legacy); err != nil {
		return err
	}
	if legacy == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.Exec(`DROP INDEX IF EXISTS articles_public;
		ALTER TABLE articles RENAME TO articles_legacy;
		CREATE TABLE articles (
		id TEXT PRIMARY KEY, title TEXT NOT NULL, excerpt TEXT NOT NULL,
		content TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL,
		cover TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')),
		featured INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT NOT NULL);
		INSERT INTO articles (` + columns + `) SELECT ` + columns + ` FROM articles_legacy;
		DROP TABLE articles_legacy;
		CREATE INDEX articles_public ON articles(status, published_at DESC);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}
