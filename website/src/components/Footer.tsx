import Link from "next/link";
import { config } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import InfinityMark from "@/components/InfinityMark";

function telHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

export default async function Footer() {
  const settings = await getSettings();
  const email = settings["contact.email"];
  const phone = settings["contact.phone"];
  const address = settings["contact.address"];

  return (
    <footer className="bg-navy-ink text-white">
      <div className="h-1 gradient-brand" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2">
            <InfinityMark className="h-8 w-auto" />
            <span className="display text-lg">Infinity Sports Park</span>
          </div>
          <p className="mt-3 text-sm text-white/70">{config.tagline}.</p>
          <p className="mt-2 text-xs text-white/50">
            Affiliated with Argyle Cricket Club — &ldquo;Cricket is our first love.&rdquo;
          </p>
          <div className="mt-4 space-y-1 text-sm text-white/80">
            {phone && (
              <p>
                <a href={telHref(phone)} className="hover:text-pitch">{phone}</a>
              </p>
            )}
            {email && (
              <p>
                <a href={`mailto:${email}`} className="hover:text-pitch">{email}</a>
              </p>
            )}
            {address && <p className="text-xs text-white/50">{address}</p>}
          </div>
        </div>

        <div>
          <h3 className="display text-base text-pitch">Play</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li><Link href="/book" className="hover:text-pitch">Book a Field</Link></li>
            <li><Link href="/cricket" className="hover:text-pitch">Cricket</Link></li>
            <li><Link href="/soccer" className="hover:text-pitch">Soccer</Link></li>
            <li><Link href="/training" className="hover:text-pitch">Training</Link></li>
            <li><Link href="/tournaments" className="hover:text-pitch">Tournaments &amp; Events</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="display text-base text-pitch">Park</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li><Link href="/facilities" className="hover:text-pitch">Facilities</Link></li>
            <li><Link href="/pricing" className="hover:text-pitch">Membership &amp; Pricing</Link></li>
            <li><Link href="/gallery" className="hover:text-pitch">Gallery</Link></li>
            <li><Link href="/about" className="hover:text-pitch">About Us</Link></li>
            <li><Link href="/faq" className="hover:text-pitch">FAQ</Link></li>
            <li><Link href="/contact" className="hover:text-pitch">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="display text-base text-pitch">Legal</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li><Link href="/legal/terms" className="hover:text-pitch">Terms of Service</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-pitch">Privacy Policy</Link></li>
            <li><Link href="/legal/refunds" className="hover:text-pitch">Cancellation &amp; Refunds</Link></li>
            <li><Link href="/legal/waiver" className="hover:text-pitch">Waiver &amp; Liability</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Infinity Sports Park · Play • Train • Compete • Inspire
      </div>
    </footer>
  );
}
