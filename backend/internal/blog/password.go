package blog

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

// The administrator password lives in the database as a salted PBKDF2 hash.
// ADMIN_PASSWORD only seeds the hash on the first startup, so passwords can be
// changed from the dashboard without editing deployment configuration.
const (
	minPasswordBytes = 12
	maxPasswordBytes = 512

	passwordIterations = 210_000
	passwordSaltBytes  = 16
	passwordKeyBytes   = 32
	passwordPrefix     = "pbkdf2_sha256"
)

func validPassword(password string) bool {
	return len(password) >= minPasswordBytes && len(password) <= maxPasswordBytes
}

// hashPassword encodes the hash as prefix$iterations$salt$key so that the
// parameters stay verifiable when they change later.
func hashPassword(password string) (string, error) {
	salt := make([]byte, passwordSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, passwordIterations, passwordKeyBytes)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s$%d$%s$%s", passwordPrefix, passwordIterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

func verifyPassword(encoded, password string) bool {
	if !validPassword(password) {
		return false
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != passwordPrefix {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations < 1 || iterations > 1_000_000 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil || len(salt) == 0 {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil || len(want) == 0 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iterations, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}
