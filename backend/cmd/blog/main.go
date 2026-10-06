package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"typoal/blog/internal/blog"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	store, err := blog.OpenStore(env("DATABASE_PATH", "./data/blog.db"))
	if err != nil {
		slog.Error("open database", "error", err)
		os.Exit(1)
	}
	defer store.Close()
	handler, err := blog.NewServer(store, blog.Config{Password: os.Getenv("ADMIN_PASSWORD"), ResetPassword: env("ADMIN_PASSWORD_RESET", "false") == "true", CookieSecure: env("COOKIE_SECURE", "false") == "true", SiteName: env("SITE_NAME", "typoal"), AuthorName: env("AUTHOR_NAME", "typoal 作者"), AuthorBio: env("AUTHOR_BIO", "一个热爱创造的人，记录技术、生活与沿途的风景。")})
	if err != nil {
		slog.Error("initialize server", "error", err)
		os.Exit(1)
	}
	server := &http.Server{
		Addr:              env("API_ADDR", "0.0.0.0:8080"),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			slog.Error("shutdown", "error", err)
		}
	}()
	slog.Info("blog API ready", "address", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("serve API", "error", err)
		os.Exit(1)
	}
}
