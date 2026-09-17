# Corregistro rígido 3D local

Se reemplazó la transformación 2D por seis grados de libertad en coordenadas físicas DICOM: tres traslaciones en mm y tres rotaciones en grados, sin escalamiento. La transformación mueve la imagen secundaria hacia la referencia; gira alrededor del centro guardado, en orden Rx, Ry, Rz. El visor aplica la inversa para muestrear la secundaria con interpolación trilineal. La zona sin cobertura queda transparente. Las transformaciones 2D antiguas quedan desactivadas y deben rehacerse; no se interpretan como registros 3D.

El ajuste por puntos usa el método de cuaterniones de Horn. Requiere al menos tres pares no colineales. Informa errores por punto y RMS y presenta una propuesta que se puede revisar, aceptar o descartar. Un RMS bajo mide ajuste a los puntos elegidos; no demuestra precisión anatómica fuera de ellos.

## Factibilidad del automático

La información mutua normalizada permite comparar imágenes con relaciones de intensidad distintas y es apropiada como base de un registro rígido multimodal. Es viable ejecutar una búsqueda limitada en un trabajador local del navegador, sin subir volúmenes, descargar modelos ni instalar Python. Se incorporó una implementación propia experimental: histogramas de 32 niveles, muestreo volumétrico, interpolación trilineal, búsqueda de seis parámetros de grueso a fino y comprobación de solapamiento. Compara también una inicialización por centros y refina traslaciones antes del ajuste completo. El usuario debe aceptar explícitamente la propuesta.

Esta implementación no es SimpleITK ni reproduce su estimador Mattes. No incluye registro deformable, aprendizaje automático, optimización global ni garantía de convergencia. La prueba de traslación y la de rotación usan fantomas sintéticos; no equivalen a validación clínica multimodal. Puede fallar con poco solapamiento, simetría, bajo contraste, artefactos, movimiento o diferencias anatómicas. Inicializar por puntos ayuda cuando la posición inicial es distante. Las puntuaciones mostradas sirven para comparar la búsqueda en el mismo par, no como umbral clínico universal.

## Fuentes

- Horn, 1987. Closed-form solution of absolute orientation using unit quaternions. [Artículo del autor](https://people.csail.mit.edu/bkph/papers/Absolute_Orientation_Scanned.pdf). Base del ajuste rígido por puntos.
- Studholme, Hill y Hawkes, 1999. An overlap invariant entropy measure of 3D medical image alignment. [Artículo, DOI 10.1016/S0031-3203(98)00091-0](https://www.sciencedirect.com/science/article/pii/S0031320398000910). Fundamento de la información mutua normalizada.
- [SimpleITK Registration Overview](https://simpleitk.readthedocs.io/en/main/registrationOverview.html). Referencia para separar transformación, interpolación, métrica, inicialización y optimización; no se usa como dependencia.
- [DICOM PS3.3, C.8.8.6.3](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_c.8.8.6.3.html). Topología de contornos cerrados, huecos y XOR.

La geometría de entrada admitida sigue siendo un volumen axial regular validado. El corregistro 3D no amplía silenciosamente la compatibilidad a DICOM oblicuos, inclinación de gantry o series irregulares.
