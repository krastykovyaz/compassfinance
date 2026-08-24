import { redirect } from "next/navigation";
import { Compass as CompassIcon } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignInCopy } from "@/components/auth/sign-in-copy";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const safeCallbackUrl =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";

  if (session?.user?.id) {
    redirect(safeCallbackUrl);
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col justify-center gap-8 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-surface">
            <CompassIcon size={28} />
          </div>
          <SignInCopy />
        </div>

        <SignInForm callbackUrl={safeCallbackUrl} />
      </div>
    </AppShell>
  );
}
