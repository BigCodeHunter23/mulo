import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, List, Section } from "@/components/Legal";
import { CONTACT_EMAIL, JURISDICTION, MINIMUM_AGE, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What MULO keeps, who else sees it, and how to take it back.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="MULO is a place to rate music and see what your friends thought. It makes no money from you and sells nothing about you, so this page is short and says what actually happens."
    >
      <Section title="Who runs MULO">
        <p>
          MULO is run by {OPERATOR} from {JURISDICTION}. Anything on this page, or anything
          you&rsquo;d like done with your information, reaches a person at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-accent underline-offset-4 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="What MULO keeps">
        <List
          items={[
            <>
              <strong className="text-text">Your account:</strong> the email address you signed up
              with, and a password you never give us in readable form — it&rsquo;s hashed by
              Supabase, who handle logins, and we never see it.
            </>,
            <>
              <strong className="text-text">Your profile:</strong> username, display name, picture
              and bio, if you add them.
            </>,
            <>
              <strong className="text-text">What you put in:</strong> scores, reviews, lists, your
              GOAT, Versus picks and takes, who you follow, who you&rsquo;ve blocked, and anything
              you report.
            </>,
            <>
              <strong className="text-text">A little technical housekeeping:</strong> your network
              address for a short while, so nobody can hammer the site with thousands of requests,
              and ordinary server logs.
            </>,
            <>
              <strong className="text-text">A cookie that keeps you logged in</strong>, and a few
              small notes stored in your own browser — recent searches, which tips you&rsquo;ve
              seen. Those never leave your device and aren&rsquo;t used to follow you anywhere.
            </>,
          ]}
        />
      </Section>

      <Section title="What MULO doesn't do">
        <p>
          No advertising. No selling or renting your information to anybody. No third-party trackers
          following you around other websites. If MULO ever measures how the site is used,
          it&rsquo;s counting visits in aggregate, not building a profile of you.
        </p>
      </Section>

      <Section title="What other people can see">
        <p>
          Your profile, your scores, your reviews, your lists and who you follow are public on MULO
          — that&rsquo;s the point of it.{" "}
          <strong className="text-text">Your email address is never shown to anybody.</strong> If
          you&rsquo;d rather somebody couldn&rsquo;t see you at all, blocking them hides each of you
          from the other.
        </p>
      </Section>

      <Section title="Who else holds it">
        <p>
          MULO is a small site built on a few services, and your information passes through them:
        </p>
        <List
          items={[
            <>
              <strong className="text-text">Supabase</strong> stores the database, handles logins
              and keeps uploaded pictures.
            </>,
            <>
              <strong className="text-text">Vercel</strong> runs the site itself.
            </>,
            <>
              <strong className="text-text">Resend</strong> sends the few emails MULO sends:
              confirming your address, and resetting a password.
            </>,
          ]}
        />
        <p>
          Those companies store data on servers that may be outside Australia. Album information
          comes from MusicBrainz and song previews from Apple — they&rsquo;re asked about records,
          never about you.
        </p>
      </Section>

      <Section title="Taking it with you, or taking it back">
        <p>Two buttons, both on your account page, both doing exactly what they say:</p>
        <List
          items={[
            <>
              <strong className="text-text">Download my data</strong> hands you a file with
              everything you&rsquo;ve put in — every score, review, list and follow.
            </>,
            <>
              <strong className="text-text">Delete my account</strong> removes your profile and
              everything attached to it. It isn&rsquo;t hidden or deactivated; it&rsquo;s gone, and
              it can&rsquo;t be undone.
            </>,
          ]}
        />
        <p>
          Both live at{" "}
          <Link href="/profile/account" className="text-accent underline-offset-4 hover:underline">
            your account settings
          </Link>
          . Copies can linger in backups for a short while before they roll over, and emails already
          sent can&rsquo;t be unsent. Anything else — a correction, a question, a complaint — email{" "}
          {CONTACT_EMAIL} and you&rsquo;ll get a person.
        </p>
      </Section>

      <Section title="How long it's kept">
        <p>
          For as long as you have an account. Delete it and the lot goes with it. Technical logs are
          kept briefly and then discarded.
        </p>
      </Section>

      <Section title="Age">
        <p>
          You need to be at least {MINIMUM_AGE} to have an account. If you believe somebody younger
          has one, email {CONTACT_EMAIL} and it will be removed.
        </p>
      </Section>

      <Section title="If something goes wrong">
        <p>
          MULO is built carefully — logins are enforced on the server, everything you send is
          checked, and the database is locked down so one account can&rsquo;t read another&rsquo;s
          private details. No site can promise perfection. If information is ever exposed in a way
          that could harm you, you&rsquo;ll be told, and so will the regulator where the law
          requires it.
        </p>
      </Section>

      <Section title="Changes, and the law">
        <p>
          If this page changes in a way that matters, the date at the top changes and you&rsquo;ll
          be told in the app. MULO follows Australian privacy law, and if you&rsquo;re in the UK or
          Europe, the rights you have there — to see, correct, export or erase what&rsquo;s held
          about you — are rights this page already gives everybody.
        </p>
      </Section>
    </LegalPage>
  );
}
