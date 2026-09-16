# Ampliación local de RadContour

Solicitud autorizada: 1–6, 10–13, 28–32, 36, 38–39, 43, 45–47, 53–56.

- [x] Geometría física, píxeles rectangulares, márgenes y pruebas (1,2,6)
- [x] RTSTRUCT: huecos, islas, filtros, reconstrucción y comparación (3–5,43)
- [x] Plantillas, nombres, copia por rango y umbral conectado (10–13)
- [x] Cabecera, panel, lista ROI, atajos temporales, diálogo de guardado (28–32)
- [x] Sustituir corregistro 2D por rígido 3D físico y puntos (36,38,39)
- [x] Investigación y registro automático 3D local, si verificable
- [x] Conflictos de revisión, carga diferida, historial compartido, workers y guardado incremental (45,53–56)
- [x] Preflight de exportación y paquete/protocolo de validación Monaco (46,47)
- [x] Pruebas de integración, documentación y actualización portable sin tocar data

La validación dentro de Monaco requiere acceso al TPS y no puede declararse realizada con pruebas locales.

Verificación final: 38 pruebas unitarias/locales aprobadas; integración de biblioteca, guardado manual, exportación, plantillas, copia con vista previa y conflicto entre ventanas aprobada en navegador con datos sintéticos aislados. Compilación y generación del paquete Monaco6-QA aprobadas. Los 311 archivos de los casos portátiles se comprobaron con SHA-256 antes/después de la actualización.

Registro automático: implementación experimental NMI propia, con propuesta revisable; pruebas sintéticas de traslación y rotación. Véase docs/REGISTRO_3D.md. Paquete sintético y protocolo de Monaco 6 disponibles en validation y docs. El punto 47 está preparado para la prueba externa; la importación real en Monaco continúa pendiente.

## Reorganización de interfaz e idiomas

- [x] Barra contextual fuera de la imagen; eliminación de superposiciones y duplicaciones de paciente, pincel y estado inactivo.
- [x] Herramientas persistentes, filas ROI compactas y acciones en menú; plantillas/importación/copia en paneles propios.
- [x] Navegación por número, ampliación/restauración de planos y cuarto panel configurable.
- [x] Español predeterminado e inglés; JSON UTF-8 extensible en translations, selector y recarga desde Ayuda, preferencias locales.
- [x] Pruebas unitarias y de navegador; comprobación de geometría de canvas al redistribuir paneles y revisión visual bilingüe.
