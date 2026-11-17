package oasdiff

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Result is the outcome of one engine invocation. A non-zero engine exit is
// represented in ExitCode, not as a Go error.
type Result struct {
	Stdout          []byte
	ExitCode        int
	TimedOut        bool
	StdoutTruncated bool
}

type Runner struct {
	Bin       string
	MaxStdout int64
}

func New(bin string, maxStdout int64) *Runner {
	return &Runner{Bin: bin, MaxStdout: maxStdout}
}

// Run executes the pinned engine with fixed arguments. It never uses a shell
// and never interpolates user text into arguments.
func (r *Runner) Run(ctx context.Context, dir string, timeout time.Duration, args ...string) (Result, error) {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(runCtx, r.Bin, args...)
	cmd.Dir = dir
	cmd.Env = minimalEnv(dir)
	cmd.Stdin = nil
	cmd.WaitDelay = 5 * time.Second
	configureProcess(cmd)

	stdout := newLimitedBuffer(r.MaxStdout)
	cmd.Stdout = stdout
	cmd.Stderr = nil
	cmd.Cancel = func() error {
		return killProcess(cmd)
	}

	err := cmd.Run()
	result := Result{
		Stdout:          stdout.Bytes(),
		StdoutTruncated: stdout.Truncated(),
	}

	if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
		result.TimedOut = true
		return result, nil
	}
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
		return result, err
	}
	return result, nil
}

func (r *Runner) Version(ctx context.Context) (string, error) {
	result, err := r.Run(ctx, os.TempDir(), 10*time.Second, "--version")
	if err != nil {
		return "", err
	}
	if result.TimedOut {
		return "", fmt.Errorf("oasdiff --version timed out")
	}
	if result.ExitCode != 0 {
		return "", fmt.Errorf("oasdiff --version exited with code %d", result.ExitCode)
	}

	fields := strings.Fields(strings.TrimSpace(string(result.Stdout)))
	if len(fields) == 0 {
		return "", fmt.Errorf("oasdiff --version returned no version")
	}
	version := fields[len(fields)-1]
	if version == "" {
		return "", fmt.Errorf("oasdiff --version returned an empty version")
	}
	return version, nil
}

func minimalEnv(dir string) []string {
	env := []string{
		"HOME=" + dir,
		"TMPDIR=" + dir,
		"TEMP=" + dir,
		"TMP=" + dir,
	}
	for _, key := range []string{"PATH", "SystemRoot", "USERPROFILE"} {
		if value, ok := os.LookupEnv(key); ok {
			env = append(env, key+"="+value)
		}
	}
	return env
}

type limitedBuffer struct {
	buffer    bytes.Buffer
	max       int64
	truncated bool
}

func newLimitedBuffer(max int64) *limitedBuffer {
	return &limitedBuffer{max: max}
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.max <= 0 {
		b.buffer.Write(p)
		return len(p), nil
	}
	remaining := b.max - int64(b.buffer.Len())
	if remaining <= 0 {
		b.truncated = true
		return len(p), nil
	}
	if int64(len(p)) > remaining {
		b.buffer.Write(p[:remaining])
		b.truncated = true
		return len(p), nil
	}
	b.buffer.Write(p)
	return len(p), nil
}

func (b *limitedBuffer) Bytes() []byte {
	return b.buffer.Bytes()
}

func (b *limitedBuffer) Truncated() bool {
	return b.truncated
}
