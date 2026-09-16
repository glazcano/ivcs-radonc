# Protocolo de intercambio con TPS 6

Estado: comprobación local realizada; importación y aceptación en TPS pendientes. Registrar la versión menor, compilación y ajustes de importación del centro. Este paquete contiene solamente un fantoma sintético, sin pacientes.

## Contenido y perfil inicial

17 imágenes CT axiales, píxeles de 1 mm en X y 2 mm en Y, separación Z de 3 mm. Cinco estructuras: caja, esfera, cilindro, anillo con isla interna y un único vóxel. `expected-local.json` contiene volúmenes discretizados, Dice y diferencias tras reconstruir los archivos exportados. El volumen analítico de la forma continua difiere del discretizado.

Perfil inicial: RT Structure Set Storage, Explicit VR Little Endian, UTF-8, referencias exactas al Study/Series/Frame/SOP de las imágenes; tolerancia 0 mm y área mínima 0 mm². `RTSTRUCT_KEYHOLE.dcm` representa huecos con CLOSED_PLANAR y puente de área cero. `RTSTRUCT_XOR.dcm` es una alternativa separada: comprobar soporte antes de adoptarla. No importar ambos como si fueran estructuras distintas de un caso clínico.

## Prueba en el TPS

1. Abrir un paciente de control identificado RADCONTOUR_QA_MONACO6 e importar la carpeta CT.
2. Importar primero RTSTRUCT_KEYHOLE.dcm. Registrar cualquier aviso o rechazo y el perfil de importación usado.
3. Revisar identidad, orientación, posición, escala, correspondencia de cortes, nombres y colores.
4. Verificar caja, esfera y cilindro en vistas axial, coronal y sagital. Confirmar que el anillo conserva el hueco, la isla interna y la estructura SINGLE_VOXEL; revisar también sus cortes iniciales y finales.
5. Comparar volúmenes con expected-local.json. Documentar cómo TPS integra extremos de contornos: no usar igualdad exacta de volumen continuo como único criterio de aceptación.
6. Exportar desde TPS ese RTSTRUCT. En IVCS RT abrir el mismo CT e importar el RTSTRUCT del TPS. Revisar la propuesta superpuesta antes de aceptar. Comparar límites y cortes con la referencia; toda diferencia de topología o desplazamiento sin explicación requiere investigación.
7. Repetir por separado con XOR, registrando si la versión lo soporta. Mantener el perfil que haya superado la revisión del centro.
8. Repetir con un caso de prueba representativo del flujo local antes de incorporar el intercambio al trabajo habitual. No usar este fantoma para calcular tratamientos.

## Registro de resultado

- Versión completa / compilación TPS:
- Fecha / revisor:
- Configuración de importación:
- Keyhole aceptado / avisos:
- XOR aceptado / avisos:
- Identidad, orientación y escala:
- Hueco, isla y vóxel único conservados:
- Diferencias de volumen y explicación:
- Resultado de exportación y reimportación:
- Perfil aprobado por el centro / pendientes:

La comprobación automática local garantiza la equivalencia de las máscaras en los casos ensayados, no la interpretación de otro TPS. El programa no envía información a Elekta ni a servicios externos.
