import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, List, Section } from "@/components/Legal";
import { CONTACT_EMAIL, JURISDICTION, MINIMUM_AGE, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The deal: what MULO offers, what's expected of you, and what happens if it stops.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="The deal between you and MULO, in plain words. Using the website or the app means you're happy with what's below."
    >
      <Section title="Who you're dealing with">
        <p>
          MULO is run by {OPERATOR} from {JURISDICTION}. Questions, problems and complaints go to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-accent underline-offset-4 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need to be at least {MINIMUM_AGE} years old, give a real email address (Apple&rsquo;s
          private relay address counts), and keep your password to yourself. What happens on your
          account is treated as you. One person, one account.
        </p>
      </Section>

      <Section title="What you post">
        <p>
          Your scores, reviews, lists and takes stay yours. By putting them on MULO you let MULO
          show them to other people on the site, which is the whole idea. You keep the right to do
          whatever else you like with them, and taking them down takes them down.
        </p>
        <p>Only post things you have the right to post, and leave out:</p>
        <List
          items={[
            "Abuse, harassment, hatred or threats aimed at anybody.",
            "Sexual content, or anything involving children.",
            "Spam, advertising, or scripts hammering the site.",
            "Impersonating somebody else, or pretending to be MULO.",
            "Anything illegal, or anything that breaks somebody else's copyright.",
          ]}
        />
        <p>
          <strong className="text-text">
            MULO has no tolerance for objectionable content or abusive users.
          </strong>{" "}
          Every review, take, list and profile can be reported, on the website and in the app, and
          anybody can be blocked from their profile, which hides each of you from the other. Every
          report is read by a person within 24 hours: anything over the line is removed, and the
          account that posted it can be closed with it.
        </p>
      </Section>

      <Section title="Scores, and what they mean">
        <p>
          A score on MULO is somebody&rsquo;s opinion, nothing more. Where MULO hasn&rsquo;t enough
          scores of its own yet, an album borrows a starting score from MusicBrainz, which fades out
          as real ratings arrive — pages say so where it happens. Album, artist and song information
          comes from MusicBrainz, cover art from the Cover Art Archive, and thirty-second previews
          from Apple. MULO doesn&rsquo;t host music and isn&rsquo;t a way to listen to it.
        </p>
      </Section>

      <Section title="What you can expect of MULO">
        <p>
          It&rsquo;s a small site, run by a small number of people, free to use. It will sometimes
          be down, sometimes be wrong about a record, and sometimes change. Nothing here is promised
          to be perfect or permanent, and MULO is offered as it is.
        </p>
        <p>
          Nothing in these terms takes away rights you have under Australian Consumer Law, which
          can&rsquo;t be signed away. Beyond those rights, MULO isn&rsquo;t liable for losses from
          using it or being unable to.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          You can leave whenever you like from{" "}
          <Link href="/profile/account" className="text-accent underline-offset-4 hover:underline">
            your account settings
          </Link>
          , and take a copy of everything on the way out. MULO can close an account that breaks
          these terms, or that puts the site or other people at risk — if it isn&rsquo;t obvious
          why, ask and you&rsquo;ll be told.
        </p>
      </Section>

      <Section title="Changes, and the law">
        <p>
          These terms can change; the date at the top says when they last did, and anything
          significant will be said in the app. They&rsquo;re governed by the law of {JURISDICTION},
          and its courts are where any dispute would be settled.
        </p>
      </Section>
    </LegalPage>
  );
}
