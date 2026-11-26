# Recordatorios de cita (spec 24)

El cliente recibe un recordatorio antes de su cita, por el canal que el
negocio elija. El backend lo programa por dentro (sin cron externo) y el
`owner` lo configura desde el panel.

## Configuración por negocio

La configuración vive en el documento del negocio (`tenants.reminders`):

```ts
reminders: {
  enabled: boolean;              // por defecto true
  channels: ('email')[];  // por defecto ['email']
  hoursBefore: number[];         // por defecto [24, 3]
  template: string;               // con los marcadores del mensaje
}
```

Un negocio que nunca guardó nada tiene los valores por defecto: activado,
los dos canales, 24 y 3 horas antes, y la plantilla por defecto.

La plantilla por defecto:

```
Hola {cliente}, te recordamos tu cita en {negocio}: {fecha} a las {hora} con {profesional}. Si necesitas cancelar, entra aquí: {cancelar}
```

| Marcador      | Qué pone                                                      |
| ------------- | ------------------------------------------------------------- |
| `{cliente}`   | el nombre del cliente                                          |
| `{fecha}`     | la fecha de la cita en español ("Miércoles, 25 de marzo de 2026") |
| `{hora}`      | la hora de la cita ("10:00")                                   |
| `{profesional}` | el nombre del profesional                                    |
| `{negocio}`   | el nombre del negocio                                          |
| `{cancelar}`  | el enlace que cancela esa reserva                              |

Un marcador que no existe se queda como está. El mensaje solo lleva datos
de esa reserva y de ese negocio: nunca los de otro cliente.

## Reglas

- **Qué reserva hay que recordar ahora:** la ventana de `hoursBefore` se
  abre `hoursBefore` horas antes de la cita y se cierra cuando la cita
  empieza. Con `[24, 3]` hay dos ventanas: 24 horas antes y 3 horas antes.
- **Una vez por ventana y canal:** la reserva guarda lo que se le mandó
  (`bookings.reminders`), así que una vuelta repetida no duplica el mensaje.
- **Se manda una vez por ventana:** la misma ventana con otro canal son dos
  recordatorios distintos (uno por ventana).
- **Cancelada o en el pasado: no se recuerda.** Una reserva cancelada antes
  de la ventana no recibe nada.
- **Canales:** email si el cliente dejó correo,
  los dos si dejó los dos, ninguno si no dejó ninguno (y solo si el
  negocio los tiene activados).
- **Fallo de mejor esfuerzo:** si el proveedor falla, se anota como fallido
  y se reintenta en la vuelta siguiente, hasta **3 intentos**. Un fallo no
  rompe nada más.
- **Zona horaria:** la global (`BUSINESS_TIMEZONE`), no una por negocio
  (spec 18). Queda anotado como limitación.

El plan también manda: el plan `gratis` **no** permite recordatorios
(spec 23). Un negocio sin suscripción no está gobernado por un plan y sí
puede mandarlos.

## El registro en la reserva

```ts
reminders?: {
  kind: string;              // la ventana: '24h', '3h'
  channel: 'email';
  sentAt: Date;
  ok: boolean;
  error?: string;            // por qué falló, cuando falló
  attempts: number;          // cuántas veces se intentó
}[]
```

El panel de la reserva la muestra tal cual (`GET /api/admin/bookings/:id` y
`GET /api/admin/bookings` incluyen `reminders`).

## El enlace de cancelar

El enlace del recordatorio cancela **esa** reserva y solo esa. Como la
reserva guarda el digest del secreto y no el secreto, el recordatorio
genera su propio secreto al salir, guarda **solo su digest**
(`reminderCancelTokenHash`) y manda el secreto en el mensaje. Los dos
digests (el de la reserva y el del recordatorio) cancelan la misma reserva.
Nunca se guarda un secreto en claro.

## API (solo `owner`)

- `GET /api/admin/reminders` -> `200`

  ```json
  {
    "config": {
      "enabled": true,
      "channels": ["email"],
      "hoursBefore": [24, 3],
      "template": "Hola {cliente}, te recordamos tu cita en {negocio}: {fecha} a las {hora} con {profesional}. Si necesitas cancelar, entra aquí: {cancelar}"
    },
    "allowsReminders": true,
    "counters": { "days": 30, "sent": 12, "failed": 1 },
    "recent": [
      {
        "bookingId": "67f0c1a2b3c4d5e6f7a8b9c0",
        "kind": "24h",
        "channel": "email",
        "sentAt": "2026-03-24T14:00:00.000Z",
        "ok": true,
        "error": null,
        "attempts": 1
      }
    ]
  }
  ```

  `counters` cuenta los que salieron y los que fallaron en los últimos 30
  días. `recent` lista los últimos 50 (los más recientes primero).
  `allowsReminders` dice si el plan del negocio lo permite.

- `PUT /api/admin/reminders` -> `200` con el mismo cuerpo.

  ```json
  { "enabled": true, "channels": ["email"], "hoursBefore": [12], "template": "Hola {cliente}" }
  ```

  Los campos que no van se quedan como estaban. `400` con un mensaje en
  español cuando algo no es válido (un canal que no existe, una
  anticipación que no son horas, una plantilla vacía).

## La vuelta programada

Un servicio dentro del backend revisa las reservas cada **5 minutos**
(`REMINDERS_INTERVAL_MINUTES` lo cambia):

- recorre los negocios uno por uno y cada uno lee **sus** reservas dentro de
  su propio alcance (`TenantScope.run`): un negocio nunca ve los datos de
  otro;
- las vueltas no se solapan: si una está corriendo, la siguiente espera;
- si el correo no está configurado, ese canal se salta (se
  avisa por log) y el resto sigue;
- una reserva que falló se reintenta en la vuelta siguiente, hasta 3 veces.

El planificador no manda nada de las reservas de un negocio suspendido.

## Puertos y adaptadores

| Puerto (`src/reminders/application/ports`) | Adaptadores                                                        |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `MessageSender`                           | `EmailMessageSender` (el mailer de `src/email`), `FakeMessageSender` (el simulador del desarrollo y el e2e), `InMemoryMessageSender` (pruebas) |
| `BusinessTime`                            | `SystemBusinessTime` (el reloj del negocio, `BUSINESS_TIMEZONE`)     |
| `ReminderPlan`                            | `BillingReminderPlan` (los límites del plan de spec 23)              |

Los puertos del negocio (los settings y el directorio de negocios) viven en
`src/tenancy/application/ports`, porque los datos son del negocio:
`TENANT_REMINDERS_READER`, `TENANT_REMINDERS_WRITER` y `TENANT_DIRECTORY`.

Casos de uso: `SendDueReminders` (qué toca ahora), `SendReminder` (una
reserva: mensaje, envío y anotación), `GetReminderSettings` y
`SaveReminderSettings`.

## Límites conocidos

- El el correo de texto libre solo se acepta dentro de las 24 horas de una
  conversación con la pasarela; fuera de ese plazo el proveedor lo rechaza
  (queda registrado como fallo y se reintenta). Las plantillas aprobadas por
  la pasarela quedan fuera de esta spec.
- La zona horaria es la global (`BUSINESS_TIMEZONE`), no una por negocio.
- El mensaje no se manda por SMS ni push, ni tiene programación por día de
  la semana.
