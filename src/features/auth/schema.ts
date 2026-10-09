import { z } from "zod";

/** Mirrors `minimum_password_length` in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 12;

export const signInSchema = z.object({
  // Trim and lowercase first; z.email() validates the raw string otherwise.
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
});

export type SignInInput = z.infer<typeof signInSchema>;
