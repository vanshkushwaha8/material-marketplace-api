const formatStateChange = (fromState, toState) => {
  if (fromState && toState) return `${fromState} -> ${toState}`;
  if (toState) return `-> ${toState}`;
  return '';
};
const toRiskLabel = (isHighStakes) => (isHighStakes ? 'High' : 'Normal');

const EXPORT_COLUMNS = [
  { key: "timestampUTC", label: "Timestamp (UTC)" },
  { key: "actorName", label: "User" },
  { key: "actorRole", label: "Role" },
  { key: "action", label: "Action" },
  { key: "actionLabel", label: "Action Label" },
  { key: "category", label: "Category" },
  { key: "entityType", label: "Entity" },
  { key: "entityId", label: "Entity ID" },
  { key: "stateChange", label: "State Change" },
  { key: "risk", label: "Risk" },
  { key: "ip", label: "IP Address" },
];

const csvEscape = (value) => {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCSV = (rows) => {
  const header = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    EXPORT_COLUMNS.map((c) => csvEscape(row[c.key])).join(",")
  );
  return [header, ...lines].join("\r\n");
};

const PDF_COLUMNS = [
  { key: "timestampUTC", label: "Timestamp (UTC)", width: 105 },
  { key: "actorName", label: "User", width: 80 },
  { key: "actorRole", label: "Role", width: 95 },
  { key: "actionLabel", label: "Action", width: 100 },
  { key: "category", label: "Category", width: 50 },
  { key: "entityType", label: "Entity", width: 70 },
  { key: "entityId", label: "Entity ID", width: 90 },
  { key: "stateChange", label: "State Change", width: 80 },
  { key: "risk", label: "Risk", width: 40 },
  { key: "ip", label: "IP", width: 60 },
];

const toPDF = (rows, meta = {}) => {
  const PDFDocument = require("pdfkit");

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(14).text("Audit Log Export", { align: "left" });
      doc.fontSize(8).fillColor("#555")
        .text(`Generated: ${meta.generatedAt || new Date().toISOString()} UTC`)
        .text(`Records: ${rows.length}${meta.totalCount ? ` of ${meta.totalCount} matching filters` : ""}`);
      if (meta.filters) {
        doc.text(`Filters: ${JSON.stringify(meta.filters)}`);
      }
      doc.moveDown(0.5);
      doc.fillColor("#000");

      const FONT_SIZE = 7;
      const MIN_ROW_HEIGHT = 14;
      const ROW_PADDING = 4;
      const startX = doc.page.margins.left;
      let y = doc.y;

      const newPage = () => {
        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        y = doc.page.margins.top;
      };

      const drawRow = (cells, isHeader = false) => {
        doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SIZE);

        const cellHeights = cells.map((cell, i) =>
          doc.heightOfString(String(cell ?? ""), { width: PDF_COLUMNS[i].width })
        );
        const rowHeight = Math.max(MIN_ROW_HEIGHT, ...cellHeights) + ROW_PADDING;
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          newPage();
          doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SIZE);
        }

        let x = startX;
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? ""), x, y, {
            width: PDF_COLUMNS[i].width,
          });
          x += PDF_COLUMNS[i].width;
        });
        y += rowHeight;
      };

      drawRow(PDF_COLUMNS.map((c) => c.label), true);

      rows.forEach((row) => {
        drawRow(PDF_COLUMNS.map((c) => row[c.key]));
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  EXPORT_COLUMNS,
  csvEscape,
  formatStateChange,
  toRiskLabel,
  toCSV,
  toPDF,
};
