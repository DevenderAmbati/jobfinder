/** Only this account can see / use developer tools. */
export const DEV_TOOLS_EMAIL = 'devenderambati888@gmail.com';

export function canAccessDevTools(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === DEV_TOOLS_EMAIL;
}
