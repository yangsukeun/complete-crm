/** 비밀번호 변경(관리자 재설정·본인 프로필) 최소 길이. 로그인 비교에는 쓰지 않음. */
export const MIN_PASSWORD_CHANGE_LENGTH = 8;

export const PASSWORD_CHANGE_TOO_SHORT_MESSAGE = "비밀번호는 8자 이상 입력하세요.";

export function isPasswordChangeTooShort(password: string): boolean {
  return password.trim().length < MIN_PASSWORD_CHANGE_LENGTH;
}
