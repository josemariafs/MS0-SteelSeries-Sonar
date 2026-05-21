---
title: "PRD: Mejoras del plugin MS0 SteelSeries Sonar para Mirabox N4 Stream Dock"
status: draft
created: 2026-05-21
updated: 2026-05-21
---

# PRD: Mejoras del plugin MS0 SteelSeries Sonar para Mirabox N4 Stream Dock

## 0. Proposito Del Documento

Este PRD define una mejora incremental del plugin `MS0 SteelSeries Sonar`, un plugin personal para Mirabox N4 Stream Dock que controla volumenes de SteelSeries GG Sonar desde los diales fisicos. El documento esta pensado para convertir el estado funcional actual en una lista de mejoras implementables, con requisitos claros y supuestos marcados para revision. Se basa principalmente en el codigo actual del repositorio, el resumen del propietario y un contraste ligero con integraciones publicas similares de Sonar.

## 1. Vision

El plugin debe hacer que controlar SteelSeries GG Sonar desde el Stream Dock sea inmediato, fiable y visible. La experiencia objetivo es simple: girar un dial para cambiar el volumen de un canal Sonar, pulsarlo para silenciar o restaurar, y ver en el hardware el estado real que queda aplicado en Sonar.

La version actual ya es estable y funcional, por lo que la siguiente iteracion no debe reinventar el producto. Debe corregir errores pequenos pero molestos, reducir deuda tecnica que dificulta mantener las seis acciones actuales, y mejorar la sincronizacion entre Stream Dock y SteelSeries GG Sonar. La regla central es que cualquier accion ejecutada desde el plugin debe aplicar el cambio en Sonar y reflejar despues el valor real resultante, no solo un valor calculado localmente.

Para uso personal, el exito no exige una experiencia de marketplace completa. Si exige que el plugin sea confiable en el equipo principal, que falle de forma comprensible cuando Sonar no este disponible y que sea facil extenderlo con pequenas mejoras futuras.

## 2. Usuario Objetivo

### 2.1 Persona Principal

El usuario principal es el propietario del plugin: un usuario de Mirabox N4 Stream Dock y SteelSeries GG Sonar que quiere controlar rapidamente mezclas de audio sin abrir GG. Usa el hardware durante sesiones donde alterna audio de juego, chat, media y auxiliares, y valora mas la rapidez y fiabilidad que una configuracion avanzada.

### 2.2 Jobs To Be Done

- Ajustar volumenes de Sonar desde el hardware sin cambiar de ventana.
- Silenciar y restaurar canales con una pulsacion rapida.
- Ver en el Stream Dock el volumen que realmente queda aplicado en Sonar.
- Mantener una version personal estable que pueda evolucionar sin romper lo que ya funciona.
- Detectar rapidamente cuando GG/Sonar no esta disponible o la conexion local ha fallado.

### 2.3 No Usuarios En v1

- Usuarios de otros mezcladores de audio que no usen SteelSeries GG Sonar.
- Usuarios que necesiten soporte comercial, instalador publico o documentacion de marketplace.
- Usuarios que necesiten automatizaciones complejas, perfiles compartidos o multiacciones.

### 2.4 Recorridos Clave

- **UJ-1. Ajustar un canal durante una sesion.** El usuario esta en una partida o llamada, gira el dial de `Game`, `Chat`, `Media`, `Aux` o `Master`, el plugin lee el valor actual de Sonar, aplica un cambio incremental, confirma el cambio contra Sonar y actualiza el titulo del dial con el porcentaje final.
- **UJ-2. Silenciar y restaurar rapidamente.** El usuario pulsa el dial de un canal, el plugin guarda el volumen anterior, ajusta el canal a `0`, muestra `MUTED`, y al pulsar de nuevo restaura el volumen anterior y lo aplica en Sonar.
- **UJ-3. Controlar Aux y Media juntos.** El usuario usa el dial combinado `Aux + Media`, gira para subir o bajar ambos canales a la vez, y ve en el hardware los dos porcentajes reales despues de aplicar los cambios.
- **UJ-4. Recuperarse de una conexion rota.** El usuario arranca el Stream Dock antes que SteelSeries GG Sonar o Sonar reinicia su servidor local. El plugin detecta que no puede leer o escribir, muestra un estado de error en el dial y vuelve a sincronizar cuando Sonar esta disponible. [ASSUMPTION: se quiere recuperacion automatica en vez de obligar a reiniciar el software.]

