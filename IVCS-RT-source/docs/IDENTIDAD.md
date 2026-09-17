# Identidad y revisiones de IVCS RT

El nombre público del programa es **IVCS RT**. La presentación utiliza **exportación a TPS** o **RTSTRUCT para TPS**, sin atribuir compatibilidad probada con un fabricante específico.

Las revisiones se identifican exclusivamente por la fecha de compilación en formato `AAAAMMDD`, zona horaria `America/Santiago`. La revisión del 8 de septiembre de 2026 corresponde a `20260908`. No añadir numeración semántica de producto.

`src/appInfo.ts` centraliza esta identidad. `vite.config.ts` fija el código al compilar: no cambia al abrir el mismo paquete otro día. Cada compilación futura toma automáticamente su fecha. En la cabecera DICOM, el identificador de implementación usa `IVCSRT_AAAAMMDD`, dentro del límite del campo SH.

Ayuda → Acerca de IVCS RT contiene los créditos de desarrollo con Google AI Studio y Chat GPT 6 Astra, las referencias consultadas y el inventario de bibliotecas. `scripts/projectCredits.mjs` obtiene las dependencias directas y licencias de los paquetes instalados durante la compilación; al agregar una biblioteca, revisar también su clasificación de uso. El archivo de avisos queda incluido en el paquete y se puede descargar sin conexión.

Los identificadores internos del formato de sesión, base de datos y cabeceras de la API se conservan para mantener la lectura de casos existentes. La carpeta portátil existente conserva su ubicación; no es necesario mover los pacientes para cambiar la presentación.
