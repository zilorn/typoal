package blog

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func fixture(t *testing.T) (*Store, http.Handler) {
	t.Helper()
	s, err := OpenStore(filepath.Join(t.TempDir(), "blog.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, NewServer(s, Config{Password: "test-password-only", SiteName: "typoal"})
}

func request(h http.Handler, method, path, body, cookie string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		r.Header.Set("Cookie", cookie)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func login(t *testing.T, h http.Handler) string {
	t.Helper()
	w := request(h, "POST", "/api/auth/login", `{"password":"test-password-only"}`, "")
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	c := w.Result().Cookies()[0]
	if !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Fatal("unsafe cookie")
	}
	return c.Name + "=" + c.Value
}

func TestArticleLifecycleAndDraftPrivacy(t *testing.T) {
	_, h := fixture(t)
	body := `{"title":"第一篇文章","content":"# Hello","category":"技术","tags":["Go"],"cover":"code","status":"draft","featured":false}`
	if w := request(h, "POST", "/api/articles", body, ""); w.Code != 401 {
		t.Fatal("anonymous create allowed")
	}
	if w := request(h, "GET", "/api/articles?scope=all", "", ""); w.Code != 401 {
		t.Fatal("private listing exposed")
	}
	cookie := login(t, h)
	w := request(h, "POST", "/api/articles", body, cookie)
	if w.Code != 201 {
		t.Fatalf("create: %s", w.Body.String())
	}
	var a Article
	json.Unmarshal(w.Body.Bytes(), &a)
	if a.ID == "" {
		t.Fatal("missing id")
	}
	if w := request(h, "GET", "/api/articles/"+a.ID, "", ""); w.Code != 404 {
		t.Fatal("draft exposed by ID")
	}
	if w := request(h, "GET", "/api/articles/"+a.ID, "", cookie); w.Code != 404 {
		t.Fatal("public route exposes draft to logged-in author")
	}
	if w := request(h, "GET", "/api/articles/"+a.ID+"?scope=all", "", cookie); w.Code != 200 {
		t.Fatal("author cannot read draft")
	}
	if w := request(h, "GET", "/api/articles", "", ""); strings.Contains(w.Body.String(), a.ID) {
		t.Fatal("draft exposed in public list")
	}
	if w := request(h, "GET", "/api/feed.xml", "", ""); strings.Contains(w.Body.String(), "第一篇") {
		t.Fatal("draft exposed in RSS")
	}
	if w := request(h, "PUT", "/api/articles/"+a.ID, strings.Replace(body, `"draft"`, `"published"`, 1), cookie); w.Code != 200 {
		t.Fatalf("publish: %s", w.Body.String())
	}
	if w := request(h, "GET", "/api/articles/"+a.ID, "", ""); w.Code != 200 {
		t.Fatal("published article missing")
	}
	updatedBody := strings.Replace(strings.Replace(body, `"draft"`, `"published"`, 1), "第一篇文章", "更改后的标题", 1)
	updated := request(h, "PUT", "/api/articles/"+a.ID, updatedBody, cookie)
	var edited Article
	json.Unmarshal(updated.Body.Bytes(), &edited)
	if updated.Code != 200 || edited.ID != a.ID {
		t.Fatal("editing title changed the article ID")
	}
	feed := request(h, "GET", "/api/feed.xml", "", "")
	if !strings.Contains(feed.Body.String(), "/post/"+a.ID) {
		t.Fatal("RSS must use article ID URLs")
	}

	if w := request(h, "DELETE", "/api/articles/"+a.ID, "", ""); w.Code != 401 {
		t.Fatal("anonymous delete allowed")
	}
	if w := request(h, "DELETE", "/api/articles/"+a.ID, "", cookie); w.Code != 204 {
		t.Fatal("delete failed")
	}
	if w := request(h, "GET", "/api/articles/"+a.ID, "", ""); w.Code != 404 {
		t.Fatal("deleted article retained")
	}
	request(h, "POST", "/api/auth/logout", "", cookie)
	if w := request(h, "GET", "/api/articles?scope=all", "", cookie); w.Code != 401 {
		t.Fatal("logout did not invalidate session")
	}
}

func TestValidationAndCrossOrigin(t *testing.T) {
	_, h := fixture(t)
	cookie := login(t, h)
	for _, body := range []string{`{}`, `{"title":"Hello","content":"text","status":"unknown"}`, `{"title":"Hello","content":"text","status":"draft","unexpected":true}`, `{} {}`} {
		w := request(h, "POST", "/api/articles", body, cookie)
		if w.Code < 400 {
			t.Fatalf("invalid request accepted: %s", body)
		}
	}
	r := httptest.NewRequest("POST", "http://example.com/api/auth/logout", nil)
	r.Header.Set("Origin", "http://evil.example")
	r.Header.Set("Cookie", cookie)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("cross-origin mutation allowed")
	}
	r = httptest.NewRequest("POST", "http://example.com/api/auth/logout", nil)
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("cross-site mutation allowed")
	}
}

func TestLoginRateLimit(t *testing.T) {
	_, h := fixture(t)
	for i := 0; i < 10; i++ {
		if w := request(h, "POST", "/api/auth/login", `{"password":"wrong"}`, ""); w.Code != 401 {
			t.Fatalf("attempt %d: %d", i, w.Code)
		}
	}
	if w := request(h, "POST", "/api/auth/login", `{"password":"wrong"}`, ""); w.Code != 429 {
		t.Fatal("login not rate limited")
	}
}

func TestPersistenceAndEmptyInitialStore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persistent.db")
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	articles, _ := s.List(context.Background(), false)
	if len(articles) != 0 {
		t.Fatal("new deployment must start without articles")
	}
	h := NewServer(s, Config{Password: "test-password-only"})
	cookie := login(t, h)
	a, err := s.Save(context.Background(), "", Input{Title: "Persistent", Content: "text", Status: "published"})
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	h = NewServer(s, Config{Password: "test-password-only"})
	if w := request(h, "GET", "/api/articles?scope=all", "", cookie); w.Code != 200 {
		t.Fatal("session did not persist")
	}
	articles, _ = s.List(context.Background(), false)
	if len(articles) != 1 || articles[0].ID != a.ID {
		t.Fatal("article did not persist")
	}
	if err = s.Delete(context.Background(), a.ID); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	articles, _ = s.List(context.Background(), true)
	if len(articles) != 0 {
		t.Fatal("deleted content reappeared after restart")
	}
}

func TestConcurrentWrites(t *testing.T) {
	s, _ := fixture(t)
	errors := make(chan error, 12)
	for i := 0; i < 12; i++ {
		go func(i int) {
			_, err := s.Save(context.Background(), "", Input{Title: fmt.Sprintf("Post %d", i), Content: "text", Status: "published"})
			errors <- err
		}(i)
	}
	for i := 0; i < 12; i++ {
		if err := <-errors; err != nil {
			t.Fatal(err)
		}
	}
	articles, _ := s.List(context.Background(), false)
	if len(articles) != 12 {
		t.Fatal("concurrent writes lost")
	}
}