## 3. Glosario

- **Stream Dock** — Hardware Mirabox N4 Stream Dock donde viven las acciones y diales del plugin.
- **Dial** — Control fisico tipo knob que puede girarse (`dialRotate`) o pulsarse (`dialDown`).
- **Sonar** — SteelSeries GG Sonar, software de audio que expone una API local para leer y modificar volumenes.
- **Canal Sonar** — Mezcla controlable por el plugin: `Master`, `Game`, `Chat`, `Media`, `Aux`, o combinacion `Aux + Media`.
- **Modo Sonar** — Modo devuelto por Sonar, principalmente `classic` o `streamer`.
- **Valor real** — Volumen que Sonar devuelve tras leer su estado, no el valor estimado por el plugin.
- **Property Inspector** — Panel de configuracion de cada accion dentro del software Stream Dock.

## 4. Funcionalidades

### 4.1 Conexion Robusta Con Sonar

**Descripcion:** El plugin debe descubrir el servidor local de Sonar, leer el modo activo y mantener una conexion util incluso cuando GG/Sonar arranque tarde o reinicie su API. Realiza UJ-1 y UJ-4.

#### FR-1: Descubrir Sonar Al Arrancar

El plugin debe leer la informacion de SteelSeries GG y obtener `webServerAddress` antes de intentar leer o escribir volumenes.

**Consecuencias testables:**
- Si `coreProps.json` existe y Sonar esta activo, el plugin obtiene el servidor local y carga volumenes iniciales.
- Si el modo devuelto es `stream`, el plugin lo normaliza a `streamer`.
- Si la lectura inicial falla, el plugin no debe romper los handlers de dial.

#### FR-2: Reintentar Conexion Cuando Sonar No Este Disponible

El plugin debe exponer un estado recuperable cuando Sonar no este disponible y reintentar el descubrimiento sin requerir reiniciar el plugin. Realiza UJ-4. [ASSUMPTION: un reintento cada 5-10 segundos es suficiente para uso personal.]

**Consecuencias testables:**
- Si Sonar esta cerrado, el dial muestra un mensaje breve como `SONAR?` o `OFF`.
- Cuando Sonar vuelve a estar disponible, el plugin sincroniza volumenes y restaura la visualizacion normal.
- Los errores de red se registran sin llenar la consola con logs repetitivos.

### 4.2 Control De Volumen Por Canal

**Descripcion:** Las acciones `Master`, `Game`, `Chat`, `Media` y `Aux` deben compartir un comportamiento consistente: leer el valor real, aplicar un incremento o decremento, persistirlo en Sonar y actualizar el hardware. Realiza UJ-1 y UJ-2.

#### FR-3: Ajustar Volumen Por Dial

Al girar un dial, el plugin debe modificar el canal Sonar correspondiente en pasos configurables o, por defecto, en pasos de 5%. [ASSUMPTION: se mantiene 5% como valor por defecto porque ya es el comportamiento actual.]

**Consecuencias testables:**
- El volumen nunca baja de 0% ni sube de 100%.
- Cada giro ejecuta un `PUT` contra el canal Sonar correcto.
- El titulo del dial muestra el porcentaje final aplicado.
- `Chat` usa el canal Sonar `chatRender`.

#### FR-4: Silenciar Y Restaurar Canal

Al pulsar un dial individual, el plugin debe alternar entre silencio y el ultimo volumen conocido del canal.

