#!/bin/zsh
set -e

# Ejecuta siempre desde la carpeta donde está este archivo, aunque el proyecto
# se mueva a otra ubicación.
cd "${0:A:h}"

# Por defecto abre la interfaz en el navegador. Se puede desactivar con:
# RESTAURANTE_NO_OPEN=1 ./Iniciar\ Restaurante.command
export RESTAURANTE_NO_OPEN="${RESTAURANTE_NO_OPEN:-0}"
exec npm start
