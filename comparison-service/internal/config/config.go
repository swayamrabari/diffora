package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config is loaded once at startup. Every value is validated before the
// service begins listening.
type Config struct {
	Port                 string
	SharedSecret         string
	OasdiffBin           string
	ValidateTimeout      time.Duration
	DiffTimeout          time.Duration
	MaxRequestBytes      int64
	MaxEngineStdoutBytes int64
	MaxChanges           int
}

func Load() (Config, error) {
	c := Config{
		Port:         env("PORT", "8080"),
		SharedSecret: os.Getenv("SHARED_SECRET"),
		OasdiffBin:   env("OASDIFF_BIN", "oasdiff"),
	}

	var err error
	if c.ValidateTimeout, err = envSeconds("VALIDATE_TIMEOUT_SECONDS", 20); err != nil {
		return Config{}, err
	}
	if c.DiffTimeout, err = envSeconds("DIFF_TIMEOUT_SECONDS", 60); err != nil {
		return Config{}, err
	}
	if c.MaxRequestBytes, err = envInt64("MAX_REQUEST_BYTES", 20*1024*1024); err != nil {
		return Config{}, err
	}
	if c.MaxEngineStdoutBytes, err = envInt64("MAX_ENGINE_STDOUT_BYTES", 32*1024*1024); err != nil {
		return Config{}, err
	}
	if c.MaxChanges, err = envInt("MAX_CHANGES", 5000); err != nil {
		return Config{}, err
	}

	if c.SharedSecret == "" {
		return Config{}, fmt.Errorf("SHARED_SECRET is required")
	}
	if c.OasdiffBin == "" {
		return Config{}, fmt.Errorf("OASDIFF_BIN is required")
	}
	if c.MaxRequestBytes <= 0 || c.MaxEngineStdoutBytes <= 0 {
		return Config{}, fmt.Errorf("size limits must be positive")
	}
	if c.MaxChanges <= 0 {
		return Config{}, fmt.Errorf("MAX_CHANGES must be positive")
	}

	return c, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envSeconds(key string, fallback int) (time.Duration, error) {
	value, err := envInt(key, fallback)
	if err != nil {
		return 0, err
	}
	if value <= 0 {
		return 0, fmt.Errorf("%s must be positive", key)
	}
	return time.Duration(value) * time.Second, nil
}

func envInt(key string, fallback int) (int, error) {
	raw := env(key, strconv.Itoa(fallback))
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return value, nil
}

func envInt64(key string, fallback int64) (int64, error) {
	raw := env(key, strconv.FormatInt(fallback, 10))
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return value, nil
}