**Consecuencias testables:**
- Si el canal no esta en 0%, la pulsacion guarda el valor anterior, aplica 0% en Sonar y muestra `MUTED`.
- Si el canal esta en 0% y existe valor anterior, la pulsacion restaura ese valor en Sonar.
- Si no existe valor anterior, el plugin debe restaurar un valor razonable o mantener 0% sin producir error. [ASSUMPTION: restaurar el ultimo valor de la sesion es suficiente; no hace falta persistirlo entre reinicios.]

### 4.3 Accion Combinada Aux + Media

**Descripcion:** La accion combinada permite tratar `Aux` y `Media` como un par para subir, bajar o silenciar ambos canales juntos. Esta accion debe corregir inconsistencias actuales y mostrar siempre ambos valores. Realiza UJ-3.

#### FR-5: Ajustar Aux Y Media En Paralelo

Al girar `Aux + Media`, el plugin debe leer ambos valores reales, aplicar el mismo delta a cada uno, escribir ambos canales en Sonar y mostrar los dos porcentajes finales.

**Consecuencias testables:**
- El plugin escribe en `aux` y `media`, no en un endpoint no relacionado.
- El titulo final usa el valor final de `aux` y el valor final de `media`.
- Si una escritura falla, el plugin muestra un estado de error o re-sincroniza antes de mostrar exito.

#### FR-6: Silenciar Y Restaurar Aux + Media

Al pulsar `Aux + Media`, el plugin debe alternar ambos canales entre silencio y sus valores previos respectivos.

**Consecuencias testables:**
- `Aux` y `Media` conservan valores previos separados.
- El titulo no debe mostrar solo `MUTED` si uno de los dos canales queda activo.
- La restauracion aplica `aux` y `media` en sus endpoints correctos.

### 4.4 Sincronizacion Y Feedback Visual

**Descripcion:** El Stream Dock debe representar el estado real de Sonar con suficiente frescura para que el hardware sea confiable. Para uso personal, esto puede resolverse con lectura al aparecer, lectura antes de escribir y polling ligero. Realiza UJ-1, UJ-2, UJ-3 y UJ-4.

#### FR-7: Sincronizar Cambios Externos

El plugin debe detectar periodicamente cambios hechos directamente en SteelSeries GG Sonar y actualizar los diales activos. [ASSUMPTION: polling es aceptable porque la API usada es local y no hay evidencia de eventos push disponibles en este plugin.]

**Consecuencias testables:**
- Si el usuario cambia un volumen en GG, el dial refleja el nuevo valor en el siguiente ciclo de sincronizacion.
- El polling puede desactivarse o ajustarse desde configuracion si resulta molesto.
- El polling no bloquea interacciones de giro o pulsacion.

#### FR-8: Mostrar Estado Consistente En Todos Los Diales Activos

El plugin debe mantener una lista real de contextos activos por accion o un mecanismo equivalente para actualizar todas las instancias visibles.

**Consecuencias testables:**
- Si hay dos diales del mismo canal, ambos muestran el mismo valor despues de una escritura o sincronizacion.
- El codigo de refresco global no depende de propiedades nunca inicializadas.
- Los estados `MUTED`, porcentaje y error siguen el mismo formato en todas las acciones.

#### FR-9: Usar Feedback Visual De Dial Cuando Aporte Valor

El plugin debe decidir si usa layouts con barra/indicador de forma consistente, no solo para `Game`. [ASSUMPTION: si el layout del Stream Dock soporta indicador, se quiere aplicarlo a todos los canales individuales.]

**Consecuencias testables:**
- Todos los canales individuales usan la misma representacion visual o ninguno la usa.
- Si se usa barra, el valor de la barra coincide con el porcentaje mostrado.
- `Aux + Media` mantiene un formato legible aunque no pueda representar dos barras.

### 4.5 Configuracion Ligera En Property Inspector

**Descripcion:** Los Property Inspectors actuales son esqueletos. Para uso personal, deben ofrecer solo opciones que cambien de verdad la experiencia y evitar configuracion innecesaria.

#### FR-10: Configurar Paso De Volumen

Cada accion debe permitir elegir el incremento por tick, con 5% como valor por defecto.

