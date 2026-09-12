package runtime

import (
	"os"
	"path/filepath"
	"runtime"
)

// DataDir conserva la ubicación de datos de la aplicación Node. Así, una
// instalación Go puede abrir la misma base SQLite sin mover ni duplicar datos.
func DataDir() (string, error) {
	if dir := os.Getenv("RESTAURANTE_DATA_DIR"); dir != "" {
		return dir, nil
	}

	switch runtime.GOOS {
	case "windows":
		if programData := os.Getenv("PROGRAMDATA"); programData != "" {
			return filepath.Join(programData, "Restaurante"), nil
		}
		return filepath.Join(`C:\\ProgramData`, "Restaurante"), nil
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Application Support", "Restaurante"), nil
	default:
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "restaurante"), nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".local", "share", "restaurante"), nil
	}
}

func DatabasePath(dataDir string) string {
	return filepath.Join(dataDir, "data", "salon.sqlite")
}
