package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"time"

	"diffora/comparison-service/internal/config"
	"diffora/comparison-service/internal/httpapi"
	"diffora/comparison-service/internal/oasdiff"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration", "error", err)
		os.Exit(1)
	}

	bin, err := exec.LookPath(cfg.OasdiffBin)
	if err != nil {
		logger.Error("oasdiff not found", "error", err)
		os.Exit(1)
	}

	runner := oasdiff.New(bin, cfg.MaxEngineStdoutBytes)
	versionContext, cancelVersion := context.WithTimeout(context.Background(), 10*time.Second)
	engineVersion, err := runner.Version(versionContext)
	cancelVersion()
	if err != nil {
		logger.Error("oasdiff version", "error", err)
		os.Exit(1)
	}

	api := httpapi.New(cfg, runner, engineVersion, logger)
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		logger.Info("listening", "port", cfg.Port, "engine_version", engineVersion)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, shutdownSignals()...)
	<-stop

	logger.Info("shutting down")
	shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(shutdownContext); err != nil {
		logger.Error("shutdown", "error", err)
	}
}
