# Traducciones de RadContour

Esta carpeta se distribuye junto a `runtime`, `dist` y `data` en el programa portátil. Los archivos se leen localmente; no se envían datos a servicios de traducción.

## Añadir un idioma sin recompilar

1. Copiar `es.json`, por ejemplo a `fr.json`.
2. Cambiar la cabecera `language`: código único BCP-47 simple, nombre nativo y dirección `ltr` o `rtl`.
3. Traducir únicamente los valores de `messages`. Conservar las claves en español y los marcadores `{0}`, `{1}`, etc., exactamente; se pueden reordenar según la gramática. Mantener unidades y códigos DICOM.
4. Guardar como JSON UTF-8 en esta carpeta.
5. En RadContour abrir Archivo y ayuda → Atajos y ayuda → Volver a leer traducciones. Seleccionar el nuevo idioma. También se detecta al iniciar el programa.

Ejemplo mínimo válido (las frases ausentes usan español):

```json
{
  "schemaVersion": 1,
  "language": {
    "code": "fr",
    "name": "Français",
    "englishName": "French",
    "direction": "ltr"
  },
  "messages": {
    "Guardar": "Enregistrer",
    "Corte {0} ({1})": "Coupe {0} ({1})"
  }
}
```

No incluir comentarios ni comas finales en JSON. El nombre del archivo es libre y debe terminar en `.json`; el selector identifica el idioma por la cabecera. Un archivo inválido, un código duplicado o marcadores incompatibles se omiten y se informan al volver a leer la carpeta. Límite: 2 MB por archivo.

Los valores son texto plano, nunca HTML ni código. No se traducen nombres de pacientes, identificadores, descripciones DICOM, nombres de ROI ni los archivos exportados del paciente. La selección se recuerda en `data/preferences.json`. El idioma predeterminado es español. Solo español e inglés han sido comprobados visualmente; otros idiomas pueden requerir revisión de longitudes y dirección de lectura.

Al actualizar el programa se conservan los archivos ya existentes en esta carpeta. Para actualizar una traducción incluida, reemplazar conscientemente su JSON. En desarrollo la carpeta está en la raíz del proyecto.
