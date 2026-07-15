import Link from "next/link";
import SiteImage from "@/components/SiteImage";

export const metadata = { title: "Training & Coaching" };

const programs = [
  {
    title: "Youth Cricket Academy",
    text: "Structured pathway for ages 8–17: batting, bowling, fielding fundamentals through advanced match craft. Seasonal terms.",
  },
  {
    title: "Adult Skills Clinics",
    text: "Small-group sessions on specific skills — power hitting, swing bowling, finishing, goalkeeping. Drop-in friendly.",
  },
  {
    title: "Team Training Blocks",
    text: "Recurring weekly slots for club and corporate teams, with optional coach and video analysis add-ons.",
  },
  {
    title: "1-on-1 Coaching",
    text: "Private sessions with certified cricket and soccer coaches, tailored to your goals.",
  },
];

export default function TrainingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Training &amp; <span className="gradient-text">Coaching</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Train. Don&apos;t just play. Our indoor facility and coaching programs run
        year-round — rain or shine, summer or winter.
      </p>

      <SiteImage slot="training-hero" label="Indoor training facility" className="mt-8 h-64 w-full" variant="navy" />

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {programs.map((p) => (
          <div key={p.title} className="card-lift rounded-2xl border border-navy/10 p-6">
            <h2 className="display text-xl text-navy">{p.title}</h2>
            <p className="mt-2 text-sm leading-6 text-navy/70">{p.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-8 rounded-md bg-sky/5 px-4 py-3 text-sm text-navy/70 ring-1 ring-sky/15">
        Coaching program registration opens closer to launch. Meanwhile, the
        training facility itself is bookable by the hour.
      </p>

      <div className="mt-6">
        <Link href="/book" className="btn-brand rounded-full px-6 py-3 text-sm uppercase">
          Book the training facility
        </Link>
      </div>
    </div>
  );
}
