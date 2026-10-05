package blog

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound = errors.New("article not found")
	ErrConflict = errors.New("slug already exists")
)

type Article struct {
	ID          string   `json:"id"`
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Excerpt     string   `json:"excerpt"`
	Content     string   `json:"content,omitempty"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
	Cover       string   `json:"cover"`
	Status      string   `json:"status"`
	Featured    bool     `json:"featured"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	PublishedAt string   `json:"publishedAt"`
}

type Input struct {
	Slug     string   `json:"slug"`
	Title    string   `json:"title"`
	Excerpt  string   `json:"excerpt"`
	Content  string   `json:"content"`
	Category string   `json:"category"`
	Tags     []string `json:"tags"`
	Cover    string   `json:"cover"`
	Status   string   `json:"status"`
	Featured bool     `json:"featured"`
}

type Store struct{ db *sql.DB }

func OpenStore(path string, seed bool) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	_, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
		CREATE TABLE IF NOT EXISTS articles (
		id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
		excerpt TEXT NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL,
		tags TEXT NOT NULL, cover TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')),
		featured INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT NOT NULL);
		CREATE INDEX IF NOT EXISTS articles_public ON articles(status, published_at DESC);
		CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
	if err == nil && seed {
		err = s.seed()
	}
	if err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func randomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func slugify(value string) string {
	var result strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			result.WriteRune(r)
		} else if result.Len() > 0 && !strings.HasSuffix(result.String(), "-") {
			result.WriteByte('-')
		}
	}
	return strings.Trim(result.String(), "-")
}

func (in *Input) Validate() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Content = strings.TrimSpace(in.Content)
	in.Category = strings.TrimSpace(in.Category)
	in.Excerpt = strings.TrimSpace(in.Excerpt)
	if in.Title == "" || utf8.RuneCountInString(in.Title) > 120 {
		return errors.New("标题必填，且不能超过 120 个字符")
	}
	if in.Content == "" || len(in.Content) > 1024*1024 {
		return errors.New("正文必填，且不能超过 1 MB")
	}
	if in.Category == "" {
		in.Category = "随笔"
	}
	if utf8.RuneCountInString(in.Category) > 32 || utf8.RuneCountInString(in.Excerpt) > 300 {
		return errors.New("分类最多 32 个字符，摘要最多 300 个字符")
	}
	if in.Status != "draft" && in.Status != "published" {
		return errors.New("文章状态必须为 draft 或 published")
	}
	if in.Cover == "" {
		in.Cover = "paper"
	}
	if in.Cover != "paper" && in.Cover != "code" && in.Cover != "nature" && in.Cover != "sunset" {
		return errors.New("请选择有效的封面")
	}
	if in.Slug == "" {
		in.Slug = slugify(in.Title)
	}
	if in.Slug == "" {
		in.Slug = randomID()[:12]
	}
	if utf8.RuneCountInString(in.Slug) > 150 || slugify(in.Slug) != in.Slug {
		return errors.New("链接名称最多 150 个字符，只能包含小写字母、汉字、数字和连字符")
	}
	if len(in.Tags) > 8 {
		return errors.New("最多添加 8 个标签")
	}
	tags := make([]string, 0, len(in.Tags))
	seen := map[string]bool{}
	for _, tag := range in.Tags {
		tag = strings.TrimSpace(tag)
		if utf8.RuneCountInString(tag) > 24 {
			return errors.New("每个标签最多 24 个字符")
		}
		if tag != "" && !seen[tag] {
			tags = append(tags, tag)
			seen[tag] = true
		}
	}
	in.Tags = tags
	if in.Excerpt == "" {
		runes := []rune(in.Content)
		if len(runes) > 120 {
			runes = runes[:120]
		}
		in.Excerpt = string(runes)
	}
	return nil
}

const columns = `id,slug,title,excerpt,content,category,tags,cover,status,featured,created_at,updated_at,published_at`

type scanner interface{ Scan(...any) error }

