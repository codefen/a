# Análisis Profundo: Problema de Firma de Código en Workflow Tauri para Windows

## Resumen Ejecutivo

El workflow actual tiene un **problema fundamental de arquitectura**: intenta firmar el binario de la aplicación (`anarch-ai.exe`) **antes** del empaquetado de Tauri, pero Tauri **recompila el binario durante el proceso de bundling**, perdiendo la firma. Además, la estrategia de usar `signCommand` nativo de Tauri no está siendo aprovechada, lo cual sería la solución más robusta.

---

## 1. Diagnóstico del Problema Principal

### 1.1 Flujo Actual (Problemático)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FLUJO ACTUAL                                                            │
├─────────────────────────────────────────────────────────────────────────┤
│  1. cargo build --release                                                │
│     └── Genera: target/release/anarch-ai.exe (SIN FIRMAR)               │
│                                                                          │
│  2. CodeSignTool firma anarch-ai.exe                                    │
│     └── Resultado: target/release/anarch-ai.exe (FIRMADO ✓)             │
│                                                                          │
│  3. Actualizar timestamps (intento de prevenir recompilación)           │
│     └── Resultado: timestamps modificados                                │
│                                                                          │
│  4. tauri build --bundles nsis,msi                                      │
│     └── ⚠️ PROBLEMA: Tauri RECOMPILA el binario                         │
│     └── Resultado: target/release/anarch-ai.exe (SIN FIRMAR ✗)          │
│                                                                          │
│  5. Verificación de firma                                                │
│     └── ❌ FALLA: El binario ya no está firmado                         │
│                                                                          │
│  6. Plan B: Re-firmar y re-empaquetar                                   │
│     └── Ciclo problemático y propenso a errores                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Por Qué Falla el Approach Actual

1. **Tauri CLI recompila durante el bundling**: El comando `tauri build --bundles nsis,msi` no es solo un empaquetador; invoca `cargo build` internamente con flags específicos y puede parchear el binario.

2. **Los timestamps no funcionan como se espera**: Cargo utiliza un sistema de hashing de dependencias más sofisticado que simples timestamps. El archivo `.fingerprint` y los archivos `.d` determinan si hay recompilación.

3. **El binario es "parcheado" por Tauri**: Tauri modifica el binario para inyectar configuración, recursos y otros metadatos, lo cual invalida cualquier firma previa.

4. **La verificación siempre fallará**: Como el binario empaquetado nunca pasó por CodeSignTool después del patching de Tauri, la firma será inválida.

---

## 2. Entendiendo el Flujo de Firma de Tauri

### 2.1 Flujo Correcto de Firma en Tauri

Tauri tiene un sistema de firma integrado que funciona así:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FLUJO CORRECTO DE TAURI                                                │
├─────────────────────────────────────────────────────────────────────────┤
│  1. tauri build --bundles nsis,msi                                      │
│     ├── Compila código Rust                                             │
│     ├── Genera binario                                                   │
│     ├── Parchea binario con recursos/config                             │
│     ├── ⭐ FIRMA el binario (si está configurado)                       │
│     ├── Empaqueta en instalador NSIS/MSI                                │
│     ├── ⭐ FIRMA el instalador (si está configurado)                    │
│     └── Genera archivos .sig para updater                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Qué Firma Tauri (con configuración correcta)

