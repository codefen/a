param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔐 Firmando archivo con SSL.com eSigner" -ForegroundColor Cyan
Write-Host "📄 Archivo: $FilePath" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Variables de entorno (configuradas en GitHub Actions)
$Username = $env:SSL_USERNAME
$Password = $env:SSL_PASSWORD
$CredentialId = $env:CREDENTIAL_ID
$TotpSecret = $env:SSL_TOTP_SECRET
$CodeSignToolDir = $env:CODESIGNTOOL_DIR

if (-not $Username -or -not $Password -or -not $CredentialId -or -not $TotpSecret) {
    Write-Error "❌ Missing required environment variables for code signing"
    Write-Error "   Required: SSL_USERNAME, SSL_PASSWORD, CREDENTIAL_ID, SSL_TOTP_SECRET"
    exit 1
}

if (-not $CodeSignToolDir) {
    Write-Error "❌ CODESIGNTOOL_DIR environment variable not set"
    exit 1
}

# Verificar que el archivo existe
if (-not (Test-Path $FilePath)) {
    Write-Error "❌ File not found: $FilePath"
    exit 1
}

# Crear archivo temporal para TOTP (seguridad)
$totpFile = Join-Path $env:TEMP "totp_$(New-Guid).txt"

try {
    # Guardar TOTP en archivo temporal
    $TotpSecret | Out-File -FilePath $totpFile -NoNewline -Encoding ASCII

    Write-Host "📋 Preparando firma..."
    Write-Host "   Credential ID: $CredentialId"
    Write-Host "   Username: $Username"

    # Argumentos para CodeSignTool
    $arguments = @(
        "sign",
        "-credential_id", "`"$CredentialId`"",
        "-username", "`"$Username`"",
        "-password", "`"$Password`"",
        "-totp_secret", "`"$(Get-Content $totpFile -Raw)`"",
        "-input_file_path", "`"$FilePath`"",
        "-override"  # CRÍTICO: Sobrescribir el archivo original in-place
    )

    # Cambiar al directorio de CodeSignTool
    Push-Location $CodeSignToolDir
    try {
        Write-Host "🔄 Ejecutando CodeSignTool..."

        # Ejecutar CodeSignTool
        $output = & cmd.exe /c "CodeSignTool.bat $($arguments -join ' ')" 2>&1

        # Mostrar output
        Write-Host $output

        # Verificar resultado
        if ($LASTEXITCODE -ne 0) {
            Write-Error "❌ CodeSignTool failed with exit code $LASTEXITCODE"
            exit 1
        }

    } finally {
        Pop-Location
    }

    # Verificar firma
    Write-Host "🔍 Verificando firma..."
    $signature = Get-AuthenticodeSignature -FilePath $FilePath

    if ($signature.Status -eq "Valid") {
        Write-Host "✅ Archivo firmado exitosamente" -ForegroundColor Green
        Write-Host "   Firmado por: $($signature.SignerCertificate.Subject)" -ForegroundColor Green
        if ($signature.TimeStamperCertificate) {
            Write-Host "   Timestamp: $($signature.TimeStamperCertificate.Subject)" -ForegroundColor Green
        }
    } else {
        Write-Error "❌ Firma inválida: $($signature.Status)"
        Write-Error "   Mensaje: $($signature.StatusMessage)"
        exit 1
    }

} finally {
    # CRÍTICO: Limpiar archivo TOTP
    if (Test-Path $totpFile) {
        Remove-Item $totpFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ FIRMA COMPLETADA EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
