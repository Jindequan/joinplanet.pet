package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// cmdBackup creates a verified PostgreSQL custom-format dump. The dump is
// first written to a same-directory temporary file, checked with pg_restore,
// hashed, and only then atomically renamed into the backup directory. An
// optional aws s3 cp makes the off-site copy explicit; R2 works through the
// AWS-compatible endpoint configured in the environment.
func cmdBackup(args []string) {
	fs := newFlagSet("backup")
	url := fs.String("url", os.Getenv("DATABASE_URL"), "database url")
	outputDir := fs.String("output-dir", os.Getenv("BACKUP_DIR"), "local backup directory")
	s3URI := fs.String("s3-uri", os.Getenv("BACKUP_S3_URI"), "optional s3:// destination prefix")
	retentionDays := fs.Int("retention-days", 14, "local dump retention in days")
	flags, positional := splitArgs(args)
	_ = fs.Parse(flags)
	if len(positional) > 0 || *retentionDays < 1 || strings.TrimSpace(*outputDir) == "" {
		fmt.Fprintln(os.Stderr, "usage: planet-cli backup --url <database-url> --output-dir <dir> [--s3-uri s3://bucket/prefix] [--retention-days 14]")
		os.Exit(2)
	}
	target := requireURL(*url)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	path, err := createBackup(ctx, target, *outputDir, *s3URI, *retentionDays, time.Now().UTC())
	exitOn(err)
	fmt.Println("backup created:", path)
}

// newFlagSet avoids flag.ExitOnError's process-global default output while
// retaining the same split-args behavior used by the other CLI commands.
func newFlagSet(name string) *flag.FlagSet {
	return flag.NewFlagSet(name, flag.ContinueOnError)
}

func createBackup(ctx context.Context, databaseURL, outputDir, s3URI string, retentionDays int, now time.Time) (string, error) {
	if _, err := exec.LookPath("pg_dump"); err != nil {
		return "", fmt.Errorf("pg_dump is required for backup: %w", err)
	}
	if _, err := exec.LookPath("pg_restore"); err != nil {
		return "", fmt.Errorf("pg_restore is required to verify backup: %w", err)
	}
	if err := os.MkdirAll(outputDir, 0o750); err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}
	base := filepath.Join(outputDir, "planet-"+now.Format("20060102T150405Z"))
	tmp := base + ".dump.tmp"
	dumpPath := base + ".dump"
	shaPath := dumpPath + ".sha256"
	defer os.Remove(tmp)
	if err := runCommand(ctx, "pg_dump", "--dbname", databaseURL, "--format=custom", "--no-owner", "--no-privileges", "--file", tmp); err != nil {
		return "", fmt.Errorf("pg_dump: %w", err)
	}
	if err := runCommand(ctx, "pg_restore", "--list", tmp); err != nil {
		return "", fmt.Errorf("pg_restore verification: %w", err)
	}
	if err := os.Rename(tmp, dumpPath); err != nil {
		return "", fmt.Errorf("commit backup dump: %w", err)
	}
	sum, err := fileSHA256(dumpPath)
	if err != nil {
		return "", fmt.Errorf("hash backup dump: %w", err)
	}
	if err := os.WriteFile(shaPath, []byte(sum+"  "+filepath.Base(dumpPath)+"\n"), 0o640); err != nil {
		return "", fmt.Errorf("write backup checksum: %w", err)
	}
	if strings.TrimSpace(s3URI) != "" {
		if !strings.HasPrefix(s3URI, "s3://") {
			return "", errors.New("s3-uri must start with s3://")
		}
		if _, err := exec.LookPath("aws"); err != nil {
			return "", fmt.Errorf("aws CLI is required for off-site backup: %w", err)
		}
		if err := runCommand(ctx, "aws", "s3", "cp", dumpPath, strings.TrimRight(s3URI, "/")+"/"+filepath.Base(dumpPath)); err != nil {
			return "", fmt.Errorf("upload backup dump: %w", err)
		}
		if err := runCommand(ctx, "aws", "s3", "cp", shaPath, strings.TrimRight(s3URI, "/")+"/"+filepath.Base(shaPath)); err != nil {
			return "", fmt.Errorf("upload backup checksum: %w", err)
		}
	} else {
		slog.Warn("backup has no off-site destination", "path", dumpPath)
	}
	if err := pruneLocalBackups(outputDir, now.Add(-time.Duration(retentionDays)*24*time.Hour)); err != nil {
		return "", fmt.Errorf("prune old backups: %w", err)
	}
	return dumpPath, nil
}

func runCommand(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func pruneLocalBackups(dir string, before time.Time) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "planet-") || !strings.HasSuffix(entry.Name(), ".dump") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.ModTime().Before(before) {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
				return err
			}
			_ = os.Remove(filepath.Join(dir, entry.Name()+".sha256"))
		}
	}
	return nil
}
