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
      intro="MULO is a place to rate music and see what your friends thought, on the website and in the app for iPhone and Android. It makes no money from you and sells nothing about you, so this page is short and says what actually happens."
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
              <strong className="text-text">If you continue with Apple or Google:</strong> what they
              share when you agree — your email address, your name, and from Google a profile
              picture. Apple can give a private relay address instead of your own, which forwards to
              you; MULO only ever sees the relay. For Apple, MULO also keeps the token Apple issues,
              encrypted, so deleting your account can end MULO&rsquo;s link to your Apple Account
              too.
            </>,
            <>
              <strong className="text-text">Your profile:</strong> username, display name, picture
              and bio, if you add them. In the app, a picture comes from your photo library only
              when you choose one, and only that picture leaves your phone.
            </>,
            <>
              <strong className="text-text">What you put in:</strong> scores, reviews, replies,
              lists, your GOAT, Versus picks and takes, who you follow, who you&rsquo;ve blocked,
              and anything you report.
            </>,
            <>
              <strong className="text-text">If you turn on notifications in the app:</strong> the
              address Expo gives your phone so a notification can reach it, whether it&rsquo;s an
              iPhone or Android, which notifications you&rsquo;ve switched off, and a log of what
              was sent for a month, so nothing arrives twice.
            </>,
            <>
              <strong className="text-text">Your time zone and when you were last here</strong>, so
              streaks and reminders run on your own clock and stop if you&rsquo;ve been away a
              while. Nobody else can see either.
            </>,
            <>
              <strong className="text-text">A little technical housekeeping:</strong> your network
              address for a short while, so nobody can hammer the site with thousands of requests,
              and ordinary server logs.
            </>,
            <>
              <strong className="text-text">
                On the website, a cookie that keeps you logged in
              </strong>
              , and a few small notes stored in your own browser — recent searches, which tips
              you&rsquo;ve seen. Those never leave your device and aren&rsquo;t used to follow you
              anywhere.
            </>,
            <>
              <strong className="text-text">
                In the app, the same kind of thing on your phone:
              </strong>{" "}
              what keeps you logged in, held in the phone&rsquo;s secure keychain, and small notes —
              records you&rsquo;ve looked at, recent searches, tips you&rsquo;ve seen, your best
              Guess the score, the badges already celebrated, and when you last looked at your
              notifications. They stay on the phone, and deleting your account clears them.
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
          Your scores, reviews, replies, lists and who you follow are visible to other people on
          MULO — that&rsquo;s the point of it. They are not visible to the open internet:{" "}
          <strong className="text-text">
            somebody without an account can&rsquo;t see what you&rsquo;ve rated, your lists, or what
            anybody is rating right now.
          </strong>{" "}
          All they get of a profile is a name, a picture, what you were raised on and your GOAT, so
          a link you send somebody lands somewhere real.
        </p>
        <p>
          <strong className="text-text">Replies</strong> are seen by people who are signed in, as
          reviews are. You can delete your own replies, and the writer of a review can delete any
          reply on it.
        </p>
        <p>
          <strong className="text-text">Your email address is never shown to anybody</strong>,
          signed in or not. If you&rsquo;d rather somebody couldn&rsquo;t see you at all, blocking
          them hides each of you from the other.
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
            <>
              <strong className="text-text">Apple and Google</strong>, only if you continue with
              them: they confirm it&rsquo;s you, and know you signed in to MULO.
            </>,
            <>
              <strong className="text-text">Expo</strong> delivers fixes to the app. Your phone asks
              it for them, so it sees the phone&rsquo;s network address and the app&rsquo;s version,
              never your account.
            </>,
            <>
              <strong className="text-text">Expo, then Apple or Google</strong> carry notifications,
              if you turn them on: they get your phone&rsquo;s notification address and the words of
              each one (a name, a record&rsquo;s title), to show it on your phone.
            </>,
          ]}
        />
        <p>
          Those companies store data on servers that may be outside Australia. Album and artist
          information comes from MusicBrainz and Wikipedia, and song previews from Apple —
          they&rsquo;re asked about records, never about you. In the app, a preview is fetched from
          Apple by your phone itself, so Apple sees your phone&rsquo;s network address and the song,
          but not who you are on MULO.
        </p>
      </Section>

      <Section title="Taking it with you, or taking it back">
        <p>
          Two buttons, both on your account page (in the app, under You and then the settings
          button), both doing exactly what they say:
        </p>
        <List
          items={[
            <>
              <strong className="text-text">Download my data</strong> hands you a file with
              everything you&rsquo;ve put in — every score, review, reply, list and follow — and
              your notification settings.
            </>,
            <>
              <strong className="text-text">Deleting your account</strong> removes your profile and
              everything attached to it. It isn&rsquo;t hidden or deactivated; it&rsquo;s gone, and
              it can&rsquo;t be undone. If you joined with Apple, it also asks Apple to end
              MULO&rsquo;s link to your Apple Account, and says so if you need to remove it
              yourself.
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
