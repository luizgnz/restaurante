# Recortar videos largos

Sirve cuando una grabación dura horas y lo útil es un tramo (por ejemplo 6 h de cámara y 1 h de contenido).

Requisito: `ffmpeg` y `ffprobe` en el PATH.

## Ver dónde está la parte importante

El comando `mapa` escucha el audio, ignora silencios largos y lista los bloques con actividad:

```bash
npm run video -- mapa grabacion.mp4
```

Guarda el mismo índice junto al archivo (para consultarlo después):

```bash
npm run video -- mapa grabacion.mp4 --escribir-mapa
```

## Extraer solo ese tramo

Automático (el bloque más largo con sonido):

```bash
npm run video -- extraer grabacion.mp4 --auto
```

Un bloque concreto del mapa (1, 2, 3…):

```bash
npm run video -- extraer grabacion.mp4 --bloque 1
```

Horarios a mano (si ya sabes el minuto):

```bash
npm run video -- extraer grabacion.mp4 --desde 2:10:00 --hasta 3:10:00
npm run video -- extraer grabacion.mp4 --desde 2:10:00 --duracion 1h
```

Salida por defecto: `grabacion.importante.mp4` en la misma carpeta. El original no se borra.

## Quitar silencios y unir lo hablado

Si lo “importante” está disperso (muchas pausas), esto deja solo los tramos con sonido:

```bash
npm run video -- extraer grabacion.mp4 --sin-silencios
```

## Ajustes útiles

| Opción | Qué hace |
| --- | --- |
| `--margen 10s` | Añade margen al corte automático |
| `--pausa-max 90` | Une actividad separada por pausas cortas (segundos) |
| `--umbral -40` | Detecta sonidos más flojos (dB; prueba -40 o -50 si no sale nada) |
| `--preciso` | Recodifica para un corte más exacto (más lento) |
| `-o archivo.mp4` | Elige el nombre de salida |

El corte rápido (`-c copy`) va a un keyframe: puede correrse unos segundos. Usa `--preciso` si te importa el frame exacto.
