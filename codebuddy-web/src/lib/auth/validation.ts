/*
 * Checks for the sign-in and password forms. The Server Actions run them
 * again, so nothing depends on the browser having checked first.
 */

/** Supabase's own minimum is 6; CodeBuddy asks for a little more. */
export const PASSWORD_MIN_LENGTH = 8;
/** Supabase stores passwords with bcrypt, which only uses the first 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;
const EMAIL_MAX_LENGTH = 254;

export type AuthFieldErrors = Partial<
  Record<"email" | "password" | "confirm" | "understood" | "classCode", string>
>;

/** What a sign-in or password Server Action reports back to its form. */
export interface AuthFormState {
  message?: string;
  /** The message reports success, not a problem. */
  ok?: boolean;
  fieldErrors?: AuthFieldErrors;
  /** Sent back so the email field keeps its value after a failed attempt. */
  email?: string;
  /** The account exists but its email isn't confirmed yet: offer "Send it again". */
  unconfirmed?: boolean;
}

export function validateSignIn(email: string, password: string): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address, like name@example.com.";
  }
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export function validateNewPassword(password: string, confirm: string): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) {
    errors.password = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!errors.password && confirm !== password) errors.confirm = "The two passwords don’t match.";
  return errors;
}

export function validateSignUp(email: string, password: string, confirm: string, classCode: string): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const emailError = validateSignIn(email, "-").email;
  if (emailError) errors.email = emailError;
  Object.assign(errors, validateNewPassword(password, confirm));
  if (!classCode) errors.classCode = "Enter the class code from your teacher.";
  return errors;
}

/** Deleting an account needs the current password and an explicit "I understand". */
export function validateAccountDeletion(password: string, understood: boolean): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!password) errors.password = "Enter your password to confirm it’s you.";
  if (!understood) errors.understood = "Tick the box to confirm you understand.";
  return errors;
}

export function hasFieldErrors(errors: AuthFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
