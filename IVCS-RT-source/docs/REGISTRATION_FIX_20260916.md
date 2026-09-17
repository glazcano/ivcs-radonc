# Corregistro y fusión — 20260916

La vista previa ahora utiliza la ventana secundaria, paleta, opacidad y modo seleccionados. Comparte el compositor con el visor axial, incluidas ambas cortinas y sus extremos 0/100 %. Seleccionar una secundaria inicializa su ventana DICOM y escala de grises. Restablecer ventana secundaria permite corregir ajustes antiguos guardados sin modificar la transformación.

Arrastrar sobre la imagen del diálogo manual traslada en milímetros del plano axial; Mayús + arrastre horizontal rota alrededor de Z, usando el pivote de la transformación. Los otros ejes siguen disponibles numéricamente. Se respeta el bloqueo y no se modifica una propuesta pendiente.

El registro NMI mide cobertura sobre el volumen físico menor. Cuando este es el móvil, proyecta sus muestras hacia la referencia, conservando el sentido de la transformación. Mantiene el mínimo de muestras y 25 % de cobertura del menor volumen. No es un algoritmo deformable: una propuesta sigue requiriendo revisión anatómica y aceptación. La prueba de campo pequeño utiliza intensidades sintéticas diferentes y no constituye validación clínica TC/RM.

Las reconstrucciones coronal/sagital generan su propia máscara de soporte. La fusión conserva la polaridad de la imagen secundaria. Auto BODY inicia con nuevo volumen incluso si existe EXTERNAL/BODY.

Validación: pruebas de precisión (traslación, rotación, campo pequeño, polaridad y máscaras), comprobación TypeScript, compilación Vite y prueba Edge con caso sintético de modos, cortina, arrastre, rotación y destino BODY. No se modifican datos de pacientes ni se regeneran paquetes portables en esta revisión.
