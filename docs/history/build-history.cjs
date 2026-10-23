// Builds docs/history/Tarantal-Development-History.docx from history-data.cjs and img/*.jpg.
// Usage (the `docx` package is installed globally in the Claude Code sandbox):
//   NODE_PATH=$(npm root -g) node docs/history/build-history.cjs
// Not part of the game build; ESLint and Prettier skip docs/history/.
const fs = require('node:fs');
const path = require('node:path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const data = require('./history-data.cjs');

const DIR = __dirname;
const OUT = path.join(DIR, 'Tarantal-Development-History.docx');

// A4, 2 cm margins: 11906 × 16838 DXA, content width 11906 − 2 × 1134 = 9638 DXA (≈ 642 px).
const PAGE = { width: 11906, height: 16838, margin: 1134 };
const CONTENT_DXA = PAGE.width - 2 * PAGE.margin;
const CONTENT_PX = Math.floor((CONTENT_DXA / 1440) * 96);

const C = {
  ink: '2B2B2B',
  slate: '2E2F45', // guineafowl plumage
  ochre: 'B7791F',
  grey: '6B6B6B',
  sand: 'F3ECDD',
  sandDark: 'E6D9BC',
  rule: 'D8CBB0',
};
const FONT = 'Calibri';

// --- helpers ---------------------------------------------------------------------------------

/** Width and height of a JPEG from its SOF marker. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

const missing = [];

/** Image paragraph + caption, or nothing if the file is absent. */
function figure(img, caption, maxWidth = CONTENT_PX) {
  const file = path.join(DIR, 'img', `${img}.jpg`);
  if (!fs.existsSync(file)) {
    missing.push(img);
    return [];
  }
  const buf = fs.readFileSync(file);
  const size = jpegSize(buf);
  if (!size) throw new Error(`not a JPEG: ${file}`);
  const width = Math.min(maxWidth, size.w);
  const height = Math.round((size.h * width) / size.w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      keepNext: true,
      children: [new ImageRun({ type: 'jpg', data: buf, transformation: { width, height } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: caption, italics: true, size: 18, color: C.grey })],
    }),
  ];
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    ...opts,
    children: [new TextRun({ text, ...(opts.run ?? {}) })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60, line: 264 },
    children: [new TextRun(text)],
  });
}

function label(text) {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    keepNext: true,
    children: [new TextRun({ text, bold: true, color: C.ochre, size: 20 })],
  });
}

/** A shaded quote-like block: what the product owner asked for. */
function feedbackBlock(lines) {
  return lines.map(
    (t, i) =>
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: C.sand, color: 'auto' },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.ochre, space: 8 } },
        indent: { left: 240, right: 120 },
        spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 160 : 0, line: 264 },
        children: [new TextRun({ text: t, size: 20 })],
      }),
  );
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: C.rule };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

/** Table with a header row; widths are fractions of the content width. */
function table(headers, rows, fractions) {
  const widths = fractions.map((f) => Math.floor(CONTENT_DXA * f));
  widths[widths.length - 1] = CONTENT_DXA - widths.slice(0, -1).reduce((a, b) => a + b, 0);
  const cell = (text, i, header) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders,
      shading: header ? { type: ShadingType.CLEAR, fill: C.sandDark, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          spacing: { line: 252 },
          children: [new TextRun({ text, bold: header, size: header ? 19 : 19 })],
        }),
      ],
    });
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) })),
    ],
  });
}

function h1(text, pageBreak = true) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: pageBreak, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(text)] });
}
const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// --- content ---------------------------------------------------------------------------------

const { meta } = data;

const titlePage = [
  new Paragraph({ spacing: { before: 1800 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: meta.title, bold: true, size: 72, color: C.slate, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: meta.subtitle, size: 40, color: C.ochre })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 480 },
    children: [new TextRun({ text: meta.tagline, size: 24, italics: true, color: C.grey })],
  }),
  ...figure('evo-5-v12', 'The game on 23 October 2026: a Karoo hunt on a weekday map.'),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480 },
    children: [new TextRun({ text: meta.period, size: 24, color: C.ink })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [new TextRun({ text: `Last updated ${meta.updated}`, size: 20, color: C.grey })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [
      new TextRun({
        text: 'A living record: a new chapter is added each time a milestone merges. All times are UTC.',
        size: 18,
        color: C.grey,
      }),
    ],
  }),
];

const contents = [
  new Paragraph({
    pageBreakBefore: true,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: C.slate })],
  }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  para('If the page numbers are missing, right-click the table and choose Update Field.', {
    run: { size: 16, color: C.grey, italics: true },
  }),
];

