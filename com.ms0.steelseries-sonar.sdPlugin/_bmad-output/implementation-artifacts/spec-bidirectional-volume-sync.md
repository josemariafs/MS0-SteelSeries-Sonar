---
title: 'Sincronizacion bidireccional de volumenes Sonar'
type: 'bugfix'
created: '2026-05-21'
status: 'done'
baseline_commit: 'NO_VCS'
context:
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-com.ms0.steelseries-sonar.sdPlugin-2026-05-21/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-com.ms0.steelseries-sonar.sdPlugin-2026-05-21/addendum.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Al cambiar volumenes desde un knob, el audio cambia, pero la interfaz de SteelSeries GG Sonar puede seguir mostrando valores antiguos. En sentido inverso, si el usuario cambia un volumen desde SteelSeries GG Sonar, el plugin no actualiza los titulos de los knobs porque no hay polling y `contextList` nunca se rellena.

**Approach:** Implementar sincronizacion bidireccional minima: registrar contextos activos, leer periodicamente el estado real de Sonar para refrescar el plugin, y confirmar cambios hechos desde knobs releyendo Sonar despues de escribir. Mantener el alcance en la logica actual de volumenes y corregir solo lo necesario para que `Aux + Media` no rompa la consistencia.

## Boundaries & Constraints

**Always:** Los knobs deben mostrar el valor real leido desde Sonar tras cada escritura o polling. `Chat` debe seguir usando `chatRender`. Los volumenes deben limitarse entre 0 y 1. Los cambios desde Sonar deben reflejarse en todos los contextos activos del canal. La implementacion debe seguir siendo JavaScript simple sin dependencias nuevas.

**Ask First:** Si hace falta cambiar endpoints de la API Sonar a rutas no usadas actualmente, anadir soporte macOS, cambiar el manifest, crear Property Inspector configurable, o reescribir el plugin entero en otro patron.

**Never:** No agregar canales nuevos, no implementar configuracion de intervalo/paso desde UI, no convertir esto en empaquetado publico, no depender de servicios externos, no ocultar fallos mostrando exito optimista permanente.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Knob -> Sonar | Usuario gira `Game` con Sonar activo | Se escribe el nuevo volumen, se re-lee Sonar, y el titulo muestra el porcentaje confirmado | Si falla el PUT o GET, mostrar estado breve de error y no mantener exito falso |
| Sonar -> plugin | Usuario cambia `Media` desde GG/Sonar con el dial visible | En el siguiente ciclo de polling el titulo del dial muestra el valor real | Si Sonar no responde, mantener plugin vivo y registrar error |
| Multiple contexts | Dos diales del mismo canal estan activos | Ambos titulos se actualizan al mismo valor tras polling o cambio desde un dial | Contextos desaparecidos se eliminan en `willDisappear` |
| Aux + Media | Usuario gira o pulsa `Aux + Media` | `aux` y `media` se escriben por separado y el titulo muestra `aux% / media%` confirmado | Si una escritura falla, re-sincronizar antes de mostrar valor final |

</frozen-after-approval>

## Code Map

- `plugin/index.js` -- Logica Sonar: discovery, GET/PUT, estado de volumen, handlers de dial, `updateAllVolumes()` y `updateDisplays()`.
- `plugin/utils/common.js` -- Clase `Actions`; punto correcto para mantener `contextList` por accion en `willAppear` y `willDisappear`.
- `_bmad-output/planning-artifacts/prds/prd-com.ms0.steelseries-sonar.sdPlugin-2026-05-21/prd.md` -- FR-3, FR-5, FR-7, FR-8 y FR-14.
- `_bmad-output/planning-artifacts/prds/prd-com.ms0.steelseries-sonar.sdPlugin-2026-05-21/addendum.md` -- Evidencia de `contextList` roto, `setPut` sin `await` y riesgos de `Aux + Media`.

## Tasks & Acceptance

**Execution:**
- [x] `plugin/utils/common.js` -- Registrar `contextList` en `Actions.willAppear` y limpiar en `Actions.willDisappear` -- habilita refresco de todos los diales activos.
- [x] `plugin/index.js` -- Hacer `getFetch`/`setPut` robustos con status HTTP, `await` y helpers de formato/clamp -- evita exito optimista permanente.
- [x] `plugin/index.js` -- Anadir polling ligero tras bootstrap Sonar y reintento seguro si Sonar no esta listo -- permite Sonar -> plugin.
- [x] `plugin/index.js` -- Releer `volumeSettings` despues de cada escritura local y actualizar todos los contextos visibles -- permite plugin -> Sonar -> UI plugin consistente.
- [x] `plugin/index.js` -- Corregir `Aux + Media` para escribir `aux` y `media`, no `mixer`, y mostrar ambos valores confirmados -- elimina bug visible.

**Acceptance Criteria:**
- Given un dial visible y Sonar activo, when el volumen del mismo canal cambia en SteelSeries GG Sonar, then el titulo del dial se actualiza al valor real en el siguiente polling.
- Given un knob individual, when el usuario lo gira, then el plugin escribe el canal correcto en Sonar, re-lee el estado y muestra el porcentaje confirmado.
- Given dos diales del mismo canal, when uno cambia por Sonar o por knob, then ambos titulos convergen al mismo porcentaje.
- Given `Aux + Media`, when el usuario gira el knob, then `aux` y `media` cambian juntos y el titulo muestra ambos porcentajes confirmados.
- Given Sonar no responde, when ocurre polling o giro, then el plugin no se rompe y muestra un estado de error breve en los contextos activos.

## Spec Change Log

## Design Notes

Usar `contextList` minimiza cambios porque `updateDisplays()` ya estaba disenado para ese modelo. El polling puede empezar con un intervalo fijo de 3000-5000 ms para uso personal; no se expone configuracion en esta historia. Para reducir riesgo, no se exige refactor declarativo completo de canales en esta historia, aunque se permiten helpers pequenos para evitar repetir clamping, formato y lectura confirmada.

## Verification

**Commands:**
- `node --check plugin/index.js` -- expected: sintaxis JavaScript valida.
- `node --check plugin/utils/common.js` -- expected: sintaxis JavaScript valida.

**Manual checks (if no CLI):**
- Con Sonar abierto, cambiar `Game` desde GG y verificar que el dial se actualiza.
- Girar `Chat` desde el Stream Dock y verificar que GG/Sonar y el titulo convergen.
- Probar `Aux + Media` subiendo, bajando y pulsando; esperar `aux% / media%` correcto.

## Suggested Review Order

**Sincronizacion y confirmacion**

- Entrada principal: polling, modo activo, confirmacion forzada y errores.
  [`index.js:169`](../../plugin/index.js#L169)

- Escrituras locales esperan PUT y relectura real de Sonar.
  [`index.js:213`](../../plugin/index.js#L213)

- Bootstrap y retry evitan reinicios manuales cuando Sonar tarda.
  [`index.js:255`](../../plugin/index.js#L255)

**Acciones de knob**

- Acciones individuales comparten giro, mute y error por canal.
  [`index.js:282`](../../plugin/index.js#L282)

- Aux + Media escribe ambos canales y confirma ambos valores.
  [`index.js:353`](../../plugin/index.js#L353)

**Contextos activos**

- Cada accion registra y limpia contextos para actualizar todos los diales.
  [`common.js:23`](../../plugin/utils/common.js#L23)
