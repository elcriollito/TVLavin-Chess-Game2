# CAISSA Online — propuesta de panel contextual Tournament

Estado: propuesta de siguiente fase. Este documento no activa torneos, no añade una pestaña al producto y no cambia las capacidades actuales de CAISSA Online V1.

## Experiencia propuesta

`Tournament` aparecería como pestaña contextual del mismo panel de juego únicamente cuando el servidor entregue un contexto de torneo autorizado para la persona conectada. Reutilizaría la geometría del panel: cabecera y pie estables, con un solo cuerpo desplazable.

El cuerpo reuniría cuatro bloques:

1. Clasificación compacta con puesto, jugador, puntuación y desempate.
2. Tiempo restante del torneo, alimentado por una marca temporal autoritativa del servidor.
3. Posición del jugador, visible aunque quede fuera del tramo mostrado de la clasificación.
4. `Next game`, con rival, color, ritmo y estado de preparación; nunca debe inventar un emparejamiento mientras el servidor no lo haya confirmado.

## Contrato que falta antes de implementarlo

- Identidad, estado y calendario autoritativos del torneo.
- Consulta de clasificación con paginación y una fila separada para la posición del jugador.
- Contrato de `Next game` y transición inequívoca hacia la partida privada.
- Autorización RLS y Realtime específica para participantes; no se heredan permisos de una partida ni se exponen canales privados.
- Reglas explícitas para inscripción, retirada, espectadores, reconexión, expiración y cierre.
- Feature flag independiente de `CAISSA_ONLINE_ROLLOUT`; desactivada por defecto.

## Responsive y accesibilidad

En escritorio la pestaña ocuparía el mismo panel alineado con el bloque rival–tablero–jugador. En móvil se apilaría después del tablero, sin reducirlo. La clasificación usaría encabezados accesibles, la posición actual tendría texto además de color, el tiempo restante se anunciaría sin crear una región viva ruidosa y el estado de `Next game` conservaría foco y orden de teclado.

## Criterios de entrada a desarrollo

La fase solo debería comenzar después de aprobar el contrato de backend, la separación de permisos, la política de privacidad y las pruebas de concurrencia. Su aceptación visual debe demostrar que alternar entre New Game, Games, Players y Tournament no crea un segundo scroll interno ni cambia la geometría del tablero.
