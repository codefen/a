# Guía Completa: Configuración de Firma para Aplicaciones Tauri en Linux

## Generación de Claves y CI/CD con GitHub Actions

---

## Índice

1. [Contexto y Análisis de tu Workflow Actual](#1-contexto-y-análisis-de-tu-workflow-actual)
2. [Tipos de Firma en Linux para Tauri](#2-tipos-de-firma-en-linux-para-tauri)
3. [Generación de Claves Tauri (Updater)](#3-generación-de-claves-tauri-updater)
4. [Generación de Claves GPG (AppImage)](#4-generación-de-claves-gpg-appimage)
5. [Configuración de GitHub Secrets](#5-configuración-de-github-secrets)
6. [Configuración de tauri.conf.json](#6-configuración-de-tauriconfjson)
7. [Modificaciones al Workflow](#7-modificaciones-al-workflow)
8. [Verificación y Troubleshooting](#8-verificación-y-troubleshooting)
9. [Checklist Final](#9-checklist-final)

---

## 2. Tipos de Firma en Linux para Tauri

### 2.1 Firma Tauri (Obligatoria para Updater)

| Aspecto | Descripción |
|---------|-------------|
| **Propósito** | Verificar actualizaciones automáticas de la app |
| **Tipo de clave** | Ed25519 (generada por Tauri CLI) |
| **Archivos generados** | `.sig` junto a cada bundle |
| **Requerido para** | Plugin `@tauri-apps/plugin-updater` |

### 2.2 Firma GPG de AppImage (Opcional)

| Aspecto | Descripción |
|---------|-------------|
| **Propósito** | Verificación de integridad por usuarios |
| **Tipo de clave** | RSA 4096 / Ed25519 (GPG) |
| **Verificación** | Manual con `gpg --verify` o herramienta `validate` |
| **Requerido para** | Distribución profesional |

### 2.3 GitHub Attestations (Ya configurado)

| Aspecto | Descripción |
|---------|-------------|
| **Propósito** | Prueba criptográfica de que el build se hizo en GitHub Actions |
| **Verificación** | `gh attestation verify archivo.AppImage` |
| **Ventaja** | No requiere gestión de claves propias |

---

## 3. Generación de Claves Tauri (Updater)

### Paso 3.1: Instalar Tauri CLI

```bash
# Con npm
npm install -g @tauri-apps/cli

# Con cargo
cargo install tauri-cli

# Con bun (como usas en tu proyecto)
bun add -g @tauri-apps/cli
```

### Paso 3.2: Generar el par de claves

```bash
# Ejecutar en tu terminal local (NO en CI)
tauri signer generate -w ~/.tauri/anarch-ai.key
```

**Salida esperada:**
```
Please enter a password to protect the secret key.
Password: ********

Deriving a key from the password in order to encrypt the secret key...

Your secret key was generated successfully - Keep it secret!
Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIH...

Secret key path: /home/tu-usuario/.tauri/anarch-ai.key

IMPORTANT: If you lose this key, you'll need to generate a new one and update your app to use it.
Make sure to keep it in a safe place.
```

### Paso 3.3: Identificar los valores generados

Después de ejecutar el comando, tendrás:

| Elemento | Ubicación/Valor |
|----------|-----------------|
| **Clave Privada** | Contenido del archivo `~/.tauri/anarch-ai.key` |
| **Contraseña** | La que ingresaste durante la generación |
| **Clave Pública** | Mostrada en la salida del comando |

### Paso 3.4: Extraer la clave privada

```bash
# Ver el contenido de la clave privada
cat ~/.tauri/anarch-ai.key
```

**Ejemplo de salida (NO uses esta, es solo ejemplo):**
```
untrusted comment: rsign secret key
RWRYkT5kfkF2YwN0DJK3aE...base64...contenido...largo
```

> ⚠️ **IMPORTANTE**: Guarda tanto la clave privada como la contraseña en un lugar seguro (gestor de contraseñas). Si las pierdes, deberás regenerar las claves y todos los usuarios deberán reinstalar la aplicación.

---

## 4. Generación de Claves GPG (AppImage)

### Paso 4.1: Generar clave GPG

```bash
gpg --full-gen-key
```

### Paso 4.2: Listar y obtener Key ID

```bash
# Listar claves
gpg --list-secret-keys --keyid-format=long

# Salida ejemplo:
# sec   rsa4096/ABC123DEF456GH78 2025-01-15 [SC] [expires: 2027-01-15]
#       FINGERPRINT1234567890ABCDEF1234567890ABCDEF
# uid                 [ultimate] Anarch AI Team (Code Signing Key) <security@anarch.ai>
# ssb   rsa4096/XYZ987WVU654TS32 2025-01-15 [E] [expires: 2027-01-15]
```

El **Key ID** es: `ABC123DEF456GH78` (lo que viene después de `rsa4096/`)

### Paso 4.3: Exportar clave privada para CI

```bash
# Exportar clave privada en formato ASCII
gpg --armor --export-secret-keys ABC123DEF456GH78 > gpg-private-key.asc

# Ver contenido (para copiar a GitHub Secrets)
cat gpg-private-key.asc
```

### Paso 4.4: Exportar clave pública (para usuarios)

```bash
# Exportar clave pública
gpg --armor --export ABC123DEF456GH78 > gpg-public-key.asc

# Esta clave la publicas en tu sitio web
```

---

## 5. Configuración de GitHub Secrets

### Paso 5.1: Navegar a Settings de tu repositorio

1. Ve a tu repositorio en GitHub
2. Click en **Settings** (pestaña)
3. En el menú lateral: **Secrets and variables** → **Actions**
4. Click en **New repository secret**

### Paso 5.2: Añadir los secrets necesarios

#### Secret 1: `TAURI_PRIVATE_KEY`

| Campo | Valor |
|-------|-------|
| **Name** | `TAURI_PRIVATE_KEY` |
| **Secret** | Todo el contenido del archivo `~/.tauri/anarch-ai.key` |

```
untrusted comment: rsign secret key
RWRT...todo el contenido base64...
```

#### Secret 2: `TAURI_KEY_PASSWORD`

| Campo | Valor |
|-------|-------|
| **Name** | `TAURI_KEY_PASSWORD` |
| **Secret** | La contraseña que usaste al generar la clave |

#### Secret 3: `GPG_PRIVATE_KEY` (Opcional, para firma GPG)

| Campo | Valor |
|-------|-------|
| **Name** | `GPG_PRIVATE_KEY` |
| **Secret** | Todo el contenido del archivo `gpg-private-key.asc` |

#### Secret 4: `GPG_PASSPHRASE` (Opcional, para firma GPG)

| Campo | Valor |
|-------|-------|
| **Name** | `GPG_PASSPHRASE` |
| **Secret** | La passphrase de tu clave GPG |

#### Secret 5: `GPG_KEY_ID` (Opcional, para firma GPG)

| Campo | Valor |
|-------|-------|
| **Name** | `GPG_KEY_ID` |
| **Secret** | El Key ID (ej: `ABC123DEF456GH78`) |

### Paso 5.3: Verificar secrets configurados

Tu lista de secrets debería verse así:

```
Repository secrets:
├── GITHUB_TOKEN          (automático)
├── TAURI_PRIVATE_KEY     ✓
├── TAURI_KEY_PASSWORD    ✓
├── GPG_PRIVATE_KEY       (opcional)
├── GPG_PASSPHRASE        (opcional)
└── GPG_KEY_ID            (opcional)
```

---

## 6. Configuración de tauri.conf.json

### Paso 6.1: Configuración básica de bundle

```json
{
  "productName": "anarch-ai",
  "version": "1.0.0",
  "identifier": "anarch.ai",
  "build": {
    "beforeBuildCommand": "bun run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["appimage", "deb", "rpm"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "linux": {
      "appimage": {
        "bundleMediaFramework": true
      },
      "deb": {
        "depends": []
      },
      "rpm": {
        "depends": []
      }
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "AQUÍ_VA_TU_CLAVE_PÚBLICA",
      "endpoints": [
        "https://releases.anarch.ai/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

### Paso 6.2: Añadir la clave pública del updater

La clave pública que obtuviste en el Paso 3.2 debe ir en `plugins.updater.pubkey`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCQzEyMzQ1Njc4OTAKUldSWWtUNWtma0YyWXdOMERKSzNhRS4uLg==",
      "endpoints": [
        "https://github.com/tu-usuario/anarch-ai/releases/latest/download/latest.json"
      ]
    }
  }
}
```

---

## 8. Verificación y Troubleshooting

### 8.1: Verificar firma Tauri localmente

```bash
# El archivo .sig debe existir junto al AppImage
ls -la src-tauri/target/release/bundle/appimage/
# anarch-ai_1.0.0_amd64.AppImage
# anarch-ai_1.0.0_amd64.AppImage.sig  <-- Este archivo

# Verificar contenido del .sig (debe ser base64)
cat src-tauri/target/release/bundle/appimage/*.sig
```

### 8.2: Verificar firma GPG

```bash
# Importar clave pública (el usuario hace esto)
gpg --import gpg-public-key.asc

# Verificar firma
gpg --verify anarch-ai_1.0.0_amd64.AppImage.asc anarch-ai_1.0.0_amd64.AppImage

# Salida esperada:
# gpg: Signature made Thu 15 Jan 2025 10:30:00 AM UTC
# gpg: using RSA key ABC123DEF456GH78
# gpg: Good signature from "Anarch AI Team <security@anarch.ai>"
```


## Apéndice A: Comandos de Referencia Rápida

```bash
# === TAURI ===
# Generar claves Tauri
tauri signer generate -w ~/.tauri/mi-app.key

# === GPG ===
# Generar clave GPG
gpg --full-gen-key

# Listar claves
gpg --list-secret-keys --keyid-format=long

# Exportar clave privada
gpg --armor --export-secret-keys KEY_ID > private.asc

# Exportar clave pública
gpg --armor --export KEY_ID > public.asc

# Firmar archivo
gpg --armor --detach-sign archivo.AppImage

# Verificar firma
gpg --verify archivo.AppImage.asc archivo.AppImage

# === CHECKSUMS ===
# Crear checksum
sha256sum archivo.AppImage > archivo.AppImage.sha256

# Verificar checksum
sha256sum -c archivo.AppImage.sha256

# === GITHUB CLI ===
# Verificar attestation
gh attestation verify archivo.AppImage --owner usuario
```

---
