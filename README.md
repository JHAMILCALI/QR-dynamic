# QR dinámicos

Sistema de códigos QR dinámicos: el QR impreso apunta siempre a la misma URL corta
(`https://qrgg.<tu-subdominio>.workers.dev/CODIGO`); el destino real se guarda en una base de
datos y se puede cambiar en cualquier momento desde el panel (entrando por la
raíz del sitio, `/`), sin reimprimir el QR.

Arquitectura: **Cloudflare Workers** (redirección HTTP 302 real, en el borde) +
**Cloudflare D1** (base de datos SQLite gratis) + panel de administración propio,
**multiusuario**, protegido con **passkeys (WebAuthn) y sesión JWT** — sin
contraseñas, solo un nombre de usuario y tu huella/PIN/llave de seguridad. Cada
usuario solo ve y edita sus propios códigos QR; el resto queda invisible para
los demás. Todo corre en el plan gratuito de Cloudflare.

La misma página raíz (`/`) también trae un **generador de QR estático**, sin
necesidad de cuenta: cualquiera puede escribir un texto o URL, elegir el
tamaño (150 a 1000 px) y descargar la imagen al momento. Ese QR queda fijo
para siempre (no se puede editar el destino después) — para eso está la
parte de cuenta/passkey.

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
   Abre `http://localhost:8787/` (usa `localhost`, no `127.0.0.1`, para que las passkeys
   funcionen bien — visitar `/admin` también funciona, solo te redirige a `/`). La primera vez,
   pulsa "¿Primera vez? Crea tu cuenta", escribe un nombre de usuario y registra tu passkey
   (Windows Hello, huella o llave de seguridad) — no hace falta ningún código ni contraseña.
   Las siguientes veces, un solo botón "Iniciar sesión con tu passkey" te deja entrar sin
   escribir nada: el navegador te muestra tu propia passkey guardada para elegirla.

7. Desplegar:
   ```bash
   pnpm worker:deploy
   ```
   Wrangler imprime la URL pública, algo como `https://qrgg.<tu-subdominio>.workers.dev`.
   Entra ahí (a la raíz del sitio) y regístrate de nuevo con tu usuario — el registro de la
   passkey es específico de cada dominio, la que hiciste en `localhost` no sirve en producción.

8. Ya dentro del panel, crea tu primer código (deja el campo "código" vacío para que se genere
   uno al azar), descarga la imagen QR generada e imprímela o compártela. Para "editar" el QR
   más adelante, solo cambia el campo destino en la misma fila y pulsa Guardar — el código
   impreso sigue funcionando igual. Cada usuario solo ve sus propios códigos en la tabla.

## Notas

- El login usa **passkeys (WebAuthn) sin usuario**: `/admin/auth/login-options` genera un
  desafío "discoverable" (sin restringir a un usuario concreto) y el navegador muestra su
  propio selector de passkeys guardadas para este sitio — quien inicia sesión no escribe
  nada, solo elige la suya. El servidor identifica de quién es por el ID de la credencial
  que el navegador devuelve, no por texto que el usuario tipeó. La librería
  `@simplewebauthn/server` verifica todo dentro del Worker, y en el navegador se carga
  `@simplewebauthn/browser` desde jsDelivr (CDN). La sesión se guarda como una cookie
  `HttpOnly` con un JWT (librería `jose`), válida 30 días.
- El nombre de usuario **solo se pide al registrarte** (para tener un identificador legible
  y evitar duplicados), nunca para iniciar sesión.
- **Registro abierto**: cualquiera que escriba un nombre de usuario que no exista puede
  crear una cuenta ahí mismo — no hay invitación ni aprobación previa. La seguridad no
  depende de impedir el registro, sino de que nadie puede iniciar sesión como otro usuario
  sin su passkey física, y cada usuario solo ve sus propios códigos (`owner_username` en
  `qr_codes`). Si más adelante quieres cerrar el registro (por ejemplo, con una lista de
  usuarios permitidos), avísame.
- Para que la passkey aparezca en el selector del navegador, el autenticador debe guardarla
  como "discoverable" (resident key) — se lo pedimos con `residentKey: "preferred"` al
  registrar, que es lo que hacen por defecto Windows Hello, Touch ID y la mayoría de llaves
  de seguridad modernas.
- La imagen del QR se genera con la API pública gratuita `api.qrserver.com`.
- Cada escaneo se registra de forma asíncrona en la tabla `scans` (fecha, país,
  tipo de dispositivo, referrer) y el panel muestra el total de escaneos y la
  fecha del último por cada código.
- Límites del plan gratis de Cloudflare (muy por encima de lo que necesita un
  proyecto personal): ~100,000 peticiones/día en Workers, 5 GB de almacenamiento
  y varios millones de lecturas/día en D1.
- Para usar un dominio propio en vez de `*.workers.dev`, añade el dominio a
  Cloudflare y crea una ruta ("Route") hacia este Worker desde el dashboard.
