# CAISSA Online — propuesta de panel contextual Tournament

Estado: propuesta de siguiente fase. Este documento no activa torneos, no añade una pestaña al producto y no cambia las capacidades actuales de CAISSA Online V1.

## Experiencia propuesta

`Tournament` aparecería como pestaña contextual del mismo panel de juego únicamente cuando el servidor entregue un contexto de torneo autorizado para la persona conectada. Reutilizaría la geometría del panel: cabecera y pie estables, con un solo cuerpo desplazable.

El cuerpo reuniría cuatro bloques:

1. Clasificación compacta con puesto, jugador, puntuación y desempate.
2. Tiempo restante del torneo, alimentado por una marca temporal autoritativa del servidor.
3. Posición del jugador, visible aunque quede fuera del tramo mostrado de la clasificación.
4. `Next game`, con rival, color, ritmo y estado de preparación; nunca debe inventar un emparejamiento mientras el servidor no lo haya confirmado.

## Maqueta visual revisable

La preview expone `/online/tournament-demo` como demostración aislada. La
ruta reutiliza el tablero y el único panel derecho de Online, muestra
explícitamente la etiqueta `Visual demo` y utiliza únicamente nombres,
clasificación, reloj y emparejamiento sintéticos. No consulta la API Online,
no crea una inscripción y no activa la pestaña Tournament en `/online`.

La cabecera del panel mantiene título, contexto y exactamente dos pestañas:
`Standings` y `Games`. No incluye `Chat`. El BODY es el único propietario del
desplazamiento: `Standings` reúne el tiempo restante y una tabla compacta con
la fila del jugador resaltada; `Games` contiene la posición del jugador y
`Next game`. El pie identifica que se trata de datos de demostración. En
móvil, el mismo panel se apila debajo del tablero sin crear otro scroll
interno.

`Next game` es deliberadamente una acción demostrativa: explica el handoff
que ocurriría después de recibir un emparejamiento confirmado, pero no abre ni
inventa una partida.

## Contrato que falta antes de implementarlo

- Identidad, estado y calendario autoritativos del torneo.
- Consulta de clasificación con paginación y una fila separada para la posición del jugador.
- Contrato de `Next game` y transición inequívoca hacia la partida privada.
- Autorización RLS y Realtime específica para participantes; no se heredan permisos de una partida ni se exponen canales privados.
- Reglas explícitas para inscripción, retirada, espectadores, reconexión, expiración y cierre.
- Feature flag independiente de `CAISSA_ONLINE_ROLLOUT`; desactivada por defecto.
- Estado de emparejamiento firmado por el servidor, con identificador de
  partida, color, ritmo, versión y fecha de expiración antes de habilitar
  `Next game`.
- Estados explícitos `waiting`, `assigned`, `ready`, `finished` y una política
  de recuperación cuando el emparejamiento caduque o cambie durante un resync.

## Responsive y accesibilidad

En escritorio la pestaña ocuparía el mismo panel alineado con el bloque rival–tablero–jugador. En móvil se apilaría después del tablero, sin reducirlo. La clasificación usaría encabezados accesibles, la posición actual tendría texto además de color, el tiempo restante se anunciaría sin crear una región viva ruidosa y el estado de `Next game` conservaría foco y orden de teclado.

## Criterios de entrada a desarrollo

La fase solo debería comenzar después de aprobar el contrato de backend, la separación de permisos, la política de privacidad y las pruebas de concurrencia. Su aceptación visual debe demostrar que alternar entre New Game, Games, Players y Tournament no crea un segundo scroll interno ni cambia la geometría del tablero.