func scanArticle(row scanner) (Article, error) {
	var a Article
	var tags string
	err := row.Scan(&a.ID, &a.Slug, &a.Title, &a.Excerpt, &a.Content, &a.Category, &tags, &a.Cover, &a.Status, &a.Featured, &a.CreatedAt, &a.UpdatedAt, &a.PublishedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	if err == nil {
		err = json.Unmarshal([]byte(tags), &a.Tags)
	}
	return a, err
}

func (s *Store) List(ctx context.Context, private bool) ([]Article, error) {
	where := " WHERE status='published'"
	if private {
		where = ""
	}
	rows, err := s.db.QueryContext(ctx, "SELECT "+columns+" FROM articles"+where+" ORDER BY published_at DESC, created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]Article, 0)
	for rows.Next() {
		a, err := scanArticle(rows)
		if err != nil {
			return nil, err
		}
		a.Content = ""
		result = append(result, a)
	}
	return result, rows.Err()
}

func (s *Store) Get(ctx context.Context, key string, private bool) (Article, error) {
	where := " WHERE (id=? OR slug=?)"
	if !private {
		where += " AND status='published'"
	}
	return scanArticle(s.db.QueryRowContext(ctx, "SELECT "+columns+" FROM articles"+where, key, key))
}

func (s *Store) Save(ctx context.Context, id string, in Input) (Article, error) {
	if err := in.Validate(); err != nil {
		return Article{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	a := Article{ID: id, Slug: in.Slug, Title: in.Title, Excerpt: in.Excerpt, Content: in.Content, Category: in.Category, Tags: in.Tags, Cover: in.Cover, Status: in.Status, Featured: in.Featured, CreatedAt: now, UpdatedAt: now}
	if id != "" {
		old, err := s.Get(ctx, id, true)
		if err != nil {
			return a, err
		}
		a.ID, a.CreatedAt, a.PublishedAt = old.ID, old.CreatedAt, old.PublishedAt
	} else {
		a.ID = randomID()
	}
	if a.Status == "published" && a.PublishedAt == "" {
		a.PublishedAt = now
	}
	tags, _ := json.Marshal(a.Tags)
	var err error
	if id == "" {
		_, err = s.db.ExecContext(ctx, "INSERT INTO articles ("+columns+") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", a.ID, a.Slug, a.Title, a.Excerpt, a.Content, a.Category, string(tags), a.Cover, a.Status, a.Featured, a.CreatedAt, a.UpdatedAt, a.PublishedAt)
	} else {
		_, err = s.db.ExecContext(ctx, `UPDATE articles SET slug=?, title=?, excerpt=?, content=?, category=?, tags=?, cover=?, status=?, featured=?, updated_at=?, published_at=? WHERE id=?`, a.Slug, a.Title, a.Excerpt, a.Content, a.Category, string(tags), a.Cover, a.Status, a.Featured, a.UpdatedAt, a.PublishedAt, a.ID)
	}
	if err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed: articles.slug") {
		return a, ErrConflict
	}
	return a, err
}

func (s *Store) Delete(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, "DELETE FROM articles WHERE id=?", id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) seed() error {
	var exists int
	err := s.db.QueryRow("SELECT COUNT(*) FROM metadata WHERE key='seeded'").Scan(&exists)
	if err != nil || exists > 0 {
		return err
	}
	// Seed only once, even after the author intentionally deletes all articles.
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, in := range demoArticles() {
		if err := in.Validate(); err != nil {
			return err
		}
		date := time.Date(2026, 9, 28-i*4, 8, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
		tags, _ := json.Marshal(in.Tags)
		_, err = tx.Exec("INSERT OR IGNORE INTO articles ("+columns+") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", randomID(), in.Slug, in.Title, in.Excerpt, in.Content, in.Category, string(tags), in.Cover, in.Status, in.Featured, date, date, date)
		if err != nil {
			return fmt.Errorf("seed article: %w", err)
		}
	}
	if _, err = tx.Exec("INSERT INTO metadata(key,value) VALUES ('seeded','true')"); err != nil {
		return err
	}
	return tx.Commit()
}
