package blog

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Password      string
	ResetPassword bool
	CookieSecure  bool
	SiteName      string
	AuthorName    string
	AuthorBio     string
}

type attempt struct {
	count int
	until time.Time
}

type Server struct {
	store        *Store
	config       Config
	authMu       sync.RWMutex
	passwordHash string
	mu           sync.Mutex
	attempts     map[string]attempt
}

func NewServer(store *Store, config Config) (http.Handler, error) {
	hash, err := store.PasswordHash(context.Background())
	if err != nil {
		return nil, err
	}
	if hash == "" || config.ResetPassword {
		if hash, err = hashPassword(config.Password); err != nil {
			return nil, err
		}
		if err := store.SetPasswordHash(context.Background(), hash); err != nil {
			return nil, err
		}
		if config.ResetPassword {
			// A deliberate reset invalidates every existing session.
			if err := store.ClearSessions(context.Background()); err != nil {
				return nil, err
			}
		}
	}
	s := &Server{store: store, config: config, passwordHash: hash, attempts: make(map[string]attempt)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := store.db.PingContext(r.Context()); err != nil {
			writeError(w, 503, "数据库暂时不可用")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/site", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"name": config.SiteName, "author": config.AuthorName, "bio": config.AuthorBio})
	})
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("POST /api/auth/password", s.changePassword)
	mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]bool{"authenticated": s.authenticated(r)})
	})
	mux.HandleFunc("GET /api/articles", s.list)
	mux.HandleFunc("GET /api/articles/{key}", s.get)
	mux.HandleFunc("POST /api/articles", s.save)
	mux.HandleFunc("PUT /api/articles/{key}", s.save)
	mux.HandleFunc("DELETE /api/articles/{key}", s.delete)
	mux.HandleFunc("GET /api/feed.xml", s.feed)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				host := r.Host
				if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
					host = forwarded
				}
				if err != nil || u.Host != host || (u.Scheme != "http" && u.Scheme != "https") || (config.CookieSecure && u.Scheme != "https") {
					writeError(w, 403, "请求来源无效")
					return
				}
			}
			if fetchSite := r.Header.Get("Sec-Fetch-Site"); fetchSite != "" && fetchSite != "same-origin" && fetchSite != "none" {
				writeError(w, 403, "请求来源无效")
				return
			}
		}
		mux.ServeHTTP(w, r)
	}), nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, 415, "请使用 JSON 格式提交")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		writeError(w, 400, "提交内容无效或超过大小限制")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err == nil || !errors.Is(err, io.EOF) {
		writeError(w, 400, "请仅提交一个 JSON 对象")
		return false
	}
	return true
}

func tokenHash(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func (s *Server) authenticated(r *http.Request) bool {
	cookie, err := r.Cookie("typoal_session")
	if err != nil || len(cookie.Value) != 64 {
		return false
	}
	var expires int64
	err = s.store.db.QueryRowContext(r.Context(), "SELECT expires_at FROM sessions WHERE token_hash=?", tokenHash(cookie.Value)).Scan(&expires)
	return err == nil && expires > time.Now().Unix()
}

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) bool {
	if !s.authenticated(r) {
		writeError(w, 401, "登录已过期，请重新登录")
		return false
	}
	return true
}

func (s *Server) setCookie(w http.ResponseWriter, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: "typoal_session", Value: value, Path: "/", MaxAge: age, Expires: time.Now().Add(time.Duration(age) * time.Second), HttpOnly: true, Secure: s.config.CookieSecure, SameSite: http.SameSiteStrictMode})
}

func (s *Server) checkPassword(password string) bool {
	s.authMu.RLock()
	hash := s.passwordHash
	s.authMu.RUnlock()
	return verifyPassword(hash, password)
}

// throttle counts an attempt for the client IP and reports whether it may
// proceed. It is shared by login and password changes so a logged-in attacker
// cannot brute-force the current password without limit.
func (s *Server) throttle(w http.ResponseWriter, r *http.Request) (string, bool) {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, value := range s.attempts {
		if now.After(value.until) {
			delete(s.attempts, key)
		}
	}
	a := s.attempts[ip]
	if a.count >= 10 {
		w.Header().Set("Retry-After", "300")
		writeError(w, 429, "尝试次数过多，请 5 分钟后再试")
		return ip, false
	}
	if a.count == 0 {
		a.until = now.Add(5 * time.Minute)
	}
	a.count++
	s.attempts[ip] = a
	return ip, true
}

