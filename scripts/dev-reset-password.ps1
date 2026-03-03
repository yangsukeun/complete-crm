# 개발 서버(localhost:3000)에서 지정 이메일 비밀번호를 dev1234 로 설정
# 사용: .\scripts\dev-reset-password.ps1
# 또는: .\scripts\dev-reset-password.ps1 other@email.com

$email = if ($args[0]) { $args[0] } else { "lookathetop@naver.com" }
$body = @{ email = $email } | ConvertTo-Json
$uri = "http://localhost:3000/api/dev-reset-password"
try {
  $r = Invoke-RestMethod -Uri $uri -Method POST -ContentType "application/json" -Body $body
  Write-Host $r.message -ForegroundColor Green
} catch {
  Write-Host "실패 (서버가 떠 있는지 확인하세요): $_" -ForegroundColor Red
}