**Consecuencias testables:**
- El ajuste se guarda por accion usando settings del Stream Dock.
- Valores validos: 1%, 2%, 5% y 10%. [ASSUMPTION: estos pasos cubren el uso personal sin complicar la UI.]
- El cambio se aplica sin reiniciar el plugin.

#### FR-11: Configurar Sincronizacion

El usuario debe poder elegir si el plugin sincroniza cambios externos y con que intervalo basico.

**Consecuencias testables:**
- Hay al menos tres opciones: desactivado, normal y frecuente.
- El valor por defecto prioriza estabilidad sobre consumo.
- El panel explica brevemente que la sincronizacion detecta cambios realizados desde GG/Sonar.

### 4.6 Pulido De Producto Y Mantenibilidad

**Descripcion:** La mejora debe eliminar placeholders, logs de depuracion y duplicacion que dificulten mantener el plugin.

#### FR-12: Sustituir Placeholders Y Localizacion Basica

El manifest y la localizacion deben describir correctamente cada accion.

**Consecuencias testables:**
- Ningun tooltip visible contiene texto provisional.
- `es_ES.json` referencia acciones reales o textos usados por el plugin.
- La URL del plugin deja de apuntar a un destino irrelevante o queda vacia si no aplica.

#### FR-13: Reducir Duplicacion De Acciones

El codigo debe centralizar la logica compartida de canales para que agregar o corregir un canal no requiera editar seis bloques casi identicos.

**Consecuencias testables:**
- Hay una configuracion declarativa por canal con identificador, ruta Sonar y formato de titulo.
- La logica de leer, escribir, clamping, mute y error se comparte.
- `Aux + Media` conserva tratamiento especial sin copiar toda la logica.

#### FR-14: Manejar Errores De Escritura

Las escrituras a Sonar deben esperar respuesta y manejar fallo.

**Consecuencias testables:**
- El plugin usa `await` o flujo equivalente para los `PUT`.
- Si Sonar rechaza o no responde, el dial no muestra un falso exito permanente.
- Tras un fallo, el plugin intenta re-leer el valor real antes de mostrar estado final.

## 5. Requisitos No Funcionales

- **Fiabilidad:** las acciones no deben lanzar excepciones no controladas si Sonar esta cerrado, tarda en arrancar o cambia de puerto.
- **Rendimiento:** la sincronizacion periodica no debe sentirse pesada en uso personal; el intervalo por defecto no debe saturar la API local.
- **Compatibilidad:** Windows es la plataforma prioritaria para el MVP porque el codigo actual usa una ruta fija de `C:/ProgramData`. [ASSUMPTION: macOS queda fuera del MVP aunque el manifest lo declare.]
- **Mantenibilidad:** las nuevas mejoras deben reducir el monolito de acciones duplicadas antes de ampliar funcionalidades.
- **Observabilidad personal:** los errores importantes deben ser visibles en el dial o Property Inspector; la consola queda para diagnostico, no para feedback de usuario.

## 6. No Objetivos

- No convertir el plugin en producto publico de marketplace en esta iteracion.
- No soportar otros mezcladores de audio que no sean SteelSeries GG Sonar.
- No implementar perfiles complejos, automatizaciones, escenas o multiacciones.
- No agregar controles de microfono, chat mix u otros endpoints nuevos hasta estabilizar volumenes actuales. [NOTE FOR PM: otros plugins publicos soportan mas funciones; revisitar si esta version queda solida.]
- No garantizar soporte macOS en MVP aunque el manifest lo declare actualmente.

## 7. Alcance MVP

### 7.1 Incluido

- Correccion de errores actuales en `Aux + Media`.
- Conexion/reconexion basica con Sonar.
- Lectura y escritura confirmada de volumenes por canal.
- Sincronizacion periodica opcional para cambios hechos en GG/Sonar.
- Feedback visual consistente en diales.
- Property Inspector minimo para paso de volumen y sincronizacion.
- Limpieza de tooltips, logs de depuracion y localizacion basica.
- Refactor suficiente para reducir duplicacion de las seis acciones.