func (s *Server) clearAttempts(ip string) {
	s.mu.Lock()
	delete(s.attempts, ip)
	s.mu.Unlock()
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &input) {
		return
	}
	ip, ok := s.throttle(w, r)
	if !ok {
		return
	}
	now := time.Now()
	if !s.checkPassword(input.Password) {
		writeError(w, 401, "密码不正确，请重试")
		return
	}
	token := randomID() + randomID()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "暂时无法登录")
		return
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), "DELETE FROM sessions WHERE expires_at<=?", now.Unix())
	if err == nil {
		// Retain a bounded number of active sessions for a single-author site.
		_, err = tx.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY expires_at DESC LIMIT -1 OFFSET 19)")
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES (?,?)", tokenHash(token), now.Add(7*24*time.Hour).Unix())
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "暂时无法登录")
		return
	}
	s.clearAttempts(ip)
	s.setCookie(w, token, 7*24*3600)
	writeJSON(w, 200, map[string]bool{"authenticated": true})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decode(w, r, &input) {
		return
	}
	if !validPassword(input.NewPassword) {
		writeError(w, 422, "新密码需要 12 到 512 个字节")
		return
	}
	if input.NewPassword == input.CurrentPassword {
		writeError(w, 422, "新密码不能与当前密码相同")
		return
	}
	ip, ok := s.throttle(w, r)
	if !ok {
		return
	}
	if !s.checkPassword(input.CurrentPassword) {
		// 403 keeps "wrong current password" distinct from an expired session,
		// so the dashboard can show either the field error or the login form.
		writeError(w, 403, "当前密码不正确")
		return
	}
	s.clearAttempts(ip)
	hash, err := hashPassword(input.NewPassword)
	if err != nil {
		writeError(w, 500, "暂时无法修改密码，请稍后重试")
		return
	}
	// Persist the new hash, drop every session, and issue a fresh one for this
	// device in a single transaction so no stale session survives the change.
	token := randomID() + randomID()
	tx, err := s.store.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, 500, "暂时无法修改密码，请稍后重试")
		return
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), "INSERT INTO settings(key,value) VALUES('password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", hash)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), "DELETE FROM sessions")
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), "INSERT INTO sessions(token_hash,expires_at) VALUES (?,?)", tokenHash(token), time.Now().Add(7*24*time.Hour).Unix())
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		writeError(w, 500, "暂时无法修改密码，请稍后重试")
		return
	}
	s.authMu.Lock()
	s.passwordHash = hash
	s.authMu.Unlock()
	s.setCookie(w, token, 7*24*3600)
	writeJSON(w, 200, map[string]bool{"authenticated": true})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("typoal_session"); err == nil {
		if _, err := s.store.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash=?", tokenHash(cookie.Value)); err != nil {
			writeError(w, 500, "暂时无法退出，请重试")
			return
		}
	}
	s.setCookie(w, "", -1)
	writeJSON(w, 200, map[string]bool{"authenticated": false})
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	private := r.URL.Query().Get("scope") == "all"
	if private && !s.authorize(w, r) {
		return
	}
	articles, err := s.store.List(r.Context(), private)
	if err != nil {
		slog.Error("list articles", "error", err)
		writeError(w, 500, "暂时无法读取文章")
		return
	}
	writeJSON(w, 200, articles)
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	private := r.URL.Query().Get("scope") == "all"
	if private && !s.authorize(w, r) {
		return
	}
	a, err := s.store.Get(r.Context(), r.PathValue("key"), private)
	if err != nil {
		writeError(w, 404, "文章不存在或尚未发布")
		return
	}
	writeJSON(w, 200, a)
}

func (s *Server) save(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	var in Input
	if !decode(w, r, &in) {
		return
	}
	if err := in.Validate(); err != nil {
		writeError(w, 422, err.Error())
		return
	}
	a, err := s.store.Save(r.Context(), r.PathValue("key"), in)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			writeError(w, 404, "文章不存在")
		default:
			slog.Error("save article", "error", err)
			writeError(w, 500, "保存失败，请稍后重试")
		}
		return
	}
	status := http.StatusOK
	if r.Method == "POST" {
		status = http.StatusCreated
	}
	writeJSON(w, status, a)
}

func (s *Server) delete(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	if err := s.store.Delete(r.Context(), r.PathValue("key")); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, 404, "文章不存在")
		} else {
			writeError(w, 500, "删除失败，请重试")
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description"`
	Date        string `xml:"pubDate"`
}

func (s *Server) feed(w http.ResponseWriter, r *http.Request) {
	articles, err := s.store.List(r.Context(), false)
	if err != nil {
		writeError(w, 500, "暂时无法生成订阅")
		return
	}
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	scheme := "http"
	if s.config.CookieSecure {
		scheme = "https"
	}
	base := scheme + "://" + host
	var feed struct {
		XMLName xml.Name `xml:"rss"`
		Version string   `xml:"version,attr"`
		Channel struct {
			Title       string    `xml:"title"`
			Link        string    `xml:"link"`
			Description string    `xml:"description"`
			Items       []rssItem `xml:"item"`
		} `xml:"channel"`
	}
	feed.Version, feed.Channel.Title, feed.Channel.Link, feed.Channel.Description = "2.0", s.config.SiteName, base, s.config.AuthorBio
	for _, a := range articles {
		date, _ := time.Parse(time.RFC3339Nano, a.PublishedAt)
		link := base + "/post/" + url.PathEscape(a.ID)
		feed.Channel.Items = append(feed.Channel.Items, rssItem{Title: a.Title, Link: link, GUID: a.ID, Description: a.Excerpt, Date: date.Format(time.RFC1123Z)})
	}
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Write([]byte(xml.Header))
	if err := xml.NewEncoder(w).Encode(feed); err != nil {
		slog.Error("encode feed", "error", err)
	}
}
