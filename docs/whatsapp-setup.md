# WhatsApp bot: Meta setup guide

This guide takes you from "I just got a phone line" to a working WhatsApp
booking bot and admin notifications. All Meta configuration happens in the
Meta dashboards; on our side you only paste environment variables in Vercel.

The app runs without any of these variables. Until you set them, WhatsApp
features stay off: outbound messages are skipped with a warning log, the
webhook rejects POSTs (401) and the verify handshake (403).

> Meta changes its dashboard often. Menu names below are accurate at the time
> of writing; if a label moved, search for the keyword in bold.

## 1. What you need up front

- [ ] **A phone number** that can receive an SMS or voice call with a
      verification code, and that is **not registered in the regular WhatsApp
      or WhatsApp Business app**. If it is, delete that account from the app
      first (Settings -> Account -> Delete account), otherwise Meta refuses it.
- [ ] **A Meta Business account** (https://business.facebook.com). Business
      verification is recommended: unverified businesses have low messaging
      limits.
- [ ] A **Meta developer account** (https://developers.facebook.com) linked to
      the same person/business.
- [ ] Access to the **Vercel project** of this backend (to set env vars).
- [ ] The **business time zone** as an IANA name (for example
      `America/Mexico_City`). The bot cannot work without it (see section 5).

For development you do not need your own number: Meta gives every app a
**free test number** (see section 7 for its limits). You can complete
sections 2 to 6 with the test number first and swap in the real number later.

## 2. Create the app and get the credentials

In **Meta for Developers** (https://developers.facebook.com/apps):

- [ ] **Create app** -> use case **Other** -> app type **Business** -> attach
      your Meta Business account.
- [ ] In the app dashboard, **Add product** -> **WhatsApp** -> **Set up**.
      Meta creates (or asks you to pick) a **WhatsApp Business Account (WABA)**.
- [ ] Open **WhatsApp -> API Setup**. You will see the test number and its
      **Phone number ID**. The Phone number ID is **not** the phone number:
      it is a long numeric id. Copy it to `WHATSAPP_PHONE_NUMBER_ID`.
- [ ] Note the **WhatsApp Business Account ID** (WABA id) shown next to it.
      You need it to manage templates and to assign the System User.
- [ ] **Add your real number**: in API Setup -> **Add phone number**, enter the
      business name, display name and the number; choose SMS or voice and enter
      the code. After it is verified, select it as the sender and copy its new
      **Phone number ID** (it replaces the test one).
- [ ] **Permanent access token** (the API Setup page shows a temporary token
      that expires in 24 hours: use it only for quick tests). To get a
      permanent one:
  - [ ] In **Business Settings** (https://business.facebook.com/settings) ->
        **Users -> System users** -> **Add** -> role **Admin**.
  - [ ] **Add assets** -> **Apps** -> your app -> **Manage app** (full
        control). Also add your **WhatsApp account** (the WABA) with full control.
  - [ ] **Generate token** -> select your app -> expiration **Never** ->
        permissions `whatsapp_business_messaging` and
        `whatsapp_business_management` -> generate and copy it right away
        (it is shown once) to `WHATSAPP_ACCESS_TOKEN`.
- [ ] **App Secret**: App dashboard -> **App settings -> Basic -> App secret ->
      Show**. Copy it to `WHATSAPP_APP_SECRET`. It signs every webhook call.
- [ ] **Verify token**: invent a long random string. It is just a password you
      share with Meta in section 3. Generate one with:

  ```bash
  openssl rand -hex 24
  ```

  Save it as `WHATSAPP_VERIFY_TOKEN`.

Never commit these values or paste them in chats or tickets. Treat the access
token and app secret like passwords.

## 3. Configure the webhook

The order matters: Meta calls our server while you click **Verify**, so the
server must already know the verify token.

- [ ] Set the env vars in Vercel (section 5): at least `WHATSAPP_VERIFY_TOKEN`,
      `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
      and `BUSINESS_TIMEZONE`.
- [ ] **Redeploy** the Vercel project (env var changes only apply to new
      deployments).
- [ ] Check the handshake yourself first (section 6.1).
- [ ] In Meta: **WhatsApp -> Configuration -> Webhook -> Edit**
  - **Callback URL**: `https://<your-vercel-domain>/api/webhook/whatsapp`
  - **Verify token**: the value of `WHATSAPP_VERIFY_TOKEN`
  - Click **Verify and save**.
- [ ] In the **Webhook fields** list, **Subscribe** to the **`messages`** field
      (without it Meta never sends us incoming messages).

If you later change `WHATSAPP_VERIFY_TOKEN`, redeploy first and then verify
again in Meta.

## 4. Admin notification template

When a booking is created (by the bot or by the web app), the backend sends
the admin a WhatsApp **template** message. The admin is usually outside the
24-hour window (section 7), so only an approved template can reach them.

- [ ] In Meta: **WhatsApp Manager** (https://business.facebook.com/wa/manage) ->
      **Message templates** -> **Create template**.
- [ ] Fill the form exactly:
  - **Category**: `Utility`
  - **Name**: `nueva_reserva` (lowercase, underscores; must match
    `WHATSAPP_ADMIN_TEMPLATE_NAME`)
  - **Language**: `Spanish` (code `es`; must match
    `WHATSAPP_ADMIN_TEMPLATE_LANG`)
  - **Body**:

    ```text
    Nueva reserva de {{1}} ({{6}}): {{2}} con {{3}} el {{4}} a las {{5}}.
    ```

- [ ] The six variables are positional and fixed in the code
      (`src/whatsapp/admin-booking.params.ts`). Meta asks for an example value
      for each one:

  | Variable | Content                       | Example for Meta's form |
  | -------- | ----------------------------- | ----------------------- |
  | `{{1}}`  | Client name                   | `Juan Pérez`            |
  | `{{2}}`  | Service names, joined by `, ` | `Servicio Premium`      |
  | `{{3}}`  | Professional name             | `Alex García`           |
  | `{{4}}`  | Date, `dd/mm/yyyy`            | `25/03/2026`            |
  | `{{5}}`  | Time, `HH:MM`                 | `10:00`                 |
  | `{{6}}`  | Client phone                  | `5491155551234`         |

  If you change the body text you may reorder or drop words, but the numbers
  must keep this meaning, and all six must appear (the code always sends six).
- [ ] Submit and wait for approval. Utility templates are usually approved in
      minutes, sometimes up to 24 hours. Status must be **Active**. If Meta
      re-categorizes it as Marketing, edit the text to be strictly
      transactional and resubmit.
- [ ] Set `ADMIN_WHATSAPP_NUMBER` to the admin's WhatsApp number: **digits
      only, with country code, no `+`** (for example `5491155551234`). Spaces,
      dashes, parentheses and a leading `+` are stripped automatically, but the
      result must be 8 to 15 digits or the notification is skipped.

Without an approved template (or with a wrong name/language) the admin message
fails or is skipped, **but bookings are never affected**: the failure is only
logged.

### 4.1 Cancellation notice template (optional)

When a client cancels from the link in their email, the backend can tell the
admin too. It needs a **second** template: the one above says "Nueva reserva"
and would be wrong here. Create it exactly like the first one:

- [ ] **Category** `Utility`, **Name** `reserva_cancelada` (must match
      `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME`), same **Language** as the first
      template (`WHATSAPP_ADMIN_TEMPLATE_LANG` is used for both).
- [ ] **Body** (same six positional variables and meaning as section 4):

    ```text
    Reserva cancelada de {{1}} ({{6}}): {{2}} con {{3}} el {{4}} a las {{5}}.
    ```

- [ ] Set `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME=reserva_cancelada` once the
      template is **Active**.

Leave the variable blank to skip this notice: the cancellation still works, the
admin panel still updates live, and the log shows `Admin cancellation notice
skipped`. Admin cancellations made from the panel never send it.

## 5. Environment variables

Set them in Vercel: **Project -> Settings -> Environment Variables** -> add the
name and value for **Production** (and Preview if you use it) -> save ->
**redeploy** (Deployments -> latest -> Redeploy). Locally, put them in `.env`
(see `.env.example`).

| Variable                       | Required?                      | Where to get it                       | Default       | If missing |
| ------------------------------ | ------------------------------ | ------------------------------------- | ------------- | ---------- |
| `WHATSAPP_ACCESS_TOKEN`        | Yes, to send messages          | System User token (section 2)         | none          | Outbound sends are skipped with a warning; the bot cannot answer |
| `WHATSAPP_PHONE_NUMBER_ID`     | Yes, to send messages          | API Setup page (section 2)            | none          | Same as above |
| `WHATSAPP_APP_SECRET`          | Yes, to receive messages       | App settings -> Basic (section 2)     | none          | Webhook POST always returns 401 (fails closed) |
| `WHATSAPP_VERIFY_TOKEN`        | Yes, to register the webhook   | You invent it (`openssl rand -hex 24`) | none         | Webhook verification returns 403 |
| `WHATSAPP_API_VERSION`         | No                             | Meta Graph API version                | `v21.0`       | Default is used |
| `ADMIN_WHATSAPP_NUMBER`        | No (needed for admin alerts)   | Admin's number, digits, no `+`        | none          | Admin notification skipped with a warning; bookings unaffected |
| `WHATSAPP_ADMIN_TEMPLATE_NAME` | No                             | Name of the approved template         | `nueva_reserva` | Default is used |
| `WHATSAPP_ADMIN_TEMPLATE_LANG` | No                             | Language code of the template         | `es`          | Default is used |
| `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME` | No                      | Name of the approved cancellation template (section 4.1) | none | Cancellation notice to the admin skipped with a warning; cancellations unaffected |
| `BUSINESS_TIMEZONE`            | **Yes, for the bot and for cancelling by link** | IANA name, e.g. `America/Mexico_City` | none | The bot answers "try again later" and **never books**; cancel endpoints answer 503 |

`BUSINESS_TIMEZONE` must be a valid IANA time zone (`Area/City`, not `GMT-5`
or `CST`). The bot uses it to hide hours that already passed today; if it is
unset or invalid, the bot logs an error and replies that it cannot take
bookings right now, instead of booking blind. The web app is not affected.

Existing variables (`MONGO_URI`, `NODE_ENV`, ...) are unchanged.

## 6. Smoke tests

Replace `<your-vercel-domain>` and export the variables in your shell (use the
same values as in Vercel):

```bash
export API="https://<your-vercel-domain>/api"
export WHATSAPP_VERIFY_TOKEN="..."
export WHATSAPP_APP_SECRET="..."
```

### 6.1 Verification handshake (GET)

- [ ] Correct token: the response body must be exactly `12345` with status 200.

  ```bash
  curl -i "$API/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=12345"
  ```

- [ ] Wrong token: must answer **403**.

  ```bash
  curl -i "$API/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"
  ```

### 6.2 Signed POST

This payload has no messages, so the bot sends nothing; it only exercises the
signature check.

- [ ] Create the sample payload and sign **the exact bytes of the file**:

  ```bash
  printf '%s' '{"object":"whatsapp_business_account","entry":[{"id":"0","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{},"statuses":[]}}]}]}' > payload.json

  SIG="sha256=$(openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" payload.json | sed 's/^.* //')"
  ```

- [ ] Valid signature: expect **200** and `{"received":true}`.

  ```bash
  curl -i -X POST "$API/webhook/whatsapp" \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $SIG" \
    --data-binary @payload.json
  ```

- [ ] Bad signature: expect **401**.

  ```bash
  curl -i -X POST "$API/webhook/whatsapp" \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: sha256=$(printf '0%.0s' {1..64})" \
    --data-binary @payload.json
  ```

> **Known open risk (unverified until the first real Meta call):** the
> signature is computed over the raw request bytes, and we have not yet
> confirmed that Vercel hands Nest those exact bytes. **Symptom: every POST
> returns 401 even with the correct app secret** (the `curl` test above and the
> real Meta calls both fail). What to check: (1) `WHATSAPP_APP_SECRET` is the
> App secret of **this** app, deployed (redeploy after changing it) and has no
> extra spaces or quotes; (2) the test payload was sent with `--data-binary`
> and not re-formatted after signing; (3) the Vercel function logs (6.5) show
> the 401 without a body-parsing error. If all three are fine and 401 persists,
> report it: the raw-body handling in `src/main.ts` / `api/index.js` needs a fix.

### 6.3 Talk to the bot from a real phone

- [ ] From a phone allowed to chat with the number (with the test number, one
      of the recipients you added; see section 7), send **`hola`** to the
      business number.
- [ ] Expected: within a few seconds, the message "¡Hola! Elige el servicio
      que quieres reservar:" with a **Ver servicios** list. Then day -> time ->
      professional -> confirm. The final **Confirmar** creates the booking and
      you get a confirmation message.
- [ ] Words that work at any moment: `menu` (restart) and `cancelar` (drop the
      booking in progress).
- [ ] If the bot answers "Por el momento no podemos tomar reservas por este
      medio...", `BUSINESS_TIMEZONE` is missing or invalid (section 5).

### 6.4 Booking through the web API and the admin message

- [ ] Create a booking (pick a future weekday and a valid hour; business
      hours are Mon-Fri 09-20, Sat 09-18, closed Sunday, continuous with no midday break):

  ```bash
  curl -i -X POST "$API/bookings" \
    -H "Content-Type: application/json" \
    -d '{
      "client": {"name": "Prueba Smoke", "phone": "5491155551234", "email": "smoke@example.com"},
      "services": [{"id": "servicio-basico"}],
      "professional": {"id": "alex-garcia", "name": "x"},
      "date": "2030-01-08",
      "time": "10:00"
    }'
  ```

  Adjust `date`/`time` if the answer is "Ya existe una reserva" or a
  validation error. Delete the test booking afterwards
  (`DELETE $API/bookings/<id>`).
- [ ] Expected: HTTP 201 and, a few seconds later, the **admin** receives the
      `nueva_reserva` message on `ADMIN_WHATSAPP_NUMBER`. With the test number,
      the admin number must be in the recipient allow-list.

### 6.5 Read the logs

- [ ] Vercel -> your project -> **Logs** (or the deployment -> **Functions**
      tab) -> filter by `/api/webhook/whatsapp` or search for `WhatsApp`.
- [ ] Useful messages: `WhatsApp sending is not configured` (missing token or
      phone number id), `Admin notification skipped` (missing/invalid admin
      number), `Admin notification failed: ... (#132001)` (template problem),
      `BUSINESS_TIMEZONE is unset or not a valid IANA timezone`.
- [ ] Locally: `npm run start:dev` prints the same lines in the terminal.

## 7. Limits, costs and go-live

### Test number mode

- The free test number can only message **up to 5 recipient numbers** that you
  add and verify in **API Setup -> To -> Manage phone number list**. Anyone
  else gets nothing (the API answers with an "unauthorized recipient" error).
- Add the admin number there too, or admin alerts will not arrive.
- The test number has a "Test" display name and is not meant for customers.

### 24-hour window vs. templates

- When a customer writes to the business, you can reply with any free-form
  message (text, lists, buttons) for **24 hours** from their last message. The
  bot only replies inside that window.
- Outside the window, only approved **templates** can be sent. The admin
  notification is a template for that reason: the admin rarely writes to the bot.

### Costs

- Meta charges **per delivered template message** (utility templates are paid,
  price depends on the recipient country; check the current rate card in
  WhatsApp Manager -> **Pricing**). Each booking triggers one admin template.
- Free-form replies inside the 24-hour window are not charged per message.
  Meta's pricing rules change; check the official pricing page before launch.

### Go-live checklist

- [ ] Real number added and verified, **Phone number ID** updated in Vercel.
- [ ] Permanent System User token in `WHATSAPP_ACCESS_TOKEN` (not the 24h one).
- [ ] Business verification done (or limits understood).
- [ ] Display name approved by Meta.
- [ ] Template `nueva_reserva` is **Active** (name and language match).
- [ ] All variables from section 5 set in Vercel **Production**, redeployed.
- [ ] Webhook verified and subscribed to `messages` on the real number.
- [ ] Smoke tests 6.1 to 6.4 pass; the first real Meta POST is not a 401.
- [ ] `BUSINESS_TIMEZONE` is correct (the bot offers the right hours).
- [ ] A payment method is attached to the WhatsApp Business Account.
- [ ] Remove any test bookings created during smoke tests.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Meta says "The callback URL or verify token couldn't be validated" / GET returns 403 | `WHATSAPP_VERIFY_TOKEN` not set, differs from the value typed in Meta, or the project was not redeployed after setting it | Set it in Vercel, redeploy, repeat 6.1, then click Verify again. Check the URL ends in `/api/webhook/whatsapp` |
| Every POST returns 401 | `WHATSAPP_APP_SECRET` missing/wrong/for another app, or the raw body does not reach Nest unchanged (see the open risk in section 6) | Re-copy the App secret, redeploy, rerun 6.2; check logs |
| Webhook verified but the bot is silent | Not subscribed to `messages`; `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` missing or expired (24h token); sender not in the test-number allow-list; `BUSINESS_TIMEZONE` missing (bot says "try later") | Subscribe to `messages`; set a permanent token; add the recipient; check the logs for `not configured` or `BUSINESS_TIMEZONE` |
| Logs show `WhatsApp API responded 401/190` | Expired or invalid access token | Generate a permanent System User token and update the variable |
| Logs show `(#132001) Template name does not exist` | Template not approved yet, or name/language does not match `WHATSAPP_ADMIN_TEMPLATE_NAME` / `_LANG` (a template exists per language) | Wait for approval; make names and codes identical (`es` vs `es_AR`) |
| Logs show `(#132000) Number of parameters does not match` | The template body does not have exactly `{{1}}`..`{{6}}` | Recreate the template with the six variables of section 4 |
| Logs show `(#131030)` / "recipient not in allowed list" | Test-number mode and the recipient is not on the list | Add the number in API Setup, or switch to the real number |
| Admin gets nothing and logs say `Admin notification skipped` | `ADMIN_WHATSAPP_NUMBER` unset or not 8 to 15 digits | Set it as digits with country code, redeploy |
| Customer gets the same booking/answers twice | Meta retried because an earlier call was slow or failed; the app already ignores a repeated message id for 48 hours | Usually harmless; if bookings are duplicated, check the logs for 5xx/timeouts and report the message id |
| "Ya existe una reserva para ..." (HTTP 400 on the web, a "horario reservado" message in the bot) | That professional is already booked at that hour (a 90-minute service blocks two consecutive hours) | Choose another hour or professional; this is the intended protection against double booking |
| Bot says "Por el momento no podemos tomar reservas..." | `BUSINESS_TIMEZONE` unset or invalid | Set a valid IANA name, redeploy |
