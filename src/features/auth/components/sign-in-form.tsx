"use client";

import { useActionState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signIn, type SignInState } from "../actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const invalid = Boolean(state.error);

  return (
    <form action={action} className="flex max-w-[360px] flex-col gap-[22px]" noValidate>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state.email ?? ""}
          invalid={invalid}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={state.error}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={invalid}
          className="tracking-[0.2em]"
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"} <ArrowRight size={14} />
        </Button>
      </div>
    </form>
  );
}
