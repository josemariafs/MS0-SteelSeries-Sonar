# Addendum Tecnico

Este addendum conserva detalles tecnicos observados durante discovery que pueden alimentar arquitectura, epicas o tareas de implementacion. No sustituye al PRD.

## Evidencia Del Codigo Actual

- `manifest.json` define seis acciones de tipo `Knob`: `Master`, `Game`, `Chat`, `Media`, `Aux` y `Aux + Media`.
- `plugin/index.js` descubre Sonar leyendo `C:/ProgramData/SteelSeries/SteelSeries Engine 3/coreProps.json`, consulta `/subApps`, obtiene `webServerAddress`, lee `/mode/` y despues usa `/volumeSettings/{mode}`.
- El modo `stream` se normaliza a `streamer`.
- Los canales individuales hacen `GET` antes de cada giro, aplican delta de `0.05`, hacen `PUT` a `/volumeSettings/{mode}/{channel}/Volume/{value}` y actualizan el titulo.
- `Chat` usa `chatRender` como canal de Sonar.
- `Aux + Media` tiene comportamiento especial y debe revisarse con prioridad porque combina dos canales.
- `updateDisplays()` intenta actualizar contextos activos mediante `contextList`, pero no se observa inicializacion de esas listas.
- `setPut()` no espera ni valida la respuesta del `fetch`.
- Los Property Inspectors actuales son paneles minimos sin configuracion funcional.
- Hay logs de depuracion y textos provisionales visibles o potencialmente visibles.

## Riesgos Tecnicos Para Implementacion

- Ruta fija de Windows para `coreProps.json`; el manifest declara macOS, pero el codigo actual no parece portable.
- Si Sonar no esta listo cuando aparece una accion, `webServerAddress` puede estar vacio.
- Variables globales por canal pueden desincronizar multiples instancias del mismo canal.
- La sincronizacion actual es reactiva al aparecer o interactuar; no detecta cambios externos en GG/Sonar.
- La accion `Aux + Media` parece escribir a un endpoint inconsistente en `dialDown` y puede mostrar valores incorrectos tras `dialRotate`.
- `layouts/$B1.json` incluye indicador visual, pero solo `Game` aplica el layout y no se observa actualizacion del indicador.

## Referencias Externas Ligeras

Busqueda web ligera encontro integraciones publicas de SteelSeries Sonar para Stream Deck y wrappers de API local. Algunas integraciones usan polling periodico y soportan mas canales o modos. Para este PRD, esas referencias solo justifican que polling ligero y controles de volumen por canal son patrones razonables; no obligan a copiar alcance de producto publico.
