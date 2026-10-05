package blog

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestLegacyMigrationPreservesArticleIDs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE articles (
		id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
		excerpt TEXT NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL,
		tags TEXT NOT NULL, cover TEXT NOT NULL, status TEXT NOT NULL,
		featured INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT NOT NULL);
		INSERT INTO articles VALUES ('stable-id','old-title','Original title','Excerpt','Body','技术','[]','code','published',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	a, err := s.Get(context.Background(), "stable-id", false)
	if err != nil || a.Title != "Original title" {
		t.Fatalf("existing content lost: %v", err)
	}
	a, err = s.Save(context.Background(), a.ID, Input{Title: "New title", Content: "Updated body", Status: "published"})
	if err != nil || a.ID != "stable-id" {
		t.Fatalf("ID changed after migration: %v", err)
	}
	_, err = s.Save(context.Background(), "", Input{Title: "New title", Content: "Another article", Status: "published"})
	if err != nil {
		t.Fatalf("article titles must not be unique: %v", err)
	}
}
