import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { fillInitialMarkers, parseStoredInitials } from "@/lib/waiverMarkers";

export interface WaiverDoc {
  version: number;
  title: string;
  body: string;
}
export interface WaiverSig {
  id: string;
  signedName: string;
  participantName: string;
  minorDob: string | null;
  guardianRelation: string | null;
  ipAddress: string;
  userAgent: string | null;
  consentEsign: boolean;
  signedAt: Date;
}

/** WinAnsi-safe text (Helvetica can't encode arbitrary unicode / emoji). */
function safe(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");
}

function fmtTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - 2 * MARGIN;

/** Render the completed, signed waiver to PDF bytes. */
export async function buildSignedWaiverPdf(input: {
  document: WaiverDoc;
  signature: WaiverSig;
  userEmail: string;
  initials?: string[];
}): Promise<Uint8Array> {
  const { document, signature, userEmail } = input;
  const initials = input.initials ?? [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Italic serif stands in for a handwritten signature (no external font needed).
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const draft = !config.legalReviewed;

  const navy = rgb(0.06, 0.11, 0.2);
  const gray = rgb(0.36, 0.4, 0.47);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const watermark = (p: PDFPage) => {
    if (!draft) return;
    p.drawText("DRAFT", {
      x: 110, y: 330, size: 130, font: bold,
      color: rgb(0.92, 0.92, 0.92), rotate: degrees(45),
    });
  };
  watermark(page);

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    watermark(page);
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN) newPage();
  };

  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const words = safe(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (cur && f.widthOfTextAtSize(test, size) > CONTENT_W) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const write = (
    text: string,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gapAfter?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    const color = opts.color ?? navy;
    const lineH = size + 4;
    for (const ln of wrap(text, f, size)) {
      ensure(lineH);
      page.drawText(ln, { x: MARGIN, y, size, font: f, color });
      y -= lineH;
    }
    if (opts.gapAfter) y -= opts.gapAfter;
  };

  const rule = () => {
    ensure(12);
    page.drawLine({
      start: { x: MARGIN, y: y - 2 },
      end: { x: PAGE_W - MARGIN, y: y - 2 },
      thickness: 0.5,
      color: rgb(0.8, 0.82, 0.86),
    });
    y -= 12;
  };

  // Header
  write(config.siteName, { size: 16, f: bold });
  write(`Liability Waiver & Release  ·  Version ${document.version}`, { size: 11, color: gray, gapAfter: 6 });
  rule();

  // Document body (exact signed text) with the signer's initials rendered
  // inline at each [[initial]] marker, paragraph-aware.
  write(document.title, { size: 12, f: bold, gapAfter: 4 });
  const filledBody = fillInitialMarkers(document.body, initials);
  for (const raw of filledBody.split("\n")) {
    if (raw.trim() === "") {
      ensure(6);
      y -= 6;
    } else {
      write(raw, { size: 10 });
    }
  }

  // Signature block — typed name rendered as a handwriting-style signature.
  y -= 10;
  rule();
  write("SIGNATURE", { size: 12, f: bold, gapAfter: 6 });
  ensure(40);
  page.drawText(safe(signature.signedName) || "(unsigned)", {
    x: MARGIN + 6, y: y - 20, size: 24, font: script, color: navy,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 26 }, end: { x: MARGIN + 300, y: y - 26 },
    thickness: 0.6, color: rgb(0.6, 0.63, 0.68),
  });
  y -= 40;
  write("Typed electronic signature", { size: 8, color: gray, gapAfter: 6 });
  write(`Signed name: ${signature.signedName}`, { size: 10 });
  if (initials.length) {
    write(`Initials provided (${initials.length}): ${initials.join(", ")}`, { size: 10 });
  }
  write(`Participant: ${signature.participantName}`, { size: 10 });
  if (signature.guardianRelation || (signature.participantName !== signature.signedName)) {
    if (signature.minorDob) write(`Minor's date of birth: ${signature.minorDob}`, { size: 10 });
    write(`Signed by parent/guardian (${signature.guardianRelation ?? "Parent/Guardian"}): ${signature.signedName}`, { size: 10 });
  }
  write(`Account: ${userEmail}`, { size: 10 });

  // Audit certificate
  y -= 12;
  rule();
  write("AUDIT CERTIFICATE", { size: 12, f: bold, gapAfter: 4 });
  write(`Record ID: ${signature.id}`, { size: 9, color: gray });
  write(`Document version: v${document.version}`, { size: 9, color: gray });
  write(`Signed (US Central): ${fmtTimestamp(signature.signedAt)}`, { size: 9, color: gray });
  write(`IP address: ${signature.ipAddress}`, { size: 9, color: gray });
  write(`Device: ${signature.userAgent ?? "unknown"}`, { size: 9, color: gray });
  write(`Electronic-signature consent (ESIGN/UETA): ${signature.consentEsign ? "Yes" : "No"}`, { size: 9, color: gray });
  if (draft) {
    y -= 4;
    write("DRAFT — this waiver text has not yet been attorney-reviewed.", { size: 9, color: rgb(0.7, 0.4, 0.05) });
  }

  return pdf.save();
}

export type SignatureWithRefs = Awaited<ReturnType<typeof loadSignatureForPdf>>;

/** Load a signature with its document + user, authorizing owner OR staff. */
export async function loadSignatureForPdf(
  signatureId: string,
  requester: { id: string; role?: string | null }
) {
  const signature = await prisma.waiverSignature.findUnique({
    where: { id: signatureId },
    include: { document: true, user: true },
  });
  if (!signature) return null;
  const isStaff = requester.role === "STAFF" || requester.role === "ADMIN";
  if (signature.userId !== requester.id && !isStaff) return null;
  return signature;
}

/** Return the sealed PDF bytes: the stored copy, or a freshly rendered one
 *  (fallback for legacy signatures that predate sealing). */
export async function getSealedPdfBytes(signature: NonNullable<SignatureWithRefs>): Promise<Uint8Array> {
  const stored = await prisma.waiverPdf.findUnique({ where: { signatureId: signature.id } });
  if (stored) return new Uint8Array(stored.data);
  return buildSignedWaiverPdf({
    document: signature.document,
    signature,
    userEmail: signature.user.email,
    initials: parseStoredInitials((signature as { initials?: string | null }).initials),
  });
}

export function pdfFileName(signature: { version: number; participantName: string }): string {
  const slug = signature.participantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "participant";
  return `waiver-v${signature.version}-${slug}.pdf`;
}
