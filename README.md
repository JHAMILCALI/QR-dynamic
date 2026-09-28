# QR dinámicos

Sistema de códigos QR dinámicos: el QR impreso apunta siempre a la misma URL corta
(`https://tu-worker.workers.dev/CODIGO`); el destino real se guarda en una base de
datos y se puede cambiar en cualquier momento desde el panel `/admin`, sin
reimprimir el QR.

Arquitectura: **Cloudflare Workers** (redirección HTTP 302 real, en el borde) +
**Cloudflare D1** (base de datos SQLite gratis) + panel de administración propio.
Todo corre en el plan gratuito de Cloudflare.

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

4. Aplicar la migración (crea las tablas `qr_codes` y `scans`):
   ```bash
   pnpm db:migrate:local
   pnpm db:migrate:remote
   ```

5. Configurar la contraseña del panel de administración:
   - **Local**: crea un archivo `.dev.vars` (ya está en `.gitignore`, nunca se sube) con:
     ```
     ADMIN_PASSWORD=elige-una-clave
     ```
   - **Producción**:
     ```bash
     pnpm exec wrangler secret put ADMIN_PASSWORD
     ```

6. Probar en local:
   ```bash
   pnpm dev
   ```
   Abre `http://localhost:8787/admin` (usuario: cualquier texto, contraseña: la de `.dev.vars`).

7. Desplegar:
   ```bash
   pnpm worker:deploy
   ```
   Wrangler imprime la URL pública, algo como `https://qr-dinamicos.<tu-subdominio>.workers.dev`.

8. Entra a `/admin` en esa URL, crea tu primer código (deja el campo "código" vacío
   para que se genere uno al azar), descarga la imagen QR generada e imprímela o
   compártela. Para "editar" el QR más adelante, solo cambia el campo destino en
   la misma fila y pulsa Guardar — el código impreso sigue funcionando igual.

## Notas

- La imagen del QR se genera con la API pública gratuita `api.qrserver.com`.
- Cada escaneo se registra de forma asíncrona en la tabla `scans` (fecha, país,
  tipo de dispositivo, referrer) y el panel muestra el total de escaneos y la
  fecha del último por cada código.
- Límites del plan gratis de Cloudflare (muy por encima de lo que necesita un
  proyecto personal): ~100,000 peticiones/día en Workers, 5 GB de almacenamiento
  y varios millones de lecturas/día en D1.
- Para usar un dominio propio en vez de `*.workers.dev`, añade el dominio a
  Cloudflare y crea una ruta ("Route") hacia este Worker desde el dashboard.
