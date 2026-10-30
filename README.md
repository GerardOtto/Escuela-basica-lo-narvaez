# Plataforma de notas · Escuela Básica Lo Narváez

Aplicación web para el registro de calificaciones de la Escuela Básica Lo Narváez
(RBD 1491-5, SLEP Marga Marga). Funciona completamente en el navegador; no requiere servidor.

## Funciones

- **Una pestaña por asignatura** (abajo, estilo Excel): estudiantes en filas y notas en columnas.
- **Promedio flexible**: se calcula solo con las notas ingresadas, sin importar cuántas sean.
  Se pueden agregar o eliminar columnas de nota cuando se necesite.
- **Concentración de notas**: estudiantes en filas, promedio de cada asignatura en columnas
  y **promedio final** (promedio de los promedios de las asignaturas que tienen notas).
  Orientación y los talleres tienen un switch para incluirlos o no en el promedio final
  (por defecto no se incluyen); cualquier otra asignatura se ajusta en «Curso…».
- **Informe de notas por estudiante** con el formato actual de la escuela, listo para imprimir o guardar en PDF.
- **Exportar a Excel** (.xlsx) con fórmulas activas: una hoja por asignatura, la concentración y la nómina.
- Varios cursos, escala 10–70 (también acepta 1,0–7,0), notas bajo 40 en rojo,
  navegación con Enter/flechas y pegado de bloques de notas desde Excel.

## Uso

Abrir `index.html` a través de un servidor web (por ejemplo GitHub Pages).
Los datos se guardan automáticamente en el navegador del equipo; usa
**Más → Descargar respaldo** con frecuencia y **Restaurar respaldo** para trasladarlos a otro equipo.

> Importante: como los datos viven en cada navegador, dos equipos distintos no comparten notas
> automáticamente. Para trabajo simultáneo entre varios profesores se requiere conectar una base de datos.

## Estructura

```
index.html        Página principal
css/styles.css    Estilos (pantalla e impresión)
js/app.js         Lógica: datos, cálculos, planillas, informes y exportación
assets/logo.png   Logo de la escuela
```
