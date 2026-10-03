# Calendario: round robin ida y vuelta (método del círculo)

Código: `backend/app/domain/round_robin.py` (función pura `generate_fixtures`). Tests: `backend/tests/domain/test_round_robin.py`.
Estado: la función está implementada y probada; **todavía nada la llama**. Guardar los partidos en `matches` al iniciar el torneo es trabajo de la fase del admin (NO IMPLEMENTADO).

## Reglas

| N participantes | Rondas | Partidos | Descansos |
|---|---|---|---|
| par | 2·(N−1) | N·(N−1) | ninguno |
| impar | 2·N | N·(N−1) | 1 participante por ronda (BYE, sin fila en `matches`) |

Ejemplos: N=4 → 6 rondas, 12 partidos. N=25 → 50 rondas, 600 partidos. N=2 → 2 rondas, 2 partidos.
Cada pareja se enfrenta exactamente 2 veces: una en la ida y otra en la vuelta con local y visitante invertidos.

## Algoritmo

1. Se recibe la lista de participantes **en un orden fijado por quien llama** (mismo orden → mismo calendario; la función no usa azar).
2. Si N es impar se añade un hueco vacío (BYE) para que el total sea par. Sea `size` ese total.
3. El primer participante queda **fijo**; los demás giran. En cada ronda `r` (0…size−2):
   - se arma la fila `[fijo, *giratorios]`;
   - se empareja la posición `i` con la posición `size−1−i` (extremos contra extremos, hacia el centro);
   - si una pareja incluye el BYE, ese participante descansa y no se crea partido;
   - el primero de cada pareja es el local, salvo en la pareja del fijo (`i=0`), donde el local alterna en cada ronda para que el fijo no sea siempre local en la ida;
   - después se gira: el último giratorio pasa al principio.
4. Eso produce `size−1` rondas: la **ida**. La **vuelta** repite cada partido con local y visitante intercambiados, en las rondas `size…2·(size−1)`.

## Ejemplo con 4 equipos (A, B, C, D) — salida real del código

Giro de la lista (el fijo es A):

| Ronda | Fila `[fijo, *giratorios]` | Parejas (pos. i con pos. 3−i) |
|---|---|---|
| 1 | A B C D | A–D, B–C |
| 2 | A D B C | A–C, D–B |
| 3 | A C D B | A–B, C–D |

Calendario completo (local vs visitante):

| Ronda | Vuelta | Partidos |
|---|---|---|
| 1 | ida | A vs D · B vs C |
| 2 | ida | **C vs A** · D vs B |
| 3 | ida | A vs B · C vs D |
| 4 | vuelta | D vs A · C vs B |
| 5 | vuelta | A vs C · B vs D |
| 6 | vuelta | B vs A · D vs C |

Obsérvese la ronda 2: A–C se escribe «C vs A» porque en las rondas impares (índice `r` = 1, 3, …) se invierte la pareja del fijo. Las rondas 4–6 son las 1–3 con local y visitante cambiados.
Comprobación: 6 rondas = 2·(4−1); 12 partidos = 4·3; cada equipo juega una vez por ronda; cada pareja aparece dos veces.

## Con número impar: 3 equipos (A, B, C)

Se añade el BYE: `[A, B, C, ∅]`. Salida real (la ronda donde descansa alguien no tiene fila para él):

| Ronda | Vuelta | Partido | Descansa |
|---|---|---|---|
| 1 | ida | B vs C | A |
| 2 | ida | C vs A | B |
| 3 | ida | A vs B | C |
| 4 | vuelta | C vs B | A |
| 5 | vuelta | A vs C | B |
| 6 | vuelta | B vs A | C |

6 rondas = 2·3; 6 partidos = 3·2; cada equipo descansa 2 veces (una por vuelta).

## Qué garantizan los tests

Para N = 2, 3, 4, 5, 6 y 25: nadie juega contra sí mismo; cada par ordenado (local, visitante) aparece una vez, es decir cada pareja exactamente dos veces con local invertido y la vuelta después de la ida; nadie juega dos veces en una ronda; número de rondas y de partidos correcto; con N impar exactamente un descanso por ronda y cada participante descansa 2 veces; con N par todos juegan en todas las rondas; cada uno tiene N−1 partidos de local y N−1 de visitante. Además se fija el ejemplo exacto de 4 equipos de este documento.

## Límites conocidos

- La alternancia local/visitante de la ida solo evita el caso más evidente (el fijo). No garantiza que ningún equipo encadene 3 partidos de local seguidos; no era un requisito.
- La base de datos refuerza lo esencial con `UNIQUE(tournament_id, home_participant_id, away_participant_id)` y `CHECK(home <> away)`, pero no valida que el calendario sea un round robin: eso lo garantiza el dominio.
