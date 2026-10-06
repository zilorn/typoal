package blog

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func pngFixture(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var data bytes.Buffer
	if err := png.Encode(&data, img); err != nil {
		t.Fatal(err)
	}
	return data.Bytes()
}
func uploadRequest(h http.Handler, cookie, group string, data []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "/api/images?group="+group, bytes.NewReader(data))
	r.Header.Set("Content-Type", "image/png")
	r.Header.Set("Cookie", cookie)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func uploadFixture(t *testing.T, h http.Handler, cookie, group string) string {
	t.Helper()
	w := uploadRequest(h, cookie, group, pngFixture(t))
	if w.Code != 201 {
		t.Fatalf("upload: %d %s", w.Code, w.Body.String())
	}
	var result struct {
		URL string `json:"url"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	return result.URL
}
func imageSave(t *testing.T, h http.Handler, cookie, id, group, content, status string) Article {
	t.Helper()
	data, _ := json.Marshal(Input{Title: "Image article", Content: content, UploadGroup: group, Status: status})
	method, path := "POST", "/api/articles"
	if id != "" {
		method, path = "PUT", path+"/"+id
	}
	w := request(h, method, path, string(data), cookie)
	if w.Code != 200 && w.Code != 201 {
		t.Fatalf("save: %d %s", w.Code, w.Body.String())
	}
	var a Article
	json.Unmarshal(w.Body.Bytes(), &a)
	return a
}
func assertImageFile(t *testing.T, s *Store, src string, exists bool) {
	t.Helper()
	ref, ok := parseImageRef(src)
	if !ok {
		t.Fatalf("bad image url %q", src)
	}
	_, err := os.Stat(s.imagePath(ref))
	if exists && err != nil {
		t.Fatal(err)
	}
	if !exists && !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("image should be removed: %s (%v)", src, err)
	}
}

func TestImageLifecycle(t *testing.T) {
	s, h := fixture(t)
	cookie := login(t, h)
	group := randomID()
	used := uploadFixture(t, h, cookie, group)
	unused := uploadFixture(t, h, cookie, group)
	if w := request(h, "GET", used, "", ""); w.Code != 401 {
		t.Fatal("temporary image is public")
	}
	if w := request(h, "GET", used, "", cookie); w.Code != 200 || !bytes.Equal(w.Body.Bytes(), pngFixture(t)) {
		t.Fatal("uploaded image cannot be previewed")
	}
	// Reference images count; plain links, unused definitions, and code do not.
	content := "![caption][picture]\n\n[picture]: " + used + "\n\n[unused]: " + unused + "\n\n[download](" + unused + ")\n\n```md\n![example](" + unused + ")\n```"
	a := imageSave(t, h, cookie, "", group, content, "draft")
	draftRefs, err := articleImageRefs(a.Content)
	if err != nil || len(draftRefs) != 1 {
		t.Fatalf("draft refs: %v %v", draftRefs, err)
	}
	draftURL := draftRefs[0].url
	if draftRefs[0].kind != "temp" || draftRefs[0].owner != a.ID {
		t.Fatal("draft image lost temporary ownership")
	}
	assertImageFile(t, s, used, false)
	assertImageFile(t, s, unused, false)
	assertImageFile(t, s, draftURL, true)
	if w := request(h, "GET", draftURL, "", ""); w.Code != 401 {
		t.Fatal("draft image is public")
	}
	a = imageSave(t, h, cookie, a.ID, "", a.Content, "published")
	refs, _ := articleImageRefs(a.Content)
	publishedURL := refs[0].url
	if refs[0].kind != "articles" || refs[0].owner != a.ID {
		t.Fatal("published image not in article directory")
	}
	assertImageFile(t, s, draftURL, false)
	assertImageFile(t, s, publishedURL, true)
	if w := request(h, "GET", publishedURL, "", ""); w.Code != 200 {
		t.Fatal("published image not public")
	}
	a = imageSave(t, h, cookie, a.ID, "", a.Content, "draft")
	if w := request(h, "GET", publishedURL, "", ""); w.Code != 404 {
		t.Fatal("withdrawn article image is public")
	}
	if w := request(h, "GET", publishedURL, "", cookie); w.Code != 200 {
		t.Fatal("author cannot preview withdrawn image")
	}
	group = randomID()
	removed := uploadFixture(t, h, cookie, group)
	a = imageSave(t, h, cookie, a.ID, group, "Image removed from content", "published")
	assertImageFile(t, s, publishedURL, false)
	assertImageFile(t, s, removed, false)
	group = randomID()
	used = uploadFixture(t, h, cookie, group)
	a = imageSave(t, h, cookie, a.ID, group, "![again]("+used+")", "published")
	refs, _ = articleImageRefs(a.Content)
	publishedURL = refs[0].url
	if w := request(h, "DELETE", "/api/articles/"+a.ID, "", cookie); w.Code != 204 {
		t.Fatal(w.Body.String())
	}
	assertImageFile(t, s, publishedURL, false)
	for _, kind := range []string{"temp", "articles", "trash"} {
		if _, err := os.Stat(filepath.Join(s.imagesDir, kind, a.ID)); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("article directory remains", kind, err)
		}
	}
}

func TestImageUploadValidationAndOwnership(t *testing.T) {
	s, h := fixture(t)
	cookie := login(t, h)
	group := randomID()
	if w := uploadRequest(h, "", group, pngFixture(t)); w.Code != 401 {
		t.Fatal("anonymous upload allowed")
	}
	for _, data := range [][]byte{[]byte("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), pngFixture(t)[:30]} {
		if w := uploadRequest(h, cookie, group, data); w.Code < 400 {
			t.Fatal("invalid file accepted")
		}
	}
	oversized := httptest.NewRequest("POST", "/api/images?group="+group, strings.NewReader("unread"))
	oversized.Header.Set("Cookie", cookie)
	oversized.ContentLength = maxImageBytes + 1
	tooLarge := httptest.NewRecorder()
	h.ServeHTTP(tooLarge, oversized)
	if tooLarge.Code != 413 || !strings.Contains(tooLarge.Body.String(), "300 MB") {
		t.Fatal("oversized upload must be rejected before reading the body", tooLarge.Code)
	}
	if w := uploadRequest(h, cookie, "../../escape", pngFixture(t)); w.Code != 422 {
		t.Fatal("invalid group accepted")
	}
	r := httptest.NewRequest("POST", "http://example.com/api/images?group="+group, bytes.NewReader(pngFixture(t)))
	r.Header.Set("Cookie", cookie)
	r.Header.Set("Origin", "https://evil.example")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("cross origin upload allowed")
	}
	src := uploadFixture(t, h, cookie, group)
	encoded := strings.ReplaceAll(src, "/", "&#47;")
	if _, err := s.Save(context.Background(), "", Input{Title: "Encoded URL", Content: "<img src='" + encoded + "'>\n\n`" + src + "`", UploadGroup: group, Status: "published"}); !errors.Is(err, ErrImage) {
		t.Fatal("encoded reference must not save a broken URL", err)
	}
	assertImageFile(t, s, src, true)
	first := imageSave(t, h, cookie, "", group, "![own]("+src+")", "draft")
	refs, _ := articleImageRefs(first.Content)
	data, _ := json.Marshal(Input{Title: "Other article", Content: "![foreign](" + refs[0].url + ")", UploadGroup: first.ID, Status: "published"})
	w = request(h, "POST", "/api/articles", string(data), cookie)
	if w.Code != 422 {
		t.Fatalf("cross article image allowed: %d %s", w.Code, w.Body.String())
	}
	assertImageFile(t, s, refs[0].url, true)
	if w := uploadRequest(h, cookie, first.ID, pngFixture(t)); w.Code != 422 {
		t.Fatal("upload into saved article group allowed")
	}
	if w := request(h, "DELETE", "/api/articles/"+first.ID, "", cookie); w.Code != 204 {
		t.Fatal(w.Body.String())
	}
	assertImageFile(t, s, refs[0].url, false)
}

func TestImageSaveAndDeleteFailuresPreserveFiles(t *testing.T) {
	s, h := fixture(t)
	cookie := login(t, h)
	group := randomID()
	src := uploadFixture(t, h, cookie, group)
	// A rejected SQLite write must neither remove the upload nor leave a copy.
	if _, err := s.db.Exec(`CREATE TRIGGER reject_save BEFORE INSERT ON articles BEGIN SELECT RAISE(FAIL,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	_, err := s.Save(context.Background(), "", Input{Title: "Fail", Content: "![image](" + src + ")", UploadGroup: group, Status: "published"})
	if err == nil {
		t.Fatal("expected database failure")
	}
	assertImageFile(t, s, src, true)
	entries, _ := os.ReadDir(filepath.Join(s.imagesDir, "articles"))
	for _, entry := range entries {
		files, _ := os.ReadDir(filepath.Join(s.imagesDir, "articles", entry.Name()))
		if len(files) != 0 {
			t.Fatal("failed save left files")
		}
	}
	s.db.Exec("DROP TRIGGER reject_save")
	a := imageSave(t, h, cookie, "", group, "![image]("+src+")", "published")
	refs, _ := articleImageRefs(a.Content)
	s.db.Exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON articles BEGIN SELECT RAISE(FAIL,'test failure'); END`)
	if err := s.Delete(context.Background(), a.ID); err == nil {
		t.Fatal("expected delete failure")
	}
	assertImageFile(t, s, refs[0].url, true)
	if w := request(h, "GET", refs[0].url, "", ""); w.Code != 200 {
		t.Fatal("failed delete damaged image")
	}
}

func TestImagePersistenceExpirationAndDeletionRecovery(t *testing.T) {
	path := filepath.Join(t.TempDir(), "blog.db")
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewServer(s, Config{Password: "test-password-only"})
	if err != nil {
		t.Fatal(err)
	}
	cookie := login(t, h)
	group := randomID()
	src := uploadFixture(t, h, cookie, group)
	a := imageSave(t, h, cookie, "", group, "![saved]("+src+")", "draft")
	refs, _ := articleImageRefs(a.Content)
	abandonedGroup := randomID()
	abandoned := uploadFixture(t, h, cookie, abandonedGroup)
	old := time.Now().Add(-48 * time.Hour)
	os.Chtimes(filepath.Join(s.imagesDir, "temp", a.ID), old, old)
	os.Chtimes(filepath.Join(s.imagesDir, "temp", abandonedGroup), old, old)
	if err := s.CleanupImages(context.Background()); err != nil {
		t.Fatal(err)
	}
	assertImageFile(t, s, abandoned, false)
	assertImageFile(t, s, refs[0].url, true)
	// Simulate a process exiting between hiding files and committing deletion.
	if _, _, err := s.stageImageDeletion(a.ID); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	h, err = NewServer(s, Config{})
	if err != nil {
		t.Fatal(err)
	}
	assertImageFile(t, s, refs[0].url, true)
	if w := request(h, "GET", refs[0].url, "", cookie); w.Code != 200 {
		t.Fatal("image/session lost after restart")
	}
	// A committed deletion leaves only trash, which startup must remove.
	if _, _, err := s.stageImageDeletion(a.ID); err != nil {
		t.Fatal(err)
	}
	s.db.Exec("DELETE FROM articles WHERE id=?", a.ID)
	if err := s.CleanupImages(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(s.imagesDir, "trash", a.ID)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("deletion trash remains")
	}
}

func TestOnlyRenderedImagesRetainUploads(t *testing.T) {
	src := imageURL("temp", randomID(), randomID()+".png")
	for _, content := range []string{"[link](" + src + ")", "`![code](" + src + ")`", "```\n![code](" + src + ")\n```", "[unused]: " + src, "<!-- <img src='" + src + "'> -->", "<script>const x = \"<img src='" + src + "'>\";</script>"} {
		refs, err := articleImageRefs(content)
		if err != nil || len(refs) != 0 {
			t.Fatalf("unexpected refs: %s %v %v", content, refs, err)
		}
	}
	for _, content := range []string{"![inline](" + src + ")", "![ref][img]\n\n[img]: <" + src + "> \"title\"", "<img src='" + src + "'>", "| photo |\n| --- |\n| ![table](" + src + ") |"} {
		refs, err := articleImageRefs(content)
		if err != nil || len(refs) != 1 || !strings.EqualFold(refs[0].url, src) {
			t.Fatalf("missing refs: %s %v %v", content, refs, err)
		}
	}
}
