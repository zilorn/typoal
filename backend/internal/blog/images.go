package blog

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
	nethtml "golang.org/x/net/html"
)

const maxImageBytes = 10 * 1024 * 1024

var ErrImage = errors.New("invalid image reference")

func validImageID(id string) bool {
	if len(id) != 32 {
		return false
	}
	for _, c := range id {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

type imageRef struct{ kind, owner, name, url string }

func parseImageRef(src string) (imageRef, bool) {
	parts := strings.Split(src, "/")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "api" || parts[2] != "images" || (parts[3] != "temp" && parts[3] != "articles") || !validImageID(parts[4]) {
		return imageRef{}, false
	}
	ext := filepath.Ext(parts[5])
	if (ext != ".png" && ext != ".jpg" && ext != ".gif") || !validImageID(strings.TrimSuffix(parts[5], ext)) {
		return imageRef{}, false
	}
	return imageRef{parts[3], parts[4], parts[5], src}, true
}

// Parse rendered image elements so code blocks, ordinary links, and unused
// reference definitions do not retain files. Rendering is only for analysis;
// the frontend still uses its shared HTML sanitizer for every preview/post.
func articleImageRefs(content string) ([]imageRef, error) {
	var rendered bytes.Buffer
	md := goldmark.New(goldmark.WithExtensions(extension.GFM), goldmark.WithRendererOptions(html.WithUnsafe()))
	if err := md.Convert([]byte(content), &rendered); err != nil {
		return nil, err
	}
	tokens := nethtml.NewTokenizer(&rendered)
	refs := []imageRef{}
	seen := map[string]bool{}
	for {
		tt := tokens.Next()
		if tt == nethtml.ErrorToken {
			if tokens.Err() == io.EOF {
				return refs, nil
			}
			return nil, tokens.Err()
		}
		if tt != nethtml.StartTagToken && tt != nethtml.SelfClosingTagToken {
			continue
		}
		token := tokens.Token()
		if token.Data != "img" {
			continue
		}
		for _, attr := range token.Attr {
			if attr.Key != "src" || !strings.HasPrefix(attr.Val, "/api/images/") {
				continue
			}
			ref, ok := parseImageRef(attr.Val)
			if !ok {
				return nil, fmt.Errorf("%w: 图片链接无效", ErrImage)
			}
			if !seen[ref.url] {
				refs = append(refs, ref)
				seen[ref.url] = true
			}
		}
	}
}
func (s *Store) imagePath(ref imageRef) string {
	return filepath.Join(s.imagesDir, ref.kind, ref.owner, ref.name)
}
func imageURL(kind, owner, name string) string {
	return "/api/images/" + kind + "/" + owner + "/" + name
}

func (s *Server) uploadImage(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r) {
		return
	}
	group := r.URL.Query().Get("group")
	if !validImageID(group) {
		writeError(w, 422, "图片上传分组无效")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, 413, "图片不能超过 10 MB")
		return
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		writeError(w, 422, "请选择有效的 PNG、JPEG 或 GIF 图片，像素总数不能超过 4000 万")
		return
	}
	// Decode as well as sniffing the header; truncated files must not be stored.
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		writeError(w, 422, "图片文件已损坏，请重新选择")
		return
	}
	ext := map[string]string{"png": ".png", "jpeg": ".jpg", "gif": ".gif"}[format]
	if ext == "" {
		writeError(w, 422, "仅支持 PNG、JPEG 和 GIF 图片")
		return
	}
	s.store.imageMu.Lock()
	defer s.store.imageMu.Unlock()
	if _, err := s.store.Get(r.Context(), group, true); !errors.Is(err, ErrNotFound) {
		writeError(w, 422, "请使用新的图片上传分组")
		return
	}
	ref := imageRef{kind: "temp", owner: group, name: randomID() + ext}
	dir := filepath.Dir(s.store.imagePath(ref))
	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		writeError(w, 500, "暂时无法读取图片目录")
		return
	}
	if len(entries) >= 100 {
		writeError(w, 422, "一次编辑最多上传 100 张图片，请先保存文章")
		return
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		writeError(w, 500, "暂时无法创建图片目录")
		return
	}
	if err := os.WriteFile(s.store.imagePath(ref), data, 0o640); err != nil {
		writeError(w, 500, "图片保存失败，请重试")
		return
	}
	// Refresh the group age when a new upload is added.
	now := time.Now()
	_ = os.Chtimes(dir, now, now)
	writeJSON(w, 201, map[string]string{"url": imageURL(ref.kind, ref.owner, ref.name)})
}

