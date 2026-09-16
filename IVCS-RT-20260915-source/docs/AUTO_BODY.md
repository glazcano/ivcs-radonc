# Auto BODY local

Auto BODY calcula una propuesta temporal. Ninguna ROI se modifica hasta pulsar **Aplicar cortes seleccionados**. Cancelar o cerrar la ventana detiene el proceso de cálculo y descarta la propuesta. El guardado en disco sigue siendo exclusivamente manual.

## Uso

1. Seleccione toda la serie, el corte actual o un intervalo inclusivo de cortes (numerados desde 1).
2. Elija crear una estructura o reemplazar cortes. Las estructuras bloqueadas no se pueden reemplazar. **Conservar cortes que ya tienen contorno**, activado por defecto, protege todos los cortes no vacíos: no se presupone cuáles fueron corregidos a mano.
3. Ajuste el umbral, el área mínima de componentes secundarios y los radios en milímetros. El componente principal no se descarta por su tamaño. El umbral corresponde a intensidades HU de TC; no constituye un perfil de segmentación de RM.
4. Si necesita excluir la mesa explícitamente, active la línea manual y muévala con el deslizador o pulsando la imagen. Se excluye todo lo situado debajo, incluido cualquier tejido que esté allí. La posición relativa de la línea se aplica al intervalo completo: revísela navegando por los cortes.
5. Calcule la vista previa. Navegue con el deslizador o las filas del listado. Puede ocultar el resultado para comparar con la imagen y saltar al siguiente corte con avisos.
6. Marque los cortes que desea aplicar. Los cortes fuera de la selección permanecen intactos. Un corte seleccionado vacío puede borrar un contorno previo solamente si se desactivó la conservación de cortes existentes.
7. Aplique y use Guardar / Ctrl+S cuando corresponda. La aplicación conserva la acción en el historial de deshacer.

Cambiar un parámetro de cálculo invalida la propuesta anterior. Cambiar de serie o cerrar la ventana aborta el trabajo pendiente.

## Algoritmo y límites

- Umbral inferior de tejido; no se excluyen automáticamente valores superiores a 3071 HU.
- Separación de mesa mediante apertura restringida a una banda alrededor de un candidato horizontal. No se contrae globalmente la anatomía para separar la mesa.
- Detección geométrica de componentes planos en la parte inferior de la imagen, con proporciones físicas. Esta heurística presupone una mesa inferior y horizontal; la vista previa y la línea explícita permiten revisar casos que no cumplen esa disposición.
- Etiquetado de componentes en un recorrido. Criterio de área en mm² (20 por defecto); siempre se conserva el principal no clasificado como mesa. Si solo quedan componentes clasificados como mesa, el resultado es vacío.
- Cierre antes del relleno de cavidades. El cierre conserva la máscara original en los límites del campo de visión para no retraer artificialmente el contorno truncado.
- Regularización dentro de un radio físico (1 mm por defecto), sin modificar bordes con vecinos fuera de la imagen. Un margen final es opcional y está separado del suavizado.
- En series, los componentes secundarios pequeños pueden conservarse si se superponen al menos en un 50 % con máscaras de ambos cortes vecinos. Solo se usa esta regla cuando coinciden las dimensiones, el espaciado, la orientación y el origen en el plano, y no existe una separación excesiva entre cortes. No se añaden vóxeles ni se interpola anatomía. Los extremos del intervalo carecen de dos vecinos y mantienen el criterio de área.
- Avisos por corte: ausencia de contorno, contacto con los límites de imagen, múltiples componentes, cambios de área superiores al 35 % y desplazamientos de centro superiores a 10 mm respecto al corte anterior compatible. Son criterios de navegación y revisión, no validación clínica.

## Rendimiento

El cálculo permanece en un worker local cancelable. Las imágenes se envían en bloques de hasta 8 MiB (una imagen mayor se envía sola); el worker conserva las máscaras y geometría, no otra copia completa de intensidades. Los resultados se transfieren sin copiar sus buffers. No hay pausas artificiales cada dos cortes y el progreso se comunica por bloques.

La morfología elige entre expansión de bordes y distancia euclídea según el coste estimado. El radio utiliza el espaciado físico y la erosión considera el exterior del campo como fondo. La transformada evita procesar un eje Z de longitud 1. El suavizado evalúa solamente vecindarios próximos al perímetro.

Medición local del 8 de septiembre de 2026, fantoma elíptico sin mesa, mediana de cinco cálculos de un corte con opciones por defecto:

| Imagen / espaciado | Antes | Después |
|---|---:|---:|
| 512 × 512 / 1 mm | 42,26 ms | 30,36 ms |
| 512 × 512 / 0,5 mm | 116,71 ms | 36,07 ms |
| 1024 × 1024 / 0,5 mm | 463,87 ms | 139,40 ms |

Estos tiempos no incluyen comunicación con el worker, revisión de la serie ni presentación en pantalla. Se modificaron también los criterios de calidad, por lo que no se afirma identidad del BODY antiguo y nuevo. La equivalencia de los operadores morfológicos sí se comprueba por separado. Los tiempos no representan mediciones de pacientes ni una velocidad garantizada.

## Comprobaciones reproducibles

- `node --import tsx --test tests/body.test.ts`: regiones pequeñas, área física, imagen de solo mesa, equivalencia morfológica en píxeles rectangulares y límites de imagen, relleno, banda local, línea manual, continuidad, avisos y protección de ROI.
- `node tests/body-browser.mjs <ruta-a-playwright>`: biblioteca sintética aislada, vista previa sin escrituras, cancelación, bloqueo, conservación, intervalo y selección individual de cortes.
- `node --import tsx tests/body-benchmark.mts`: medición sintética de velocidad; no lee ni escribe casos.

La base algorítmica de distancia euclídea está descrita en [SimpleITK / Signed Maurer Distance Map](https://simpleitk.org/doxygen/v1_0/html/classitk_1_1simple_1_1SignedMaurerDistanceMapImageFilter.html). La implementación utiliza las utilidades locales del programa, sin añadir servicios externos ni requerir SimpleITK.
