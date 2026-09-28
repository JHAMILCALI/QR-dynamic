# QR dinámicos

Sistema de códigos QR dinámicos: el QR impreso apunta siempre a la misma URL corta
(`https://tu-worker.workers.dev/CODIGO`); el destino real se guarda en una base de
datos y se puede cambiar en cualquier momento desde el panel `/admin`, sin
reimprimir el QR.

Arquitectura: **Cloudflare Workers** (redirección HTTP 302 real, en el borde) +
**Cloudflare D1** (base de datos SQLite gratis) + panel de administración propio,
**multiusuario**, protegido con **passkeys (WebAuthn) y sesión JWT** — sin
contraseñas, solo un nombre de usuario y tu huella/PIN/llave de seguridad. Cada
usuario solo ve y edita sus propios códigos QR; el resto queda invisible para
los demás. Todo corre en el plan gratuito de Cloudflare.

## Puesta en marcha

1. Instalar dependencias:
   ```bash
   pnpm install
   ```

2. Iniciar sesión en Cloudflare:
   ```bash
   pnpm exec wrangler login
   ```

3. Crear la base de datos D1:
   ```bash
   pnpm exec wrangler d1 create qr-dinamicos-db
   ```
   Copia el `database_id` que imprime el comando y pégalo en `wrangler.toml`
   (reemplaza `REEMPLAZA_CON_TU_DATABASE_ID`).

4. Aplicar las migraciones (crea las tablas `qr_codes`, `scans`, `credentials` y las
   columnas de usuario):
   ```bash
   pnpm db:migrate:local
   pnpm db:migrate:remote
   pnpm exec wrangler d1 execute qr-dinamicos-db --local --file=./migrations/0002_webauthn.sql
   pnpm exec wrangler d1 execute qr-dinamicos-db --remote --file=./migrations/0002_webauthn.sql
   pnpm exec wrangler d1 execute qr-dinamicos-db --local --file=./migrations/0003_multiuser.sql
   pnpm exec wrangler d1 execute qr-dinamicos-db --remote --file=./migrations/0003_multiuser.sql
   ```
   > Si añades más archivos de migración en el futuro, ejecútalos igual con
   > `wrangler d1 execute qr-dinamicos-db --local/--remote --file=./migrations/000X_x.sql`.

5. Configurar el secreto de sesión:
   - `JWT_SECRET`: clave con la que se firman las sesiones (cualquier cadena larga y aleatoria).
   - **Local**: ya está en `.dev.vars` (nunca se sube a git) con un valor de ejemplo; cámbialo
     si quieres.
   - **Producción**:
     ```bash
     pnpm exec wrangler secret put JWT_SECRET
     ```

6. Probar en local:
   ```bash
   pnpm dev
   ```
   Abre `http://localhost:8787/admin` (usa `localhost`, no `127.0.0.1`, para que las passkeys
   funcionen bien). Escribe un nombre de usuario: como no existe todavía, te deja registrar tu
   passkey (Windows Hello, huella o llave de seguridad) ahí mismo — no hace falta ningún código
   ni contraseña. La próxima vez que entres con ese mismo nombre de usuario, te pedirá la
   passkey para iniciar sesión en vez de registrar una nueva.

7. Desplegar:
   ```bash
   pnpm worker:deploy
   ```
   Wrangler imprime la URL pública, algo como `https://qr-dinamicos.<tu-subdominio>.workers.dev`.
   Entra ahí a `/admin` y regístrate de nuevo con tu usuario — el registro de la passkey es
   específico de cada dominio, la que hiciste en `localhost` no sirve en producción.

8. Ya dentro del panel, crea tu primer código (deja el campo "código" vacío para que se genere
   uno al azar), descarga la imagen QR generada e imprímela o compártela. Para "editar" el QR
   más adelante, solo cambia el campo destino en la misma fila y pulsa Guardar — el código
   impreso sigue funcionando igual. Cada usuario solo ve sus propios códigos en la tabla.

## Notas

- El login usa **passkeys (WebAuthn)**: la librería `@simplewebauthn/server` verifica todo
  dentro del Worker, y en el navegador se carga `@simplewebauthn/browser` desde jsDelivr
  (CDN) para hablar con `navigator.credentials`. La sesión se guarda como una cookie
  `HttpOnly` con un JWT (librería `jose`), válida 30 días.
- **Registro abierto**: cualquiera que escriba un nombre de usuario que no exista puede
  crear una cuenta ahí mismo — no hay invitación ni aprobación previa. La seguridad no
  depende de impedir el registro, sino de que nadie puede iniciar sesión como otro usuario
  sin su passkey física, y cada usuario solo ve sus propios códigos (`owner_username` en
  `qr_codes`). Si más adelante quieres cerrar el registro (por ejemplo, con una lista de
  usuarios permitidos), avísame.
- Un mismo nombre de usuario puede tener varias passkeys (por ejemplo, una por dispositivo):
  simplemente inicia sesión primero con una ya registrada y añade otra desde ahí — el código
  actual asocia cada passkey nueva al nombre de usuario que se escribió al momento de
  registrarla, así que si quieres ese flujo de "añadir dispositivo estando ya logueado"
  dímelo y lo agrego explícitamente en el panel.
- La imagen del QR se genera con la API pública gratuita `api.qrserver.com`.
- Cada escaneo se registra de forma asíncrona en la tabla `scans` (fecha, país,
  tipo de dispositivo, referrer) y el panel muestra el total de escaneos y la
  fecha del último por cada código.
- Límites del plan gratis de Cloudflare (muy por encima de lo que necesita un
  proyecto personal): ~100,000 peticiones/día en Workers, 5 GB de almacenamiento
  y varios millones de lecturas/día en D1.
- Para usar un dominio propio en vez de `*.workers.dev`, añade el dominio a
  Cloudflare y crea una ruta ("Route") hacia este Worker desde el dashboard.
