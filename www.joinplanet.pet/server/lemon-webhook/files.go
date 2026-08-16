package main

// files.go — F5 附件: multipart upload to ./uploads plus the public read
// endpoint /api/v1/files/{key}. The unguessable 32-hex random key IS the
// permission (share pages link to it without auth), so the key regex doubles
// as path-traversal protection.

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const (
	uploadsDir     = "./uploads"
	maxUploadBytes = 10 << 20 // 10MB per file (API contract F5)
)

// fileKeyRe matches exactly {32 lowercase hex}.{known ext} — no slashes, dots
// or escapes survive this, making filepath.Join safe.
var fileKeyRe = regexp.MustCompile(`^[0-9a-f]{32}\.(jpg|png|webp|heic|pdf)$`)

// uploadExtKind maps a lowercased filename extension to its attachment kind.
var uploadExtKind = map[string]string{
	"jpg": "image", "jpeg": "image", "png": "image", "webp": "image", "heic": "image",
	"pdf": "pdf",
}

// fileContentTypes pins Content-Type per extension (Go's mime table misses
// webp/heic on some platforms) — set before ServeFile so it is not overridden.
var fileContentTypes = map[string]string{
	"jpg":  "image/jpeg",
	"png":  "image/png",
	"webp": "image/webp",
	"heic": "image/heic",
	"pdf":  "application/pdf",
}

func init() {
	apiModules = append(apiModules, func(mux *http.ServeMux, a *app) {
		mux.HandleFunc("POST /pets/{petID}/attachments", a.requirePetMember(a.handleAttachmentUpload))
		mux.HandleFunc("GET /files/{key}", handleFileGet) // public: random key = permission
	})
}

// ---- POST /pets/{petID}/attachments -----------------------------------------

func (a *app) handleAttachmentUpload(w http.ResponseWriter, req *http.Request, userID, petID int64, _ string) {
	req.Body = http.MaxBytesReader(w, req.Body, maxUploadBytes+(2<<20)) // file + multipart overhead
	if err := req.ParseMultipartForm(1 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			jsonResponse(w, http.StatusRequestEntityTooLarge, errBody("file too large"))
			return
		}
		jsonResponse(w, http.StatusBadRequest, errBody("invalid multipart form"))
		return
	}
	file, header, err := req.FormFile("file")
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("file field is required"))
		return
	}
	defer file.Close()

	ext := uploadExtOf(header.Filename)
	kind, supported := uploadExtKind[ext]
	if !supported {
		jsonResponse(w, http.StatusBadRequest, errBody("only jpg, png, webp, heic or pdf files are supported"))
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not read file"))
		return
	}
	if len(data) > maxUploadBytes {
		jsonResponse(w, http.StatusRequestEntityTooLarge, errBody("file too large"))
		return
	}
	eventID, err := a.uploadEventID(req, petID)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errBody("event not found"))
		return
	}
	key, err := newUploadKey(ext)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not store file"))
		return
	}
	if err := storeUploadFile(key, data); err != nil {
		jsonResponse(w, http.StatusInternalServerError, errBody("could not store file"))
		return
	}
	var id int64
	var kindOut string
	if err := a.pool.QueryRow(req.Context(), `
		INSERT INTO attachments (pet_id, event_id, kind, storage_key, filename, size, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, kind`,
		petID, eventID, kind, key, truncate(filepath.Base(header.Filename), 255), len(data), userID,
	).Scan(&id, &kindOut); err != nil {
		_ = os.Remove(filepath.Join(uploadsDir, key))
		jsonResponse(w, http.StatusInternalServerError, errBody("could not save attachment"))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"attachment": map[string]any{"id": id, "kind": kindOut, "url": fileURLFor(req, key)},
	})
}

// uploadExtOf normalizes a filename extension (jpeg → jpg).
func uploadExtOf(filename string) string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filename), "."))
	if ext == "jpeg" {
		return "jpg"
	}
	return ext
}

// uploadEventID validates the optional event_id form field against this pet's
// timeline; nil means "not attached to an event".
func (a *app) uploadEventID(req *http.Request, petID int64) (any, error) {
	v := strings.TrimSpace(req.FormValue("event_id"))
	if v == "" {
		return nil, nil
	}
	id, err := strconv.ParseInt(v, 10, 64)
	if err != nil || id <= 0 {
		return nil, errBadUploadEvent
	}
	var one int
	if err := a.pool.QueryRow(req.Context(),
		`SELECT 1 FROM timeline_events WHERE id = $1 AND pet_id = $2`, id, petID).Scan(&one); err != nil {
		return nil, errBadUploadEvent
	}
	return id, nil
}

var errBadUploadEvent = errors.New("event not found")

// newUploadKey returns "{random32hex}.{ext}" (16 random bytes, hex-encoded).
func newUploadKey(ext string) (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]) + "." + ext, nil
}

// storeUploadFile writes the bytes under ./uploads, creating the directory.
func storeUploadFile(key string, data []byte) error {
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(uploadsDir, key), data, 0o644)
}

// ---- GET /files/{key} ---------------------------------------------------------

func handleFileGet(w http.ResponseWriter, req *http.Request) {
	key := req.PathValue("key")
	if !fileKeyRe.MatchString(key) {
		jsonResponse(w, http.StatusNotFound, errBody("not found"))
		return
	}
	path := filepath.Join(uploadsDir, key)
	if _, err := os.Stat(path); err != nil {
		jsonResponse(w, http.StatusNotFound, errBody("not found"))
		return
	}
	if ct := fileContentTypes[key[strings.LastIndexByte(key, '.')+1:]]; ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	// Keys are unguessable and never rewritten: safe to cache aggressively.
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, req, path)
}

// baseURLFor builds scheme://host from the request (honouring
// X-Forwarded-Proto behind a proxy) for absolute URLs in API payloads.
func baseURLFor(req *http.Request) string {
	scheme := "http"
	if req.TLS != nil {
		scheme = "https"
	} else if p := req.Header.Get("X-Forwarded-Proto"); p != "" {
		if i := strings.IndexByte(p, ','); i >= 0 {
			p = p[:i]
		}
		if p = strings.TrimSpace(p); p != "" {
			scheme = p
		}
	}
	return scheme + "://" + req.Host
}

// fileURLFor builds the absolute public URL for an uploaded file so the same
// payload works in the app, the browser and server-rendered share pages.
func fileURLFor(req *http.Request, key string) string {
	return baseURLFor(req) + "/api/v1/files/" + key
}
