# a

Manifest: 
Power to the people.-

## Deploy FTP con GitHub Actions

Este repo incluye el workflow [`.github/workflows/deploy-x-comentario.yml`](./.github/workflows/deploy-x-comentario.yml) para publicar el frontend (`dist`) en un servidor FTP.

### 1) Configurar secrets del repositorio

En GitHub: `Settings > Secrets and variables > Actions > New repository secret`

Secrets obligatorios:
- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `FTP_SERVER_DIR` (ejemplo: `/public_html`)

### 2) Cómo ejecutarlo

Se ejecuta en `push` a `main`, pero solo hace deploy cuando el mensaje del último commit contiene exactamente una de estas frases:
- `deploy to production` -> deploy a `production`
- `deploy to demo` -> deploy a `demo`

Si el commit no incluye una de esas frases, el workflow termina sin desplegar.

Ejemplos:
- `git commit -m "landing update deploy to production"`
- `git commit -m "fix banner deploy to demo"`

### 3) Qué hace el workflow

1. Hace checkout del repo.
2. Configura Node.js 18.
3. Instala dependencias con `npm install`.
4. Ejecuta `npm run build` (genera `dist`).
5. Instala `basic-ftp`.
6. Revisa el mensaje del commit para detectar intención de deploy.
7. Si hay intención de deploy, conecta por FTP y sube el contenido de `dist` al directorio remoto configurado.
