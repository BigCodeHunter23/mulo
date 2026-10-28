import type { Metadata } from "next";
import Link from "next/link";
import { List, Section } from "@/components/Legal";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Help",
  description: "How to reach a person at MULO, report something, and look after your account.",
};

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline-offset-4 hover:underline">
    {CONTACT_EMAIL}
  </a>
);

/**
 * Where to get help, for people and for the App Store's support address. The
 * app's Account screen links here, so the address to write to lives in one
 * place (`legal.ts`).
 */
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-10 sm:px-6">
      <h1 className="display text-3xl text-text sm:text-4xl">Help</h1>
      <p className="mt-5 text-base leading-relaxed text-text-secondary">
        Stuck, found something broken, or seen something that shouldn&rsquo;t be here? A person
        reads every message.
      </p>
      <div className="mt-10 flex flex-col gap-9">
        <Section title="Get in touch">
          <p>
            Email {mail}. Say what you were doing and what happened, and if it&rsquo;s about the
            app, which phone you&rsquo;re on. Your username helps too.
          </p>
        </Section>

        <Section title="Something that shouldn't be here">
          <List
            items={[
              <>
                <strong className="text-text">Report it:</strong> there&rsquo;s a Report link on
                every review, take, list and profile (in the app, a profile&rsquo;s is under its
                &ldquo;&#8943;&rdquo; button). A person reads each report, and anything over the
                line is removed.
              </>,
              <>
                <strong className="text-text">Block somebody:</strong> from their profile (in the
                app, under the &ldquo;&#8943;&rdquo; button). Neither of you sees the other any
                more.
              </>,
            ]}
          />
        </Section>

        <Section title="Your account">
          <List
            items={[
              <>
                <strong className="text-text">Forgotten your password?</strong> Use the link under
                the log-in form, and a reset link comes by email.
              </>,
              <>
                <strong className="text-text">Your email, password, data and blocked people</strong>{" "}
                are in the app under You, then the settings button, and on the website in{" "}
                <Link
                  href="/profile/account"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  your account settings
                </Link>
                .
              </>,
              <>
                <strong className="text-text">Deleting your account</strong> is in the same place.
                It removes your profile and everything attached to it, and can&rsquo;t be undone. If
                you joined with Apple and MULO still shows under Settings &rsaquo; Apple Account
                &rsaquo; Sign in with Apple on your iPhone afterwards, you can remove it there.
              </>,
            ]}
          />
        </Section>

        <Section title="The small print">
          <p>
            How MULO looks after your information is in the{" "}
            <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">
              privacy policy
            </Link>
            , and the rules for using it are in the{" "}
            <Link href="/terms" className="text-accent underline-offset-4 hover:underline">
              terms
            </Link>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