### 7.2 Fuera Del MVP

- Instalador, documentacion publica y empaquetado comercial.
- Soporte completo macOS.
- Nuevos canales Sonar no existentes en el plugin actual.
- Persistencia avanzada de estados previos entre reinicios.
- Tests automatizados end-to-end contra Sonar real. [ASSUMPTION: para uso personal bastan pruebas manuales guiadas y, si se puede, mocks ligeros de API.]

## 8. Metricas De Exito

**Primarias**

- **SM-1:** El plugin aplica correctamente el cambio en Sonar en 100% de las pruebas manuales para `Master`, `Game`, `Chat`, `Media`, `Aux` y `Aux + Media`. Valida FR-3, FR-4, FR-5 y FR-6.
- **SM-2:** Cambios hechos directamente en GG/Sonar se reflejan en el Stream Dock dentro del intervalo configurado. Valida FR-7 y FR-8.
- **SM-3:** Cerrar y reabrir Sonar no obliga a reiniciar el plugin para recuperar control. Valida FR-1 y FR-2.

**Secundarias**

- **SM-4:** No quedan tooltips provisionales ni logs de depuracion obvios en uso normal. Valida FR-12.
- **SM-5:** La logica comun de volumen queda centralizada, reduciendo cambios duplicados al corregir un canal. Valida FR-13.

**Counter-metrics**

- **SM-C1:** No optimizar por frecuencia extrema de polling si aumenta ruido, consumo o riesgo de fallos. Contrapesa SM-2.
- **SM-C2:** No anadir muchas opciones al Property Inspector si dificultan mantener el plugin. Contrapesa FR-10 y FR-11.

## 9. Historias Implementables

- **Story-1:** Como usuario, quiero que cada dial individual lea, ajuste y confirme el volumen real de su canal Sonar para confiar en el valor mostrado.
- **Story-2:** Como usuario, quiero que `Aux + Media` ajuste y silencie ambos canales correctamente para usarlo sin errores de endpoint o visualizacion.
- **Story-3:** Como usuario, quiero que el plugin detecte cuando Sonar no esta disponible y se recupere solo para no reiniciar Stream Dock.
- **Story-4:** Como usuario, quiero que los diales reflejen cambios realizados en GG/Sonar para que el hardware no muestre valores obsoletos.
- **Story-5:** Como usuario, quiero configurar el paso de volumen y la sincronizacion desde el Property Inspector para adaptar el comportamiento sin tocar codigo.
- **Story-6:** Como mantenedor, quiero una configuracion comun por canal para corregir o extender acciones sin duplicar logica.

## 10. Preguntas Abiertas

1. Confirmar si Windows es el unico objetivo real del MVP o si el manifest debe seguir anunciando macOS.
2. Confirmar el intervalo de sincronizacion deseado: 5s, 10s, 30s o solo al interactuar.
3. Confirmar si el mute debe restaurar el valor previo solo durante la sesion o persistirlo entre reinicios.
4. Confirmar si el layout con barra debe aplicarse a todos los diales o retirarse para mantener titulos simples.
5. Confirmar si se quieren nuevos canales o funciones de Sonar despues de estabilizar los seis controles actuales.

## 11. Indice De Supuestos

- Se quiere recuperacion automatica si Sonar arranca tarde o reinicia su API.
- Un reintento cada 5-10 segundos es suficiente para uso personal.
- Se mantiene 5% como paso por defecto porque ya es el comportamiento actual.
- Restaurar el ultimo valor de la sesion es suficiente para mute/unmute.
- Polling es aceptable para detectar cambios externos de Sonar.
- Si el layout del Stream Dock soporta indicador, se quiere aplicarlo a todos los canales individuales.
- Los pasos 1%, 2%, 5% y 10% cubren el uso personal.
- macOS queda fuera del MVP aunque el manifest lo declare.
- Para uso personal bastan pruebas manuales guiadas y mocks ligeros si se agregan tests.
