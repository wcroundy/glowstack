import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];

function extOf(filename = '') {
  const match = /\.[a-z0-9]+$/i.exec(filename);
  return match ? match[0].toLowerCase() : '';
}

// Pull plain text out of a raw uploaded file. Supports the formats a non-technical
// user actually has lying around: plain text/markdown, PDF, and Word .docx.
export async function extractText(buffer, mimetype = '', filename = '') {
  const ext = extOf(filename);

  if (TEXT_EXTENSIONS.includes(ext) || mimetype.startsWith('text/')) {
    return buffer.toString('utf8');
  }

  if (ext === '.pdf' || mimetype === 'application/pdf') {
    const { text } = await pdfParse(buffer);
    if (!text?.trim()) throw new Error('Could not read any text from that PDF — it may be a scanned image without a text layer.');
    return text;
  }

  if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value?.trim()) throw new Error('Could not read any text from that document.');
    return value;
  }

  if (ext === '.doc' || mimetype === 'application/msword') {
    throw new Error('Older .doc files are not supported — save it as .docx, .pdf, or .txt and try again.');
  }

  throw new Error('Unsupported file type. Upload a .txt, .md, .pdf, or .docx file.');
}