| Componente | ¿Firmado? | Notas |
|------------|-----------|-------|
| `app.exe` (binario principal) | ✓ | Firmado DESPUÉS del patching |
| `uninstaller.exe` | ✓ | Desde Tauri 1.4+ |
| Instalador NSIS/MSI | ✓ | Firmado al final del proceso |
| DLLs de plugins NSIS | ✓ | Desde Tauri 2.1+ (PR #11676) |
| WebView2Loader.dll | Depende | Necesita configuración adicional |

---

## 3. Soluciones Propuestas

### 3.1 Solución A: Usar `signCommand` de Tauri (RECOMENDADA)

Esta es la solución más robusta y nativa. Tauri permite configurar un comando personalizado de firma que se ejecuta en el momento correcto del proceso.

#### Configuración en `tauri.conf.json`:

```json
{
  "bundle": {
    "windows": {
      "signCommand": "powershell -ExecutionPolicy Bypass -File ./scripts/sign-with-codesigntool.ps1 \"%1\""
    }
  }
}
```

#### Script `sign-with-codesigntool.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

$ErrorActionPreference = "Stop"

# Variables de entorno (configuradas en GitHub Actions)
$Username = $env:SSL_USERNAME
$Password = $env:SSL_PASSWORD
$CredentialId = $env:CREDENTIAL_ID
$TotpSecret = $env:SSL_TOTP_SECRET
$CodeSignToolPath = $env:CODESIGNTOOL_PATH

if (-not $Username -or -not $Password -or -not $CredentialId -or -not $TotpSecret) {
    Write-Error "Missing required environment variables for code signing"
    exit 1
}

# Crear archivo temporal para TOTP
$totpFile = Join-Path $env:TEMP "totp_$(New-Guid).txt"
try {
    $TotpSecret | Out-File -FilePath $totpFile -NoNewline -Encoding ASCII
    
    # Firmar el archivo
    $arguments = @(
        "sign",
        "-credential_id", $CredentialId,
        "-username", $Username,
        "-password", $Password,
        "-totp_secret", (Get-Content $totpFile -Raw),
        "-input_file_path", $FilePath,
        "-override"  # Sobrescribe el archivo original
    )
    
    Push-Location (Split-Path $CodeSignToolPath -Parent)
    try {
        & cmd.exe /c "`"CodeSignTool.bat`" $($arguments -join ' ')"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "CodeSignTool failed with exit code $LASTEXITCODE"
            exit 1
        }
    } finally {
        Pop-Location
    }
    
    Write-Host "Successfully signed: $FilePath"
} finally {
    if (Test-Path $totpFile) {
        Remove-Item $totpFile -Force -ErrorAction SilentlyContinue
    }
}
```

#### Cambios Necesarios en el Workflow:

```yaml
- name: 🔨 Build and Sign with Tauri (using signCommand)
  shell: pwsh
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
    SSL_USERNAME: ${{ secrets.SSLCOM_USERNAME }}
    SSL_PASSWORD: ${{ secrets.SSLCOM_PASSWORD }}
    CREDENTIAL_ID: ${{ secrets.SSLCOM_CREDENTIAL_ID }}
    SSL_TOTP_SECRET: ${{ secrets.SSLCOM_TOTP_SECRET }}
    CODESIGNTOOL_PATH: ${{ steps.locate-codesigntool.outputs.CODESIGNTOOL_BAT }}
  run: |
    cd src-tauri
    bun x --yes @tauri-apps/cli@latest build --bundles nsis,msi --verbose
    cd ..
```

**Ventajas:**
- Tauri maneja todo el flujo de firma internamente
- Firma en el momento correcto (después del patching, antes del bundling)
- Firma todos los componentes necesarios automáticamente
- No hay riesgo de recompilación que invalide firmas

---

### 3.2 Solución B: Firmar DESPUÉS del Bundling Completo

Si no puedes modificar `tauri.conf.json`, puedes firmar todos los ejecutables después de que Tauri genere los instaladores.

#### Flujo Propuesto:

```yaml
- name: 🔨 Build with Tauri (sin firma)
  run: |
    cd src-tauri
    bun x --yes @tauri-apps/cli@latest build --bundles nsis,msi --verbose

- name: 📦 Extract and Sign All Executables
  shell: pwsh
  env:
    SSL_USERNAME: ${{ secrets.SSLCOM_USERNAME }}
    SSL_PASSWORD: ${{ secrets.SSLCOM_PASSWORD }}
    CREDENTIAL_ID: ${{ secrets.SSLCOM_CREDENTIAL_ID }}
    SSL_TOTP_SECRET: ${{ secrets.SSLCOM_TOTP_SECRET }}
  run: |
    # 1. Encontrar el instalador NSIS
    $nsisInstaller = Get-ChildItem -Path ".\src-tauri\target\release\bundle\nsis" -Filter "*.exe" | 
                     Where-Object { $_.Name -notlike "*.sig" } | 
                     Select-Object -First 1
    
    # 2. Extraer el instalador con 7zip
    $extractDir = ".\extracted-installer"
    & 7z x $nsisInstaller.FullName -o"$extractDir" -y
    
    # 3. Firmar TODOS los .exe y .dll dentro
    $filesToSign = Get-ChildItem -Path $extractDir -Recurse -Include "*.exe", "*.dll"
    
    foreach ($file in $filesToSign) {
        Write-Host "Signing: $($file.Name)"
        # Llamar a CodeSignTool para cada archivo
        & .\sign-file.ps1 -FilePath $file.FullName
    }
    
    # 4. Re-empaquetar el instalador
    # NOTA: Esto es complejo con NSIS y puede no preservar la integridad
    
    # 5. Firmar el instalador final
    & .\sign-file.ps1 -FilePath $nsisInstaller.FullName
```

**⚠️ Problema con esta solución:**
- Extraer y re-empaquetar un instalador NSIS es técnicamente complejo
- El instalador NSIS está comprimido y tiene una estructura específica
- Modificar el contenido después de la creación puede romper el instalador

---

### 3.3 Solución C: Usar el SDK de Windows para Firma Local (Alternativa)

Si tienes problemas con `signCommand` y CodeSignTool, considera usar el SDK de Windows con un certificado importado localmente.

```yaml
- name: 🔐 Import Certificate
  shell: pwsh
  env:
    WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE_BASE64 }}
    WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
  run: |
    $certBytes = [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE)
    $certPath = ".\certificate.pfx"
    [IO.File]::WriteAllBytes($certPath, $certBytes)
    
    Import-PfxCertificate `
      -FilePath $certPath `
      -CertStoreLocation Cert:\CurrentUser\My `
      -Password (ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force)
    
    Remove-Item $certPath -Force

- name: 🔨 Build with Tauri (using native signtool)
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
  run: |
    cd src-tauri
    bun x --yes @tauri-apps/cli@latest build --bundles nsis,msi --verbose
```

**Configuración en `tauri.conf.json`:**

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "TU_THUMBPRINT_AQUI",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

**Nota:** Esta solución NO funciona con certificados EV de SSL.com porque requieren un HSM/token de hardware o el servicio eSigner remoto.

---

## 4. Análisis del Workflow Actual: Errores Específicos

### 4.1 Error en el Step "Build Rust binary (without packaging)"

```yaml
- name: 🔨 Build Rust binary (without packaging)
  run: |
    cd src-tauri
    cargo build --release  # ← Esto compila pero NO parchea
```

**Problema:** El binario generado por `cargo build --release` NO es el mismo que Tauri usará. Tauri parchea el binario con:
- Configuración embebida
- Recursos (iconos, assets)
- Información del bundle

### 4.2 Error en "Prevent recompilation by updating timestamps"

```yaml
- name: 🔒 Prevent recompilation by updating timestamps
  run: |
    $futureTime = (Get-Date).AddMinutes(1)
    (Get-Item $appExe).LastWriteTime = $futureTime
```

**Problema:** Cargo no usa solo timestamps. Usa un sistema de fingerprinting basado en:
- Hash del código fuente
- Hash de dependencias
- Flags de compilación
- Variables de entorno

### 4.3 Error en "Create installers using Tauri CLI"

```yaml
- name: 📦 Create installers using Tauri CLI
  run: |
    bun x --yes @tauri-apps/cli@latest build --bundles nsis,msi --verbose
```

**Problema:** Este comando SIEMPRE recompilará si detecta cualquier cambio, y el patching de Tauri **siempre** invalida firmas previas.

---

## 5. Workflow Corregido Completo

```yaml
name: WindowsBuildAndRelease

on:
  workflow_call:
    inputs:
      release_id:
        required: true
        type: string
      package_version:
        required: true
        type: string
      release_upload_url:
        required: true
        type: string
    outputs:
      windows_x86_64_sig:
        description: "Signature for Windows x86_64 build"
        value: ${{ jobs.windowsBuilding.outputs.windows_x86_64_sig }}
      windows_x86_64_name:
        description: "Name for Windows x86_64 build"
        value: ${{ jobs.windowsBuilding.outputs.windows_x86_64_name }}

jobs:
  windowsBuilding:
    if: github.event.repository.fork == false
    name: BuildWindows
    permissions:
      contents: write
      id-token: write
      security-events: write
      attestations: write
    outputs:
      windows_x86_64_sig: ${{ steps.extract-signatures.outputs.windows_x86_64_sig }}
      windows_x86_64_name: ${{ steps.extract-signatures.outputs.windows_x86_64_name }}
    runs-on: windows-latest

    steps:
      - name: 🔄 Checkout code
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: 🛠️ Setup Node 20
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: 🛠️ Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: 🛠️ Install dependencies
        run: bun install

      - name: 🔧 Install system dependencies
        shell: pwsh
        run: |
          echo "VCPKG_ROOT=$env:VCPKG_INSTALLATION_ROOT" | Out-File -FilePath $env:GITHUB_ENV -Append

      - name: 🦀 Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: 📦 Cache Rust dependencies
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
          cache-on-failure: true
          shared-key: windows-release
          save-if: true

      - name: ☕ Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: 📦 Cache CodeSignTool
        id: cache-codesigntool
        uses: actions/cache@v4
        with:
          path: ${{ github.workspace }}/codesigntool
          key: codesigntool-windows-v1.3.0
          restore-keys: codesigntool-windows-

      - name: 📥 Download CodeSignTool
        if: steps.cache-codesigntool.outputs.cache-hit != 'true'
        shell: pwsh
        run: |
          Invoke-WebRequest -Uri "https://www.ssl.com/download/codesigntool-for-windows/" -OutFile "CodeSignTool.zip"
          Expand-Archive -Path "CodeSignTool.zip" -DestinationPath "$env:GITHUB_WORKSPACE\codesigntool" -Force

      - name: 🔍 Locate CodeSignTool
        id: locate-codesigntool
        shell: pwsh
        run: |
          $batFile = Get-ChildItem -Path "$env:GITHUB_WORKSPACE\codesigntool" -Filter "CodeSignTool*.bat" -Recurse | Select-Object -First 1
          if (-not $batFile) {
            Write-Error "CodeSignTool.bat not found"
            exit 1
          }
          $batDir = Split-Path -Parent $batFile.FullName
          echo "CODESIGNTOOL_DIR=$batDir" >> $env:GITHUB_OUTPUT
          Write-Host "CodeSignTool found at: $batDir"

      - name: 📝 Create signing script
        shell: pwsh
        run: |
          @'
          param([Parameter(Mandatory=$true)][string]$FilePath)
          $ErrorActionPreference = "Stop"
          
          Write-Host "Signing file: $FilePath"
          
          $totpFile = Join-Path $env:TEMP "totp_$(New-Guid).txt"
          try {
              $env:SSL_TOTP_SECRET | Out-File -FilePath $totpFile -NoNewline -Encoding ASCII
              
              $cstDir = $env:CODESIGNTOOL_DIR
              $arguments = @(
                  "sign",
                  "-credential_id", $env:CREDENTIAL_ID,
                  "-username", $env:SSL_USERNAME,
                  "-password", $env:SSL_PASSWORD,
                  "-totp_secret", (Get-Content $totpFile -Raw).Trim(),
                  "-input_file_path", $FilePath,
                  "-override"
              )
              
              Push-Location $cstDir
              try {
                  $output = & cmd.exe /c "CodeSignTool.bat $($arguments -join ' ')" 2>&1
                  Write-Host $output
                  if ($LASTEXITCODE -ne 0) {
                      Write-Error "CodeSignTool failed"
                      exit 1
                  }
              } finally {
                  Pop-Location
              }
              
              Write-Host "Successfully signed: $FilePath"
          } finally {
              if (Test-Path $totpFile) { Remove-Item $totpFile -Force }
          }
          '@ | Out-File -FilePath ".\sign-with-codesigntool.ps1" -Encoding UTF8

      - name: ✏️ Create production environment file
        shell: pwsh
        run: |
          @"
          VITE_PORT=5173
          VITE_NODE_ENV=production
          VITE_DEBUG=false
          VITE_APP_ENV=production
          "@ | Out-File -FilePath .env -Encoding UTF8

      - name: 🔨 Build frontend
        run: bun run build

      - name: 🔨🔐 Build and Sign with Tauri
        shell: pwsh
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
          SSL_USERNAME: ${{ secrets.SSLCOM_USERNAME }}
          SSL_PASSWORD: ${{ secrets.SSLCOM_PASSWORD }}
          CREDENTIAL_ID: ${{ secrets.SSLCOM_CREDENTIAL_ID }}
          SSL_TOTP_SECRET: ${{ secrets.SSLCOM_TOTP_SECRET }}
          CODESIGNTOOL_DIR: ${{ steps.locate-codesigntool.outputs.CODESIGNTOOL_DIR }}
        run: |
          Write-Host "Building and signing with Tauri..."
          cd src-tauri
          bun x --yes @tauri-apps/cli@latest build --bundles nsis,msi --verbose
          cd ..

      - name: ✅ Verify ALL signatures
        shell: pwsh
        run: |
          Write-Host "Verifying all signatures..."
          
          $allFiles = @()
          $allFiles += Get-ChildItem -Path ".\src-tauri\target\release\bundle\msi" -Filter "*.msi" -ErrorAction SilentlyContinue
          $allFiles += Get-ChildItem -Path ".\src-tauri\target\release\bundle\nsis" -Filter "*.exe" -ErrorAction SilentlyContinue
          $allFiles += Get-Item ".\src-tauri\target\release\anarch-ai.exe" -ErrorAction SilentlyContinue
          
          $allValid = $true
          foreach ($file in $allFiles) {
              if ($file.Name -like "*.sig") { continue }
              
              $sig = Get-AuthenticodeSignature -FilePath $file.FullName
              Write-Host "`n📄 $($file.Name): $($sig.Status)"
              
              if ($sig.Status -eq "Valid") {
                  Write-Host "   ✅ Signed by: $($sig.SignerCertificate.Subject)"
              } else {
                  Write-Host "   ❌ NOT VALID: $($sig.StatusMessage)"
                  $allValid = $false
              }
          }
          
          if (-not $allValid) {
              Write-Error "Some files are not properly signed!"
              exit 1
          }
          
          Write-Host "`n✅ All files are properly signed!"

      - name: 📤 Upload artifacts to release
        if: inputs.release_id != ''
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        shell: pwsh
        run: |
          $tag = "anarch-ai-v${{ inputs.package_version }}"
          
          $artifacts = @()
          $artifacts += Get-ChildItem -Path ".\src-tauri\target\release\bundle\msi" -Filter "*.msi" -ErrorAction SilentlyContinue
          $artifacts += Get-ChildItem -Path ".\src-tauri\target\release\bundle\nsis" -Filter "*.exe" -ErrorAction SilentlyContinue
          
          foreach ($artifact in $artifacts) {
              if ($artifact.Name -like "*.sig") { continue }
              
              Write-Host "Uploading: $($artifact.Name)"
              gh release upload $tag $artifact.FullName --repo $env:GITHUB_REPOSITORY --clobber
              
              $sigPath = "$($artifact.FullName).sig"
              if (Test-Path $sigPath) {
                  gh release upload $tag $sigPath --repo $env:GITHUB_REPOSITORY --clobber
              }
          }

      - name: 📝 Extract signatures for outputs
        id: extract-signatures
        shell: pwsh
        run: |
          $artifact = Get-ChildItem -Path ".\src-tauri\target\release\bundle\nsis" -Filter "*.exe" | 
                      Where-Object { $_.Name -notlike "*.sig" } | 
                      Select-Object -First 1
          
          if (-not $artifact) {
              $artifact = Get-ChildItem -Path ".\src-tauri\target\release\bundle\msi" -Filter "*.msi" | 
                          Where-Object { $_.Name -notlike "*.sig" } | 
                          Select-Object -First 1
          }
          
          $sigFile = "$($artifact.FullName).sig"
          $signature = (Get-Content -Raw -Path $sigFile).Trim()
          
          echo "windows_x86_64_sig=$signature" >> $env:GITHUB_OUTPUT
          echo "windows_x86_64_name=$($artifact.Name)" >> $env:GITHUB_OUTPUT

      - name: 📤 Upload workflow artifacts
        uses: actions/upload-artifact@v4
        with:
          name: signed-windows-binaries
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/msi/*.sig
            src-tauri/target/release/bundle/nsis/*.sig
          retention-days: 7
```

---

## 6. Configuración Requerida en `tauri.conf.json`

Para que el workflow funcione correctamente, necesitas configurar `signCommand` en tu archivo `tauri.conf.json`:

```json
{
  "build": {
    "beforeBundleCommand": ""
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "windows": {
      "signCommand": "powershell -ExecutionPolicy Bypass -File ../../sign-with-codesigntool.ps1 \"%1\""
    }
  }
}
```

**Nota sobre `%1`:** El placeholder `%1` es reemplazado automáticamente por Tauri con la ruta del archivo a firmar.

---

## 7. Problemas Conocidos y Soluciones

### 7.1 Error: "Invalid OTP"

**Causa:** El sistema de tiempo del runner no está sincronizado.

**Solución:**
```yaml
- name: Sync system time
  run: w32tm /resync /force
```

### 7.2 Error: CodeSignTool no firma in-place

**Causa:** CodeSignTool por defecto escribe a un directorio de salida.

**Solución:** Usar el flag `-override` (disponible en versiones recientes) o copiar el archivo firmado de vuelta:

```powershell
# Con -override (recomendado)
CodeSignTool.bat sign -override -input_file_path "C:\path\to\file.exe" ...

# Sin -override (alternativa)
CodeSignTool.bat sign -output_dir_path "C:\temp\signed" -input_file_path "C:\path\to\file.exe" ...
Copy-Item "C:\temp\signed\file.exe" "C:\path\to\file.exe" -Force
```

### 7.3 DLLs de NSIS no firmadas

**Causa:** Versión antigua de Tauri.

**Solución:** Actualizar a Tauri 2.1+ que incluye el fix del PR #11676.

### 7.4 Uninstaller no firmado

**Causa:** Versión antigua de Tauri.

**Solución:** Actualizar a Tauri 1.4+ o 2.0+.

---

## 8. Verificación Post-Build

Script para verificar que todos los componentes están firmados:

```powershell
# verify-signatures.ps1
param(
    [string]$InstallerPath
)

Write-Host "=== Verificación de Firmas ===" -ForegroundColor Cyan

# 1. Verificar instalador
$installerSig = Get-AuthenticodeSignature $InstallerPath
Write-Host "`n📦 Instalador: $($installerSig.Status)"

# 2. Extraer y verificar contenidos
$tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; mkdir $_ }
& 7z x $InstallerPath -o"$tempDir" -y | Out-Null

$allFiles = Get-ChildItem -Path $tempDir -Recurse -Include "*.exe", "*.dll"
$results = @()

foreach ($file in $allFiles) {
    $sig = Get-AuthenticodeSignature $file.FullName
    $results += [PSCustomObject]@{
        File = $file.Name
        Status = $sig.Status
        Signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "N/A" }
    }
}

$results | Format-Table -AutoSize

# Cleanup
Remove-Item $tempDir -Recurse -Force

# Resultado final
$unsigned = $results | Where-Object { $_.Status -ne "Valid" }
if ($unsigned) {
    Write-Host "`n❌ ARCHIVOS SIN FIRMAR:" -ForegroundColor Red
    $unsigned | Format-Table
    exit 1
} else {
    Write-Host "`n✅ TODOS LOS ARCHIVOS ESTÁN FIRMADOS" -ForegroundColor Green
}
```

---

## 9. Resumen de Cambios Requeridos

| Componente | Cambio Requerido |
|------------|------------------|
| `tauri.conf.json` | Agregar `signCommand` con script de PowerShell |
| Workflow | Eliminar pasos de firma manual pre-bundling |
| Workflow | Usar Tauri CLI para build + sign en un solo paso |
| CodeSignTool | Asegurar que está disponible en el PATH o usar ruta absoluta |
| Verificación | Agregar step de verificación post-build |
| Tauri | Actualizar a versión 2.1+ para firma de plugins NSIS |

---

## 10. Referencias

- [Tauri Windows Code Signing Documentation](https://v2.tauri.app/distribute/sign/windows/)
- [SSL.com CodeSignTool Guide](https://www.ssl.com/guide/esigner-codesigntool-command-guide/)
- [Tauri PR #11676 - Sign NSIS plugins](https://github.com/tauri-apps/tauri/pull/11676)
- [Tauri Issue #11754 - Custom signCommand](https://github.com/tauri-apps/tauri/issues/11754)
- [NSIS Signing Documentation](https://nsis.sourceforge.io/Signing_an_Uninstaller)