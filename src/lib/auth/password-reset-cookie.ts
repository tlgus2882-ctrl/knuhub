// Set by /auth/confirm when someone arrives from a password reset email, and
// required by the reset form, so a merely signed-in session can't change the
// password without the current one.
export const PASSWORD_RESET_COOKIE = "knuhub_password_reset";
export const PASSWORD_RESET_WINDOW_SECONDS = 15 * 60;
