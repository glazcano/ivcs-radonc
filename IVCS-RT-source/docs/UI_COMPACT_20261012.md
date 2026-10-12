# Compactación del workspace — 12 de octubre de 2026

Implementación sobre `main` (`9aa812b`), siguiendo la evaluación
[UI_REVIEW_20261012.md](UI_REVIEW_20261012.md).

## Cambios

- Integrar desacoplar/acoplar en la cabecera del lateral y de cada panel, mediante
  un control con nombre accesible. El lateral oculto ocupa ahora 40 px completos,
  incluidos sus controles, en lugar de reservar unos 236 px.
- Integrar selectores de plano/fuente, corte actual y restauración de vista en una
  cabecera por imagen. Comparación conserva una cabecera común de configuración
  y la identificación de sus dos imágenes. Conservar controles de 3D y ventanas
  desacopladas, así como los valores y handlers de los selectores.
- Reducir padding de barras de vista, edición y navegación inferior. Mantener
  identidad del caso, estado de guardado, W/L, zoom, cine y fusión visibles.
- Ancho inicial del lateral: 320 px para ventanas menores de 1600 px; 360 px para
  ventanas mayores. Las preferencias de ancho guardadas conservan prioridad.
- Compactar herramientas y acciones de ROI. Pestañas con texto de 12 px; dos
  columnas cuando el lateral mide 340 px o menos para evitar truncar sus nombres.
- Agrupar filtros/selección en un desplegable que mantiene visibles los filtros
  activos y la cantidad de ROI seleccionadas. Mantener resolución de máscara,
  upgrade, importación, plantillas y las acciones existentes.

No se cambiaron cálculos de geometría, máscaras, registro, codecs, guardado,
exportación ni algoritmos de edición. Las cabeceras admiten filas adicionales en
paneles estrechos y con selección de secundaria: el acceso legible a controles
tiene prioridad sobre una altura rígida.

## Medición local

Chromium 140 y Playwright 1.55.1, con biblioteca sintética, español e inglés.
Superficie medida de canvas, incluido fondo negro; no es una medida de anatomía
visible ni de calidad de imagen.

| Resolución | Axial | 1+2, suma de canvases | 2×2, suma de canvases |
| --- | ---: | ---: | ---: |
| 1366×768 | +8,2% | +19,8% | +21,0% |
| 1920×1080 | +2,6% | +9,2% | +9,7% |

En 1+2 a 1366×768, el canvas principal pasó de aproximadamente 635×502 a
661×575 px. El comienzo de la imagen pasó de 216 a 155 px desde el borde superior.
Con lateral oculto, el workspace pasó de unos 1129 a 1325 px de ancho.

Las mediciones corresponden al caso sintético y los layouts predeterminados.
Nombres muy largos, otros ajustes de distribución y una secundaria seleccionada
pueden requerir más filas o mostrar el nombre completo en un tooltip.

## Verificación

- TypeScript y producción: aprobados; siguen las advertencias previas de codecs
  y tamaño de chunks.
- 112 pruebas unitarias/integración: aprobadas.
- Edición multiplanar normal y 2×, deshacer, fusión, ventanas desacopladas,
  herramientas compartidas y limpieza: aprobados en navegador.
- Layouts, cambio de fuente, resize 1+2, rotación/zoom 3D, ausencia de animación
  o workers cuando están inactivos: aprobados.
- Registro y cierre guardar/descartar/cancelar: aprobados.
- Nueva regresión de compactación: ambas resoluciones e idiomas, una cabecera
  por viewport, ganancia de canvas, lateral oculto de 40 px, restauración de
  ROI/herramienta y filtro activo visible: aprobados.

Los workflows del repositorio y del export de fuentes incluyen la nueva
regresión y el test de layouts/3D. La verificación de esta implementación en
GitHub Actions queda pendiente de publicar y ejecutar la rama.