func (s *Server) getImage(w http.ResponseWriter, r *http.Request) {
	ref, ok := parseImageRef(r.URL.Path)
	if !ok {
		writeError(w, 404, "图片不存在")
		return
	}
	s.store.imageMu.RLock()
	defer s.store.imageMu.RUnlock()
	if ref.kind == "temp" {
		if !s.authorize(w, r) {
			return
		}
	} else {
		if _, err := s.store.Get(r.Context(), ref.owner, s.authenticated(r)); err != nil {
			writeError(w, 404, "图片不存在或文章尚未发布")
			return
		}
	}
	f, err := os.Open(s.store.imagePath(ref))
	if err != nil {
		writeError(w, 404, "图片不存在")
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		writeError(w, 500, "暂时无法读取图片")
		return
	}
	w.Header().Set("Content-Type", map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif"}[filepath.Ext(ref.name)])
	http.ServeContent(w, r, ref.name, info.ModTime(), f)
}

// Copy before the DB write, retaining temporary sources for failed saves. Only
// newly created destinations are rolled back, never an existing article image.
func (s *Store) prepareImages(ctx context.Context, a *Article, group string) (func(), error) {
	created := []string{}
	rollback := func() {
		for _, path := range created {
			_ = os.Remove(path)
		}
	}
	fail := func(err error) (func(), error) { rollback(); return func() {}, err }
	if group != "" && group != a.ID {
		if _, err := s.Get(ctx, group, true); !errors.Is(err, ErrNotFound) {
			return fail(fmt.Errorf("%w: 图片上传分组已属于其他文章", ErrImage))
		}
	}
	refs, err := articleImageRefs(a.Content)
	if err != nil {
		return fail(err)
	}
	for _, ref := range refs {
		if ref.owner != a.ID && !(ref.kind == "temp" && ref.owner == group) {
			return fail(fmt.Errorf("%w: 请上传这篇文章自己的图片", ErrImage))
		}
		data, err := os.ReadFile(s.imagePath(ref))
		if err != nil {
			return fail(fmt.Errorf("%w: 图片已失效，请重新上传", ErrImage))
		}
		kind := ref.kind
		if a.Status == "published" {
			kind = "articles"
		}
		target := imageRef{kind: kind, owner: a.ID, name: ref.name}
		if target.kind == ref.kind && target.owner == ref.owner {
			continue
		}
		path := s.imagePath(target)
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return fail(err)
		}
		f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
		if errors.Is(err, os.ErrExist) {
			existing, readErr := os.ReadFile(path)
			if readErr != nil || !bytes.Equal(existing, data) {
				return fail(errors.New("图片文件冲突，请重新上传"))
			}
		} else if err != nil {
			return fail(err)
		} else {
			created = append(created, path)
			_, writeErr := f.Write(data)
			closeErr := f.Close()
			if writeErr != nil {
				return fail(writeErr)
			}
			if closeErr != nil {
				return fail(closeErr)
			}
		}
		if !strings.Contains(a.Content, ref.url) {
			return fail(fmt.Errorf("%w: 请使用上传时生成的原始图片链接", ErrImage))
		}
		a.Content = strings.ReplaceAll(a.Content, ref.url, imageURL(kind, a.ID, ref.name))
		a.Excerpt = strings.ReplaceAll(a.Excerpt, ref.url, imageURL(kind, a.ID, ref.name))
	}
	finalRefs, err := articleImageRefs(a.Content)
	if err != nil {
		return fail(err)
	}
	for _, ref := range finalRefs {
		if ref.owner != a.ID || (a.Status == "published" && ref.kind != "articles") {
			return fail(fmt.Errorf("%w: 请使用上传时生成的原始图片链接", ErrImage))
		}
	}
	return rollback, nil
}

