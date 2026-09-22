# Zoom de corregistro — 20260922

La barra triplanar incorpora Zoom y, a su lado, Vincular zoom. Con Zoom activo, use la rueda o arrastre verticalmente para ampliar/reducir entre 100 % (ajustado al panel) y 800 %. Ctrl + rueda también ajusta el zoom desde las otras herramientas. El botón central arrastra la vista sin modificar la transformación.

Por defecto cada plano conserva su propio aumento. Al activar Vincular zoom, los tres adoptan el factor del último plano utilizado y sus ajustes posteriores se sincronizan. La vinculación comparte el factor relativo al encuadre de cada panel; no impone la misma escala de milímetros por píxel a paneles de diferentes dimensiones. Restablecer zoom devuelve los tres planos a 100 % y elimina su desplazamiento de vista.

El mapeo de puntero incorpora aumento y desplazamiento para mantener las coordenadas físicas de traslación, rotación, navegación y VOI. La vista previa incrementa su resolución al ampliar (hasta el tamaño nativo o el límite de 1536 píxeles en el eje mayor); los datos originales permanecen intactos. Zoom y desplazamiento son ajustes de visualización y no generan guardados automáticos.

Validación: TypeScript, compilación, pruebas de geometría y traducciones, y flujo Edge con caso sintético, incluidos zoom independiente/vinculado, arrastre vertical, restablecimiento y desplazamiento físico proporcional al aumento.
