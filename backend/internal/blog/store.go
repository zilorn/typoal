package blog

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound = errors.New("article not found")
)

type Article struct {
	ID          string   `json:"id"`
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

func OpenStore(path string) (*Store, error) {
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
		id TEXT PRIMARY KEY, title TEXT NOT NULL,
		excerpt TEXT NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL,
		tags TEXT NOT NULL, cover TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')),
		featured INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT NOT NULL);
		CREATE INDEX IF NOT EXISTS articles_public ON articles(status, published_at DESC);
		CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
	if err == nil {
		err = s.migrateLegacyLinks()
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

const columns = `id,title,excerpt,content,category,tags,cover,status,featured,created_at,updated_at,published_at`

type scanner interface{ Scan(...any) error }

func scanArticle(row scanner) (Article, error) {
	var a Article
	var tags string
	err := row.Scan(&a.ID, &a.Title, &a.Excerpt, &a.Content, &a.Category, &tags, &a.Cover, &a.Status, &a.Featured, &a.CreatedAt, &a.UpdatedAt, &a.PublishedAt)
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
	where := " WHERE id=?"
	if !private {
		where += " AND status='published'"
	}
	return scanArticle(s.db.QueryRowContext(ctx, "SELECT "+columns+" FROM articles"+where, key))
}

func (s *Store) Save(ctx context.Context, id string, in Input) (Article, error) {
	if err := in.Validate(); err != nil {
		return Article{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	a := Article{ID: id, Title: in.Title, Excerpt: in.Excerpt, Content: in.Content, Category: in.Category, Tags: in.Tags, Cover: in.Cover, Status: in.Status, Featured: in.Featured, CreatedAt: now, UpdatedAt: now}
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
		_, err = s.db.ExecContext(ctx, "INSERT INTO articles ("+columns+") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", a.ID, a.Title, a.Excerpt, a.Content, a.Category, string(tags), a.Cover, a.Status, a.Featured, a.CreatedAt, a.UpdatedAt, a.PublishedAt)
	} else {
		_, err = s.db.ExecContext(ctx, `UPDATE articles SET title=?, excerpt=?, content=?, category=?, tags=?, cover=?, status=?, featured=?, updated_at=?, published_at=? WHERE id=?`, a.Title, a.Excerpt, a.Content, a.Category, string(tags), a.Cover, a.Status, a.Featured, a.UpdatedAt, a.PublishedAt, a.ID)
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

// PasswordHash returns the stored administrator password hash. An empty string
// means no password has been persisted yet and the environment value must seed
// one.
func (s *Store) PasswordHash(ctx context.Context) (string, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key='password_hash'").Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return hash, err
}

func (s *Store) SetPasswordHash(ctx context.Context, hash string) error {
	_, err := s.db.ExecContext(ctx, "INSERT INTO settings(key,value) VALUES('password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", hash)
	return err
}

func (s *Store) ClearSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions")
	return err
}
