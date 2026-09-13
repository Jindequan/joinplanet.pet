package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
)

// AppError 是全后端唯一错误类型；code→status 注册表一旦发布即冻结（只增不改）。
type AppError struct {
	Code    string
	Status  int
	Message string
	Extra   map[string]any
}

func (e *AppError) Error() string { return e.Code + ": " + e.Message }

func NewAppError(status int, code, msg string) *AppError {
	return &AppError{Code: code, Status: status, Message: msg}
}

func (e *AppError) With(key string, v any) *AppError {
	if e.Extra == nil {
		e.Extra = map[string]any{}
	}
	e.Extra[key] = v
	return e
}

// —— 错误码注册表（BACKEND-DESIGN §11）——

func ErrValidation(msg string) *AppError {
	return NewAppError(http.StatusBadRequest, "VALIDATION_FAILED", msg)
}

func ErrUnauthenticated(msg string) *AppError {
	if msg == "" {
		msg = "authentication required"
	}
	return NewAppError(http.StatusUnauthorized, "UNAUTHENTICATED", msg)
}

func ErrNotFound(msg string) *AppError {
	if msg == "" {
		msg = "resource not found"
	}
	return NewAppError(http.StatusNotFound, "RESOURCE_NOT_FOUND", msg)
}

func ErrRoleForbidden() *AppError {
	return NewAppError(http.StatusForbidden, "ROLE_FORBIDDEN", "owner role required")
}

func ErrQuota(code string, usage any) *AppError {
	e := NewAppError(http.StatusForbidden, code, "plan quota exceeded")
	return e.With("usage", usage)
}

func ErrArchived() *AppError {
	return NewAppError(http.StatusConflict, "PET_ARCHIVED", "pet is archived and read-only")
}

func ErrVersionConflict(current any) *AppError {
	e := NewAppError(http.StatusConflict, "VERSION_CONFLICT", "resource was modified concurrently")
	return e.With("current", current)
}

func ErrTaskLogExists(log any) *AppError {
	e := NewAppError(http.StatusConflict, "TASK_LOG_EXISTS", "task already logged for this date")
	return e.With("log", log)
}

func ErrLastOwner() *AppError {
	return NewAppError(http.StatusConflict, "LAST_OWNER", "family must keep one active owner")
}

func ErrAccountHasOwnedPets() *AppError {
	return NewAppError(http.StatusConflict, "ACCOUNT_HAS_OWNED_PETS", "transfer or delete owned pets before deleting the account")
}

func ErrAuthRateLimited() *AppError {
	return NewAppError(http.StatusTooManyRequests, "AUTH_RATE_LIMITED", "too many attempts, try later")
}

func ErrInternal(msg string) *AppError {
	if msg == "" {
		msg = "internal error"
	}
	return NewAppError(http.StatusInternalServerError, "INTERNAL", msg)
}

// Response 编码错误契约：{"error":{code,message,request_id}} + 平铺的 Extra 字段。
func WriteAppError(w http.ResponseWriter, r *http.Request, err error) {
	ae, ok := err.(*AppError)
	if !ok {
		ok = errors.As(err, &ae)
	}
	if !ok || ae == nil {
		ae = ErrInternal("")
	}
	body := map[string]any{
		"error": map[string]any{
			"code":       ae.Code,
			"message":    ae.Message,
			"request_id": RequestIDFrom(r.Context()),
		},
	}
	for k, v := range ae.Extra {
		body[k] = v
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(ae.Status)
	_ = json.NewEncoder(w).Encode(body)
}
