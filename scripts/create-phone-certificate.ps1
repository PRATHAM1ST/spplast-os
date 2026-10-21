param([Parameter(Mandatory=$true)][string]$OutputDirectory, [Parameter(Mandatory=$true)][string]$Addresses)
$ErrorActionPreference = 'Stop'
$certificateDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
$passwordBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($passwordBytes)
$rng.Dispose()
$certificatePassword = [Convert]::ToBase64String($passwordBytes)
$securePassword = ConvertTo-SecureString -String $certificatePassword -Force -AsPlainText
$root = $null
$leaf = $null
try {
  $root = New-SelfSignedCertificate -Type Custom -Subject 'CN=SP Plast Local Development CA' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage CertSign,CRLSign,DigitalSignature -TextExtension @('2.5.29.19={critical}{text}ca=1&pathlength=0') -NotAfter (Get-Date).AddMonths(3)
  $san = '2.5.29.17={text}DNS=localhost&IPAddress=127.0.0.1'
  foreach ($address in ($Addresses -split ',')) {
    $parsed = [Net.IPAddress]::Parse($address)
    $san += '&IPAddress=' + $parsed.ToString()
  }
  $leaf = New-SelfSignedCertificate -Type Custom -Subject 'CN=SP Plast Local Phone Preview' -Signer $root -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($san,'2.5.29.19={critical}{text}ca=0','2.5.29.37={text}1.3.6.1.5.5.7.3.1') -NotAfter (Get-Date).AddMonths(2)
  Export-PfxCertificate -Cert $leaf -FilePath (Join-Path $certificateDirectory 'phone.pfx') -Password $securePassword -ChainOption BuildChain | Out-Null
  Export-Certificate -Cert $root -FilePath (Join-Path $certificateDirectory 'development-ca.cer') | Out-Null
  [IO.File]::WriteAllText((Join-Path $certificateDirectory 'password'), $certificatePassword)
  [IO.File]::WriteAllText((Join-Path $certificateDirectory 'addresses'), $Addresses)
  Write-Output 'Development certificate generated. No system trust settings changed.'
} finally {
  if ($leaf) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $leaf.Thumbprint) -DeleteKey }
  if ($root) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $root.Thumbprint) -DeleteKey }
}
