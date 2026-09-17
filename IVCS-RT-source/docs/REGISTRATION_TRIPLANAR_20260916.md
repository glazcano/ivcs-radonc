# Corregistro triplanar — 20260916

## Uso

- La ventana de corregistro ofrece axial, coronal y sagital en fila o 1+2, con separador ajustable mediante arrastre o flechas del teclado.
- La rueda y los deslizadores recorren cortes. Ctrl + arrastre o Navegar ubican la cruceta compartida. El centro de giro es la cruceta en coordenadas físicas LPS.
- Trasladar arrastra en los dos ejes físicos del plano. Rotar o Mayús + arrastre aplica una rotación alrededor de la normal del plano, compuesta con la transformación actual, incluidos sus otros giros. No es una suma ingenua de ángulos Euler.
- Las tres vistas muestran mezcla, damero, cortinas o diferencia con los ajustes de visualización. Los parámetros numéricos se muestran con tres decimales; se conserva la precisión interna.
- Dibujar VOI define dos límites en cada plano; use otro plano o los seis controles numéricos para ajustar la tercera dimensión. El recuadro amarillo identifica la región; fuera de ella se muestra discontinuo. Los límites numéricos son índices de vóxel base cero de la referencia. Todo el volumen desactiva el VOI.
- Automático local presenta las transformaciones intermedias en los tres planos. Cancelar y descartar no modifican la transformación aceptada. Aceptar pasa por las mismas comprobaciones de relaciones que el ajuste manual. Guardar sigue siendo manual.

## Relaciones y conflictos

El FrameOfReferenceUID no vacío vincula las series de un mismo paciente en sus coordenadas DICOM. La identidad preserva sus posiciones originales, incluidas adquisiciones oblicuas reconstruidas. No se deduce una relación por coincidencia de nombre, modalidad o paciente. Los grupos guardados añaden relaciones rígidas explícitas.

Al mover una serie se propaga la transformación a las compañeras vinculadas, incluso si solo sus metadatos están cargados. Se componen matrices rígidas y se conserva la transformación relativa. Los grupos cuyo ancla es la referencia de trabajo contienen las colocaciones en esa referencia, no forman automáticamente un bloque móvil con toda la biblioteca.

El menú permite preservar relaciones y detenerse ante inconsistencias, priorizar relaciones DICOM, priorizar grupos guardados o desvincular explícitamente la serie seleccionada. Un bloque que incluye la referencia fija no puede desplazarse; una serie bloqueada tampoco se modifica. Desvincular y las políticas elegidas se guardan junto a la sesión y el grupo. Restablecer vínculo vuelve a habilitar la comprobación, sin realinear silenciosamente las imágenes. Los grupos se guardan en una única operación atómica.

Al elegir DICOM o grupos guardados se selecciona qué relaciones tienen autoridad; no se borra el otro origen de relaciones. Los objetos DICOM originales no se reescriben. La importación de transformaciones desde objetos DICOM REG externos no se añade en esta revisión: si series con distintos marcos ya están alineadas pero no existe un grupo guardado, el programa no puede inferir ese vínculo con certeza.

## Registro automático y literatura

La revisión de SimpleITK y elastix respalda información mutua para registro multimodal, selección de métricas según modalidad, inicialización y máscaras/recortes físicos. No establece superioridad universal de un algoritmo para TC–TC o TC–RM.

Se incorpora NMI con contribución lineal a los bins vecinos del histograma conjunto (estimación suave), se mantiene NMI clásica y se ofrece correlación normalizada para TC–TC. La estimación lineal no se presenta como la implementación Mattes de ITK ni como elastix: son cálculos propios, locales, sin nuevas dependencias. El optimizador sigue siendo rígido, seis parámetros, búsqueda por coordenadas con pasos decrecientes; no es un registro deformable ni una pirámide gaussiana completa.

Con VOI se distribuyen muestras directamente en su caja física de referencia y se consulta el volumen nativo, evitando que un VOI pequeño pierda todas sus muestras por rechazo del volumen completo. Sin VOI se mantiene la cobertura relativa al menor campo de adquisición. Un área vacía o sin contraste falla explícitamente. La región orienta la función objetivo, no recorta las imágenes ni limita la transformación resultante a su interior.

El worker envía propuestas intermedias. Las vistas previas limitan su raster a 320 píxeles por eje mayor y agrupan actualizaciones con requestAnimationFrame para contener el coste; el volumen fuente, el muestreo del algoritmo, los contornos y las exportaciones no se reducen a esa resolución. El muestreo de fusión usa incrementos afines precomputados por plano.

Fuentes consultadas (también disponibles en About):
- SimpleITK Registration Overview: https://simpleitk.readthedocs.io/en/v2.3.0/registrationOverview.html
- Klein et al., 2010, elastix: A Toolbox for Intensity-Based Medical Image Registration: https://elastix.dev/marius/downloads/2010_j_TMI.pdf
- DICOM PS3.3 C.7.4, Frame of Reference: https://dicom.nema.org/medical/dicom/2026a/output/chtml/part03/sect_C.7.4.html

## Validación y límites

Pruebas de composición/inversa con pivotes, traslación y rotación por plano, conservación de relaciones nativas y guardadas, series no cargadas, conflictos y bloqueos, políticas y guardado atómico, VOI físico, métricas y progreso. Edge comprueba las distribuciones, actualización simultánea al arrastrar en cada plano, dibujo del VOI, cálculo en vivo/cancelación/propuesta y persistencia de desvinculación. Datos exclusivamente sintéticos.

Esto no demuestra precisión clínica para todos los pares TC–RM: los cambios de anatomía y los mínimos locales requieren revisión visual en los tres planos, especialmente al registrar estudios de fechas distintas. No se afirma equivalencia con ITK/elastix. Esta revisión actualiza código y compilación web; no sobrescribe paquetes portables anteriores.
