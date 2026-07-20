import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface InvoiceLine {
  date: string;
  startHour: number;
  endHour: number;
  totalCents: number;
  resourceName: string;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** A simple per-user, date-range invoice PDF built from confirmed bookings. */
export async function buildInvoicePdf(input: {
  siteName: string;
  user: { name: string; email: string };
  from: string;
  to: string;
  issuedOn: string;
  lines: InvoiceLine[];
  contactEmail: string;
  zelleEmail: string;
  zelleName: string;
}): Promise<Uint8Array> {
  const { siteName, user, from, to, issuedOn, lines, contactEmail, zelleEmail, zelleName } = input;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.06, 0.11, 0.2);
  const gray = rgb(0.4, 0.44, 0.5);

  const W = 612, H = 792, M = 54;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, size: number, f: PDFFont, color = navy) =>
    page.drawText(s, { x, y, size, font: f, color });

  // Header
  text(siteName, M, 18, bold);
  page.drawText("INVOICE", { x: W - M - bold.widthOfTextAtSize("INVOICE", 20), y, size: 20, font: bold, color: navy });
  y -= 22;
  text("Play • Train • Compete • Inspire", M, 9, font, gray);
  y -= 26;

  // Bill-to + meta
  text("Billed to", M, 9, bold, gray);
  page.drawText(`Issued: ${issuedOn}`, { x: W - M - font.widthOfTextAtSize(`Issued: ${issuedOn}`, 10), y, size: 10, font, color: navy });
  y -= 14;
  text(user.name, M, 12, bold);
  const period = `Period: ${from} to ${to}`;
  page.drawText(period, { x: W - M - font.widthOfTextAtSize(period, 10), y, size: 10, font, color: navy });
  y -= 14;
  text(user.email, M, 10, font, gray);
  y -= 28;

  // Table header
  const cDate = M, cFac = M + 90, cTime = M + 300, cAmt = W - M;
  page.drawRectangle({ x: M - 6, y: y - 4, width: W - 2 * M + 12, height: 20, color: rgb(0.95, 0.96, 0.98) });
  text("Date", cDate, 9, bold, gray);
  text("Facility", cFac, 9, bold, gray);
  text("Time", cTime, 9, bold, gray);
  page.drawText("Amount", { x: cAmt - bold.widthOfTextAtSize("Amount", 9), y, size: 9, font: bold, color: gray });
  y -= 22;

  let total = 0;
  for (const l of lines) {
    if (y < M + 80) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    total += l.totalCents;
    text(l.date, cDate, 10, font);
    text(l.resourceName.slice(0, 34), cFac, 10, font);
    text(`${l.startHour}:00–${l.endHour}:00`, cTime, 10, font);
    const amt = money(l.totalCents);
    page.drawText(amt, { x: cAmt - font.widthOfTextAtSize(amt, 10), y, size: 10, font, color: navy });
    y -= 16;
  }
  if (lines.length === 0) {
    text("No confirmed bookings in this period.", cDate, 10, font, gray);
    y -= 16;
  }

  // Total
  y -= 8;
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.7, color: rgb(0.8, 0.82, 0.86) });
  y -= 10;
  text("Total", M, 12, bold);
  const totalStr = money(total);
  page.drawText(totalStr, { x: cAmt - bold.widthOfTextAtSize(totalStr, 12), y, size: 12, font: bold, color: navy });
  y -= 34;

  // Payment note
  text("Payment", M, 9, bold, gray);
  y -= 14;
  for (const line of [
    `Pay by Zelle to ${zelleEmail} (${zelleName}).`,
    `Questions? ${contactEmail}`,
  ]) {
    text(line, M, 10, font);
    y -= 14;
  }

  return pdf.save();
}
