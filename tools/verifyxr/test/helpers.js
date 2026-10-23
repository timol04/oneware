// Builds small .docx files for tests from body XML, so each test states exactly what the document holds.
import JSZip from '../vendor/jszip.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

export const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;

export const para = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
export const heading = (level, text) => para(text, `Heading${level}`);
export const caption = (text) => para(text, 'Caption');
export const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
/** Inline picture; size in cm. */
export const picture = (cm = 6) => `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${Math.round(cm * 360000)}" cy="${Math.round(cm * 360000)}"/><a:graphic><a:graphicData><pic:pic/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
export const table = (cell = 'Zelle') => `<w:tbl><w:tr><w:tc>${para(cell)}</w:tc></w:tr></w:tbl>`;
/** Footer part with a PAGE field. */
export const pageFooter = `<w:ftr ${NS}><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
export const textFooter = `<w:ftr ${NS}><w:p><w:r><w:t>Entwurf</w:t></w:r></w:p></w:ftr>`;

export const sect = (extra = '') => `<w:sectPr>${extra}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:bottom="1417" w:left="1417" w:right="1417"/></w:sectPr>`;
export const footerRef = (rid) => `<w:footerReference w:type="default" r:id="${rid}"/>`;

/**
 * @param body    XML of the elements inside w:body (a final sectPr is added unless the body ends with one)
 * @param parts   { 'word/footer1.xml': xml } extra parts; rels: { rId1: 'footer1.xml' }
 * @param rels    relationship id -> target
 */
export async function buildDocx({ body, parts = {}, rels = {}, styles = STYLES, pages } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  const relXml = Object.entries(rels).map(([id, target]) => `<Relationship Id="${id}" Type="x" Target="${target}"/>`).join('');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relXml}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${body.trimEnd().endsWith('</w:sectPr>') ? '' : sect()}</w:body></w:document>`);
  zip.file('word/styles.xml', styles);
  for (const [path, xml] of Object.entries(parts)) zip.file(path, xml);
  if (pages) zip.file('docProps/app.xml', `<Properties><Pages>${pages}</Pages></Properties>`);
  return zip.generateAsync({ type: 'uint8array' });
}
