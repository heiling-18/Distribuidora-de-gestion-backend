# Crea (o actualiza) el rol "dyms" y las bases dyms_dev y dyms_test en el PostgreSQL local.
# Toma usuario y clave de DATABASE_URL en .env. Pide la clave del superusuario "postgres".
# No borra nada: si el rol o las bases ya existen, solo actualiza la clave del rol.
$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$envFile = Join-Path $PSScriptRoot '..\.env'

$url = (Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', ''
if (-not $url) { throw 'No encontre DATABASE_URL en .env' }
$uri = [Uri]$url
$rol, $clave = $uri.UserInfo.Split(':', 2)
if ($clave -notmatch '^[A-Za-z0-9_-]+$') { throw 'La clave del rol solo puede tener letras, numeros, - y _' }

$sql = @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$rol') THEN
    CREATE ROLE $rol LOGIN PASSWORD '$clave';
  ELSE
    ALTER ROLE $rol WITH LOGIN PASSWORD '$clave';
  END IF;
END `$`$;
SELECT 'CREATE DATABASE dyms_dev OWNER $rol' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dyms_dev')\gexec
SELECT 'CREATE DATABASE dyms_test OWNER $rol' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dyms_test')\gexec
"@

$tmp = New-TemporaryFile
try {
  [IO.File]::WriteAllText($tmp.FullName, $sql, (New-Object Text.UTF8Encoding $false))
  Write-Host 'Escribe la clave del usuario postgres (la nueva que configuraste):'
  & $psql -U postgres -h localhost -p 5432 -d postgres -v ON_ERROR_STOP=1 -q -f $tmp
  if ($LASTEXITCODE -ne 0) { throw 'psql termino con error' }
  Write-Host "Listo: rol '$rol' y bases dyms_dev, dyms_test creadas."
} finally {
  Remove-Item $tmp -Force
}
