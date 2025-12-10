param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Firmando archivo con SSL.com eSigner" -ForegroundColor Cyan
Write-Host "Archivo: $FilePath" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Variables de entorno (configuradas en GitHub Actions)
$Username = $env:SSL_USERNAME
$Password = $env:SSL_PASSWORD
$CredentialId = $env:CREDENTIAL_ID
$TotpSecret = $env:SSL_TOTP_SECRET
$CodeSignToolDir = $env:CODESIGNTOOL_DIR

if (-not $Username -or -not $Password -or -not $CredentialId -or -not $TotpSecret) {
    Write-Error "Missing required environment variables for code signing"
    Write-Error "Required: SSL_USERNAME, SSL_PASSWORD, CREDENTIAL_ID, SSL_TOTP_SECRET"
    exit 1
}

if (-not $CodeSignToolDir) {
    Write-Error "CODESIGNTOOL_DIR environment variable not set"
    exit 1
}

# Verificar que el archivo existe
if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

# Obtener ruta absoluta del archivo
$FilePath = (Resolve-Path $FilePath).Path
$FileName = Split-Path $FilePath -Leaf

# Crear directorio temporal para output
$tempOutputDir = Join-Path $env:TEMP "codesign_$(New-Guid)"
New-Item -ItemType Directory -Path $tempOutputDir -Force | Out-Null

# Crear archivo temporal para TOTP (seguridad)
$totpFile = Join-Path $env:TEMP "totp_$(New-Guid).txt"

try {
    # Guardar TOTP en archivo temporal
    [System.IO.File]::WriteAllText($totpFile, $TotpSecret.Trim())

    Write-Host "Preparando firma..."
    Write-Host "   Output Dir: $tempOutputDir"

    # Leer TOTP sin newlines
    $totpValue = [System.IO.File]::ReadAllText($totpFile).Trim()

    # Construir comando (sin comillas problemáticas en los valores)
    $signCommand = "sign -credential_id=$CredentialId -username=$Username -password=$Password -totp_secret=$totpValue -input_file_path=`"$FilePath`" -output_dir_path=`"$tempOutputDir`""

    # Cambiar al directorio de CodeSignTool
    Push-Location $CodeSignToolDir
    try {
        Write-Host "Ejecutando CodeSignTool..."

        # Ejecutar CodeSignTool
        $process = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "CodeSignTool.bat $signCommand" `
            -Wait -PassThru -NoNewWindow `
            -RedirectStandardOutput "$env:TEMP\cst_stdout.txt" `
            -RedirectStandardError "$env:TEMP\cst_stderr.txt"

        # Mostrar output
        if (Test-Path "$env:TEMP\cst_stdout.txt") {
            $stdout = Get-Content "$env:TEMP\cst_stdout.txt" -Raw
            if ($stdout) { Write-Host $stdout }
        }
        if (Test-Path "$env:TEMP\cst_stderr.txt") {
            $stderr = Get-Content "$env:TEMP\cst_stderr.txt" -Raw
            if ($stderr) { Write-Host $stderr -ForegroundColor Yellow }
        }

        # Verificar resultado
        if ($process.ExitCode -ne 0) {
            Write-Error "CodeSignTool failed with exit code $($process.ExitCode)"
            exit 1
        }

    } finally {
        Pop-Location
    }


    # Verificar que el archivo firmado existe
    $signedFile = Join-Path $tempOutputDir $FileName
    if (-not (Test-Path $signedFile)) {
        Write-Error "Signed file not found at: $signedFile"
        Write-Host "Contents of temp dir:"
        Get-ChildItem $tempOutputDir | ForEach-Object { Write-Host "  - $($_.Name)" }
        exit 1
    }

    # Copiar archivo firmado de vuelta a la ubicación original
    Write-Host "Copiando archivo firmado a ubicación original..."
    Copy-Item -Path $signedFile -Destination $FilePath -Force

    # Verificar firma
    Write-Host "Verificando firma..."
    $signature = Get-AuthenticodeSignature -FilePath $FilePath

    if ($signature.Status -eq "Valid") {
        Write-Host "Archivo firmado exitosamente" -ForegroundColor Green
        Write-Host "   Firmado por: $($signature.SignerCertificate.Subject)" -ForegroundColor Green
        if ($signature.TimeStamperCertificate) {
            Write-Host "   Timestamp: $($signature.TimeStamperCertificate.Subject)" -ForegroundColor Green
        }
    } else {
        Write-Error "Firma invalida: $($signature.Status)"
        Write-Error "   Mensaje: $($signature.StatusMessage)"
        exit 1
    }

} finally {
    # CRITICO: Limpiar archivos temporales
    if (Test-Path $totpFile) {
        Remove-Item $totpFile -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $tempOutputDir) {
        Remove-Item $tempOutputDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    # Limpiar logs temporales
    Remove-Item "$env:TEMP\cst_stdout.txt" -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\cst_stderr.txt" -Force -ErrorAction SilentlyContinue
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "FIRMA COMPLETADA EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
exit 0
