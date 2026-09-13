package contracts

import "context"

// HandoffNoteRecorder writes handoff facts into the Pet Event stream (L2).
type HandoffNoteRecorder interface {
	RecordHandoffNote(ctx context.Context, q Q, petID, userID, text string) error
}
