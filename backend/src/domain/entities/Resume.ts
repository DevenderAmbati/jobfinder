export interface Resume {
  id: string;
  originalPdfPath: string | null;
  extractedText: string;
  markdown: string;
  embedding: string | null;
}