func (s *Store) cleanArticleImages(a Article, group string) error {
	refs, err := articleImageRefs(a.Content)
	if err != nil {
		return err
	}
	keep := map[string]bool{}
	for _, ref := range refs {
		keep[s.imagePath(ref)] = true
	}
	for _, kind := range []string{"temp", "articles"} {
		dir := filepath.Join(s.imagesDir, kind, a.ID)
		entries, err := os.ReadDir(dir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		for _, entry := range entries {
			path := filepath.Join(dir, entry.Name())
			if !keep[path] {
				if err := os.Remove(path); err != nil {
					return err
				}
			}
		}
	}
	if group != "" && group != a.ID {
		return os.RemoveAll(filepath.Join(s.imagesDir, "temp", group))
	}
	return nil
}

func (s *Store) stageImageDeletion(id string) (func(), func() error, error) {
	moved := map[string]string{}
	restore := func() {
		for source, target := range moved {
			_ = os.Rename(target, source)
		}
	}
	trash := filepath.Join(s.imagesDir, "trash", id)
	for _, kind := range []string{"temp", "articles"} {
		source := filepath.Join(s.imagesDir, kind, id)
		if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			restore()
			return func() {}, nil, err
		}
		if err := os.MkdirAll(trash, 0o750); err != nil {
			restore()
			return func() {}, nil, err
		}
		target := filepath.Join(trash, kind)
		if err := os.Rename(source, target); err != nil {
			restore()
			return func() {}, nil, err
		}
		moved[source] = target
	}
	return restore, func() error { return os.RemoveAll(trash) }, nil
}

// Recover interrupted deletions and remove abandoned uploads after 24 hours.
// Images referenced by saved drafts never expire.
func (s *Store) CleanupImages(ctx context.Context) error {
	s.imageMu.Lock()
	defer s.imageMu.Unlock()
	return s.cleanupImages(ctx)
}
func (s *Store) cleanupImages(ctx context.Context) error {
	entries, err := os.ReadDir(filepath.Join(s.imagesDir, "trash"))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, entry := range entries {
		if !validImageID(entry.Name()) {
			continue
		}
		dir := filepath.Join(s.imagesDir, "trash", entry.Name())
		_, err := s.Get(ctx, entry.Name(), true)
		if err == nil {
			for _, kind := range []string{"temp", "articles"} {
				source := filepath.Join(dir, kind)
				if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) {
					continue
				} else if err != nil {
					return err
				}
				target := filepath.Join(s.imagesDir, kind, entry.Name())
				if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
					return err
				}
				if err := os.Rename(source, target); err != nil {
					return err
				}
			}
		} else if !errors.Is(err, ErrNotFound) {
			return err
		}
		if err := os.RemoveAll(dir); err != nil {
			return err
		}
	}
	entries, err = os.ReadDir(filepath.Join(s.imagesDir, "temp"))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, entry := range entries {
		if !validImageID(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if time.Since(info.ModTime()) < 24*time.Hour {
			continue
		}
		_, err = s.Get(ctx, entry.Name(), true)
		if errors.Is(err, ErrNotFound) {
			if err := os.RemoveAll(filepath.Join(s.imagesDir, "temp", entry.Name())); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}
	// Reconcile article directories with the committed Markdown after a crash
	// between the SQLite write and filesystem cleanup.
	checked := map[string]bool{}
	for _, kind := range []string{"temp", "articles"} {
		entries, err := os.ReadDir(filepath.Join(s.imagesDir, kind))
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		for _, entry := range entries {
			id := entry.Name()
			if !validImageID(id) || checked[id] {
				continue
			}
			a, err := s.Get(ctx, id, true)
			if err == nil {
				if err := s.cleanArticleImages(a, ""); err != nil {
					return err
				}
				checked[id] = true
			} else if errors.Is(err, ErrNotFound) {
				if kind == "articles" {
					if err := os.RemoveAll(filepath.Join(s.imagesDir, kind, id)); err != nil {
						return err
					}
				}
			} else {
				return err
			}
		}
	}
	return nil
}