const glance = [
  h1('At a glance'),
  para(
    'Tarantal Madness is a browser shooting gallery set in Southern Africa, starring the helmeted guineafowl. ' +
      'It plays on desktop and phone browsers, with app-store and Steam versions possible later. Its signature is ' +
      'a guineafowl flock that behaves like the real thing, and a four-season Season Run.',
  ),
  para(
    'The game went from an empty repository to a launch-ready v1.0 in about two and a half days, then ' +
      'through three graphics passes and two feature releases in the next day and a half. Everything below is ' +
      'live on the GitHub Pages test build; nothing has been published to a portal or store yet.',
  ),
  label('By the numbers (23 October 2026)'),
  table(['Measure', 'Count'], data.numbers, [0.38, 0.62]),
  spacer(),
  label('Who builds it'),
  table(['Who', 'What they do'], data.roles, [0.2, 0.8]),
];

const evolution = [
  h1('The look over time'),
  para(
    'The automated visual tests record the same moment of a hunt (same seed, same instant, desktop) after every ' +
      'change to the look. Side by side they show how the game’s appearance developed.',
  ),
  ...data.evolution.flatMap((e) => figure(e.img, e.caption)),
];

const timeline = [
  h1('Timeline'),
  para('Every milestone, in order. Pull request numbers refer to github.com/ShadowNam/Tarantal.'),
  table(
    ['When (UTC)', 'Milestone', 'Pull requests'],
    data.stages.map((s) => [s.when, s.title, s.prs ?? '']),
    [0.28, 0.5, 0.22],
  ),
];

const chapters = [];
for (const s of data.stages) {
  if (s.part) chapters.push(h1(s.part));
  chapters.push(h2(s.title));
  const metaBits = [`When: ${s.when}`, s.prs ? `Pull requests: ${s.prs}` : null, s.decision ? `Decision: ${s.decision}` : null]
    .filter(Boolean)
    .join('   ·   ');
  chapters.push(para(metaBits, { run: { size: 18, color: C.grey }, spacing: { after: 120 } }));
  if (s.intro) chapters.push(para(s.intro));
  if (s.feedback?.length) {
    chapters.push(label('What the product owner asked for'));
    chapters.push(...feedbackBlock(s.feedback));
  }
  if (s.bullets?.length) {
    chapters.push(label(s.part === 'In progress' ? 'Progress' : 'What it added'));
    chapters.push(...s.bullets.map(bullet));
  }
  for (const im of s.images ?? []) chapters.push(...figure(im.img, im.caption, im.width ?? CONTENT_PX));
}

const asks = [
  h1('Your requests and what happened'),
  table(['When', 'What you asked for', 'What happened'], data.requests, [0.16, 0.46, 0.38]),
];

const nextUp = [
  h1('What’s next'),
  para(
    'Approved and queued, in this order. Estimates are Claude’s rough guesses from how long earlier jobs took. ' +
      'The live plan is in the Build Status document.',
  ),
  table(['Item', 'What it brings', 'Built by', 'Estimate'], data.next, [0.2, 0.52, 0.1, 0.18]),
];

const appendix = [
  h1('Appendix A — Decision log'),
  para('Every rule change is recorded in docs/05-DECISIONS-AND-RESEARCH.md. The entries by number:'),
  table(['Entry', 'Topic'], data.decisions, [0.18, 0.82]),
  h1('Appendix B — Glossary'),
  table(['Word', 'Meaning'], data.glossary, [0.3, 0.7]),
];

// --- document --------------------------------------------------------------------------------

const header = new Header({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.rule, space: 4 } },
      children: [new TextRun({ text: 'Tarantal Madness — Development history', size: 16, color: C.grey })],
    }),
  ],
});
const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: C.grey }),
      ],
    }),
  ],
});

const doc = new Document({
  creator: 'Claude (Claude Code) for the Tarantal Madness product owner',
  title: 'Tarantal Madness — Development history',
  description: 'How Tarantal Madness was built, milestone by milestone, with screenshots.',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: C.ink } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 34, bold: true, color: C.slate, font: FONT },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 27, bold: true, color: C.ochre, font: FONT },
        paragraph: {
          spacing: { before: 360, after: 80 },
          outlineLevel: 1,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.rule, space: 2 } },
        },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 400, hanging: 260 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
        },
        titlePage: true,
      },
      headers: { default: header, first: new Header({ children: [] }) },
      footers: { default: footer, first: new Footer({ children: [] }) },
      children: [...titlePage, ...contents, ...glance, ...evolution, ...timeline, ...chapters, ...asks, ...nextUp, ...appendix],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${Math.round(buf.length / 1024)} KB)`);
  if (missing.length) console.warn(`skipped ${missing.length} missing image(s): ${missing.join(', ')}`);
});
