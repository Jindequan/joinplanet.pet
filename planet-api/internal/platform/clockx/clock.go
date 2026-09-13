// Package clockx 提供可注入的时间源（测试可控）。
package clockx

import "time"

type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now().UTC() }

func New() Clock { return realClock{} }
